import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {canonicalName,legacyName,compatibilityFiles,legacyInventories} from './identity.mjs';
import {hostProfile} from './hosts.mjs';
import { contained, digest, exists, hash, inside, json, listFiles, lockedRoots, writeJson } from './files.mjs';

export const skillSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const start = '<!-- agent-task-harness:start -->';
const end = '<!-- agent-task-harness:end -->';
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
const safetyVersion=3;
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

async function assertExpectedTarget(file,id,sha){if(id===null&&sha===null){if(await exists(file))throw new Error('New installation target appeared: '+file);return;}return assertTarget(file,id,sha);}
export function legacyDefaultRule(skillPath,host='codex'){
 return defaultRule(skillPath,host).replaceAll('<!-- agent-task-harness:','<!-- codex-task-harness:');
}
function managedReplacement(oldBytes,rule,oldRule,reviewedRule){
 const old=decode(oldBytes),markers=[...old.matchAll(/<!-- (?:agent|codex)-task-harness:(start|end) -->/g)];
 if([...old.matchAll(/<!--\s*(?:agent|codex)-task-harness\s*:/g)].length!==markers.length)throw new Error('Malformed managed rule markers.');
 if(!markers.length&&reviewedRule)throw new Error('Explicit reviewed before block is absent; obtain a fresh exact review.');
 if(!markers.length)return Buffer.concat([oldBytes,Buffer.from(`${old&&!old.endsWith('\n')?'\n':''}${old?'\n':''}${rule}`)]);
 if(markers.length!==2||markers[0][1]!=='start'||markers[1][1]!=='end'||markers[0][0].split(':')[0]!==markers[1][0].split(':')[0])throw new Error('Malformed, mixed or duplicate managed rule markers.');
 const i=markers[0].index,j=markers[1].index+markers[1][0].length,actual=old.slice(i,j);
 if(actual===rule.trimEnd())return oldBytes;
 if((reviewedRule&&actual!==reviewedRule.before)||(!reviewedRule&&actual!==oldRule.trimEnd()))throw new Error('An existing managed rule differs; inspect it instead of overwriting.');
 return Buffer.from(old.slice(0,i)+rule.trimEnd()+old.slice(j),'utf8');
}
async function inventoryRecognized(root){
 const files=await listFiles(root),mapping=Object.fromEntries(await Promise.all(files.map(async f=>[f.split(path.sep).join('/'),(await inspect(path.join(root,f))).sha256])));
 if(!legacyInventories.some(known=>JSON.stringify(Object.keys(known).sort())===JSON.stringify(Object.keys(mapping).sort())&&Object.keys(known).every(f=>known[f]===mapping[f])))throw new Error('Existing skill has extra files or unrecognized legacy content; refuse automatic migration.');
 return hash(JSON.stringify(mapping));
}
export async function previewInstall({host='codex',hostHome,codexHome,skillRoot,replaceSkill=false,migrateLegacy=false,reviewedRule}={}){
 const profile=hostProfile(host);
 if(codexHome!==undefined&&host!=='codex')throw new Error('--codex-home is a Codex-only home alias.');
 if(hostHome!==undefined&&codexHome!==undefined&&path.resolve(hostHome)!==path.resolve(codexHome))throw new Error('Conflicting host-home and codex-home values.');
 hostHome=hostHome??codexHome;if(!hostHome||!skillRoot)throw new Error('Declare host home and skill root explicitly.');
 hostHome=await futureRoot(hostHome);skillRoot=await futureRoot(skillRoot);
 const targetSkill=path.join(skillRoot,canonicalName),legacyCompat=path.join(skillRoot,legacyName),agents=path.join(hostHome,profile.instructionFile);
 for(const root of [targetSkill,legacyCompat]){
  if(await exists(root)&&((await fs.lstat(root)).isSymbolicLink()||await fs.realpath(root)!==root))throw new Error('Unsafe linked installation root: '+root);
  if(inside(skillSource,root)||inside(root,skillSource))throw new Error('Installation source and target must not overlap.');
  if(inside(skillSource,hostHome)||inside(root,hostHome))throw new Error('Instruction home must not be inside the portable skill source or target.');
 }
 for(const name of profile.overrideFiles){const file=path.join(hostHome,name);if(await exists(file)&&(await fs.readFile(file,'utf8')).trim())throw new Error(host==='codex'?'AGENTS.override.md shadows AGENTS.md. Review the override.':`Nearby local instruction file ${name} requires review before adding another instruction source.`);}
 const before=await inspect(agents),oldBytes=before.sha256?await fs.readFile(agents):Buffer.alloc(0);
 if(reviewedRule&&(!reviewedRule.before||!reviewedRule.after))throw new Error('Explicit reviewed rule requires exact before and after block bytes.');
 if(reviewedRule&&(!reviewedRule.after.startsWith(start)||!reviewedRule.after.endsWith(end)||[...reviewedRule.after.matchAll(/<!--\s*(?:agent|codex)-task-harness\s*:/g)].length!==2))throw new Error('Explicit reviewed canonical block requires exactly one new marker pair.');
 const rule=reviewedRule?reviewedRule.after+'\n':defaultRule(targetSkill,host);
 // A custom block can only be changed through the separately reviewed exact before/after API input.
 const next=managedReplacement(oldBytes,rule,legacyDefaultRule(legacyCompat,host),reviewedRule),changes=[];
 if(!next.equals(oldBytes))changes.push({role:'instructions',target:agents,before:before.sha256,beforeIdentity:before.identity,after:hash(next),kind:'append-rule',bytes:next.toString('base64')});
 const files=await listFiles(skillSource),compat=compatibilityFiles();
 let migrating=false,inventoryDigest=null;
 if(await exists(legacyCompat)){
  const existing=await listFiles(legacyCompat);
  const thin=existing.every(f=>Object.hasOwn(compat,f.split(path.sep).join('/')));
  if(!thin){if(!migrateLegacy||!replaceSkill)throw new Error('A full legacy skill requires explicit --migrate-legacy and --replace-skill after review.');inventoryDigest=await inventoryRecognized(legacyCompat);migrating=true;}
 }
 for(const [role,root,members]of [['canonical',targetSkill,Object.fromEntries(files.map(f=>[f.split(path.sep).join('/'),null]))],['legacyCompat',legacyCompat,compat]]){
  if(await exists(root)&&!(role==='legacyCompat'&&migrating)){
   const extras=(await listFiles(root)).filter(f=>!Object.hasOwn(members,f.split(path.sep).join('/')));if(extras.length)throw new Error('Existing skill has extra files; refuse automatic overwrite: '+extras.join(', '));
  }
  const relatives=role==='legacyCompat'&&migrating?[...new Set([...(await listFiles(root)).map(f=>f.split(path.sep).join('/')),...Object.keys(members)])].sort():Object.keys(members).sort();
  for(const relative of relatives){
   const target=path.join(root,relative),previous=await inspect(target),source=role==='canonical'?path.join(skillSource,relative):null,bytes=role==='canonical'?null:(Object.hasOwn(compat,relative)?Buffer.from(compat[relative]):null),after=source?await digest(source):bytes?hash(bytes):null;
   if(previous.sha256===after)continue;
   if(previous.sha256&&!replaceSkill)throw new Error(`Different skill already exists: ${target}. Review replacement explicitly.`);
   const retire=role==='legacyCompat'&&migrating&&!!previous.identity;
   changes.push({role,target,...(source?{source,sourceMode:(await fs.stat(source)).mode&0o777}:bytes?{bytes:bytes.toString('base64')}:{}),before:previous.sha256,beforeIdentity:previous.identity,after,kind:after===null?'retire-legacy':previous.sha256?'replace-skill':'create-skill',...(retire?{retire:true}:{})});
  }
 }
 // Stable preview path; apply replaces it with an exclusive UUID directory bound in the manifest.
 const retirementParent=path.join(path.dirname(skillRoot),'.agent-task-harness-rollback');
 if(migrating){
  if(inside(skillRoot,retirementParent)||inside(skillSource,retirementParent))throw new Error('Rollback storage must be outside skill discovery/source roots.');
  const parent=await futureRoot(retirementParent);let existing=parent;while(!await exists(existing))existing=path.dirname(existing);
  for(const c of changes.filter(c=>c.retire))if(String((await fs.stat(existing,{bigint:true})).dev)!==c.beforeIdentity.dev)throw new Error('Migration requires same-volume identity-preserving rollback storage.');
 }
 const contract={schemaVersion:1,safetyVersion,product:canonicalName,host,hostHome,instructionFile:profile.instructionFile,...(host==='codex'?{codexHome:hostHome}:{}),skillRoot,targetSkill,legacyCompat,retirementParent,replaceSkill,migrateLegacy,migration:{mode:migrating?'legacy-full-to-compatibility':'none',inventoryDigest},...(reviewedRule?{reviewedRule}:{}),changes};
 return {...contract,digest:hash(JSON.stringify(contract)),summary:{changedFiles:changes.length,configTomlChanged:false,dependenciesInstalled:false,modelCalled:false,legacyRufloDirectivesDetected:/npx\s+(?:claude-flow|ruflo)|mcp__claude-flow|swarm_init/i.test(decode(oldBytes)),legacyPolicy:'Unrelated original bytes and permissions are retained.',agentsRule:rule}};
}
function manifestBinding(record){const{bindingDigest,status,...bound}=record;return hash(JSON.stringify(bound));}
export async function applyInstall(plan){
 if(plan.safetyVersion!==3||!plan.changes?.every(c=>'beforeIdentity'in c))throw new Error('Legacy installation plan lacks current safety identities; obtain a fresh preview.');
 const current=await previewInstall(plan);if(current.digest!==plan.digest)throw new Error('Installation source or target changed after preview. Review a fresh preview.');
 if(!current.changes.length)return{status:'already-installed',changedFiles:0};
 await fs.mkdir(current.hostHome,{recursive:true});await fs.mkdir(current.skillRoot,{recursive:true});
 return lockedRoots([current.hostHome,current.skillRoot],async()=>{
  if((await previewInstall(plan)).digest!==plan.digest)throw new Error('Installation target changed while acquiring lock.');
  const id=randomUUID(),backupDir=await contained(current.hostHome,path.join('harness-install-backups',id));
  const retirementRoot=current.migration.mode==='none'?null:path.join(current.retirementParent,id);
  const saved=[],manifest=path.join(backupDir,'rollback.json'),record={schemaVersion:1,safetyVersion:3,product:canonicalName,status:'prepared',host:current.host,hostHome:current.hostHome,instructionFile:current.instructionFile,...(current.host==='codex'?{codexHome:current.hostHome}:{}),skillRoot:current.skillRoot,targetSkill:current.targetSkill,legacyCompat:current.legacyCompat,migration:current.migration,retirementRoot,changes:saved};
  let target=null,stage='prepare-directories',completedTargets=0;
  try{
   target=backupDir;await fs.mkdir(backupDir,{recursive:true});
   if(retirementRoot){target=current.retirementParent;await fs.mkdir(current.retirementParent,{recursive:true});if(await fs.realpath(current.retirementParent)!==current.retirementParent)throw new Error('Rollback storage real path changed.');target=retirementRoot;await fs.mkdir(retirementRoot);}
   stage='backup';
   for(const c of current.changes){
    target=c.target;await contained(c.role==='instructions'?current.hostHome:current.skillRoot,path.relative(c.role==='instructions'?current.hostHome:current.skillRoot,target));
    await assertExpectedTarget(target,c.beforeIdentity,c.before);
    const backup=c.before?path.join(c.retire?retirementRoot:backupDir,`${saved.length}.bin`):null;
    if(backup&&!c.retire){const bytes=await fs.readFile(target);if(hash(bytes)!==c.before)throw new Error('Backup input changed');target=backup;await fs.writeFile(backup,bytes,{flag:'wx'});}
    saved.push({...c,backup});
   }
   stage='prepared-manifest';target=manifest;record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);
   stage='write-targets';
   for(const c of saved){
    target=c.target;await fs.mkdir(path.dirname(target),{recursive:true});
    if(c.retire){await assertExpectedTarget(target,c.beforeIdentity,c.before);await fs.rename(target,c.backup);await assertExpectedTarget(c.backup,c.beforeIdentity,c.before);c.relocated=true;stage='progress-manifest';target=manifest;record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);stage='write-targets';target=c.target;}
    if(c.after!==null){const bytes=c.source?await fs.readFile(c.source):Buffer.from(c.bytes,'base64');if(hash(bytes)!==c.after)throw new Error(`Installation source changed: ${target}`);c.afterIdentity=await writeTarget(c,bytes,c.retire?null:c.beforeIdentity,c.retire?null:c.before);if(await digest(target)!==c.after)throw new Error('Installed digest mismatch');}else c.afterIdentity=null;
    completedTargets++;
    if(retirementRoot){record.completedTargets=completedTargets;stage='progress-manifest';target=manifest;record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);stage='write-targets';}
   }
   stage='installed-manifest';target=manifest;record.status='installed';record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);
  }catch(e){throw Object.assign(new Error(`${e.message}. Install ${stage}. Failed target: ${target??'manifest'}. Inspect recovery manifest ${manifest} (it may not exist if preparation failed) and backup directory ${backupDir}; writes are not transactional and no automatic destructive rollback was attempted.`,{cause:e}),{recovery:{operation:'install',stage,failedTarget:target,completedTargets,manifest,backupDirectory:backupDir,retirementRoot}});}
  return{status:'installed',changedFiles:saved.length,rollbackManifest:manifest,next:`Start a new ${hostProfile(current.host).label} session to load instructions; confirm canonical skill discovery.`};
 });
}
export async function rollbackInstall(manifest){
 const record=await json(manifest);if(record.safetyVersion!==3)return rollbackLegacyInstall(manifest);
 const profile=hostProfile(record.host),home=record.hostHome,root=record.skillRoot,backupDir=path.dirname(path.resolve(manifest));
 if(record.schemaVersion!==1||record.status!=='installed'||record.product!==canonicalName||record.bindingDigest!==manifestBinding(record)||record.instructionFile!==profile.instructionFile||(record.host==='codex'?record.codexHome!==home:Object.hasOwn(record,'codexHome'))||!Array.isArray(record.changes)||!record.changes.every(c=>'afterIdentity'in c&&'beforeIdentity'in c))throw new Error('Only a completed safety-bound installation can be rolled back; host/profile/home binding changed.');
 if(![home,root,record.targetSkill,record.legacyCompat].every(x=>typeof x==='string'&&path.isAbsolute(x))||record.targetSkill!==path.join(root,canonicalName)||record.legacyCompat!==path.join(root,legacyName)||!inside(path.join(home,'harness-install-backups'),backupDir))throw new Error('Invalid declared installation roots or backup manifest.');
 if(!['none','legacy-full-to-compatibility'].includes(record.migration?.mode))throw new Error('Invalid migration binding.');
 const retirementParent=path.join(path.dirname(root),'.agent-task-harness-rollback');
 if(record.migration.mode==='none'?record.retirementRoot!==null:typeof record.retirementRoot!=='string'||path.dirname(record.retirementRoot)!==retirementParent||path.basename(record.retirementRoot)!==path.basename(backupDir)||inside(root,record.retirementRoot))throw new Error('Invalid identity-preserving rollback storage binding.');
 return lockedRoots([home,root],async()=>{
  let target=null,stage='preflight',completedTargets=0;
  try{
   if(record.retirementRoot){target=record.retirementRoot;if(await fs.realpath(retirementParent)!==retirementParent||await fs.realpath(record.retirementRoot)!==record.retirementRoot)throw new Error('Rollback storage real path changed.');}
   const targets=new Set(),identities=new Set();
   for(const[cIndex,c]of record.changes.entries()){
    target=c.target;const normalized=path.resolve(c.target),key=process.platform==='win32'?normalized.toLowerCase():normalized;
    const physical=c.afterIdentity?`${c.afterIdentity.dev}:${c.afterIdentity.ino}`:null;if(targets.has(key)||(physical&&identities.has(physical)))throw new Error('Duplicate rollback target identity.');targets.add(key);if(physical)identities.add(physical);
    const role=c.target===path.join(home,record.instructionFile)?'instructions':inside(record.targetSkill,c.target)&&c.target!==record.targetSkill?'canonical':inside(record.legacyCompat,c.target)&&c.target!==record.legacyCompat?'legacyCompat':null;
    if(!role||role!==c.role||!['append-rule','create-skill','replace-skill','retire-legacy'].includes(c.kind)||(c.kind==='append-rule')!==(role==='instructions')||(c.kind==='retire-legacy')!==(c.after===null)||(c.kind==='retire-legacy'&&!c.retire)||(c.retire&&(!c.beforeIdentity||typeof c.before!=='string'))||!!c.retire&&(role!=='legacyCompat'||record.migration.mode==='none'))throw new Error('Rollback target conflicts with its fixed profile role; outside installation.');
    await contained(role==='instructions'?home:root,path.relative(role==='instructions'?home:root,target));
    await assertExpectedTarget(target,c.afterIdentity,c.after);
    if(c.backup){const expected=path.join(c.retire?record.retirementRoot:backupDir,`${cIndex}.bin`);if(c.backup!==expected)throw new Error('Backup path binding changed.');await contained(c.retire?record.retirementRoot:backupDir,path.relative(c.retire?record.retirementRoot:backupDir,c.backup));const b=await inspect(c.backup);if(b.sha256!==c.before||c.retire&&!sameIdentity(b.identity,c.beforeIdentity))throw new Error('Backup integrity mismatch or original identity changed.');}
    else if(c.before!==null||c.beforeIdentity!==null)throw new Error('Missing original backup identity.');
   }
   stage='restore';
   for(const c of record.changes){
    target=c.target;
    if(c.retire){if(c.after!==null){await assertExpectedTarget(target,c.afterIdentity,c.after);await fs.unlink(target);}await assertExpectedTarget(c.backup,c.beforeIdentity,c.before);if(await exists(target))throw new Error('Original restore target appeared.');await fs.rename(c.backup,target);await assertExpectedTarget(target,c.beforeIdentity,c.before);}
    else if(c.backup){const bytes=await fs.readFile(c.backup);if(hash(bytes)!==c.before)throw new Error('Backup changed after preflight.');await writeTarget(c,bytes,c.afterIdentity,c.after);}
    else{await assertExpectedTarget(target,c.afterIdentity,c.after);await fs.unlink(target);}
    completedTargets++;
   }
   const directories=new Set(record.changes.filter(c=>c.role!=='instructions'&&!c.before).flatMap(c=>{const role=c.role==='canonical'?record.targetSkill:record.legacyCompat,result=[];let dir=path.dirname(c.target);while(inside(role,dir)){result.push(dir);if(dir===role)break;dir=path.dirname(dir);}return result;}));
   stage='cleanup-directories';for(const dir of [...directories].sort((a,b)=>b.length-a.length)){target=dir;await fs.rmdir(dir).catch(e=>{if(!['ENOTEMPTY','ENOENT'].includes(e.code))throw e;});}
   stage='manifest';target=manifest;record.status='rolled-back';await writeJson(manifest,record);
   return{status:'rolled-back',restoredFiles:record.changes.length,backupPreserved:backupDir,rollbackManifest:path.resolve(manifest),retirementRoot:record.retirementRoot};
  }catch(e){throw Object.assign(new Error(`${e.message}. Rollback ${stage} failed at ${target??'preflight'}; ${completedTargets}/${record.changes.length} target operations returned successfully. Inspect manifest ${manifest} and backup directory ${backupDir}. Changes may be partial; do not automatically retry.`,{cause:e}),{recovery:{operation:'rollback',stage,failedTarget:target,completedTargets,totalTargets:record.changes.length,manifest,backupDirectory:backupDir,retirementRoot:record.retirementRoot}});}
 });
}

async function rollbackLegacyInstall(manifest){
 const record=await json(manifest);
 if(record.schemaVersion!==1||record.status!=='installed'||![1,2].includes(record.safetyVersion)||!Array.isArray(record.changes)||!record.changes.every(c=>c.afterIdentity&&'beforeIdentity'in c))throw new Error('Only a completed safety-bound installation can be rolled back; legacy manifests need manual review.');
 if(['product','legacyCompat','retirementRoot','migration','reviewedRule'].some(k=>Object.hasOwn(record,k)))throw new Error('Safety3 fields cannot be downgraded to a legacy format.');
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
