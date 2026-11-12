import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contained,digest,json,hash} from './files.mjs';
import { COLLABORATION_ROUTE, REVIEW_EVIDENCE_SUMMARY, EXECUTION_SUMMARY, EXECUTION_FOCUS_SUMMARY } from './templates.mjs';
import {executionPolicy,selectHost,executorFor,hostProfile} from './hosts.mjs';

const text=(value,label)=>{if(typeof value!=='string'||!value.trim())throw new Error(`Missing ${label}. Next: fill the current task plan; see references/authoring.md.`);};
export const contextSourceChanged=message=>Object.assign(new Error(message),{code:'HARNESS_CONTEXT_SOURCE_CHANGED'});
export function staleReworkDecision(c,state,step){
 const s=state.tasks?.[step];
 if(s?.status!=='stale')return {required:false,recovery:false};
 if(!s.runId)return (state.events??[]).some(e=>e.type==='begin'&&e.step===step)?{required:true,recovery:true}:{required:false,recovery:false};
 const events=state.events??[],closed=events.filter(e=>['execution_receipt','execution_closed'].includes(e.type)&&e.runId===s.runId),begins=events.filter(e=>e.type==='begin'&&e.runId===s.runId);
 const recover=()=>({required:true,recovery:true});
 if(closed.length!==1||closed[0].step!==step||begins.length>1||begins.some(e=>e.step!==step)||(state.activeExecutions??[]).some(e=>e.runId===s.runId))return recover();
 if(typeof s.receipt?.path!=='string'||!s.receipt.path.trim()||typeof s.receipt.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.receipt.sha256)||!s.reviewDigest||begins.some(e=>e.reviewDigest&&e.reviewDigest!==s.reviewDigest)||closed.some(e=>e.reviewDigest&&e.reviewDigest!==s.reviewDigest)||closed.some(e=>e.receiptSha256&&e.receiptSha256!==s.receipt.sha256))return recover();
 const requests=events.filter(e=>e.type==='rework_requested'&&e.step===step&&e.fromRunId===s.runId);
 if(!requests.length)return s.reworkRequest?recover():{required:true,recovery:false};
 if(requests.length!==1)return recover();
 const e=requests[0],marker=s.reworkRequest;
 if(typeof e.requestId!=='string'||!e.requestId.trim()||marker?.requestId!==e.requestId||marker.fromRunId!==s.runId||typeof e.reason!=='string'||!e.reason.trim()||typeof e.reference!=='string'||!e.reference.trim()||marker.reason!==e.reason||marker.reference!==e.reference||e.reviewDigest!==s.reviewDigest||e.reviewBinding.status!=='known'||e.reviewBinding.source!=='begin'||e.receipt?.path!==s.receipt.path||e.receipt.sha256!==s.receipt.sha256)return recover();
 return {required:false,recovery:false,request:e};
}
function documentPath(value){
 text(value,'context document path');
 if(path.isAbsolute(value)||path.win32.isAbsolute(value)||value.split(/[\\/]/).some(x=>x==='..')||!value.endsWith('.md'))throw new Error(`Invalid task document path: ${value}. Next: use a relative Markdown file inside this task package; see references/authoring.md.`);
 if(/^(?:HARNESS\.md|contract\.json|state\.json|\.writer-lock|(?:receipt|acceptance|check|execution)-)/i.test(path.basename(value)))throw new Error(`Runtime control/evidence file cannot be a context document: ${value}`);
}
export function validateContextPlan(c){
 if(!Array.isArray(c.contextFiles)||!c.contextFiles.length)throw new Error('Tasks need substantive phase plans in contextFiles before review.');
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
export async function contextReviewFiles(dir,c){
 const extra=[...c.reviewFiles];
 for(const p of [...c.contextFiles.map(d=>d.path),c.recoveryFile])if(!extra.includes(p))extra.push(p);
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
 return {...action,args:[...action.args,'--run-id',runId,'--executor',executor],requiredFields:['reference: actual execution location','result: ok or failed',...(executor.endsWith('-cli')?['business-end-reference: actual business activity and relevant descendants ended']:[])],optionalFields:['summary','outcome'],ownership:'Use inline fields; runtime alone creates the receipt. Submit only actual end evidence for the original runId. Current approved results still need verify; stale factual closure cannot accept results or restore approval.'};
}
export function renderCurrent(c){
 const lines=[`# Task harness: ${c.taskId} · revision ${c.revision}`,'',`Goal: ${c.goal}`,'',`Domain: ${c.domain}. Formal execution requires direct user approval of this complete version.`,'','## Entry: resume or review','',`On resumption with this supplied entry, first project reads are only this master and recovery instructions; read the skill runtime interface as needed, then immediately use context. Do not enumerate or broadly search the project/package, load full state or predecessor reports before context. Search matches also count as loading. Only locate filenames narrowly when the supplied entry is actually missing. Runtime: context --project <this project> --id ${c.taskId} --task <current task>. It derives current approval, dependencies and the next permitted action. Use the current approval provenance and dependency summaries, then the returned current-stage context; do not reread old state merely to confirm them. Do not load the complete contract or old receipts by default; inspect linked raw evidence only for a specific unresolved gap.`,'','If approval is missing or the plan changes, use the complete review route below. Preparing authorized planning files precedes formal work; formal content in chat, files or subagent handoffs requires user review first.','','When feasibility is refuted, critical acceptance repeatedly stalls or a critical dependency has no viable path, follow the installed skill references/replanning.md after context for comprehensive self-audit and complete replanning. Preserve original goals, constraints, evidence and the original controller; settle actual active/pending work through supported operations before changing the live plan. A materially revised complete package requires direct final-user approval. Normal waiting or one timeout alone does not justify rewriting.','','## Reviewed host policy','',JSON.stringify(executionPolicy(c)),'','Only a reviewed allowed host may begin new work. Preserve the original host/mode/executor when closing active work. Host selection grants no extra tools or permissions; use the selected host reference and actual native capabilities.','','## Collaboration and acceptance','',COLLABORATION_ROUTE,'',REVIEW_EVIDENCE_SUMMARY,'','## Feasibility, methods and stage release','',EXECUTION_FOCUS_SUMMARY,'','## Overall boundaries','',`Non-goals: ${JSON.stringify(c.nonGoals)}`,`Permissions: ${JSON.stringify(c.permissions)}`,`Resources: ${JSON.stringify(c.resources)}`,`Assumptions: ${JSON.stringify(c.assumptions)}`,`Risks: ${JSON.stringify(c.risks)}`,`Stop conditions: ${JSON.stringify(c.stops)}`,'','## Whole-task map and acceptance','', '| Task | Depends on verified | Outputs | Acceptance | Phase plans |','|---|---|---|---|---|'];
 for(const t of c.tasks)lines.push(`| ${cell(t.id)}: ${cell(t.title)} | ${cell(t.dependsOn.join(', ')||'none')} | ${cell(t.outputs.map(id=>c.deliverables.find(d=>d.id===id)?.path??id).join(', '))} | ${cell(t.acceptance.map(a=>a.description).join('; '))} | ${c.contextFiles.filter(d=>d.kind==='phase'&&d.tasks.includes(t.id)).map(d=>link(d.path)).join(', ')} |`);
 lines.push('','## Conditional reading','');
 for(const d of c.contextFiles)lines.push(`- ${link(d.path)} — ${d.purpose}; read when: ${d.loadWhen}; tasks: ${d.tasks.join(', ')}.`);
 lines.push('',`Recovery and semantic maintenance: ${link(c.recoveryFile)}. Load on a new session, interruption, stale evidence or phase maintenance; do not load all phase bodies by default.`,'','## Inputs and complete review (initial approval or revision only)','',`Inputs and sources: ${JSON.stringify(c.inputs)}`,'','The full machine contract is [contract.json](contract.json). For initial approval or a substantive revision, review this map, the complete contract and every linked phase/reference/recovery file. For approved execution, use the context-first entry above. All belong to the review digest even when not loaded into a particular execution context. A skeleton or a structure check is not a semantic or scientific review.','','Within a valid approved version, proceed by verified dependencies without repeating the same approval. Changed immutable inputs or reviewed plans invalidate approval; normal declared outputs and execution records are handled through acceptance and downstream evidence status. Never self-approve. Authorization records do not authenticate users or impose OS isolation.','',EXECUTION_SUMMARY+' Only actual current acceptance evidence verifies a task. Preserve negative, opposite and inconclusive findings. Final completion requires all mandatory outputs and acceptance, with limitations and unresolved items reported.','');
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
 const reworkDecision=staleReworkDecision(c,state,step);
 const selectedPending=(options.pendingRuns??[]).filter(r=>r.step===step);
 for(const r of selectedPending)blockers.push('Unresolved pending obligation '+r.step+'/'+r.runId+'; explicitly rework the original closed result before begin.');
 if(reworkDecision.required)blockers.push(reworkDecision.recovery?`Stale run ${step}/${s.runId} has missing or conflicting closure/rework evidence; recover its original facts before rework.`:`Explicit rework is required for closed stale run ${step}/${s.runId} before begin.`);
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
 for(const d of c.contextFiles.filter(d=>d.tasks.includes(step))){
  const file=await contained(dir,d.path),bytes=await fs.readFile(file),sha256=hash(bytes);
  const key=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
  if(state.approval&&state.review?.files.find(f=>key(f.path)===key(file))?.sha256!==sha256)throw contextSourceChanged('Context differs from its approved document: '+file);
  let body;try{body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw contextSourceChanged('Context document is not valid UTF-8: '+file);}
  files.push({...d,path:file,sha256,text:body});
 }
 const approval=state.approval?{...Object.fromEntries(['actor','decision','taskId','revision','digest'].map(k=>[k,state.approval[k]])),messageExcerpt:state.approval.message.slice(0,512),sourceExcerpt:state.approval.source.slice(0,512),messageTruncated:state.approval.message.length>512,sourceTruncated:state.approval.source.length>512}:null;
 const review=state.review?{revision:state.review.revision,digest:state.review.digest,approved:!!state.approval,approval}:null;
 const inputs=c.inputs.map(i=>({source:i.source,...(i.path?{path:path.resolve(project,i.path),approvedSha256:state.review?.files.find(f=>f.kind==='input'&&f.path===path.resolve(project,i.path))?.sha256??i.sha256}:{} )}));
 const global={taskId:c.taskId,revision:c.revision,domain:c.domain,goal:c.goal,nonGoals:c.nonGoals,permissions:c.permissions,resources:c.resources,assumptions:c.assumptions,risks:c.risks,stops:c.stops,skills:c.skills,inputs,execution};
 if(c.domain==='research')global.scientificBoundaries=Object.fromEntries(['question','estimand','independentUnit','primaryExploratory','uncertainty','provenanceToClaims','negativeResults'].map(k=>[k,c.protocol[k]]));
 const reworkHistory=(state.events??[]).filter(e=>e.type==='rework_requested'&&e.step===step).at(-1);
 const idle=!(state.activeExecutions??[]).length&&!(state.executionBlockers??[]).length;
 const canVerify=!!(state.approval&&idle&&s?.status==='pending_acceptance'&&t.dependsOn.every(id=>state.tasks[id]?.status==='verified'));
 const canRework=!!(idle&&!reworkDecision.recovery&&s?.runId&&(['pending_acceptance','verified','stale'].includes(s.status)||selectedPending.some(r=>r.runId===s.runId&&r.recoverable)));
 const verifyAction=canVerify?nativeAction(project,c.taskId,step,'verify'):null;
 const reworkAction=canRework?{...nativeAction(project,c.taskId,step,'rework'),args:[...nativeAction(project,c.taskId,step,'rework').args,'--run-id',s.runId],requiredFields:['reason: evidenced repair cause','reference: actual issue or review location'],limitation:'Command rechecks the unique closed original run and stable receipt; administrative disposition never restores approval.'}:null;
 const last=s?.lastAcceptance;
 const acceptance=last?{attemptId:last.attemptId,runId:last.runId,status:last.status,criterion:last.criterion,error:last.error?.slice(0,2048)??null,log:last.log,exitCode:last.exitCode,report:last.report,next:last.next,receipt:last.receipt,finishedAt:last.finishedAt}:null;
 return {workflow:{nextAction:(reworkDecision.required||(selectedPending.length&&s?.status==='todo'))&&canRework&&!selectionError?'rework':blockers.length?'resolve-blockers':'begin',verify:verifyAction,reviewSnapshot:canVerify?t.acceptance.filter(a=>a.type==='review').map(a=>({...nativeAction(project,c.taskId,step,'review-snapshot'),args:[...nativeAction(project,c.taskId,step,'review-snapshot').args,'--criterion',a.id],requiredFiles:a.requiredFiles,persisted:false,semanticReviewed:false})):[],rework:reworkAction,begin:blockers.length?null:nativeBeginAction(project,c.taskId,step,selectedHost),submission:original&&original.executionBindingStatus!=='conflict'&&(original.executionBinding.mode!=='cli'||original.processObservation)?nativeSubmissionAction(project,c.taskId,step,original.runId,original.executionBinding.executor):null,submissionHelp:{command:process.execPath,args:[runtimeCLI,'help','submit']},reading:'Use current context; load complete review or historical evidence only for a specific need.'},master:{path:path.join(dir,'HARNESS.md'),sha256:await digest(path.join(dir,'HARNESS.md'))},review,global,task:{id:t.id,title:t.title,dependsOn:t.dependsOn,outputs:t.outputs.map(id=>c.deliverables.find(d=>d.id===id)),acceptance:t.acceptance},activeExecutions:state.activeExecutions??[],executionBlockers:state.executionBlockers??[],acceptance,rework:reworkHistory?{requestId:reworkHistory.requestId,fromRunId:reworkHistory.fromRunId,reason:reworkHistory.reason,reference:reworkHistory.reference,currentRunSource:s?.reworkOf??null}:null,currentStatus:s?.status??'todo',canBegin:blockers.length===0,blockers,dependencies,files,recoveryFile:c.recoveryFile?path.join(dir,c.recoveryFile):null,invariants:[EXECUTION_FOCUS_SUMMARY,'Use only actual user authorization; the runtime is not OS isolation.','A receipt or zero exit is not verification.','Preserve negative, opposite and inconclusive results; never fabricate scientific evidence.','If scope, immutable inputs or reviewed method changes, stop affected work and obtain a revised review.'],limitation:'Only selected file bodies are emitted; all reviewed files were still checked for drift. Read linked raw evidence when a real evidentiary gap requires it.'};
}
