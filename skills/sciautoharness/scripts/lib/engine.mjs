import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, contained, digest, exists, hash, json, locked, now, safeId, writeJson, formatRuntimeError } from './files.mjs';
import { renderContract, reviewSnapshot, skeleton, validateContract } from './contract.mjs';
import { resolveCodex, runProcess } from './process.mjs';
import { buildTaskContext, nativeSubmissionAction } from './context.mjs';
import {draftPolicy,selectHost,executionBinding as makeExecutionBinding,validateExecutionBinding,executorProfile,executorFor,hostProfile,hostRunArgs,resolveHostExecutable,hostOutputObserver} from './hosts.mjs';

export async function taskDirectory(project, id) {
  const name = safeId(id);
  const current = await contained(project, path.join('harness', name));
  const legacy = await contained(project, path.join('.codex', 'harness', name));
  const hasCurrent = await exists(current), hasLegacy = await exists(legacy);
  if (hasCurrent && hasLegacy) throw new Error(`Task exists in both current and legacy locations; resolve the identity conflict explicitly: ${id}`);
  return hasLegacy ? legacy : current;
}
export async function draft(project, id, goal, domain, layout, options={}) {
  if(layout!==undefined&&layout!=='layered')throw new Error('Use --layout layered or omit it for a legacy draft.');
  const policy=draftPolicy(options);
  const dir = await taskDirectory(project,id);
  if (await exists(dir)) throw new Error('Task already exists; do not overwrite. Edit contract and increment revision.');
  await fs.mkdir(dir,{recursive:true});
  const c = skeleton(id,goal,domain);
  c.execution=policy;
  if(layout==='layered')Object.assign(c,{layout,contextFiles:[],recoveryFile:'RECOVERY.md'});
  await fs.writeFile(path.join(dir,'contract.json'),`${JSON.stringify(c,null,2)}\n`,{flag:'wx'});
  await fs.writeFile(path.join(dir,'HARNESS.md'),renderContract(c),{flag:'wx'});
  await writeJson(path.join(dir,'state.json'),{schemaVersion:1,taskId:id,phase:'draft',tasks:{},events:[{type:'draft',at:now()}]});
  return {phase:'draft',directory:dir,next:'Fill the contract, render, prepare review; do not execute yet.'};
}
async function read(project,id) {
  const dir = await taskDirectory(project,id);
  const c = await json(path.join(dir,'contract.json'));
  const state = await json(path.join(dir,'state.json'));
  if (c.taskId !== id || state.taskId !== id || state.schemaVersion !== 1) throw new Error('Task identity/schema mismatch.');
  return {dir,c,state};
}
function event(state,type,details={}) { state.events.push({at:now(),type,...details}); }
// Evidence freshness must never be used as proof that a writer has ended.
function resolveRunBinding(state,step,runId,closures=[]) {
  const sources=[];const conflicts=[];
  const begins=(state.events??[]).filter(e=>e.type==='begin'&&e.runId===runId);
  if(begins.length>1||begins.some(e=>e.step!==step))conflicts.push('Ambiguous original begin identity');
  const add=(digest,source)=>{if(typeof digest==='string'&&digest)sources.push({digest,source});};
  for(const e of begins)if(e.step===step)add(e.reviewDigest,'begin');
  const task=state.tasks?.[step];if(task?.runId===runId)add(task.reviewDigest,'legacy-task');
  for(const e of closures)if(e.runId===runId&&e.step===step&&e.reviewBinding?.version===1&&e.reviewBinding.status==='known'&&['begin','legacy-task'].includes(e.reviewBinding.source))add(e.reviewDigest,e.reviewBinding.source);
  if(new Set(sources.map(s=>s.digest)).size>1)conflicts.push('Conflicting original review bindings');
  const first=sources[0];
  return {digest:conflicts.length?null:first?.digest??null,known:!!first&&!conflicts.length,source:first?.source??'legacy-unbound',conflicts};
}
const bindingRecord=b=>({version:1,status:b.known?'known':'unknown',source:b.known?b.source:'legacy-unbound'});
function resolveExecutionBinding(state,step,runId,closures=[]){
  const observed=[],conflicts=[];
  const add=source=>{
    if(!source||!Object.hasOwn(source,'executionBinding'))return;
    try{const b=validateExecutionBinding(source.executionBinding);observed.push(makeExecutionBinding(b.host,b.mode));}
    catch(e){conflicts.push(e.message);}
  };
  for(const e of state.events??[])if(e.type==='begin'&&e.step===step&&e.runId===runId)add(e);
  if(state.tasks?.[step]?.runId===runId)add(state.tasks[step]);
  for(const e of closures)if(e.step===step&&e.runId===runId)add(e);
  if(new Set(observed.map(x=>JSON.stringify(x))).size>1)conflicts.push('Conflicting original host/mode/executor bindings.');
  return {binding:conflicts.length?null:observed[0]??null,conflicts};
}
function deriveExecutions(state) {
  const active=new Map(),closed=new Set(),ambiguous=[],closures=[];
  const add=r=>{if(r?.runId&&r.step&&!closed.has(r.runId)&&!active.has(r.runId))active.set(r.runId,r);};
  for(const e of state.events??[]) {
    if(e.type==='begin')add({step:e.step,runId:e.runId,startedAt:e.at,reviewDigest:e.reviewDigest??null});
    if(!['execution_receipt','execution_closed'].includes(e.type))continue;
    if(e.runId) {
      if(active.has(e.runId)&&active.get(e.runId).step!==e.step){ambiguous.push({runIds:[e.runId],message:`Conflicting execution identity ${e.step}/${e.runId}. Inspect the real execution.`});continue;}
      active.delete(e.runId);closed.add(e.runId);closures.push(e);
    } else {
      const candidates=[...active.values()].filter(r=>r.step===e.step);
      if(candidates.length===1){const runId=candidates[0].runId;active.delete(runId);closed.add(runId);closures.push({...e,runId,legacyStepOnly:true});}
      else if(candidates.length>1)ambiguous.push({runIds:candidates.map(r=>r.runId),message:`Ambiguous legacy receipt for ${e.step}; close each original runId using actual execution evidence.`});
    }
  }
  for(const r of state.activeExecutions??[])add(r);
  for(const [step,s] of Object.entries(state.tasks??{})) {
    if(s.status==='executing'||(s.runId&&s.startedAt&&!s.finishedAt&&!s.receipt)) {
      if(s.runId)add({step,runId:s.runId,startedAt:s.startedAt,reviewDigest:s.reviewDigest??null});
      else ambiguous.push({runIds:null,message:`Executing task ${step} has no runId; inspect its real execution before recovery.`});
    }
  }
  for(const r of active.values()) {
    const b=resolveRunBinding(state,r.step,r.runId,closures);
    if(b.conflicts.length)ambiguous.push({runIds:[r.runId],message:`${b.conflicts.join('; ')}: ${r.step}/${r.runId}`});
    Object.assign(r,{reviewDigest:b.digest,reviewBinding:bindingRecord(b)});
    const execution=resolveExecutionBinding(state,r.step,r.runId,closures);
    if(execution.conflicts.length)ambiguous.push({runIds:[r.runId],message:`${execution.conflicts.join('; ')}: ${r.step}/${r.runId}`});
    Object.assign(r,{executionBinding:execution.binding,executionBindingStatus:execution.conflicts.length?'conflict':execution.binding?'known':'legacy-unbound'});
  }
  state.activeExecutions=[...active.values()];
  state.executionBlockers=ambiguous.filter(x=>!x.runIds||x.runIds.some(id=>active.has(id))).map(x=>x.message);
  return {closures};
}
function invalidateAll(state,reason) {
  state.approval = null; state.phase = 'pending_user_review'; state.blocker = reason;
  for (const task of Object.values(state.tasks)) if (task.status !== 'todo') { task.status = 'stale'; task.reason = reason; }
}
async function refresh(project,dir,c,state) {
  deriveExecutions(state);
  if (state.review) {
    try {
      const current = hash(JSON.stringify(await reviewSnapshot(project,dir,c)));
      if (current !== state.review.digest || c.revision !== state.review.revision) invalidateAll(state,'Review package or bound inputs changed; render and obtain a new user review.');
    } catch (e) { invalidateAll(state,e.message); }
  }
  for (const task of Object.values(state.tasks)) {
    if (task.status !== 'verified') continue;
    for (const file of task.evidence ?? []) {
      try { if ((await digest(file.path)) === file.sha256) continue; } catch {}
      task.status = 'stale'; task.reason = `Acceptance evidence changed or is missing: ${file.path}`; break;
    }
  }
  let changed;
  do {
    changed = false;
    for (const task of c.tasks) {
      const s = state.tasks[task.id];
      if (s && ['verified','pending_acceptance','executing'].includes(s.status) && task.dependsOn.some(id=>state.tasks[id]?.status !== 'verified')) {
        s.status = 'stale'; s.reason = 'Dependency is not verified.'; changed = true;
      }
    }
  } while (changed);
  if (state.approval && (state.approval.taskId !== c.taskId || state.approval.revision !== c.revision || state.approval.digest !== state.review?.digest || state.approval.actor !== 'user' || state.approval.decision !== 'approve')) invalidateAll(state,'Approval does not match this task and review revision.');
  if (state.approval) {
    const statuses = Object.values(state.tasks).map(t=>t.status);
    state.phase = state.activeExecutions.length ? 'executing' : state.executionBlockers.length ? 'blocked' : statuses.length && statuses.every(s=>s==='verified') ? 'verified' : statuses.some(s=>['failed','stale','blocked'].includes(s)) ? 'blocked' : statuses.includes('pending_acceptance') ? 'pending_acceptance' : 'approved';
  }
  return state;
}
async function mutate(project,id,action) {
  const dir = await taskDirectory(project,id);
  return locked(dir,async()=>{
    const {c,state} = await read(project,id);
    await refresh(project,dir,c,state);
    try { const result = await action(dir,c,state); await writeJson(path.join(dir,'state.json'),state); return result; }
    catch (e) {
      try{await writeJson(path.join(dir,'state.json'),state);}catch(statePersistenceError){throw Object.assign(new Error(`${formatRuntimeError(e)}; state persistence also failed: ${formatRuntimeError(statePersistenceError)}. Preserve original execution and receipt evidence.`,{cause:e}),{actionError:e,statePersistenceError});}
      throw e;
    }
  });
}
export async function status(project,id) { const {dir,c,state} = await read(project,id); return {...await refresh(project,dir,c,state),derivedAt:now(),persisted:false}; }
export async function taskContext(project,id,step,options={}) {
  const {dir,c,state}=await read(project,id);
  await refresh(project,dir,c,state);
  return {...await buildTaskContext(project,dir,c,state,step,options),persisted:false};
}
export async function render(project,id) {
  return mutate(project,id,async(dir,c,state)=>{
    validateContract(c);
    const file=await contained(dir,'HARNESS.md');
    if(await exists(file)&&(await fs.lstat(file)).isSymbolicLink())throw new Error('HARNESS.md must be a regular file, not a symbolic link. No target was written.');
    await atomicWrite(file,renderContract(c));
    await refresh(project,dir,c,state);
    return {file:path.join(dir,'HARNESS.md'),phase:state.phase};
  });
}
export async function prepareReview(project,id) {
  return mutate(project,id,async(dir,c,state)=>{
    if(state.activeExecutions.length||state.executionBlockers.length)throw new Error('An active or ambiguous execution must be factually closed before review; preserve its original runId.');
    if(Object.values(state.tasks).some(t=>t.status==='pending_acceptance'))throw new Error('A pending acceptance must be resolved before review; do not reset its receipt.');
    const files = await reviewSnapshot(project,dir,c);
    const reviewDigest = hash(JSON.stringify(files));
    if (state.review && state.review.digest !== reviewDigest && c.revision <= state.review.revision) throw new Error('Increment contract.revision after changing a reviewed package.');
    state.review = {digest:reviewDigest,revision:c.revision,files,preparedAt:now()};
    state.approval = null; state.phase = 'pending_user_review'; delete state.blocker;
    state.tasks = Object.fromEntries(c.tasks.map(t=>[t.id,{status:'todo'}]));
    event(state,'review_prepared',{digest:reviewDigest,revision:c.revision});
    return {phase:state.phase,taskId:id,revision:c.revision,digest:reviewDigest,reviewFile:path.join(dir,'HARNESS.md'),identityAuthentication:false};
  });
}
export async function recordDecision(project,id,record) {
  return mutate(project,id,async(dir,c,state)=>{
    if (!state.review || state.blocker) throw new Error('Prepare a current review package first.');
    if (record.actor !== 'user' || !['approve','reject','revise'].includes(record.decision) || typeof record.message !== 'string' || !record.message.trim() || typeof record.source !== 'string' || !record.source.trim()) throw new Error('Supply a direct-user decision and a traceable message/source; an assistant cannot self-approve.');
    if (record.taskId !== id || record.revision !== c.revision || record.digest !== state.review.digest) throw new Error('Decision is for a different task, revision or review digest.');
    state.approval = record.decision === 'approve' ? {...record,recordedAt:now(),identityAuthenticated:false} : null;
    state.phase = record.decision === 'approve' ? 'approved' : record.decision === 'reject' ? 'rejected' : 'pending_user_review';
    event(state,'user_decision',{decision:record.decision,source:record.source,digest:record.digest});
    return {phase:state.phase,identityAuthenticated:false};
  });
}
function assertNoActiveExecution(state,action) {
  if(state.activeExecutions.length||state.executionBlockers.length)throw Object.assign(new Error(`Another writing task is executing or active; cannot ${action}. ${[...state.activeExecutions.map(r=>`${r.step}/${r.runId}`),...state.executionBlockers].join('; ')}`),{code:'HARNESS_ACTIVE_EXECUTION'});
}
function ready(c,state,id) {
  assertNoActiveExecution(state,'begin another run');
  if (!state.approval || state.phase === 'pending_user_review') throw new Error('User review/approval is required before formal execution.');
  const task = c.tasks.find(t=>t.id===id);
  if (!task) throw new Error(`Unknown task ${id}.`);
  if (Object.entries(state.tasks).some(([other,s])=>other!==id && s.status==='executing')) throw new Error('Another writing task is executing; this runtime serializes writers.');
  const s = state.tasks[id];
  if (!s || !['todo','failed','stale','blocked'].includes(s.status)) throw new Error(`Task ${id} is ${s?.status}; cannot begin another run.`);
  const failed = task.dependsOn.filter(dep=>state.tasks[dep]?.status!=='verified');
  if (failed.length) throw new Error(`Dependencies need current acceptance: ${failed.join(', ')}`);
  return task;
}
export async function begin(project,id,step,options={}) {
  let candidate;
  try{return await mutate(project,id,async(dir,c,state)=>{
    ready(c,state,step);
    const executionBinding=makeExecutionBinding(selectHost(c,options.host),options.mode??'native');
    const runId = randomUUID();
    candidate={runId,reviewDigest:state.review.digest,executionBinding};
    const history=state.tasks[step]?.acceptanceAttempts;
    state.tasks[step] = {status:'executing',runId,startedAt:now(),reviewDigest:state.review.digest,executionBinding,...(history?{acceptanceAttempts:history}:{})};
    state.activeExecutions.push({step,runId,startedAt:state.tasks[step].startedAt,reviewDigest:state.review.digest,executionBinding});
    state.phase = 'executing'; event(state,'begin',{step,runId,reviewDigest:state.review.digest,executionBinding});
    return {phase:'executing',runId,reviewDigest:state.review.digest,executionBinding,...(c.layout==='layered'||c.templateVersion===4?{submission:nativeSubmissionAction(project,id,step,runId,executionBinding.executor)}:{})};
  });}catch(e){if(candidate)e.beginCandidate=candidate;throw e;}
}
// Canonical caller facts preserve unknown JSON fields; runtime bindings are checked separately.
const bindingFields=new Set(['taskId','step','reviewDigest','acceptedForVerification']);
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
function callerFacts(value){const copy=JSON.parse(JSON.stringify(value));for(const k of bindingFields)delete copy[k];copy.outcome??='not-applicable';return JSON.stringify(canonical(copy));}
async function publishReceipt(file,value){
 const temp=`${file}.${randomUUID()}.tmp`;let handle,created=false,published=false;const errors=[];
 try{
  handle=await fs.open(temp,'wx');created=true;
  await handle.writeFile(`${JSON.stringify(value,null,2)}\n`);
  const opened=handle;handle=null;await opened.close();
  await fs.link(temp,file);published=true; // exclusive, never overwrites an existing final
 }catch(e){errors.push(e);}
 if(handle)try{await handle.close();}catch(e){errors.push(e);}
 if(created)try{await fs.unlink(temp);}catch(e){errors.push(e);}
 if(errors.length)throw Object.assign(new Error(`${errors.map(e=>e.message).join('; ')}. Receipt published: ${published}; final: ${file}; temporary: ${temp}. Preserve complete final evidence for same-run recovery.`),{receiptPublished:published,causes:errors.map(e=>e.message)});
}
export async function submit(project,id,step,receipt,{sourceFile}={}) {
 return mutate(project,id,async(dir,c,state)=>{
  if(!receipt||typeof receipt!=='object'||typeof receipt.runId!=='string'||typeof receipt.reference!=='string'||!receipt.reference.trim()||!['ok','failed'].includes(receipt.result))throw new Error('Receipt needs actual host executor, execution reference, runId and result.');
  executorProfile(receipt.executor);
  if(!['not-applicable','positive','negative','opposite','inconclusive'].includes(receipt.outcome??'not-applicable'))throw new Error('Invalid result outcome.');
  const begins=state.events.filter(e=>e.type==='begin'&&e.runId===receipt.runId);
  const active=state.activeExecutions.find(r=>r.step===step&&r.runId===receipt.runId);
  const closed=deriveExecutions(state).closures.filter(e=>e.runId===receipt.runId);
  if(begins.length>1||begins.some(e=>e.step!==step)||closed.some(e=>e.step!==step)||closed.length>1)throw new Error('Ambiguous or conflicting original run identity; inspect evidence without clearing active execution.');
  if(!active&&!closed.length)throw new Error('No matching active or factually closed execution.');
  const original=active??begins[0]??closed[0];
  if(!original)throw new Error('Original run identity is unavailable; inspect legacy evidence.');
  const execution=resolveExecutionBinding(state,step,receipt.runId,deriveExecutions(state).closures);
  if(execution.conflicts.length)throw new Error(execution.conflicts.join('; '));
  if(execution.binding?receipt.executor!==execution.binding.executor:!['codex-native','codex-cli'].includes(receipt.executor))throw new Error('Receipt executor conflicts with the original host/mode binding; legacy unbound runs retain Codex facts only. Preserve the original active run.');
  let task=state.tasks[step];
   const binding=resolveRunBinding(state,step,receipt.runId,deriveExecutions(state).closures);
   if(binding.conflicts.length)throw new Error(binding.conflicts.join('; '));
   const originalDigest=binding.digest;
  const file=await contained(dir,`receipt-${receipt.runId}.json`);
  if(sourceFile){
   const key=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
   let conflict=key(sourceFile)===key(file);
   if(!conflict&&await exists(file)){
    const [sr,tr,ss,ts]=await Promise.all([fs.realpath(sourceFile),fs.realpath(file),fs.stat(sourceFile,{bigint:true}),fs.stat(file,{bigint:true})]);
    conflict=key(sr)===key(tr)||(ss.ino!==0n&&ss.dev===ts.dev&&ss.ino===ts.ino);
   }
   if(conflict)throw Object.assign(new Error('Submission input aliases the runtime-owned receipt destination. Use inline submit fields (help submit), or a separate input payload. No file was moved, removed or overwritten.'),{code:'HARNESS_SUBMISSION_SOURCE_CONFLICT'});
  }
   for(const [k,v] of [['taskId',id],['step',step]])if(k in receipt&&receipt[k]!==v)throw new Error(`Conflicting receipt binding: ${k}`);
   if(binding.known&&'reviewDigest'in receipt&&receipt.reviewDigest!==originalDigest)throw new Error('Conflicting receipt binding: reviewDigest');
  const spec=c.tasks.find(t=>t.id===step);
  const eligible=()=>!!(state.approval&&!state.blocker&&spec&&task?.runId===receipt.runId&&task.reviewDigest===state.review?.digest&&originalDigest===state.review?.digest&&spec.dependsOn.every(dep=>state.tasks[dep]?.status==='verified'));
  let replayed=await exists(file),savedReceipt;
  if(replayed){
   const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`Receipt must be a regular runtime-owned file: ${file}`);
   const expected=[...(task?.runId===receipt.runId&&task.receipt?[task.receipt]:[]),...closed.filter(e=>e.receiptSha256).map(e=>({sha256:e.receiptSha256}))];
   const sha=await digest(file);if(expected.some(e=>e.sha256!==sha))throw new Error(`Receipt digest conflict: ${file}. Preserve the original evidence.`);
   try{savedReceipt=await json(file);}catch(e){throw new Error(`Malformed or partial receipt at ${file}: ${e.message}. Preserve it for inspection.`);}
    if(!savedReceipt||savedReceipt.runId!==receipt.runId||('taskId'in savedReceipt&&savedReceipt.taskId!==id)||('step'in savedReceipt&&savedReceipt.step!==step)||(binding.known&&savedReceipt.reviewDigest!=null&&savedReceipt.reviewDigest!==originalDigest))throw new Error(`Receipt identity/review conflict: ${file}`);
    if(!binding.known&&receipt.reviewDigest!=null&&receipt.reviewDigest!==savedReceipt.reviewDigest)throw new Error('Conflicting observed receipt reviewDigest');
   if(callerFacts(savedReceipt)!==callerFacts(receipt))throw new Error(`Conflicting caller facts for existing receipt: ${file}`);
  }else{
   if(!active)throw new Error(`Closed execution receipt is missing: ${file}`);
    if(!binding.known&&receipt.reviewDigest!=null)throw new Error('Unknown original review binding; caller cannot supply approval provenance.');
   savedReceipt={...receipt,taskId:id,step,reviewDigest:originalDigest,acceptedForVerification:eligible()&&task.status==='executing'};
   await publishReceipt(file,savedReceipt);
  }
  const saved={path:file,sha256:await digest(file)};
   const accepted=eligible()&&binding.known&&savedReceipt.reviewDigest===originalDigest&&savedReceipt.acceptedForVerification===true;
  if(!active)return {phase:accepted&&task?.runId===receipt.runId?task.status:'stale',receipt:saved,executionClosed:true,replayed:true,acceptedForVerification:accepted&&closed[0]?.acceptedForVerification===true&&task?.runId===receipt.runId&&['pending_acceptance','verified','failed'].includes(task.status)};
  if(!task||!task.runId)task=state.tasks[step]={...task,status:'stale',runId:receipt.runId,startedAt:active.startedAt,reviewDigest:originalDigest};
  const allowed=accepted&&task.status==='executing';
  if(task.runId===receipt.runId){
   task.receipt=saved;task.outcome=receipt.outcome??'not-applicable';task.finishedAt=now();
   task.status=allowed?(receipt.result==='ok'?'pending_acceptance':'failed'):'stale';
   if(!allowed)task.reason='Execution factually closed after its approval, dependency or task identity became stale; result is not accepted.';
  }
  state.activeExecutions=state.activeExecutions.filter(r=>r.runId!==receipt.runId);
   event(state,'execution_receipt',{step,runId:receipt.runId,reviewDigest:originalDigest,reviewBinding:bindingRecord(binding),...(execution.binding?{executionBinding:execution.binding}:{}),receiptReviewDigest:savedReceipt.reviewDigest??null,result:receipt.result,reference:receipt.reference,acceptedForVerification:allowed,receiptSha256:saved.sha256});
  await refresh(project,dir,c,state);
  return {phase:allowed?task.status:'stale',receipt:saved,executionClosed:true,replayed,acceptedForVerification:allowed,warning:'Receipt records an actual end, not process cancellation, acceptance or identity authentication. A stale closure does not restore approval.'};
 });
}
function assertOriginalRun(c,state,step,started) {
  const b=resolveRunBinding(state,step,started.runId,deriveExecutions(state).closures);
  const execution=resolveExecutionBinding(state,step,started.runId,deriveExecutions(state).closures);
  if(execution.conflicts.length||!execution.binding||execution.binding.executor!==started.executionBinding?.executor||selectHost(c,execution.binding.host)!==execution.binding.host)throw new Error('Original host/mode binding is no longer valid; execution was not started.');
  const s=state.tasks[step],t=c.tasks.find(t=>t.id===step),a=state.approval;
  if(!a||state.blocker||a.actor!=='user'||a.decision!=='approve'||a.taskId!==c.taskId||a.revision!==c.revision||a.digest!==started.reviewDigest||state.review?.digest!==started.reviewDigest||!b.known||b.digest!==started.reviewDigest||b.conflicts.length||s?.runId!==started.runId||s.status!=='executing'||!t||t.dependsOn.some(id=>state.tasks[id]?.status!=='verified')||state.executionBlockers.length||state.activeExecutions.length!==1||state.activeExecutions[0].runId!==started.runId)throw new Error('Original run approval, identity, review snapshot or dependencies are no longer valid; execution was not started.');
}
async function prepareRunInput(project,id,step,started) {
  const initial=await read(project,id);await refresh(project,initial.dir,initial.c,initial.state);
  assertOriginalRun(initial.c,initial.state,step,started);
  const layered=initial.c.layout==='layered';
  const context=layered?await buildTaskContext(project,initial.dir,initial.c,initial.state,step):null;
  const body=layered?JSON.stringify(context,null,2):renderContract(initial.c);
  const masterPath=context?await fs.realpath(context.master.path):null;
  const prompt=`Use the approved task harness at ${path.join(initial.dir,'HARNESS.md')}. Task ${step}, runId ${started.runId}, review digest ${started.reviewDigest}. This run has already begun; execute this run rather than starting another. Execute only this task's authorized scope with available native ${hostProfile(started.executionBinding.host).label} tools. User permission is limited by the reviewed contract and actual chat authorization; ask when needed. Do not change review files or state, self-approve, invoke a second orchestrator, install packages, or report verified. Do not submit or verify this run yourself; the supervisor records actual completion after this process closes. Report actual changes, evidence, failures and negative findings.\n\n${body}`;
  const last=await read(project,id);await refresh(project,last.dir,last.c,last.state);assertOriginalRun(last.c,last.state,step,started);
  if(hash(JSON.stringify(initial.c))!==hash(JSON.stringify(last.c)))throw new Error('Prepared contract changed before launch.');
  const pathKey=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
  if(context)for(const file of context.files){const bound=last.state.review.files.find(f=>pathKey(f.path)===pathKey(file.path));if(!bound||hash(Buffer.from(file.text,'utf8'))!==bound.sha256)throw new Error(`Prepared context differs from approved file: ${file.path}`);}
  if(context&&context.master.sha256!==last.state.review.files.find(f=>pathKey(f.path)===pathKey(masterPath))?.sha256)throw new Error('Prepared master differs from approval.');
  return prompt;
}
export async function run(project,id,step,options={}) {
  if(options.timeoutMs!==undefined&&(!Number.isFinite(options.timeoutMs)||options.timeoutMs<=0))throw new Error('timeoutMs must be positive when specified.');
  const initial=await read(project,id),host=selectHost(initial.c,options.host);
  if(options.codex!==undefined&&options.executable!==undefined)throw new Error('Do not combine --codex and --executable.');
  if(options.codex!==undefined&&host!=='codex')throw new Error('--codex is a Codex-only executable alias.');
  const invocation=await resolveHostExecutable(host,options.executable??options.codex);const dir=initial.dir;
  let started,result,originalError,beginPersisted=true;
  try{started=await begin(project,id,step,{host,mode:'cli'});}catch(e){
    originalError=e;started=e.completedResult?.runId?e.completedResult:e.beginCandidate;
    if(!started)throw e;
    beginPersisted=e.completedResult?.runId?true:'unknown';
    if(beginPersisted!==true)try{const r=await read(project,id);beginPersisted=r.state.events.some(x=>x.type==='begin'&&x.step===step&&x.runId===started.runId);}catch{}
    result={processState:'not-started',pid:null,code:null,exitCode:null,signal:null,error:formatRuntimeError(e),errorStage:'begin',timedOut:false,outputBytes:0};
  }
  const log=path.join(dir,`execution-${started.runId}.jsonl`);
  const outputObserver=hostOutputObserver(host);
  const recovery=extra=>Object.assign(new Error(`Execution ${step}/${started.runId}: ${result?.error??'factual closure failed'}. Preserve the original run and submission facts.`,{cause:originalError}),{runId:started.runId,reviewDigest:started.reviewDigest,beginPersisted,processResult:result,...extra});
  if(beginPersisted!==true)throw recovery({executionClosed:false,closureError:'Begin persistence is unconfirmed or absent; inspect this candidate without restarting.'});
  if(!result){
    const args=[...invocation.prefix,...hostRunArgs(host)];
    try{result=await runProcess(invocation.command,args,{cwd:project,log,timeoutMs:options.timeoutMs,prepareInput:()=>prepareRunInput(project,id,step,started),launchGuard:action=>locked(dir,action),...(outputObserver?{stdoutObserver:outputObserver.write}:{})});}
    catch(e){originalError=e;result=e?.processResult??{processState:'unknown-active',code:null,error:e?.message??String(e)};}
  }
  if(!['closed','not-started'].includes(result.processState))throw recovery({executionClosed:false});
  if(outputObserver&&result.processState==='closed'){
    const hostProtocol=outputObserver.finish();result={...result,hostProtocol};
    if(!hostProtocol.ok)result={...result,error:[result.error,...hostProtocol.errors].filter(Boolean).join('; '),errorStage:result.errorStage??'host-protocol'};
  }
  const logs=[];try{if(await exists(log))logs.push({path:log,sha256:await digest(log)});}catch(e){result={...result,error:[result.error,`log-digest: ${e.message}`].filter(Boolean).join('; '),errorStage:result.errorStage??'log-digest'};}
  const submissionFacts={runId:started.runId,executor:executorFor(host,'cli'),reference:log,result:result.code===0&&!result.error&&!result.controlErrors?.length?'ok':'failed',process:result,logs,outcome:'not-applicable'};
  let closureResult;
  try{closureResult=await submit(project,id,step,submissionFacts);}catch(closureError){throw recovery({submissionFacts,executionClosed:closureError.completedResult?.executionClosed===true,closureResult:closureError.completedResult??null,closureError});}
  if(originalError&&result.processState==='not-started')throw recovery({submissionFacts,executionClosed:true,closureResult});
  return closureResult;
}
export async function verify(project,id,step,reviews={}) {
  return mutate(project,id,async(dir,c,state)=>{
    const task = c.tasks.find(t=>t.id===step); const s = state.tasks[step];
    if(!task||!s||!s.runId)throw new Error('An approved execution with pending acceptance is required.');
    const attemptId=randomUUID(),startedAt=now(),evidence=[],checks=[];
    let criterionId='preflight',lastLog=null,exitCode=null,processResult=null,next='Inspect this recorded failure and its original evidence, correct the evidenced cause, then repeat affected acceptance without changing the approved method.';
    const recordAttempt=async(status,error=null)=>{
      const record={attemptId,runId:s.runId,reviewDigest:state.review?.digest??null,at:startedAt,finishedAt:now(),status,criterion:criterionId,error,log:lastLog,exitCode,processResult,next:status==='failed'?next:null,receipt:s.receipt??null,checks,evidence:[...evidence],outcome:s.outcome};
      const report=path.join(dir,`acceptance-${s.runId}-${randomUUID()}.json`);
      try {await fs.writeFile(report,`${JSON.stringify(record,null,2)}\n`,{flag:'wx'});record.report={path:report,sha256:await digest(report)};}
      catch(e){if(status==='passed')throw e;record.report=null;record.reportError=e.message;}
      (s.acceptanceAttempts??=[]).push(record);s.lastAcceptance=record;
      event(state,'acceptance_attempt',{step,runId:s.runId,attemptId,status,criterion:criterionId,report:record.report?.path??null,log:lastLog,error});
      return record;
    };
    try {
      criterionId='execution-guard';next='Observe the original execution until its actual close, then submit its original step/runId and factual evidence before retrying verify. Do not clear active identities, restart the task or automatically remove locks.';
      assertNoActiveExecution(state,'verify while an original execution remains active or ambiguous');
      criterionId='preflight';next='Inspect this recorded failure and its original evidence, correct the evidenced cause, then repeat affected acceptance without changing the approved method.';
      if (!state.approval || s.status !== 'pending_acceptance') throw new Error('An approved execution with pending acceptance is required.');
      if (task.dependsOn.some(dep=>state.tasks[dep]?.status !== 'verified')) throw new Error('Dependency verification is stale.');
      if ((await digest(s.receipt.path)) !== s.receipt.sha256) throw new Error('Execution receipt changed.');
      const receipt = await json(s.receipt.path);evidence.push(s.receipt);
      for (const file of receipt.logs ?? []) { if (await digest(file.path) !== file.sha256) throw new Error(`Execution log changed: ${file.path}`); evidence.push(file); }
      for (const id of task.outputs) {
        const d = c.deliverables.find(x=>x.id===id); const file = await contained(project,d.path);
        if (!(await fs.stat(file)).isFile()) throw new Error(`Expected file artifact: ${d.path}`);
        evidence.push({path:file,sha256:await digest(file)});
      }
      for (const criterion of task.acceptance) {
        criterionId=criterion.id;lastLog=null;exitCode=null;processResult=null;
        next=criterion.failureAction??'Inspect this criterion and its recorded evidence, correct only the evidenced cause, then repeat affected acceptance; revise the review if the method changes.';
        if (criterion.type === 'command') {
          const log = path.join(dir,`check-${s.runId}-${criterion.id}-${randomUUID()}.txt`);
          let result,processError;
          try{result=await runProcess(criterion.command,criterion.args,{cwd:project,log,timeoutMs:criterion.timeoutMs});}
          catch(e){processError=e;result=e.processResult??{processState:'unknown-active',code:null,error:e.message};}
          processResult=result;exitCode=result.exitCode??null;
          try{if(await exists(log)){lastLog={path:log,sha256:await digest(log)};evidence.push(lastLog);}}
          catch(e){processError=new Error([processError?.message,`log-digest: ${e.message}`].filter(Boolean).join('; '));}
          if(processError)throw processError;
          if (result.code !== 0) throw new Error(`Acceptance ${criterion.id} failed (exit ${result.code}). ${result.error??''} Evidence: ${log}. Next: ${next} See: ${(c.contextFiles??[]).filter(d=>d.kind==='phase'&&d.tasks.includes(step)).map(d=>d.path).join(', ')||'HARNESS.md'}; references/recovery-maintenance.md.`);
          checks.push({id:criterion.id,type:'command',result});
        } else if (criterion.type === 'review') {
          const r = reviews[criterion.id];
          if (!r || r.verdict !== 'pass' || !r.reviewer || !r.source || !r.rationale || !Array.isArray(r.files) || !r.files.length) throw new Error(`Acceptance ${criterion.id} needs a traceable evidence review, rationale and files.`);
          for (const relative of r.files) { const file=await contained(project,relative); evidence.push({path:file,sha256:await digest(file)}); }
          checks.push({id:criterion.id,type:'review',record:r,independenceClaim:r.independence??'not established'});
        } else checks.push({id:criterion.id,type:'artifact',result:'Declared outputs exist; semantic validity is not established by existence.'});
      }
      const accepted=await recordAttempt('passed');evidence.push(accepted.report);
      s.status='verified';s.evidence=evidence;s.acceptedAt=now();event(state,'acceptance',{step,runId:s.runId,report:accepted.report.path});
      await refresh(project,dir,c,state);
      return {phase:state.phase,taskStatus:s.status,outcome:s.outcome,report:accepted.report.path,checks};
    } catch(e) {
      const attempt=await recordAttempt('failed',e.message);
      if(criterionId==='execution-guard'&&attempt.reportError)e.recovery={operation:'verify',stage:'execution-guard',acceptanceReportError:attempt.reportError};
      throw e;
    }
  });
}
