import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const now = () => new Date().toISOString();
export const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
export async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function digest(file) { return hash(await fs.readFile(file)); }
export function inside(root, file) { const rel = path.relative(root, file); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`)); }
export function safeId(value) { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new Error('Use a task ID with lowercase letters, digits and hyphens, starting with a letter.'); return value; }
// Check existing ancestors as well as lexical containment; reject symlink/junction escapes.
export async function contained(root, relative) {
  const base = await fs.realpath(root);
  const target = path.resolve(base, relative);
  if (!inside(base, target)) throw new Error(`Path outside declared root: ${relative}`);
  let ancestor = target;
  while (!(await exists(ancestor))) ancestor = path.dirname(ancestor);
  if (!inside(base, await fs.realpath(ancestor))) throw new Error(`Symlink/junction escapes declared root: ${relative}`);
  return target;
}
export async function writeJson(file, data) { await atomicWrite(file, `${JSON.stringify(data, null, 2)}\n`); }
export async function atomicWrite(file, data) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data, { flag: 'wx' });
  try { await fs.rename(tmp, file); } catch (e) { await fs.unlink(tmp).catch(() => {}); throw e; }
}
export async function locked(dir, action) {
  const lock = path.join(dir, '.writer-lock');
  try { await fs.mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new Error(`Another writer or interrupted operation holds ${lock}; inspect before removing it.`); throw e; }
  let completed=false,result,original;
  try { result=await action();completed=true; } catch(e) { original=e; }
  try { await fs.rmdir(lock); } catch(cleanupError) {
    const actionStatus=completed?'completed':'failed';
    throw Object.assign(new Error(`Action ${actionStatus}; ${completed?'completed result is retained':formatRuntimeError(original)}. Lock cleanup failed at ${lock}: ${formatRuntimeError(cleanupError)}. Inspect the actual state before retrying; do not automatically remove the lock.`,{cause:completed?cleanupError:original}),{code:'LOCK_CLEANUP_FAILED',lockPath:lock,actionStatus,cleanupError,...(completed?{completedResult:result}:{actionError:original})});
  }
  if(!completed)throw original;
  return result;
}
// Installation writers can share a skill root despite using different host homes.
export async function lockedRoots(roots,action){
  const canonical=new Map();
  for(const root of roots){const real=await fs.realpath(root),key=process.platform==='win32'?real.toLowerCase():real;canonical.set(key,real);}
  const ordered=[...canonical.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,root])=>root);
  const facts=[],acquired=[];let completed=false,result,original;
  try{
    for(const root of ordered){
      const lock=path.join(root,'.writer-lock'),fact={root,lockPath:lock,acquired:false,released:false};facts.push(fact);
      try{await fs.mkdir(lock);}catch(e){fact.acquisitionError=e.message;if(e.code==='EEXIST')throw new Error(`Another writer or interrupted operation holds ${lock}; inspect before removing it.`);throw e;}
      fact.acquired=true;acquired.push(fact);
    }
    result=await action();completed=true;
  }catch(e){original=e;}
  const cleanupErrors=[];
  for(const fact of acquired.reverse())try{await fs.rmdir(fact.lockPath);fact.released=true;}catch(error){fact.cleanupError=error.message;cleanupErrors.push({lockPath:fact.lockPath,error});}
  if(cleanupErrors.length){
    const first=cleanupErrors[0],actionStatus=completed?'completed':'failed';
    throw Object.assign(new Error(`Action ${actionStatus}; ${completed?'completed result is retained':formatRuntimeError(original)}. Lock cleanup failed at ${first.lockPath}: ${formatRuntimeError(first.error)}. Inspect every acquired root before retrying.`,{cause:completed?first.error:original}),
      {code:'LOCK_CLEANUP_FAILED',lockPath:first.lockPath,actionStatus,cleanupError:first.error,cleanupErrors,lockRoots:facts,...(completed?{completedResult:result}:{actionError:original})});
  }
  if(!completed){if(original&&typeof original==='object')original.lockRoots=facts;throw original;}
  return result;
}
// One error outlet for CLI recovery facts; normal success output stays unchanged.
export function formatRuntimeError(error) {
  try {
    const fields=['code','lockPath','lockRoots','actionStatus','completedResult','actionError','cleanupError','cleanupErrors','statePersistenceError','receiptPublished','recovery','runId','reviewDigest','beginCandidate','beginPersisted','processResult','submissionFacts','executionClosed','closureResult','closureError'];
    const details={};for(const key of fields)if(error!=null&&Object.hasOwn(Object(error),key))details[key]=error[key];
    const message=error instanceof Error?error.message:inspect(error,{depth:6,customInspect:false,getters:false});
    const locations=[];for(const value of [error?.completedResult,error?.recovery])if(value)for(const key of ['rollbackManifest','backupPreserved','manifest','backupDirectory','failedTarget'])if(typeof value[key]==='string')locations.push(`${key}: ${value[key]}`);
    const submission=error?.submissionFacts?`\nOriginal submission JSON: ${JSON.stringify(error.submissionFacts)}`:'';
    return message+(locations.length?'\nRecovery locations:\n'+locations.join('\n'):'')+(Object.keys(details).length?'\nRecovery facts: '+inspect(details,{depth:12,customInspect:false,getters:false,breakLength:120}):'')+submission;
  } catch { return 'Error could not be formatted; preserve the original API exception and inspect the actual state.'; }
}
export async function listFiles(root, current = root) {
  const result = [];
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const file = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in portable package: ${file}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, file));
    else if (entry.isFile()) result.push(path.relative(root, file));
  }
  return result.sort();
}
