import fs from 'node:fs/promises';
import childProcess from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {canonicalName,legacyName,previousName,compatibilityNames,legacyInventories} from './identity.mjs';
import inventories from './installation-inventories.json' with {type:'json'};
import {hostProfile} from './hosts.mjs';
import { contained, digest, exists, hash, inside, json, listFiles, lockedRoots, writeJson } from './files.mjs';

export const skillSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const start = '<!-- sciautoharness:start -->';
const end = '<!-- sciautoharness:end -->';
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
const directoryIdentity=s=>({dev:String(s.dev),ino:String(s.ino),mode:String(s.mode)});
const sameDirectory=(a,b)=>!!a&&!!b&&['dev','ino','mode'].every(k=>a[k]===b[k]);
async function inspectDirectory(dir){
 if(!await exists(dir))return null;
 const st=await fs.lstat(dir,{bigint:true});
 if(!st.isDirectory()||st.isSymbolicLink()||st.ino===0n||await fs.realpath(dir)!==dir)throw new Error('Unsafe linked directory or installation root: '+dir);
 return directoryIdentity(st);
}
async function assertDirectory(dir,expected){const actual=await inspectDirectory(dir);if(expected===null?actual!==null:!sameDirectory(actual,expected))throw new Error('Installation directory identity changed: '+dir);}
function directoryTargets(changes,roots){
 const result=new Set();
 for(const c of changes.filter(c=>c.role!=='instructions')){
  const root=roots[c.role];if(!root)throw new Error('Unknown directory role');let dir=path.dirname(c.target);
  while(inside(root,dir)){result.add(dir);if(dir===root)break;dir=path.dirname(dir);}
 }
 return [...result].sort((a,b)=>a.length-b.length||a.localeCompare(b));
}
async function assertInstallationRoots(record){for(const root of [record.targetSkill,record.agentCompat,record.legacyCompat])if(await exists(root))await inspectDirectory(root);}

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
 return defaultRule(skillPath,host).replaceAll('<!-- sciautoharness:','<!-- codex-task-harness:');
}
function managedReplacement(oldBytes,rule,oldRules,reviewedRule){
 const old=decode(oldBytes),markers=[...old.matchAll(/<!-- (?:sciautoharness|(?:agent|codex)-task-harness):(start|end) -->/g)];
 if([...old.matchAll(/<!--\s*(?:sciautoharness|(?:agent|codex)-task-harness)\s*:/g)].length!==markers.length)throw new Error('Malformed managed rule markers.');
 if(!markers.length&&reviewedRule)throw new Error('Explicit reviewed before block is absent; obtain a fresh exact review.');
 if(!markers.length)return Buffer.concat([oldBytes,Buffer.from(`${old&&!old.endsWith('\n')?'\n':''}${old?'\n':''}${rule}`)]);
 if(markers.length!==2||markers[0][1]!=='start'||markers[1][1]!=='end'||markers[0][0].split(':')[0]!==markers[1][0].split(':')[0])throw new Error('Malformed, mixed or duplicate managed rule markers.');
 const i=markers[0].index,j=markers[1].index+markers[1][0].length,actual=old.slice(i,j);
 if(actual===rule.trimEnd())return oldBytes;
 if(reviewedRule&&actual!==reviewedRule.before)throw new Error('An existing managed rule differs; inspect it instead of overwriting.');
 if(!reviewedRule&&!oldRules.some(r=>actual===r.trimEnd()))throw new Error('An existing managed rule differs; inspect it instead of overwriting.');
 return Buffer.from(old.slice(0,i)+rule.trimEnd()+old.slice(j),'utf8');
}
const equalMapping=(a,b)=>JSON.stringify(Object.keys(a).sort())===JSON.stringify(Object.keys(b).sort())&&Object.keys(a).every(k=>a[k]===b[k]);
const knownFull=(role,mapping)=>(role==='agentCompat'?inventories.agentFull:legacyInventories).some(known=>equalMapping(known,mapping));

// Windows observations cover owner/group/DACL, attributes and file/directory ADS.
// They do not establish SACL/EA coverage or protect against arbitrary external races.
const metadataScript5=String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$utf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$utf8
[Console]::OutputEncoding=$utf8
$OutputEncoding=$utf8
$sections=[Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
function Native-Path([string]$p){if($p.StartsWith('\\?\')){return $p};if($p.StartsWith('\\')){return '\\?\UNC\'+$p.Substring(2)};return '\\?\'+$p}
function Read-Metadata($entry){
 $p=[string]$entry.path
 $native=Native-Path $p
 $item=Get-Item -LiteralPath $native -Force -ErrorAction Stop
 if($item.PSProvider.Name -cne 'FileSystem' -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'Unsafe metadata object'}
 $kind=if($item.PSIsContainer){'directory'}else{'file'}
 if($kind -cne [string]$entry.kind){throw 'Metadata type changed'}
 $acl=Get-Acl -LiteralPath $native -ErrorAction Stop
 $streams=@(Get-Item -LiteralPath $native -Stream '*' -Force -ErrorAction Stop)
 [string[]]$names=@($streams | Where-Object {$_.Stream -cne ':$DATA'} | ForEach-Object {[string]$_.Stream})
 [Array]::Sort($names,[StringComparer]::Ordinal)
 $ads=[Collections.Generic.List[object]]::new()
 foreach($name in $names){
  if(!$name -or $name.IndexOfAny([char[]]":\/") -ge 0){throw 'Unexpected alternate stream name'}
  $stream=$null;$sha=$null
  try{
   $stream=[IO.File]::Open($native+':'+$name,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
   $sha=[Security.Cryptography.SHA256]::Create()
   $sum=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()
   $ads.Add([ordered]@{name=$name;length=[string]$stream.Length;sha256=$sum})
  }finally{if($sha){$sha.Dispose()};if($stream){$stream.Dispose()}}
 }
 return [ordered]@{id=[string]$entry.id;path=$p;kind=$kind;ownerSid=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;groupSid=$acl.GetGroup([Security.Principal.SecurityIdentifier]).Value;sddl=$acl.GetSecurityDescriptorSddlForm($sections);attributes=[string][int64]$item.Attributes;namedStreams=$ads.ToArray()}
}
function Same-Security($a,$b){
 foreach($key in @('ownerSid','groupSid','sddl')){if(![string]::Equals([string]$a[$key],[string]$b.$key,[StringComparison]::Ordinal)){return $false}}
 $left=@($a.namedStreams);$right=@($b.namedStreams)
 if($left.Count -ne $right.Count){return $false}
 for($i=0;$i -lt $left.Count;$i++){foreach($key in @('name','length','sha256')){if(![string]::Equals([string]$left[$i][$key],[string]$right[$i].$key,[StringComparison]::Ordinal)){return $false}}}
 return $true
}
$completed=[Collections.Generic.List[string]]::new();$result=[Collections.Generic.List[object]]::new();$failedPath=$null;$stage='input';$code=0
try{
 $request=[Console]::In.ReadToEnd() | ConvertFrom-Json -Depth 30
 if($request.schemaVersion -ne 1 -or $request.action -cnotin @('capture','restoreArchive')){throw 'Unsupported metadata request'}
 $entries=@($request.entries);$observed=[Collections.Generic.List[object]]::new();$stage='preflight'
 foreach($entry in $entries){$failedPath=[string]$entry.path;$observed.Add((Read-Metadata $entry))}
 if($request.action -ceq 'restoreArchive'){
  $archive=[int64][IO.FileAttributes]::Archive
  for($i=0;$i -lt $entries.Count;$i++){
   $entry=$entries[$i];$now=$observed[$i];$failedPath=[string]$entry.path
   if($entry.kind -cne 'file' -or !(Same-Security $now $entry.expected)){throw 'Original security or stream drift'}
   if((([int64]$now.attributes -bxor [int64]$entry.expected.attributes) -band (-bnot $archive)) -ne 0){throw 'Unexpected original attribute drift'}
  }
  $stage='restoreArchive'
  for($i=0;$i -lt $entries.Count;$i++){
   $entry=$entries[$i];$failedPath=[string]$entry.path
   if([int64]$observed[$i].attributes -ne [int64]$entry.expected.attributes){[IO.File]::SetAttributes((Native-Path $failedPath),[IO.FileAttributes][int64]$entry.expected.attributes)}
   $completed.Add([string]$entry.id)
  }
  $stage='verify'
  foreach($entry in $entries){$failedPath=[string]$entry.path;$now=Read-Metadata $entry;if(!(Same-Security $now $entry.expected) -or $now.attributes -cne [string]$entry.expected.attributes){throw 'Original metadata restoration mismatch'};$result.Add($now)}
 }else{foreach($item in $observed){$result.Add($item);$completed.Add([string]$item.id)}}
 $response=[ordered]@{schemaVersion=1;complete=$true;coverage='Owner|Group|Access; attributes; file and directory named ADS';pwshVersion=[string]$PSVersionTable.PSVersion;results=$result.ToArray();completed=$completed.ToArray()}
}catch{$code=1;$response=[ordered]@{schemaVersion=1;complete=$false;stage=$stage;failedPath=$failedPath;completed=$completed.ToArray();error=$_.Exception.Message}}
[Console]::Out.Write(($response | ConvertTo-Json -Depth 30 -Compress))
exit $code
`;
let metadataExecutable5;
async function metadataTool5(){
 if(metadataExecutable5)return metadataExecutable5;
 const candidates=[path.join(process.env.ProgramFiles??'C:\\Program Files','PowerShell','7','pwsh.exe'),...(process.env.PATH??'').split(path.delimiter).map(p=>p.trim().replace(/^"|"$/g,'')).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,'pwsh.exe'))];
 for(const p of candidates){if(await exists(p)){const s=await fs.lstat(p);if(s.isFile()&&!s.isSymbolicLink()){metadataExecutable5=await fs.realpath(p);return metadataExecutable5;}}}
 throw new Error('Existing PowerShell with complete directory stream support is required for Windows installation metadata; no dependency was installed.');
}
const stable5=value=>JSON.stringify(value);
const sameSecurity5=(a,b)=>stable5(a)===stable5(b);
function failWithRecovery5(error,decorate){
 if(error?.code==='LOCK_CLEANUP_FAILED'){
  if(error.actionStatus==='failed'){error.actionError=decorate(error.actionError);error.cause=error.actionError;if(error.actionError.recovery)error.recovery=error.actionError.recovery;}
  throw error;
 }
 const decorated=decorate(error);if(error?.lockRoots)decorated.lockRoots=error.lockRoots;throw decorated;
}
async function metadata5(requested,action='capture'){
 const unique=new Map();
 for(const x of requested){const p=path.resolve(x.path);if(!path.isAbsolute(x.path)||p.slice(path.parse(p).root.length).includes(':'))throw new Error('Unsafe metadata path');const key=process.platform==='win32'?p.toLowerCase():p;if(unique.has(key)){if(unique.get(key).kind!==x.kind)throw new Error('Conflicting metadata roles');continue;}unique.set(key,{...x,path:p});}
 const entries=[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)).map((x,i)=>({...x,id:String(i)}));
 if(!entries.length)return new Map();
 const before=[];
 for(const x of entries){const s=await fs.lstat(x.path,{bigint:true});if(s.isSymbolicLink()||(x.kind==='file'?(!s.isFile()||s.nlink!==1n):!s.isDirectory())||s.ino===0n)throw new Error('Unsafe metadata identity: '+x.path);before.push(x.kind==='file'?identity(s):directoryIdentity(s));}
 let observations;
 if(process.platform==='win32'){
  const executable=await metadataTool5();
  const p=childProcess.spawnSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(metadataScript5,'utf16le').toString('base64')],{shell:false,windowsHide:true,input:Buffer.from(JSON.stringify({schemaVersion:1,action,entries}),'utf8'),encoding:'utf8',maxBuffer:16*1024*1024,timeout:30000});
  let result;try{result=JSON.parse(p.stdout??'');}catch(cause){throw Object.assign(new Error('Metadata collector did not return complete JSON.',{cause}),{metadataProcess:{status:p.status,signal:p.signal,error:p.error?.message,stderr:p.stderr,stdoutBytes:Buffer.byteLength(p.stdout??'')}});}
  if(p.error||p.signal||p.status!==0||result.schemaVersion!==1||result.complete!==true)throw Object.assign(new Error('Metadata collection failed: '+(result.error??p.error?.message??'incomplete result')),{metadataFacts:result,metadataProcess:{status:p.status,signal:p.signal,error:p.error?.message,stderr:p.stderr}});
  if(!Array.isArray(result.results)||result.results.length!==entries.length)throw new Error('Incomplete metadata inventory');
  observations=result.results.map((o,i)=>{const e=entries[i];if(o.id!==e.id||o.path!==e.path||o.kind!==e.kind||typeof o.sddl!=='string'||!/^S-\d(?:-\d+)+$/.test(o.ownerSid??'')||!/^S-\d(?:-\d+)+$/.test(o.groupSid??'')||!/^\d+$/.test(o.attributes??'')||!Array.isArray(o.namedStreams))throw new Error('Metadata identity/role response changed');let previous=null;for(const s of o.namedStreams){if(typeof s.name!=='string'||!s.name||/[:\\/]/.test(s.name)||previous!==null&&s.name<=previous||!/^\d+$/.test(s.length??'')||!/^\w{64}$/.test(s.sha256??'')||!/^[0-9a-f]+$/.test(s.sha256))throw new Error('Invalid named stream inventory');previous=s.name;}return {format:'ntfs-owner-dacl-ads-v1',ownerSid:o.ownerSid,groupSid:o.groupSid,sddl:o.sddl,attributes:o.attributes,namedStreams:o.namedStreams};});
 }else{
  observations=await Promise.all(entries.map(async e=>{const s=await fs.lstat(e.path,{bigint:true});return{format:'stat-only-v1',uid:String(s.uid),gid:String(s.gid),mode:String(s.mode),limitation:'ACLs, extended attributes and named streams were not inspected.'};}));
 }
 const output=new Map();
 for(let i=0;i<entries.length;i++){const e=entries[i],s=await fs.lstat(e.path,{bigint:true}),after=e.kind==='file'?identity(s):directoryIdentity(s);if(!(e.kind==='file'?sameIdentity(before[i],after):sameDirectory(before[i],after)))throw new Error('Metadata object changed during collection: '+e.path);if(action==='restoreArchive'&&!sameSecurity5(observations[i],e.expected))throw new Error('Original metadata mismatch: '+e.path);output.set(e.path,observations[i]);}
 return output;
}


const uuid5=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const names5=Object.keys(inventories.canonicalSafety4.files).sort();
function parents5(files){const dirs=new Set(['']);for(const f of files){let d=path.posix.dirname(f);while(d!=='.'){dirs.add(d);d=path.posix.dirname(d);}}return [...dirs].sort((a,b)=>a.length-b.length||a.localeCompare(b));}
const dirs5=parents5(names5);
const mapping5=tree=>Object.fromEntries((tree?.files??[]).map(f=>[f.relative,f.sha256]));
const body5=tree=>tree===null?null:{files:tree.files,directories:tree.directories};
function sameTree5(a,b){return stable5(body5(a))===stable5(body5(b));}
async function root5(raw){
 if(typeof raw!=='string'||!path.isAbsolute(raw))throw new Error('Declare absolute installation roots.');
 const p=path.resolve(raw),parsed=path.parse(p);let cursor=parsed.root;
 for(const part of p.slice(parsed.root.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if(!await exists(cursor))break;const s=await fs.lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('Unsafe linked installation ancestor: '+cursor);}
 return futureRoot(p);
}
async function tree5(root){
 if(!await exists(root))return null;
 const directories=[],files=[];
 async function walk(dir,relative){
  directories.push({relative,identity:await inspectDirectory(dir),security:null});
  for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const file=path.join(dir,entry.name),rel=relative?relative+'/'+entry.name:entry.name;
   if(entry.isSymbolicLink())throw new Error('Unsafe linked tree member: '+file);
   if(entry.isDirectory())await walk(file,rel);else{const observed=await inspect(file);files.push({relative:rel,...observed,security:null});}
  }
 }
 await walk(root,'');files.sort((a,b)=>a.relative.localeCompare(b.relative));directories.sort((a,b)=>a.relative.length-b.relative.length||a.relative.localeCompare(b.relative));
 return{root,files,directories};
}
async function file5(file){const current=await inspect(file);return{path:file,...current,security:null};}
function treeEntries5(tree){return tree?[...tree.directories.map(d=>({path:path.join(tree.root,d.relative),kind:'directory'})),...tree.files.map(f=>({path:path.join(tree.root,f.relative),kind:'file'}))]:[];}
function setTreeMetadata5(tree,metadata){if(!tree)return;for(const d of tree.directories)d.security=metadata.get(path.join(tree.root,d.relative));for(const f of tree.files)f.security=metadata.get(path.join(tree.root,f.relative));}
function treeShape5(tree,allowedFiles,allowedDirs){if(!tree)return;for(const f of tree.files)if(!allowedFiles.includes(f.relative))throw new Error('Existing skill has extra files; refuse automatic overwrite: '+f.relative);for(const d of tree.directories)if(!allowedDirs.includes(d.relative))throw new Error('Existing skill has extra or unrecognized directory: '+d.relative);}
function knownTree5(role,tree){
 const full=role==='agentCompat'?inventories.agentFull:legacyInventories;
 const thin=[inventories.currentThin[role],...(role==='legacyCompat'?[inventories.oldThin]:[])];
 const observed=mapping5(tree);let kind;
 if(full.some(m=>equalMapping(m,observed)))kind='full';else if(thin.some(m=>equalMapping(m,observed)))kind='thin';else throw new Error('Existing skill has extra files or unrecognized legacy content; refuse automatic migration.');
 const allowed=kind==='full'?parents5(Object.keys(observed)):[...new Set([...parents5(Object.keys(observed)),...full.flatMap(m=>parents5(Object.keys(m)))])];
 treeShape5(tree,Object.keys(observed),allowed);return kind;
}
async function binding5(p,overlay){
 const supplied=overlay?.bindings.find(b=>b.path===p);
 if(supplied){
  await assertDirectory(supplied.anchor.path,supplied.anchor.identity);
  const actual=await inspectDirectory(p);
  if(supplied.beforeIdentity){if(!sameDirectory(actual,supplied.beforeIdentity))throw new Error('Installation root identity changed: '+p);}
  else{
   let cursor=p;
   while(cursor!==supplied.anchor.path){if(await exists(cursor)){const id=overlay.created.get(cursor);if(!id||!sameDirectory(await inspectDirectory(cursor),id))throw new Error('New installation root appeared: '+cursor);}cursor=path.dirname(cursor);}
  }
  return structuredClone(supplied);
 }
 const beforeIdentity=await inspectDirectory(p);let ancestor=p;while(!await exists(ancestor))ancestor=path.dirname(ancestor);
 return{path:p,beforeIdentity,security:null,anchor:{path:ancestor,identity:await inspectDirectory(ancestor),security:null}};
}
function planBody5(plan){const{digest,summary,...body}=plan;return body;}
function validatePlan5(plan,sourceRequired=true){
 if(!plan||plan.schemaVersion!==1||plan.safetyVersion!==5||plan.canonicalOnly!==true||plan.product!==canonicalName||!uuid5.test(plan.transactionId??'')||typeof plan.replaceSkill!=='boolean'||typeof plan.migrateLegacy!=='boolean'||plan.digest!==hash(stable5(planBody5(plan))))throw new Error('Invalid canonical-only safety5 preview; obtain a fresh preview.');
 const profile=hostProfile(plan.host);
 if(![plan.source,plan.hostHome,plan.skillRoot].every(p=>typeof p==='string'&&path.isAbsolute(p))||sourceRequired&&plan.source!==skillSource||plan.instructionFile!==profile.instructionFile||plan.targetSkill!==path.join(plan.skillRoot,canonicalName)||(plan.host==='codex'?plan.codexHome!==plan.hostHome:Object.hasOwn(plan,'codexHome')))throw new Error('Installation host/source/root binding changed.');
 if(plan.backupDirectory!==path.join(plan.hostHome,'harness-install-backups',plan.transactionId)||plan.retirementParent!==path.join(path.dirname(plan.skillRoot),'.sciautoharness-rollback')||plan.retirementRoot!==path.join(plan.retirementParent,plan.transactionId)||inside(plan.skillRoot,plan.retirementParent)||inside(plan.source,plan.retirementParent))throw new Error('Invalid designated backup or retirement storage.');
 if(!Array.isArray(plan.changes)||!Array.isArray(plan.retirements)||plan.retirements.length>2||!Array.isArray(plan.directories)||!Array.isArray(plan.containers)||!plan.sourceSnapshot||stable5(plan.sourceSnapshot.files.map(f=>f.relative).sort())!==stable5(names5))throw new Error('Invalid source/target inventory binding.');
 const roles=new Set();
 for(const t of plan.retirements){const name=t.role==='agentCompat'?previousName:t.role==='legacyCompat'?legacyName:null;if(!name||roles.has(t.role)||t.name!==name||t.root!==path.join(plan.skillRoot,name)||t.vault!==path.join(plan.retirementRoot,name)||t.before?.root!==t.root||knownTree5(t.role,t.before)!==t.inventoryKind||t.inventoryDigest!==hash(stable5(mapping5(t.before))))throw new Error('Invalid retiring tree role/path/inventory.');roles.add(t.role);}
 if(stable5(plan.directories.map(d=>d.path))!==stable5(dirs5.map(d=>path.join(plan.targetSkill,d))))throw new Error('Invalid canonical directory journal.');
 const expectedBindings=[plan.hostHome,plan.skillRoot,path.dirname(plan.backupDirectory),...(plan.retirements.length?[plan.retirementParent]:[])];
 if(stable5(plan.containers.map(c=>c.path))!==stable5([...new Set(expectedBindings)]))throw new Error('Invalid installation container binding.');
 if(new Set(plan.changes.map(c=>process.platform==='win32'?c.target.toLowerCase():c.target)).size!==plan.changes.length)throw new Error('Duplicate installation target.');
 for(const c of plan.changes){if(c.role==='instructions'){if(c.target!==path.join(plan.hostHome,profile.instructionFile)||c.kind!=='append-rule')throw new Error('Instruction change outside fixed profile.');}else if(c.role!=='canonical'||!names5.includes(c.relative)||c.target!==path.join(plan.targetSkill,c.relative)||c.source!==path.join(plan.source,c.relative)||c.kind!==(c.before===null?'create-skill':'replace-skill'))throw new Error('Skill target conflicts with canonical-only role.');}
 return profile;
}
async function preview5({host='codex',hostHome,codexHome,skillRoot,replaceSkill=false,migrateLegacy=false,reviewedRule}={},internal={}){
 const profile=hostProfile(host);
 if(typeof replaceSkill!=='boolean'||typeof migrateLegacy!=='boolean')throw new Error('Installation options must be booleans.');
 if(codexHome!==undefined&&host!=='codex')throw new Error('--codex-home is a Codex-only home alias.');
 if(hostHome!==undefined&&codexHome!==undefined&&path.resolve(hostHome)!==path.resolve(codexHome))throw new Error('Conflicting host-home and codex-home values.');
 hostHome=await root5(hostHome??codexHome);skillRoot=await root5(skillRoot);
 const targetSkill=path.join(skillRoot,canonicalName),instructionPath=path.join(hostHome,profile.instructionFile),transactionId=internal.transactionId??randomUUID();
 if(!uuid5.test(transactionId))throw new Error('Invalid installation transaction identity.');
 for(const root of [targetSkill,path.join(skillRoot,previousName),path.join(skillRoot,legacyName)]){if(inside(skillSource,root)||inside(root,skillSource)||inside(root,hostHome)||inside(skillSource,hostHome))throw new Error('Installation source, targets and instruction home must not overlap.');}
 for(const name of profile.overrideFiles){const p=path.join(hostHome,name);if(await exists(p)&&(await fs.readFile(p,'utf8')).trim())throw new Error('Nearby instruction override requires review: '+name);}
 const sourceSnapshot=await tree5(skillSource);if(!sourceSnapshot||stable5(sourceSnapshot.files.map(f=>f.relative).sort())!==stable5(names5))throw new Error('Unexpected canonical source inventory.');treeShape5(sourceSnapshot,names5,dirs5);
 const canonicalBefore=await tree5(targetSkill);treeShape5(canonicalBefore,names5,dirs5);
 const instructionsBefore=await file5(instructionPath),configuration=host==='codex'?await file5(path.join(hostHome,'config.toml')):null;
 const oldBytes=instructionsBefore.identity?await fs.readFile(instructionPath):Buffer.alloc(0);
 if(reviewedRule&&(!reviewedRule.before||!reviewedRule.after||typeof reviewedRule.before!=='string'||typeof reviewedRule.after!=='string'||!reviewedRule.after.startsWith(start)||!reviewedRule.after.endsWith(end)||[...reviewedRule.after.matchAll(/<!--\s*(?:sciautoharness|(?:agent|codex)-task-harness)\s*:/g)].length!==2))throw new Error('Explicit reviewed canonical block requires exact before/after and one marker pair.');
 const rule=reviewedRule?reviewedRule.after+'\n':defaultRule(targetSkill,host);
 const oldRules=[defaultRule(path.join(skillRoot,previousName),host).replaceAll('<!-- sciautoharness:','<!-- agent-task-harness:'),legacyDefaultRule(path.join(skillRoot,legacyName),host)];
 const next=managedReplacement(oldBytes,rule,oldRules,reviewedRule);
 const retirementParent=path.join(path.dirname(skillRoot),'.sciautoharness-rollback'),retirementRoot=path.join(retirementParent,transactionId),backupDirectory=path.join(hostHome,'harness-install-backups',transactionId),retirements=[];
 if(await exists(backupDirectory)||await exists(retirementRoot))throw new Error('Designated installation transaction storage already exists.');
 for(const [role,name]of [['agentCompat',previousName],['legacyCompat',legacyName]]){
  const root=path.join(skillRoot,name),before=await tree5(root);if(!before)continue;
  const inventoryKind=knownTree5(role,before);
  if(!migrateLegacy||!replaceSkill)throw new Error('Existing legacy entry requires explicit --migrate-legacy and --replace-skill after review.');
  retirements.push({role,name,root,vault:path.join(retirementRoot,name),inventoryKind,inventoryDigest:hash(stable5(mapping5(before))),before});
 }
 const containerPaths=[...new Set([hostHome,skillRoot,path.dirname(backupDirectory),...(retirements.length?[retirementParent]:[])])],containers=[];
 for(const p of containerPaths)containers.push(await binding5(p,internal.overlay));
 for(const t of retirements){const b=containers.find(c=>c.path===retirementParent);if(b.anchor.identity.dev!==t.before.directories[0].identity.dev)throw new Error('Migration requires same-volume identity-preserving rollback storage.');}
 const targets=[...treeEntries5(sourceSnapshot),...treeEntries5(canonicalBefore),...retirements.flatMap(t=>treeEntries5(t.before)),...containers.flatMap(c=>[...(c.beforeIdentity?[{path:c.path,kind:'directory'}]:[]),{path:c.anchor.path,kind:'directory'}]),...(instructionsBefore.identity?[{path:instructionPath,kind:'file'}]:[]),...(configuration?.identity?[{path:configuration.path,kind:'file'}]:[])];
 const metadata=await metadata5(targets);for(const t of [sourceSnapshot,canonicalBefore,...retirements.map(t=>t.before)])setTreeMetadata5(t,metadata);
 for(const c of containers){c.security=c.beforeIdentity?metadata.get(c.path):null;c.anchor.security=metadata.get(c.anchor.path);}
 instructionsBefore.security=instructionsBefore.identity?metadata.get(instructionPath):null;if(configuration)configuration.security=configuration.identity?metadata.get(configuration.path):null;
 const changes=[];
 if(!next.equals(oldBytes))changes.push({role:'instructions',target:instructionPath,before:instructionsBefore.sha256,beforeIdentity:instructionsBefore.identity,beforeSecurity:instructionsBefore.security,after:hash(next),kind:'append-rule',bytes:next.toString('base64')});
 for(const f of sourceSnapshot.files){const before=canonicalBefore?.files.find(x=>x.relative===f.relative);if(before?.sha256===f.sha256)continue;if(before&&!replaceSkill)throw new Error('Different skill already exists; review replacement explicitly.');changes.push({role:'canonical',relative:f.relative,target:path.join(targetSkill,f.relative),source:path.join(skillSource,f.relative),sourceMode:Number(BigInt(f.identity.mode)&0o777n),before:before?.sha256??null,beforeIdentity:before?.identity??null,beforeSecurity:before?.security??null,after:f.sha256,kind:before?'replace-skill':'create-skill'});}
 const directories=dirs5.map(relative=>{const before=canonicalBefore?.directories.find(d=>d.relative===relative);return{path:path.join(targetSkill,relative),beforeIdentity:before?.identity??null,beforeSecurity:before?.security??null};});
 const contract={schemaVersion:1,safetyVersion:5,canonicalOnly:true,product:canonicalName,host,hostHome,instructionFile:profile.instructionFile,...(host==='codex'?{codexHome:hostHome}:{}),skillRoot,targetSkill,source:skillSource,transactionId,backupDirectory,retirementParent,retirementRoot,replaceSkill,migrateLegacy,...(reviewedRule?{reviewedRule}:{}),sourceSnapshot,canonicalBefore,instructionsBefore,configuration,containers,directories,retirements,changes};
 return{...contract,digest:hash(stable5(contract)),summary:{changedFiles:changes.length,retiredEntries:retirements.length,retiredFiles:retirements.reduce((n,t)=>n+t.before.files.length,0),configTomlChanged:false,dependenciesInstalled:false,modelCalled:false,legacyRufloDirectivesDetected:/npx\s+(?:claude-flow|ruflo)|mcp__claude-flow|swarm_init/i.test(decode(oldBytes)),legacyPolicy:'Original trees leave discovery by same-volume rename; stored tasks and original recovery formats remain supported.',agentsRule:rule,metadataCoverage:process.platform==='win32'?'Owner|Group|Access DACL, attributes, file/directory ADS; SACL/EAs not inspected.':'Stat-only; ACLs, EAs and named streams not inspected.'}};
}
export async function previewInstall(options={}){return preview5(options);}
async function createContainer5(binding,created){
 if(binding.beforeIdentity){await assertDirectory(binding.path,binding.beforeIdentity);return;}
 const segments=[];let p=binding.path;while(p!==binding.anchor.path){segments.unshift(p);p=path.dirname(p);}
 await assertDirectory(binding.anchor.path,binding.anchor.identity);
 for(const dir of segments){if(created.has(dir)){await assertDirectory(dir,created.get(dir));continue;}if(await exists(dir))throw new Error('New installation root appeared: '+dir);await fs.mkdir(dir);created.set(dir,await inspectDirectory(dir));}
}
async function snapshots5(plan,retired=false){
 const canonical=await tree5(plan.targetSkill),instructions=await file5(path.join(plan.hostHome,plan.instructionFile)),configuration=plan.configuration?await file5(plan.configuration.path):null;
 const trees=[];for(const t of plan.retirements)trees.push(await tree5(retired?t.vault:t.root));
 const source=await tree5(plan.source);
 const containerPaths=plan.containers.flatMap(c=>[c.path,c.anchor.path]),storagePaths=[path.dirname(plan.backupDirectory),plan.backupDirectory,...(plan.retirements.length?[plan.retirementParent,plan.retirementRoot]:[])];
 const paths=[...new Set([...containerPaths,...storagePaths])],containers=[];
 for(const p of paths){const id=await inspectDirectory(p);if(id)containers.push({path:p,identity:id,security:null});}
 const backups=[];for(const [i,c]of plan.changes.entries())if(c.before)backups.push(await file5(path.join(plan.backupDirectory,i+'.bin')));
 const planFile=await file5(path.join(plan.backupDirectory,'plan.json'));
 const metadata=await metadata5([...treeEntries5(source),...treeEntries5(canonical),...trees.flatMap(treeEntries5),...containers.map(c=>({path:c.path,kind:'directory'})),...backups.map(b=>({path:b.path,kind:'file'})),{path:planFile.path,kind:'file'},...(instructions.identity?[{path:instructions.path,kind:'file'}]:[]),...(configuration?.identity?[{path:configuration.path,kind:'file'}]:[])]);
 for(const t of [source,canonical,...trees])setTreeMetadata5(t,metadata);for(const c of containers)c.security=metadata.get(c.path);
 instructions.security=instructions.identity?metadata.get(instructions.path):null;if(configuration)configuration.security=configuration.identity?metadata.get(configuration.path):null;
 for(const b of [...backups,planFile])b.security=metadata.get(b.path);
 return{source,canonical,instructions,configuration,trees,containers,backups,planFile};
}
export async function applyInstall(plan){
 validatePlan5(plan);const created=new Map();let stage='prepare-containers',target=null,record,manifest=path.join(plan.backupDirectory,'rollback.json');
 try{
  const unlocked=await preview5(plan,{transactionId:plan.transactionId});if(unlocked.digest!==plan.digest)throw new Error('Installation source or target changed after preview. Review a fresh preview.');
  for(const p of [plan.hostHome,plan.skillRoot]){const b=plan.containers.find(c=>c.path===p);target=p;await createContainer5(b,created);}
  return await lockedRoots([plan.hostHome,plan.skillRoot],async()=>{
   stage='locked-preflight';target=null;
   const current=await preview5(plan,{transactionId:plan.transactionId,overlay:{bindings:plan.containers,created}});
   if(current.digest!==plan.digest)throw new Error('Installation source or target changed after preview. Review a fresh preview.');
   if(!current.changes.length&&!current.retirements.length)return{status:'already-installed',changedFiles:0,retiredEntries:0};
   const changes=current.changes.map((c,i)=>({...c,backup:c.before?path.join(current.backupDirectory,i+'.bin'):null,backupSaved:false,written:false,afterIdentity:null}));
   record={schemaVersion:1,safetyVersion:5,canonicalOnly:true,product:canonicalName,status:'prepared',host:current.host,hostHome:current.hostHome,instructionFile:current.instructionFile,...(current.host==='codex'?{codexHome:current.hostHome}:{}),skillRoot:current.skillRoot,targetSkill:current.targetSkill,source:current.source,transactionId:current.transactionId,planDigest:current.digest,planFile:null,retirementParent:current.retirementParent,retirementRoot:current.retirementRoot,sourceSnapshot:current.sourceSnapshot,canonicalBefore:current.canonicalBefore,instructionsBefore:current.instructionsBefore,configuration:current.configuration,containersBefore:current.containers,containersAfter:[],directories:current.directories.map(d=>({...d,created:false,afterIdentity:d.beforeIdentity,afterSecurity:d.beforeSecurity})),retirements:current.retirements.map(t=>({...t,relocated:false})),changes,completedTargets:0,completedRetirements:0,canonicalAfter:null,instructionsAfter:null,createdContainers:[...created].map(([p,id])=>({path:p,identity:id}))};
   stage='prepare-storage';target=current.backupDirectory;await fs.mkdir(current.backupDirectory,{recursive:true});await inspectDirectory(current.backupDirectory);
   const planFile=path.join(current.backupDirectory,'plan.json');await fs.writeFile(planFile,Buffer.from(JSON.stringify(current,null,2)+'\n'),{flag:'wx'});record.planFile={path:planFile,...await inspect(planFile)};
   const persist=async()=>{record.bindingDigest=manifestBinding(record);try{await writeJson(manifest,record);}catch(e){throw Object.assign(e,{journalFailure:{stage,operationTarget:target,manifest}});}};
   stage='prepared-manifest';target=manifest;await persist();
   if(current.retirements.length){stage='prepare-retirement';target=current.retirementParent;await fs.mkdir(current.retirementParent,{recursive:true});await inspectDirectory(current.retirementParent);target=current.retirementRoot;await fs.mkdir(current.retirementRoot);await inspectDirectory(current.retirementRoot);}
   stage='backup';
   for(const c of changes){if(!c.backup)continue;target=c.target;await assertExpectedTarget(c.target,c.beforeIdentity,c.before);const bytes=await fs.readFile(c.target);if(hash(bytes)!==c.before)throw new Error('Backup input changed');target=c.backup;await fs.writeFile(c.backup,bytes,{flag:'wx'});c.backupSaved=true;await persist();}
   stage='prepare-target-directories';
   for(const d of record.directories){target=d.path;await assertDirectory(d.path,d.beforeIdentity);if(!d.beforeIdentity){await fs.mkdir(d.path);d.afterIdentity=await inspectDirectory(d.path);d.created=true;await persist();}}
   stage='retire-trees';
   for(const t of record.retirements){target=t.root;const before=await tree5(t.root);if(stable5(body5(before))!==stable5(body5({...t.before,files:t.before.files.map(f=>({...f,security:null})),directories:t.before.directories.map(d=>({...d,security:null}))})))throw new Error('Original tree identity/content changed before retirement.');if(await exists(t.vault))throw new Error('Retirement target appeared');await fs.rename(t.root,t.vault);t.relocated=true;record.completedRetirements++;await persist();}
   stage='write-targets';
   for(const c of changes){target=c.target;if(c.source){const original=current.sourceSnapshot.files.find(f=>f.relative===c.relative);await assertTarget(c.source,original.identity,c.after);}const bytes=c.source?await fs.readFile(c.source):Buffer.from(c.bytes,'base64');if(hash(bytes)!==c.after)throw new Error('Installation source changed');c.afterIdentity=await writeTarget(c,bytes,c.beforeIdentity,c.before);c.written=true;record.completedTargets++;await persist();}
   stage='restore-archive-attributes';
   await metadata5(changes.filter(c=>c.beforeIdentity).map(c=>({path:c.target,kind:'file',expected:c.beforeSecurity})),'restoreArchive');
   stage='verify-installed';const after=await snapshots5(current,true);
   for(const c of current.containers){for(const b of [...(c.beforeIdentity?[{path:c.path,identity:c.beforeIdentity,security:c.security}]:[]),c.anchor]){const observed=after.containers.find(x=>x.path===b.path);if(!observed||!sameDirectory(observed.identity,b.identity)||!sameSecurity5(observed.security,b.security))throw new Error('Original container/anchor identity or metadata changed: '+b.path);}}
   if(!sameTree5(after.source,current.sourceSnapshot)||stable5(after.configuration)!==stable5(current.configuration))throw new Error('Source or configuration changed during installation.');
   for(let i=0;i<record.retirements.length;i++){const t=record.retirements[i];if(await exists(t.root)||!sameTree5(after.trees[i],t.before))throw new Error('Retired original tree identity/metadata changed.');}
   for(const f of current.canonicalBefore?.files??[]){const now=after.canonical.files.find(x=>x.relative===f.relative);if(!now||!sameIdentity(now.identity,f.identity)||!sameSecurity5(now.security,f.security))throw new Error('Original canonical file metadata/identity changed.');}
   for(const d of current.canonicalBefore?.directories??[]){const now=after.canonical.directories.find(x=>x.relative===d.relative);if(!now||!sameDirectory(now.identity,d.identity)||!sameSecurity5(now.security,d.security))throw new Error('Original canonical directory metadata/identity changed.');}
   if(current.instructionsBefore.identity&&(!sameIdentity(after.instructions.identity,current.instructionsBefore.identity)||!sameSecurity5(after.instructions.security,current.instructionsBefore.security)))throw new Error('Original instruction identity/metadata changed.');
   if(!equalMapping(mapping5(after.canonical),mapping5(current.sourceSnapshot)))throw new Error('Installed canonical inventory differs from source.');
   record.canonicalAfter=after.canonical;record.instructionsAfter=after.instructions;record.containersAfter=after.containers;record.planFile=after.planFile;for(const c of record.changes)if(c.backup)c.backupSnapshot=after.backups.find(b=>b.path===c.backup);
   for(const d of record.directories){const observed=after.canonical.directories.find(x=>path.join(current.targetSkill,x.relative)===d.path);d.afterIdentity=observed.identity;d.afterSecurity=observed.security;}
   stage='installed-manifest';target=manifest;record.status='installed';await persist();
   return{status:'installed',changedFiles:changes.length,retiredEntries:record.retirements.length,retiredFiles:record.retirements.reduce((n,t)=>n+t.before.files.length,0),rollbackManifest:manifest,next:`Start a new ${profileLabel5(current.host)} session; use the canonical skill only.`};
  });
 }catch(error){failWithRecovery5(error,e=>{const actualStage=e?.journalFailure?'progress-journal':stage,actualTarget=e?.journalFailure?manifest:target;return Object.assign(new Error(`${e?.message??String(e)}. Install ${actualStage}. Failed target: ${actualTarget??'preflight'}. Inspect recovery manifest ${manifest}; operations may be partial and no automatic rollback was attempted.`,{cause:e}),{recovery:{operation:'install',stage:actualStage,failedTarget:actualTarget,completedTargets:record?.completedTargets??0,completedRetirements:record?.completedRetirements??0,manifest,backupDirectory:plan.backupDirectory,retirementRoot:plan.retirementRoot,createdContainers:[...created].map(([p,id])=>({path:p,identity:id})),journalFailure:e?.journalFailure,metadataFacts:e?.metadataFacts,metadataProcess:e?.metadataProcess}});});}
}
function profileLabel5(host){return hostProfile(host).label;}


function equalFile5(a,b){return stable5(a)===stable5(b);}
async function rollbackSnapshots5(plan,retired){
 const canonical=await tree5(plan.targetSkill),instructions=await file5(path.join(plan.hostHome,plan.instructionFile)),configuration=plan.configuration?await file5(plan.configuration.path):null;
 const trees=[];for(const t of plan.retirements)trees.push(await tree5(retired?t.vault:t.root));
 const metadata=await metadata5([...treeEntries5(canonical),...trees.flatMap(treeEntries5),...(instructions.identity?[{path:instructions.path,kind:'file'}]:[]),...(configuration?.identity?[{path:configuration.path,kind:'file'}]:[])]);
 for(const t of [canonical,...trees])setTreeMetadata5(t,metadata);instructions.security=instructions.identity?metadata.get(instructions.path):null;if(configuration)configuration.security=configuration.identity?metadata.get(configuration.path):null;
 return{canonical,instructions,configuration,trees};
}
async function rollbackSafety5Install(manifest,record){
 let stage='manifest-preflight',target=manifest,sourcePath=null,completedTargets=0,completedRetirements=0;
 try{
  if(record.status!=='installed'||record.schemaVersion!==1||record.safetyVersion!==5||record.canonicalOnly!==true||record.product!==canonicalName||record.bindingDigest!==manifestBinding(record)||!uuid5.test(record.transactionId??''))throw new Error('Rollback requires a completed, unmodified canonical-only safety5 manifest.');
  const manifestSnapshot=await inspect(manifest);if(stable5(await json(manifest))!==stable5(record))throw new Error('Installation manifest changed before preflight.');
  const manifestSecurity=(await metadata5([{path:manifest,kind:'file'}])).get(manifest);
  const backupDirectory=path.join(record.hostHome,'harness-install-backups',record.transactionId);
  if(manifest!==path.join(backupDirectory,'rollback.json')||record.planFile?.path!==path.join(backupDirectory,'plan.json'))throw new Error('Rollback manifest/plan storage is outside fixed installation backup.');
  for(const p of [record.hostHome,record.skillRoot,backupDirectory,record.retirementParent])await root5(p);
  await assertTarget(record.planFile.path,record.planFile.identity,record.planFile.sha256);
  const plan=await json(record.planFile.path);validatePlan5(plan,false);
  if(plan.digest!==record.planDigest||plan.backupDirectory!==backupDirectory)throw new Error('Original reviewed plan differs from manifest.');
  for(const key of ['schemaVersion','safetyVersion','canonicalOnly','product','host','hostHome','instructionFile','codexHome','skillRoot','targetSkill','source','transactionId','retirementParent','retirementRoot','sourceSnapshot','canonicalBefore','instructionsBefore','configuration'])if(stable5(record[key])!==stable5(plan[key]))throw new Error('Rollback manifest conflicts with original plan: '+key);
  if(stable5(record.containersBefore)!==stable5(plan.containers)||record.changes?.length!==plan.changes.length||record.retirements?.length!==plan.retirements.length||record.directories?.length!==plan.directories.length||record.completedTargets!==plan.changes.length||record.completedRetirements!==plan.retirements.length)throw new Error('Incomplete installation journal.');
  if(!record.canonicalAfter||!equalMapping(mapping5(record.canonicalAfter),mapping5(plan.sourceSnapshot))||stable5(record.canonicalAfter.directories.map(d=>d.relative))!==stable5(dirs5))throw new Error('Installed inventory is not the complete canonical source.');
  for(const f of plan.canonicalBefore?.files??[]){const after=record.canonicalAfter.files.find(x=>x.relative===f.relative);if(!after||!sameIdentity(after.identity,f.identity)||!sameSecurity5(after.security,f.security))throw new Error('Original canonical file identity/security cannot be rebound.');}
  for(const d of plan.canonicalBefore?.directories??[]){const after=record.canonicalAfter.directories.find(x=>x.relative===d.relative);if(!after||!sameDirectory(after.identity,d.identity)||!sameSecurity5(after.security,d.security))throw new Error('Original canonical directory identity/security cannot be rebound.');}
  if(plan.instructionsBefore.identity&&(!sameIdentity(record.instructionsAfter?.identity,plan.instructionsBefore.identity)||!sameSecurity5(record.instructionsAfter?.security,plan.instructionsBefore.security)))throw new Error('Original instruction identity/security cannot be rebound.');
  for(const c of plan.containers)for(const original of [...(c.beforeIdentity?[{path:c.path,identity:c.beforeIdentity,security:c.security}]:[]),c.anchor]){const after=record.containersAfter.find(x=>x.path===original.path);if(!after||!sameDirectory(after.identity,original.identity)||!sameSecurity5(after.security,original.security))throw new Error('Original container/anchor identity/security cannot be rebound.');}
  for(let i=0;i<plan.changes.length;i++){
   const c=record.changes[i],original=plan.changes[i];for(const key of Object.keys(original))if(stable5(c[key])!==stable5(original[key]))throw new Error('Rollback change differs from original plan.');
   if(!c.written||!c.afterIdentity||c.backup!==(c.before?path.join(backupDirectory,i+'.bin'):null)||c.backupSaved!==!!c.before)throw new Error('Invalid backup/write progress.');
   const after=c.role==='instructions'?record.instructionsAfter:record.canonicalAfter.files.find(f=>f.relative===c.relative);if(after?.sha256!==c.after||!sameIdentity(after.identity,c.afterIdentity))throw new Error('Installed change is disconnected from final snapshot.');
  }
  for(let i=0;i<plan.retirements.length;i++){const t=record.retirements[i];for(const key of Object.keys(plan.retirements[i]))if(stable5(t[key])!==stable5(plan.retirements[i][key]))throw new Error('Rollback retirement differs from original plan.');if(t.relocated!==true)throw new Error('Unconfirmed original-tree retirement.');}
  for(let i=0;i<plan.directories.length;i++){const d=record.directories[i],original=plan.directories[i];for(const key of Object.keys(original))if(stable5(d[key])!==stable5(original[key]))throw new Error('Rollback directory differs from original plan.');const after=record.canonicalAfter.directories.find(x=>path.join(plan.targetSkill,x.relative)===d.path);if(d.created!==(d.beforeIdentity===null)||!after||!sameDirectory(d.afterIdentity,after.identity)||!sameSecurity5(d.afterSecurity,after.security))throw new Error('Invalid canonical directory progress.');}
  const expectedContainers=[...new Set([...plan.containers.flatMap(c=>[c.path,c.anchor.path]),path.dirname(backupDirectory),backupDirectory,...(plan.retirements.length?[plan.retirementParent,plan.retirementRoot]:[])])];
  if(stable5(record.containersAfter.map(c=>c.path))!==stable5(expectedContainers))throw new Error('Invalid installation storage identity journal.');
  return await lockedRoots([plan.hostHome,plan.skillRoot],async()=>{
   stage='locked-preflight';target=null;
   await assertTarget(manifest,manifestSnapshot.identity,manifestSnapshot.sha256);
   await assertTarget(record.planFile.path,record.planFile.identity,record.planFile.sha256);
   for(const c of record.containersAfter){await root5(c.path);await assertDirectory(c.path,c.identity);}
   const metadata=await metadata5([...record.containersAfter.map(c=>({path:c.path,kind:'directory'})),{path:manifest,kind:'file'},{path:record.planFile.path,kind:'file'},...record.changes.filter(c=>c.backup).map(c=>({path:c.backup,kind:'file'}))]);for(const c of record.containersAfter)if(!sameSecurity5(metadata.get(c.path),c.security))throw new Error('Installation container security/streams changed: '+c.path);if(!sameSecurity5(metadata.get(record.planFile.path),record.planFile.security))throw new Error('Reviewed plan metadata changed.');if(!sameSecurity5(metadata.get(manifest),manifestSecurity))throw new Error('Installation manifest security/streams changed during preflight.');
   const current=await rollbackSnapshots5(plan,true);
   if(!sameTree5(current.canonical,record.canonicalAfter)||!equalFile5(current.instructions,record.instructionsAfter)||!equalFile5(current.configuration,plan.configuration))throw new Error('Installed target/configuration identity/content/metadata changed; refuse rollback.');
   for(let i=0;i<record.retirements.length;i++){const t=record.retirements[i];if(await exists(t.root)||!sameTree5(current.trees[i],t.before))throw new Error('Original retired tree changed or original root reappeared; refuse rollback.');}
   const prepared=[];for(const c of record.changes){target=c.target;sourcePath=c.backup;await assertTarget(c.target,c.afterIdentity,c.after);let bytes=null;if(c.backup){const st=await file5(c.backup);st.security=metadata.get(c.backup);if(st.sha256!==c.before||!equalFile5(st,c.backupSnapshot))throw new Error('Backup content/identity/metadata changed; refuse rollback.');bytes=await fs.readFile(c.backup);if(hash(bytes)!==c.before)throw new Error('Backup input changed; refuse rollback.');}prepared.push({change:c,bytes});}sourcePath=null;
   const persist=async()=>{record.bindingDigest=manifestBinding(record);await writeJson(manifest,record);};
   stage='rollback-prepared';target=manifest;record.status='rollback-prepared';record.rollbackProgress={completedTargets:0,completedRetirements:0,removedDirectories:[]};await persist();
   stage='restore-targets';for(const {change:c,bytes}of prepared){target=c.target;await assertTarget(c.target,c.afterIdentity,c.after);if(c.beforeIdentity)await writeTarget(c,bytes,c.afterIdentity,c.after);else await fs.unlink(c.target);completedTargets++;record.rollbackProgress.completedTargets=completedTargets;await persist();}
   stage='restore-trees';for(const t of record.retirements){target=t.root;if(await exists(t.root))throw new Error('Original root reappeared');const actual=await tree5(t.vault);const original={...t.before,files:t.before.files.map(f=>({...f,security:null})),directories:t.before.directories.map(d=>({...d,security:null}))};if(!sameTree5(actual,original))throw new Error('Retired original identity/content changed before return.');await fs.rename(t.vault,t.root);completedRetirements++;record.rollbackProgress.completedRetirements=completedRetirements;await persist();}
   stage='remove-created-directories';for(const d of [...record.directories].reverse()){if(!d.created)continue;target=d.path;await assertDirectory(d.path,d.afterIdentity);await fs.rmdir(d.path);record.rollbackProgress.removedDirectories.push(d.path);await persist();}
   stage='restore-archive-attributes';await metadata5(record.changes.filter(c=>c.beforeIdentity).map(c=>({path:c.target,kind:'file',expected:c.beforeSecurity})),'restoreArchive');
   stage='verify-restored';const after=await rollbackSnapshots5(plan,false);
   if(!sameTree5(after.canonical,plan.canonicalBefore)||!equalFile5(after.instructions,plan.instructionsBefore)||!equalFile5(after.configuration,plan.configuration))throw new Error('Restored original canonical/instruction/configuration differs.');
   for(let i=0;i<record.retirements.length;i++)if(await exists(record.retirements[i].vault)||!sameTree5(after.trees[i],record.retirements[i].before))throw new Error('Restored original tree identity/metadata differs.');
   const containerMetadata=await metadata5(record.containersAfter.map(c=>({path:c.path,kind:'directory'})));for(const c of record.containersAfter){await assertDirectory(c.path,c.identity);if(!sameSecurity5(containerMetadata.get(c.path),c.security))throw new Error('Container/anchor metadata changed during restoration: '+c.path);}
   stage='rolled-back-manifest';target=manifest;record.status='rolled-back';await persist();return{status:'rolled-back',restoredFiles:completedTargets,backupPreserved:path.dirname(manifest),retirementRoot:plan.retirements.length?plan.retirementRoot:null,restoredRetirements:completedRetirements,rollbackManifest:manifest};
  });
 }catch(error){failWithRecovery5(error,e=>Object.assign(new Error(`${e?.message??String(e)}. Rollback ${stage}. Failed target: ${target??'preflight'}. No automatic retry or rollback of a partial restoration was attempted.`,{cause:e}),{recovery:{operation:'rollback',stage,failedTarget:target,source:sourcePath,completedTargets,totalTargets:record.changes?.length??0,completedRetirements,manifest,backupDirectory:path.dirname(manifest),retirementRoot:record.retirementRoot,metadataFacts:e?.metadataFacts,metadataProcess:e?.metadataProcess}}));}
}

function manifestBinding(record){const{bindingDigest,status,...bound}=record;return hash(JSON.stringify(bound));}

export async function rollbackInstall(manifest){
 manifest=path.resolve(manifest);
 const record=await json(manifest);
 if(record.safetyVersion===5)return rollbackSafety5Install(manifest,record);
 if(Object.hasOwn(record,'canonicalOnly')||Object.hasOwn(record,'transactionId')||Object.hasOwn(record,'planDigest'))throw new Error('Safety5 fields cannot be downgraded to an older format.');
 if(record.safetyVersion===4)return rollbackSafety4Install(manifest);
 if([1,2,3].includes(record.safetyVersion)){
  if(Object.hasOwn(record,'agentCompat')||record.migration?.sources)throw new Error('Safety4 fields cannot be downgraded to a legacy format.');
  return record.safetyVersion===3?rollbackSafety3Install(manifest):rollbackLegacyInstall(manifest);
 }
 throw new Error('Only a completed safety-bound installation can be rolled back; unknown format.');
}
async function rollbackSafety4Install(manifest){
 const record=await json(manifest);if(record.safetyVersion!==4)throw new Error('Invalid safety4 format binding.');
 const profile=hostProfile(record.host),home=record.hostHome,root=record.skillRoot,backupDir=path.dirname(path.resolve(manifest));
 if(record.schemaVersion!==1||record.status!=='installed'||record.product!==canonicalName||record.bindingDigest!==manifestBinding(record)||record.instructionFile!==profile.instructionFile||(record.host==='codex'?record.codexHome!==home:Object.hasOwn(record,'codexHome'))||!Array.isArray(record.changes)||!record.changes.every(c=>'afterIdentity'in c&&'beforeIdentity'in c))throw new Error('Only a completed safety-bound installation can be rolled back; host/profile/home binding changed.');
 if(![home,root,record.targetSkill,record.agentCompat,record.legacyCompat].every(x=>typeof x==='string'&&path.isAbsolute(x))||record.targetSkill!==path.join(root,canonicalName)||record.agentCompat!==path.join(root,previousName)||record.legacyCompat!==path.join(root,legacyName)||!inside(path.join(home,'harness-install-backups'),backupDir))throw new Error('Invalid declared installation roots or backup manifest.');
 if(!['none','legacy-full-to-compatibility'].includes(record.migration?.mode)||!Array.isArray(record.migration.sources)||((record.migration.mode==='none')!==(record.migration.sources.length===0)))throw new Error('Invalid migration binding.');
 const retirementParent=path.join(path.dirname(root),'.sciautoharness-rollback');
 if(record.migration.mode==='none'?record.retirementRoot!==null:typeof record.retirementRoot!=='string'||path.dirname(record.retirementRoot)!==retirementParent||path.basename(record.retirementRoot)!==path.basename(backupDir)||inside(root,record.retirementRoot))throw new Error('Invalid identity-preserving rollback storage binding.');
 return lockedRoots([home,root],async()=>{
  let target=null,stage='preflight',completedTargets=0;
  try{
   if(record.retirementRoot){target=record.retirementRoot;if(await fs.realpath(retirementParent)!==retirementParent||await fs.realpath(record.retirementRoot)!==record.retirementRoot)throw new Error('Rollback storage real path changed.');}
   await assertInstallationRoots(record);
   if(!Array.isArray(record.directories))throw new Error('Missing safety4 directory journal.');
   const expectedDirectories=directoryTargets(record.changes,{canonical:record.targetSkill,agentCompat:record.agentCompat,legacyCompat:record.legacyCompat});
   if(JSON.stringify(record.directories.map(d=>d.path))!==JSON.stringify(expectedDirectories))throw new Error('Directory role/path journal binding changed.');
   for(const d of record.directories){
    if(d.created!==(d.beforeIdentity===null)||!d.afterIdentity||(!d.created&&!sameDirectory(d.beforeIdentity,d.afterIdentity)))throw new Error('Invalid created directory identity binding.');
    await assertDirectory(d.path,d.afterIdentity);
   }
   const sourceRoles=new Set();
   for(const source of record.migration.sources){
    if(!['agentCompat','legacyCompat'].includes(source.role)||sourceRoles.has(source.role)||source.root!==record[source.role]||!Array.isArray(source.members))throw new Error('Invalid migration source role/root binding.');
    sourceRoles.add(source.role);
    const mapping=Object.fromEntries(source.members.map(m=>[m.relative,m.sha256]));
    if(!knownFull(source.role,mapping)||source.members.length!==Object.keys(mapping).length||source.inventoryDigest!==hash(JSON.stringify(mapping)))throw new Error('Invalid migration source inventory binding.');
    for(const m of source.members){
     const target=path.join(source.root,m.relative),change=record.changes.find(c=>c.target===target);
     if(change){if(!change.retire||change.before!==m.sha256||!sameIdentity(change.beforeIdentity,m.identity))throw new Error('Migration original identity binding changed.');}
     else await assertExpectedTarget(target,m.identity,m.sha256);
    }
   }
   if(record.migration.inventoryDigest!==(record.migration.sources.length?hash(JSON.stringify(record.migration.sources.map(s=>s.inventoryDigest))):null))throw new Error('Migration inventory digest changed.');
   const targets=new Set(),identities=new Set();
   for(const[cIndex,c]of record.changes.entries()){
    target=c.target;const normalized=path.resolve(c.target),key=process.platform==='win32'?normalized.toLowerCase():normalized;
    const physical=c.afterIdentity?`${c.afterIdentity.dev}:${c.afterIdentity.ino}`:null;if(targets.has(key)||(physical&&identities.has(physical)))throw new Error('Duplicate rollback target identity.');targets.add(key);if(physical)identities.add(physical);
    const role=c.target===path.join(home,record.instructionFile)?'instructions':inside(record.targetSkill,c.target)&&c.target!==record.targetSkill?'canonical':inside(record.agentCompat,c.target)&&c.target!==record.agentCompat?'agentCompat':inside(record.legacyCompat,c.target)&&c.target!==record.legacyCompat?'legacyCompat':null;
    const expectedKind=role==='instructions'?'append-rule':c.after===null?'retire-legacy':c.before===null?'create-skill':'replace-skill';
    if(c.kind!==expectedKind||!role||role!==c.role||!['append-rule','create-skill','replace-skill','retire-legacy'].includes(c.kind)||(c.kind==='append-rule')!==(role==='instructions')||(c.kind==='retire-legacy')!==(c.after===null)||(c.kind==='retire-legacy'&&!c.retire)||(c.retire&&(!c.beforeIdentity||typeof c.before!=='string'))||!!c.retire&&(!['agentCompat','legacyCompat'].includes(role)||!record.migration.sources.some(s=>s.role===role)))throw new Error('Rollback target conflicts with its fixed profile role; outside installation.');
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
   stage='cleanup-directories';
   for(const d of record.directories.filter(d=>d.created).sort((a,b)=>b.path.length-a.path.length)){
    target=d.path;await assertDirectory(d.path,d.afterIdentity);
    await fs.rmdir(d.path).catch(e=>{if(!['ENOTEMPTY','ENOENT'].includes(e.code))throw e;});
   }
   stage='manifest';target=manifest;record.status='rolled-back';await writeJson(manifest,record);
   return{status:'rolled-back',restoredFiles:record.changes.length,backupPreserved:backupDir,rollbackManifest:path.resolve(manifest),retirementRoot:record.retirementRoot};
  }catch(e){throw Object.assign(new Error(`${e.message}. Rollback ${stage} failed at ${target??'preflight'}; ${completedTargets}/${record.changes.length} target operations returned successfully. Inspect manifest ${manifest} and backup directory ${backupDir}. Changes may be partial; do not automatically retry.`,{cause:e}),{recovery:{operation:'rollback',stage,failedTarget:target,completedTargets,totalTargets:record.changes.length,manifest,backupDirectory:backupDir,retirementRoot:record.retirementRoot}});}
 });
}

async function rollbackSafety3Install(manifest){
 const record=await json(manifest);if(record.safetyVersion!==3||Object.hasOwn(record,'agentCompat')||record.migration?.sources)throw new Error('Invalid original safety3 format binding.');
 const profile=hostProfile(record.host),home=record.hostHome,root=record.skillRoot,backupDir=path.dirname(path.resolve(manifest));
 if(record.schemaVersion!==1||record.status!=='installed'||record.product!=='agent-task-harness'||record.bindingDigest!==manifestBinding(record)||record.instructionFile!==profile.instructionFile||(record.host==='codex'?record.codexHome!==home:Object.hasOwn(record,'codexHome'))||!Array.isArray(record.changes)||!record.changes.every(c=>'afterIdentity'in c&&'beforeIdentity'in c))throw new Error('Only a completed safety-bound installation can be rolled back; host/profile/home binding changed.');
 if(![home,root,record.targetSkill,record.legacyCompat].every(x=>typeof x==='string'&&path.isAbsolute(x))||record.targetSkill!==path.join(root,'agent-task-harness')||record.legacyCompat!==path.join(root,legacyName)||!inside(path.join(home,'harness-install-backups'),backupDir))throw new Error('Invalid declared installation roots or backup manifest.');
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
