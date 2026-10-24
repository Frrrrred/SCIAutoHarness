import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {StringDecoder} from 'node:string_decoder';
import {exists} from './files.mjs';
import {templateVersion} from './templates.mjs';
import {resolveCodex} from './process.mjs';

export const HOST_IDS=Object.freeze(['codex','claude-code','deepseek-harness']);
const profiles=Object.freeze({
 'codex':Object.freeze({id:'codex',label:'Codex',binary:'codex',package:'@openai/codex',instructionFile:'AGENTS.md',overrideFiles:['AGENTS.override.md'],homeVariable:'CODEX_HOME',homeDirectory:'.codex',runArgs:['exec','--sandbox','workspace-write','-c','approval_policy="on-request"','--skip-git-repo-check','--json','-'],helpArgs:['exec','--help']}),
 'claude-code':Object.freeze({id:'claude-code',label:'Claude Code',binary:'claude',package:'@anthropic-ai/claude-code',instructionFile:'CLAUDE.md',overrideFiles:['CLAUDE.local.md'],homeVariable:'CLAUDE_CONFIG_DIR',homeDirectory:'.claude',runArgs:['-p'],helpArgs:['--help']}),
 'deepseek-harness':Object.freeze({id:'deepseek-harness',label:'DeepSeek Harness',binary:'dsh',package:'@deepseek-ai/dsh',instructionFile:'AGENTS.md',overrideFiles:['AGENTS.local.md'],homeVariable:'DSH_HOME',homeDirectory:'.dsh',runArgs:['--profile','headless','--json','-'],helpArgs:['--profile','headless','--help']})
});
for(const profile of Object.values(profiles))for(const key of ['runArgs','helpArgs','overrideFiles'])Object.freeze(profile[key]);
export function hostProfile(host){
 if(typeof host!=='string'||!HOST_IDS.includes(host))throw new Error('Unknown host; use codex, claude-code or deepseek-harness.');
 return profiles[host];
}
export function executionPolicy(contract){
 if(templateVersion(contract)!==4)return {allowedHosts:['codex'],defaultHost:'codex'};
 const policy=contract.execution;
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||!Array.isArray(policy.allowedHosts)||!policy.allowedHosts.length||new Set(policy.allowedHosts).size!==policy.allowedHosts.length)throw new Error('Template4 requires execution.allowedHosts to be a nonempty unique host array.');
 for(const host of policy.allowedHosts)hostProfile(host);
 hostProfile(policy.defaultHost);
 if(!policy.allowedHosts.includes(policy.defaultHost))throw new Error('execution.defaultHost must be a member of execution.allowedHosts.');
 return {allowedHosts:[...policy.allowedHosts],defaultHost:policy.defaultHost};
}
export function selectHost(contract,requested){
 const policy=executionPolicy(contract),host=requested??policy.defaultHost;hostProfile(host);
 if(!policy.allowedHosts.includes(host))throw new Error(`Host ${host} is not allowed by the reviewed execution policy. Preserve old runs; obtain a revised review before enabling another host.`);
 return host;
}
export function draftPolicy({host='codex',allowHosts=[]}={}){
 hostProfile(host);
 if(!Array.isArray(allowHosts))throw new Error('allowHosts must be an array.');
 for(const value of allowHosts)hostProfile(value);
 return {allowedHosts:[...new Set([host,...allowHosts])],defaultHost:host};
}
export function executorFor(host,mode='native'){
 hostProfile(host);if(!['native','cli'].includes(mode))throw new Error('Execution mode must be native or cli.');
 return host+'-'+mode;
}
export function executorProfile(executor){
 for(const host of HOST_IDS)for(const mode of ['native','cli'])if(executor===executorFor(host,mode))return {host,mode};
 throw new Error('Receipt needs one of the six declared host executors.');
}
export function executionBinding(host,mode='native'){
 return {version:1,host,mode,executor:executorFor(host,mode)};
}
export function validateExecutionBinding(binding){
 if(!binding||typeof binding!=='object'||Array.isArray(binding)||binding.version!==1||!HOST_IDS.includes(binding.host)||!['native','cli'].includes(binding.mode)||binding.executor!==executorFor(binding.host,binding.mode))throw new Error('Invalid original execution binding; preserve the run for inspection.');
 return binding;
}
export function defaultInstallRoots(host='codex',env=process.env){
 const profile=hostProfile(host),hostHome=env[profile.homeVariable]||path.join(os.homedir(),profile.homeDirectory);
 const skillRoot=host==='codex'?path.join(os.homedir(),'.agents','skills'):path.join(hostHome,'skills');
 return {host,hostHome,skillRoot};
}
export function hostRunArgs(host){return [...hostProfile(host).runArgs];}
// Observe stdout separately from stderr. A valid DSH final can still be a failed turn.
export function hostOutputObserver(host){
 hostProfile(host);if(host!=='deepseek-harness')return null;
 const decoder=new StringDecoder('utf8');let pending='',session=false,final=false,lastType=null,reason=null,events=0,hostError=false,finished=null;
 const errors=[];const fail=message=>{if(!errors.includes(message))errors.push(message);};
 const consume=line=>{
  if(!line.trim())return;
  let value;try{value=JSON.parse(line);}catch{fail('Malformed DSH JSON stdout.');return;}
  if(!value||typeof value!=='object'||Array.isArray(value)||!['session','status','text','thinking','tool_call','tool_result','final','error'].includes(value.type)){fail('Unknown DSH JSON event.');return;}
  if(final)fail('DSH output continued after final.');
  if(!session&&value.type!=='session'&&value.type!=='error')fail('DSH stdout did not begin with a session.');
  events++;lastType=value.type;
  if(value.type==='session'){if(session||typeof value.sessionId!=='string'||!value.sessionId)fail('Invalid or duplicate DSH session event.');session=true;}
  if(value.type==='error')hostError=true;
  if(value.type==='status'&&value.phase==='turn_start')reason=null;
  if(value.type==='status'&&value.phase==='turn_end'){reason=value.reason?.kind??null;if(typeof reason!=='string')fail('Missing DSH turn_end reason.');}
  if(value.type==='final'){if(typeof value.text!=='string')fail('Invalid DSH final answer.');final=true;}
 };
 const append=text=>{pending+=text;for(;;){const at=pending.indexOf('\n');if(at<0)break;consume(pending.slice(0,at));pending=pending.slice(at+1);}};
 return {
  write:chunk=>{if(!finished)append(decoder.write(chunk));},
  finish:()=>{
   if(finished)return finished;append(decoder.end());if(pending){consume(pending);pending='';}
   if(!session)fail('Missing DSH opening session.');if(!final||lastType!=='final')fail('Missing DSH terminal final.');
   if(reason!=='completed')fail('DSH final turn did not complete.');if(hostError)fail('DSH reported a driver error.');
   finished={host,contract:'dsh-headless-json',events,session,final,turnEndReason:reason,ok:errors.length===0,errors:[...errors]};return finished;
  }
 };
}

async function npmEntry(shim,profile){
 const packageRoot=path.join(path.dirname(shim),'node_modules',...profile.package.split('/'));
 const metadata=path.join(packageRoot,'package.json');
 if(!await exists(metadata))throw new Error(`This shim has no adjacent official ${profile.label} npm package. Supply a real local executable or package bin; shell shims are not executed.`);
 const pkg=JSON.parse(await fs.readFile(metadata,'utf8'));
 if(pkg.name!==profile.package)throw new Error('Adjacent npm package identity does not match the selected host.');
 const entry=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.[profile.binary];
 if(typeof entry!=='string'||!entry||path.isAbsolute(entry)||path.win32.isAbsolute(entry))throw new Error('Official npm package has no supported local bin entry.');
 const root=await fs.realpath(packageRoot),file=await fs.realpath(path.resolve(packageRoot,entry));
 const relative=path.relative(root,file);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Official npm bin escapes its package root.');
 if(!(await fs.stat(file)).isFile()||/\.(?:cmd|bat|ps1)$/i.test(file))throw new Error('Npm bin is not a supported direct native or JavaScript entry.');
 return /\.[cm]?js$/i.test(file)?{command:process.execPath,prefix:[file]}:{command:file,prefix:[]};
}
export async function resolveHostExecutable(host,explicit,options={}){
 const profile=hostProfile(host);
 if(host==='codex')return resolveCodex(explicit,options);
 const {platform=process.platform,pathValue=process.env.PATH??''}=options;
 const candidates=explicit?[path.resolve(explicit)]:pathValue.split(path.delimiter).filter(Boolean).flatMap(dir=>platform==='win32'?[path.join(dir,profile.binary+'.exe'),path.join(dir,profile.binary+'.cmd'),path.join(dir,profile.binary+'.ps1')]:[path.join(dir,profile.binary)]);
 for(const candidate of candidates){
  if(!await exists(candidate))continue;
  if(!(await fs.stat(candidate)).isFile())throw new Error('Selected executable must be a regular file.');
  if(/\.(?:cmd|bat|ps1)$/i.test(candidate))return npmEntry(candidate,profile);
  return /\.[cm]?js$/i.test(candidate)?{command:process.execPath,prefix:[candidate]}:{command:candidate,prefix:[]};
 }
 throw new Error(`Local ${profile.label} executable not found. Configure an existing local entry; no automatic download or fallback host is used.`);
}
