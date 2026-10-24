import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contained,digest,json} from './files.mjs';
import { EXECUTION_SUMMARY, templateVersion } from './templates.mjs';
import {executionPolicy,selectHost,executorFor,hostProfile} from './hosts.mjs';

const text=(value,label)=>{if(typeof value!=='string'||!value.trim())throw new Error(`Missing ${label}. Next: fill the current task plan; see references/authoring.md.`);};
function documentPath(value){
 text(value,'context document path');
 if(path.isAbsolute(value)||path.win32.isAbsolute(value)||value.split(/[\\/]/).some(x=>x==='..')||!value.endsWith('.md'))throw new Error(`Invalid task document path: ${value}. Next: use a relative Markdown file inside this task package; see references/authoring.md.`);
 if(/^(?:HARNESS\.md|contract\.json|state\.json|\.writer-lock|(?:receipt|acceptance|check|execution)-)/i.test(path.basename(value)))throw new Error(`Runtime control/evidence file cannot be a context document: ${value}`);
}
export function validateLayered(c){
 if(c.layout===undefined)return;
 if(c.layout!=='layered')throw new Error('Unknown harness layout; omit layout for legacy or use layered.');
 if(!Array.isArray(c.contextFiles)||!c.contextFiles.length)throw new Error('Layered tasks need substantive phase plans in contextFiles before review.');
 documentPath(c.recoveryFile);
 const recoveryKey=c.recoveryFile.replaceAll('\\','/');
 const seen=new Set([process.platform==='win32'?recoveryKey.toLowerCase():recoveryKey]);const covered=new Set();
 for(const d of c.contextFiles){
  documentPath(d.path);text(d.purpose,'document purpose');text(d.loadWhen,'document loadWhen');
  const key=d.path.replaceAll('\\','/');const identity=process.platform==='win32'?key.toLowerCase():key;
  if(seen.has(identity))throw new Error(`Duplicate context/recovery document: ${d.path}`);seen.add(identity);
  if(!['phase','reference'].includes(d.kind)||!Array.isArray(d.tasks)||!d.tasks.length||new Set(d.tasks).size!==d.tasks.length)throw new Error(`Declare kind and unique task mappings for ${d.path}.`);
  for(const id of d.tasks){if(!c.tasks.some(t=>t.id===id))throw new Error(`Unknown context task ${id} in ${d.path}.`);if(d.kind==='phase')covered.add(id);}
 }
 for(const t of c.tasks)if(!covered.has(t.id))throw new Error(`Task ${t.id} has no phase plan. Next: write its input/method/constraints/acceptance/stop and map it in contextFiles; see references/authoring.md.`);
}
export async function layeredReviewFiles(dir,c){
 const extra=[...c.reviewFiles];
 if(c.layout==='layered')for(const p of [...c.contextFiles.map(d=>d.path),c.recoveryFile])if(!extra.includes(p))extra.push(p);
 const reserved=name=>/^(?:HARNESS\.md|contract\.json|state\.json|\.writer-lock|(?:receipt|acceptance|check|execution)-)/i.test(name);
 const controls=new Map();
 const inode=s=>s.ino!==0n?`${s.dev}:${s.ino}`:null;
 async function collect(directory){
  for(const e of await fs.readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,e.name);
   if(e.isDirectory()){if(e.name!=='.writer-lock')await collect(file);continue;}
   if(!reserved(e.name))continue;
   await contained(dir,path.relative(dir,file));const s=await fs.stat(file,{bigint:true});const id=inode(s);
   if(!id&&s.nlink>1n)throw new Error(`Control file identity unavailable: ${file}`);
   if(id)controls.set(id,file);
  }
 }
 await collect(dir);
 const seen=[];
 for(const [index,relative] of ['contract.json','HARNESS.md',...extra].entries()){
  const base=index<2;
  if(!base&&reserved(path.basename(path.normalize(relative))))throw new Error(`Runtime control/evidence cannot be a review attachment: ${relative}`);
  const file=await contained(dir,relative);const stat=await fs.stat(file,{bigint:true});
  if(!stat.isFile())throw new Error(`Expected review file: ${relative}`);
  const real=await fs.realpath(file);const key=process.platform==='win32'?real.toLowerCase():real;const id=inode(stat);
  if(!id&&stat.nlink>1n)throw new Error(`Review file identity unavailable: ${relative}`);
  if(!base&&(reserved(path.basename(real))||(id&&controls.has(id))))throw new Error(`Review attachment aliases runtime control/evidence: ${relative}`);
  if(seen.some(s=>s.key===key||(id&&s.id===id)))throw new Error(`Duplicate review document identity: ${relative}`);
  seen.push({key,id});
 }
 return extra;
}
const cell=v=>String(v??'').replaceAll('|','\\|').replaceAll('\n',' ');
const link=p=>'['+cell(p)+'](<'+p.replaceAll('\\','/')+'>)';
const runtimeCLI=fileURLToPath(new URL('../harness.mjs',import.meta.url));
const nativeAction=(project,id,step,command)=>({command:process.execPath,args:[runtimeCLI,command,'--project',path.resolve(project),'--id',id,'--task',step]});
export const nativeBeginAction=(project,id,step,host)=>{const action=nativeAction(project,id,step,'begin');return host?{...action,args:[...action.args,'--host',host]}:action;};
export function nativeSubmissionAction(project,id,step,runId,executor='codex-native'){
 const action=nativeAction(project,id,step,'submit');
 return {...action,args:[...action.args,'--run-id',runId,'--executor',executor],requiredFields:['reference: actual execution location','result: ok or failed'],optionalFields:['summary','outcome'],ownership:'Use inline fields; runtime alone creates the receipt. Submit only actual end evidence for the original runId. Current approved results still need verify; stale factual closure cannot accept results or restore approval.'};
}
export function renderLayered(c){
 const executionSummary=templateVersion(c)===1?'Execution receipts and exit zero mean pending acceptance.':EXECUTION_SUMMARY;
 const lines=[`# Task harness: ${c.taskId} · revision ${c.revision}`,'',`Goal: ${c.goal}`,'',`Domain: ${c.domain}. Layout: layered. Formal execution requires direct user approval of this complete version.`,'','## Overall boundaries','',`Non-goals: ${JSON.stringify(c.nonGoals)}`,`Permissions: ${JSON.stringify(c.permissions)}`,`Resources: ${JSON.stringify(c.resources)}`,`Assumptions: ${JSON.stringify(c.assumptions)}`,`Risks: ${JSON.stringify(c.risks)}`,`Stop conditions: ${JSON.stringify(c.stops)}`,'','## Whole-task map and acceptance','', '| Task | Depends on verified | Outputs | Acceptance | Phase plans |','|---|---|---|---|---|'];
 lines.splice(lines.indexOf('## Overall boundaries'),0,'## Entry: resume or review','',`On resumption with this supplied entry, first project reads are only this master and recovery instructions; read the skill runtime interface as needed, then immediately use context. Do not enumerate or broadly search the project/package, load full state or predecessor reports before context. Search matches also count as loading. Only locate filenames narrowly when the supplied entry is actually missing. Runtime: context --project <this project> --id ${c.taskId} --task <current task>. It derives current approval, dependencies and the next permitted action. Use the current approval provenance and dependency summaries, then the returned current-stage context; do not reread old state merely to confirm them. Do not load the complete contract or old receipts by default; inspect linked raw evidence only for a specific unresolved gap.`,'','If approval is missing or the plan changes, use the complete review route below. Preparing authorized planning files precedes formal work; formal content in chat, files or subagent handoffs requires user review first.','');
 if(templateVersion(c)===4)lines.splice(lines.indexOf('## Overall boundaries'),0,'## Reviewed host policy','',JSON.stringify(executionPolicy(c)),'','Only a reviewed allowed host may begin new work. Preserve the original host/mode/executor when closing active work. Host selection grants no extra tools or permissions; use the selected host reference and actual native capabilities.','');
 for(const t of c.tasks)lines.push(`| ${cell(t.id)}: ${cell(t.title)} | ${cell(t.dependsOn.join(', ')||'none')} | ${cell(t.outputs.map(id=>c.deliverables.find(d=>d.id===id)?.path??id).join(', '))} | ${cell(t.acceptance.map(a=>a.description).join('; '))} | ${(c.contextFiles??[]).filter(d=>d.kind==='phase'&&d.tasks.includes(t.id)).map(d=>link(d.path)).join(', ')} |`);
 lines.push('','## Conditional reading','');
 for(const d of c.contextFiles??[])lines.push(`- ${link(d.path)} — ${d.purpose}; read when: ${d.loadWhen}; tasks: ${d.tasks.join(', ')}.`);
 lines.push('',`Recovery and semantic maintenance: ${c.recoveryFile?link(c.recoveryFile):'declare recoveryFile before review'}. Load on a new session, interruption, stale evidence or phase maintenance; do not load all phase bodies by default.`,'','## Inputs and complete review (initial approval or revision only)','',`Inputs and sources: ${JSON.stringify(c.inputs)}`,'', 'The full machine contract is [contract.json](contract.json). For initial approval or a substantive revision, review this map, the complete contract and every linked phase/reference/recovery file. For approved execution, use the context-first entry above. All belong to the review digest even when not loaded into a particular execution context. A skeleton or a structure check is not a semantic or scientific review.','', 'Within a valid approved version, proceed by verified dependencies without repeating the same approval. Changed immutable inputs or reviewed plans invalidate approval; normal declared outputs and execution records are handled through acceptance and downstream evidence status. Never self-approve. Authorization records do not authenticate users or impose OS isolation.','', executionSummary+' Only actual current acceptance evidence verifies a task. Preserve negative/opposite/inconclusive findings; do not repair research toward positivity. Final completion requires all mandatory outputs and acceptance, with limitations and unresolved items reported.','');
 return lines.join('\n');
}
export async function buildTaskContext(project,dir,c,state,step,options={}){
 const t=c.tasks.find(t=>t.id===step);if(!t)throw new Error(`Unknown task ${step}. Next: select a task from HARNESS.md.`);
 const s=state.tasks[step];const blockers=[];
 const original=state.activeExecutions?.find(r=>r.step===step);
 let selectedHost=original?.executionBinding?.host??'codex',policy=null,selectionError=null;
 try{policy=executionPolicy(c);if(options.host!==undefined)hostProfile(options.host);if(!original)selectedHost=selectHost(c,options.host);}catch(e){selectionError=e.message;blockers.push(e.message);}
 const execution={host:selectedHost,policy,requestedHost:options.host??null,originalRunId:original?.runId??null,originalBinding:original?.executionBinding??null,...(selectionError?{selectionError}:{})};
 if(!state.approval||state.phase==='pending_user_review')blockers.push('Direct user approval of the current complete package is required.');
 if(!s||!['todo','failed','stale','blocked'].includes(s.status))blockers.push(`Task ${step} is ${s?.status??'unreviewed'}; do not begin a duplicate run. Inspect the real execution/receipt; see ${c.recoveryFile??'references/recovery-maintenance.md'}.`);
 for(const r of state.activeExecutions??[])blockers.push(`Execution ${r.step}/${r.runId} is still active; observe its real end and submit that original runId before another writer begins.`);
 blockers.push(...(state.executionBlockers??[]));
 const dependencies=[];
 for(const id of t.dependsOn){
  const dep=c.tasks.find(x=>x.id===id);const ds=state.tasks[id];const item={id,status:ds?.status??'todo',outputs:[]};
  if(ds?.status!=='verified')blockers.push(`Dependency ${id} is ${ds?.status??'todo'}, not currently verified.`);
  else{
   item.outputs=dep.outputs.map(id=>{const d=c.deliverables.find(d=>d.id===id);const file=path.resolve(project,d.path);return {id,path:file,sha256:ds.evidence.find(e=>path.resolve(e.path)===file)?.sha256};});
   const receipt=await json(ds.receipt.path);if(typeof receipt.summary==='string')item.summary=receipt.summary;
   item.acceptanceEvidence=(ds.evidence??[]).filter(e=>path.basename(e.path).startsWith('acceptance-'));
  }
  dependencies.push(item);
 }
 const files=[];
 if(c.layout==='layered')for(const d of c.contextFiles.filter(d=>d.tasks.includes(step))){const file=await contained(dir,d.path);files.push({...d,path:file,sha256:await digest(file),text:await fs.readFile(file,'utf8')});}
 const approval=state.approval?{...Object.fromEntries(['actor','decision','taskId','revision','digest'].map(k=>[k,state.approval[k]])),messageExcerpt:state.approval.message.slice(0,512),sourceExcerpt:state.approval.source.slice(0,512),messageTruncated:state.approval.message.length>512,sourceTruncated:state.approval.source.length>512}:null;
 const review=state.review?{revision:state.review.revision,digest:state.review.digest,approved:!!state.approval,...(c.layout==='layered'?{approval}:{})}:null;
 const inputs=c.inputs.map(i=>({source:i.source,...(i.path?{path:path.resolve(project,i.path),approvedSha256:state.review?.files.find(f=>f.kind==='input'&&f.path===path.resolve(project,i.path))?.sha256??i.sha256}:{} )}));
 const global={taskId:c.taskId,revision:c.revision,domain:c.domain,goal:c.goal,nonGoals:c.nonGoals,permissions:c.permissions,resources:c.resources,assumptions:c.assumptions,risks:c.risks,stops:c.stops,skills:c.skills,inputs,execution};
 if(c.domain==='research')global.scientificBoundaries=Object.fromEntries(['question','estimand','independentUnit','primaryExploratory','uncertainty','provenanceToClaims','negativeResults'].map(k=>[k,c.protocol[k]]));
 const last=s?.lastAcceptance;
 const acceptance=last?{attemptId:last.attemptId,runId:last.runId,status:last.status,criterion:last.criterion,error:last.error?.slice(0,2048)??null,log:last.log,exitCode:last.exitCode,report:last.report,next:last.next,receipt:last.receipt,finishedAt:last.finishedAt}:null;
 return {...(c.layout==='layered'||original||c.templateVersion===4?{workflow:{nextAction:blockers.length?'resolve-blockers':'begin',begin:blockers.length?null:nativeBeginAction(project,c.taskId,step,selectedHost),submission:original&&original.executionBindingStatus!=='conflict'?nativeSubmissionAction(project,c.taskId,step,original.runId,original.executionBinding?.executor??'codex-native'):null,submissionHelp:{command:process.execPath,args:[runtimeCLI,'help','submit']},reading:'Use current context; load complete review or historical evidence only for a specific need.'}}:{}),layout:c.layout??'legacy',master:{path:path.join(dir,'HARNESS.md'),sha256:await digest(path.join(dir,'HARNESS.md'))},review,global,task:{id:t.id,title:t.title,dependsOn:t.dependsOn,outputs:t.outputs.map(id=>c.deliverables.find(d=>d.id===id)),acceptance:t.acceptance},activeExecutions:state.activeExecutions??[],executionBlockers:state.executionBlockers??[],acceptance,currentStatus:s?.status??'todo',canBegin:blockers.length===0,blockers,dependencies,files,recoveryFile:c.recoveryFile?path.join(dir,c.recoveryFile):null,invariants:['Use only actual user authorization; the runtime is not OS isolation.','A receipt or zero exit is not verification.','Preserve negative, opposite and inconclusive results; never fabricate scientific evidence.','If scope, immutable inputs or reviewed method changes, stop affected work and obtain a revised review.'],limitation:'Only selected file bodies are emitted; all reviewed files were still checked for drift. Read linked raw evidence when a real evidentiary gap requires it.'};
}
