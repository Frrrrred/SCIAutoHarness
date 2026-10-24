import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {hostProfile} from './hosts.mjs';
import { contained, digest, exists, hash, inside, json, listFiles, lockedRoots, writeJson } from './files.mjs';

export const skillSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const start = '<!-- codex-task-harness:start -->';
const end = '<!-- codex-task-harness:end -->';
export function defaultRule(skillPath,host='codex') {
  const profile=hostProfile(host);
  const rule=`${start}\n## Complex task harness\n\nHonor explicit project-read boundaries during intake and execution. Resolve project-relative paths against the supplied task directory; do not inspect the host cwd to locate an already supplied project. Without a supplied in-scope Git baseline, do not probe ancestor/sibling metadata or run Git discovery, status or history (including git -C); review current files and mark historical evidence unverified.\n\nClassify the complete request first. Cross-module behavior with dependent tests, comprehensive multi-module reviews, multi-stage deliverables and substantive research require Harness; theoretical research includes dependent definitions, proofs, counterexamples and a manuscript. For a complex task, before any project intake, main and delegated agents must separately await reading ${path.join(skillPath,'SKILL.md').replaceAll('\\','/')} and receive its contents. Do not batch this read with SCOPE, README, enumeration or any project operation. Simple questions, isolated diagnosis and single low-risk edits proceed directly; a domain skill does not replace the Harness review gate.\n\nNew task/no associated Harness: read necessary in-scope inputs and follow the skill authoring route to prepare the complete package yourself. Missing formal approval does not block authorized planning. Include the master, substantive major stages, applicable protocols, recovery, deliverables, dependencies, acceptance and unknowns. With file authorization, resolve links per document and actually run the documented package path check. A read-only request without file authorization uses the complete in-session route: verify referenced local inputs read-only, keep a full ID/revision/text and approval provenance in chat, and do not invent a disk package, machine digest or CLI context. Authorized implementation includes necessary task-local Harness files. Present the complete current version and await direct final-human approval before formal work, including proofs, results or manuscripts in chat/files/handoffs. Do not self-approve or treat silence, the initial request or another task's approval as approval. For delegated unapproved new work or material changes, prepare and return the complete pending-review package normally with all navigation links. For an independent read-only subtask within the same valid approval, inherit its ID/revision, approval provenance, current phase, scope, permissions and acceptance; follow the same context route and return actual evidence without a new approval identity. The parent cannot grant new permissions by forwarding approval. Do not ask the parent to supply/write/approve a package or replace final delivery with a status message.\n\nExisting layered task with supplied entry: first project reads ONLY its master and recovery; the skill runtime interface may be read, then immediately derive context. Defer SCOPE, README and task descriptions until after context even when named in the prompt. Before context, do not enumerate/broad-search, load full state or old receipts/reports; search matches count as loading. Only an unknown or actually missing entry permits narrow filename lookup within the explicit task directory. Use context's approval provenance/dependency summaries; read raw linked evidence only for a stated specific gap. Absent current approval means complete review. After context, load only master constraints, current phase and applicable protocols/accepted dependency summaries. Use native begin, actual inline submit and verify; runtime owns formal state/receipts, so do not create payload JSON. Preserve active run identity even when evidence becomes stale or approval becomes invalid. Never re-review or restart to clear active/pending work. After the original run actually ends, submit its real step/runId and evidence; stale-run factual closure does not restore approval or accept results. Check context active-execution and latest-acceptance summaries for recovery; submit does not stop or cancel a process. Follow the approved dependencies and acceptance; execution records, file existence and exit zero do not establish correctness.\n\nPreserve source/evidence integrity, negative/inconclusive findings, current user permissions and domain constraints. Reassess applicable skills when the current work changes, without bulk-loading or re-reading unchanged skills. Material changes to methods, scope, inputs, permissions, resources or acceptance require renewed review and invalidate affected downstream evidence. Use absolute file-link targets in the normal final handoff, including manual review packages; preserve Windows drive paths such as E:/ literally. Use native Codex tools. Native tool use follows this Harness route and the user's actual permissions; no additional services or execution permissions are implied.\n${end}\n`;
  return host==='codex'?rule:rule.replace('Use native Codex tools.',`Use native ${profile.label} tools actually supplied by this host.`).replace('\n'+end,'\n\nFor new work, use the reviewed host policy and the '+host+' profile. Preserve the original host/mode/executor when closing active work. No host selection grants extra permissions.\n'+end);
}
async function futureRoot(root) {
  let current=path.resolve(root); const suffix=[];
  while (!(await exists(current))) { suffix.unshift(path.basename(current)); current=path.dirname(current); }
  return path.join(await fs.realpath(current),...suffix);
}
const safetyVersion=2;
const identity=s=>({dev:String(s.dev),ino:String(s.ino),nlink:String(s.nlink),mode:String(s.mode)});
const sameIdentity=(a,b)=>!!a&&!!b&&['dev','ino','nlink','mode'].every(k=>a[k]===b[k]);
async function inspect(file){
 if(!await exists(file))return {sha256:null,identity:null};
 const s=await fs.lstat(file,{bigint:true});
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.ino===0n)throw new Error(`Installation target must be a regular single-link file with reliable identity: ${file}`);
 return {sha256:await digest(file),identity:identity(s)};
}
function decode(bytes){
 let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('Unsupported AGENTS encoding: require lossless UTF-8 (optional BOM).');}
 if(text.includes('\0')||!Buffer.from(text,'utf8').equals(bytes))throw new Error('Unsupported AGENTS encoding: require lossless UTF-8.');
 return text;
}
async function assertTarget(file,expectedIdentity,expectedHash){
 const actual=await inspect(file);
 if(!sameIdentity(actual.identity,expectedIdentity)||actual.sha256!==expectedHash)throw new Error(`Installation target identity/content changed: ${file}; review a fresh preview.`);
}
async function writeTarget(change,bytes,expectedIdentity,expectedHash){
 let handle,failed=false,operationError;
 try{
  handle=await fs.open(change.target,expectedIdentity?'r+':'wx',expectedIdentity?undefined:(change.sourceMode??0o666));
  const opened=await handle.stat({bigint:true});
  if(!opened.isFile()||opened.nlink!==1n||opened.ino===0n||(expectedIdentity&&!sameIdentity(identity(opened),expectedIdentity)))throw new Error(`Opened target identity/link state changed: ${change.target}`);
  await assertTarget(change.target,identity(opened),expectedIdentity?expectedHash:hash(Buffer.alloc(0)));
  await handle.writeFile(bytes);await handle.truncate(bytes.length);
  const after=await handle.stat({bigint:true});
  if(!sameIdentity(identity(after),identity(opened)))throw new Error(`Target identity changed during write: ${change.target}`);
 }catch(e){failed=true;operationError=e;}
 if(handle)try{await handle.close();}catch(cleanupError){if(failed)throw Object.assign(new Error(`${operationError?.message??String(operationError)}; target handle cleanup also failed: ${cleanupError.message}`,{cause:operationError}),{operationError,cleanupError});throw cleanupError;}
 if(failed)throw operationError;
 return (await inspect(change.target)).identity;
}
export async function previewInstall({host='codex',hostHome,codexHome,skillRoot,replaceSkill=false}={}) {
 const profile=hostProfile(host);
 if(codexHome!==undefined&&host!=='codex')throw new Error('--codex-home is a Codex-only home alias.');
 if(hostHome!==undefined&&codexHome!==undefined&&path.resolve(hostHome)!==path.resolve(codexHome))throw new Error('Conflicting host-home and codex-home values.');
 hostHome=hostHome??codexHome;
 if(!hostHome||!skillRoot)throw new Error('Declare host home and skill root explicitly.');
 hostHome=await futureRoot(hostHome);skillRoot=await futureRoot(skillRoot);
 const targetSkill=path.join(skillRoot,'codex-task-harness'),agents=path.join(hostHome,profile.instructionFile);
 if(inside(skillSource,targetSkill)||inside(targetSkill,skillSource))throw new Error('Installation source and target must not overlap.');
 if(inside(skillSource,hostHome)||inside(targetSkill,hostHome))throw new Error('Instruction home must not be inside the portable skill source or target.');
 for(const name of profile.overrideFiles){const override=path.join(hostHome,name);
  if(await exists(override)&&(await fs.readFile(override,'utf8')).trim())throw new Error(host==='codex'?'AGENTS.override.md shadows AGENTS.md. Review the override; this installer will not silently modify it.':`Nearby local instruction file ${name} requires review before adding another instruction source. This conservative installer rule does not claim host override semantics.`);
 }
 const agentBefore=await inspect(agents),oldBytes=agentBefore.sha256?await fs.readFile(agents):Buffer.alloc(0),old=decode(oldBytes),rule=defaultRule(targetSkill,host);
 let next=oldBytes;
 if(old.includes(start)||old.includes(end)){
  const i=old.indexOf(start),j=old.indexOf(end);
  if(i<0||j<i||old.indexOf(start,i+start.length)!==-1||old.indexOf(end,j+end.length)!==-1)throw new Error('Malformed or duplicate managed rule markers.');
  if(old.slice(i,j+end.length)!==rule.trimEnd())throw new Error('An existing managed rule differs; inspect it instead of overwriting.');
 }else next=Buffer.concat([oldBytes,Buffer.from(`${old&& !old.endsWith('\n')?'\n':''}${old?'\n':''}${rule}`)]);
 const files=await listFiles(skillSource),changes=[];
 if(!next.equals(oldBytes))changes.push({target:agents,before:agentBefore.sha256,beforeIdentity:agentBefore.identity,after:hash(next),kind:'append-rule',bytes:next.toString('base64')});
 if(await exists(targetSkill)){
  const extras=(await listFiles(targetSkill)).filter(x=>!files.includes(x));
  if(extras.length)throw new Error(`Existing skill has extra files; refuse automatic overwrite: ${extras.join(', ')}`);
 }
 for(const relative of files){
  const target=path.join(targetSkill,relative),source=path.join(skillSource,relative);const previous=await inspect(target),after=await digest(source);const sourceMode=(await fs.stat(source)).mode&0o777;
  if(previous.sha256===after)continue;
  if(previous.sha256&&!replaceSkill)throw new Error(`Different skill already exists: ${target}. Review replacement explicitly.`);
  changes.push({target,source,sourceMode,before:previous.sha256,beforeIdentity:previous.identity,after,kind:previous.sha256?'replace-skill':'create-skill'});
 }
 const contract={schemaVersion:1,safetyVersion,host,hostHome,instructionFile:profile.instructionFile,...(host==='codex'?{codexHome:hostHome}:{}),skillRoot,targetSkill,replaceSkill,changes};
 return {...contract,digest:hash(JSON.stringify(contract)),summary:{changedFiles:changes.length,configTomlChanged:false,dependenciesInstalled:false,modelCalled:false,legacyRufloDirectivesDetected:/npx\s+(?:claude-flow|ruflo)|mcp__claude-flow|swarm_init/i.test(old),legacyPolicy:'Existing text is retained. Apply the native Harness workflow within the user\'s actual authorization; retain unrelated user and domain constraints.',agentsRule:rule}};
}
export async function applyInstall(plan){
 if(plan.safetyVersion!==safetyVersion||!plan.changes?.every(c=>'beforeIdentity'in c))throw new Error('Legacy installation plan lacks safety identities; obtain a fresh preview.');
 const current=await previewInstall(plan);
 if(current.digest!==plan.digest)throw new Error('Installation source or target changed after preview. Review a fresh preview.');
 if(!current.changes.length)return {status:'already-installed',changedFiles:0};
 await fs.mkdir(current.hostHome,{recursive:true});await fs.mkdir(current.skillRoot,{recursive:true});
 return lockedRoots([current.hostHome,current.skillRoot],async()=>{
  if((await previewInstall(plan)).digest!==plan.digest)throw new Error('Installation target changed while acquiring lock.');
  const backupDir=await contained(current.hostHome,path.join('harness-install-backups',randomUUID()));await fs.mkdir(backupDir,{recursive:true});
  const saved=[],manifest=path.join(backupDir,'rollback.json');
  const record={schemaVersion:1,safetyVersion,status:'prepared',host:current.host,hostHome:current.hostHome,instructionFile:current.instructionFile,...(current.host==='codex'?{codexHome:current.hostHome}:{}),skillRoot:current.skillRoot,targetSkill:current.targetSkill,changes:saved};
  let target=null,stage='backup';
  try{
   for(const change of current.changes){
    target=change.target;const root=change.kind==='append-rule'?current.hostHome:current.skillRoot;
    await contained(root,path.relative(root,target));
    if(change.beforeIdentity)await assertTarget(target,change.beforeIdentity,change.before);
    else if(await exists(target))throw new Error(`New installation target appeared: ${target}`);
    const backup=change.before?path.join(backupDir,`${saved.length}.bin`):null;
    if(backup){const bytes=await fs.readFile(target);if(hash(bytes)!==change.before)throw new Error(`Backup input changed: ${target}`);target=backup;await fs.writeFile(backup,bytes,{flag:'wx'});}
    saved.push({...change,backup});
   }
    stage='prepared-manifest';target=manifest;record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);
    stage='write-targets';
   for(const change of saved){
    target=change.target;await fs.mkdir(path.dirname(target),{recursive:true});
    const bytes=change.kind==='append-rule'?Buffer.from(change.bytes,'base64'):await fs.readFile(change.source);
    if(hash(bytes)!==change.after)throw new Error(`Installation source changed: ${target}`);
    change.afterIdentity=await writeTarget(change,bytes,change.beforeIdentity,change.before);
    if(await digest(target)!==change.after)throw new Error(`Installed digest mismatch: ${target}`);
   }
   stage='installed-manifest';target=manifest;record.status='installed';record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);
  }catch(e){throw Object.assign(new Error(`${e.message}. Install ${stage}. Failed target: ${target??'manifest'}. Inspect recovery manifest ${manifest} (it may not exist if preparation failed) and backup directory ${backupDir}; writes are not transactional and no automatic destructive rollback was attempted.`,{cause:e}),{recovery:{operation:'install',stage,failedTarget:target,manifest,backupDirectory:backupDir}});}
  return {status:'installed',changedFiles:saved.length,rollbackManifest:manifest,next:`Start a new ${hostProfile(current.host).label} session to load instructions; confirm the skill is discovered.`};
 });
}
function manifestBinding(record){const {bindingDigest,status,...bound}=record;return hash(JSON.stringify(bound));}
export async function rollbackInstall(manifest){
 const record=await json(manifest);
 if(record.schemaVersion!==1||record.status!=='installed'||![1,safetyVersion].includes(record.safetyVersion)||!Array.isArray(record.changes)||!record.changes.every(c=>c.afterIdentity&&'beforeIdentity'in c))throw new Error('Only a completed safety-bound installation can be rolled back; legacy manifests need manual review.');
 const legacy=record.safetyVersion===1;
 if(legacy&&['host','hostHome','instructionFile','bindingDigest'].some(key=>Object.hasOwn(record,key)))throw new Error('Legacy safety1 manifest contains safety2 host binding fields; preserve the original manifest instead of downgrading it.');
 if(!legacy){
  const profile=hostProfile(record.host);
  if(record.bindingDigest!==manifestBinding(record)||record.instructionFile!==profile.instructionFile||(record.host==='codex'?record.codexHome!==record.hostHome:Object.hasOwn(record,'codexHome')))throw new Error('Installation host/profile/home binding changed; preserve the original manifest.');
 }
 const hostHome=legacy?record.codexHome:record.hostHome;
 if(typeof hostHome!=='string'||!path.isAbsolute(hostHome)||typeof record.skillRoot!=='string'||!path.isAbsolute(record.skillRoot))throw new Error('Installation roots must be absolute.');
 const instructions=path.join(hostHome,legacy?'AGENTS.md':record.instructionFile);
 const backupDir=path.dirname(path.resolve(manifest));
 if(!inside(path.join(hostHome,'harness-install-backups'),backupDir))throw new Error('Backup manifest is outside the declared backup root.');
 if(path.resolve(record.targetSkill)!==path.join(path.resolve(record.skillRoot),'codex-task-harness'))throw new Error('Invalid declared installation root.');
 return lockedRoots([hostHome,record.skillRoot],async()=>{
  let target=null,stage='preflight',completedTargets=0;
  try{
  // Entire preflight must succeed before the first restored byte.
  const targets=new Set(),identities=new Set();
  for(const change of record.changes){
   target=change.target;
   const normalized=path.resolve(change.target),key=process.platform==='win32'?normalized.toLowerCase():normalized,physical=`${change.afterIdentity.dev}:${change.afterIdentity.ino}`;if(targets.has(key)||identities.has(physical))throw new Error('Duplicate rollback target identity.');targets.add(key);identities.add(physical);
   const root=change.target===instructions?hostHome:record.skillRoot;
   if(change.target!==instructions&&!inside(record.targetSkill,change.target))throw new Error('Rollback target outside installation.');
   if(!legacy&&(!['append-rule','create-skill','replace-skill'].includes(change.kind)||(change.kind==='append-rule')!==(change.target===instructions)))throw new Error('Rollback target conflicts with its fixed profile role.');
   await contained(root,path.relative(root,change.target));await assertTarget(change.target,change.afterIdentity,change.after);
   if(change.backup){await contained(backupDir,path.relative(backupDir,change.backup));const b=await inspect(change.backup);if(b.sha256!==change.before)throw new Error('Backup integrity mismatch.');}
   else if(change.before!==null||change.beforeIdentity!==null)throw new Error('Missing original backup identity.');
  }
  stage='restore';
  for(const change of record.changes){
   target=change.target;
   if(change.backup){const bytes=await fs.readFile(change.backup);if(hash(bytes)!==change.before)throw new Error('Backup changed after preflight.');await writeTarget(change,bytes,change.afterIdentity,change.after);}
   else {await assertTarget(change.target,change.afterIdentity,change.after);await fs.unlink(change.target);}
    completedTargets++;
  }
  const directories=new Set(record.changes.filter(c=>inside(record.targetSkill,c.target)).flatMap(c=>{const result=[];let dir=path.dirname(c.target);while(inside(record.targetSkill,dir)){result.push(dir);if(dir===record.targetSkill)break;dir=path.dirname(dir);}return result;}));
   stage='cleanup-directories';
   for(const dir of [...directories].sort((a,b)=>b.length-a.length)){target=dir;await fs.rmdir(dir).catch(e=>{if(!['ENOTEMPTY','ENOENT'].includes(e.code))throw e;});}
  stage='manifest';target=manifest;record.status='rolled-back';await writeJson(manifest,record);
  return {status:'rolled-back',restoredFiles:record.changes.length,backupPreserved:backupDir,rollbackManifest:path.resolve(manifest)};
   }catch(e){throw Object.assign(new Error(`${e.message}. Rollback ${stage} failed at ${target??'preflight'}; ${completedTargets}/${record.changes.length} target operations returned successfully. Inspect manifest ${manifest} and backup directory ${backupDir}. Changes may be partial; do not automatically retry.`,{cause:e}),{recovery:{operation:'rollback',stage,failedTarget:target,completedTargets,totalTargets:record.changes.length,manifest,backupDirectory:backupDir}});}
 });
}
