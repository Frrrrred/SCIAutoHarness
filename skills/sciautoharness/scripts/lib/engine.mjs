import fs from 'node:fs/promises';
import path from 'node:path';
import {assertRecord,assertStructure,envelope,canonicalJson,parseJsonBytes,canonical} from './identity.mjs';
import { randomUUID } from 'node:crypto';
import { atomicWrite, contained, digest, exists, hash, json, locked, now, safeId, writeJson, formatRuntimeError } from './files.mjs';
import { renderContract, reviewSnapshot, skeleton, validateContract, canonicalEvidencePath } from './contract.mjs';
import { processSucceeded, runProcess } from './process.mjs';
import { buildTaskContext, nativeSubmissionAction, staleReworkDecision, contextSourceChanged } from './context.mjs';
import {executionPolicy,draftPolicy,selectHost,executionBinding as makeExecutionBinding,validateExecutionBinding,executorProfile,executorFor,hostProfile,hostRunArgs,resolveHostExecutable,hostOutputObserver} from './hosts.mjs';
import {checkHarnessPaths,capturePackageDocuments} from '../check-harness-paths.mjs';

class SubmissionSourceChanged extends Error{constructor(message){super(message);this.name='SubmissionSourceChanged';this.code='HARNESS_SUBMISSION_SOURCE_CHANGED';}}
class AcceptanceSourceChanged extends Error{constructor(message,cause){super(message,cause);this.name='AcceptanceSourceChanged';this.code='HARNESS_ACCEPTANCE_SOURCE_CHANGED';}}
async function captureStateVersion(dir,initialSources){
 let file,value;
 try{file=await stableEvidenceFile(path.join(dir,'state.json'),{multiLink:true});value=parseJsonBytes(file.bytes);if(initialSources&&canonicalJson(value)!==initialSources.state)throw new AcceptanceSourceChanged('Current state changed between the locked read and acceptance; preserve the newer state and obtain fresh evidence.');}
 catch(error){if(error instanceof AcceptanceSourceChanged)throw error;if(initialSources)throw new AcceptanceSourceChanged('Cannot revalidate the current state read under the acceptance lock; preserve its bytes and obtain fresh evidence.',{cause:error});throw error;}
 return {file,value};
}

export async function taskDirectory(project,id){return contained(project,path.join('harness',safeId(id)));}
export async function draft(project,id,goal,domain='general',options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['host','allowHosts'].includes(k)))throw new Error('Draft accepts current host/allowHosts options only.');
 const policy=draftPolicy(options),c=skeleton(id,goal,domain);c.execution=policy;assertRecord(c,'contract');
 const dir=await taskDirectory(project,id);if(await exists(dir))throw new Error('Task already exists; preserve its current records.');
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'contract.json'),JSON.stringify(c,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(path.join(dir,'HARNESS.md'),renderContract(c),{flag:'wx'});
 await writeJson(path.join(dir,'state.json'),envelope('state',{taskId:id,phase:'draft',tasks:{},events:[{type:'draft',at:now()}]}));
 return {phase:'draft',directory:dir,next:'Fill the complete current contract and documents, scan and prepare review; formal work waits for the final user.'};
}
function assertStateRunSources(state){
 const begins=state.events.filter(e=>e.type==='begin'),known=new Set(begins.map(e=>e.runId));
 for(const [step,cache]of Object.entries(state.tasks))if(cache.status==='executing'&&!cache.runId&&!begins.some(b=>b.step===step&&!state.events.some(e=>e.type==='execution_receipt'&&e.runId===b.runId)))throw new Error('Current executing task has no complete active original begin: '+step+'; preserve bytes and handles for manual recovery.');
 for(const r of [...Object.values(state.tasks),...(state.activeExecutions??[]),...state.events.filter(e=>['execution_receipt','process_observed','rework_requested','acceptance','acceptance_attempt'].includes(e.type))]){
  const runId=r.runId??r.fromRunId;if(runId&&!known.has(runId))throw new Error('Current state has no complete original begin for '+runId+'; preserve bytes and handles for manual recovery.');
 }
 for(const b of begins){
  validateExecutionBinding(b.executionBinding);processObservationFor(state,b.step,b.runId);
  const closures=state.events.filter(e=>e.type==='execution_receipt'&&e.runId===b.runId),review=resolveRunBinding(state,b.step,b.runId,closures),execution=resolveExecutionBinding(state,b.step,b.runId,closures);
  if(!review.known||review.conflicts.length||!execution.binding||execution.conflicts.length)throw new Error('Conflicting current run bindings '+b.step+'/'+b.runId+': '+[...review.conflicts,...execution.conflicts].join('; ')+'; preserve original bytes for recovery.');
 }
 for(const [step,cache]of Object.entries(state.tasks))if(cache.runId&&begins.some(b=>b.runId===cache.runId&&b.step!==step))throw new Error('Task cache step conflicts with original begin '+cache.runId);
 return state;
}
async function read(project,id,{allowDamaged=false}={}){
 const dir=await taskDirectory(project,id),state=assertStateRunSources(await json(path.join(dir,'state.json'),'state'));
 if(state.taskId!==id)throw new Error('Current state task identity mismatch.');
 let c,contractError=null;
 try{c=await json(path.join(dir,'contract.json'),'contract');if(c.taskId!==id)throw new Error('Current contract task identity mismatch.');executionPolicy(c);if(state.events.some(e=>e.type==='begin'))validateContract(c);}
 catch(e){if(!allowDamaged||!state.events.some(e=>e.type==='begin'))throw e;contractError=e;c=null;}
 return {dir,c,state,contractError};
}
function event(state,type,details={}){state.events.push({at:now(),type,...details});}
function reworkRecords(state,step,runId){return state.events.filter(e=>e.type==='rework_requested'&&e.step===step&&(runId===undefined||e.fromRunId===runId));}
function resolveRunBinding(state,step,runId,closures=[]){
 const begins=state.events.filter(e=>e.type==='begin'&&e.runId===runId),conflicts=[];
 if(begins.length!==1||begins[0].step!==step)conflicts.push('A unique complete original begin is required');
 const digest=begins.length===1?begins[0].reviewDigest:null;
 const task=state.tasks[step];
 for(const source of [...closures.filter(e=>e.runId===runId),...state.events.filter(e=>e.type==='process_observed'&&e.runId===runId),...reworkRecords(state,step,runId),...(task?.runId===runId?[task]:[]),...(state.activeExecutions??[]).filter(e=>e.runId===runId)])if(source.reviewDigest!==undefined&&source.reviewDigest!==digest)conflicts.push('Conflicting original review binding');
 return {digest:conflicts.length?null:digest,known:!!digest&&!conflicts.length,source:'begin',conflicts:[...new Set(conflicts)]};
}
const bindingRecord=b=>{if(!b.known)throw new Error('Unknown original begin review binding.');return {status:'known',source:'begin'};};
function resolveExecutionBinding(state,step,runId,closures=[]){
 const begins=state.events.filter(e=>e.type==='begin'&&e.runId===runId),conflicts=[],observed=[];
 if(begins.length!==1||begins[0].step!==step)conflicts.push('A unique complete original begin is required');
 const sources=[...begins,...closures.filter(e=>e.runId===runId),...state.events.filter(e=>e.type==='process_observed'&&e.runId===runId),...reworkRecords(state,step,runId),...(state.tasks[step]?.runId===runId?[state.tasks[step]]:[]),...(state.activeExecutions??[]).filter(e=>e.runId===runId)];
 for(const source of sources)if(source.executionBinding!==undefined&&source.executionBinding!==null)try{observed.push(validateExecutionBinding(source.executionBinding));}catch(e){conflicts.push(e.message);}
 if(new Set(observed.map(canonicalJson)).size>1)conflicts.push('Conflicting original host/mode/executor bindings.');
 return {binding:conflicts.length?null:observed[0]??null,conflicts:[...new Set(conflicts)]};
}
function processObservationFor(state,step,runId){
 const rows=state.events.filter(e=>e.type==='process_observed'&&e.runId===runId);if(!rows.length){if((state.activeExecutions??[]).some(r=>r.runId===runId&&r.processObservation!==undefined))throw new Error('Cached process observation has no matching source event.');return null;}
 const begins=state.events.filter(e=>e.type==='begin'&&e.runId===runId),b=begins[0];
 if(rows.length!==1||begins.length!==1||b.step!==step||b.executionBinding.mode!=='cli'||b.closureProtocol!=='explicit-business-end')throw new Error('Ambiguous process observation or original CLI controller protocol; preserve the original controller.');
 const e=rows[0];if(e.step!==step||e.reviewDigest!==b.reviewDigest||canonicalJson(e.executionBinding)!==canonicalJson(b.executionBinding)||e.process.processState!=='closed')throw new Error('Process observation conflicts with the original execution.');
 const observation={at:e.at,process:structuredClone(e.process),logs:structuredClone(e.logs),reference:e.reference};
 for(const cached of state.activeExecutions??[])if(cached.runId===runId&&cached.processObservation!==undefined&&canonicalJson(cached.processObservation)!==canonicalJson(observation))throw new Error('Cached process observation conflicts with its original event.');
 return observation;
}
async function observeProcessEnd(project,id,step,started,process,logs,reference){
 return mutate(project,id,async(dir,c,state)=>{
  const begins=state.events.filter(e=>e.type==='begin'&&e.runId===started.runId),b=begins[0];
  if(begins.length!==1||b.step!==step||b.closureProtocol!=='explicit-business-end'||b.reviewDigest!==started.reviewDigest||canonicalJson(b.executionBinding)!==canonicalJson(started.executionBinding)||b.executionBinding.mode!=='cli'||!state.activeExecutions.some(r=>r.runId===started.runId))throw new Error('Original active CLI run is unavailable for process observation.');
  assertStructure(process,'observedProcessFacts');
  const old=processObservationFor(state,step,started.runId);
  if(old){if(canonicalJson({process:old.process,logs:old.logs,reference:old.reference})!==canonicalJson({process,logs,reference}))throw new Error('Conflicting original process observation.');return old;}
  event(state,'process_observed',{step,runId:started.runId,reviewDigest:b.reviewDigest,executionBinding:b.executionBinding,process,logs,reference});
  if(c)await refresh(project,dir,c,state);else deriveExecutions(state);
  return processObservationFor(state,step,started.runId);
 },{allowDamaged:true});
}
async function normalizedSubmission(dir,state,id,step,raw,replayed){
 validateSubmissionShape(raw);const original=originalSubmission(state,id,step,raw),profile=executorProfile(raw.executor);
 let input=raw;
 if(profile.mode==='cli'){
  const observation=processObservationFor(state,step,raw.runId);
  if(observation){
   if(raw.process!==undefined&&canonicalJson(raw.process)!==canonicalJson(observation.process))throw new Error('Caller process conflicts with the original observation.');
   if(raw.logs!==undefined&&canonicalJson(raw.logs)!==canonicalJson(observation.logs))throw new Error('Caller logs conflict with the original observation.');
   if(raw.kind==='submission')input={...raw,process:observation.process,logs:observation.logs};
   for(const log of observation.logs){const expected=await contained(dir,path.relative(dir,log.path)),actual=await stableEvidenceFile(expected,{multiLink:true});if(actual.sha256!==log.sha256)throw new Error('Original process observation log changed: '+log.path);}
  }
  if(!original.closed.length&&original.begin.closureProtocol!=='explicit-business-end')throw new Error('This older active CLI run must remain on its original controller.');
  if(input.process?.processState==='closed'&&(!replayed||original.begin.closureProtocol==='explicit-business-end')&&(!input.businessEnd||!input.businessEnd.reference.trim()))throw new Error('Explicit business end evidence is required after observing actual activity end.');
 }
 return validateSubmissionInput(input);
}

function deriveExecutions(state){
 const active=new Map(),closed=new Set(),closures=[],problems=[];
 for(const e of state.events){
  if(e.type==='begin'&&!closed.has(e.runId)&&!active.has(e.runId))active.set(e.runId,{step:e.step,runId:e.runId,startedAt:e.at,reviewDigest:e.reviewDigest,executionBinding:e.executionBinding});
  if(e.type!=='execution_receipt')continue;
  const begins=state.events.filter(b=>b.type==='begin'&&b.runId===e.runId);
  if(begins.length!==1||begins[0].step!==e.step||closed.has(e.runId)){problems.push('Conflicting original closure '+e.runId);continue;}
  active.delete(e.runId);closed.add(e.runId);closures.push(e);
 }
 for(const r of active.values()){
  const review=resolveRunBinding(state,r.step,r.runId,closures),execution=resolveExecutionBinding(state,r.step,r.runId,closures);
  problems.push(...review.conflicts,...execution.conflicts);
  if(review.known)r.reviewBinding=bindingRecord(review);
  r.executionBinding=execution.binding;r.executionBindingStatus=execution.binding?'known':'conflict';
   const observation=processObservationFor(state,r.step,r.runId),cached=(state.activeExecutions??[]).find(x=>x.runId===r.runId);
   if(cached?.processObservation&&(!observation||canonicalJson(cached.processObservation)!==canonicalJson(observation)))problems.push('Conflicting cached process observation '+r.runId);
   if(observation)r.processObservation=observation;
 }
 for(const cache of state.activeExecutions??[])if(!active.has(cache.runId)&&!closed.has(cache.runId))problems.push('Conflicting cached active execution '+cache.runId);
 state.activeExecutions=[...active.values()];state.executionBlockers=[...new Set(problems)];return {closures};
}
function invalidateAll(state,reason) {
  state.approval = null; state.phase = 'pending_user_review'; state.blocker = reason;
  for (const task of Object.values(state.tasks)) if (task.status !== 'todo') { task.status = 'stale'; task.reason = reason; }
}
const evidenceKey=file=>{const absolute=path.resolve(file);return process.platform==='win32'?absolute.toLowerCase():absolute;};
function evidenceMap(rows,label){
 if(!Array.isArray(rows)||!rows.length)throw new Error(label+': accepted evidence is missing.');
 const result=new Map();
 for(const row of rows){assertStructure(row,'fileDigest');if(!path.isAbsolute(row.path))throw new Error(label+': evidence path must be absolute.');
  const key=evidenceKey(row.path),previous=result.get(key);if(previous&&previous.sha256!==row.sha256)throw new Error(label+': conflicting evidence '+row.path);
  result.set(key,{path:path.resolve(row.path),sha256:row.sha256});}
 return result;
}
async function closedRunFacts(dir,state,id,step,runId){
 const derived=deriveExecutions(state),closed=derived.closures.filter(e=>e.runId===runId),begins=state.events.filter(e=>e.type==='begin'&&e.runId===runId);
 if(begins.length!==1||begins[0].step!==step||closed.length!==1||closed[0].step!==step)throw new Error('A unique factually closed original run is required.');
 const binding=resolveRunBinding(state,step,runId,derived.closures),execution=resolveExecutionBinding(state,step,runId,derived.closures);
 if(!binding.known||binding.conflicts.length||!execution.binding||execution.conflicts.length)throw new Error('Original closed run identity or binding conflicts.');
 const file=await contained(dir,'receipt-'+runId+'.json'),observed=await stableEvidenceFile(file,{multiLink:true}),s=state.tasks[step];
 if(closed[0].receiptSha256!==observed.sha256)throw new Error('Original receipt digest conflict; preserve the evidence.');
 if(s?.runId===runId&&s.receipt&&(evidenceKey(s.receipt.path)!==evidenceKey(file)||s.receipt.sha256!==observed.sha256))throw new Error('Original receipt cache conflicts with its runtime-owned location.');
 const receipt=assertRecord(parseJsonBytes(observed.bytes),'receipt');originalSubmission(state,id,step,receipt);
 if(receipt.result!==closed[0].result||(closed[0].acceptedForVerification===true&&receipt.acceptedForVerification!==true))throw new Error('Original receipt and closure outcome conflict.');
 return{closed:closed[0],binding,execution,receipt,receiptBinding:{path:file,sha256:observed.sha256}};
}
async function readPassedAcceptance(dir,state,step,runId,facts){
 const records=state.events.filter(e=>e.type==='acceptance'&&e.step===step&&e.runId===runId);if(records.length!==1)throw new Error('Unique passed acceptance unavailable: '+step);
 const accepted=records[0];if(!path.isAbsolute(accepted.report))throw new Error('Acceptance report location conflict: '+step);
 const file=path.resolve(accepted.report);
 if(evidenceKey(path.dirname(file))!==evidenceKey(dir)||!path.basename(file).startsWith('acceptance-'+runId+'-')||!file.endsWith('.json'))throw new Error('Acceptance report location conflict: '+step);
 const s=state.tasks[step]?.runId===runId?state.tasks[step]:null;
 const hashes=[accepted.reportSha256,...(s?.evidence??[]).filter(e=>evidenceKey(e.path)===evidenceKey(file)).map(e=>e.sha256),...(s?.acceptanceAttempts??[]).filter(a=>a.status==='passed'&&a.report&&evidenceKey(a.report.path)===evidenceKey(file)).map(a=>a.report.sha256),...(s?.lastAcceptance?.status==='passed'&&s.lastAcceptance.report&&evidenceKey(s.lastAcceptance.report.path)===evidenceKey(file)?[s.lastAcceptance.report.sha256]:[])].filter(Boolean);
 if(!hashes.length||new Set(hashes).size!==1)throw new Error('Acceptance report has no unique trusted digest: '+step);
 const observed=await stableEvidenceFile(file,{multiLink:true});if(observed.sha256!==hashes[0])throw new Error('Acceptance report drift: '+step);
 const report=assertRecord(parseJsonBytes(observed.bytes),'acceptance-report');
 if(report.status!=='passed'||report.error!==null||report.runId!==runId||report.reviewDigest!==facts.binding.digest||!report.receipt||evidenceKey(report.receipt.path)!==evidenceKey(facts.receiptBinding.path)||report.receipt.sha256!==facts.receiptBinding.sha256)throw new Error('Acceptance report binding conflict: '+step);
 return{report,file:{path:file,sha256:observed.sha256}};
}
function validateReworkRecord(record,step,runId,facts){
 if(record.step!==step||record.fromRunId!==runId||!record.requestId?.trim()||!record.reason?.trim()||!record.reference?.trim()||record.reviewDigest!==facts.binding.digest||record.reviewBinding?.status!=='known'||record.reviewBinding?.source!=='begin'||canonicalJson(record.executionBinding)!==canonicalJson(facts.execution.binding)||evidenceKey(record.receipt.path)!==evidenceKey(facts.receiptBinding.path)||record.receipt.sha256!==facts.receiptBinding.sha256)throw new Error('Original rework evidence conflicts.');
}
async function unresolvedPendingRuns(dir,c,state){
 const eligible=deriveExecutions(state).closures.filter(e=>e.acceptedForVerification===true&&e.result==='ok'),unresolved=[];
 for(const e of eligible){let recoverable=false;try{
  const facts=await closedRunFacts(dir,state,c.taskId,e.step,e.runId),requests=reworkRecords(state,e.step,e.runId);
  if(requests.length>1)throw new Error('Ambiguous prior rework identity.');
  if(requests.length){validateReworkRecord(requests[0],e.step,e.runId,facts);continue;}
  recoverable=true;
  await readPassedAcceptance(dir,state,e.step,e.runId,facts);
 }catch(error){unresolved.push({step:e.step,runId:e.runId,reviewDigest:e.reviewDigest,recoverable,reason:error.message});}}
 return unresolved;
}
async function assertVerifiedEvidence(project,dir,c,state,step){
 const s=state.tasks[step],spec=c.tasks.find(t=>t.id===step);
 if(!spec||!s?.runId||!s.acceptedAt||!s.receipt)throw new Error('Verified identity/evidence unavailable: '+step);
 const facts=await closedRunFacts(dir,state,c.taskId,step,s.runId);
 if(facts.closed.acceptedForVerification!==true||facts.closed.result!=='ok'||s.reviewDigest!==facts.binding.digest)throw new Error('Verified original closure or binding unavailable: '+step);
 const cached=evidenceMap(s.evidence,'Verified '+step),accepted=await readPassedAcceptance(dir,state,step,s.runId,facts),expected=evidenceMap([...accepted.report.evidence,accepted.file],'Acceptance '+step);
 if(expected.get(evidenceKey(facts.receiptBinding.path))?.sha256!==facts.receiptBinding.sha256)throw new Error('Receipt absent from acceptance evidence: '+step);
 for(const outputId of spec.outputs){const d=c.deliverables.find(d=>d.id===outputId);if(!expected.has(evidenceKey(path.resolve(project,d.path))))throw new Error('Output absent from acceptance evidence: '+outputId);}
 if(cached.size!==expected.size||[...expected].some(([key,row])=>cached.get(key)?.sha256!==row.sha256))throw new Error('Accepted evidence cache is incomplete: '+step);
 for(const row of expected.values()){const current=await stableEvidenceFile(row.path,{multiLink:true});if(current.sha256!==row.sha256)throw new Error('Accepted evidence changed: '+row.path);}
}

async function refresh(project,dir,c,state) {
  deriveExecutions(state);
  if (state.review) {
    try {
      const current = hash(JSON.stringify(await reviewSnapshot(project,dir,c)));
      if (current !== state.review.digest || c.revision !== state.review.revision) invalidateAll(state,'Review package or bound inputs changed; render and obtain a new user review.');
    } catch (e) { invalidateAll(state,e.message); }
  }
  for (const [step,task] of Object.entries(state.tasks)) {
    if(task.status!=='verified')continue;
    try{await assertVerifiedEvidence(project,dir,c,state,step);}catch(error){task.status='stale';task.reason=error.message;}
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
function recoveryContext(state,id,step,error){
 deriveExecutions(state);
 return envelope('recovery-context',{taskId:id,...(step?{step}:{}),activeExecutions:state.activeExecutions,diagnostics:[error.message,...state.executionBlockers],canBegin:false,acceptedForVerification:false,approvalValid:false,persisted:false,next:'Preserve the original run and handle. After actual end, submit its complete matching current facts for stale closure only; new work requires a valid complete review.',extensions:{knownRuns:state.events.filter(e=>e.type==='begin').map(e=>({step:e.step,runId:e.runId,reviewDigest:e.reviewDigest,executionBinding:e.executionBinding}))}});
}
async function mutate(project,id,action,{allowDamaged=false,verifySources=false}={}){
 const preflight=await read(project,id,{allowDamaged});
 return locked(preflight.dir,async()=>{
  const {dir,c,state,contractError}=await read(project,id,{allowDamaged});
  const initialSources={state:canonicalJson(state),contract:c?canonicalJson(c):null};
  const persist=async()=>{if(verifySources)await captureStateVersion(dir,initialSources);await writeJson(path.join(dir,'state.json'),state);};
  if(contractError){deriveExecutions(state);invalidateAll(state,'Current contract damaged: '+contractError.message);}
  else await refresh(project,dir,c,state);
  try{const result=await action(dir,c,state,contractError,initialSources);await persist();return result;}
  catch(e){if(e instanceof AcceptanceSourceChanged||e instanceof SubmissionSourceChanged)throw e;try{await persist();}catch(statePersistenceError){if(statePersistenceError instanceof AcceptanceSourceChanged)throw Object.assign(new AcceptanceSourceChanged(formatRuntimeError(e)+'; '+statePersistenceError.message,{cause:statePersistenceError}),{actionError:e,statePersistenceError});throw Object.assign(new Error(`${formatRuntimeError(e)}; state persistence also failed: ${formatRuntimeError(statePersistenceError)}. Preserve original execution and receipt evidence.`,{cause:e}),{actionError:e,statePersistenceError});}throw e;}
 });
}
export async function status(project,id){const {dir,c,state,contractError}=await read(project,id,{allowDamaged:true});if(contractError)return recoveryContext(state,id,null,contractError);return {...await refresh(project,dir,c,state),derivedAt:now(),persisted:false};}
export async function taskContext(project,id,step,options={}){
 const {dir,c,state,contractError}=await read(project,id,{allowDamaged:true});if(contractError)return recoveryContext(state,id,step,contractError);
 const sources={state:canonicalJson(state),contract:canonicalJson(c)};
 await refresh(project,dir,c,state);const pendingRuns=(await unresolvedPendingRuns(dir,c,state)).filter(r=>r.reviewDigest===state.review?.digest);
 const context=await buildTaskContext(project,dir,c,state,step,{...options,pendingRuns});
 const last=await read(project,id,{allowDamaged:true});
 if(last.contractError||canonicalJson(last.state)!==sources.state||canonicalJson(last.c)!==sources.contract)throw contextSourceChanged('Context control source changed while preparing the response.');
 await refresh(project,last.dir,last.c,last.state);
 if(context.review?.approved&&(!last.state.approval||last.state.review?.digest!==context.review.digest))throw contextSourceChanged('Context approval or reviewed inputs changed while preparing the response.');
 return {...context,persisted:false};
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
function scanBindingOption(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['scanBinding','allowRoots'].includes(k)))throw new Error('prepareReview accepts scanBinding and explicit allowRoots only.');
 const roots=options.allowRoots??[];if(!Array.isArray(roots)||roots.some(p=>typeof p!=='string'||!p.trim()||!path.isAbsolute(p)))throw new Error('allowRoots must be an explicit absolute directory array.');
 if(!Object.hasOwn(options,'scanBinding'))throw new Error('prepareReview requires the complete current path-scan binding.');
 const b=assertRecord(options.scanBinding,'scan-binding'),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['format','schemaVersion','kind','contractSha256','documents','extensions'].includes(k))||!hex(b.contractSha256)||!Array.isArray(b.documents)||!b.documents.length)throw new Error('Invalid scan binding; supply contract and document versions.');
 const seen=new Set(),documents=[];
 for(const row of b.documents){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||!Object.hasOwn(row,'path')||!hex(row.sha256)||typeof row.path!=='string'||!row.path.endsWith('.md')||path.isAbsolute(row.path)||path.win32.isAbsolute(row.path)||row.path.includes('\\')||row.path.split('/').some(s=>!s||s==='.'||s==='..'||s.includes("\0")||(process.platform==='win32'&&(/[. ]$/.test(s)||/[\x00-\x1f<>:"|?*]/.test(s)))))throw new Error('Invalid scan document binding.');
  const identity=process.platform==='win32'?row.path.toLowerCase():row.path;
  if(seen.has(identity))throw new Error('Duplicate scan document binding.');seen.add(identity);documents.push({path:row.path,sha256:row.sha256});
 }
 if(!documents.some(d=>d.path==='HARNESS.md'))throw new Error('Scan binding must include HARNESS.md.');
 return envelope('scan-binding',{contractSha256:b.contractSha256,documents});
}
async function checkScanBinding(dir,files,binding){
 if(!binding)return;
 const changed=()=>{throw new Error('Package changed between path scan and review sealing; rescan the complete current package.');};
 const realDir=await fs.realpath(dir),contractFile=await contained(dir,'contract.json');
 if(files.find(f=>f.path===contractFile&&f.kind==='review')?.sha256!==binding.contractSha256)changed();
 const captured=await capturePackageDocuments(dir),expected=new Map(binding.documents.map(d=>[d.path,d.sha256]));
 if(captured.issues.length||captured.files.length!==expected.size||captured.files.some(d=>expected.get(d.path)!==d.sha256))changed();
 for(const f of files)if(f.kind==='review'&&f.path.endsWith('.md')){
  const relative=path.relative(realDir,f.path).split(path.sep).join('/');
  if(expected.get(relative)!==f.sha256)changed();
 }
}
export async function prepareReview(project,id,options={}) {
  const scanBinding=scanBindingOption(options);
  return mutate(project,id,async(dir,c,state)=>{
    if(state.activeExecutions.length||state.executionBlockers.length)throw new Error('An active or ambiguous execution must be factually closed before review; preserve its original runId.');
    const unresolved=await unresolvedPendingRuns(dir,c,state);if(unresolved.length)throw new Error('Unresolved pending acceptance obligations must be explicitly resolved before review: '+JSON.stringify(unresolved));
    const checked=await checkHarnessPaths({project,package:dir,planned:c.deliverables.map(d=>d.path),allowRoots:options.allowRoots??[]});
    if(!checked.ok)throw new Error('Current package path check failed: '+JSON.stringify({issues:checked.issues,uncovered:checked.uncovered}));
    const expectedDocuments=new Map(scanBinding.documents.map(d=>[d.path,d.sha256]));
    if(checked.documentVersions.length!==expectedDocuments.size||checked.documentVersions.some(d=>expectedDocuments.get(d.path)!==d.sha256))throw new Error('Package changed between actual path scan and review sealing.');
    const files = await reviewSnapshot(project,dir,c);
    await checkScanBinding(dir,files,scanBinding);
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
  assertRecord(record,'decision');
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
async function ready(dir,c,state,id) {
  assertNoActiveExecution(state,'begin another run');
  if (!state.approval || state.phase === 'pending_user_review') throw new Error('User review/approval is required before formal execution.');
  const task = c.tasks.find(t=>t.id===id);
  if (!task) throw new Error(`Unknown task ${id}.`);
  if (Object.entries(state.tasks).some(([other,s])=>other!==id && s.status==='executing')) throw new Error('Another writing task is executing; this runtime serializes writers.');
  const unresolved=(await unresolvedPendingRuns(dir,c,state)).filter(r=>r.step===id&&r.reviewDigest===state.review?.digest);
  if(unresolved.length)throw new Error('Unresolved same-review pending obligation; cannot begin before explicit rework: '+JSON.stringify(unresolved));
  const s = state.tasks[id];
  if (!s || !['todo','failed','stale','blocked'].includes(s.status)) throw new Error(`Task ${id} is ${s?.status}; cannot begin another run.`);
  const reworkDecision=staleReworkDecision(c,state,id);
  if(reworkDecision.required)throw new Error(reworkDecision.recovery?`Recover original closure/rework evidence for stale run ${id}/${s.runId} before begin.`:`Explicit rework is required for closed stale run ${id}/${s.runId} before begin.`);
  const failed = task.dependsOn.filter(dep=>state.tasks[dep]?.status!=='verified');
  if (failed.length) throw new Error(`Dependencies need current acceptance: ${failed.join(', ')}`);
  return task;
}
export async function rework(project,id,step,request={}) {
 return mutate(project,id,async(dir,c,state)=>{
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['runId','reason','reference'].includes(k)))throw new Error('Rework needs runId, reason and reference only.');
  const {runId,reason,reference}=request;
  for(const[key,value]of Object.entries({runId,reason,reference}))if(typeof value!=='string'||!value.trim())throw new Error('Rework requires nonempty '+key+'.');
  const prior=reworkRecords(state,step,runId);if(!prior.length)assertNoActiveExecution(state,'request rework while an execution remains active or ambiguous');
  const facts=await closedRunFacts(dir,state,id,step,runId),s=state.tasks[step],owns=s?.runId===runId;
  if(prior.length>1)throw new Error('Ambiguous prior rework identity; preserve history.');
  if(prior.length){validateReworkRecord(prior[0],step,runId,facts);if(prior[0].reason!==reason||prior[0].reference!==reference)throw new Error('Conflicting facts for existing rework request.');return{phase:state.phase,taskStatus:s?.status??'stale',requestId:prior[0].requestId,fromRunId:runId,replayed:true};}
  const eligible=facts.closed.acceptedForVerification===true&&facts.closed.result==='ok',normalStatus=owns&&['pending_acceptance','verified','stale'].includes(s.status);
  if(owns&&!normalStatus&&!eligible)throw new Error('Rework requires a closed pending, verified or stale run.');
  if(!owns&&!eligible)throw new Error('Historical administrative rework requires an eligible closed original result.');
  const administrative=!normalStatus||!(c&&state.approval&&!state.blocker&&state.review&&facts.binding.digest===state.review.digest&&owns&&c.tasks.some(t=>t.id===step));
  const requestId=randomUUID(),previous=owns?{status:s.status,receipt:{...facts.receiptBinding},acceptedAt:s.acceptedAt??null,evidence:structuredClone(s.evidence??[]),outcome:s.outcome??'not-applicable',lastAcceptance:s.lastAcceptance?structuredClone(s.lastAcceptance):null}:null;
  event(state,'rework_requested',{...(administrative?{administrative:true}:{}),requestId,step,fromRunId:runId,reason,reference,reviewDigest:facts.binding.digest,reviewBinding:bindingRecord(facts.binding),executionBinding:facts.execution.binding,receipt:facts.receiptBinding,previous});
  if(owns){s.status='stale';s.reason='Explicit '+(administrative?'administrative ':'')+'rework requested: '+reason;s.reworkRequest={requestId,fromRunId:runId,reason,reference};delete s.acceptedAt;delete s.evidence;}
  if(c)await refresh(project,dir,c,state);else deriveExecutions(state);
  return{phase:state.phase,taskStatus:owns?s.status:'stale',requestId,fromRunId:runId,replayed:false};
 },{allowDamaged:true});
}

export async function begin(project,id,step,options={}) {
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['host','mode'].includes(k)))throw new Error('Unknown begin option.');
  let candidate;
  try{return await mutate(project,id,async(dir,c,state)=>{
    await ready(dir,c,state,step);
    const executionBinding=makeExecutionBinding(selectHost(c,options.host),options.mode??'native');
    const runId = randomUUID();
    candidate={runId,reviewDigest:state.review.digest,executionBinding};
    const previous=state.tasks[step],history=previous?.acceptanceAttempts;
    const request=previous?.runId?reworkRecords(state,step,previous.runId).at(-1):null;
    const reworkOf=request?{requestId:request.requestId,fromRunId:request.fromRunId}:null;
    state.tasks[step] = {status:'executing',runId,startedAt:now(),reviewDigest:state.review.digest,executionBinding,...(reworkOf?{reworkOf}:{}),...(history?{acceptanceAttempts:history}:{})};
    state.activeExecutions.push({step,runId,startedAt:state.tasks[step].startedAt,reviewDigest:state.review.digest,executionBinding});
    state.phase = 'executing'; event(state,'begin',{step,runId,reviewDigest:state.review.digest,executionBinding,...(executionBinding.mode==='cli'?{closureProtocol:'explicit-business-end'}:{}),...(reworkOf?{reworkOf}:{})});
    return {phase:'executing',runId,reviewDigest:state.review.digest,executionBinding,submission:nativeSubmissionAction(project,id,step,runId,executionBinding.executor)};
  });}catch(e){if(candidate)e.beginCandidate=candidate;throw e;}
}
// Canonical caller facts preserve unknown JSON fields; runtime bindings are checked separately.
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
const callerKeys=['runId','executor','reference','result','summary','outcome','process','logs','businessEnd','extensions'];
function callerFacts(value){const facts=Object.fromEntries(callerKeys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));facts.outcome??='not-applicable';return canonicalJson(facts);}
function validateSubmissionShape(input){
 if(!input||!['submission','receipt'].includes(input.kind))throw new Error('Submit requires a current submission or complete same-run receipt.');
 assertRecord(input,input.kind);if(!input.reference.trim())throw new Error('Submission reference must be nonblank.');
 if(input.businessEnd&&!input.businessEnd.reference.trim())throw new Error('Business end reference must be nonblank.');
 return input;
}

function validateSubmissionInput(input){
 if(!input||!['submission','receipt'].includes(input.kind))throw new Error('Submit requires a current submission or complete same-run receipt.');
 assertRecord(input,input.kind);if(!input.reference.trim())throw new Error('Submission reference must be nonblank.');
 const profile=executorProfile(input.executor),process=input.process;
 if(profile.mode==='cli'&&!process)throw new Error('CLI closure requires original ended process facts.');
 if(process){
  if(!['closed','not-started'].includes(process.processState))throw new Error('Unknown activity cannot be closed; preserve the original observer.');
  if(input.result==='ok'&&!processSucceeded(process))throw new Error('A process with control/log/timeout/protocol failure cannot report ok.');
  if(process.processState==='not-started'&&input.result!=='failed')throw new Error('A not-started process can only report failed.');
 }
 return input;
}
function originalSubmission(state,id,step,input){
 const begins=state.events.filter(e=>e.type==='begin'&&e.runId===input.runId),closed=state.events.filter(e=>e.type==='execution_receipt'&&e.runId===input.runId);
 if(begins.length!==1||begins[0].step!==step||closed.length>1||closed.some(e=>e.step!==step))throw new Error('A unique complete matching original begin and closure are required.');
 const binding=resolveRunBinding(state,step,input.runId,closed),execution=resolveExecutionBinding(state,step,input.runId,closed);
 if(!binding.known||binding.conflicts.length||!execution.binding||execution.conflicts.length)throw new Error([...binding.conflicts,...execution.conflicts,'Original execution binding unavailable.'].join('; '));
 if(input.executor!==execution.binding.executor)throw new Error('Submission executor conflicts with the original host/mode.');
 for(const [key,value]of Object.entries({taskId:id,step,reviewDigest:binding.digest}))if(Object.hasOwn(input,key)&&input[key]!==value)throw new Error('Conflicting submission '+key);
 if(input.kind==='receipt'&&(canonicalJson(input.executionBinding)!==canonicalJson(execution.binding)||canonicalJson(input.reviewBinding)!==canonicalJson(bindingRecord(binding))))throw new Error('Complete receipt original runtime bindings conflict.');
 return {begin:begins[0],closed,binding,execution};
}
async function assertSubmissionSource(dir,input,sourceFile){
 if(!sourceFile)return;
 const file=await contained(dir,'receipt-'+input.runId+'.json'),key=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
 let aliases=key(sourceFile)===key(file);
 if(!aliases&&await exists(file)){
  const [sr,tr,ss,ts]=await Promise.all([fs.realpath(sourceFile),fs.realpath(file),fs.stat(sourceFile,{bigint:true}),fs.stat(file,{bigint:true})]);
  aliases=key(sr)===key(tr)||(ss.ino!==0n&&ss.dev===ts.dev&&ss.ino===ts.ino);
 }
 if(aliases)throw Object.assign(new Error('Submission input aliases the runtime-owned receipt destination. Use actual inline fields or a separate current input file. No source is moved or overwritten.'),{code:'HARNESS_SUBMISSION_SOURCE_CONFLICT'});
}
export async function submit(project,id,step,input,{sourceFile}={}){
 validateSubmissionShape(input);const submitted=input,pre=await read(project,id,{allowDamaged:true});originalSubmission(pre.state,id,step,input);await assertSubmissionSource(pre.dir,input,sourceFile);
 const expectedFile=await contained(pre.dir,'receipt-'+input.runId+'.json');
 if(await exists(expectedFile)){const observed=await stableEvidenceFile(expectedFile,{multiLink:true});const final=assertRecord(parseJsonBytes(observed.bytes),'receipt');originalSubmission(pre.state,id,step,final);}
 if(input.kind==='receipt'&&!await exists(expectedFile))throw new Error('Complete receipt input is only for replay of the existing current same-run final.');
  await normalizedSubmission(pre.dir,pre.state,id,step,submitted,await exists(expectedFile));
 return mutate(project,id,async(dir,c,state,contractError)=>{
  const input=await normalizedSubmission(dir,state,id,step,submitted,await exists(await contained(dir,'receipt-'+submitted.runId+'.json')));
  const {begin,closed,binding,execution}=originalSubmission(state,id,step,input);await assertSubmissionSource(dir,input,sourceFile);
  const active=state.activeExecutions.find(r=>r.step===step&&r.runId===input.runId),file=await contained(dir,'receipt-'+input.runId+'.json');
  if(!active&&!closed.length)throw new Error('No matching active or factually closed original execution.');
  let task=state.tasks[step];
  if(active&&!task?.runId)task=state.tasks[step]={...task,status:contractError?'stale':'executing',runId:input.runId,startedAt:begin.at,reviewDigest:binding.digest,executionBinding:execution.binding};
  const spec=c?.tasks.find(t=>t.id===step);
  const eligible=()=>!!(!contractError&&state.approval&&!state.blocker&&!state.executionBlockers.length&&spec&&task?.runId===input.runId&&binding.digest===state.review?.digest&&spec.dependsOn.every(dep=>state.tasks[dep]?.status==='verified'));
  const replayed=await exists(file);let receipt;
  if(replayed){
   const observed=await stableEvidenceFile(file,{multiLink:true});receipt=assertRecord(parseJsonBytes(observed.bytes),'receipt');
   originalSubmission(state,id,step,receipt);
   const expected=[...(task?.runId===input.runId&&task.receipt?[task.receipt]:[]),...closed.map(e=>({sha256:e.receiptSha256})),...reworkRecords(state,step,input.runId).map(e=>e.receipt)];
   if(expected.some(e=>e.sha256!==observed.sha256))throw new Error('Original receipt digest conflict; preserve the existing final.');
   if(input.kind==='receipt'?canonicalJson(receipt)!==canonicalJson(input):callerFacts(receipt)!==callerFacts(input))throw new Error('Conflicting caller or complete current receipt facts.');
  }else{
   if(input.kind==='receipt')throw new SubmissionSourceChanged('The existing final receipt disappeared at the writer boundary; complete receipt input cannot create a new final. Preserve the original evidence.');
   if(!active)throw new Error('Closed original receipt is missing; preserve its evidence.');
   const facts=Object.fromEntries(callerKeys.filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]));facts.outcome??='not-applicable';
   receipt=envelope('receipt',{...facts,taskId:id,step,reviewDigest:binding.digest,reviewBinding:bindingRecord(binding),executionBinding:execution.binding,acceptedForVerification:eligible()&&task.status==='executing'});
   assertRecord(receipt,'receipt');await publishReceipt(file,receipt);
  }
  const saved={path:file,sha256:await digest(file)},accepted=eligible()&&receipt.acceptedForVerification===true;
  if(!active)return {phase:accepted&&task?.runId===input.runId?task.status:'stale',receipt:saved,executionClosed:true,replayed:true,acceptedForVerification:accepted&&closed[0]?.acceptedForVerification===true&&task?.runId===input.runId&&['pending_acceptance','verified','failed'].includes(task.status)};
  const allowed=accepted&&task?.status==='executing';
  if(task?.runId===input.runId){task.receipt=saved;task.outcome=receipt.outcome;task.finishedAt=now();task.status=allowed?(receipt.result==='ok'?'pending_acceptance':'failed'):'stale';if(!allowed)task.reason='Original work factually ended after current approval, dependency or contract eligibility was lost.';}
  state.activeExecutions=state.activeExecutions.filter(r=>r.runId!==input.runId);
  event(state,'execution_receipt',{step,runId:input.runId,reviewDigest:binding.digest,reviewBinding:bindingRecord(binding),executionBinding:execution.binding,receiptReviewDigest:receipt.reviewDigest,result:receipt.result,reference:receipt.reference,acceptedForVerification:allowed,receiptSha256:saved.sha256});
  if(c)await refresh(project,dir,c,state);else deriveExecutions(state);
  return {phase:allowed?task.status:'stale',receipt:saved,executionClosed:true,replayed,acceptedForVerification:allowed,warning:'Receipt records ended work; it neither cancels processes, authenticates identity nor restores stale approval.'};
 },{allowDamaged:true});
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
  const context=await taskContext(project,id,step);
  const body=JSON.stringify(context,null,2);
  const masterPath=await fs.realpath(context.master.path);
  const prompt=`Use the approved task harness at ${path.join(initial.dir,'HARNESS.md')}. Task ${step}, runId ${started.runId}, review digest ${started.reviewDigest}. This run has already begun; execute this run rather than starting another. Execute only this task's authorized scope with available native ${hostProfile(started.executionBinding.host).label} tools. User permission is limited by the reviewed contract and actual chat authorization; ask when needed. Do not change review files or state, self-approve, invoke a second orchestrator, install packages, or report verified. Do not submit or verify this run yourself. The supervisor records direct process observations; the original controller submits only after actual business activity, including relevant descendants, has ended. Report actual changes, evidence, failures and negative findings.\n\n${body}`;
  const last=await read(project,id);await refresh(project,last.dir,last.c,last.state);assertOriginalRun(last.c,last.state,step,started);
  if(hash(JSON.stringify(initial.c))!==hash(JSON.stringify(last.c)))throw new Error('Prepared contract changed before launch.');
  const pathKey=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
  for(const file of context.files){const bound=last.state.review.files.find(f=>pathKey(f.path)===pathKey(file.path));if(!bound||hash(Buffer.from(file.text,'utf8'))!==bound.sha256)throw new Error(`Prepared context differs from approved file: ${file.path}`);}
  if(context.master.sha256!==last.state.review.files.find(f=>pathKey(f.path)===pathKey(masterPath))?.sha256)throw new Error('Prepared master differs from approval.');
  return prompt;
}
export async function run(project,id,step,options={}) {
  if(options.timeoutMs!==undefined&&(!Number.isFinite(options.timeoutMs)||options.timeoutMs<=0))throw new Error('timeoutMs must be positive when specified.');
  const initial=await read(project,id),host=selectHost(initial.c,options.host);
  if(Object.keys(options).some(k=>!['host','executable','timeoutMs'].includes(k)))throw new Error('Unknown run option.');
  const invocation=await resolveHostExecutable(host,options.executable);const dir=initial.dir;
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
  if(result.processState==='closed'){
    try{const processObservation=await observeProcessEnd(project,id,step,started,result,logs,log);return{phase:'executing',runId:started.runId,reviewDigest:started.reviewDigest,executionBinding:started.executionBinding,processObservation,executionClosed:false,acceptedForVerification:false,next:'Retain this original run. Observe actual business activity and relevant descendants ending, then submit its business-end-reference using the original controller.'};}
    catch(error){originalError=error;throw recovery({executionClosed:false,processResult:result,logs,observationError:formatRuntimeError(error)});}
   }
   const submissionFacts=envelope('submission',{runId:started.runId,executor:executorFor(host,'cli'),reference:log,result:processSucceeded(result)?'ok':'failed',process:result,logs,outcome:'not-applicable'});
  let closureResult;
  try{closureResult=await submit(project,id,step,submissionFacts);}catch(closureError){throw recovery({submissionFacts,executionClosed:closureError.completedResult?.executionClosed===true,closureResult:closureError.completedResult??null,closureError});}
  if(originalError&&result.processState==='not-started')throw recovery({submissionFacts,executionClosed:true,closureResult});
  return closureResult;
}
// Current evidence helpers. All expected values are fixed before any acceptance command.
const identityKey=s=>s.ino!==0n?String(s.dev)+':'+String(s.ino):null;
const statEqual=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
const compareText=(a,b)=>a<b?-1:a>b?1:0;
async function stableEvidenceFile(file,{root,relative,multiLink=false}={}){
 if(root){
  canonicalEvidencePath(relative);const realRoot=await fs.realpath(root);let cursor=realRoot;
  for(const segment of relative.split('/')){
   const names=await fs.readdir(cursor);if(!names.includes(segment)||(process.platform==='win32'&&names.filter(x=>x.toLowerCase()===segment.toLowerCase()).length!==1))throw new Error('Evidence case or spelling is not canonical or is ambiguous: '+relative);
   cursor=path.join(cursor,segment);const st=await fs.lstat(cursor,{bigint:true});if(st.isSymbolicLink())throw new Error('Evidence symlink/junction alias: '+relative);
  }
  file=await contained(realRoot,relative);
 }
 const start=await fs.lstat(file,{bigint:true});
 if(!start.isFile()||start.isSymbolicLink())throw new Error('Expected ordinary evidence file: '+file);
 if(start.nlink>1n&&(!multiLink||!identityKey(start)))throw new Error('Evidence hardlink alias or unavailable identity: '+file);
 const handle=await fs.open(file,'r');let first,last,bytes,readError;
 try{first=await handle.stat({bigint:true});bytes=await handle.readFile();last=await handle.stat({bigint:true});}catch(e){readError=e;}
 try{await handle.close();}catch(e){if(readError)throw new Error(readError.message+'; handle close: '+e.message,{cause:readError});throw e;}
 if(readError)throw readError;
 const end=await fs.lstat(file,{bigint:true});
 if(!end.isFile()||end.isSymbolicLink()||!statEqual(start,first)||!statEqual(first,last)||!statEqual(last,end))throw new Error('Evidence changed during stable reading: '+file);
 return {path:path.resolve(file),sha256:hash(bytes),identity:identityKey(first),stat:first,bytes};
}
function evidenceMetadata(f){return {path:f.path,sha256:f.sha256,identity:f.identity};}
async function recheckEvidence(f,scope){
 const current=await stableEvidenceFile(f.path,scope?{root:scope.root,relative:scope.relative}:{multiLink:true});
 if(current.sha256!==f.sha256||current.identity!==f.identity||!statEqual(current.stat,f.stat))throw new Error('Bound evidence drift: '+f.path);
}
export async function readReviewsEvidence(file){
 const f=await stableEvidenceFile(path.resolve(file));const reviews=assertRecord(parseJsonBytes(f.bytes),'reviews');
 return {reviews,reviewsSource:{...evidenceMetadata(f),stat:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','nlink'].map(k=>[k,String(f.stat[k])]))}};
}
const deepFreeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(deepFreeze);Object.freeze(x);}return x;};
async function dependencyEvidenceDigest(project,c,state,step){
 const seen=new Set(),rows=[];
 async function visit(id){
  if(seen.has(id))return;seen.add(id);
  const spec=c.tasks.find(x=>x.id===id),s=state.tasks[id];
  if(!spec||s?.status!=='verified'||!s.runId||!s.acceptedAt||!Array.isArray(s.evidence)||!s.evidence.length)throw new Error('Dependency identity or accepted evidence unavailable: '+id);
  const paths=new Map();
  for(const f of s.evidence){
   const canonical=await fs.realpath(f.path),key=process.platform==='win32'?canonical.toLowerCase():canonical,old=paths.get(key);if(old&&old.sha256!==f.sha256)throw new Error('Conflicting dependency evidence: '+canonical);
   const actual=await stableEvidenceFile(canonical,{multiLink:true});if(actual.sha256!==f.sha256)throw new Error('Dependency evidence drift: '+canonical);paths.set(key,{path:canonical,sha256:f.sha256});
  }
  rows.push({step:id,runId:s.runId,acceptedAt:s.acceptedAt,evidence:[...paths].sort(([a],[b])=>compareText(a,b)).map(([,row])=>row)});
  for(const dep of spec.dependsOn)await visit(dep);
 }
 for(const dep of c.tasks.find(x=>x.id===step).dependsOn)await visit(dep);
 rows.sort((a,b)=>compareText(a.step,b.step));return hash(JSON.stringify(rows));
}
async function controlEvidenceIdentities(dir,c,source,execution){
 const files=new Map();
 async function visit(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);
   if(entry.isSymbolicLink())continue;
   if(entry.isDirectory()){if(entry.name!=='.writer-lock')await visit(file);}
   else if(entry.isFile()){const st=await fs.stat(file,{bigint:true}),id=identityKey(st);if(id)files.set(id,file);else if(st.nlink>1n)throw new Error('Unavailable control identity: '+file);}
  }
 }
 await visit(dir);
 for(const f of [source,...execution].filter(Boolean))if(f.identity)files.set(f.identity,f.path);
 return files;
}
async function evidenceEnvironment(project,id,step,{source,initialSources}={}){
 const dir=await taskDirectory(project,id);
 const observedState=await captureStateVersion(dir,initialSources),stateFile=observedState.file,state=assertStateRunSources(assertRecord(observedState.value,'state'));
 const contractFile=await stableEvidenceFile(await contained(dir,'contract.json'),{multiLink:true}),c=assertRecord(parseJsonBytes(contractFile.bytes),'contract');
 const contractBindings=(state.review?.files??[]).filter(f=>f.kind==='review'&&f.path===contractFile.path);
 if(contractBindings.length!==1||contractBindings[0].sha256!==contractFile.sha256)throw new Error('Captured contract differs from the approved contract version.');
 if(initialSources&&canonicalJson(c)!==initialSources.contract)throw new AcceptanceSourceChanged('Captured current contract differs from the contract read under the acceptance lock; preserve sources and obtain fresh evidence.');
 if(c.taskId!==id||state.taskId!==id)throw new Error('Task identity/schema mismatch.');
 await refresh(project,dir,c,state);validateContract(c);
 assertNoActiveExecution(state,'capture review evidence while an original execution remains active or ambiguous');
 const task=c.tasks.find(x=>x.id===step),s=state.tasks[step];
 if(!task||!state.approval||s?.status!=='pending_acceptance'||!s.runId)throw new Error('Current approved closed pending acceptance required.');
 const closed=deriveExecutions(state).closures.filter(x=>x.step===step&&x.runId===s.runId);
 if(closed.length!==1||closed[0].acceptedForVerification!==true)throw new Error('Unique eligible closed original execution required.');
 const binding=resolveRunBinding(state,step,s.runId,deriveExecutions(state).closures),execution=resolveExecutionBinding(state,step,s.runId,deriveExecutions(state).closures);
 if(!binding.known||binding.conflicts.length||binding.digest!==state.review.digest||!execution.binding||execution.conflicts.length)throw new Error('Original run binding is missing or conflicting.');
 const receiptPath=await contained(dir,'receipt-'+s.runId+'.json');
 if(path.resolve(s.receipt?.path??'')!==receiptPath)throw new Error('Original receipt path conflict.');
 const receipt=await stableEvidenceFile(receiptPath,{multiLink:true});
 if(receipt.sha256!==s.receipt.sha256||closed.some(x=>x.receiptSha256&&x.receiptSha256!==receipt.sha256))throw new Error('Execution receipt changed.');
 const facts=assertRecord(parseJsonBytes(receipt.bytes),'receipt');
 if(facts.runId!==s.runId||facts.taskId!==id||facts.step!==step||facts.reviewDigest!==state.review.digest||facts.result!=='ok'||(execution.binding&&facts.executor!==execution.binding.executor))throw new Error('Execution receipt facts conflict.');
 const executionFiles=[receipt];
 for(const log of facts.logs??[]){const f=await stableEvidenceFile(log.path,{multiLink:true});if(f.sha256!==log.sha256)throw new Error('Execution log changed: '+log.path);executionFiles.push(f);}
 let sourceFile=null;
 if(source){
  sourceFile=await stableEvidenceFile(source.path);
  if(sourceFile.sha256!==source.sha256||sourceFile.identity!==source.identity||Object.entries(source.stat??{}).some(([k,v])=>String(sourceFile.stat[k])!==v))throw new Error('Review source changed since parsing.');
 }
 const dependencyDigest=await dependencyEvidenceDigest(project,c,state,step);
 return {project,dir,c,state,task,s,executionFiles,stateFile,contractFile,sourceFile,dependencyDigest,approvalKey:hash(JSON.stringify({approval:state.approval,review:state.review.digest})),protectedIdentities:await controlEvidenceIdentities(dir,c,sourceFile,executionFiles)};
}
async function captureManifest(env,criterion,extra=[]){
 if(!Array.isArray(extra))throw new Error('Additional evidence must be an explicit array.');
 const selected=new Map(),physical=new Map(),captured=[];
 for(const outputId of env.task.outputs){const d=env.c.deliverables.find(x=>x.id===outputId),relative=canonicalEvidencePath(d.path);selected.set(relative,{outputId});}
 for(const relative of [...criterion.requiredFiles,...extra]){
  canonicalEvidencePath(relative);if(!selected.has(relative))selected.set(relative,{});
 }
 for(const [relative,metadata] of [...selected].sort(([a],[b])=>compareText(a,b))){
  const f=await stableEvidenceFile(null,{root:env.project,relative});
  const realControl=await fs.realpath(env.dir),rel=path.relative(realControl,f.path);
  if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel))||env.protectedIdentities.has(f.identity))throw new Error('Recursive/control evidence alias forbidden: '+relative);
  if(env.c.inputs.some(x=>x.path&&path.resolve(env.project,x.path)===f.path))throw new Error('Immutable approval input is already review-bound: '+relative);
  if(f.identity&&physical.has(f.identity))throw new Error('Duplicate physical evidence alias: '+relative);
  if(f.identity)physical.set(f.identity,relative);
  try{const v=JSON.parse(f.bytes.toString('utf8')),isSnapshot=x=>x?.format==='sciautoharness'&&['review-snapshot','reviews'].includes(x.kind)||!!(x?.binding?.criterionId&&Array.isArray(x.files));if(isSnapshot(v)||(v&&typeof v==='object'&&Object.values(v).some(isSnapshot)))throw new Error('Serialized review/snapshot cannot be recursive evidence: '+relative);}catch(e){if(e.message.startsWith('Serialized review'))throw e;}
  captured.push({...f,relative,metadata});
 }
 return {files:captured.map(f=>({path:f.relative,sha256:f.sha256,...f.metadata})),captured};
}
function reviewBinding(env,criterion){
 return {taskId:env.c.taskId,revision:env.c.revision,reviewDigest:env.state.review.digest,step:env.task.id,runId:env.s.runId,criterionId:criterion.id,receiptSha256:env.executionFiles[0].sha256,priorAcceptanceAttemptId:env.s.lastAcceptance?.attemptId??null,dependencyDigest:env.dependencyDigest};
}
async function recheckEnvironment(env,{readonly=false}={}){
 if(readonly&&await exists(path.join(env.dir,'.writer-lock')))throw new Error('Writer lock appeared during readonly snapshot.');
 await recheckEvidence(env.stateFile);await recheckEvidence(env.contractFile);for(const f of [...env.executionFiles,...(env.sourceFile?[env.sourceFile]:[])])await recheckEvidence(f);
 const fresh=await evidenceEnvironment(env.project,env.c.taskId,env.task.id,{source:env.sourceFile?{...evidenceMetadata(env.sourceFile),stat:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','nlink'].map(k=>[k,String(env.sourceFile.stat[k])]))}:undefined});
 if(fresh.approvalKey!==env.approvalKey||fresh.dependencyDigest!==env.dependencyDigest||fresh.s.runId!==env.s.runId||(fresh.s.lastAcceptance?.attemptId??null)!==(env.s.lastAcceptance?.attemptId??null))throw new Error('Review approval/run/dependency/attempt drift.');
 const original=[env.stateFile,env.contractFile,...env.executionFiles,...(env.sourceFile?[env.sourceFile]:[])],observed=[fresh.stateFile,fresh.contractFile,...fresh.executionFiles,...(fresh.sourceFile?[fresh.sourceFile]:[])];
 if(original.length!==observed.length||original.some((f,i)=>f.path!==observed[i].path||f.sha256!==observed[i].sha256||f.identity!==observed[i].identity||!statEqual(f.stat,observed[i].stat)))throw new Error('Freshly observed state or execution evidence version drift.');
 if(readonly&&await exists(path.join(env.dir,'.writer-lock')))throw new Error('Writer lock appeared at readonly snapshot exit.');
}
export async function reviewSnapshotEvidence(project,id,step,criterionId,options={}){
 if(!path.isAbsolute(project)||Object.keys(options).some(k=>k!=='files'))throw new Error('review-snapshot needs absolute project and optional files only.');
 const dir=await taskDirectory(project,id);if(await exists(path.join(dir,'.writer-lock')))throw new Error('Writer lock prevents readonly snapshot.');
 const env=await evidenceEnvironment(project,id,step),criterion=env.task.acceptance.find(x=>x.id===criterionId&&x.type==='review');
 if(!criterion)throw new Error('Choose a declared review criterion.');
 const manifest=await captureManifest(env,criterion,options.files??[]);
 const binding=reviewBinding(env,criterion);
 for(const f of manifest.captured)await recheckEvidence(f,{root:env.project,relative:f.relative});
 await recheckEnvironment(env,{readonly:true});
 if(await exists(path.join(env.dir,'.writer-lock')))throw new Error('Writer lock prevents readonly snapshot return.');
 const executor=assertRecord(parseJsonBytes(env.executionFiles[0].bytes),'receipt').executor;
 return envelope('review-snapshot',{binding,files:manifest.files,execution:{...executorProfile(executor),executor},persisted:false,semanticReviewed:false});
}
function assertReviewBinding(actual,expected){
 if(!actual||typeof actual!=='object'||Array.isArray(actual)||Object.keys(actual).sort().join('|')!==Object.keys(expected).sort().join('|')||Object.keys(expected).some(k=>actual[k]!==expected[k]))throw new Error('Review binding mismatch; obtain a fresh snapshot and actually recheck.');
}
async function validateEvidenceReview(env,criterion,record){
 if(!record||record.verdict!=='pass'||!['reviewer','source','rationale'].every(k=>typeof record[k]==='string'&&record[k].trim())||!Array.isArray(record.files)||!record.files.length)throw new Error('Acceptance '+criterion.id+' needs a traceable version-bound review.');
 assertReviewBinding(record.binding,reviewBinding(env,criterion));
 const paths=new Set();
 for(const row of record.files){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['path','sha256','outputId'].includes(k))||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||paths.has(row.path))throw new Error('Invalid or duplicate review manifest row.');
  canonicalEvidencePath(row.path);paths.add(row.path);
 }
 const actual=await captureManifest(env,criterion,[...paths]);
 if(actual.files.length!==record.files.length)throw new Error('Review manifest omits required output/files.');
 const expected=new Map(actual.files.map(x=>[x.path,x]));
 for(const row of record.files){const f=expected.get(row.path);if(!f||row.sha256!==f.sha256||row.outputId!==f.outputId||Object.hasOwn(row,'outputId')!==Object.hasOwn(f,'outputId'))throw new Error('Review manifest version/outputId mismatch: '+row.path);}
 return actual;
}
async function verifyEvidence(project,id,step,input,options,{dir,c,state,initialSources}){
 // Freeze API facts without inventing a source file; CLI supplies same-byte source metadata separately.
 const reviews=deepFreeze(structuredClone(assertRecord(input,'reviews'))),source=options.reviewsSource;
  const task=c.tasks.find(t=>t.id===step),s=state.tasks[step];
  if(!task||!s?.runId)throw new Error('An approved execution with pending acceptance is required.');
  const attemptId=randomUUID(),startedAt=now(),checks=[],evidence=[];let criterionId='preflight',lastLog=null,processResult=null,env,manifests=[];
  const recordAttempt=async(status,error=null)=>{
   const record=envelope('acceptance-report',{attemptId,runId:s.runId,reviewDigest:state.review?.digest??null,at:startedAt,finishedAt:now(),status,criterion:criterionId,error,log:lastLog,exitCode:processResult?.exitCode??null,processResult,next:status==='failed'?(criterionId==='execution-guard'?'Preserve the original run and handle; observe actual end and submit its matching facts before acceptance.':'Inspect actual failure; obtain a fresh snapshot and recheck before retry. Changed artifacts require rework before execution.'):null,receipt:s.receipt??null,checks,evidence:[...evidence],outcome:s.outcome??'not-applicable',reviews,reviewsSource:env?.sourceFile?evidenceMetadata(env.sourceFile):null});
   const report=path.join(dir,'acceptance-'+s.runId+'-'+randomUUID()+'.json');
   try{assertRecord(record,'acceptance-report');await fs.writeFile(report,JSON.stringify(record,null,2)+'\n',{flag:'wx'});record.report={path:report,sha256:await digest(report)};}catch(e){if(status==='passed')throw e;record.report=null;record.reportError=e.message;}
   (s.acceptanceAttempts??=[]).push(record);s.lastAcceptance=record;event(state,'acceptance_attempt',{step,runId:s.runId,attemptId,status,criterion:criterionId,report:record.report?.path??null,log:lastLog,error});return record;
  };
  const postflight=async()=>{for(const m of manifests)for(const f of m.captured)await recheckEvidence(f,{root:env.project,relative:f.relative});await recheckEnvironment(env);};
  try{
   criterionId='execution-guard';assertNoActiveExecution(state,'verify while an original execution remains active or ambiguous');
   criterionId='preflight';env=await evidenceEnvironment(project,id,step,{source,initialSources});
   if(env.sourceFile&&canonicalJson(assertRecord(parseJsonBytes(env.sourceFile.bytes),'reviews'))!==canonicalJson(reviews))throw new Error('Review source JSON and submitted review facts differ.');
   for(const f of env.executionFiles)evidence.push({path:f.path,sha256:f.sha256});
   if(env.sourceFile)evidence.push({path:env.sourceFile.path,sha256:env.sourceFile.sha256});
   // All reviews are checked first, independent of the acceptance-array order.
   for(const criterion of task.acceptance.filter(x=>x.type==='review')){
    criterionId=criterion.id;const manifest=await validateEvidenceReview(env,criterion,reviews.records[criterion.id]);manifests.push(manifest);
    for(const f of manifest.captured)evidence.push({path:f.path,sha256:f.sha256});
    checks.push({id:criterion.id,type:'review',record:reviews.records[criterion.id],independenceClaim:reviews.records[criterion.id].independence??'not established'});
   }
   // Even a task without a review binds its declared outputs before commands.
   if(!manifests.length){const m=await captureManifest(env,{requiredFiles:[]});manifests.push(m);for(const f of m.captured)evidence.push({path:f.path,sha256:f.sha256});}
   await postflight();
   for(const criterion of task.acceptance){
    if(criterion.type==='review')continue;criterionId=criterion.id;lastLog=null;processResult=null;
    if(criterion.type==='command'){
     const log=path.join(dir,'check-'+s.runId+'-'+criterion.id+'-'+randomUUID()+'.txt');let error=null,drift=null;
     try{processResult=await runProcess(criterion.command,criterion.args,{cwd:project,log,timeoutMs:criterion.timeoutMs});if(!processSucceeded(processResult))error=new Error('Acceptance '+criterion.id+' failed (exit '+processResult.code+'). '+(processResult.error??''));}
     catch(e){error=e;processResult=e.processResult??{processState:'unknown-active',code:null,error:e.message};}
     try{if(await exists(log)){lastLog={path:log,sha256:await digest(log)};evidence.push(lastLog);}}catch(e){error=new Error([error?.message,'log-digest: '+e.message].filter(Boolean).join('; '));}
     try{await postflight();}catch(e){drift=e;}
     checks.push({id:criterion.id,type:'command',result:processResult,log:lastLog,processError:error?.message??null,postflightError:drift?.message??null});
     if(error||drift)throw Object.assign(new Error([error?.message,drift?.message].filter(Boolean).join('; ')),{processResult});
    }else checks.push({id:criterion.id,type:'artifact',result:'Declared files bound; existence alone is not semantic acceptance.'});
   }
   criterionId='final-postflight';await postflight();const accepted=await recordAttempt('passed');evidence.push(accepted.report);
   s.status='verified';s.evidence=[...new Map(evidence.map(f=>[f.path,f])).values()];s.acceptedAt=now();event(state,'acceptance',{step,runId:s.runId,report:accepted.report.path,reportSha256:accepted.report.sha256});await refresh(project,dir,c,state);
   return {phase:state.phase,taskStatus:s.status,outcome:s.outcome,report:accepted.report.path,checks};
  }catch(e){
   if(e instanceof AcceptanceSourceChanged)throw e;
   const attempt=await recordAttempt('failed',e.message);
   if(criterionId==='execution-guard'&&attempt.reportError)e.recovery={...(e.recovery??{}),operation:'verify',stage:'execution-guard',acceptanceReportError:attempt.reportError};
   throw e;
  }
}

export async function verify(project,id,step,reviews=envelope('reviews',{records:{}}),options={}){
 assertRecord(reviews,'reviews');
 return mutate(project,id,async(dir,c,state,contractError,initialSources)=>verifyEvidence(project,id,step,reviews,options,{dir,c,state,initialSources}),{verifySources:true});
}
