import fs from 'node:fs/promises';

import path from 'node:path';

import assert from 'node:assert/strict';

import {spawnSync} from 'node:child_process';

import {fileURLToPath,pathToFileURL} from 'node:url';

import * as engine from '../lib/engine.mjs';

import {validateContract} from '../lib/contract.mjs';

import {contained, digest, safeId, hash, listFiles} from '../lib/files.mjs';

import {runProcess,processSucceeded} from '../lib/process.mjs';

import {previewInstall,applyInstall,rollbackInstall,defaultRule} from '../lib/install.mjs';

import childProcess from 'node:child_process';

import {syncBuiltinESMExports} from 'node:module';

import {EventEmitter} from 'node:events';

import {checkHarnessPaths} from '../check-harness-paths.mjs';
import {envelope,assertRecord,canonicalJson} from '../lib/identity.mjs';
import {randomUUID} from 'node:crypto';
import {renderContract} from '../lib/contract.mjs';
import {capturePackageDocuments} from '../check-harness-paths.mjs';

function cliData(text){const result=JSON.parse(text);assertRecord(result,'command-result');return result.data;}
async function prepareCurrentReview(project,id,options){
 if(options!==undefined)return engine.prepareReview(project,id,options);
 const directory=path.join(project,'harness',id),c=await readJson(path.join(directory,'contract.json'));
 const scan=await checkHarnessPaths({project,package:directory,planned:c.deliverables.map(d=>d.path)});
 if(!scan.ok)throw new Error('Current fixture path scan: '+JSON.stringify(scan));
 return engine.prepareReview(project,id,{scanBinding:envelope('scan-binding',{contractSha256:hash(await fs.readFile(path.join(directory,'contract.json'))),documents:scan.documentVersions})});
}
const decisionFacts=(project,id,value)=>engine.recordDecision(project,id,envelope('decision',value));
const submitFacts=(project,id,step,value,options)=>engine.submit(project,id,step,value?.kind==='receipt'?value:envelope('submission',value),options);
const verifyFacts=(project,id,step,value,options)=>engine.verify(project,id,step,value===undefined?undefined:value?.kind==='reviews'?value:envelope('reviews',{records:value}),options);
async function publishWithoutState(f,run,value){let hit=0;await patchMethod(fs,'writeFile',old=>async function(file,...args){if(String(file).startsWith(path.join(f.directory,'state.json')+'.')){hit++;throw new Error('SYNTHETIC post-publication state failure');}return old(file,...args);},()=>assert.rejects(submitFacts(f.project,f.id,'a',value)));assert.ok(hit);assertRecord(await readJson(path.join(f.directory,'receipt-'+run.runId+'.json')),'receipt');const state=await engine.status(f.project,f.id);assert.ok(state.activeExecutions.some(x=>x.runId===run.runId));assert.equal(closedCount(state),0);}
async function currentReviews(f){const records={};for(const criterion of f.c.tasks.find(t=>t.id==='a').acceptance)if(criterion.type==='review')records[criterion.id]=currentRecord(await engine.reviewSnapshotEvidence(f.project,f.id,'a',criterion.id));return records;}
const syntheticClosedProcess=()=>({processState:'closed',code:0,exitCode:0,signal:null,timedOut:false,outputBytes:0});
async function prepareFreshFixture(f){let r=command(['prepare-review','--project',f.project,'--id',f.id]);for(let attempt=1;attempt<=2&&process.platform==='win32'&&Number.isInteger(r.code)&&r.code>0&&!r.error&&/EPERM:.*rename[\s\S]*HARNESS\.md/.test(r.stderr);attempt++){const state=await readJson(path.join(f.directory,'state.json'));if(state.phase!=='draft'||state.review||state.approval||(state.activeExecutions??[]).length||state.events.some(e=>e.type!=='draft')||Object.values(state.tasks).some(t=>t.status!=='todo'))break;fixturePreparationRetries.push({id:f.id,attempt,stage:'fresh-unapproved-prepare',previous:r});await new Promise(resolve=>setTimeout(resolve,attempt*200));r=command(['prepare-review','--project',f.project,'--id',f.id]);}return r;}


const option=process.argv.indexOf('--work-root');

if(option<0||!process.argv[option+1]||!path.isAbsolute(process.argv[option+1]))throw new Error('Supply --work-root ABSOLUTE_AUTHORIZED_TEST_DIRECTORY.');

const work=path.resolve(process.argv[option+1]);

const prefixIndexes=process.argv.flatMap((value,index)=>value==='--case-prefix'?[index]:[]);

if(prefixIndexes.length>1)throw new Error('Repeated --case-prefix.');

const prefixIndex=prefixIndexes[0]??-1;

const casePrefix=prefixIndex<0?null:process.argv[prefixIndex+1];

if(prefixIndex>=0&&(!casePrefix||casePrefix.startsWith('--')))throw new Error('Missing or invalid --case-prefix value.');

const seenOptions=new Set();for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--work-root','--case-prefix'].includes(key)||seenOptions.has(key))throw new Error('Unsupported or repeated runner argument: '+key);seenOptions.add(key);if(process.argv[i+1]===undefined)throw new Error('Missing runner argument value: '+key);};
await fs.mkdir(work,{recursive:true});

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const cli=path.join(source,'scripts/harness.mjs');

const root=await fs.mkdtemp(path.join(work,'fixtures-'));

const results=[];

const fixturePreparationRetries=[];

const writeJson=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');

const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));

function command(args) {
  const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:['install','rollback'].includes(args[0])?300000:20000,windowsHide:true,shell:false,cwd:work});
  return {args,code:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message};
}

async function captureCase(id,expected,body){
 try{const observed=await body();if(observed&&typeof observed==='object'&&Object.hasOwn(observed,'notApplicable')){if(Array.isArray(observed)||typeof observed.notApplicable!=='string'||!observed.notApplicable.trim())throw new Error('Invalid explicit notApplicable reason');return{id,expected,pass:false,skipped:true,skipReason:observed.notApplicable,observed};}return{id,expected,pass:true,observed};}
 catch(e){return{id,expected,pass:false,error:e.message,stack:e.stack?.split('\n').slice(0,4),code:e.code,recovery:e.recovery??e.actionError?.recovery,metadataFacts:e.metadataFacts,observerFailure:e.observerFailure,...(e.observerOnly?{observerOnly:true}:{})};}
}

async function ioPathFacts(file){try{const st=await fs.lstat(file,{bigint:true});return{path:file,exists:true,regular:st.isFile(),dev:String(st.dev),ino:String(st.ino),nlink:String(st.nlink),size:String(st.size),mode:String(st.mode),sha256:st.isFile()?await digest(file):null,...(process.platform==='win32'?{metadata:ntfsFacts(file)}:{uid:String(st.uid),gid:String(st.gid)})};}catch(e){if(e.code==='ENOENT')return{path:file,exists:false};return{path:file,observationError:e.message,code:e.code};}}
const rawIOError=e=>({name:e?.name??typeof e,message:e?.message??String(e),code:e?.code??null,errno:e?.errno??null,syscall:e?.syscall??null,path:e?.path??null,dest:e?.dest??null});
async function withIODiagnostics(id,body){
 const observations=[],handles=new Map();let manifest=null,complete=false,result,primary,hadPrimary=false;
 const snapshot=(from,to)=>structuredClone([...handles.values()].filter(x=>key(x.path)===key(from)||key(x.path)===key(to)));
 const facts=async(from,to)=>{const startedAt=new Date().toISOString(),source=await ioPathFacts(from),destination=await ioPathFacts(to);return{startedAt,completedAt:new Date().toISOString(),source,destination};};
 try{
  result=await patchMethod(fs,'open',old=>async function(file,...args){
   const h=await old(file,...args),name=String(file);if(path.basename(name)!=='rollback.json'&&!path.basename(name).startsWith('rollback.json.'))return h;
   const token=randomUUID();handles.set(token,{token,path:name,flags:args[0],openedAt:new Date().toISOString(),opened:true,closed:false});
   return wrapHandle(h,{close:async()=>{handles.get(token).closeStartedAt=new Date().toISOString();try{const r=await h.close();handles.get(token).closed=true;handles.get(token).closeCompletedAt=new Date().toISOString();return r;}catch(e){handles.get(token).closeError=rawIOError(e);throw e;}}});
  },()=>patchMethod(fs,'rename',old=>async function(from,to,...args){
   if(complete||path.basename(String(to))!=='rollback.json')return old(from,to,...args);manifest??=String(to);if(key(to)!==key(manifest))return old(from,to,...args);
   const row={sequence:observations.length,source:String(from),destination:String(to),nativeAttempted:false,observerFailures:[],candidate:null};
   try{const pending=await readJson(from);row.candidate={status:pending.status,completedTargets:pending.completedTargets,lastOperation:pending.operations?.at(-1)};}catch(e){row.observerFailures.push({stage:'read-candidate',error:rawIOError(e)});}
   row.before=await facts(from,to);row.ownedHandles=snapshot(from,to);row.attemptedAt=new Date().toISOString();
   try{row.nativeAttempted=true;const r=await old(from,to,...args);row.outcome='published';row.after=await facts(from,to);if(row.candidate?.status==='installed')complete=true;return r;}
   catch(e){row.outcome='failed';row.errorCapturedAt=new Date().toISOString();row.error=rawIOError(e);row.ownedHandlesAtError=snapshot(from,to);row.after=await facts(from,to);throw e;}
   finally{observations.push(row);}
  },body));
 }catch(e){hadPrimary=true;primary=e;}
 const payload={syntheticOnly:true,injected:false,diagnosticVersion:'R1-own-handles-v3',caseId:id,manifest,completedInitialInstall:complete,observations,ownedHandles:[...handles.values()],limitation:'Tracks this fixture and observed Node-owned handles only. ACL/stat facts have collection windows, not instantaneous fault-time coverage. Successful rerun does not establish the original EPERM cause. No private body or changes.bytes is recorded.'};
 try{await writeJson(path.join(root,id+'-io-diagnostics.json'),payload);}
 catch(e){
  const observerFailure={stage:'persist-diagnostic',error:rawIOError(e)};
  if(hadPrimary){try{Object.defineProperty(primary,'observerFailure',{value:observerFailure,enumerable:true,configurable:true});}catch{}
   try{process.stderr.write(JSON.stringify({diagnosticWriteFailure:observerFailure,primaryError:rawIOError(primary),capturedNativeErrors:observations.filter(x=>x.error).map(x=>({sequence:x.sequence,error:x.error,errorCapturedAt:x.errorCapturedAt}))})+'\n');}catch{}
   throw primary;
  }
  throw Object.assign(new Error('Observer persistence failed after the body completed: '+e.message,{cause:e}),{observerOnly:true,observerFailure});
 }
 if(hadPrimary)throw primary;return result;
}
function caseCounts(rows){return{tests:rows.length,passed:rows.filter(x=>x.pass===true&&x.skipped!==true).length,failed:rows.filter(x=>x.pass===false&&x.skipped!==true).length,skipped:rows.filter(x=>x.skipped===true).length};}
async function test(id,expected,body) {
 if(casePrefix&&!id.startsWith(casePrefix))return;
 const traced=['mh-install-combination-claude-code-tampered','current-install-state-preservation','install-current-format-binding'].includes(id)?()=>withIODiagnostics(id,body):body;results.push(await captureCase(id,expected,traced));console.log(JSON.stringify(results.at(-1)));
}

async function fixture(name,{two=true,acceptance,execution,unreviewed=false}={}) {
 const project=path.join(root,name);await fs.mkdir(project,{recursive:true});const id='synthetic-'+name;
 const d=await engine.draft(project,id,'SYNTHETIC TEST ONLY: current contracts and local safety','general');const directory=d.directory,c=await readJson(path.join(directory,'contract.json'));
 if(execution!==undefined)c.execution=structuredClone(execution);
 c.inputs=[{source:'Synthetic generated input; no real observations or user approvals',path:'input.txt'}];await fs.writeFile(path.join(project,'input.txt'),'SYNTHETIC IMMUTABLE INPUT\n');
 c.deliverables=[{id:'out-a',path:'out/a.txt'},...(two?[{id:'out-b',path:'out/b.txt'}]:[])];
 c.tasks=[{id:'a',title:'Produce synthetic artifact A',dependsOn:[],outputs:['out-a'],acceptance:acceptance??[{id:'exists-a',type:'artifact',description:'Synthetic A exists'}]},...(two?[{id:'b',title:'Consume verified A',dependsOn:['a'],outputs:['out-b'],acceptance:[{id:'exists-b',type:'artifact',description:'Synthetic B exists'}]}]:[])];
 c.contextFiles=c.tasks.map(t=>({path:`phases/${t.id}.md`,kind:'phase',tasks:[t.id],purpose:`Synthetic ${t.id} phase`,loadWhen:`After context selects ${t.id}`}));await writeJson(path.join(directory,'contract.json'),c);
 const refs=command(['refs','--project',project,'--id',id]);assert.equal(refs.code,0,refs.stderr);const mapping=cliData(refs.stdout);
 for(const doc of mapping.documents.filter(d=>d.path!=='HARNESS.md')){await fs.mkdir(path.dirname(doc.file),{recursive:true});await fs.writeFile(doc.file,`# Synthetic ${doc.path}\n\nResume with master and recovery, then context.\n\nInput: ${doc.inputs[0].absoluteMarkdown}\n\nMethod: deterministic local fixture; no real approval or scientific observation.\n\nOutputs: ${doc.deliverables.map(d=>d.markdown).join(', ')}\n\nAcceptance: verify declared content and original lifecycle facts.\n\nFailure: preserve negative evidence and original run; no installed target writes.\n\nHandoff: release only verified dependencies.\n`);}
 const f={project,id,directory,c,review:null};if(unreviewed)return f;
 const prepared=await prepareFreshFixture(f);assert.equal(prepared.code,0,prepared.stderr+' '+prepared.stdout);const p=cliData(prepared.stdout);assert.equal(p.pathCheck.ok,true);f.review=p.review;return f;
}

async function approve(f) {
  return decisionFacts(f.project,f.id,{actor:'user',decision:'approve',taskId:f.id,revision:f.c.revision,digest:f.review.digest,message:'SYNTHETIC APPROVAL FIXTURE ONLY — does not represent a real user decision.',source:'SYNTHETIC local state-machine regression under explicit authorization'});
}

async function emit(f,step,content='SYNTHETIC RESULT') {
  const out=f.c.deliverables.find(d=>d.id===f.c.tasks.find(t=>t.id===step).outputs[0]).path;
  const file=path.join(f.project,out);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content+'\n');return file;
}

async function submit(f,step,started,result='ok',extra={}) {
  return submitFacts(f.project,f.id,step,{runId:started.runId,executor:'codex-native',reference:'SYNTHETIC local fixture execution in '+f.project,result,...extra});
}

async function finish(f,step,extra={}){const prior=(await engine.status(f.project,f.id)).tasks[step];if(prior?.status==='stale'&&prior.runId&&!prior.reworkRequest)await engine.rework(f.project,f.id,step,{runId:prior.runId,reason:'SYNTHETIC repair of changed artifact',reference:'SYNTHETIC current repair fixture'});const run=await engine.begin(f.project,f.id,step);await emit(f,step);await submit(f,step,run,'ok',extra);return verifyFacts(f.project,f.id,step);}

// Test controllers for the fixed legacy leaf/fakeProcess cases below only.
// Their reviewed helper modes contain no descendant business writers. Never use
// this completion helper for descendant cases or as a production auto-close.
const leafSubmissions=new Map();
const leafKey=(project,id,step)=>JSON.stringify([path.resolve(project),id,step]);
const leafFactsFor=(f,step='a')=>{const facts=leafSubmissions.get(leafKey(f.project,f.id,step));assert.ok(facts,'Actual leaf submission facts were not captured');return facts;};
async function closeKnownLeafObservation(runtime,project,id,step,observed,evidenceReference='SYNTHETIC fixed legacy leaf/fakeProcess: actual close observed; reviewed fixture has no descendant business work'){
 if(observed.executionClosed!==false)return observed;
 assert.equal(observed.processObservation.process.processState,'closed');
 const state=await runtime.status(project,id);assert.ok(state.activeExecutions.some(r=>r.runId===observed.runId));
 const raw=await readJson(path.join(project,'harness',id,'state.json'));assert.equal(raw.events.filter(e=>e.type==='execution_receipt'&&e.runId===observed.runId).length,0);
 const facts={runId:observed.runId,executor:observed.executionBinding.executor,reference:observed.processObservation.reference,result:processSucceeded(observed.processObservation.process)?'ok':'failed',process:observed.processObservation.process,logs:observed.processObservation.logs,businessEnd:{status:'ended',reference:evidenceReference}};
 leafSubmissions.set(leafKey(project,id,step),facts);
 return runtime.submit(project,id,step,envelope('submission',facts));
}
async function runLeafOn(runtime,project,id,step,options){return closeKnownLeafObservation(runtime,project,id,step,await runtime.run(project,id,step,options));}
async function runLeafFixture(...args){return runLeafOn(engine,...args);}

function assertExecutionFocus(text) {
 assert.match(text,/unverified premise.*refute the route/);
 assert.match(text,/supporting\/refuting\/inconclusive observations.*downstream effects/);
 assert.match(text,/method only for an unresolved mandatory acceptance gap.*smaller check.*exit\/return condition/);
 assert.match(text,/met mandatory criteria.*released downstream use.*remaining release blockers/);
 assert.match(text,/local success is narrower than stage completion/);
 assert.match(text,/independent authorized mandatory work/);
 assert.match(text,/simple work needs no extra stage or approval/);
 assert.match(text,/settled decisions and dependency-ordered questions/);
 assert.match(text,/read accessible facts yourself.*recommend an option with its tradeoff/);
 assert.match(text,/recompute the decision frontier after actual answers/);
 assert.match(text,/brief plain-language result\/evidence\/limits report and concrete next-phase tasks/);
 assert.match(text,/Ask two or three relevant questions.*wait for an actual user reply before starting the next phase/);
 assert.match(text,/displayed defaults, silence and canBegin do not establish a reply/);
 assert.match(text,/Feedback does not replace technical acceptance or approve material changes/);
 assert.match(text,/Final phases do not invent follow-on work/);
 assert.match(text,/still ask two or three relevant delivery-review questions and yield for feedback/);
}
await test('execution-focus-authoring','Missing-phase authoring carries feasibility, method and release requirements with usable links',async()=>{
 const f=await fixture('focus-authoring',{two:false,unreviewed:true});
 await fs.unlink(path.join(f.directory,'phases/a.md'));
 const r=command(['refs','--project',f.project,'--id',f.id,'--next']);
 assert.equal(r.code,0,r.stderr);const data=cliData(r.stdout);
 assert.equal(data.next.action,'write_document');assert.equal(data.next.document,'phases/a.md');
 assertExecutionFocus(data.next.instruction);assert.match(data.next.instruction,/stage-specific inputs\/prerequisites/);
 const doc=data.documents[0];assert.equal(doc.kind,'phase');assert.equal(doc.tasks[0].id,'a');
 assert.equal(doc.inherits[0].path,'HARNESS.md');
 for(const link of [...doc.inputs,...doc.deliverables])assert.equal(path.resolve(path.dirname(doc.file),link.reference),link.target);
 for(const link of doc.inherits)assert.equal(path.resolve(path.dirname(doc.file),link.reference),link.file);
 return{next:data.next.action,phase:data.next.document,instruction:data.next.instruction,usableLinks:doc.inputs.length+doc.deliverables.length+doc.inherits.length,semanticEfficacyMeasured:false};
});
await test('execution-focus-context','Generated master and ready/blocked native contexts carry the same stage decision requirements',async()=>{
 const f=await fixture('focus-context');await approve(f);
 const ready=await engine.taskContext(f.project,f.id,'a'),blocked=await engine.taskContext(f.project,f.id,'b');
 const master=await fs.readFile(path.join(f.directory,'HARNESS.md'),'utf8');assertExecutionFocus(master);
 for(const ctx of [ready,blocked]){
  const focus=ctx.invariants.find(x=>x.includes('unverified premise'));assert.equal(typeof focus,'string');assertExecutionFocus(focus);assert.ok(master.includes(focus));
  assert.equal(ctx.global.taskId,f.id);assert.equal(ctx.review.approved,true);assert.equal(ctx.global.execution.host,'codex');
 }
 assert.equal(ready.canBegin,true);assert.deepEqual(ready.dependencies,[]);assert.equal(ready.task.id,'a');assert.equal(ready.files.length,1);assert.ok(ready.files[0].path.endsWith(path.join('phases','a.md')));
 assert.equal(blocked.canBegin,false);assert.deepEqual(blocked.dependencies,[{id:'a',status:'todo',outputs:[]}]);assert.ok(blocked.blockers.includes('Dependency a is todo, not currently verified.'));
 assert.equal(blocked.task.id,'b');assert.equal(blocked.files.length,1);assert.ok(blocked.files[0].path.endsWith(path.join('phases','b.md')));
 return{ready:ready.canBegin,blocked:blocked.canBegin,selected:[...ready.files,...blocked.files].map(x=>path.basename(x.path)),invariantCount:ready.invariants.length,semanticEfficacyMeasured:false};
});

await test('unapproved-begin','Reject formal begin before approval',async()=>{const f=await fixture('unapproved');await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);return {rejected:true};});

await test('wrong-approval-binding','Reject approval bound to another digest',async()=>{const f=await fixture('bad-approval');await assert.rejects(decisionFacts(f.project,f.id,{actor:'user',decision:'approve',taskId:f.id,revision:1,digest:'0'.repeat(64),message:'SYNTHETIC',source:'SYNTHETIC'}),/different/);return {rejected:true};});

await test('dependency-block','Reject dependent B before verified A',async()=>{const f=await fixture('dependency');await approve(f);await assert.rejects(engine.begin(f.project,f.id,'b'),/Dependencies/);return {rejected:true};});

await test('normal-two-stage-chain','Verify A then B; whole task becomes verified',async()=>{const f=await fixture('normal');await approve(f);const a=await finish(f,'a');assert.equal(a.taskStatus,'verified');const ctx=await engine.taskContext(f.project,f.id,'b');assert.equal(ctx.canBegin,true);assert.equal(ctx.dependencies[0].status,'verified');assert.equal(ctx.files.length,1);assert.ok(!ctx.files.some(x=>x.path.endsWith('a.md')));const b=await finish(f,'b');assert.equal(b.phase,'verified');return {phase:b.phase,selectedFiles:ctx.files.map(x=>path.basename(x.path)),approvalExcerpt:ctx.review.approval.messageExcerpt};});

await test('pending-not-verified','Receipt ok remains pending acceptance; B stays blocked',async()=>{const f=await fixture('pending');await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');const s=await submit(f,'a',r);assert.equal(s.phase,'pending_acceptance');await assert.rejects(engine.begin(f.project,f.id,'b'),/Dependencies/);return {phase:s.phase};});

await test('duplicate-begin','Reject another begin for active task',async()=>{const f=await fixture('duplicate');await approve(f);await engine.begin(f.project,f.id,'a');await assert.rejects(engine.begin(f.project,f.id,'a'),/cannot begin|active|executing/i);return {rejected:true};});

await test('writer-serialization','Reject unrelated writer while A executes',async()=>{const f=await fixture('writers');f.c.tasks[1].dependsOn=[];f.c.revision=2;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);await engine.begin(f.project,f.id,'a');await assert.rejects(engine.begin(f.project,f.id,'b'),/Another writing task/);return {rejected:true};});

await test('failed-retry-negative','Failed execution can retry with new run ID and preserve negative outcome',async()=>{const f=await fixture('retry',{two:false});await approve(f);const a=await engine.begin(f.project,f.id,'a');await submit(f,'a',a,'failed');const b=await engine.begin(f.project,f.id,'a');assert.notEqual(a.runId,b.runId);await emit(f,'a');await submit(f,'a',b,'ok',{outcome:'negative'});const v=await verifyFacts(f.project,f.id,'a');assert.equal(v.taskStatus,'verified');assert.equal(v.outcome,'negative');return {status:v.taskStatus,outcome:v.outcome,newRun:true};});

await test('resume-original-run','An active original run survives status/context and can submit',async()=>{const f=await fixture('resume',{two:false});await approve(f);const a=await engine.begin(f.project,f.id,'a');const stateBytes=await fs.readFile(path.join(f.directory,'state.json'));const st=await engine.status(f.project,f.id);const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(st.tasks.a.runId,a.runId);assert.equal(ctx.canBegin,false);assert.deepEqual(await fs.readFile(path.join(f.directory,'state.json')),stateBytes);await emit(f,'a');const submitted=await submit(f,'a',a);assert.equal(submitted.phase,'pending_acceptance');return {originalRunPreserved:true,statusReadOnly:st.persisted===false};});

await test('immutable-input-drift','Input changes invalidate approval',async()=>{const f=await fixture('input-drift');await approve(f);await fs.appendFile(path.join(f.project,'input.txt'),'CHANGED');const st=await engine.status(f.project,f.id);assert.equal(st.approval,null);await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);return {approval:st.approval,phase:st.phase};});

await test('phase-plan-drift','Selected plan changes invalidate approval',async()=>{const f=await fixture('plan-drift');await approve(f);await fs.appendFile(path.join(f.directory,'phases/a.md'),'CHANGED');const st=await engine.status(f.project,f.id);assert.equal(st.approval,null);return {approval:st.approval};});

await test('output-drift-propagates','A output mutation makes verified A and B stale',async()=>{const f=await fixture('output-drift');await approve(f);await finish(f,'a');await finish(f,'b');await emit(f,'a','CHANGED');const st=await engine.status(f.project,f.id);assert.equal(st.tasks.a.status,'stale');assert.equal(st.tasks.b.status,'stale');assert.ok(st.approval);return {a:st.tasks.a.status,b:st.tasks.b.status,approvalPreserved:true};});

await test('receipt-drift','Modified receipt blocks verification',async()=>{const f=await fixture('receipt-drift',{two:false});await approve(f);const a=await engine.begin(f.project,f.id,'a');await emit(f,'a');const s=await submit(f,'a',a);await fs.appendFile(s.receipt.path,' ');await assert.rejects(verifyFacts(f.project,f.id,'a'),/receipt changed/);return {rejected:true};});

await test('review-required','Semantic review requires an actual fresh bound record',async()=>{
 const f=await fixture('semantic-review',{two:false,acceptance:[{id:'semantic',type:'review',description:'Inspect actual synthetic result',requiredFiles:[]}]});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);await assert.rejects(verifyFacts(f.project,f.id,'a'),/review|evidence/i);
 const snapshot=await engine.reviewSnapshotEvidence(f.project,f.id,'a','semantic');const result=await verifyFacts(f.project,f.id,'a',envelope('reviews',{records:{semantic:currentRecord(snapshot)}}));assert.equal(result.taskStatus,'verified');return{missingRecordRejected:true,freshRecordAccepted:true};
});

await test('command-failure','Nonzero acceptance command keeps task unverified',async()=>{const f=await fixture('command-fail',{two:false,acceptance:[{id:'exit-seven',type:'command',description:'Synthetic controlled failing process',command:process.execPath,args:['-e','process.exit(7)'],timeoutMs:5000}]});await approve(f);const a=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',a);await assert.rejects(verifyFacts(f.project,f.id,'a'),/exit 7/);const st=await engine.status(f.project,f.id);assert.equal(st.tasks.a.status,'pending_acceptance');return {status:st.tasks.a.status};});

await test('runtime-receipt-alias','Reject receipt input aliasing runtime-owned destination',async()=>{const f=await fixture('receipt-alias',{two:false});await approve(f);const a=await engine.begin(f.project,f.id,'a');const file=path.join(f.directory,`receipt-${a.runId}.json`);const r={runId:a.runId,executor:'codex-native',reference:'SYNTHETIC',result:'ok'};await writeJson(file,r);const before=await digest(file);await assert.rejects(submitFacts(f.project,f.id,'a',r,{sourceFile:file}),e=>e.code==='HARNESS_SUBMISSION_SOURCE_CONFLICT');assert.equal(await digest(file),before);return {rejected:true,sourcePreserved:true};});

await test('review-revision-guard','Reviewed content changes require incrementing revision',async()=>{const f=await fixture('revision');await fs.appendFile(path.join(f.directory,'phases/a.md'),'CHANGED');await assert.rejects(prepareCurrentReview(f.project,f.id),/Increment/);return {rejected:true};});

await test('contract-cycle-and-output-conflict','Reject cyclic DAG and duplicate canonical output path',async()=>{const f=await fixture('invalid-contract');const cycle=structuredClone(f.c);cycle.tasks[0].dependsOn=['b'];assert.throws(()=>validateContract(cycle),/cycle/);const clash=structuredClone(f.c);clash.deliverables[1].path='out/a.txt';assert.throws(()=>validateContract(clash),/Output path conflict/);return {cycleRejected:true,canonicalConflictRejected:true};});

await test('path-check-positive-negative','Documented path checker accepts valid fixture and catches missing link',async()=>{const f=await fixture('paths');const options={project:f.project,package:f.directory,planned:f.c.deliverables.map(d=>d.path)};const good=await checkHarnessPaths(options);assert.equal(good.ok,true);await fs.appendFile(path.join(f.directory,'phases/a.md'),'\n[missing](<missing-file.txt>)\n');const bad=await checkHarnessPaths(options);assert.equal(bad.ok,false);assert.ok(bad.issues.some(x=>x.code==='MISSING_PATH'));return {validDocuments:good.documents,positive:good.ok,missingDetected:true};});

await test('lexical-and-junction-escape','Containment rejects lexical parent and directory junction escape',async()=>{const f=await fixture('escapes');await assert.rejects(contained(f.project,'../outside'),/outside/);const external=path.join(root,'junction-external');await fs.mkdir(external);const link=path.join(f.project,'linked-outside');await fs.symlink(external,link,'junction');await assert.rejects(contained(f.project,'linked-outside/future.txt'),/escapes/);return {lexicalRejected:true,junctionRejected:true};});

await test('existing-output-hardlink-conflict','Reject two output identities hardlinked to same file',async()=>{const f=await fixture('output-hardlink');await fs.mkdir(path.join(f.project,'out'));await fs.writeFile(path.join(f.project,'out/a.txt'),'SYNTHETIC');await fs.link(path.join(f.project,'out/a.txt'),path.join(f.project,'out/b.txt'));await assert.rejects(prepareCurrentReview(f.project,f.id),/same file|path conflict/i);return {rejected:true};});

await test('active-review-guard','Repeat review preserves active identity and approval',async()=>{const f=await fixture('active-review',{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');const before=await engine.status(f.project,f.id);await assert.rejects(prepareCurrentReview(f.project,f.id),/active|executing/i);const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.runId,r.runId);assert.equal(after.approval.digest,before.approval.digest);await assert.rejects(engine.begin(f.project,f.id,'a'),/active|executing|cannot begin/i);return {runPreserved:true};});

await test('pending-review-guard','Repeat review cannot reset pending acceptance',async()=>{const f=await fixture('pending-review',{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');const receipt=await submit(f,'a',r);await assert.rejects(prepareCurrentReview(f.project,f.id),/pending.acceptance|pending acceptance/i);const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.status,'pending_acceptance');assert.equal(after.tasks.a.receipt.path,receipt.receipt.path);return {pendingPreserved:true};});

await test('stale-active-closure','Stale execution blocks writers until factual closure, without accepting its result',async()=>{const f=await fixture('stale-active');await approve(f);await finish(f,'a');const r=await engine.begin(f.project,f.id,'b');await emit(f,'a','CHANGED');const st=await engine.status(f.project,f.id);assert.equal(st.tasks.b.status,'stale');await assert.rejects(engine.begin(f.project,f.id,'a'),/active|executing/i);await assert.rejects(submitFacts(f.project,f.id,'b',{runId:randomUUID(),executor:'codex-native',reference:'SYNTHETIC',result:'ok'}),/matching|active/i);const ended=await submit(f,'b',r);assert.equal(ended.phase,'stale');await assert.rejects(verifyFacts(f.project,f.id,'b'),/pending|approved/i);await engine.rework(f.project,f.id,'a',{runId:(await engine.status(f.project,f.id)).tasks.a.runId,reason:'SYNTHETIC evidence repair',reference:'SYNTHETIC test finding'});const next=await engine.begin(f.project,f.id,'a');assert.notEqual(next.runId,r.runId);return {closed:true,resultStillStale:true};});

await test('invalid-approval-closure','An original run may close after approval invalidation without restoring approval',async()=>{const f=await fixture('invalid-close',{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');await fs.appendFile(path.join(f.project,'input.txt'),'CHANGED');assert.equal((await engine.status(f.project,f.id)).approval,null);const ended=await submit(f,'a',r);assert.equal(ended.phase,'stale');assert.equal((await engine.status(f.project,f.id)).approval,null);const beforeReplay=await engine.status(f.project,f.id);const replay=await submit(f,'a',r);assert.equal(replay.replayed,true);assert.equal(replay.acceptedForVerification,false);assert.equal((await engine.status(f.project,f.id)).events.filter(e=>e.type==='execution_receipt').length,beforeReplay.events.filter(e=>e.type==='execution_receipt').length);return {closedWithoutApproval:true,notAccepted:true,idempotentReplay:true};});

async function writeSyntheticState(f,events,tasks){const file=path.join(f.directory,'state.json'),state=await readJson(file);delete state.activeExecutions;delete state.executionBlockers;state.events=events;state.tasks=tasks;await writeJson(file,state);return file;}

await test('orphan-current-run','Complete current begin survives loss of redundant task/cache pointers',async()=>{const f=await fixture('orphan-current',{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a'),s=await readJson(path.join(f.directory,'state.json'));await writeSyntheticState(f,s.events,{a:{status:'todo'}});await assert.rejects(engine.begin(f.project,f.id,'a'),/active|executing/i);const before=await digest(path.join(f.directory,'state.json')),ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.activeExecutions[0].runId,r.runId);assert.equal(await digest(path.join(f.directory,'state.json')),before);await submit(f,'a',r,'failed');await engine.begin(f.project,f.id,'a');return{completeBeginRecovered:true};});

await test('ambiguous-current-begins','Two complete current begins close only by explicit matching identity',async()=>{const f=await fixture('ambiguous-current',{two:false});await approve(f);const first=await engine.begin(f.project,f.id,'a'),s=await readJson(path.join(f.directory,'state.json')),begin=s.events.find(e=>e.type==='begin'),second={...begin,runId:randomUUID()};await writeSyntheticState(f,[...s.events,second],{a:{status:'todo'}});const before=await digest(path.join(f.directory,'state.json')),ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.activeExecutions.length,2);assert.equal(ctx.canBegin,false);assert.equal(await digest(path.join(f.directory,'state.json')),before);await submit(f,'a',first,'failed');assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,second.runId);await assert.rejects(engine.begin(f.project,f.id,'a'),/active|executing/i);await submit(f,'a',second,'failed');await engine.begin(f.project,f.id,'a');return{readOnly:true,explicitClosures:true};});

await test('render-symlink-sentinel','Render rejects a redirected master before writing, preserving link and sentinel',async()=>{const f=await fixture('render-link',{two:false});const sentinel=path.join(root,'outside-render.txt');await fs.writeFile(sentinel,'SYNTHETIC SENTINEL');const before=await digest(sentinel);const master=path.join(f.directory,'HARNESS.md');await fs.rename(master,path.join(f.directory,'master.saved'));await fs.symlink(sentinel,master,'file');await assert.rejects(engine.render(f.project,f.id),/symlink|symbolic|escapes/i);assert.equal(await digest(sentinel),before);assert.ok((await fs.lstat(master)).isSymbolicLink());return {sentinelUnchanged:true,linkPreserved:true};});

await test('render-hardlink-atomic','Publishing a master breaks its hardlink instead of modifying the other file',async()=>{const f=await fixture('render-hardlink',{two:false});const sentinel=path.join(root,'outside-hardmaster.txt');const master=path.join(f.directory,'HARNESS.md');await fs.link(master,sentinel);const before=await digest(sentinel);f.c.goal+=' changed';f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);assert.equal(await digest(sentinel),before);assert.notEqual(await digest(master),before);return {sentinelUnchanged:true};});

for(const protectedName of ['contract.json','HARNESS.md','state.json','receipt-synthetic.json','phases/a.md'])await test('protected-hardlink-'+protectedName.replaceAll('/','-'),'Review rejects output alias to '+protectedName,async()=>{const f=await fixture('protected-'+protectedName.replaceAll(/[/.]/g,'-').toLowerCase(),{two:false});const control=path.join(f.directory,protectedName);if(protectedName.startsWith('receipt-'))await fs.writeFile(control,'SYNTHETIC RECEIPT');await fs.mkdir(path.join(f.project,'out'));await fs.link(control,path.join(f.project,'out/a.txt'));const before=await digest(control);const prior=protectedName==='state.json'?await readJson(control):null;await assert.rejects(prepareCurrentReview(f.project,f.id),/conflict|protected|control|same file/i);if(prior){const current=await readJson(control);assert.equal(current.taskId,prior.taskId);assert.equal(current.schemaVersion,prior.schemaVersion);assert.deepEqual(Object.keys(current.tasks),Object.keys(prior.tasks));assert.equal(current.events.filter(e=>e.type==='review_prepared').length,prior.events.filter(e=>e.type==='review_prepared').length);assert.equal(await digest(path.join(f.project,'out/a.txt')),before);const a=await fs.stat(control,{bigint:true}),b=await fs.stat(path.join(f.project,'out/a.txt'),{bigint:true});if(a.ino!==0n)assert.notEqual(a.ino,b.ino);}else assert.equal(await digest(control),before);return {rejected:true,controlPreserved:true};});

await test('failed-acceptance-recovery','Actual exit failure has a state/context pointer and successful retry preserves prior failure',async()=>{const marker='validation-pass.txt';const f=await fixture('failure-history',{two:false,acceptance:[{id:'check',type:'command',description:'Check a synthetic marker',command:process.execPath,args:['-e',`process.exit(require('node:fs').existsSync('${marker}')?0:9)`],timeoutMs:3000}]});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);await assert.rejects(verifyFacts(f.project,f.id,'a'),/exit 9/);const st=await engine.status(f.project,f.id);const ctx=await engine.taskContext(f.project,f.id,'a');assert.ok(st.tasks.a.lastAcceptance,'Recoverable acceptance attempt is missing');assert.equal(st.tasks.a.lastAcceptance.status,'failed');const log=st.tasks.a.lastAcceptance.log;assert.ok(log?.path);assert.ok(JSON.stringify(ctx).includes(log.path.replaceAll('\\','\\\\'))||ctx.acceptance?.log?.path===log.path);assert.equal(await digest(log.path),log.sha256);await fs.writeFile(path.join(f.project,marker),'SYNTHETIC');const v=await verifyFacts(f.project,f.id,'a');assert.equal(v.taskStatus,'verified');const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.lastAcceptance.status,'passed');assert.equal(after.tasks.a.acceptanceAttempts.length,2);assert.equal(await digest(log.path),log.sha256);return {failureRecoverable:true,retryPassed:true,historyPreserved:true};});

await test('acceptance-spawn-failure','Unavailable executable preserves actual error with null exit and real log',async()=>{const f=await fixture('spawn-failure',{two:false,acceptance:[{id:'spawn',type:'command',description:'Synthetic unavailable executable',command:path.join(root,'no-such-program'),args:[]}]});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);await assert.rejects(verifyFacts(f.project,f.id,'a'));const st=await engine.status(f.project,f.id);const a=st.tasks.a.lastAcceptance;assert.ok(a,'Recoverable acceptance attempt is missing');assert.equal(a.status,'failed');assert.equal(a.exitCode,null);assert.ok(a.log?.path);assert.equal(st.tasks.a.status,'pending_acceptance');return {spawnFailureRecorded:true};});

await test('acceptance-log-creation-failure','An injected filesystem log-creation failure is recorded without fabricating a log',async()=>{const f=await fixture('log-failure',{two:false,acceptance:[{id:'log',type:'command',description:'Synthetic FS boundary failure',command:process.execPath,args:['-e','process.exit(0)']}]});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);const originalOpen=fs.open;try{fs.open=async function(file,...args){if(path.basename(String(file)).startsWith('check-'))throw Object.assign(new Error('SYNTHETIC injected EACCES at log creation'),{code:'EACCES'});return originalOpen.call(this,file,...args);};await assert.rejects(verifyFacts(f.project,f.id,'a'),/EACCES/);}finally{fs.open=originalOpen;}const st=await engine.status(f.project,f.id);assert.ok(st.tasks.a.lastAcceptance,'Recoverable acceptance attempt is missing');assert.equal(st.tasks.a.lastAcceptance.status,'failed');assert.equal(st.tasks.a.lastAcceptance.log,null);assert.equal(st.tasks.a.lastAcceptance.exitCode,null);assert.match(st.tasks.a.lastAcceptance.error,/EACCES/);return {injectedBoundary:true,noFabricatedLog:true};});

await test('acceptance-preflight-evidence','Changed receipt is recorded as an integrity failure in recovery context',async()=>{const f=await fixture('integrity-record',{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');const s=await submit(f,'a',r);await fs.appendFile(s.receipt.path,' ');await assert.rejects(verifyFacts(f.project,f.id,'a'),/receipt changed/);const st=await engine.status(f.project,f.id);assert.ok(st.tasks.a.lastAcceptance,'Recoverable acceptance attempt is missing');assert.equal(st.tasks.a.lastAcceptance.status,'failed');assert.match(st.tasks.a.lastAcceptance.error,/receipt changed/);return {integrityFailureRecorded:true};});

await test('pending-handoff-readonly','Pending handoff returns complete navigation without rewriting state',async()=>{const f=await fixture('handoff',{two:false});const file=path.join(f.directory,'state.json');const before=await digest(file);const r=command(['handoff','--project',f.project,'--id',f.id]);assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/contract.json/);assert.match(r.stdout,/phases\/a.md/);assert.equal(await digest(file),before);return {stateUnchanged:true};});

await test('closure-preserves-later-run','Closing another complete begin never overwrites the current run pointer',async()=>{const f=await fixture('closure-current',{two:false});await approve(f);const first=await engine.begin(f.project,f.id,'a'),s=await readJson(path.join(f.directory,'state.json')),begin=s.events.find(e=>e.type==='begin'),second={...begin,runId:randomUUID()};s.events.push(second);s.tasks.a={...s.tasks.a,runId:second.runId};delete s.activeExecutions;await writeJson(path.join(f.directory,'state.json'),s);await submit(f,'a',first,'failed');const st=await engine.status(f.project,f.id);assert.equal(st.tasks.a.runId,second.runId);assert.equal(st.tasks.a.status,'executing');assert.deepEqual(st.activeExecutions.map(x=>x.runId),[second.runId]);await submit(f,'a',second,'failed');return{currentIdentityPreserved:true};});

const helper=path.join(source,'scripts/tests/helpers/controlled-child.mjs');

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const bounded=async(p,ms=2500)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SYNTHETIC test deadline: operation did not settle')),ms);})]);}finally{clearTimeout(timer);}};

const key=f=>path.resolve(String(f)).toLowerCase();

async function renderFixture(f){
 for(let attempt=0;;attempt++)try{return await engine.render(f.project,f.id);}catch(error){
  const master=path.join(f.directory,'HARNESS.md');
  if(process.platform!=='win32'||attempt>=2||error.code!=='EPERM'||error.syscall!=='rename'||key(error.dest)!==key(master)||!String(error.path).startsWith(master+'.'))throw error;
  const state=await readJson(path.join(f.directory,'state.json'));
  if(!['draft','pending_user_review'].includes(state.phase)||state.approval||(state.activeExecutions??[]).length||(state.executionBlockers??[]).length||state.events.some(e=>['begin','user_decision','execution_receipt','acceptance','acceptance_attempt'].includes(e.type))||Object.values(state.tasks).some(t=>t.status!=='todo'))throw error;
  fixturePreparationRetries.push({id:f.id,stage:'pre-approval-render',attempt:attempt+1,previous:{code:error.code,syscall:error.syscall,source:error.path,destination:error.dest,error:error.message}});
  await pause((attempt+1)*200);
 }
}

async function change(f,edit){edit(f.c);f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await renderFixture(f);}

function wrapHandle(h,methods){return new Proxy(h,{get(target,prop){if(Object.hasOwn(methods,prop))return methods[prop];const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v;}});}

async function patchMethod(object,name,replacement,body){
 const before=object[name],openedWriteBoundary=object===fs&&name==='writeFile',previousOpen=openedWriteBoundary?fs.open:null;
 try{object[name]=replacement(before);
  // Faults target the same actual journal write whether Node exposes a path or an owned handle.
  // The fallback writes through that original handle; it never reopens or substitutes the target.
  if(openedWriteBoundary)fs.open=async function(file,flags,...args){const handle=await previousOpen.call(this,file,flags,...args);const privateFile=String(file).includes(path.sep+'harness-install-backups'+path.sep)&&(path.basename(String(file))==='plan.json'||/^[0-9]+\.bin$/.test(path.basename(String(file)))||String(file).includes('rollback.json.')&&String(file).endsWith('.tmp'));if(flags!=='wx'||!privateFile)return handle;const current=replacement((target,...values)=>key(target)===key(file)?handle.writeFile(...values):before.call(fs,target,...values));return wrapHandle(handle,{writeFile:(...values)=>current.call(fs,file,...values)});};
  if(object===childProcess)syncBuiltinESMExports();return await body();
 }finally{object[name]=before;if(openedWriteBoundary){fs.open=previousOpen;assert.equal(fs.open,previousOpen);}if(object===childProcess)syncBuiltinESMExports();assert.equal(object[name],before);}
}

async function refreshReview(f){await renderFixture(f);f.review=await prepareCurrentReview(f.project,f.id);}

function payload(f,r,extra={}){return {runId:r.runId,executor:'codex-native',reference:'SYNTHETIC '+f.project,result:'ok',...extra};}

const closedCount=s=>s.events.filter(e=>e.type==='execution_receipt').length;

for(const documents of [true])for(const kind of ['same','normalized','case','symlink','hardlink'])await test('input-'+('current-')+kind,'Immutable input must never own an output identity',async()=>{
  const f=await fixture('input-'+(documents?'l-':'o-')+kind,{documents,two:false});const input=path.join(f.project,'input.txt');const before=await digest(input);
  await fs.mkdir(path.join(f.project,'out'),{recursive:true});let output;
  if(kind==='same')output='input.txt';if(kind==='normalized')output='out/../input.txt';
  if(kind==='case')output=process.platform==='win32'?'INPUT.TXT':'./input.txt';
  if(kind==='symlink'){output='out/a.txt';await fs.symlink(input,path.join(f.project,output),'file');}
  if(kind==='hardlink'){output='out/a.txt';await fs.link(input,path.join(f.project,output));}
  await assert.rejects(async()=>{await change(f,c=>{c.deliverables[0].path=output;});await prepareCurrentReview(f.project,f.id);},/input|immutable|conflict|same file|canonical project-relative path/i);
  assert.equal(await digest(input),before);return {inputPreserved:true};
});

await test('independent-equal-content','Equal bytes in distinct files are not identity collisions',async()=>{
  const f=await fixture('equal-content',{two:false});await fs.mkdir(path.join(f.project,'out'));await fs.copyFile(path.join(f.project,'input.txt'),path.join(f.project,'out/a.txt'));
  f.review=await prepareCurrentReview(f.project,f.id);await approve(f);const before=await digest(path.join(f.project,'input.txt'));await finish(f,'a');assert.equal(await digest(path.join(f.project,'input.txt')),before);return {verified:true};
});

for(const field of ['taskId','task','deliverable','acceptance'])await test('id-type-'+field,'IDs reject all non-string types before review',async()=>{
  const f=await fixture('id-'+field.toLowerCase(),{documents:false,two:false});
  for(const value of [false,true,['legal-id'],{},0,null,undefined]){
    const c=structuredClone(f.c);
    if(field==='taskId')c.taskId=value;if(field==='task')c.tasks[0].id=value;
    if(field==='deliverable'){c.deliverables[0].id=value;c.tasks[0].outputs=[value];}
    if(field==='acceptance')c.tasks[0].acceptance[0].id=value;
    assert.throws(()=>validateContract(c),undefined,'Non-string '+field+' accepted: '+JSON.stringify(value));
  }
  for(const id of ['a','legal-id','a'+'1'.repeat(63)])assert.equal(safeId(id),id);
  for(const id of ['', 'A', '1a','a'.repeat(65)])assert.throws(()=>safeId(id));
  return {typeCases:7,legalStringsPreserved:true};
});

for(const documents of [true])for(const kind of ['state','dot-state','case-state','normalized-state','symbolic-state','hard-state','receipt','acceptance','check','execution','direct-receipt','direct-acceptance','direct-check','direct-execution','master','contract'])await test('review-'+('current-')+kind,'Mutable and duplicate control identities cannot be review attachments',async()=>{
  const f=await fixture('review-'+(documents?'l-':'o-')+kind,{documents,two:false});let relative;
  if(kind==='state')relative='state.json';if(kind==='dot-state')relative='./state.json';
  if(kind==='case-state')relative=process.platform==='win32'?'STATE.JSON':'./state.json';
  if(kind==='normalized-state')relative='unused/../state.json';
  if(kind==='symbolic-state'||kind==='hard-state')relative='looks-like-plan.md';
  if(['receipt','acceptance','check','execution'].includes(kind)){const original=kind+'-synthetic.txt';await fs.writeFile(path.join(f.directory,original),'SYNTHETIC evidence');relative='ordinary-attachment.md';await fs.link(path.join(f.directory,original),path.join(f.directory,relative));}
  if(kind.startsWith('direct-')){relative=kind.slice(7)+'-direct.txt';await fs.writeFile(path.join(f.directory,relative),'SYNTHETIC direct evidence');}if(kind==='master')relative='./HARNESS.md';if(kind==='contract')relative='./contract.json';
  await change(f,c=>{c.reviewFiles=[relative];});if(kind==='symbolic-state'||kind==='hard-state'){await fs[kind==='hard-state'?'link':'symlink'](path.join(f.directory,'state.json'),path.join(f.directory,relative),...(kind==='hard-state'?[]:['file']));const a=await fs.stat(path.join(f.directory,'state.json'),{bigint:true}),b=await fs.stat(path.join(f.directory,relative),{bigint:true});assert.equal(a.ino,b.ino);assert.equal(a.dev,b.dev);}const prior=await readJson(path.join(f.directory,'state.json'));
  await assert.rejects(prepareCurrentReview(f.project,f.id),/review|control|mutable|alias|duplicate|state|evidence/i);
  const after=await readJson(path.join(f.directory,'state.json'));assert.equal(closedCount(after),closedCount(prior));assert.equal(after.events.filter(e=>e.type==='review_prepared').length,prior.events.filter(e=>e.type==='review_prepared').length);
  return {rejectedBeforeReview:true};
});

for(const documents of [true])await test('ordinary-attachment-'+documents,'Ordinary nested attachments retain a complete lifecycle',async()=>{
  const f=await fixture('ordinary-'+documents,{documents,two:false});await fs.mkdir(path.join(f.directory,'notes'));await fs.writeFile(path.join(f.directory,'notes/method.md'),'SYNTHETIC ordinary plan');
  await change(f,c=>{c.reviewFiles=['notes/method.md'];});f.review=await prepareCurrentReview(f.project,f.id);await approve(f);assert.equal((await finish(f,'a')).taskStatus,'verified');return {verified:true};
});

async function fakeProcess(mode,body,{logFault}={}){
  const oldSpawn=childProcess.spawn,oldOpen=fs.open;let child;let alive=false;let closeObserved=false;let kills=0;const unhandled=[];const onUnhandled=e=>unhandled.push(e.message);process.on('unhandledRejection',onUnhandled);const onUncaught=e=>unhandled.push('uncaught: '+e.message);process.on('uncaughtException',onUncaught);
  childProcess.spawn=()=>{
    if(mode==='spawn-throw')throw new Error('SYNTHETIC spawn failure');
    child=new EventEmitter();child.pid=987654321;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
    child.stdin.end=()=>queueMicrotask(()=>{alive=true;child.emit('spawn');if(mode==='auto-close'){alive=false;closeObserved=true;child.emit('close',7,null);}if(mode==='write-fail')child.stdout.emit('data',Buffer.from('SYNTHETIC write'));});
    child.kill=()=>{kills++;if(mode==='kill-throw')throw new Error('SYNTHETIC kill throws');if(mode!=='kill-false')child.emit('error',Object.assign(new Error('SYNTHETIC kill EPERM'),{code:'EPERM'}));return false;};
    return child;
  };syncBuiltinESMExports();
  if(logFault)fs.open=async function(file,...args){const h=await oldOpen.call(this,file,...args);if(!key(file).includes(key(root))||(!path.basename(String(file)).startsWith('check-')&&!path.basename(String(file)).startsWith('execution-')&&!path.basename(String(file)).startsWith('log-')))return h;
    return wrapHandle(h,{write:async(...a)=>{if(logFault==='write')throw new Error('SYNTHETIC log write failure');return h.write(...a);},close:async()=>{await h.close();if(logFault==='close')throw new Error('SYNTHETIC log close failure');}});
  };
  const controls={wait:async()=>{for(let i=0;i<200&&!child;i++)await pause(5);assert.ok(child,'spawn boundary was not reached');await pause(30);},stdout:bytes=>child.stdout.emit('data',bytes),close:(code=7)=>{alive=false;closeObserved=true;child.emit('close',code,null);},state:()=>({alive,closeObserved,kills,unhandled})};
  try{return await body(controls);}finally{childProcess.spawn=oldSpawn;syncBuiltinESMExports();fs.open=oldOpen;process.removeListener('unhandledRejection',onUnhandled);process.removeListener('uncaughtException',onUncaught);assert.equal(childProcess.spawn,oldSpawn);assert.equal(fs.open,oldOpen);}
}

for(const mode of ['kill-error','kill-false','kill-throw','write-fail'])await test('process-active-'+mode,'Post-spawn errors preserve active identity until actual close',async()=>{
  const f=await fixture('active-'+mode,{two:false});await approve(f);let finished=false;
  return fakeProcess(mode,async control=>{
    const p=runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:15}).then(x=>{finished=true;return x;},e=>{finished=true;return e;});
    await control.wait();await pause(40);const st=await engine.status(f.project,f.id);
    const early=finished;const active=st.activeExecutions.length;let guarded=false;try{await engine.begin(f.project,f.id,'a');}catch{guarded=true;}
    control.close();const result=await bounded(p);await pause(15);
    assert.equal(early,false,'Operation completed before child close');assert.equal(active,1);assert.equal(guarded,true);assert.equal(control.state().unhandled.length,0);assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,0);assert.equal(result.executionClosed,true);
    return {closeRequired:true,activePreserved:true,controlErrors:result};
  },{logFault:mode==='write-fail'?'write':undefined});
});

for(const mode of ['auto-close','spawn-throw'])await test('log-close-'+mode,'Cleanup rejection settles and keeps process facts without unhandled rejection',async()=>{
  const f=await fixture('close-'+mode,{two:false});
  return fakeProcess(mode,async control=>{
    const observed=runProcess(process.execPath,[],{cwd:f.project,log:path.join(f.project,'log-close.txt')}).then(value=>({value}),error=>({error}));
    const result=await Promise.race([observed,pause(250).then(()=>({pending:true}))]);await pause(20);
    assert.equal(result.pending,undefined,'Outer promise remained pending');assert.equal(control.state().unhandled.length,0);assert.ok(result.error,'Logging failure must reject');
    assert.match(result.error.message,/close failure/);assert.equal(result.error.processResult?.processState,mode==='auto-close'?'closed':'not-started');
    if(mode==='auto-close')assert.equal(result.error.processResult.exitCode,7);return {settled:true,processState:result.error.processResult.processState};
  },{logFault:'close'});
});

await test('verify-cleanup-facts','Failed acceptance preserves actual exit and cleanup error',async()=>{
  const f=await fixture('verify-cleanup',{two:false,acceptance:[{id:'check',type:'command',description:'SYNTHETIC close fault',command:process.execPath,args:[]}]});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);
  await fakeProcess('auto-close',async()=>{await bounded(assert.rejects(verifyFacts(f.project,f.id,'a'),/close failure/));},{logFault:'close'});
  const st=await engine.status(f.project,f.id);assert.equal(st.tasks.a.lastAcceptance.status,'failed');assert.equal(st.tasks.a.lastAcceptance.exitCode,7);assert.equal(st.tasks.a.lastAcceptance.processResult.processState,'closed');assert.equal(st.tasks.a.status,'pending_acceptance');return {failedWithRealExit:true};
});

for(const mode of ['echo','fail','eof','wait'])await test('real-child-'+mode,'Real owned Node helper records stdout/stderr/EOF/timeout and true close',async()=>{
  const log=path.join(root,'child-'+mode+'.txt');let actual;const result=await patchMethod(childProcess,'spawn',before=>(...args)=>{const child=before(...args);actual={pid:child.pid,closed:false};child.on('close',(code,signal)=>Object.assign(actual,{closed:true,code,signal}));return child;},()=>runProcess(process.execPath,[helper,mode],{cwd:root,log,input:'SYNTHETIC EOF',timeoutMs:mode==='wait'?500:4000}));assert.ok(actual.pid>0);assert.equal(actual.closed,true);assert.equal(result.pid,actual.pid);assert.equal(result.exitCode,actual.code);assert.equal(result.signal,actual.signal);assert.equal(result.outputBytes,(await fs.readFile(log)).length);if(mode!=='wait')assert.equal(result.exitCode,mode==='fail'?7:0);
  assert.equal(result.processState,'closed');assert.equal(result.code,mode==='wait'?124:mode==='fail'?7:0);
  if(mode==='eof')assert.match(await fs.readFile(log,'utf8'),/"stdinBytes":13/);
  if(mode==='echo'){assert.match(await fs.readFile(log,'utf8'),/stdout/);assert.match(await fs.readFile(log,'utf8'),/stderr/);}if(mode==='wait')assert.equal(result.timedOut,true);
  return {processState:result.processState,code:result.code,exitCode:result.exitCode,signal:result.signal};
});

await test('real-engine-helper','Actual engine.run uses a synthetic local executor, never a model',async()=>{
  const f=await fixture('real-engine',{two:false});await approve(f);const result=await runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000});assert.equal(result.phase,'pending_acceptance');const receipt=await readJson(result.receipt.path);assert.equal(receipt.process.processState,'closed');assert.match(await fs.readFile(receipt.reference,'utf8'),/"synthetic":true/);await emit(f,'a');assert.equal((await verifyFacts(f.project,f.id,'a')).taskStatus,'verified');return {syntheticExecutorOnly:true};
});

await test('ended-log-digest-failure','A log read failure cannot hide a known ended execution',async()=>{
  const f=await fixture('log-digest',{two:false});await approve(f);let failed=false;
  const result=await patchMethod(fs,'readFile',before=>async function(file,...args){if(path.basename(String(file)).startsWith('execution-')&&!failed){failed=true;throw new Error('SYNTHETIC log digest failure');}return before.call(this,file,...args);},()=>runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}));
  const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,0);assert.equal(st.tasks.a.status,'failed');const r=await readJson(result.receipt.path);assert.equal(r.process.processState,'closed');assert.match(JSON.stringify(r),/log digest failure/);return {endedRecorded:true,noFabricatedLogHash:true};
});

for(const point of ['digest','state'])await test('receipt-recover-'+point,'Published receipt replays after an actual post-publication failure',async()=>{
  const f=await fixture('recover-'+point,{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');const value=payload(f,r);const final=path.join(f.directory,'receipt-'+r.runId+'.json');let injected=false;
  if(point==='digest')await patchMethod(fs,'readFile',before=>async function(file,...args){if(key(file)===key(final)&&!injected){injected=true;throw new Error('SYNTHETIC receipt digest failure');}return before.call(this,file,...args);},async()=>{await assert.rejects(submitFacts(f.project,f.id,'a',value),/digest failure/);});
  else await patchMethod(fs,'rename',before=>async function(a,b,...args){if(key(b)===key(path.join(f.directory,'state.json'))){injected=true;throw new Error('SYNTHETIC state commit failure');}return before.call(this,a,b,...args);},async()=>{await assert.rejects(submitFacts(f.project,f.id,'a',value),/state commit failure/);});
  assert.equal(injected,true);JSON.parse(await fs.readFile(final,'utf8'));const before=await digest(final);const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,1);
  const restored=await submitFacts(f.project,f.id,'a',value);assert.equal(restored.executionClosed,true);assert.equal(restored.replayed,true);assert.equal(await digest(final),before);const after=await engine.status(f.project,f.id);assert.equal(after.activeExecutions.length,0);assert.equal(closedCount(after),1);return {sameRunRecovered:true,point};
});

for(const result of ['ok','failed'])await test('replay-'+result,'Same receipt replay is idempotent, including after verified',async()=>{
  const f=await fixture('replay-'+result,{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');const value=payload(f,r,{result,outcome:'negative'});await emit(f,'a');const first=await submitFacts(f.project,f.id,'a',value);if(result==='ok'){const pending=await engine.status(f.project,f.id);const hash=await digest(first.receipt.path);assert.equal((await submitFacts(f.project,f.id,'a',Object.fromEntries(Object.entries(value).reverse()))).replayed,true);const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.status,'pending_acceptance');assert.equal(closedCount(after),closedCount(pending));assert.equal(await digest(first.receipt.path),hash);await verifyFacts(f.project,f.id,'a');}const prior=await engine.status(f.project,f.id);const bytes=await fs.readFile(first.receipt.path);
  const reordered=Object.fromEntries(Object.entries(value).reverse());
  for(let i=0;i<2;i++){const again=await submitFacts(f.project,f.id,'a',reordered);assert.equal(again.replayed,true);}
  const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.status,prior.tasks.a.status);assert.equal(closedCount(after),closedCount(prior));assert.deepEqual(await fs.readFile(first.receipt.path),bytes);return {status:after.tasks.a.status,oneClosure:true};
});

await test('replay-preserves-current','Old closed replay never overwrites another actual current run',async()=>{
  const f=await fixture('replay-current',{two:false});await approve(f);const a=await engine.begin(f.project,f.id,'a');const value=payload(f,a,{result:'failed'});await submitFacts(f.project,f.id,'a',value);const b=await engine.begin(f.project,f.id,'a');const prior=await engine.status(f.project,f.id);await submitFacts(f.project,f.id,'a',value);const after=await engine.status(f.project,f.id);assert.deepEqual(after.tasks,prior.tasks);assert.deepEqual(after.activeExecutions,prior.activeExecutions);assert.equal(after.tasks.a.runId,b.runId);await submit(f,'a',b,'failed');return {currentRunUnchanged:true};
});

await test('replay-content-conflicts','Every caller fact change is refused without changing evidence',async()=>{
  const f=await fixture('replay-conflict',{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');const value=payload(f,r,{summary:'original',process:syntheticClosedProcess(),logs:[]});const first=await submitFacts(f.project,f.id,'a',value);const hash=await digest(first.receipt.path);const count=closedCount(await engine.status(f.project,f.id));
  for(const extra of [{reference:'changed'},{result:'failed'},{outcome:'positive'},{summary:'changed'},{process:{...value.process,outputBytes:1}},{logs:[{path:'changed',sha256:'0'.repeat(64)}]}])await assert.rejects(submitFacts(f.project,f.id,'a',{...value,...extra}));
  assert.equal(await digest(first.receipt.path),hash);assert.equal(closedCount(await engine.status(f.project,f.id)),count);return {conflictCases:6};
});

for(const kind of ['broken','wrong-run','wrong-step','wrong-task','wrong-review'])await test('receipt-existing-'+kind,'Existing final is validated and never blindly overwritten',async()=>{
  const f=await fixture('existing-'+kind,{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');const value=payload(f,r);const file=path.join(f.directory,'receipt-'+r.runId+'.json');await publishWithoutState(f,r,value);let saved=await readJson(file);
  if(kind==='wrong-run')saved.runId=randomUUID();if(kind==='wrong-step')saved.step='b';if(kind==='wrong-task')saved.taskId='another';if(kind==='wrong-review')saved.reviewDigest='0'.repeat(64);
  await fs.writeFile(file,kind==='broken'?'{"partial":':JSON.stringify(saved));const before=await digest(file);
  {await assert.rejects(submitFacts(f.project,f.id,'a',value));assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,1);}
  assert.equal(await digest(file),before);return {filePreserved:true};
});

for(const drift of ['approval','dependency'])await test('receipt-stale-recover-'+drift,'Replay recomputes acceptance eligibility after upstream drift',async()=>{
  const f=await fixture('recover-stale-'+drift,{two:drift==='dependency'});await approve(f);if(drift==='dependency')await finish(f,'a');const step=drift==='dependency'?'b':'a';const r=await engine.begin(f.project,f.id,step);const value=payload(f,r,{outcome:'negative'});const final=path.join(f.directory,'receipt-'+r.runId+'.json');let injected=false;
  await patchMethod(fs,'readFile',before=>async function(file,...args){if(key(file)===key(final)&&!injected){injected=true;throw new Error('SYNTHETIC crash window');}return before.call(this,file,...args);},async()=>{await assert.rejects(submitFacts(f.project,f.id,step,value));});
  await emit(f,step);const original=await digest(final);if(drift==='approval')await fs.appendFile(path.join(f.project,'input.txt'),'CHANGED');else await emit(f,'a','CHANGED');
  const ended=await submitFacts(f.project,f.id,step,value);assert.equal(ended.acceptedForVerification,false);assert.equal(ended.phase,'stale');const after=await engine.status(f.project,f.id);assert.equal(after.activeExecutions.length,0);assert.equal(after.tasks[step].status,'stale');assert.equal(after.tasks[step].outcome,'negative');if(drift==='approval')assert.equal(after.approval,null);assert.equal(await digest(final),original);await assert.rejects(verifyFacts(f.project,f.id,step),/approved execution|pending acceptance/i);return {staleOnly:true};
});

for(const stage of ['write','close','publish','cleanup'])await test('receipt-publication-'+stage,'Final publication is complete, exclusive and recoverable',async()=>{
  const f=await fixture('publish-'+stage,{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');const value=payload(f,r);const final=path.join(f.directory,'receipt-'+r.runId+'.json');let hit=false;
  const oldOpen=fs.open,oldLink=fs.link,oldUnlink=fs.unlink;
  try{
    fs.open=async function(file,...args){const h=await oldOpen.call(this,file,...args);if(!String(file).startsWith(final+'.')||!String(file).endsWith('.tmp'))return h;return wrapHandle(h,{writeFile:async(...a)=>{if(stage==='write'){hit=true;await h.writeFile('{');throw new Error('SYNTHETIC temp write');}return h.writeFile(...a);},close:async()=>{await h.close();if(stage==='close'){hit=true;throw new Error('SYNTHETIC temp close');}}});};
    fs.link=async function(a,b,...args){if(key(b)===key(final)&&stage==='publish'){hit=true;throw new Error('SYNTHETIC publish failure');}return oldLink.call(this,a,b,...args);};
    fs.unlink=async function(file,...args){if(String(file).startsWith(final+'.')&&stage==='cleanup'){hit=true;throw new Error('SYNTHETIC temp cleanup');}return oldUnlink.call(this,file,...args);};
    const attempt=await submitFacts(f.project,f.id,'a',value).then(value=>({value}),error=>({error}));
    assert.equal(hit,true,'Expected boundary was not reached');if(stage!=='cleanup'){assert.ok(attempt.error);await assert.rejects(fs.stat(final),{code:'ENOENT'});}
    else {assert.match(attempt.error?.message??JSON.stringify(attempt.value),/cleanup/);JSON.parse(await fs.readFile(final,'utf8'));const hash=await digest(final);const temps=(await fs.readdir(f.directory)).filter(x=>x.startsWith(path.basename(final)+'.'));assert.equal(temps.length,1);const a=await fs.stat(final,{bigint:true}),b=await fs.stat(path.join(f.directory,temps[0]),{bigint:true});assert.equal(a.ino,b.ino);assert.equal((await submitFacts(f.project,f.id,'a',value)).executionClosed,true);assert.equal(await digest(final),hash);assert.equal(closedCount(await engine.status(f.project,f.id)),1);}
  }finally{fs.open=oldOpen;fs.link=oldLink;fs.unlink=oldUnlink;}
  if(stage!=='cleanup')assert.equal((await submitFacts(f.project,f.id,'a',value)).executionClosed,true);const end=await engine.status(f.project,f.id);assert.equal(end.activeExecutions.length,0);assert.equal(closedCount(end),1);return {stage,completeFinalOnly:true};
});

async function installFixture(name,{copy=false,bytes=Buffer.from('SYNTHETIC personal policy\n')}={}){
  const dir=path.join(root,'install-'+name);const home=path.join(dir,'home'),skills=path.join(dir,'skills'),target=path.join(skills,'sciautoharness');await fs.mkdir(home,{recursive:true});await fs.mkdir(skills);const agents=path.join(home,'AGENTS.md');await fs.writeFile(agents,bytes);if(copy)await fs.cp(source,target,{recursive:true});
  return {dir,home,skills,target,agents,options:{hostHome:home,skillRoot:skills,replaceSkill:copy}};
}

for(const target of ['agents','skill'])for(const kind of ['hardlink','symlink'])await test('install-link-'+target+'-'+kind,'Preview refuses alias targets before touching sentinels',async()=>{
  const f=await installFixture('link-'+target+'-'+kind,{copy:target==='skill'});const file=target==='agents'?f.agents:path.join(f.target,'LICENSE');const sentinel=path.join(f.dir,'outside-target.txt');await fs.rename(file,sentinel);await fs[kind==='hardlink'?'link':'symlink'](sentinel,file,...(kind==='hardlink'?[]:['file']));const before=await digest(sentinel);
  await assert.rejects(previewInstall(f.options),/link|regular|identity|target/i);assert.equal(await digest(sentinel),before);return {sentinelPreserved:true};
});

for(const kind of ['content','identity','links'])await test('install-drift-'+kind,'Preview binds target content and identity/link state',async()=>{
  const f=await installFixture('drift-'+kind);const plan=await previewInstall(f.options);const before=await fs.readFile(f.agents);
  if(kind==='content')await fs.appendFile(f.agents,'USER CHANGE');
  if(kind==='identity'){await fs.rename(f.agents,path.join(f.dir,'original-policy'));await fs.writeFile(f.agents,before);}
  if(kind==='links')await fs.link(f.agents,path.join(f.dir,'new-alias'));
  const current=await fs.readFile(f.agents);await assert.rejects(applyInstall(plan),/changed|preview|link|identity/i);assert.deepEqual(await fs.readFile(f.agents),current);return {driftNotOverwritten:true};
});

for(const [caseId,bytes] of [['no-final-newline',Buffer.from('SYNTHETIC 无末尾换行')],['crlf',Buffer.from('SYNTHETIC CRLF\r\nnext\r\n')],['bom',Buffer.concat([Buffer.from([239,187,191]),Buffer.from('SYNTHETIC BOM 中文\r\n')])]])await test('install-byte-roundtrip-'+caseId,'Install/rollback preserve exact personal bytes',async()=>{
  const f=await installFixture('bytes-'+caseId,{bytes});const before=await fs.stat(f.agents,{bigint:true});const plan=await previewInstall(f.options);const result=await applyInstall(plan);const installed=await fs.readFile(f.agents);assert.deepEqual(installed.subarray(0,bytes.length),bytes);assert.equal((await fs.stat(f.agents,{bigint:true})).ino,before.ino);
  assert.equal((await applyInstall(await previewInstall(f.options))).status,'already-installed');await rollbackInstall(result.rollbackManifest);assert.deepEqual(await fs.readFile(f.agents),bytes);assert.equal((await fs.stat(f.agents,{bigint:true})).ino,before.ino);return {byteExact:true,inodePreserved:true};
});

await test('install-invalid-encoding','Unsupported original bytes are rejected rather than lossily decoded',async()=>{
  const bytes=Buffer.from([255,254,65,0,66,0]);const f=await installFixture('encoding',{bytes});await assert.rejects(previewInstall(f.options),/encoding|UTF|lossless/i);assert.deepEqual(await fs.readFile(f.agents),bytes);return {bytesPreserved:true};
});

for(const kind of ['identity','links','backup','content','envelope'])await test('rollback-preflight-'+kind,'All rollback targets pass preflight before any restore',async()=>{
  const f=await installFixture('rollback-'+kind,{copy:true});await fs.writeFile(path.join(f.target,'LICENSE'),'SYNTHETIC older longer file');const result=await applyInstall(await previewInstall(f.options));const record=await readJson(result.rollbackManifest);const last=record.changes.find(x=>x.target.endsWith('LICENSE'));assert.ok(last);const bytes=await fs.readFile(last.target);const agentsAfter=await fs.readFile(f.agents);let manifest=result.rollbackManifest;
  if(kind==='identity'){await fs.rename(last.target,path.join(f.dir,'installed-original'));await fs.writeFile(last.target,bytes);}
  if(kind==='links')await fs.link(last.target,path.join(f.dir,'linked-installed'));
  if(kind==='backup')await fs.appendFile(last.backup,'CORRUPT');
  if(kind==='content')await fs.appendFile(last.target,'USER');
  if(kind==='envelope'){delete record.format;for(const x of record.changes){delete x.beforeIdentity;delete x.afterIdentity;}manifest=path.join(path.dirname(result.rollbackManifest),'unbound.json');await writeJson(manifest,record);}
  const targetAfter=await fs.readFile(last.target);await assert.rejects(rollbackInstall(manifest));assert.deepEqual(await fs.readFile(f.agents),agentsAfter);assert.deepEqual(await fs.readFile(last.target),targetAfter);return {noEarlyRestore:true};
});

for(const stage of ['write','truncate'])await test('install-failure-'+stage,'Partial I/O failures stop later writes and retain prepared recovery evidence',async()=>{
  const f=await installFixture('failure-'+stage);const plan=await previewInstall(f.options);let hit=false;
  await patchMethod(fs,'open',before=>async function(file,...args){const h=await before.call(this,file,...args);if(key(file)!==key(f.agents))return h;return wrapHandle(h,{writeFile:async(...a)=>{if(stage==='write'){hit=true;await h.writeFile('PART');throw new Error('SYNTHETIC write failure');}return h.writeFile(...a);},truncate:async(...a)=>{if(stage==='truncate'){hit=true;throw new Error('SYNTHETIC truncate failure');}return h.truncate(...a);}});},async()=>{await assert.rejects(applyInstall(plan),/SYNTHETIC.*failure/);});
  assert.equal(hit,true);await assert.rejects(fs.stat(path.join(f.target,'SKILL.md')),{code:'ENOENT'});const dirs=await fs.readdir(path.join(f.home,'harness-install-backups'));const prepared=await readJson(path.join(f.home,'harness-install-backups',dirs[0],'rollback.json'));assert.equal(prepared.status,'prepared');return {laterWritesStopped:true,preparedManifest:true};
});

await test('install-new-target-race','Exclusive new-file creation preserves a racing owner',async()=>{
  const f=await installFixture('new-race');const plan=await previewInstall(f.options);const target=path.join(f.target,'SKILL.md');let hit=false;
  await patchMethod(fs,'open',before=>async function(file,...args){if(key(file)===key(target)&&!hit){hit=true;await fs.writeFile(target,'SYNTHETIC racing owner');}return before.call(this,file,...args);},async()=>{await assert.rejects(applyInstall(plan));});
  assert.equal(hit,true);assert.equal(await fs.readFile(target,'utf8'),'SYNTHETIC racing owner');return {racerPreserved:true};
});

await test('install-access-metadata','Existing access metadata and supported NTFS stream survive install and rollback',async()=>{
  const f=await installFixture('metadata',{copy:true});const license=path.join(f.target,'LICENSE');await fs.writeFile(license,'SYNTHETIC metadata original');const licenseBefore=await fs.stat(license,{bigint:true});const before=await fs.stat(f.agents,{bigint:true});let acl;let licenseAcl;
  const getAcl=(file=f.agents)=>{const script="(Get-Acl -LiteralPath '"+file.replaceAll("'","''")+"').Sddl";const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  if(process.platform==='win32'){acl=getAcl();licenseAcl=getAcl(license);await fs.writeFile(f.agents+':synthetic-stream','SYNTHETIC metadata');await fs.writeFile(license+':synthetic-stream','SYNTHETIC skill metadata');}
  const result=await applyInstall(await previewInstall(f.options));for(const stage of ['installed','restored']){if(stage==='restored')await rollbackInstall(result.rollbackManifest);const after=await fs.stat(f.agents,{bigint:true});assert.equal(after.ino,before.ino);assert.equal(after.mode,before.mode);assert.equal(after.uid,before.uid);assert.equal(after.gid,before.gid);if(process.platform==='win32'){assert.equal(getAcl(),acl);assert.equal(getAcl(license),licenseAcl);assert.equal(await fs.readFile(license+':synthetic-stream','utf8'),'SYNTHETIC skill metadata');assert.equal(await fs.readFile(f.agents+':synthetic-stream','utf8'),'SYNTHETIC metadata');}const ls=await fs.stat(license,{bigint:true});for(const k of ['ino','mode','uid','gid'])assert.equal(ls[k],licenseBefore[k]);}
  return {accessMetadataPreserved:true,ntfsStreamChecked:process.platform==='win32'};
});

await test('input-unavailable-inode','Multiply linked immutable input requires reliable physical identity',async()=>{
 const f=await fixture('input-no-inode',{two:false});const input=path.join(f.project,'input.txt');await fs.link(input,path.join(f.project,'input-alias'));const hash=await digest(input);
 await patchMethod(fs,'stat',before=>async function(file,...args){const st=await before.call(this,file,...args);return key(file)===key(input)?wrapHandle(st,{ino:0n}):st;},async()=>{await assert.rejects(prepareCurrentReview(f.project,f.id),/identity|multiply linked/);});
 assert.equal(await digest(input),hash);return {refusedWithoutIdentity:true};
});

await test('active-receipt-conflicts','Conflicting replay never closes a still-active original run',async()=>{
 const f=await fixture('active-conflict',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),value=payload(f,run,{summary:'original',process:syntheticClosedProcess(),logs:[]}),final=path.join(f.directory,'receipt-'+run.runId+'.json');let hit=false;
 await patchMethod(fs,'readFile',before=>async function(file,...a){if(key(file)===key(final)&&!hit){hit=true;throw new Error('SYNTHETIC post-publish');}return before.call(this,file,...a);},()=>assert.rejects(submitFacts(f.project,f.id,'a',value)));
 const hash=await digest(final);for(const extra of [{reference:'changed'},{result:'failed'},{outcome:'positive'},{summary:'changed'},{process:{...value.process,outputBytes:1}},{logs:[{path:'wrong',sha256:'0'.repeat(64)}]},{extensions:{unknownFact:true}}]){await assert.rejects(submitFacts(f.project,f.id,'a',{...value,...extra}),/conflict/i);const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions[0].runId,run.runId);assert.equal(closedCount(st),0);assert.equal(await digest(final),hash);}
 await submitFacts(f.project,f.id,'a',value);return {activeProtected:true};
});

await test('receipt-bound-hash-conflict','Semantic equality cannot replace an already-bound receipt digest',async()=>{
 const f=await fixture('hash-conflict',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),value=payload(f,run);const first=await submitFacts(f.project,f.id,'a',value);const obj=await readJson(first.receipt.path);await fs.writeFile(first.receipt.path,JSON.stringify(obj));const hash=await digest(first.receipt.path),before=await engine.status(f.project,f.id);await assert.rejects(submitFacts(f.project,f.id,'a',value),/digest|hash|conflict/i);assert.equal(await digest(first.receipt.path),hash);const after=await engine.status(f.project,f.id);assert.deepEqual(after.tasks,before.tasks);assert.equal(closedCount(after),closedCount(before));return {boundHashPreserved:true};
});

for(const kind of ['identity','links','symlink'])await test('install-open-recheck-'+kind,'Existing opened handle is rechecked before its first write',async()=>{
 const f=await installFixture('open-recheck-'+kind);const plan=await previewInstall(f.options);const original=await fs.readFile(f.agents),sentinel=path.join(f.dir,'protected-original');let hit=false;
 await patchMethod(fs,'open',before=>async function(file,...a){if(key(file)===key(f.agents)&&!hit){hit=true;if(kind==='links')await fs.link(f.agents,sentinel);else{await fs.rename(f.agents,sentinel);if(kind==='symlink')await fs.symlink(sentinel,f.agents,'file');else await fs.writeFile(f.agents,original);}}return before.call(this,file,...a);},()=>assert.rejects(applyInstall(plan),/identity|link|target/i));
 assert.equal(hit,true);assert.deepEqual(await fs.readFile(sentinel),original);assert.deepEqual(await fs.readFile(f.agents),original);await assert.rejects(fs.stat(path.join(f.target,'SKILL.md')),{code:'ENOENT'});return {openedDriftRefused:true};
});

await test('install-lock-recheck','The locked preview detects a target changed during lock acquisition',async()=>{
 const f=await installFixture('locked-preview');const plan=await previewInstall(f.options);let hit=false;
 await patchMethod(fs,'mkdir',before=>async function(file,...a){if(key(file)===key(path.join(f.home,'.writer-lock'))){hit=true;await fs.appendFile(f.agents,'SYNTHETIC USER CHANGE');}return before.call(this,file,...a);},()=>assert.rejects(applyInstall(plan),/changed/));assert.equal(hit,true);assert.match(await fs.readFile(f.agents,'utf8'),/USER CHANGE/);return {lockedDriftRefused:true};
});

for(const stage of ['open','backup','manifest'])await test('install-preparation-failure-'+stage,'Open/backup/manifest faults preserve originals and stop later writes',async()=>{
 const f=await installFixture('preparation-'+stage);const plan=await previewInstall(f.options);const original=await fs.readFile(f.agents);let hit=false;
 const method=stage==='open'?'open':'writeFile';await patchMethod(fs,method,before=>async function(file,...a){const name=String(file);if((stage==='open'&&key(file)===key(f.agents))||(stage==='backup'&&name.endsWith('0.bin'))||(stage==='manifest'&&name.includes('rollback.json.')&&name.endsWith('.tmp'))){hit=true;throw new Error('SYNTHETIC '+stage+' failure');}return before.call(this,file,...a);},async()=>{await assert.rejects(applyInstall(plan),e=>{assert.match(e.message,new RegExp('SYNTHETIC '+stage+' failure'));assert.ok(e.message.includes('backup'));return true;});});assert.equal(hit,true);assert.deepEqual(await fs.readFile(f.agents),original);await assert.rejects(fs.stat(path.join(f.target,'SKILL.md')),{code:'ENOENT'});return {preparationFailedSafely:true};
});

await test('replace-rollback-roundtrip','Replacing existing skill files restores original bytes/identity and removes only created files',async()=>{
 const f=await installFixture('replace-roundtrip',{copy:true});const license=path.join(f.target,'LICENSE'),created=path.join(f.target,'agents/openai.yaml');const original=Buffer.from('SYNTHETIC older LICENSE bytes are longer than replacement.\n'.repeat(30));await fs.writeFile(license,original);await fs.unlink(created);const stat=await fs.stat(license,{bigint:true});const result=await applyInstall(await previewInstall(f.options));await fs.stat(created);await rollbackInstall(result.rollbackManifest);assert.deepEqual(await fs.readFile(license),original);assert.equal((await fs.stat(license,{bigint:true})).ino,stat.ino);await assert.rejects(fs.stat(created),{code:'ENOENT'});return {replaceRestored:true,createdRemoved:true};
});

await test('stale-replay-after-dependency-repair','Closed stale results cannot regain acceptance when a predecessor is repaired',async()=>{
 const f=await fixture('stale-replay');await approve(f);await finish(f,'a');const run=await engine.begin(f.project,f.id,'b'),value=payload(f,run,{outcome:'negative'});await emit(f,'b');await emit(f,'a','SYNTHETIC drift');assert.equal((await submitFacts(f.project,f.id,'b',value)).acceptedForVerification,false);const file=path.join(f.directory,'receipt-'+run.runId+'.json'),hash=await digest(file);await finish(f,'a');const before=await engine.status(f.project,f.id);const replay=await submitFacts(f.project,f.id,'b',value);assert.equal(replay.acceptedForVerification,false);const after=await engine.status(f.project,f.id);assert.equal(after.tasks.b.status,'stale');assert.equal(after.tasks.b.outcome,'negative');assert.equal(closedCount(after),closedCount(before));assert.equal(await digest(file),hash);await assert.rejects(verifyFacts(f.project,f.id,'b'),/approved execution|pending acceptance/i);return {staleCannotRequalify:true};
});

await test('publication-dual-failure','Publication keeps original failure and cleanup failure with actual publication state',async()=>{
 const f=await fixture('publish-dual',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),value=payload(f,run),final=path.join(f.directory,'receipt-'+run.runId+'.json');const oldOpen=fs.open,oldUnlink=fs.unlink;let writeHit=false,cleanupHit=false;
 try{fs.open=async function(file,...a){const h=await oldOpen.call(this,file,...a);if(!String(file).startsWith(final+'.'))return h;return wrapHandle(h,{writeFile:async()=>{writeHit=true;throw new Error('SYNTHETIC primary write failure');}});};fs.unlink=async function(file,...a){if(String(file).startsWith(final+'.')){cleanupHit=true;throw new Error('SYNTHETIC secondary cleanup failure');}return oldUnlink.call(this,file,...a);};await assert.rejects(submitFacts(f.project,f.id,'a',value),e=>{assert.match(e.message,/primary write/);assert.match(e.message,/secondary cleanup/);assert.equal(e.receiptPublished,false);return true;});}finally{fs.open=oldOpen;fs.unlink=oldUnlink;}
 assert.equal(writeHit,true);assert.equal(cleanupHit,true);await assert.rejects(fs.stat(final),{code:'ENOENT'});assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,run.runId);await submitFacts(f.project,f.id,'a',value);return {bothErrorsPreserved:true};
});

await test('install-new-mode','New skill files bind source mode while existing targets retain their mode',async()=>{
 const f=await installFixture('source-mode');const plan=await previewInstall(f.options),target=path.join(f.target,'scripts/harness.mjs'),change=plan.changes.find(c=>key(c.target)===key(target));assert.ok(change);assert.equal(change.sourceMode,(await fs.stat(change.source)).mode&0o777);let mode;
 const result=await patchMethod(fs,'open',before=>async function(file,flags,...a){if(key(file)===key(target)){assert.equal(flags,'wx');mode=a[0];}return before.call(this,file,flags,...a);},()=>applyInstall(plan));assert.equal(mode,change.sourceMode);if(process.platform!=='win32')assert.equal((await fs.stat(target)).mode&0o777,change.sourceMode&~process.umask());await rollbackInstall(result.rollbackManifest);return {newSourceModeBound:true,posixRuntime:process.platform!=='win32'};
});

await test('rollback-duplicate-identity','Malformed duplicate target identities conflict with the original journal and refuse before any restore',async()=>{
 const f=await installFixture('duplicate-rollback',{copy:true});const license=path.join(f.target,'LICENSE');await fs.writeFile(license,'SYNTHETIC original');const result=await applyInstall(await previewInstall(f.options)),record=await readJson(result.rollbackManifest),bytes=await fs.readFile(f.agents);const duplicate=structuredClone(record.changes.find(c=>key(c.target)===key(license)));duplicate.target=process.platform==='win32'?duplicate.target.toUpperCase():path.join(path.dirname(duplicate.target),'x','..',path.basename(duplicate.target));record.changes.push(duplicate);const {bindingDigest:oldDigest,status:oldStatus,...duplicateBinding}=record;record.bindingDigest=hash(canonicalJson(duplicateBinding));const manifest=result.rollbackManifest;await writeJson(manifest,record);const stable=await publicSnapshot(f.dir);await assert.rejects(rollbackInstall(manifest),/duplicate|journal/i);assert.deepEqual(await publicSnapshot(f.dir),stable);assert.deepEqual(await fs.readFile(f.agents),bytes);return {duplicateRefusedBeforeWrite:true};
});

for(const documents of [true])await test('launch-drift-'+('current'),'Drift after execution log open prevents spawn and closes original facts',async()=>{
 const f=await fixture('launch-'+documents,{documents,two:false});await approve(f);let hit=false,spawns=0,result,error;
 await patchMethod(childProcess,'spawn',before=>(...a)=>{spawns++;return before(...a);},()=>patchMethod(fs,'open',before=>async function(file,...a){const h=await before.call(this,file,...a);if(!hit&&path.dirname(String(file))===f.directory&&path.basename(String(file)).startsWith('execution-')){hit=true;await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift');}return h;},async()=>{try{result=await runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000});}catch(e){error=e;}}));
 assert.equal(hit,true);assert.equal(spawns,0);const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,0);assert.equal(st.tasks.a.status,'stale');assert.equal(st.approval,null);assert.equal(closedCount(st),1);const receipt=await readJson(st.tasks.a.receipt.path);assert.equal(receipt.process.processState,'not-started');assert.equal(receipt.result,'failed');return {spawns,phase:st.phase,reported:!!(result||error)};
});

await test('lock-dual-failure','Lock cleanup preserves original failure and recovery path',async()=>{
 const {locked}=await import('../lib/files.mjs');const original=Object.assign(new Error('SYNTHETIC write failure; inspect C:/SYNTHETIC/backup/rollback.json'),{code:'ORIGINAL'});const cleanup=Object.assign(new Error('SYNTHETIC lock cleanup'),{code:'EACCES'});let error,calls=0;
 await patchMethod(fs,'mkdir',()=>async()=>{},()=>patchMethod(fs,'rmdir',()=>async()=>{calls++;throw cleanup;},async()=>{try{await locked(path.join(root,'memory-only-lock'),async()=>{throw original;});}catch(e){error=e;}}));
 assert.equal(calls,1);assert.equal(error.actionStatus,'failed');assert.equal(error.actionError,original);assert.equal(error.cleanupError,cleanup);assert.equal(error.cause,original);assert.match(error.message,/rollback.json/);return {bothErrorsPreserved:true};
});

const captureOutcome=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));

async function withLaunchBoundary(f,inject,body,{openFault=false,closeFault=false}={}){
 let hit=false,spawns=0;
 const result=await patchMethod(childProcess,'spawn',before=>(...a)=>{spawns++;return before(...a);},()=>patchMethod(fs,'open',before=>async function(file,...a){
  const match=path.dirname(String(file))===f.directory&&path.basename(String(file)).startsWith('execution-');
  if(match&&openFault){hit=true;throw new Error('SYNTHETIC log-open');}
  const h=await before.call(this,file,...a);if(match&&!hit){hit=true;await inject();return closeFault?wrapHandle(h,{close:async()=>{await h.close();throw new Error('SYNTHETIC log-close');}}):h;}return h;
 },body));return {result,hit,spawns};
}

for(const documents of [true])await test('run-normal-'+documents,'Own active run passes final gate without a second begin',async()=>{
 const f=await fixture('normal-'+documents,{documents,two:false});await approve(f);const x=await withLaunchBoundary(f,async()=>{assert.equal((await engine.taskContext(f.project,f.id,'a')).canBegin,false);},()=>runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}));assert.equal(x.spawns,1);assert.equal(x.result.phase,'pending_acceptance');let st=await engine.status(f.project,f.id);assert.equal(st.events.filter(e=>e.type==='begin').length,1);await emit(f,'a');assert.equal((await verifyFacts(f.project,f.id,'a')).taskStatus,'verified');return {spawns:x.spawns,oneBegin:true};
});

for(const mode of ['master','phase','contract','reject','revise','dependency','replacement','extra-active','ambiguous'])await test('launch-state-'+mode,'Final launch gate rejects a changed approval, dependency or run identity',async()=>{
 const dep=mode==='dependency',f=await fixture('gate-'+mode,{two:dep});await approve(f);if(dep)await finish(f,'a');const step=dep?'b':'a';let current;
 const x=await withLaunchBoundary(f,async()=>{
  if(mode==='master')await fs.appendFile(path.join(f.directory,'HARNESS.md'),'SYNTHETIC');
  else if(mode==='phase')await fs.appendFile(path.join(f.directory,'phases/a.md'),'SYNTHETIC');
  else if(mode==='contract'){const c=await readJson(path.join(f.directory,'contract.json'));c.revision++;await writeJson(path.join(f.directory,'contract.json'),c);}
  else if(mode==='dependency')await emit(f,'a','SYNTHETIC changed upstream');
  else {const p=path.join(f.directory,'state.json'),s=await readJson(p);if(['reject','revise'].includes(mode)){s.approval=null;s.phase=mode==='reject'?'rejected':'pending_user_review';}
   else if(mode==='replacement'){current=randomUUID();const original=s.events.find(e=>e.type==='begin'&&e.runId===s.tasks.a.runId);s.tasks.a={...s.tasks.a,runId:current};s.events.push({...original,runId:current});}
   else if(mode==='extra-active')s.events.push({...s.events.find(e=>e.type==='begin'),runId:randomUUID()});
   else s.events.push({...s.events.find(e=>e.type==='begin')});await writeJson(p,s);}
 },()=>captureOutcome(runLeafFixture(f.project,f.id,step,{executable:helper,timeoutMs:4000})));
 assert.equal(x.hit,true);assert.equal(x.spawns,0);assert.equal(x.result.ok,false);assert.equal(x.result.error.processResult.processState,'not-started');if(mode==='ambiguous'){assert.equal(x.result.error.executionClosed,false);const file=path.join(f.directory,'state.json'),bytes=await fs.readFile(file);await assert.rejects(engine.status(f.project,f.id),/Conflicting/);assert.deepEqual(await fs.readFile(file),bytes);return{mode,spawns:0,corruptStatePreserved:true};}const s=await engine.status(f.project,f.id);if(false){}else {assert.equal(x.result.error.executionClosed,true);assert.equal(closedCount(s),dep?2:1);}if(current)assert.equal(s.tasks.a.runId,current);return {mode,spawns:0,executionClosed:x.result.error.executionClosed};
});

for(const mode of ['contract','state','phase'])await test('prepare-read-failure-'+mode,'Read failures preserve original not-started facts and recover through the same submit',async()=>{
 const f=await fixture('read-'+mode,{two:false});await approve(f);const p=path.join(f.directory,mode==='phase'?'phases/a.md':mode+'.json');let bytes;
 const x=await withLaunchBoundary(f,async()=>{bytes=await fs.readFile(p);if(mode==='phase')await fs.unlink(p);else await fs.writeFile(p,'{bad JSON');},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000})));
 assert.equal(x.spawns,0);const e=x.result.error;assert.equal(e.processResult.processState,'not-started');assert.ok(e.runId);if(mode==='state'){assert.equal(e.executionClosed,false);assert.ok(e.closureError);await fs.writeFile(p,bytes);const r=await submitFacts(f.project,f.id,'a',e.submissionFacts);assert.equal(r.executionClosed,true);}else {assert.equal(e.executionClosed,true);await fs.writeFile(p,bytes);}
 assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,0);return {originalRun:e.runId,spawns:0,recovered:true};
});

await test('prepared-text-binding','Actual context text is checked against the final approved bytes',async()=>{
 const f=await fixture('prompt-binding',{two:false});await approve(f);const p=path.join(f.directory,'phases/a.md');let injected=false,spawns=0,phaseReads=0;
 const r=await patchMethod(childProcess,'spawn',before=>(...a)=>{spawns++;return before(...a);},()=>patchMethod(fs,'readFile',before=>async function(file,...a){const v=await before.call(this,file,...a);if(key(file)===key(p)&&++phaseReads===4){injected=true;const body=(Buffer.isBuffer(v)?v.toString('utf8'):v)+'\nSYNTHETIC transient different body';return Buffer.isBuffer(v)?Buffer.from(body):body;}return v;},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))));
 assert.equal(injected,true);assert.equal(spawns,0);assert.match(r.error.processResult.error,/context differs/i);assert.equal(r.error.executionClosed,true);return {injected,spawns};
});

for(const mode of ['open','prepare-close'])await test('run-log-'+mode,'Never-started log faults settle and retain all errors',async()=>{
 const f=await fixture('log-'+mode,{two:false});await approve(f);const x=await withLaunchBoundary(f,async()=>{await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC');},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000})),{openFault:mode==='open',closeFault:mode==='prepare-close'});assert.equal(x.spawns,0);const e=x.result.error;assert.equal(e.executionClosed,true);assert.equal(e.processResult.processState,'not-started');assert.match(e.processResult.error,/SYNTHETIC|no longer valid/);if(mode==='prepare-close')assert.match(e.processResult.error,/log-close/);assert.equal(e.submissionFacts.logs.length,mode==='open'?0:1);return {mode,spawns:0};
});

for(const mode of ['cleanup','save-once'])await test('begin-failure-'+mode,'Begin persistence or cleanup failure never starts a child or creates a second run',async()=>{
 const f=await fixture('begin-'+mode,{two:false});await approve(f);const state=path.join(f.directory,'state.json');let hit=false,spawns=0;
 const r=await patchMethod(childProcess,'spawn',before=>(...a)=>{spawns++;return before(...a);},()=>mode==='cleanup'?patchMethod(fs,'rmdir',before=>async function(file,...a){if(key(file)===key(path.join(f.directory,'.writer-lock'))){hit=true;throw new Error('SYNTHETIC begin cleanup');}return before.call(this,file,...a);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))):patchMethod(fs,'rename',before=>async function(from,to,...a){if(!hit&&key(to)===key(state)){const s=await readJson(from);if(s.events.some(e=>e.type==='begin')){hit=true;throw new Error('SYNTHETIC first state save');}}return before.call(this,from,to,...a);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))));
 assert.equal(hit,true);assert.equal(spawns,0);const e=r.error;assert.ok(e.runId);assert.equal(e.processResult.processState,'not-started');const s=await readJson(state);assert.equal(s.events.filter(e=>e.type==='begin').length,1);if(mode==='cleanup'){assert.equal(e.executionClosed,false);assert.ok(e.closureError);assert.equal(s.tasks.a.runId,e.runId);await fs.stat(path.join(f.directory,'.writer-lock'));}else assert.equal(e.executionClosed,true);return {mode,spawns,runId:e.runId,executionClosed:e.executionClosed};
});

await test('submit-persistence-recovery','A closed helper is not reexecuted after final publication/state failure',async()=>{
 const f=await fixture('submit-save',{two:false});await approve(f);let blocked=0,spawns=0;
 const r=await patchMethod(childProcess,'spawn',before=>(...a)=>{spawns++;return before(...a);},()=>patchMethod(fs,'rename',before=>async function(from,to,...a){if(key(to)===key(path.join(f.directory,'state.json'))){const s=await readJson(from);if(s.events.some(e=>e.type==='execution_receipt')){blocked++;throw new Error('SYNTHETIC state publication failure');}}return before.call(this,from,to,...a);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))));
 const e=r.error,facts=leafFactsFor(f);assert.match(e.message,/state publication failure/);assert.equal(spawns,1);assert.equal(blocked,2);assert.equal(facts.process.processState,'closed');assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,facts.runId);const file=path.join(f.directory,'receipt-'+facts.runId+'.json'),hash=await digest(file);assert.equal('closureError'in facts,false);const a=await submitFacts(f.project,f.id,'a',facts);assert.equal(a.executionClosed,true);await submitFacts(f.project,f.id,'a',facts);assert.equal(await digest(file),hash);assert.equal(closedCount(await engine.status(f.project,f.id)),1);return {spawns,blocked,idempotent:true};
});

for(const fault of ['identity','review','facts','hash','partial'])await test('observed-receipt-conflict-'+fault,'Published current final cannot bypass complete identity, facts or digest',async()=>{const f=await fixture('observed-'+fault,{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),value=payload(f,run),final=path.join(f.directory,'receipt-'+run.runId+'.json');await publishWithoutState(f,run,value);const raw=await fs.readFile(final),record=JSON.parse(raw);if(fault==='identity')record.runId=randomUUID();if(fault==='review')record.reviewDigest='0'.repeat(64);if(fault==='facts')record.reference='CHANGED';if(fault==='partial')delete record.executionBinding;if(fault==='hash'){const stateFile=path.join(f.directory,'state.json'),state=await readJson(stateFile);state.tasks.a.receipt={path:final,sha256:hash(raw)};await writeJson(stateFile,state);await fs.appendFile(final,' ');}else await writeJson(final,record);const before=await digest(final);await assert.rejects(submitFacts(f.project,f.id,'a',value));assert.equal(await digest(final),before);assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,run.runId);return{fault,finalPreserved:true};});

await test('binding-replay-complete-begin','Complete original begin preserves replay after task cache replacement',async()=>{const f=await fixture('binding-replay',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),value=payload(f,run,{result:'failed'});const first=await submitFacts(f.project,f.id,'a',value),s=await readJson(path.join(f.directory,'state.json'));s.tasks.a={status:'todo'};delete s.activeExecutions;await writeJson(path.join(f.directory,'state.json'),s);assert.equal((await submitFacts(f.project,f.id,'a',value)).replayed,true);assert.equal(await digest(first.receipt.path),first.receipt.sha256);return{completeEventsBound:true};});

for(const finalKind of ['none','same','different'])await test('binding-final-'+finalKind,'Complete original binding and full final have explicit replay/conflict behavior',async()=>{const f=await fixture('binding-final-'+finalKind,{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),value=payload(f,run);if(finalKind!=='none'){await publishWithoutState(f,run,value);if(finalKind==='different'){const final=path.join(f.directory,'receipt-'+run.runId+'.json'),record=await readJson(final);record.reviewDigest='0'.repeat(64);await writeJson(final,record);const before=await digest(final);await assert.rejects(submitFacts(f.project,f.id,'a',value));assert.equal(await digest(final),before);return{conflict:true};}}const ended=await submitFacts(f.project,f.id,'a',value);assert.equal(ended.acceptedForVerification,true);assert.equal(ended.replayed,finalKind==='same');return{finalKind};});

for(const completed of [true,false])for(const cleanupFails of [true,false])for(const valueKind of ['object','undefined','null','false'])await test('lock-matrix-'+completed+'-'+cleanupFails+'-'+valueKind,'Lock outcome matrix retains result/error identity and attempts cleanup once',async()=>{
 const {locked,formatRuntimeError}=await import('../lib/files.mjs');const value=valueKind==='object'?{rollbackManifest:'C:/SYNTHETIC/rollback.json'}:valueKind==='null'?null:valueKind==='false'?false:undefined;const original=valueKind==='object'?new Error('SYNTHETIC operation failure'):value;const cleanup=new Error('SYNTHETIC cleanup');let actions=0,cleans=0;
 const r=await patchMethod(fs,'mkdir',()=>async()=>{},()=>patchMethod(fs,'rmdir',()=>async()=>{cleans++;if(cleanupFails)throw cleanup;},()=>captureOutcome(locked(path.join(root,'memory-only'),async()=>{actions++;if(!completed)throw original;return value;}))));assert.equal(actions,1);assert.equal(cleans,1);if(!cleanupFails){assert.equal(r.ok,completed);assert.equal(completed?r.value:r.error,completed?value:original);}else {assert.equal(r.ok,false);assert.equal(r.error.code,'LOCK_CLEANUP_FAILED');assert.equal(r.error.actionStatus,completed?'completed':'failed');assert.equal(r.error.cleanupError,cleanup);assert.equal(completed?r.error.completedResult:r.error.actionError,completed?value:original);assert.match(formatRuntimeError(r.error),/cleanup/);}return {completed,cleanupFails,valueKind};
});

for(const code of ['EEXIST','EACCES'])await test('lock-acquire-'+code,'Failed lock acquisition never acts or removes someone else\'s lock',async()=>{
 const {locked}=await import('../lib/files.mjs');let actions=0,cleans=0;await patchMethod(fs,'mkdir',()=>async()=>{throw Object.assign(new Error('SYNTHETIC acquire'),{code});},()=>patchMethod(fs,'rmdir',()=>async()=>{cleans++;},()=>assert.rejects(locked(path.join(root,'other-owner'),async()=>{actions++;}))));assert.equal(actions,0);assert.equal(cleans,0);return {code};
});

await test('lock-real-and-format','Real lock success and cyclic completed result remain observable',async()=>{
 const {locked,formatRuntimeError}=await import('../lib/files.mjs');const dir=path.join(root,'real-lock');await fs.mkdir(dir);const value={status:'completed'};assert.equal(await locked(dir,async()=>{await fs.writeFile(path.join(dir,'result.txt'),'SYNTHETIC');return value;}),value);await assert.rejects(fs.stat(path.join(dir,'.writer-lock')),{code:'ENOENT'});value.circular=value;const r=await patchMethod(fs,'rmdir',before=>async function(p,...a){if(key(p)===key(path.join(dir,'.writer-lock')))throw new Error('SYNTHETIC cleanup');return before.call(this,p,...a);},()=>captureOutcome(locked(dir,async()=>value)));const text=formatRuntimeError(r.error);assert.match(text,/completed/);assert.match(text,/Circular/);assert.equal(r.error.completedResult,value);await fs.stat(path.join(dir,'.writer-lock'));return {realSuccess:true,cyclicResultVisible:true};
});

for(const mode of ['null','undefined','type','close'])await test('process-prepare-'+mode,'Preparation failures close the opened log, never spawn and retain original values',async()=>{
 const log=path.join(root,'prepare-'+mode+'.log');let spawns=0,closes=0;const original=mode==='null'?null:mode==='undefined'?undefined:new Error('SYNTHETIC prepare failure');
 const r=await patchMethod(childProcess,'spawn',before=>(...a)=>{spawns++;return before(...a);},()=>patchMethod(fs,'open',before=>async function(p,...a){const h=await before.call(this,p,...a);if(key(p)!==key(log))return h;return wrapHandle(h,{close:async()=>{closes++;await h.close();if(mode==='close')throw new Error('SYNTHETIC close failure');}});},()=>captureOutcome(runProcess(process.execPath,[helper],{cwd:root,log,prepareInput:async()=>{if(mode==='type')return 42;throw original;}}))));
 assert.equal(spawns,0);assert.equal(closes,1);assert.equal(r.error.processResult.processState,'not-started');if(mode!=='type')assert.equal(r.error.cause,original);if(mode==='close')assert.match(r.error.message,/close failure/);return {mode,spawns,closes};
});

for(const mode of ['case','junction'])await test('launch-canonical-master-'+mode,'Allowed same-file master paths support a normal documents run',async()=>{
 const f=await fixture('canonical-'+mode,{two:false});if(mode==='case'){const original=path.join(f.project,'harness'),temp=path.join(f.project,'rename-bridge');await fs.rename(original,temp);await fs.rename(temp,path.join(f.project,'Harness'));}
 else{await fs.rename(path.join(f.project,'harness'),path.join(f.project,'packages'));await fs.symlink(path.join(f.project,'packages'),path.join(f.project,'harness'),'junction');}
 f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);const r=await runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000});assert.equal(r.phase,'pending_acceptance');await emit(f,'a');assert.equal((await verifyFacts(f.project,f.id,'a')).taskStatus,'verified');return {mode,canonicalSameFile:true};
});

for(const cleanupAlsoFails of [false,true])await test('publication-persist-cleanup-'+cleanupAlsoFails,'Publication, state-save and outer cleanup faults preserve all errors and actual final',async()=>{
 const {formatRuntimeError}=await import('../lib/files.mjs');const f=await fixture('publish-persist-'+cleanupAlsoFails,{two:false});await approve(f);const started=await engine.begin(f.project,f.id,'a'),value=payload(f,started),final=path.join(f.directory,'receipt-'+started.runId+'.json');let published=false,saves=0;
 const r=await patchMethod(fs,'unlink',before=>async function(p,...a){if(String(p).startsWith(final+'.')){published=true;throw new Error('SYNTHETIC temporary cleanup after publication');}return before.call(this,p,...a);},()=>patchMethod(fs,'rename',before=>async function(from,to,...a){if(key(to)===key(path.join(f.directory,'state.json'))){saves++;throw new Error('SYNTHETIC state persistence');}return before.call(this,from,to,...a);},()=>patchMethod(fs,'rmdir',before=>async function(p,...a){if(cleanupAlsoFails&&key(p)===key(path.join(f.directory,'.writer-lock')))throw new Error('SYNTHETIC outer cleanup');return before.call(this,p,...a);},()=>captureOutcome(submitFacts(f.project,f.id,'a',value)))));
 assert.equal(published,true);assert.equal(saves,1);const text=formatRuntimeError(r.error);assert.match(text,/Receipt published: true/);assert.match(text,/state persistence/);if(cleanupAlsoFails)assert.match(text,/outer cleanup/);JSON.parse(await fs.readFile(final,'utf8'));const hash=await digest(final);assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,started.runId);if(!cleanupAlsoFails){await submitFacts(f.project,f.id,'a',value);assert.equal(closedCount(await engine.status(f.project,f.id)),1);assert.equal(await digest(final),hash);}return {published,saves,cleanupAlsoFails};
});

for(const fault of ['none','open','backup','manifest','write','truncate'])await test('install-cleanup-'+fault,'Isolated installation plus outer cleanup retains actual writes and recovery data',async()=>{
 const {formatRuntimeError}=await import('../lib/files.mjs');const f=await installFixture('cleanup-'+fault),plan=await previewInstall(f.options),before=await fs.readFile(f.agents);let injected=fault==='none';
 const r=await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC lock cleanup');return old.call(this,p,...a);},()=>patchMethod(fs,'writeFile',old=>async function(p,...a){if((fault==='backup'&&String(p).endsWith('0.bin'))||(fault==='manifest'&&String(p).includes('rollback.json.')&&String(p).endsWith('.tmp'))){injected=true;throw new Error('SYNTHETIC '+fault+' primary');}return old.call(this,p,...a);},()=>patchMethod(fs,'open',old=>async function(p,...a){if(key(p)===key(f.agents)&&fault==='open'){injected=true;throw new Error('SYNTHETIC open primary');}const h=await old.call(this,p,...a);if(key(p)!==key(f.agents))return h;return wrapHandle(h,{writeFile:async(...x)=>{if(fault==='write'){injected=true;await h.writeFile('PART');throw new Error('SYNTHETIC write primary');}return h.writeFile(...x);},truncate:async(...x)=>{if(fault==='truncate'){injected=true;throw new Error('SYNTHETIC truncate primary');}return h.truncate(...x);}});},()=>captureOutcome(applyInstall(plan)))));
 assert.equal(injected,true);assert.equal(r.error.code,'LOCK_CLEANUP_FAILED');assert.equal(r.error.actionStatus,fault==='none'?'completed':'failed');const text=formatRuntimeError(r.error);assert.match(text,/lock cleanup/);await fs.stat(path.join(f.home,'.writer-lock'));
 if(fault==='none'){const done=r.error.completedResult;assert.equal(done.status,'installed');assert.equal((await readJson(done.rollbackManifest)).status,'installed');assert.ok(text.includes(done.rollbackManifest));for(const c of plan.changes)assert.equal(await digest(c.target),c.after);}else {assert.match(text,new RegExp('SYNTHETIC '+fault+' primary'));assert.match(text,/rollback.json/);await assert.rejects(fs.stat(path.join(f.target,'SKILL.md')),{code:'ENOENT'});if(!['write','truncate'].includes(fault))assert.deepEqual(await fs.readFile(f.agents),before);const recovery=r.error.actionError.recovery;assert.ok(recovery.backupDirectory);if(['write','truncate'].includes(fault)){const record=await readJson(recovery.manifest);assert.equal(record.status,'prepared');assert.deepEqual(await fs.readFile(record.changes[0].backup),before);}}
 return {fault,actionStatus:r.error.actionStatus};
});

for(const fault of ['none','preflight','restore','manifest'])await test('rollback-cleanup-'+fault,'Isolated rollback errors and success survive outer cleanup without unsafe retry',async()=>{
 const {formatRuntimeError}=await import('../lib/files.mjs');const f=await installFixture('rollback-cleanup-'+fault),original=await fs.readFile(f.agents),done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest);if(fault==='preflight')await fs.appendFile(record.changes.at(-1).target,'SYNTHETIC drift');const before=await fs.readFile(f.agents);let injected=['none','preflight'].includes(fault);
 const r=await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC rollback lock cleanup');return old.call(this,p,...a);},()=>patchMethod(fs,'open',old=>async function(p,...a){const h=await old.call(this,p,...a);if(fault!=='restore'||key(p)!==key(f.agents))return h;return wrapHandle(h,{writeFile:async()=>{injected=true;throw new Error('SYNTHETIC restore primary');}});},()=>patchMethod(fs,'writeFile',old=>async function(p,...a){if(fault==='manifest'&&String(p).startsWith(done.rollbackManifest+'.')&&JSON.parse(String(a[0])).status==='rolled-back'){injected=true;throw new Error('SYNTHETIC rollback manifest primary');}return old.call(this,p,...a);},()=>captureOutcome(rollbackInstall(done.rollbackManifest)))));
 assert.equal(injected,true);const e=r.error,text=formatRuntimeError(e);assert.equal(e.actionStatus,fault==='none'?'completed':'failed');assert.ok(text.includes(done.rollbackManifest));assert.match(text,/lock cleanup/);await fs.stat(path.join(f.home,'.writer-lock'));if(fault==='none'){assert.equal(e.completedResult.status,'rolled-back');assert.deepEqual(await fs.readFile(f.agents),original);assert.equal((await readJson(done.rollbackManifest)).status,'rolled-back');}else {assert.ok(e.actionError.recovery);assert.equal((await readJson(done.rollbackManifest)).status,fault==='preflight'?'installed':'rollback-prepared');if(fault==='restore')assert.equal((await readJson(done.rollbackManifest)).rollbackProgress.completedTargets,0);if(fault==='preflight')assert.deepEqual(await fs.readFile(f.agents),before);if(fault==='manifest')assert.deepEqual(await fs.readFile(f.agents),original);}return {fault,actionStatus:e.actionStatus};
});

for(const mode of ['install','install-failure','rollback'])await test('cli-cleanup-'+mode,'Real CLI stderr retains failed or completed operation and recovery manifest',async()=>{
 const f=await installFixture('cli-'+mode);let plan=await previewInstall(f.options),manifest;if(mode==='rollback')manifest=(await applyInstall(plan)).rollbackManifest;const input=path.join(f.dir,'input.json');await writeJson(input,plan);const hook=path.join(f.dir,'fault-hook.mjs');await fs.writeFile(hook,`import fs from 'node:fs/promises';\nimport path from 'node:path';\nconst key=p=>path.resolve(String(p)).toLowerCase();const old=fs.rmdir;fs.rmdir=async(p,...a)=>{if(key(p)===key(${JSON.stringify(path.join(f.home,'.writer-lock'))}))throw new Error('SYNTHETIC CLI cleanup');return old.call(fs,p,...a);};\n${mode==='install-failure'?`const open=fs.open;fs.open=async(p,...a)=>{if(key(p)===key(${JSON.stringify(f.agents)}))throw new Error('SYNTHETIC CLI primary');return open.call(fs,p,...a);};`:''}`);
 const r=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,cli,mode==='rollback'?'rollback':'install',mode==='rollback'?'--manifest':'--plan',manifest??input],{encoding:'utf8',timeout:300000,windowsHide:true,shell:false,cwd:root});assert.equal(r.status,1,r.stderr);assert.equal(r.error,undefined);assert.match(r.stderr,/SYNTHETIC CLI cleanup/);assert.match(r.stderr,/rollback.json/);assert.equal(r.stdout,'');if(mode==='install-failure'){assert.match(r.stderr,/SYNTHETIC CLI primary/);assert.match(r.stderr,/failed/);}else {assert.match(r.stderr,/completedResult/);assert.match(r.stderr,mode==='install'?/installed/:/rolled-back/);}return {mode,exit:r.status,recoveryVisible:true};
});

const artifactHelper=path.join(source,'scripts/tests/helpers/artifact-example.mjs');

async function artifactExample(artifactMode,variant='complete'){
 const f=await fixture('example-'+artifactMode+'-'+variant,{two:false});
 assert.ok(key(f.directory).startsWith(key(root)+path.sep));await fs.unlink(path.join(f.directory,'phases/a.md'));
 f.c.domain='software';f.c.revision++;await fs.writeFile(path.join(f.project,'raw.json'),'[1,2,3]\n');f.c.inputs=[{source:'SYNTHETIC fixed raw integers, not real research observations',path:'raw.json'}];
 const code=artifactMode==='members'?[{id:'prepare-code',path:'code/prepare.mjs'},{id:'analysis-code',path:'code/analyze.mjs'},{id:'analysis-config',path:'config/analysis.json'}]:[{id:'code-bundle',path:'packages/code.zip'}];
 f.c.deliverables=[...code,{id:'clean-data',path:'data/clean.csv'},{id:'analysis-result',path:'results/summary.json'}];
 const criterion=mode=>({id:mode,type:'command',description:'SYNTHETIC verify actual '+mode+' against independently fixed values and members',command:process.execPath,args:[artifactHelper,mode,f.project,artifactMode],timeoutMs:15000});
 f.c.tasks=[{id:'code',title:'Produce executable code and config before any consumption',dependsOn:[],outputs:code.map(x=>x.id),acceptance:[criterion('verify-code')]},{id:'data',title:'Consume verified code and create actual synthetic data',dependsOn:['code'],outputs:['clean-data'],acceptance:[criterion('verify-data')]},{id:'analysis',title:'Consume verified code and data and produce actual numerical result',dependsOn:['code','data'],outputs:['analysis-result'],acceptance:[criterion('verify-analysis')]}];
 f.c.contextFiles=f.c.tasks.map(t=>({path:'phases/'+t.id+'.md',kind:'phase',tasks:[t.id],purpose:t.title,loadWhen:'Only after context selects '+t.id}));await writeJson(path.join(f.directory,'contract.json'),f.c);
 const refs=command(['refs','--project',f.project,'--id',f.id]);assert.equal(refs.code,0,refs.stderr);const mapping=cliData(refs.stdout);
 for(const d of mapping.documents.filter(x=>x.path!=='HARNESS.md')){await fs.mkdir(path.dirname(d.file),{recursive:true});await fs.writeFile(d.file,`# SYNTHETIC ${d.path}\n\nResume master/recovery then context. Consume this phase only after selection.\n\nInput: ${d.inputs[0].absoluteMarkdown}\n\nMethod: code task creates actual modules/config ${artifactMode==='archive'?'inside a real code.zip with checked fixed members':'as individually declared member files'}; data consumes verified code; analysis consumes verified code and data.\n\nOutputs (planned artifacts): ${d.deliverables.map(x=>x.markdown).join(', ')}\n\nAcceptance: actual command checks member contents, data rows and sum=12; failure blocks dependencies and preserves evidence.\n\nRecovery: inspect original run and report; do not clear history.\n`);}
 const prepared=command(['prepare-review','--project',f.project,'--id',f.id]);assert.equal(prepared.code,0,prepared.stderr+' '+prepared.stdout);const p=cliData(prepared.stdout);assert.equal(p.pathCheck.ok,true);f.review=p.review;await approve(f);
 const run=(mode)=>{const r=spawnSync(process.execPath,[artifactHelper,mode,f.project,artifactMode,variant],{cwd:f.project,encoding:'utf8',timeout:15000,windowsHide:true,shell:false});assert.equal(r.status,0,r.stderr);return r;};
 let started=await engine.begin(f.project,f.id,'code');run('build-code');await submit(f,'code',started);
 if(variant==='missing'){await assert.rejects(verifyFacts(f.project,f.id,'code'),/exit/);await assert.rejects(engine.begin(f.project,f.id,'data'),/Dependencies/);return {f,missingRejected:true};}
 await verifyFacts(f.project,f.id,'code');for(const [step,mode]of [['data','prepare'],['analysis','analyze']]){started=await engine.begin(f.project,f.id,step);run(mode);await submit(f,step,started);await verifyFacts(f.project,f.id,step);}
 assert.equal((await engine.status(f.project,f.id)).phase,'verified');assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.project,'results/summary.json'),'utf8')),{sum:12});
 const file=path.join(f.project,artifactMode==='members'?'code/prepare.mjs':'packages/code.zip');await fs.appendFile(file,'\nSYNTHETIC changed version');const s=await engine.status(f.project,f.id);for(const step of ['code','data','analysis'])assert.equal(s.tasks[step].status,'stale');return {f,sum:12,downstreamInvalidated:true};
}

for(const artifactMode of ['members','archive'])await test('artifact-example-'+artifactMode,'Documented actual file/real-archive example completes the full producer-consumer lifecycle',async()=>{const r=await artifactExample(artifactMode);return {artifactMode,sum:r.sum,downstreamInvalidated:r.downstreamInvalidated};});

await test('artifact-archive-missing-member','A real archive with missing executable member fails acceptance and blocks downstream',async()=>{const r=await artifactExample('archive','missing');assert.equal(r.missingRejected,true);return {missingRejected:true};});

for(const stage of ['existing','generated'])await test('artifact-directory-'+stage,'Directories remain unsupported deliverables with an explicit failed lifecycle',async()=>{
 const f=await fixture('directory-'+stage,{two:false});f.c.revision++;f.c.deliverables[0].path='data-package';await writeJson(path.join(f.directory,'contract.json'),f.c);await fs.writeFile(path.join(f.directory,'phases/a.md'),'# Synthetic directory output\n\nInput [input](../../../input.txt). Method: produce [output](../../../data-package). Acceptance: reject a directory as deliverable. Failure: retain facts.');await renderFixture(f);
 await fs.writeFile(path.join(f.directory,'RECOVERY.md'),(await fs.readFile(path.join(f.directory,'RECOVERY.md'),'utf8')).replaceAll('../../out/a.txt','../../data-package'));if(stage==='existing'){await fs.mkdir(path.join(f.project,'data-package'));await assert.rejects(prepareCurrentReview(f.project,f.id),/Output must name a file/);}else {f.review=await prepareCurrentReview(f.project,f.id);await approve(f);const r=await engine.begin(f.project,f.id,'a');await fs.mkdir(path.join(f.project,'data-package'));const ended=await submit(f,'a',r);assert.equal(ended.acceptedForVerification,false);assert.equal(ended.phase,'stale');await assert.rejects(verifyFacts(f.project,f.id,'a'),/approved|pending acceptance/);}return {stage,directoryRejected:true};
});

for(const mode of ['unknown-binding','binding-conflict'])await test('launch-binding-'+mode,'Final gate refuses unbound/conflicting originals without creating approval',async()=>{
 const f=await fixture('launch-'+mode,{two:false});await approve(f);const x=await withLaunchBoundary(f,async()=>{const p=path.join(f.directory,'state.json'),s=await readJson(p);if(mode==='unknown-binding'){delete s.events.find(e=>e.type==='begin').reviewDigest;delete s.tasks.a.reviewDigest;}else s.tasks.a.reviewDigest='0'.repeat(64);await writeJson(p,s);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000})));assert.equal(x.spawns,0);assert.equal(x.result.error.processResult.processState,'not-started');assert.equal(x.result.error.executionClosed,false);const file=path.join(f.directory,'state.json'),bytes=await fs.readFile(file);await assert.rejects(engine.status(f.project,f.id));assert.deepEqual(await fs.readFile(file),bytes);return {mode,spawns:0};
});

for(const unreadable of [false,true])await test('begin-save-unconfirmed-'+unreadable,'Uncommitted/unknown begin persistence exposes its own candidate without spawn or fabricated closure',async()=>{
 const f=await fixture('begin-unconfirmed-'+unreadable,{two:false});await approve(f);let failed=false,spawns=0;const state=path.join(f.directory,'state.json');const before=await fs.readFile(state);
 const r=await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>patchMethod(fs,'rename',old=>async function(from,to,...a){if(key(to)===key(state)){failed=true;throw new Error('SYNTHETIC begin persistence');}return old.call(this,from,to,...a);},()=>patchMethod(fs,'readFile',old=>async function(p,...a){if(unreadable&&failed&&key(p)===key(state))throw new Error('SYNTHETIC unreadable state');return old.call(this,p,...a);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000})))));
 assert.equal(spawns,0);assert.ok(r.error.runId);assert.equal(r.error.processResult.processState,'not-started');assert.equal(r.error.beginPersisted,unreadable?'unknown':false);assert.equal(r.error.executionClosed,false);assert.deepEqual(await fs.readFile(state),before);assert.equal((await fs.readdir(f.directory)).some(n=>n.startsWith('receipt-')),false);return {unreadable,spawns,beginPersisted:r.error.beginPersisted};
});

await test('engine-active-until-close','Control errors do not close engine.run or release its original active identity before actual close',async()=>{
 const f=await fixture('engine-active',{two:false});await approve(f);await fakeProcess('kill-error',async controls=>{let settled=false;const p=runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:40}).finally(()=>{settled=true;});await controls.wait();await pause(70);assert.equal(settled,false);assert.equal(controls.state().alive,true);const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,1);assert.equal(closedCount(st),0);controls.close(7);const r=await bounded(p);assert.equal(r.phase,'failed');assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,0);assert.deepEqual(controls.state().unhandled,[]);});return {observedUntilClose:true};
});

await test('submit-complete-lock-failure','State committed before cleanup failure remains factually closed, never reexecutes',async()=>{
 const f=await fixture('submit-completed-lock',{two:false});await approve(f);let hit=false,spawns=0;const r=await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.directory,'.writer-lock'))){const s=await readJson(path.join(f.directory,'state.json'));if(s.events.some(e=>e.type==='execution_receipt')){hit=true;throw new Error('SYNTHETIC cleanup after committed closure');}}return old.call(this,p,...a);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))));assert.equal(hit,true);assert.equal(spawns,1);assert.equal(r.error.actionStatus,'completed');assert.equal(r.error.completedResult.executionClosed,true);const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,0);assert.equal(closedCount(st),1);assert.equal(st.tasks.a.status,'pending_acceptance');await fs.stat(path.join(f.directory,'.writer-lock'));return {spawns,executionClosed:true};
});

await test('caller-review-cannot-rebind','Caller review facts cannot replace original current begin',async()=>{const f=await fixture('caller-review',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),file=path.join(f.directory,'state.json'),before=await digest(file);await assert.rejects(submitFacts(f.project,f.id,'a',envelope('submission',{...payload(f,run),reviewDigest:'0'.repeat(64)})));assert.equal(await digest(file),before);assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,run.runId);return{originalPreserved:true};});

await test('launch-concurrent-revocation','A committed runtime revocation cannot be hidden by a stale final state read',async()=>{
 const f=await fixture('concurrent-revoke',{two:false});await approve(f);const file=path.join(f.directory,'state.json');let reads=0,hit=false,committed=false,rejectError,spawns=0;
 const r=await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>patchMethod(fs,'readFile',old=>async function(p,...a){const v=await old.call(this,p,...a);if(key(p)===key(file)&&++reads===3&&!hit){hit=true;try{await decisionFacts(f.project,f.id,{actor:'user',decision:'reject',taskId:f.id,revision:f.c.revision,digest:f.review.digest,message:'SYNTHETIC concurrent revoke',source:'SYNTHETIC state race'});committed=true;}catch(e){rejectError=e;}}return v;},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))));
 assert.equal(hit,true);assert.ok(!committed||spawns===0,'Revocation committed during final gate, yet stale approval launched execution');if(!committed){assert.match(rejectError.message,/writer|holds/i);assert.equal(spawns,1);assert.equal(r.value.phase,'pending_acceptance');}return {committed,spawns,concurrentMutationSerialized:!committed};
});

for(const stage of ['prepared','installed'])await test('install-manifest-target-'+stage,'Both manifest publication windows report the actual failing target and real writes',async()=>{
 const f=await installFixture('manifest-'+stage),plan=await previewInstall(f.options),original=await fs.readFile(f.agents);let manifest,hit=false;
 const r=await patchMethod(fs,'writeFile',old=>async function(p,data,...a){if(String(p).includes('rollback.json.')&&String(p).endsWith('.tmp')&&JSON.parse(String(data)).status===stage){hit=true;manifest=String(p).slice(0,String(p).indexOf('rollback.json.')+'rollback.json'.length);throw new Error('SYNTHETIC '+stage+' manifest');}return old.call(this,p,data,...a);},()=>captureOutcome(applyInstall(plan)));
 assert.equal(hit,true);assert.equal(r.error.recovery.failedTarget,manifest);assert.equal(r.error.recovery.manifest,manifest);if(stage==='prepared'){assert.deepEqual(await fs.readFile(f.agents),original);await assert.rejects(fs.stat(manifest),{code:'ENOENT'});}else {assert.equal((await readJson(manifest)).status,'prepared');for(const c of plan.changes)assert.equal(await digest(c.target),c.after);assert.deepEqual(await fs.readFile((await readJson(manifest)).changes[0].backup),original);}return {stage,actualTarget:manifest};
});

await test('rollback-partial-prefix','Mid-rollback I/O failure retains restored prefix, unchanged suffix and both errors',async()=>{
 const f=await installFixture('rollback-prefix',{copy:true});const first=path.join(f.target,'LICENSE'),second=path.join(f.target,'SKILL.md');await fs.writeFile(first,'SYNTHETIC older license');await fs.writeFile(second,'SYNTHETIC older skill');await fs.writeFile(path.join(f.target,'agents/openai.yaml'),'SYNTHETIC older UI');const done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest);assert.ok(record.changes.length>=4);const failure=record.changes[2],before=await Promise.all(record.changes.map(c=>fs.readFile(c.target)));let hit=false;
 const r=await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC partial rollback cleanup');return old.call(this,p,...a);},()=>patchMethod(fs,'open',old=>async function(p,...a){const h=await old.call(this,p,...a);if(key(p)!==key(failure.target))return h;return wrapHandle(h,{writeFile:async()=>{hit=true;throw new Error('SYNTHETIC middle restore');}});},()=>captureOutcome(rollbackInstall(done.rollbackManifest))));assert.equal(hit,true);assert.match(r.error.message,/middle restore/);assert.match(r.error.message,/partial rollback cleanup/);assert.equal(r.error.actionError.recovery.failedTarget,failure.target);for(let i=0;i<record.changes.length;i++){const c=record.changes[i];assert.deepEqual(await fs.readFile(c.target),i<2?await fs.readFile(c.backup):before[i]);}assert.equal((await readJson(done.rollbackManifest)).status,'rollback-prepared');return {restoredPrefix:2,unchangedSuffix:record.changes.length-2};
});

await test('launch-lock-release-after-spawn','A launch-lock release failure waits for actual close and preserves blocked factual closure',async()=>{
 const f=await fixture('launch-release',{two:false});await approve(f);let releases=0,spawns=0;const r=await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.directory,'.writer-lock'))&&++releases===2)throw new Error('SYNTHETIC launch lock release');return old.call(this,p,...a);},()=>captureOutcome(runLeafFixture(f.project,f.id,'a',{executable:helper,timeoutMs:4000}))));assert.equal(spawns,1);assert.equal(r.error.processResult.processState,'closed');assert.match(r.error.processResult.error,/launch lock release/);assert.equal(r.error.executionClosed,false);assert.ok(r.error.observationError);const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions[0].runId,r.error.runId);assert.equal(closedCount(st),0);await fs.stat(path.join(f.directory,'.writer-lock'));return {spawns,actualClosed:true,closureBlocked:true};
});

await test('install-handle-and-lock-errors','Partial write, handle-close and writer-lock failures all preserve their original errors',async()=>{
 const f=await installFixture('handle-errors'),plan=await previewInstall(f.options);const primary=new Error('SYNTHETIC primary partial write'),handleClose=new Error('SYNTHETIC secondary handle close');
 const r=await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC tertiary lock cleanup');return old.call(this,p,...a);},()=>patchMethod(fs,'open',old=>async function(p,...a){const h=await old.call(this,p,...a);if(key(p)!==key(f.agents))return h;return wrapHandle(h,{writeFile:async()=>{await h.writeFile('PART');throw primary;},close:async()=>{await h.close();throw handleClose;}});},()=>captureOutcome(applyInstall(plan))));assert.match(r.error.message,/primary partial write/);assert.match(r.error.message,/secondary handle close/);assert.match(r.error.message,/tertiary lock cleanup/);assert.equal(r.error.actionError.cause.operationError,primary);assert.equal(r.error.actionError.cause.cleanupError,handleClose);await assert.rejects(fs.stat(path.join(f.target,'SKILL.md')),{code:'ENOENT'});return {threeErrorsRetained:true,laterWritesStopped:true};
});

async function acceptanceGateFixture(name,{documents=true,kind='command',upstream=false,barrier=false}={}){
 const commandCriterion={id:'command',type:'command',description:'SYNTHETIC observable acceptance command',command:process.execPath,args:barrier?[]:['-e',"require('node:fs').writeFileSync('command-ran.txt','SYNTHETIC');console.log('SYNTHETIC checked')"]};
 const artifact={id:'artifact',type:'artifact',description:'SYNTHETIC output exists'},review={id:'review',type:'review',requiredFiles:[],description:'SYNTHETIC evidence review'};
 const acceptance=kind==='mixed'?[artifact,review,commandCriterion]:[kind==='artifact'?artifact:kind==='review'?review:commandCriterion];
 const f=await fixture(''+name,{documents,acceptance});f.c.tasks[1].dependsOn=upstream?['c']:[];
 if(upstream){f.c.deliverables.push({id:'out-c',path:'out/c.txt'});f.c.tasks.push({id:'c',title:'SYNTHETIC upstream C',dependsOn:[],outputs:['out-c'],acceptance:[{id:'c-exists',type:'artifact',description:'SYNTHETIC C exists'}]});if(documents)f.c.contextFiles.push({path:'phases/c.md',kind:'phase',tasks:['c'],purpose:'SYNTHETIC upstream',loadWhen:'After context selects C'});}
 f.ready=path.join(f.project,'ready.json');f.release=path.join(f.project,'release.txt');
 if(barrier)commandCriterion.args=[helper,'barrier',f.ready,f.release];
 f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);
 if(upstream&&documents){const r=command(['refs','--project',f.project,'--id',f.id]);assert.equal(r.code,0,r.stderr);const doc=cliData(r.stdout).documents.find(d=>d.path==='phases/c.md');await fs.writeFile(doc.file,`# SYNTHETIC C\n\nResume with master/recovery then context. Input: ${doc.inputs[0].absoluteMarkdown}\n\nMethod: produce deterministic C. Output: ${doc.deliverables.find(d=>d.id==='out-c').markdown}\n\nAcceptance: check C. Failure: retain evidence. Handoff: only verified C.\n`);}
 await renderFixture(f);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);
 if(upstream)await finish(f,'c');
 f.a=await engine.begin(f.project,f.id,'a');const out=await emit(f,'a');await submit(f,'a',f.a);
 // Establish a real prior failure; the new gate must append without erasing it.
 const saved=out+'.saved';await fs.rename(out,saved);try{await assert.rejects(verifyFacts(f.project,f.id,'a'));}finally{await fs.rename(saved,out);}
 f.before=await engine.status(f.project,f.id);f.receiptBytes=await fs.readFile(f.before.tasks.a.receipt.path);
 f.reviews=await currentReviews(f);
 return f;
}

async function assertAcceptanceBlocked(f,{checkRecord=true}={}){
 const before=await engine.status(f.project,f.id);let spawns=0,receiptReads=0;
 const r=await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>patchMethod(fs,'readFile',old=>async function(p,...a){if(key(p)===key(before.tasks.a.receipt.path))receiptReads++;return old.call(this,p,...a);},()=>captureOutcome(verifyFacts(f.project,f.id,'a',f.reviews))));
 assert.ok(r.error,'Active execution did not block verification');assert.equal(r.error.code,'HARNESS_ACTIVE_EXECUTION');assert.equal(spawns,0);assert.equal(receiptReads,0);const after=await engine.status(f.project,f.id);
 assert.equal(after.tasks.a.status,before.tasks.a.status);assert.equal(after.tasks.a.runId,f.a.runId);assert.deepEqual(await fs.readFile(after.tasks.a.receipt.path),f.receiptBytes);assert.deepEqual(after.activeExecutions,before.activeExecutions);assert.deepEqual(after.executionBlockers,before.executionBlockers);
 assert.deepEqual(after.tasks.a.acceptanceAttempts.slice(0,-1),before.tasks.a.acceptanceAttempts);
 if(checkRecord){const last=after.tasks.a.lastAcceptance;assert.equal(last.status,'failed');assert.equal(last.criterion,'execution-guard');for(const field of ['log','exitCode','processResult'])assert.equal(last[field],null);assert.deepEqual(last.checks,[]);assert.deepEqual(last.evidence,[]);assert.match(last.next,/original|submit|close/i);}
 return {spawns,blocked:true,runId:before.activeExecutions[0]?.runId??null};
}

for(const documents of [true])for(const kind of ['artifact','review','command','mixed'])await test(`gate-${documents}-${kind}`,'Cross-entry active execution blocks every acceptance type and original runs recover',async()=>{
 const f=await acceptanceGateFixture(`gate-${documents}-${kind}`,{documents,kind});const b=await engine.begin(f.project,f.id,'b');await emit(f,'b');const observed=await assertAcceptanceBlocked(f);await submit(f,'b',b);await verifyFacts(f.project,f.id,'a',await currentReviews(f));await verifyFacts(f.project,f.id,'b');const end=await engine.status(f.project,f.id);assert.equal(end.phase,'verified');assert.deepEqual(end.tasks.a.acceptanceAttempts.slice(0,f.before.tasks.a.acceptanceAttempts.length),f.before.tasks.a.acceptanceAttempts);return observed;
});

for(const documents of [true])await test('stale-active-'+documents,'Stale execution retains identity until factual closure and does not regain eligibility',async()=>{
 const f=await acceptanceGateFixture('stale-'+documents,{documents,upstream:true});const b=await engine.begin(f.project,f.id,'b');await emit(f,'b');await emit(f,'c','SYNTHETIC changed upstream');const st=await engine.status(f.project,f.id);assert.equal(st.tasks.b.status,'stale');assert.equal(st.tasks.a.status,'pending_acceptance');await assertAcceptanceBlocked(f);const closed=await submit(f,'b',b);assert.equal(closed.acceptedForVerification,false);await verifyFacts(f.project,f.id,'a',f.reviews);await finish(f,'c');await finish(f,'b');assert.equal((await engine.status(f.project,f.id)).phase,'verified');return {originalStaleClosure:true};
});

for(const mode of ['complete-begins','missing-id'])await test('ambiguous-current-'+mode,'Complete active identities block acceptance; unidentifiable current activity refuses before lock',async()=>{const f=await acceptanceGateFixture('ambiguous-current-'+mode),file=path.join(f.directory,'state.json'),state=await readJson(file);if(mode==='complete-begins'){const original=state.events.find(e=>e.type==='begin');for(let i=0;i<2;i++)state.events.push({...original,step:'b',runId:randomUUID()});state.tasks.b={status:'todo'};delete state.activeExecutions;await writeJson(file,state);assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,2);return assertAcceptanceBlocked(f);}state.tasks.b={status:'executing',startedAt:new Date().toISOString()};await writeJson(file,state);const before=await fs.readFile(file);let mkdirs=0,spawns=0;await patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},()=>patchMethod(childProcess,'spawn',old=>(...args)=>{spawns++;return old(...args);},()=>assert.rejects(verifyFacts(f.project,f.id,'a',envelope('reviews',{records:f.reviews})),/complete active original begin/)));assert.equal(mkdirs,0);assert.equal(spawns,0);assert.deepEqual(await fs.readFile(file),before);return{unknownCurrentActivityPreserved:true,mkdirs,spawns};});

for(const documents of [true])await test('own-active-'+documents,'An executing original run cannot verify itself and still closes through its original submission',async()=>{
 const f=await fixture('own-active-'+documents,{documents,two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');const r=await captureOutcome(verifyFacts(f.project,f.id,'a'));assert.equal(r.error.code,'HARNESS_ACTIVE_EXECUTION');const st=await engine.status(f.project,f.id);assert.equal(st.tasks.a.status,'executing');assert.equal(st.activeExecutions[0].runId,run.runId);assert.equal(st.tasks.a.lastAcceptance.criterion,'execution-guard');await emit(f,'a');await submit(f,'a',run);await verifyFacts(f.project,f.id,'a');assert.equal((await engine.status(f.project,f.id)).phase,'verified');return {originalRunPreserved:true};
});

for(const documents of [true])for(const method of ['native','run'])await test(`real-lifecycle-${documents}-${method}`,'Real child close, original submit and subsequent acceptance preserve the complete lifecycle',async()=>{
 const f=await acceptanceGateFixture(`real-${documents}-${method}`,{documents});const ready=path.join(f.project,'b-ready.json'),release=path.join(f.project,'b-release.txt');let observed,b,processResult;
 if(method==='native'){b=await engine.begin(f.project,f.id,'b');observed=captureOutcome(runProcess(process.execPath,[helper,'barrier',ready,release],{cwd:f.project,log:path.join(f.project,'b-real.log'),timeoutMs:10000}));}
 else{const adapter=path.join(f.project,'synthetic-codex.mjs');await fs.writeFile(adapter,`import {pathToFileURL} from 'node:url';process.argv=[process.argv[0],${JSON.stringify(helper)},'barrier',${JSON.stringify(ready)},${JSON.stringify(release)}];await import(pathToFileURL(${JSON.stringify(helper)}).href);`);observed=captureOutcome(runLeafFixture(f.project,f.id,'b',{executable:adapter,timeoutMs:10000}));}
 try{await waitForReady(async()=>{try{await fs.access(ready);await assert.rejects(fs.stat(path.join(f.directory,'.writer-lock')),{code:'ENOENT'});return true;}catch{return false;}});const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,1);await emit(f,'b');await assertAcceptanceBlocked(f);}
 finally{await fs.writeFile(release,'SYNTHETIC release');processResult=await bounded(observed,12000);}
 assert.ifError(processResult.error);
 if(method==='native'){assert.equal(processResult.value.processState,'closed');assert.equal(processResult.value.exitCode,0);await assertAcceptanceBlocked(f);await submit(f,'b',b,'ok',{process:processResult.value});}
 else assert.equal(processResult.value.executionClosed,true);
 await verifyFacts(f.project,f.id,'a',f.reviews);await verifyFacts(f.project,f.id,'b');assert.equal((await engine.status(f.project,f.id)).phase,'verified');return {method,actualClose:true};
});

async function waitForReady(predicate,ms=10000){const until=Date.now()+ms;while(Date.now()<until){if(await predicate())return;await pause(10);}throw new Error('SYNTHETIC readiness handshake timed out');}

for(const documents of [true])await test('reverse-order-'+documents,'Acceptance holding the writer lock rejects begin and duplicate verify without releasing another owner',async()=>{
 const f=await acceptanceGateFixture('reverse-'+documents,{documents,barrier:true});const p=captureOutcome(verifyFacts(f.project,f.id,'a'));let result;
 try{await waitForReady(async()=>{try{await fs.access(f.ready);return true;}catch{return false;}});const before=await readJson(path.join(f.directory,'state.json'));const denied=await captureOutcome(engine.begin(f.project,f.id,'b'));assert.match(denied.error.message,/writer|holds/i);assert.equal(denied.error.beginCandidate,undefined);await assert.rejects(verifyFacts(f.project,f.id,'a'),/writer|holds/i);await fs.stat(path.join(f.directory,'.writer-lock'));assert.deepEqual(await readJson(path.join(f.directory,'state.json')),before);}
 finally{await fs.writeFile(f.release,'SYNTHETIC release');result=await bounded(p,12000);}
 assert.ifError(result.error);assert.equal(result.value.taskStatus,'verified');await finish(f,'b');assert.equal((await engine.status(f.project,f.id)).phase,'verified');return {actualAcceptanceClose:true,otherLockPreserved:true};
});

for(const documents of [true])for(const fault of ['report','state','lock','state-lock','report-state-lock'])await test(`guard-fault-${documents}-${fault}`,'Gate rejection retains original identity and actual report, persistence and cleanup failures',async()=>{
 const f=await acceptanceGateFixture(`fault-${documents}-${fault}`,{documents});const b=await engine.begin(f.project,f.id,'b'),stateFile=path.join(f.directory,'state.json');let reportHit=false,stateHit=false,lockHit=false,spawns=0;
 const r=await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>patchMethod(fs,'writeFile',old=>async function(p,...a){if(fault.includes('report')&&path.basename(String(p)).startsWith('acceptance-')){reportHit=true;throw new Error('SYNTHETIC report save');}return old.call(this,p,...a);},()=>patchMethod(fs,'rename',old=>async function(from,to,...a){if(fault.includes('state')&&key(to)===key(stateFile)){stateHit=true;throw new Error('SYNTHETIC state save');}return old.call(this,from,to,...a);},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(fault.includes('lock')&&key(p)===key(path.join(f.directory,'.writer-lock'))){lockHit=true;throw new Error('SYNTHETIC lock cleanup');}return old.call(this,p,...a);},()=>captureOutcome(verifyFacts(f.project,f.id,'a',f.reviews))))));
 assert.equal(spawns,0);let e=r.error;assert.ok(e);if(fault.includes('lock')){assert.equal(e.code,'LOCK_CLEANUP_FAILED');assert.match(e.cleanupError.message,/lock cleanup/);e=e.actionError;await fs.stat(path.join(f.directory,'.writer-lock'));}if(fault.includes('state')){assert.match(e.statePersistenceError.message,/state save/);e=e.actionError;}assert.equal(e.code,'HARNESS_ACTIVE_EXECUTION');assert.equal(reportHit,fault.includes('report'));assert.equal(stateHit,fault.includes('state'));assert.equal(lockHit,fault.includes('lock'));const after=await engine.status(f.project,f.id);assert.equal(after.activeExecutions[0].runId,b.runId);assert.equal(after.tasks.a.status,'pending_acceptance');assert.deepEqual(await fs.readFile(after.tasks.a.receipt.path),f.receiptBytes);
 if(fault.includes('report')){if(!fault.includes('state'))assert.match(after.tasks.a.lastAcceptance.reportError,/report save/);else assert.match(e.recovery.acceptanceReportError,/report save/);}
 return {fault,spawns,reportHit,stateHit,lockHit};
});

for(const mode of ['reject','input'])await test('approval-loss-'+mode,'Closure of an active run does not restore lost approval or permit acceptance',async()=>{
 const f=await acceptanceGateFixture('approval-'+mode);const b=await engine.begin(f.project,f.id,'b');await emit(f,'b');if(mode==='reject')await decisionFacts(f.project,f.id,{actor:'user',decision:'reject',taskId:f.id,revision:f.c.revision,digest:f.review.digest,message:'SYNTHETIC reject',source:'SYNTHETIC authorization change'});else await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift');await assertAcceptanceBlocked(f);const closed=await submit(f,'b',b);assert.equal(closed.acceptedForVerification,false);let spawns=0;await patchMethod(childProcess,'spawn',old=>(...a)=>{spawns++;return old(...a);},()=>assert.rejects(verifyFacts(f.project,f.id,'a',f.reviews)));assert.equal(spawns,0);assert.equal((await engine.status(f.project,f.id)).approval,null);return {mode,noReapproval:true};
});

for(const documents of [true])await test('cli-gate-'+documents,'Real CLI rejects cross-entry verification with original execution location and no success output',async()=>{
 const f=await acceptanceGateFixture('cli-gate-'+documents,{documents});const b=await engine.begin(f.project,f.id,'b');const r=command(['verify','--project',f.project,'--id',f.id,'--task','a']);assert.equal(r.code,1);assert.equal(r.error,undefined);assert.equal(r.stdout,'');assert.match(r.stderr,/HARNESS_ACTIVE_EXECUTION/);assert.ok(r.stderr.includes(b.runId));assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'pending_acceptance');return {exitCode:r.code};
});

async function installedFixture(name,{copy=false}={}){const f=await installFixture(''+name,{copy});const original=await fs.readFile(f.agents);const done=await applyInstall(await previewInstall(f.options));const record=await readJson(done.rollbackManifest);return {...f,original,done,record,manifestBefore:await fs.readFile(done.rollbackManifest)};}

async function assertRollbackRestored(f){for(const c of f.record.changes)if(c.backup)assert.deepEqual(await fs.readFile(c.target),await fs.readFile(c.backup));else await assert.rejects(fs.stat(c.target),{code:'ENOENT'});assert.deepEqual(await fs.readFile(f.agents),f.original);}

for(const location of ['first','middle'])for(const lockFault of [false,true])await test(`rollback-directory-${location}-${lockFault}`,'Directory cleanup errors report the actual directory after confirmed file restoration without continuing',async()=>{
 const f=await installedFixture(`directory-${location}-${lockFault}`);const failure=path.join(f.target,location==='first'?'scripts/tests/helpers':'scripts/tests'),calls=[];let hit=false,manifestWrites=0;const primary=Object.assign(new Error('SYNTHETIC directory EACCES '+failure),{code:'EACCES'});
 const r=await patchMethod(fs,'writeFile',old=>async function(p,...a){if(String(p).startsWith(f.done.rollbackManifest+'.'))manifestWrites++;return old.call(this,p,...a);},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p).startsWith(key(f.target)+path.sep)||key(p)===key(f.target))calls.push(String(p));if(key(p)===key(failure)){hit=true;throw primary;}if(lockFault&&key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC directory lock');return old.call(this,p,...a);},()=>captureOutcome(rollbackInstall(f.done.rollbackManifest))));
 assert.equal(hit,true);const e=lockFault?r.error.actionError:r.error;if(lockFault){assert.equal(r.error.code,'LOCK_CLEANUP_FAILED');assert.match(r.error.cleanupError.message,/directory lock/);}assert.equal(e.cause,primary);assert.equal(e.recovery.stage,'remove-created-directories');assert.equal(e.recovery.failedTarget,failure);assert.equal(e.recovery.completedTargets,f.record.changes.length);assert.equal(e.recovery.totalTargets,f.record.changes.length);const journal=await readJson(f.done.rollbackManifest);assert.equal(journal.status,'rollback-prepared');const operations=journal.operations.filter(e=>e.operation==='rollback');assert.equal(manifestWrites,operations.length);for(const change of f.record.changes)assert.deepEqual(operations.filter(e=>e.target===change.target).map(e=>e.outcome),['intent','confirmed']);for(const directory of calls)assert.deepEqual(operations.filter(e=>e.target===directory).map(e=>e.outcome),directory===failure?['intent','failed']:['intent','confirmed']);assert.equal(journal.rollbackProgress.completedTargets,f.record.changes.length);assert.deepEqual(journal.rollbackProgress.removedDirectories,calls.slice(0,-1));const failureManifest=await fs.readFile(f.done.rollbackManifest);assert.equal(calls.at(-1),failure);assert.equal(calls.filter(x=>key(x)===key(failure)).length,1);await assertRollbackRestored(f);assert.deepEqual(await fs.readFile(f.done.rollbackManifest),failureManifest);
 if(location==='middle'){assert.ok(calls.length>=2);for(const p of calls.slice(0,-1))await assert.rejects(fs.stat(p),{code:'ENOENT'});await fs.stat(path.join(f.target,'references'));}
 if(!lockFault){const again=await captureOutcome(rollbackInstall(f.done.rollbackManifest));assert.ok(again.error);assert.match(again.error.message,/Only a completed installed transaction/);assert.equal(again.error.recovery,undefined);await assertRollbackRestored(f);assert.deepEqual(await fs.readFile(f.done.rollbackManifest),failureManifest);}
 return {location,lockFault,actualDirectory:failure,completedTargets:e.recovery.completedTargets,calls};
});

for(const code of ['ENOTEMPTY','ENOENT'])await test('rollback-ignore-'+code,'Unknown members refuse preflight; an unconfirmed directory disappearance retains partial facts',async()=>{
 const f=await installedFixture('ignore-'+code),target=path.join(f.target,'scripts/tests/helpers');let hit=false;
 if(code==='ENOTEMPTY'){
  await fs.writeFile(path.join(target,'unrelated.txt'),'SYNTHETIC unrelated retained');const before=await publicSnapshot(f.dir);
  await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(target))hit=true;return old.call(this,p,...a);},()=>assert.rejects(rollbackInstall(f.done.rollbackManifest),/changed/));
  assert.equal(hit,false);assert.deepEqual(await publicSnapshot(f.dir),before);assert.equal(await fs.readFile(path.join(target,'unrelated.txt'),'utf8'),'SYNTHETIC unrelated retained');return{code,unknownMemberRefusedBeforeRestore:true};
 }
 const r=await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(target)){hit=true;await old.call(this,p,...a);throw Object.assign(new Error('SYNTHETIC disappeared directory'),{code});}return old.call(this,p,...a);},()=>captureOutcome(rollbackInstall(f.done.rollbackManifest)));
 assert.equal(hit,true);assert.equal(r.error.recovery.stage,'remove-created-directories');assert.equal(r.error.recovery.failedTarget,target);await assertRollbackRestored(f);await assert.rejects(fs.stat(target),{code:'ENOENT'});const journal=await readJson(f.done.rollbackManifest);assert.equal(journal.status,'rollback-prepared');assert.equal(journal.rollbackProgress.completedTargets,f.record.changes.length);assert.ok(!journal.rollbackProgress.removedDirectories.includes(target));const bytes=await fs.readFile(f.done.rollbackManifest);await assert.rejects(rollbackInstall(f.done.rollbackManifest),/completed/);assert.deepEqual(await fs.readFile(f.done.rollbackManifest),bytes);return{code,unconfirmedDisappearance:true,noAutomaticRetry:true};
});

for(const committed of [false,true])await test('rollback-manifest-'+committed,'Manifest failure after cleanup reports actual target progress without assuming whether publication occurred',async()=>{
 const f=await installedFixture('manifest-'+committed);let hit=false,lastJournal;const r=await patchMethod(fs,'rename',old=>async function(from,to,...a){if(key(to)===key(f.done.rollbackManifest)&&(await readJson(from)).status==='rolled-back'){hit=true;lastJournal=await fs.readFile(f.done.rollbackManifest);if(committed)await old.call(this,from,to,...a);throw new Error('SYNTHETIC manifest rename');}return old.call(this,from,to,...a);},()=>captureOutcome(rollbackInstall(f.done.rollbackManifest)));assert.equal(hit,true);assert.equal(r.error.recovery.stage,'rolled-back-manifest');assert.equal(r.error.recovery.failedTarget,f.done.rollbackManifest);assert.equal(r.error.recovery.completedTargets,f.record.changes.length);assert.equal(r.error.recovery.totalTargets,f.record.changes.length);await assertRollbackRestored(f);await assert.rejects(fs.stat(f.target),{code:'ENOENT'});assert.equal((await readJson(f.done.rollbackManifest)).status,committed?'rolled-back':'rollback-prepared');if(!committed)assert.deepEqual(await fs.readFile(f.done.rollbackManifest),lastJournal);await assert.rejects(rollbackInstall(f.done.rollbackManifest));await assertRollbackRestored(f);return {committed,manifestCommitUnconfirmedByReturn:true};
});

for(const mode of ['write','close'])for(const lockFault of [false,true])await test(`rollback-file-${mode}-${lockFault}`,'Incomplete target operations are not counted even when bytes changed and cleanup also fails',async()=>{
 const f=await installFixture(`file-${mode}-${lockFault}`,{copy:true});for(const name of ['LICENSE','SKILL.md','agents/openai.yaml'])await fs.writeFile(path.join(f.target,name),'SYNTHETIC older '+name);const done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest);assert.ok(record.changes.length>=4);const failure=record.changes[2],before=await Promise.all(record.changes.map(c=>fs.readFile(c.target)));let hit=false,directoryCalls=0;
 const r=await patchMethod(fs,'open',old=>async function(p,...a){const h=await old.call(this,p,...a);if(key(p)!==key(failure.target))return h;return wrapHandle(h,mode==='write'?{writeFile:async()=>{hit=true;await h.writeFile('PART');throw new Error('SYNTHETIC partial restore');}}:{close:async()=>{hit=true;await h.close();throw new Error('SYNTHETIC restore handle close');}});},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p).startsWith(key(f.target)))directoryCalls++;if(lockFault&&key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC file lock');return old.call(this,p,...a);},()=>captureOutcome(rollbackInstall(done.rollbackManifest))));
 assert.equal(hit,true);const e=lockFault?r.error.actionError:r.error;assert.equal(e.recovery.stage,'restore-targets');assert.equal(e.recovery.failedTarget,failure.target);assert.equal(e.recovery.completedTargets,2);assert.equal(e.recovery.totalTargets,record.changes.length);assert.equal(directoryCalls,0);for(let i=0;i<record.changes.length;i++){const bytes=await fs.readFile(record.changes[i].target);if(i<2||(i===2&&mode==='close'))assert.deepEqual(bytes,await fs.readFile(record.changes[i].backup));else if(i>2)assert.deepEqual(bytes,before[i]);else assert.equal(bytes.subarray(0,4).toString(),'PART');}assert.equal((await readJson(done.rollbackManifest)).status,'rollback-prepared');assert.equal((await readJson(done.rollbackManifest)).rollbackProgress.completedTargets,2);return {mode,lockFault,confirmedPrefix:2};
});

await test('rollback-completed-lock','Completed rollback preserves its original successful API result through outer lock failure',async()=>{
 const f=await installedFixture('completed-lock');const r=await patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(path.join(f.home,'.writer-lock')))throw new Error('SYNTHETIC completed lock');return old.call(this,p,...a);},()=>captureOutcome(rollbackInstall(f.done.rollbackManifest)));assert.equal(r.error.actionStatus,'completed');assert.deepEqual(Object.keys(r.error.completedResult).sort(),['status','restoredFiles','backupPreserved','rollbackManifest'].sort());assert.equal(r.error.completedResult.status,'rolled-back');assert.equal(r.error.completedResult.restoredFiles,f.record.changes.length);assert.equal(r.error.completedResult.backupPreserved,path.dirname(f.done.rollbackManifest));assert.equal((await readJson(f.done.rollbackManifest)).status,'rolled-back');await assertRollbackRestored(f);return {completedResultRetained:true};
});

for(const lockFault of [false,true])await test('rollback-cli-'+lockFault,'Real CLI retains directory diagnostics and both errors without false successful stdout',async()=>{
 const f=await installedFixture('cli-'+lockFault),failure=path.join(f.target,'scripts/tests/helpers'),hook=path.join(f.dir,'fault-hook.mjs');await fs.writeFile(hook,`import fs from 'node:fs/promises';import path from 'node:path';const key=p=>path.resolve(String(p)).toLowerCase(),old=fs.rmdir;fs.rmdir=async(p,...a)=>{if(key(p)===key(${JSON.stringify(failure)}))throw Object.assign(new Error('SYNTHETIC CLI directory'),{code:'EACCES'});if(${lockFault}&&key(p)===key(${JSON.stringify(path.join(f.home,'.writer-lock'))}))throw new Error('SYNTHETIC CLI outer lock');return old.call(fs,p,...a);};`);const r=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,cli,'rollback','--manifest',f.done.rollbackManifest],{encoding:'utf8',timeout:300000,windowsHide:true,shell:false,cwd:work});assert.equal(r.status,1);assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.stdout,'');assert.match(r.stderr,/remove-created-directories/);assert.ok(r.stderr.includes(failure));assert.match(r.stderr,/completedTargets/);assert.match(r.stderr,/totalTargets/);assert.ok(r.stderr.includes(f.done.rollbackManifest));if(lockFault)assert.match(r.stderr,/CLI outer lock/);await assertRollbackRestored(f);const journal=await readJson(f.done.rollbackManifest);assert.equal(journal.status,'rollback-prepared');assert.equal(journal.rollbackProgress.completedTargets,f.record.changes.length);assert.ok(!journal.rollbackProgress.removedDirectories.includes(failure));return {lockFault,exitCode:r.status};
});

async function verifiedAcceptanceFixture(name,documents){
 const f=await acceptanceGateFixture(''+name,{documents,kind:'mixed'});
 assert.equal((await verifyFacts(f.project,f.id,'a',f.reviews)).taskStatus,'verified');
 return f;
}

async function acceptanceSnapshot(f){
 const state=await engine.status(f.project,f.id),a=state.tasks.a;
 const files=[...new Set([a.receipt.path,...a.evidence.map(x=>x.path)])];
 return {state,files:await Promise.all(files.map(async file=>({file,bytes:await fs.readFile(file)})))};
}

async function assertAcceptancePreserved(f,before,status='verified'){
 const state=await engine.status(f.project,f.id),a=state.tasks.a,old=before.state.tasks.a;
 assert.equal(a.status,status);assert.equal(a.runId,old.runId);assert.equal(a.acceptedAt,old.acceptedAt);
 assert.deepEqual(a.receipt,old.receipt);assert.deepEqual(a.evidence,old.evidence);
 assert.deepEqual(a.acceptanceAttempts.slice(0,old.acceptanceAttempts.length),old.acceptanceAttempts);
 for(const entry of before.files)assert.deepEqual(await fs.readFile(entry.file),entry.bytes);
 return state;
}

async function rejectedVerification(f){let spawns=0;const result=await patchMethod(childProcess,'spawn',old=>(...args)=>{spawns++;return old(...args);},()=>captureOutcome(verifyFacts(f.project,f.id,'a',envelope('reviews',{records:{}}))));assert.ok(result.error);assert.equal(spawns,0);return result.error;}

function assertRejectedAttempt(a,criterion){
 const last=a.lastAcceptance;assert.equal(last.status,'failed');assert.equal(last.criterion,criterion);
 for(const field of ['log','exitCode','processResult'])assert.equal(last[field],null);
 assert.deepEqual(last.checks,[]);assert.deepEqual(last.evidence,[]);return last;
}

async function closeIndependentTask(f,b){
 await emit(f,'b');const closed=await submit(f,'b',b);assert.equal(closed.executionClosed,true);
 assert.equal(closed.acceptedForVerification,true);await verifyFacts(f.project,f.id,'b');
}

for(const documents of [true]){
 const artifactMode='current';
 await test('verified-guard-'+artifactMode,'A rejected verification attempt preserves valid prior acceptance through B completion',async()=>{
  const f=await verifiedAcceptanceFixture('guard-'+artifactMode,documents),b=await engine.begin(f.project,f.id,'b'),before=await acceptanceSnapshot(f);
  const error=await rejectedVerification(f);assert.equal(error.code,'HARNESS_ACTIVE_EXECUTION');assert.ok(error.message.includes(b.runId));
  const state=await assertAcceptancePreserved(f,before);assert.deepEqual(state.activeExecutions,before.state.activeExecutions);
  const last=assertRejectedAttempt(state.tasks.a,'execution-guard');assert.equal(state.tasks.a.acceptanceAttempts.length,before.state.tasks.a.acceptanceAttempts.length+1);
  const report=await readJson(last.report.path);assert.equal(report.criterion,'execution-guard');assert.deepEqual(report.checks,[]);assert.deepEqual(report.evidence,[]);
  const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.acceptance.status,'failed');assert.equal(ctx.acceptance.criterion,'execution-guard');assert.equal(ctx.currentStatus,'verified');
  await closeIndependentTask(f,b);assert.equal((await assertAcceptancePreserved(f,before)).phase,'verified');
  assert.equal((await engine.status(f.project,f.id)).tasks.a.lastAcceptance.attemptId,last.attemptId);
  return {artifactMode,priorAcceptancePreserved:true,noReverificationNeeded:true};
 });
 await test('acceptance-failure-contrast-'+artifactMode,'A real failed criterion remains pending until a successful same-run retry',async()=>{
  const criterion={id:'exit',type:'command',description:'SYNTHETIC marker-controlled acceptance',command:process.execPath,args:['-e',"console.log('SYNTHETIC actual criterion');process.exit(require('node:fs').existsSync('ready.txt')?0:9)"]};
  const f=await fixture('contrast-'+artifactMode,{documents,two:false,acceptance:[criterion]});await approve(f);
  const a=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',a);
  const receipt=(await engine.status(f.project,f.id)).tasks.a.receipt,receiptBytes=await fs.readFile(receipt.path);
  await assert.rejects(verifyFacts(f.project,f.id,'a'),/exit 9/);
  const failed=(await engine.status(f.project,f.id)).tasks.a;assert.equal(failed.status,'pending_acceptance');
  const attempt=failed.lastAcceptance;assert.equal(attempt.criterion,'exit');assert.equal(attempt.status,'failed');assert.equal(attempt.exitCode,9);
  assert.equal(attempt.processResult.processState,'closed');assert.equal(attempt.processResult.exitCode,9);assert.equal(attempt.processResult.signal,null);
  assert.ok(attempt.log);const logBytes=await fs.readFile(attempt.log.path);assert.match(logBytes.toString(),/SYNTHETIC actual criterion/);
  const reportBytes=await fs.readFile(attempt.report.path),ctx=await engine.taskContext(f.project,f.id,'a');
  assert.equal(ctx.currentStatus,'pending_acceptance');assert.equal(ctx.acceptance.status,'failed');
  await fs.writeFile(path.join(f.project,'ready.txt'),'SYNTHETIC approved retry condition');
  assert.equal((await verifyFacts(f.project,f.id,'a')).taskStatus,'verified');
  const passed=(await engine.status(f.project,f.id)).tasks.a;assert.equal(passed.runId,a.runId);
  assert.deepEqual(passed.acceptanceAttempts[0],attempt);assert.equal(passed.acceptanceAttempts.length,2);assert.equal(passed.lastAcceptance.status,'passed');assert.notEqual(passed.lastAcceptance.attemptId,attempt.attemptId);
  assert.equal((await engine.status(f.project,f.id)).phase,'verified');
  assert.deepEqual(await fs.readFile(receipt.path),receiptBytes);assert.deepEqual(await fs.readFile(attempt.log.path),logBytes);assert.deepEqual(await fs.readFile(attempt.report.path),reportBytes);
  return {artifactMode,actualExitCode:9,sameRunRetry:true};
 });
 await test('verified-drift-guard-'+artifactMode,'Real evidence drift remains stale after a guard rejection and original B closure',async()=>{
  const f=await verifiedAcceptanceFixture('drift-'+artifactMode,documents),b=await engine.begin(f.project,f.id,'b'),before=await acceptanceSnapshot(f);
  const changed=path.join(f.project,'out/a.txt');await fs.writeFile(changed,'SYNTHETIC actual changed evidence');
  assert.equal((await rejectedVerification(f)).code,'HARNESS_ACTIVE_EXECUTION');
  let state=await engine.status(f.project,f.id);assert.equal(state.tasks.a.status,'stale');assert.equal(state.tasks.a.runId,before.state.tasks.a.runId);
  assert.deepEqual(state.tasks.a.evidence,before.state.tasks.a.evidence);assertRejectedAttempt(state.tasks.a,'execution-guard');
  const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.currentStatus,'stale');assert.equal(ctx.acceptance.criterion,'execution-guard');
  for(const entry of before.files)if(key(entry.file)!==key(changed))assert.deepEqual(await fs.readFile(entry.file),entry.bytes);
  await closeIndependentTask(f,b);state=await engine.status(f.project,f.id);assert.equal(state.tasks.a.status,'stale');
  await engine.rework(f.project,f.id,'a',{runId:(await engine.status(f.project,f.id)).tasks.a.runId,reason:'SYNTHETIC changed verified output',reference:'SYNTHETIC current test'});const next=await engine.begin(f.project,f.id,'a');assert.notEqual(next.runId,before.state.tasks.a.runId);
  await emit(f,'a');await submit(f,'a',next);await verifyFacts(f.project,f.id,'a',await currentReviews(f));
  assert.equal((await engine.status(f.project,f.id)).phase,'verified');
  return {artifactMode,noAutomaticFreshness:true,newAcceptedRun:next.runId};
 });
 await test('verified-preflight-reject-'+artifactMode,'A duplicate request can fail preflight while prior valid acceptance remains verified',async()=>{
  const f=await verifiedAcceptanceFixture('preflight-'+artifactMode,documents),before=await acceptanceSnapshot(f),error=await rejectedVerification(f);
  assert.equal(error.code,undefined);assert.match(error.message,/pending acceptance/);
  const state=await assertAcceptancePreserved(f,before);assertRejectedAttempt(state.tasks.a,'preflight');
  const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.currentStatus,'verified');assert.equal(ctx.acceptance.status,'failed');assert.equal(ctx.acceptance.criterion,'preflight');
  await finish(f,'b');assert.equal((await assertAcceptancePreserved(f,before)).phase,'verified');
  return {artifactMode,failedAttemptDoesNotRevokeEvidence:true};
 });
 await test('verified-guard-compound-fault-'+artifactMode,'Report, state and lock faults retain prior acceptance and allow factual original-run recovery',async()=>{
  const f=await verifiedAcceptanceFixture('compound-'+artifactMode,documents),b=await engine.begin(f.project,f.id,'b'),before=await acceptanceSnapshot(f);
  const stateFile=path.join(f.directory,'state.json'),stateBytes=await fs.readFile(stateFile),lock=path.join(f.directory,'.writer-lock');
  let reportHit=0,stateHit=0,lockHit=0;
  const error=await patchMethod(fs,'writeFile',old=>async function(p,...a){if(path.dirname(String(p))===f.directory&&path.basename(String(p)).startsWith('acceptance-')){reportHit++;throw new Error('SYNTHETIC report save');}return old.call(this,p,...a);},()=>patchMethod(fs,'rename',old=>async function(from,to,...a){if(key(to)===key(stateFile)){stateHit++;throw new Error('SYNTHETIC state save');}return old.call(this,from,to,...a);},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(lock)){lockHit++;throw new Error('SYNTHETIC lock cleanup');}return old.call(this,p,...a);},()=>rejectedVerification(f))));
  assert.equal(reportHit,1);assert.equal(stateHit,1);assert.equal(lockHit,1);
  assert.equal(error.code,'LOCK_CLEANUP_FAILED');assert.equal(error.actionStatus,'failed');assert.equal(error.lockPath,lock);assert.match(error.cleanupError.message,/lock cleanup/);
  const savedError=error.actionError;assert.match(savedError.statePersistenceError.message,/state save/);
  const guard=savedError.actionError;assert.equal(guard.code,'HARNESS_ACTIVE_EXECUTION');assert.match(guard.recovery.acceptanceReportError,/report save/);
  assert.deepEqual(await fs.readFile(stateFile),stateBytes);let state=await assertAcceptancePreserved(f,before);
  assert.deepEqual(state.tasks.a.acceptanceAttempts,before.state.tasks.a.acceptanceAttempts);assert.equal(state.activeExecutions[0].runId,b.runId);
  assert.ok((await fs.stat(lock)).isDirectory());
  // The captured call has settled, spawned no child and owns this unique SYNTHETIC lock.
  // Explicit test-site recovery is not a production automatic lock-removal path.
  assert.equal(path.dirname(lock),f.directory);assert.ok(f.project.startsWith(root+path.sep));await fs.rmdir(lock);
  const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.currentStatus,'verified');assert.equal(ctx.activeExecutions[0].runId,b.runId);
  await closeIndependentTask(f,b);state=await assertAcceptancePreserved(f,before);assert.equal(state.phase,'verified');
  return {artifactMode,reportHit,stateHit,lockHit,unpersistedAttemptNotClaimed:true,originalRunRecovered:true};
 });
 await test('verified-guard-cli-'+artifactMode,'Real CLI guard rejection preserves prior verified state and original evidence',async()=>{
  const f=await verifiedAcceptanceFixture('cli-'+artifactMode,documents),b=await engine.begin(f.project,f.id,'b'),before=await acceptanceSnapshot(f);
  const checkFiles=(await fs.readdir(f.directory)).filter(x=>x.startsWith('check-'));
  const r=spawnSync(process.execPath,[cli,'verify','--project',f.project,'--id',f.id,'--task','a'],{encoding:'utf8',timeout:20000,windowsHide:true,shell:false,cwd:work});
  assert.equal(r.status,1);assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.stdout,'');
  assert.match(r.stderr,/HARNESS_ACTIVE_EXECUTION/);assert.ok(r.stderr.includes(b.runId));
  const state=await assertAcceptancePreserved(f,before);assertRejectedAttempt(state.tasks.a,'execution-guard');
  assert.deepEqual((await fs.readdir(f.directory)).filter(x=>x.startsWith('check-')),checkFiles);
  await closeIndependentTask(f,b);assert.equal((await assertAcceptancePreserved(f,before)).phase,'verified');
  return {artifactMode,actualExitCode:r.status};
 });
}

async function rollbackSourceFixture(name){
 const f=await installFixture('source-'+name,{copy:true});
 for(const name of ['LICENSE','SKILL.md','agents/openai.yaml'])await fs.writeFile(path.join(f.target,name),'SYNTHETIC older '+name);
 const done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest),index=2;
 assert.ok(record.changes.length>=4);assert.ok(record.changes[index].backup);
 return {...f,done,record,index,failure:record.changes[index],manifestBefore:await fs.readFile(done.rollbackManifest),targets:await Promise.all(record.changes.map(c=>fs.readFile(c.target))),backups:await Promise.all(record.changes.map(c=>c.backup?fs.readFile(c.backup):null))};
}

async function assertRollbackSourceSite(f,stage){
 assert.deepEqual(await fs.readFile(f.done.rollbackManifest),f.manifestBefore);
 for(let i=0;i<f.record.changes.length;i++){
  const c=f.record.changes[i];assert.deepEqual(await fs.readFile(c.target),f.targets[i]);
  if(c.backup)assert.deepEqual(await fs.readFile(c.backup),f.backups[i]);
 }
}

for(const stage of ['preflight','restore'])for(const lockFault of [false,true])await test('rollback-source-'+stage+(lockFault?'-lock':''),'First or second backup reads fail during locked preflight, preserving every target and exact source diagnostics',async()=>{
 const f=await rollbackSourceFixture(stage+'-'+lockFault),failAt=stage==='preflight'?1:2,lock=path.join(f.home,'.writer-lock');
 const primary=Object.assign(new Error('SYNTHETIC '+stage+' source read failure'+(stage==='restore'?': '+f.failure.backup:'')),{code:'EACCES',...(stage==='restore'?{path:f.failure.backup}:{})});
 let sourceReads=0,cleanupCalls=0,manifestWrites=0;
 const r=await patchMethod(fs,'readFile',old=>async function(p,...a){if(key(p)===key(f.failure.backup)&&++sourceReads===failAt)throw primary;return old.call(this,p,...a);},()=>patchMethod(fs,'rmdir',old=>async function(p,...a){if(key(p)===key(f.target)||key(p).startsWith(key(f.target)+path.sep))cleanupCalls++;if(lockFault&&key(p)===key(lock))throw new Error('SYNTHETIC source lock cleanup');return old.call(this,p,...a);},()=>patchMethod(fs,'writeFile',old=>async function(p,...a){if(String(p).startsWith(f.done.rollbackManifest+'.'))manifestWrites++;return old.call(this,p,...a);},()=>captureOutcome(rollbackInstall(f.done.rollbackManifest)))));
 assert.ok(r.error);assert.equal(sourceReads,failAt);const e=lockFault?r.error.actionError:r.error;
 assert.equal(e.cause,primary);assert.equal(e.recovery.operation,'rollback');assert.equal(e.recovery.stage,'locked-preflight');assert.equal(e.recovery.failedTarget,f.failure.target);assert.equal(e.recovery.source,f.failure.backup);assert.notEqual(e.recovery.failedTarget,f.failure.backup);
 assert.equal(e.recovery.completedTargets,0);assert.equal(e.recovery.totalTargets,f.record.changes.length);
 assert.equal(e.recovery.manifest,f.done.rollbackManifest);assert.equal(e.recovery.backupDirectory,path.dirname(f.done.rollbackManifest));
 assert.equal(cleanupCalls,0);assert.equal(manifestWrites,0);await assertRollbackSourceSite(f,stage);
 const logical=f.record.changes.find(c=>c.target===e.recovery.failedTarget);assert.equal(logical.backup,f.failure.backup);
 if(stage==='preflight')assert.equal(Object.hasOwn(e.cause,'path'),false);else assert.equal(e.cause.path,f.failure.backup);
 if(lockFault){assert.equal(r.error.code,'LOCK_CLEANUP_FAILED');assert.equal(r.error.actionStatus,'failed');assert.equal(r.error.completedResult,undefined);assert.match(r.error.cleanupError.message,/source lock cleanup/);await fs.stat(lock);}
 else await assert.rejects(fs.stat(lock),{code:'ENOENT'});
 const {formatRuntimeError}=await import('../lib/files.mjs');const text=formatRuntimeError(r.error);
 for(const value of [primary.message,f.failure.target,f.done.rollbackManifest,path.dirname(f.done.rollbackManifest)])assert.ok(text.includes(value));
 if(lockFault)assert.match(text,/source lock cleanup/);
 return {stage,mappedStage:'locked-preflight',lockFault,sourceReads,failedTarget:e.recovery.failedTarget,sourceLocatedFromManifest:logical.backup,confirmedPrefix:e.recovery.completedTargets};
});

for(const stage of ['preflight','restore'])await test('rollback-source-cli-'+stage,'Real CLI retains first/second preflight backup-read diagnostics, logical target and zero restored prefix without successful output',async()=>{
 const f=await rollbackSourceFixture('cli-'+stage),failAt=stage==='preflight'?1:2,hook=path.join(f.dir,'source-hook.mjs');
 await fs.writeFile(hook,"import fs from 'node:fs/promises';import path from 'node:path';const key=p=>path.resolve(String(p)).toLowerCase(),old=fs.readFile;let reads=0;fs.readFile=async(p,...a)=>{if(key(p)===key("+JSON.stringify(f.failure.backup)+")&&++reads==="+failAt+")throw Object.assign(new Error('SYNTHETIC CLI source read#"+failAt+": '+"+JSON.stringify(f.failure.backup)+"),{code:'EACCES',path:"+JSON.stringify(f.failure.backup)+"});return old.call(fs,p,...a);};");
 const r=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,cli,'rollback','--manifest',f.done.rollbackManifest],{encoding:'utf8',timeout:300000,windowsHide:true,shell:false,cwd:work});
 assert.equal(r.status,1);assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.stdout,'');
 for(const value of ['locked-preflight','SYNTHETIC CLI source read#'+failAt,f.failure.target,f.failure.backup,f.done.rollbackManifest,path.dirname(f.done.rollbackManifest),'failedTarget','completedTargets','totalTargets'])assert.ok(r.stderr.includes(value),value);
 assert.match(r.stderr,new RegExp("stage: ['\"]locked-preflight['\"]"));assert.ok(r.stderr.includes('failedTarget: '+f.failure.target));
 assert.match(r.stderr,new RegExp('completedTargets: '+(0)+'(?:,|\\s)'));
 assert.match(r.stderr,new RegExp('totalTargets: '+f.record.changes.length+'(?:,|\\s)'));
 await assertRollbackSourceSite(f,stage);await assert.rejects(fs.stat(path.join(f.home,'.writer-lock')),{code:'ENOENT'});
 return {stage,mappedStage:'locked-preflight',actualExitCode:r.status,confirmedPrefix:0};
});

await test('install-source-target','Installation source failure retains the logical destination and prepared recovery evidence',async()=>{
 const f=await installFixture('install-source'),plan=await previewInstall(f.options),index=plan.changes.findIndex((c,i)=>i>1&&c.source);
 assert.ok(index>1);const failure=plan.changes[index],sourceBytes=await fs.readFile(failure.source),before=await Promise.all(plan.changes.map(async c=>c.before?fs.readFile(c.target):null));
 let armed=false,manifest=null,hits=0,installedManifestWrites=0;
 const primary=Object.assign(new Error('SYNTHETIC install source: '+failure.source),{code:'EACCES',path:failure.source});
 const r=await patchMethod(fs,'rename',old=>async function(from,to,...a){const value=await old.call(this,from,to,...a);if(path.basename(String(to))==='rollback.json'&&key(to).startsWith(key(f.home)+path.sep)){manifest=String(to);armed=true;}return value;},()=>patchMethod(fs,'writeFile',old=>async function(p,bytes,...a){if(armed&&String(p).includes('rollback.json.')&&String(bytes).includes('"status": "installed"'))installedManifestWrites++;return old.call(this,p,bytes,...a);},()=>patchMethod(fs,'readFile',old=>async function(p,...a){if(armed&&key(p)===key(failure.source)){hits++;throw primary;}return old.call(this,p,...a);},()=>captureOutcome(applyInstall(plan)))));
 assert.equal(armed,true);assert.equal(hits,1);assert.ok(r.error);assert.equal(r.error.cause,primary);assert.equal(r.error.recovery.operation,'install');assert.equal(r.error.recovery.stage,'write-targets');
 assert.equal(r.error.recovery.failedTarget,failure.target);assert.notEqual(r.error.recovery.failedTarget,failure.source);assert.equal(r.error.recovery.manifest,manifest);assert.equal(installedManifestWrites,0);
 const record=await readJson(manifest);assert.equal(record.status,'prepared');
 for(let i=0;i<plan.changes.length;i++){
  const c=plan.changes[i];if(i<index)assert.equal(await digest(c.target),c.after);else if(before[i])assert.deepEqual(await fs.readFile(c.target),before[i]);else await assert.rejects(fs.stat(c.target),{code:'ENOENT'});
  if(record.changes[i].backup)assert.deepEqual(await fs.readFile(record.changes[i].backup),before[i]);
 }
 assert.deepEqual(await fs.readFile(failure.source),sourceBytes);await assert.rejects(fs.stat(path.join(f.home,'.writer-lock')),{code:'ENOENT'});
 return {stage:r.error.recovery.stage,failedTarget:failure.target,source:failure.source,confirmedPrefix:index};
});

await test('public-neutral-help','Ordinary help identifies the standalone product',async()=>{
 const r=command(['help']);assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.split(/\r?\n/)[0],'SCIAutoHarness (local Node.js; no automatic downloads)');return {standaloneProduct:true};
});

await test('current-master-neutral','Current master preserves explicit reviewed host policy and complete navigation',async()=>{const f=await fixture('neutral-master',{two:false});const master=await fs.readFile(path.join(f.directory,'HARNESS.md'),'utf8');assert.match(master,/Task harness:/);assert.match(master,/allowedHosts/);assert.match(master,/RECOVERY.md/);assert.equal(f.c.format,'sciautoharness');assert.equal(f.c.schemaVersion,1);return{currentNamespace:true};});

await test('public-neutral-managed-rule','New rules use the supplied installation path and generic permission boundaries',async()=>{
 const paths=[path.join(root,'first user','skills','sciautoharness'),path.join(root,'second-user','skills','sciautoharness')];
 for(const target of paths){const rule=defaultRule(target);assert.ok(rule.includes(path.join(target,'SKILL.md').replaceAll('\\','/')));assert.ok(!rule.includes('unrecognized-product'));assert.ok(rule.includes('no additional services or execution permissions are implied.'));}
 return {dynamicTargets:paths.length};
});

await test('public-neutral-doctor','Doctor probes only a synthetic executable and keeps evidence under the product name',async()=>{
 const dir=path.join(root,'public-doctor'),bin=path.join(dir,'bin'),tmp=path.join(dir,'tmp');await fs.mkdir(tmp,{recursive:true});
 const fake=process.platform==='win32'?path.join(bin,'node_modules','@openai','codex','bin','codex.js'):path.join(bin,'codex');
 await fs.mkdir(path.dirname(fake),{recursive:true});await fs.writeFile(fake,(process.platform==='win32'?'':'#!'+process.execPath+'\n')+"const a=process.argv.slice(2);if(a.length===1&&a[0]==='--version')console.log('SYNTHETIC doctor version');else if(a.length===2&&a[0]==='exec'&&a[1]==='--help')console.log('--sandbox --skip-git-repo-check --json --config');else process.exitCode=91;\n",{mode:0o755});
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!['path','temp','tmp','tmpdir'].includes(k.toLowerCase())));Object.assign(env,{PATH:bin,TEMP:tmp,TMP:tmp,TMPDIR:tmp});
 const r=spawnSync(process.execPath,[cli,'doctor'],{cwd:dir,env,encoding:'utf8',timeout:30000,windowsHide:true,shell:false});assert.equal(r.status,0,r.stderr);const report=cliData(r.stdout);
 assert.equal(report.versionExit,0);assert.equal(report.helpExit,0);assert.equal(report.actualModelRun,false);assert.equal(report.execArgumentsSupported,true);assert.equal(path.dirname(report.evidenceDirectory),tmp);assert.ok(path.basename(report.evidenceDirectory).startsWith('sciautoharness-doctor-'));
 assert.equal((await fs.readFile(path.join(report.evidenceDirectory,'version.txt'),'utf8')).trim(),'SYNTHETIC doctor version');assert.ok((await fs.readFile(path.join(report.evidenceDirectory,'help.txt'),'utf8')).includes('--sandbox'));return {syntheticExecutableOnly:true,actualModelRun:false};
});

const expectedExecutionSummary='On first factual closure, eligible ok results enter pending_acceptance, eligible failed results enter failed, and ineligible results are stale. A receipt and exit zero do not verify a task.';

await test('execution-state-prose','Current master preserves factual closure and acceptance meanings',async()=>{const f=await fixture('execution-prose',{two:false}),master=await fs.readFile(path.join(f.directory,'HARNESS.md'),'utf8');assert.ok(master.includes(expectedExecutionSummary));return{closureProse:true};});
for(const mutation of ['schema','kind'])await test('contract-discriminator-'+mutation,'Invalid current contract discriminator is explicitly refused',async()=>{const f=await fixture('discriminator-'+mutation,{two:false});f.c[mutation==='schema'?'schemaVersion':'kind']=mutation==='schema'?99:'state';assert.throws(()=>validateContract(f.c));return{mutation};});

async function publicSnapshot(directory){
 const rows={};
 async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else {const st=await fs.stat(file,{bigint:true});rows[path.relative(directory,file)]={hash:await digest(file),identity:String(st.dev)+':'+String(st.ino),links:String(st.nlink),mode:String(st.mode)};}}}
 await walk(directory);return rows;
}

async function publicBarrier(f){
 const ready=path.join(f.project,'synthetic-ready'),release=path.join(f.project,'synthetic-release'),log=path.join(f.project,'synthetic-child.log');
 const script="const fs=require('node:fs');fs.writeFileSync("+JSON.stringify(ready)+",'SYNTHETIC READY');const timer=setInterval(()=>{if(fs.existsSync("+JSON.stringify(release)+")){clearInterval(timer);console.log('SYNTHETIC CHILD CLOSED');}},10);";
 const promise=runProcess(process.execPath,['-e',script],{cwd:f.project,log,timeoutMs:15000});
 // Retain the observer immediately, including an early spawn/log failure.
 promise.catch(()=>{});
 for(let i=0;i<500;i++){try{await fs.stat(ready);return {release,promise};}catch(e){if(e.code!=='ENOENT')throw e;}await pause(10);}
 await fs.writeFile(release,'SYNTHETIC RELEASE');await promise;throw new Error('SYNTHETIC child did not publish its ready barrier');
}

for(const [i,name] of [[0,'plain'],[1,'user space 用户']])await test('public-install-roundtrip-'+i,'Two independent installations receive only the neutral skill and restore original bytes',async()=>{
 const bytes=Buffer.concat([Buffer.from([239,187,191]),Buffer.from('SYNTHETIC 用户 policy\r\nno-final-newline')]),f=await installFixture('public-'+name,{bytes});
 const config=path.join(f.home,'config.toml');await fs.writeFile(config,'SYNTHETIC_CONFIG=true\n');const configBefore=await fs.readFile(config),agentsIdentity=(await fs.stat(f.agents,{bigint:true})).ino;
 const plan=await previewInstall(f.options);assert.ok(plan.changes.every(c=>c.target===f.agents||[f.target].some(t=>key(c.target).startsWith(key(t)+path.sep))));
 const done=await applyInstall(plan),installed=await fs.readFile(f.agents);assert.deepEqual(installed.subarray(0,bytes.length),bytes);assert.ok(installed.toString('utf8').includes(defaultRule(f.target)));assert.ok(!defaultRule(f.target).includes('unrecognized-product'));
 const sourceFiles=await publicSnapshot(source),targetFiles=await publicSnapshot(f.target);assert.deepEqual(Object.keys(targetFiles).sort(),Object.keys(sourceFiles).sort());for(const file of Object.keys(sourceFiles))assert.equal(targetFiles[file].hash,sourceFiles[file].hash);
 await rollbackInstall(done.rollbackManifest);assert.deepEqual(await fs.readFile(f.agents),bytes);assert.equal((await fs.stat(f.agents,{bigint:true})).ino,agentsIdentity);assert.deepEqual(await fs.readFile(config),configBefore);await assert.rejects(fs.stat(f.target),{code:'ENOENT'});return {byteExact:true,sourceFiles:Object.keys(sourceFiles).length,independentRoot:i};
});

for(const mode of ['block','extra','both'])for(const replaceSkill of [false,true])await test('install-input-refusal-'+mode+'-'+replaceSkill,'Unknown managed block and unknown tree member refuse without changes',async()=>{const f=await installFixture('refusal-'+mode+'-'+replaceSkill,{copy:true});if(mode!=='extra')await fs.writeFile(f.agents,'<!-- unknown-harness:start -->\nUNKNOWN\n<!-- unknown-harness:end -->\n');if(mode!=='block')await fs.writeFile(path.join(f.target,'unknown-member.txt'),'UNKNOWN');const before=await publicSnapshot(f.dir);await assert.rejects(previewInstall({...f.options,replaceSkill}));assert.deepEqual(await publicSnapshot(f.dir),before);return{mode,replaceSkill,unchanged:true};});

async function mhRun(...args){
 const empty=path.join(root,'mh-empty-client-path');await fs.mkdir(empty,{recursive:true});const before=process.env.PATH;
 process.env.PATH=empty;try{return await runLeafFixture(...args);}finally{if(before===undefined)delete process.env.PATH;else process.env.PATH=before;}
}

for(const host of ['codex','claude-code','deepseek-harness'])for(const mode of ['ok','nonzero'])await test('mh-cli-'+host+'-'+mode,'The real public CLI routes an explicit synthetic entry with exact argv/stdin and preserves child exit facts',async()=>{
 const f=await fixture('mh-cli-'+host+'-'+mode,{two:false,execution:{allowedHosts:[host],defaultHost:host}});await approve(f);
 await writeJson(path.join(f.project,'host-child-expectations.json'),{host,cwd:f.project,exitCode:mode==='nonzero'?7:0});
 const emptyPath=path.join(f.project,'empty-path');await fs.mkdir(emptyPath);
 const r=spawnSync(process.execPath,[cli,'run','--project',f.project,'--id',f.id,'--task','a','--host',host,'--executable',path.join(source,'scripts/tests/helpers/host-child.mjs')],{cwd:work,encoding:'utf8',shell:false,windowsHide:true,timeout:15000,env:{...process.env,PATH:emptyPath}});
 assert.equal(r.status,0,r.stderr);const observation=cliData(r.stdout);assert.equal(observation.executionClosed,false);assert.equal(observation.phase,'executing');assert.ok(!observation.receipt);assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,observation.runId);const completion=command(['submit','--project',f.project,'--id',f.id,'--task','a','--run-id',observation.runId,'--executor',host+'-cli','--reference',observation.processObservation.reference,'--result',mode==='ok'?'ok':'failed','--business-end-reference','SYNTHETIC public fixed host-child leaf actually ended, with no descendant work']);assert.equal(completion.code,0,completion.stderr);const closed=cliData(completion.stdout);assert.equal(closed.phase,mode==='ok'?'pending_acceptance':'failed');
 const receipt=await readJson(closed.receipt.path),observed=await readJson(path.join(f.project,'host-child-observed.json'));
 assert.equal(receipt.executor,host+'-cli');assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,mode==='ok'?0:7);assert.equal(observed.stdinEof,true);assert.equal(observed.cwd,f.project);
 assert.ok(observed.input.includes(f.review.digest));assert.equal((await engine.status(f.project,f.id)).tasks.a.status,mode==='ok'?'pending_acceptance':'failed');
 if(mode==='ok')await verifyFacts(f.project,f.id,'a');else await assert.rejects(verifyFacts(f.project,f.id,'a'),/pending|approved execution/i);
 return {host,mode,executor:receipt.executor,exitCode:receipt.process.exitCode,stdinEof:true};
});

for(const outputMode of ['missing-final','malformed','failed-final','error-event','unfinished-turn'])await test('mh-dsh-protocol-'+outputMode,'A malformed or failed DSH terminal contract cannot become pending acceptance even with exit0 and an artifact',async()=>{
 const f=await fixture('mh-dsh-'+outputMode,{two:false,execution:{allowedHosts:['deepseek-harness'],defaultHost:'deepseek-harness'}});await approve(f);
 await writeJson(path.join(f.project,'host-child-expectations.json'),{host:'deepseek-harness',cwd:f.project,outputMode});
 const done=await mhRun(f.project,f.id,'a',{host:'deepseek-harness',executable:path.join(source,'scripts/tests/helpers/host-child.mjs')});
 assert.equal(done.phase,'failed');const receipt=await readJson(done.receipt.path);assert.equal(receipt.process.exitCode,0);assert.equal(receipt.process.hostProtocol.ok,false);
 await assert.rejects(verifyFacts(f.project,f.id,'a'),/pending|approved execution/i);
 return {outputMode,exitCode:receipt.process.exitCode,protocol:receipt.process.hostProtocol};
});

for(const thrown of ['error','string','null','undefined'])await test('mh-observer-error-'+thrown,'Observer exceptions retain their real value and settle only after actual process close',async()=>{
 const dir=path.join(root,'mh-observer-'+thrown);await fs.mkdir(dir);const log=path.join(dir,'process.log');
 const value={error:"new Error('SYNTHETIC observer error')",string:"'SYNTHETIC observer string'",null:'null',undefined:'undefined'}[thrown];
 const script=`import {runProcess} from ${JSON.stringify(pathToFileURL(path.join(source,'scripts/lib/process.mjs')).href)};try{await runProcess(process.execPath,['-e',"process.stdout.write('SYNTHETIC');setTimeout(()=>process.exit(0),100)"],{cwd:${JSON.stringify(dir)},log:${JSON.stringify(log)},stdoutObserver(){throw ${value};}});throw new Error('observer exception was lost');}catch(error){if(!error.processResult)throw error;console.log(JSON.stringify(error.processResult));}`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',shell:false,windowsHide:true,timeout:10000});
 assert.equal(r.status,0,r.stderr);const observed=JSON.parse(r.stdout);assert.equal(observed.processState,'closed');assert.equal(observed.errorStage,'stdout-observer');
 assert.ok(observed.error.includes(thrown==='error'?'SYNTHETIC observer error':thrown==='string'?'SYNTHETIC observer string':thrown));
 return {thrown,processState:observed.processState,error:observed.error};
});

for(const operation of ['install','rollback'])await test('mh-shared-root-'+operation,'A shared skill-root writer gate blocks mutation and preserves the other writer lock',async()=>{
 const f=await installFixture('mh-shared-root-'+operation);const plan=await previewInstall(f.options);
 const applied=operation==='rollback'?await applyInstall(plan):null;
 await fs.mkdir(f.options.skillRoot,{recursive:true});const busy=path.join(f.options.skillRoot,'.writer-lock');await fs.mkdir(busy);
 const before=await publicSnapshot(f.dir);
 await assert.rejects(operation==='install'?applyInstall(plan):rollbackInstall(applied.rollbackManifest),/Another writer|holds|lock/i);
 assert.deepEqual(await publicSnapshot(f.dir),before);assert.ok((await fs.stat(busy)).isDirectory());
 return {operation,sharedGate:true,unchanged:true};
});

await test('mh-binding-shape','Original execution identity requires explicit valid host, mode and matching executor',async()=>{
 const {validateExecutionBinding}=await import('../lib/hosts.mjs');
 const bad=[null,[],{host:'claude-code',executor:'claude-code-native'},{executor:'undefined-native'},{host:'constructor',mode:'native',executor:'constructor-native'},{host:'codex',mode:'other',executor:'codex-other'}];
 for(const value of bad)assert.throws(()=>validateExecutionBinding(value),value===null||Array.isArray(value)?/expected object/:/host|mode|binding|executor/i);
 return {invalidBindingsRejected:bad.length};
});

await test('mh-draft-default-current','New drafts explicitly use host-aware current contract with reviewed Codex default',async()=>{
 const project=path.join(root,'mh-default');await fs.mkdir(project);const id='synthetic-mh-default';
 const d=await engine.draft(project,id,'SYNTHETIC host policy default','general');
 const c=await readJson(path.join(d.directory,'contract.json'));
 assertRecord(c,'contract');assert.deepEqual(c.execution,{allowedHosts:['codex'],defaultHost:'codex'});
 return {schemaVersion:c.schemaVersion,execution:c.execution};
});

await test('mh-draft-explicit-host','New draft API binds explicit host and reviewed alternatives',async()=>{
 const project=path.join(root,'mh-draft-host');await fs.mkdir(project);const id='synthetic-mh-draft-host';
 const d=await engine.draft(project,id,'SYNTHETIC selected host','general',{host:'claude-code',allowHosts:['deepseek-harness']});
 const c=await readJson(path.join(d.directory,'contract.json'));
 assert.ok(c.execution,'Draft must include its reviewed execution policy.');assert.equal(c.execution.defaultHost,'claude-code');assert.deepEqual(c.execution.allowedHosts,['claude-code','deepseek-harness']);
 return c.execution;
});

for(const host of ['codex','claude-code','deepseek-harness'])for(const documents of [true])await test('mh-native-life-'+host+'-'+('current'),'Each native host completes the same approved lifecycle with its original bound identity',async()=>{
 const f=await fixture('mh-native-'+host+'-'+(documents?'l':'o'),{documents,two:false,execution:{allowedHosts:[host],defaultHost:host}});await approve(f);
 const r=await engine.begin(f.project,f.id,'a',{host});
 assert.equal(r.executionBinding.host,host);assert.equal(r.executionBinding.executor,host+'-native');
 if(documents)assert.ok(r.submission.args.includes(host+'-native'));
 await emit(f,'a');const facts={runId:r.runId,executor:host+'-native',reference:'SYNTHETIC native '+host,result:'ok'};
 const closed=await submitFacts(f.project,f.id,'a',facts);assert.equal(closed.phase,'pending_acceptance');
 await verifyFacts(f.project,f.id,'a');const accepted=(await engine.status(f.project,f.id)).tasks.a.acceptedAt;
 const replay=await submitFacts(f.project,f.id,'a',facts);assert.equal(replay.replayed,true);
 const status=await engine.status(f.project,f.id);assert.equal(status.phase,'verified');assert.equal(status.tasks.a.acceptedAt,accepted);
 return {host,documents,executor:r.executionBinding.executor,phase:status.phase};
});

for(const host of ['codex','claude-code','deepseek-harness'])await test('mh-install-profile-'+host,'Explicit host profile uses its fixed instruction filename and restores original bytes',async()=>{
 const dir=path.join(root,'mh-install-'+host),home=path.join(dir,'host-home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});
 const instructions=path.join(home,host==='claude-code'?'CLAUDE.md':'AGENTS.md');const bytes=Buffer.from('SYNTHETIC original instructions\r\nno-final-newline');await fs.writeFile(instructions,bytes);
 const plan=await previewInstall({host,hostHome:home,skillRoot:skills});assertRecord(plan,'install-plan');assert.equal(plan.host,host);
 assert.ok(plan.changes.some(c=>c.target===instructions&&c.kind==='append-rule'));
 const applied=await applyInstall(plan);assert.equal(applied.status,'installed');const again=await previewInstall({host,hostHome:home,skillRoot:skills});assert.equal(again.changes.length,0);
 await rollbackInstall(applied.rollbackManifest);assert.deepEqual(await fs.readFile(instructions),bytes);
 return {host,schemaVersion:plan.schemaVersion,byteExact:true};
});

await test('mh-English-handoff','Maintained pending-review handoff prose is English while preserving full navigation',async()=>{
 const f=await fixture('mh-english-handoff',{two:false,});
 const r=command(['handoff','--project',f.project,'--id',f.id]);assert.equal(r.code,0,r.stderr);
 assert.ok(!/\p{Script=Han}/u.test(r.stdout));assert.ok(r.stdout.includes(f.review.digest));assert.ok(r.stdout.includes('contract.json'));
 return {english:true,digest:f.review.digest};
});

for(const kind of ['target-home','source-home'])await test('mh-install-overlap-'+kind,'Reject an instruction home inside the portable source or target skill before any write',async()=>{
 const f=await installFixture('mh-overlap-'+kind);const hostHome=kind==='target-home'?path.join(f.target,'nested-home'):path.join(source,'synthetic-home-must-not-exist');
 const before=await publicSnapshot(f.dir),sourceBefore=await publicSnapshot(source);
 await assert.rejects(previewInstall({host:'claude-code',hostHome,skillRoot:f.skills}),/overlap|inside|source|instruction home/i);
 assert.deepEqual(await publicSnapshot(f.dir),before);assert.deepEqual(await publicSnapshot(source),sourceBefore);
 return {kind,refusedBeforeWrite:true};
});

await test('install-current-format-binding','Changing only the current format discriminator cannot authorize rollback',async()=>{const f=await installedFixture('format-binding'),record=structuredClone(f.record);record.schemaVersion=99;sealSyntheticManifest(record);await writeJson(f.done.rollbackManifest,record);const before=await publicSnapshot(f.dir);await assert.rejects(rollbackInstall(f.done.rollbackManifest));assert.deepEqual(await publicSnapshot(f.dir),before);return{beforeRestoreRefused:true};});

const mhHosts=['codex','claude-code','deepseek-harness'];

const mhChild=path.join(source,'scripts/tests/helpers/host-child.mjs');

const mhPolicy={allowedHosts:mhHosts,defaultHost:'codex'};

const mhFacts=(run,host,extra={})=>({runId:run.runId,executor:host+'-native',reference:'SYNTHETIC actual local regression',result:'ok',...extra});

function sealSyntheticManifest(record){const{bindingDigest,status,...bound}=record;record.bindingDigest=hash(canonicalJson(bound));return record;}

async function mhFinish(f,step,host){const run=await engine.begin(f.project,f.id,step,{host});await emit(f,step);await submitFacts(f.project,f.id,step,mhFacts(run,host));return verifyFacts(f.project,f.id,step);}

await test('mh-policy-invalid','Current contract rejects malformed, duplicate, undeclared and prototype-like host policies',async()=>{
 const f=await fixture('mh-policy-invalid',{two:false});
 const invalid=[null,[],{}, {allowedHosts:[],defaultHost:'codex'}, {allowedHosts:['codex','codex'],defaultHost:'codex'}, {allowedHosts:['codex'],defaultHost:'claude-code'}, {allowedHosts:['constructor'],defaultHost:'constructor'}, {allowedHosts:['__proto__'],defaultHost:'__proto__'}, {allowedHosts:[0],defaultHost:0}, {allowedHosts:['codex']}, {allowedHosts:'codex',defaultHost:'codex'}];
 for(const execution of invalid)assert.throws(()=>validateContract({...f.c,execution}),/execution|host|policy/i);
 await approve(f);const before=await engine.status(f.project,f.id);await assert.rejects(engine.begin(f.project,f.id,'a',{host:'claude-code'}),/not allowed/);await assert.rejects(engine.begin(f.project,f.id,'a',{host:'constructor'}),/Unknown host/);
 const after=await engine.status(f.project,f.id);assert.equal(after.activeExecutions.length,0);assert.deepEqual(after.events,before.events);assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.approval,before.approval);return {invalid:invalid.length,noBegin:true};
});

for(const host of mhHosts)await test('mh-draft-cli-'+host,'Public draft flags preserve the selected default and reviewed alternatives',async()=>{
 const project=path.join(root,'mh-draft-cli-'+host);await fs.mkdir(project);const id='synthetic-draft-cli';
 const r=command(['draft','--project',project,'--id',id,'--goal','SYNTHETIC CLI draft','--domain','general','--host',host,'--allow-host','codex','--allow-host','deepseek-harness']);assert.equal(r.code,0,r.stderr);
 const c=await readJson(path.join(cliData(r.stdout).directory,'contract.json'));assertRecord(c,'contract');assert.equal(c.execution.defaultHost,host);assert.deepEqual(c.execution.allowedHosts,[...new Set([host,'codex','deepseek-harness'])]);return c.execution;
});

for(const host of mhHosts)for(const documents of [true])await test('mh-executor-binding-'+host+'-'+('current'),'Every original native run refuses all five other executors and preserves identical replay',async()=>{
 const f=await fixture('mh-bind-'+host+'-'+(documents?'l':'o'),{documents,two:false,execution:mhPolicy});await approve(f);const run=await engine.begin(f.project,f.id,'a',{host});
 const before=await engine.status(f.project,f.id);
 for(const other of mhHosts)for(const mode of ['native','cli'])if(other!==host||mode!=='native')await assert.rejects(submitFacts(f.project,f.id,'a',mhFacts(run,host,{executor:other+'-'+mode,...(mode==='cli'?{process:syntheticClosedProcess(),logs:[]}: {})})),/executor|host|binding|match/i);
 const after=await engine.status(f.project,f.id);assert.deepEqual(after.events,before.events);assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.activeExecutions,before.activeExecutions);
 const ctx=await engine.taskContext(f.project,f.id,'a',{host:mhHosts.find(x=>x!==host)});assert.equal(ctx.global.execution.host,host);assert.ok(ctx.workflow.submission.args.includes(host+'-native'));assert.ok(ctx.workflow.submission.args.includes(run.runId));
 await emit(f,'a');const facts=mhFacts(run,host,{summary:'SYNTHETIC preserved extra fact',extensions:{custom:{nested:[1,'two']}}});await submitFacts(f.project,f.id,'a',facts);await verifyFacts(f.project,f.id,'a');
 const accepted=(await engine.status(f.project,f.id)).tasks.a.acceptedAt;assert.equal((await submitFacts(f.project,f.id,'a',facts)).replayed,true);await assert.rejects(submitFacts(f.project,f.id,'a',{...facts,summary:'different'}),/conflict/i);assert.equal((await engine.status(f.project,f.id)).tasks.a.acceptedAt,accepted);
 return {host,documents,otherExecutorsRefused:5,originalContext:true,replayPreserved:true};
});

for(const host of mhHosts)for(const drift of ['input','policy','unknown-version','malformed-policy','dependency'])await test('mh-stale-closure-'+host+'-'+drift,'Original host identity survives stale input, policy, version and dependency combinations',async()=>{
 const f=await fixture('mh-stale-'+host+'-'+drift,{two:drift==='dependency',execution:mhPolicy});await approve(f);if(drift==='dependency')await mhFinish(f,'a',host);const step=drift==='dependency'?'b':'a',run=await engine.begin(f.project,f.id,step,{host});
 if(drift==='input')await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift');
 else if(drift==='dependency')await emit(f,'a','SYNTHETIC changed dependency');
 else {const c=await readJson(path.join(f.directory,'contract.json'));if(drift==='unknown-version')c.schemaVersion=99;else if(drift==='malformed-policy')c.execution=null;else c.execution={allowedHosts:['codex'],defaultHost:'codex'};await writeJson(path.join(f.directory,'contract.json'),c);}
 const ctx=await engine.taskContext(f.project,f.id,step,{host:'codex'});assert.ok(ctx.activeExecutions.some(x=>x.runId===run.runId));if(['unknown-version','malformed-policy'].includes(drift)){assert.equal(ctx.kind,'recovery-context');assert.equal(ctx.approvalValid,false);assert.equal(ctx.activeExecutions.find(x=>x.runId===run.runId).executionBinding.executor,host+'-native');}else assert.ok(ctx.workflow.submission.args.includes(host+'-native'));assert.equal(ctx.canBegin,false);
 const facts=mhFacts(run,host,{result:'failed'}),closed=await submitFacts(f.project,f.id,step,facts);assert.equal(closed.executionClosed,true);assert.equal(closed.acceptedForVerification,false);assert.equal(closed.phase,'stale');assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,0);assert.equal((await submitFacts(f.project,f.id,step,facts)).replayed,true);
 await assert.rejects(verifyFacts(f.project,f.id,step),/pending|approved|valid|Current format|policy/i);return {host,drift,originalRunId:run.runId,stale:true};
});

for(const host of mhHosts)await test('mh-host-transfer-'+host,'A reviewed alternative may start only after the prior host closes and its dependency verifies',async()=>{
 const other=mhHosts[(mhHosts.indexOf(host)+1)%3],f=await fixture('mh-transfer-'+host,{execution:mhPolicy});await approve(f);const run=await engine.begin(f.project,f.id,'a',{host});
 await assert.rejects(engine.begin(f.project,f.id,'b',{host:other}),/active|executing|writing|Dependenc/i);await assert.rejects(verifyFacts(f.project,f.id,'a'),/active|execution|pending/i);await emit(f,'a');await submitFacts(f.project,f.id,'a',mhFacts(run,host));
 await assert.rejects(engine.begin(f.project,f.id,'b',{host:other}),/Dependenc/i);await verifyFacts(f.project,f.id,'a');await mhFinish(f,'b',other);assert.equal((await engine.status(f.project,f.id)).phase,'verified');return {from:host,to:other,verifiedDependency:true};
});

for(const host of ['claude-code','deepseek-harness'])await test('mh-resolver-'+host,'Resolve native, JavaScript and official npm shims without executing a shell or escaping a package',async()=>{
 const {resolveHostExecutable}=await import('../lib/hosts.mjs');const dir=path.join(root,'mh-resolve-'+host+' 空 间');await fs.mkdir(dir);const binary=host==='claude-code'?'claude':'dsh',packageName=host==='claude-code'?'@anthropic-ai/claude-code':'@deepseek-ai/dsh';
 const shim=path.join(dir,binary+'.cmd');await fs.writeFile(shim,'SYNTHETIC SHIM MUST NEVER EXECUTE');const pkg=path.join(dir,'node_modules',...packageName.split('/'));await fs.mkdir(pkg,{recursive:true});const file=path.join(pkg,'lib','entry.js');await fs.mkdir(path.dirname(file));await fs.writeFile(file,'// SYNTHETIC not executed\n');const metadata=path.join(pkg,'package.json');
 await writeJson(metadata,{name:packageName,bin:{[binary]:'lib/entry.js'}});assert.deepEqual(await resolveHostExecutable(host,shim),{command:process.execPath,prefix:[await fs.realpath(file)]});
 assert.deepEqual(await resolveHostExecutable(host,file),{command:process.execPath,prefix:[file]});
 const native=path.join(dir,binary+'.exe');await fs.writeFile(native,'SYNTHETIC native not executed');assert.deepEqual(await resolveHostExecutable(host,native),{command:native,prefix:[]});
 assert.deepEqual(await resolveHostExecutable(host,undefined,{platform:'win32',pathValue:dir}),{command:native,prefix:[]});await fs.unlink(native);
 assert.deepEqual(await resolveHostExecutable(host,undefined,{platform:'win32',pathValue:dir}),{command:process.execPath,prefix:[await fs.realpath(file)]});
 for(const bin of ['../outside.js',file,'missing.js','lib/shell.cmd']){await writeJson(metadata,{name:packageName,bin:{[binary]:bin}});await assert.rejects(resolveHostExecutable(host,shim));}
 await writeJson(metadata,{name:'synthetic-wrong-package',bin:{[binary]:'lib/entry.js'}});await assert.rejects(resolveHostExecutable(host,shim),/identity/i);
 await writeJson(metadata,{name:packageName,bin:{[binary]:'lib/entry.js'}});const external=path.join(dir,'outside.js');await fs.writeFile(external,'SYNTHETIC outside');await fs.rename(file,file+'.original');await fs.symlink(external,file,'file');await assert.rejects(resolveHostExecutable(host,shim),/escapes/);
 await assert.rejects(resolveHostExecutable(host,path.join(dir,'absent.exe')),/not found/);await assert.rejects(resolveHostExecutable(host,dir),/regular file/);return {host,spacesAndUnicode:true,shellExecuted:false,invalidEntries:8};
});

for(const host of mhHosts)await test('mh-run-entry-'+host,'Invalid or unavailable explicit executable never creates an execution',async()=>{const f=await fixture('mh-entry-'+host,{two:false,execution:mhPolicy});await approve(f);const before=await publicSnapshot(f.project);await assert.rejects(mhRun(f.project,f.id,'a',{host,executable:123}));await assert.rejects(mhRun(f.project,f.id,'a',{host,executable:path.join(f.project,'missing-agent.exe')}),/not found/);assert.deepEqual(await publicSnapshot(f.project),before);return{host,noBegin:true};});

for(const outputMode of ['chunked','no-newline'])await test('mh-dsh-stream-'+outputMode,'Valid DSH UTF8 stdout and unrelated stderr complete without changing raw process evidence',async()=>{
 const f=await fixture('mh-stream-'+outputMode,{two:false,execution:{allowedHosts:['deepseek-harness'],defaultHost:'deepseek-harness'}});await approve(f);
 await writeJson(path.join(f.project,'host-child-expectations.json'),{host:'deepseek-harness',cwd:f.project,outputMode,stderrNoise:true});const done=await mhRun(f.project,f.id,'a',{host:'deepseek-harness',executable:mhChild});assert.equal(done.phase,'pending_acceptance');const receipt=await readJson(done.receipt.path);assert.equal(receipt.process.hostProtocol.ok,true);assert.equal(receipt.process.exitCode,0);assert.ok((await fs.readFile(receipt.reference,'utf8')).includes('SYNTHETIC stderr diagnostic'));
 await verifyFacts(f.project,f.id,'a');return {outputMode,rawExit:0,stderrPreserved:true};
});

await test('mh-dsh-byte-decoder','Deterministic byte-by-byte UTF8 and terminal-order checks exercise the DSH parser independently of OS chunk merging',async()=>{
 const {hostOutputObserver}=await import('../lib/hosts.mjs');const stream=[{type:'session',sessionId:'SYNTHETIC-会话'},{type:'status',phase:'turn_end',reason:{kind:'completed'}},{type:'final',text:'SYNTHETIC 中文🙂'}].map(JSON.stringify).join('\n');
 const observer=hostOutputObserver('deepseek-harness');for(const byte of Buffer.from(stream))observer.write(Buffer.from([byte]));const good=observer.finish();assert.equal(good.ok,true);assert.deepEqual(observer.finish(),good);
 const bad=hostOutputObserver('deepseek-harness');bad.write(Buffer.from(stream+'\n'+JSON.stringify({type:'text',text:'after final'})+'\n'));assert.equal(bad.finish().ok,false);return {byteByByte:true,events:good.events,afterFinalRefused:true};
});

for(const mode of ['kill-false','kill-throw'])await test('mh-observer-close-'+mode,'Observer errors and failed termination requests still require actual close',async()=>{
 return fakeProcess(mode,async control=>{let settled=false;const p=runProcess(process.execPath,[],{cwd:root,log:path.join(root,'log-observer-'+mode),stdoutObserver(){throw null;}}).then(value=>{settled=true;return {value};},error=>{settled=true;return {error};});await control.wait();
 control.stdout(Buffer.from('SYNTHETIC observer trigger'));await pause(20);assert.equal(settled,false);assert.ok(control.state().kills>0);control.close(7);const result=await bounded(p);assert.equal(result.error.processResult.processState,'closed');assert.equal(result.error.processResult.errorStage,'stdout-observer');assert.ok(result.error.processResult.controlErrors.length);assert.equal(control.state().unhandled.length,0);return {mode,actualClose:true,observedError:'null'};});
});

for(const host of mhHosts)for(const fault of ['spawn','prelaunch','log-open','timeout','log-close','publication'])await test('mh-run-fault-'+host+'-'+fault,'Each host preserves original identity and actual close across shared supervisor and publication failures',async()=>{
 const f=await fixture('mh-fault-'+host+'-'+fault,{two:false,execution:mhPolicy});await approve(f);await writeJson(path.join(f.project,'host-child-expectations.json'),{host,cwd:f.project});
 if(fault==='spawn'){
  const result=await fakeProcess('spawn-throw',()=>captureOutcome(mhRun(f.project,f.id,'a',{host,executable:mhChild})));const st=await engine.status(f.project,f.id);assert.equal(st.activeExecutions.length,0);const receipt=await readJson(st.tasks.a.receipt.path);assert.equal(receipt.executor,host+'-cli');assert.equal(receipt.process.processState,'not-started');assert.equal(receipt.result,'failed');return {host,fault,closed:true};
 }
 if(fault==='prelaunch'||fault==='log-open'){
  const x=await withLaunchBoundary(f,async()=>fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift'),()=>captureOutcome(mhRun(f.project,f.id,'a',{host,executable:mhChild})),{openFault:fault==='log-open'});assert.equal(x.spawns,0);assert.equal(x.result.error.processResult.processState,'not-started');assert.equal(x.result.error.executionClosed,true);return {host,fault,spawns:0};
 }
 if(fault==='timeout')return fakeProcess('kill-false',async control=>{let settled=false;const p=mhRun(f.project,f.id,'a',{host,executable:mhChild,timeoutMs:10}).then(value=>{settled=true;return value;});await control.wait();await pause(20);assert.equal(settled,false);assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,1);control.close(7);const closed=await bounded(p),receipt=await readJson(closed.receipt.path);assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,7);assert.equal(receipt.process.code,124);assert.equal(receipt.executor,host+'-cli');return {host,fault,realExit:7,policyCode:124};});
 if(fault==='log-close'){
  const observation=await patchMethod(fs,'open',old=>async function(file,...a){const h=await old.call(this,file,...a);return path.dirname(String(file))===f.directory&&path.basename(String(file)).startsWith('execution-')?wrapHandle(h,{close:async()=>{await h.close();throw new Error('SYNTHETIC host log close');}}):h;},()=>engine.run(f.project,f.id,'a',{host,executable:mhChild}));const closed=await closeKnownLeafObservation(engine,f.project,f.id,'a',observation,'SYNTHETIC fixed host-child leaf actually ended; log fault scope has ended');const receipt=await readJson(closed.receipt.path);assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,0);assert.equal(receipt.result,'failed');assert.match(receipt.process.error,/host log close/);return {host,fault,actualClose:true};
 }
 let published=false;const outcome=await patchMethod(fs,'rename',old=>async function(from,to,...a){if(published&&key(to)===key(path.join(f.directory,'state.json')))throw new Error('SYNTHETIC state after publication');return old.call(this,from,to,...a);},()=>patchMethod(fs,'link',old=>async function(from,to,...a){const result=await old.call(this,from,to,...a);if(path.dirname(String(to))===f.directory&&path.basename(String(to)).startsWith('receipt-'))published=true;return result;},()=>captureOutcome(mhRun(f.project,f.id,'a',{host,executable:mhChild}))));
 assert.equal(published,true);assert.equal(outcome.ok,false);const facts=leafFactsFor(f);assert.match(outcome.error.message,/state after publication/);assert.equal(facts.process.processState,'closed');const before=await engine.status(f.project,f.id);assert.ok(before.activeExecutions.some(x=>x.runId===facts.runId));const final=path.join(f.directory,'receipt-'+facts.runId+'.json'),sha=await digest(final);const closed=await submitFacts(f.project,f.id,'a',facts);assert.equal(closed.executionClosed,true);assert.equal(await digest(final),sha);assert.equal((await submitFacts(f.project,f.id,'a',facts)).replayed,true);await verifyFacts(f.project,f.id,'a');return {host,fault,publicationRecovered:true};
});

for(const host of mhHosts)for(const kind of ['bom-crlf-unicode','home-equals-root','tampered','override','partial-source'])await test('mh-install-combination-'+host+'-'+kind,'Host installation combinations preserve bytes, identities, profile binding and failure diagnostics',async()=>{
 const dir=path.join(root,'mh-install-combo-'+host+'-'+kind),home=path.join(dir,'home'),skills=kind==='home-equals-root'?home:path.join(dir,'skills');await fs.mkdir(home,{recursive:true});const target=path.join(skills,'sciautoharness'),instructions=path.join(home,host==='claude-code'?'CLAUDE.md':'AGENTS.md');
 const bytes=Buffer.concat([Buffer.from([239,187,191]),Buffer.from('SYNTHETIC 原文\r\nno-final-newline')]);await fs.writeFile(instructions,bytes);const original=await fs.stat(instructions,{bigint:true});const options={host,hostHome:home,skillRoot:skills};
 if(kind==='override'){await fs.writeFile(path.join(home,host==='codex'?'AGENTS.override.md':host==='claude-code'?'CLAUDE.local.md':'AGENTS.local.md'),'SYNTHETIC local rule');const before=await publicSnapshot(dir);await assert.rejects(previewInstall(options),/shadow|local|review/i);assert.deepEqual(await publicSnapshot(dir),before);return {host,kind,noWrite:true};}
 const plan=await previewInstall(options);
 if(kind==='partial-source'){
  const change=plan.changes.find(c=>c.source);const result=await patchMethod(fs,'readFile',old=>async function(file,...a){if(key(file)===key(change.source)&&await fs.stat(path.join(home,'harness-install-backups')).then(()=>true,()=>false))throw new Error('SYNTHETIC source read');return old.call(this,file,...a);},()=>captureOutcome(applyInstall(plan)));assert.equal(result.ok,false);assert.equal(result.error.recovery.stage,'write-targets');assert.equal(result.error.recovery.failedTarget,change.target);await fs.stat(result.error.recovery.manifest);return {host,kind,logicalTarget:change.target};
 }
 const applied=await applyInstall(plan);assert.deepEqual((await fs.readFile(instructions)).subarray(0,bytes.length),bytes);assert.equal((await fs.stat(instructions,{bigint:true})).ino,original.ino);
 if(kind==='tampered'){
  const record=await readJson(applied.rollbackManifest);for(const field of ['host','hostHome','instructionFile','targetSkill']){const forged=structuredClone(record);forged[field]=field==='host'?mhHosts.find(h=>h!==host):field==='instructionFile'?(record.instructionFile==='AGENTS.md'?'CLAUDE.md':'AGENTS.md'):path.join(dir,'other');const{bindingDigest,status,...bound}=forged;forged.bindingDigest=hash(canonicalJson(bound));assertRecord(forged,'install-record');const file=applied.rollbackManifest;await writeJson(file,forged);const stable=await publicSnapshot(dir);await assert.rejects(rollbackInstall(file),error=>{assert.equal(error.recovery.stage,'manifest-preflight');assert.match(error.cause.message,/original plan|fixed|profile|backup|storage/i);return true;});assert.deepEqual(await publicSnapshot(dir),stable);await writeJson(file,record);}
 }
 assert.equal((await applyInstall(await previewInstall(options))).status,'already-installed');await rollbackInstall(applied.rollbackManifest);assert.deepEqual(await fs.readFile(instructions),bytes);assert.equal((await fs.stat(instructions,{bigint:true})).ino,original.ino);assert.equal((await readJson(applied.rollbackManifest)).status,'rolled-back');return {host,kind,byteAndIdentityExact:true};
});

for(const scenario of ['reverse','duplicate','alias','second-busy','cleanup-success','cleanup-failure'])await test('mh-root-locks-'+scenario,'All-root locking has canonical order, partial acquisition recovery and complete cleanup diagnostics',async()=>{
 const {lockedRoots}=await import('../lib/files.mjs');const dir=path.join(root,'mh-roots-'+scenario),a=path.join(dir,'a'),b=path.join(dir,'b');await fs.mkdir(a,{recursive:true});await fs.mkdir(b);const called=[];let actions=0;
 if(scenario==='second-busy')await fs.mkdir(path.join(b,'.writer-lock'));const alias=path.join(dir,'alias');if(scenario==='alias')await fs.symlink(a,alias,'junction');
 const badCleanup=scenario.startsWith('cleanup-');const outcome=await patchMethod(fs,'mkdir',old=>async function(file,...args){if(path.basename(String(file))==='.writer-lock')called.push(key(file));return old.call(this,file,...args);},()=>patchMethod(fs,'rmdir',old=>async function(file,...args){if(badCleanup&&path.basename(String(file))==='.writer-lock')throw new Error('SYNTHETIC cleanup '+path.dirname(String(file)));return old.call(this,file,...args);},()=>captureOutcome(lockedRoots(scenario==='alias'?[b,a,alias]:scenario==='duplicate'?[b,a,a]:[b,a],async()=>{actions++;if(scenario==='cleanup-failure')throw new Error('SYNTHETIC action failure');return {actual:'SYNTHETIC completed'};}))));
 assert.deepEqual(called,[key(path.join(a,'.writer-lock')),key(path.join(b,'.writer-lock'))]);
 if(scenario==='second-busy'){assert.equal(actions,0);assert.equal(outcome.ok,false);await assert.rejects(fs.stat(path.join(a,'.writer-lock')),{code:'ENOENT'});await fs.stat(path.join(b,'.writer-lock'));assert.equal(outcome.error.lockRoots[0].released,true);}
 else if(badCleanup){const e=outcome.error;assert.equal(e.code,'LOCK_CLEANUP_FAILED');assert.equal(e.cleanupErrors.length,2);assert.equal(e.lockRoots.length,2);if(scenario==='cleanup-success')assert.deepEqual(e.completedResult,{actual:'SYNTHETIC completed'});else assert.match(e.actionError.message,/action failure/);assert.ok(e.lockRoots.every(x=>x.acquired&&!x.released));}
 else{assert.equal(actions,1);assert.equal(outcome.ok,true);await assert.rejects(fs.stat(path.join(a,'.writer-lock')),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(b,'.writer-lock')),{code:'ENOENT'});}
 return {scenario,actions,canonicalLocks:called.length};
});

await test('mh-shared-homes-concurrency','Two real in-flight installation operations with different host homes serialize on the shared skill root',async()=>{
 const dir=path.join(root,'mh-concurrent'),homeA=path.join(dir,'a-home'),homeB=path.join(dir,'b-home'),skills=path.join(dir,'z-skills');await fs.mkdir(homeA,{recursive:true});await fs.mkdir(homeB);await fs.mkdir(skills);
 const optionsA={host:'codex',hostHome:homeA,skillRoot:skills},optionsB={host:'claude-code',hostHome:homeB,skillRoot:skills},planA=await previewInstall(optionsA),planB=await previewInstall(optionsB);let release,hit=false;const barrier=new Promise(resolve=>{release=resolve;});
 const result=await patchMethod(fs,'writeFile',old=>async function(file,...args){if(!hit&&key(file).startsWith(key(path.join(homeA,'harness-install-backups'))+path.sep)&&/^rollback\.json\..+\.tmp$/.test(path.basename(String(file)))&&JSON.parse(String(args[0])).status==='prepared'){hit=true;await barrier;}return old.call(this,file,...args);},async()=>{
  let firstFinished=false;
  const first=captureOutcome(applyInstall(planA)).then(outcome=>{
   firstFinished=true;
   return outcome;
  });
  let coordination,installation;
  try{
   coordination=await captureOutcome((async()=>{
    for(let n=0;n<200&&!hit&&!firstFinished;n++)await pause(5);
    if(!hit)return false;
    const before=await publicSnapshot(homeB);
    await assert.rejects(applyInstall(planB),/writer|holds|lock/i);
    assert.deepEqual(await publicSnapshot(homeB),before);
    await assert.rejects(fs.stat(path.join(homeB,'.writer-lock')),{code:'ENOENT'});
    await fs.stat(path.join(skills,'.writer-lock'));
    return true;
   })());
  }finally{
   release();
   installation=await first;
  }
  if(!installation.ok){
   if(!coordination.ok){
    const error=new AggregateError([installation.error,coordination.error],
     `${installation.error.message}; coordination also failed: ${coordination.error.message}`,
     {cause:installation.error});
    if(installation.error.recovery)error.recovery=installation.error.recovery;
    throw error;
   }
   throw installation.error;
  }
  if(!coordination.ok)throw coordination.error;
  assert.equal(coordination.value,true,'The first installation did not reach the prepared journal barrier during coordination');
  return installation.value;
 });
 assert.equal(result.status,'installed');await assert.rejects(applyInstall(planB),/changed|preview/i);const second=await applyInstall(await previewInstall(optionsB));assert.equal(second.changedFiles,1);await rollbackInstall(second.rollbackManifest);await rollbackInstall(result.rollbackManifest);await assert.rejects(fs.stat(path.join(skills,'sciautoharness')),{code:'ENOENT'});return {differentHomes:true,sharedRoot:true,oldPreviewRefused:true,completeLifecycle:true};
});

for(const host of mhHosts)await test('mh-cli-binding-replay-'+host,'CLI receipts reject every other host/mode and preserve full closed-run replay after policy drift',async()=>{
 const f=await fixture('mh-cli-binding-'+host,{two:false,execution:mhPolicy});await approve(f);await writeJson(path.join(f.project,'host-child-expectations.json'),{host,cwd:f.project});const done=await mhRun(f.project,f.id,'a',{host,executable:mhChild});const receipt=await readJson(done.receipt.path),original=receipt.callerFacts??receipt;
 const facts={runId:receipt.runId,executor:host+'-cli',reference:receipt.reference,result:receipt.result,process:receipt.process,logs:receipt.logs,outcome:receipt.outcome,...(receipt.businessEnd?{businessEnd:receipt.businessEnd}:{})};
 for(const other of mhHosts)for(const mode of ['native','cli'])if(other!==host||mode!=='cli')await assert.rejects(submitFacts(f.project,f.id,'a',{...facts,executor:other+'-'+mode}),/executor|conflict|binding/i);
 await verifyFacts(f.project,f.id,'a');const accepted=(await engine.status(f.project,f.id)).tasks.a.acceptedAt;const sha=await digest(done.receipt.path);assert.equal((await submitFacts(f.project,f.id,'a',facts)).replayed,true);assert.equal((await engine.status(f.project,f.id)).tasks.a.acceptedAt,accepted);
 const c=await readJson(path.join(f.directory,'contract.json'));c.execution={allowedHosts:['codex'],defaultHost:'codex'};c.revision++;await writeJson(path.join(f.directory,'contract.json'),c);const replay=await submitFacts(f.project,f.id,'a',facts);assert.equal(replay.replayed,true);assert.equal(await digest(done.receipt.path),sha);assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'stale');return {host,otherExecutorsRefused:5,closedReplay:true,staleNoRebind:true};
});

for(const host of mhHosts)await test('mh-native-cli-selection-'+host,'Actual public context and begin flags return the selected original inline executor',async()=>{
 const f=await fixture('mh-native-cli-'+host,{two:false,execution:mhPolicy});await approve(f);
 const context=command(['context','--project',f.project,'--id',f.id,'--task','a','--host',host]);assert.equal(context.code,0,context.stderr);const selected=cliData(context.stdout);assert.equal(selected.global.execution.host,host);assert.ok(selected.workflow.begin.args.includes(host));
 const started=command(['begin','--project',f.project,'--id',f.id,'--task','a','--host',host]);assert.equal(started.code,0,started.stderr);const run=cliData(started.stdout);assert.equal(run.executionBinding.executor,host+'-native');await emit(f,'a');const closed=command([...run.submission.args.slice(1),'--reference','SYNTHETIC real CLI native continuation','--result','ok']);assert.equal(closed.code,0,closed.stderr);assert.equal(cliData(closed.stdout).phase,'pending_acceptance');assert.equal((await verifyFacts(f.project,f.id,'a')).taskStatus,'verified');return {host,actualPublicFlags:true};
});

for(const host of mhHosts)await test('mh-conflicting-original-'+host,'Conflicting trusted current cache is refused before control writes',async()=>{const f=await fixture('mh-conflict-'+host,{two:false,execution:mhPolicy});await approve(f);const run=await engine.begin(f.project,f.id,'a',{host}),file=path.join(f.directory,'state.json'),state=await readJson(file),other=mhHosts.find(x=>x!==host);state.tasks.a.executionBinding={host:other,mode:'native',executor:other+'-native'};await writeJson(file,state);const before=await fs.readFile(file);let mkdirs=0;await patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},async()=>{await assert.rejects(engine.status(f.project,f.id),/Conflicting.*binding/);await assert.rejects(engine.taskContext(f.project,f.id,'a'),/Conflicting.*binding/);await assert.rejects(submitFacts(f.project,f.id,'a',envelope('submission',mhFacts(run,host))),/Conflicting.*binding/);});assert.equal(mkdirs,0);assert.deepEqual(await fs.readFile(file),before);return{host,conflictPreserved:true,mkdirs};});

for(const host of mhHosts)await test('mh-install-cli-'+host,'The actual public CLI previews the host profile, copies only the portable skill and rolls back exact original instructions',async()=>{
 const dir=path.join(root,'mh-install-cli-'+host),home=path.join(dir,'home'),skills=path.join(dir,'skills'),project=path.join(dir,'project');await fs.mkdir(home,{recursive:true});await fs.mkdir(project);const instruction=path.join(home,host==='claude-code'?'CLAUDE.md':'AGENTS.md'),bytes=Buffer.from('SYNTHETIC original CLI instruction\r\nno final newline');await fs.writeFile(instruction,bytes);
 const file=path.join(dir,'plan.json'),preview=command(['install-preview','--host',host,'--host-home',home,'--skill-root',skills,'--out',file]);assert.equal(preview.code,0,preview.stderr);const plan=cliData(preview.stdout);assert.equal(plan.host,host);assert.equal(plan.changes.length,(await listFiles(source)).length+1);assert.ok(plan.changes.every(c=>c.target===instruction||['sciautoharness'].some(n=>key(c.target).startsWith(key(path.join(skills,n))+path.sep))));
 const installed=command(['install','--plan',file]);assert.equal(installed.code,0,installed.stderr);const applied=cliData(installed.stdout);assert.equal(applied.changedFiles,(await listFiles(source)).length+1);const files=await publicSnapshot(path.join(skills,'sciautoharness'));assert.equal(Object.keys(files).length,(await listFiles(source)).length);assert.ok(!Object.keys(files).some(x=>x.startsWith('.git')||x==='README.md'||x==='package.json'));
 const again=command(['install-preview','--host',host,'--host-home',home,'--skill-root',skills]);assert.equal(again.code,0,again.stderr);assert.equal(cliData(again.stdout).changes.length,0);const rolled=command(['rollback','--manifest',applied.rollbackManifest]);assert.equal(rolled.code,0,rolled.stderr);assert.deepEqual(await fs.readFile(instruction),bytes);await assert.rejects(fs.stat(path.join(skills,'sciautoharness')),{code:'ENOENT'});return {host,portableFiles:(await listFiles(source)).length,actualCLI:true,originalBytesRestored:true};
});

const rwRequest=(run,extra={})=>({runId:run.runId,reason:'SYNTHETIC correction',reference:'SYNTHETIC review issue',...extra});

const rwEvents=s=>s.events.filter(e=>e.type==='rework_requested');

for(const status of ['pending_acceptance','verified','stale'])await test('rw-state-'+status,'Explicit rework preserves original facts and invalidates accepted dependents',async()=>{
 const f=await fixture('rw-state-'+status.replaceAll('_','-'),{});await approve(f);
 const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');const submitted=await submit(f,'a',r);
 if(status!=='pending_acceptance'){await verifyFacts(f.project,f.id,'a');await finish(f,'b');}
 const prior=await engine.status(f.project,f.id),receipt=await fs.readFile(submitted.receipt.path);
 if(status==='stale')await fs.appendFile(path.join(f.project,'out/a.txt'),'SYNTHETIC drift');
 const st=await engine.rework(f.project,f.id,'a',rwRequest(r));assert.equal(st.taskStatus,'stale');
 const after=await engine.status(f.project,f.id),e=rwEvents(after)[0];
 assert.equal(after.approval.digest,prior.approval.digest);assert.equal(after.tasks.a.runId,r.runId);
 assert.deepEqual(e.previous.evidence,prior.tasks.a.evidence??[]);assert.equal(e.previous.acceptedAt,prior.tasks.a.acceptedAt??null);
 assert.deepEqual(await fs.readFile(submitted.receipt.path),receipt);
 if(status!=='pending_acceptance')assert.equal(after.tasks.b.status,'stale');
 const oldReplay=await submit(f,'a',r);assert.equal(oldReplay.acceptedForVerification,false);
 const next=await engine.begin(f.project,f.id,'a');let n=await engine.status(f.project,f.id);
 assert.notEqual(next.runId,r.runId);assert.equal(n.tasks.a.reworkOf.fromRunId,r.runId);assert.equal(n.tasks.a.lastAcceptance,undefined);
 const replay=await engine.rework(f.project,f.id,'a',rwRequest(r));assert.equal(replay.replayed,true);
 await assert.rejects(engine.rework(f.project,f.id,'a',rwRequest(r,{reason:'different'})),/Conflicting/);
 await submit(f,'a',r);n=await engine.status(f.project,f.id);assert.equal(n.tasks.a.runId,next.runId);assert.equal(n.tasks.a.status,'executing');assert.equal(rwEvents(n).length,1);
 await emit(f,'a','SYNTHETIC corrected');await submit(f,'a',next);await verifyFacts(f.project,f.id,'a');
 await engine.rework(f.project,f.id,'a',rwRequest(r));assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'verified');
 return{receiptPreserved:true,oldReplayNeverRevives:true,newRun:next.runId,priorAcceptedEvidence:e.previous.evidence.length};
});

await test('replan-pending-full-review','A complete replacement preserves pending work facts and original requirements, and requires a new direct user review',async()=>{
 const f=await fixture('replan-pending-full-review',{two:false});await approve(f);
 const original={goal:f.c.goal,permissions:structuredClone(f.c.permissions),deliverables:structuredClone(f.c.deliverables),tasks:structuredClone(f.c.tasks)};
 const oldReview=structuredClone(f.review),contractBytes=await fs.readFile(path.join(f.directory,'contract.json'));
 const phaseFile=path.join(f.directory,'phases/a.md'),phaseBytes=await fs.readFile(phaseFile);
 const masterBytes=await fs.readFile(path.join(f.directory,'HARNESS.md')),recoveryBytes=await fs.readFile(path.join(f.directory,'RECOVERY.md'));
 const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');const closed=await submit(f,'a',run),receiptBytes=await fs.readFile(closed.receipt.path);
 assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'pending_acceptance');
 await assert.rejects(prepareCurrentReview(f.project,f.id),/pending.acceptance|pending acceptance/i);
 const request=await engine.rework(f.project,f.id,'a',{runId:run.runId,reason:'SYNTHETIC feasibility assumption refuted; complete replacement required',reference:'SYNTHETIC evidence-led self-audit'});
 assert.equal(request.taskStatus,'stale');
 let state=await engine.status(f.project,f.id);const event=rwEvents(state).find(e=>e.requestId===request.requestId);
 assert.equal(event.previous.status,'pending_acceptance');assert.equal(event.fromRunId,run.runId);
 assert.equal(state.tasks.a.runId,run.runId);assert.equal(state.approval.digest,oldReview.digest);
 assert.deepEqual(await fs.readFile(closed.receipt.path),receiptBytes);
 const archive=path.join(f.project,'plan-history/revision-1');await fs.mkdir(archive,{recursive:true});
 await fs.writeFile(path.join(archive,'contract.json'),contractBytes);await fs.writeFile(path.join(archive,'phase.md'),phaseBytes);
 await fs.writeFile(path.join(archive,'HARNESS.md'),masterBytes);await fs.writeFile(path.join(archive,'RECOVERY.md'),recoveryBytes);
 await writeJson(path.join(archive,'execution-facts.json'),{synthetic:true,review:oldReview,runId:run.runId,reworkRequestId:request.requestId,receipt:closed.receipt});
 f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);
 await fs.writeFile(phaseFile,phaseBytes.toString('utf8')+'\nRevised method: SYNTHETIC replacement from refuted feasibility assumption; preserve the original objective, permissions and acceptance.\n');
 await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);
 state=await engine.status(f.project,f.id);
 assert.equal(state.phase,'pending_user_review');assert.equal(state.approval,null);assert.equal(state.tasks.a.status,'todo');
 assert.equal(state.review.revision,2);assert.notEqual(state.review.digest,oldReview.digest);assert.equal(state.activeExecutions.length,0);
 assert.ok(rwEvents(state).some(e=>e.requestId===request.requestId));
 assert.ok(state.events.some(e=>e.type==='execution_receipt'&&e.runId===run.runId));
 assert.equal(f.c.goal,original.goal);assert.deepEqual(f.c.permissions,original.permissions);
 assert.deepEqual(f.c.deliverables,original.deliverables);assert.deepEqual(f.c.tasks,original.tasks);
 assert.deepEqual(await fs.readFile(path.join(archive,'contract.json')),contractBytes);assert.deepEqual(await fs.readFile(path.join(archive,'phase.md')),phaseBytes);
 assert.deepEqual(await fs.readFile(closed.receipt.path),receiptBytes);
 await assert.rejects(engine.begin(f.project,f.id,'a'),/approval|review/i);
 await approve(f);const next=await engine.begin(f.project,f.id,'a');assert.notEqual(next.runId,run.runId);assert.notEqual(next.reviewDigest,oldReview.digest);
 await emit(f,'a','SYNTHETIC replacement result');await submit(f,'a',next);assert.equal((await verifyFacts(f.project,f.id,'a')).taskStatus,'verified');
 assert.deepEqual(await fs.readFile(closed.receipt.path),receiptBytes);
 return {pendingGuard:true,explicitReworkBeforeRevision:true,oldPlanAndReceiptPreserved:true,originalRequirementsPreserved:true,newApprovalRequired:true,newRunVerifiedSeparately:true};
});

await test('replan-install-target-guards','Inventory-derived target capacity retains duplicate, excessive and unknown-member refusals before writes',async()=>{
 const f=await installFixture('replan-target-guards'),plan=await previewInstall(f.options);
 const inventory=await readJson(path.join(source,'scripts/lib/source-inventory.json'));
 assert.equal(plan.changes.length,inventory.files.length+1);
 const before=await publicSnapshot(f.dir),checked=[];
 for(const mode of ['duplicate','excessive','unknown-member']){
  const forged=structuredClone(plan),index=forged.changes.findIndex(c=>c.role!=='instructions');
  assert.ok(index>=0);
  if(mode==='duplicate')forged.changes[index+1]=structuredClone(forged.changes[index]);
  if(mode==='excessive')forged.changes.push({...structuredClone(forged.changes[index]),target:path.join(f.target,'excessive-target.txt')});
  if(mode==='unknown-member'){forged.changes[index].relative='references/unknown-member.md';forged.changes[index].target=path.join(f.target,'references/unknown-member.md');forged.changes[index].source=path.join(source,'references/unknown-member.md');}
  forged.summary.changedFiles=forged.changes.length;
  const {digest:ignoredDigest,summary:ignoredSummary,...body}=forged;forged.digest=hash(canonicalJson(body));
  await assert.rejects(applyInstall(forged),mode==='unknown-member'?/unsupported value|canonical|member|binding/i:/Duplicate or excessive installation targets/);
  assert.deepEqual(await publicSnapshot(f.dir),before);checked.push(mode);
 }
 return{validCapacity:plan.changes.length,sourceMembers:inventory.files.length,checked,refusedBeforeTargetWrites:true};
});

for(const mode of ['todo','failed','active','wrong-run','approval','receipt-hash','receipt-json','receipt-missing','closure-conflict','binding-conflict'])await test(mode==='approval'?'rw-admin-approval':'rw-reject-'+mode,'Rework preserves original facts; approval loss permits administrative disposition only',async()=>{
 const f=await fixture('rw-reject-'+mode,{two:false,});await approve(f);let r={runId:'not-started'};
 if(mode!=='todo'){r=await engine.begin(f.project,f.id,'a');if(mode!=='active'){await emit(f,'a');await submit(f,'a',r,mode==='failed'?'failed':'ok');}}
 if(mode==='approval')await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift');
 const receipt=path.join(f.directory,'receipt-'+r.runId+'.json');
 if(mode==='receipt-hash')await fs.appendFile(receipt,' ');
 if(mode==='receipt-json')await fs.writeFile(receipt,'{');
 if(mode==='receipt-missing')await fs.rename(receipt,receipt+'.saved');
 if(mode==='closure-conflict'||mode==='binding-conflict'){
  const st=await readJson(path.join(f.directory,'state.json'));const e=st.events.find(e=>e.type==='execution_receipt');
  if(mode==='closure-conflict')st.events.push({...e});else e.reviewDigest='0'.repeat(64);
  await writeJson(path.join(f.directory,'state.json'),st);
 }
 if(mode==='binding-conflict'){const file=path.join(f.directory,'state.json'),bytes=await fs.readFile(file);await assert.rejects(engine.status(f.project,f.id),/Conflicting/);await assert.rejects(engine.rework(f.project,f.id,'a',rwRequest(r)),/Conflicting/);assert.deepEqual(await fs.readFile(file),bytes);return{rejected:mode,currentBytesPreserved:true};}
 const prior=await engine.status(f.project,f.id);
   if(mode==='approval'){const before=await fs.readFile(receipt),request=await engine.rework(f.project,f.id,'a',rwRequest(r)),state=await engine.status(f.project,f.id);assert.ok(request.requestId);assert.equal(state.approval,null);assert.equal(rwEvents(state)[0].administrative,true);assert.deepEqual(await fs.readFile(receipt),before);assert.equal(state.events.filter(e=>e.type==='begin').length,1);await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);await assert.rejects(engine.verify(f.project,f.id,'a'),/approval|approved/i);return{administrative:true,noNewExecution:true,approvalNotRestored:true};}
await assert.rejects(engine.rework(f.project,f.id,'a',rwRequest(mode==='wrong-run'?{runId:'wrong'}:r)));
 const after=await engine.status(f.project,f.id);assert.equal(rwEvents(after).length,0);assert.equal(after.tasks.a.runId,prior.tasks.a.runId);assert.deepEqual(after.activeExecutions,prior.activeExecutions);
 return{rejected:mode,originalRunPreserved:true};
});

await test('rw-dependency-invalid','Rework records repair while new begin still requires current verified dependencies',async()=>{
 const f=await fixture('rw-dependency',{});await approve(f);await finish(f,'a');const r=await engine.begin(f.project,f.id,'b');await emit(f,'b');await submit(f,'b',r);
 await fs.appendFile(path.join(f.project,'out/a.txt'),'SYNTHETIC drift');assert.equal((await engine.rework(f.project,f.id,'b',rwRequest(r))).taskStatus,'stale');
 await assert.rejects(engine.begin(f.project,f.id,'b'),/Dependencies/);return{registered:true,beginBlocked:true};
});

await test('rw-latest-failed-vs-accepted','A later rejected verify is distinct from the original valid accepted result',async()=>{
 const f=await fixture('rw-latest-failed',{two:false,});await approve(f);await finish(f,'a');const prior=await engine.status(f.project,f.id);
 await assert.rejects(verifyFacts(f.project,f.id,'a'));const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.status,'verified');assert.equal(after.tasks.a.lastAcceptance.status,'failed');
 await engine.rework(f.project,f.id,'a',rwRequest({runId:prior.tasks.a.runId}));const e=rwEvents(await engine.status(f.project,f.id))[0];
 assert.deepEqual(e.previous.evidence,prior.tasks.a.evidence);assert.equal(e.previous.acceptedAt,prior.tasks.a.acceptedAt);assert.equal(e.previous.lastAcceptance.status,'failed');
 return{acceptedEvidencePreserved:true,failedAttemptPreserved:true};
});

await test('rw-context-readonly','Context exposes current verify/rework and history without writing state',async()=>{
 const f=await fixture('rw-context',{two:false,});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);
 let bytes=await fs.readFile(path.join(f.directory,'state.json')),ctx=await engine.taskContext(f.project,f.id,'a');assert.ok(ctx.workflow.verify);assert.ok(ctx.workflow.rework);assert.deepEqual(await fs.readFile(path.join(f.directory,'state.json')),bytes);
 await engine.rework(f.project,f.id,'a',rwRequest(run));bytes=await fs.readFile(path.join(f.directory,'state.json'));ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.rework.fromRunId,run.runId);assert.equal(ctx.currentStatus,'stale');assert.deepEqual(await fs.readFile(path.join(f.directory,'state.json')),bytes);
 return{readOnly:true,actions:true,history:true};
});

await test('rw-receipt-consistent-read','Receipt facts and the expected hash must be observed from one stable file version',async()=>{
 const f=await fixture('rw-consistent-read',{two:false,});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');const sub=await submit(f,'a',run);
 const receipt=sub.receipt.path,changed={...await readJson(receipt),summary:'SYNTHETIC concurrent different receipt bytes'};let mutated=false;
 const mutate=async()=>{if(!mutated){mutated=true;await fs.writeFile(receipt,JSON.stringify(changed));}};
 const originalRead=fs.readFile,originalOpen=fs.open,key=p=>path.resolve(String(p));
 await patchMethod(fs,'readFile',()=>async function(file,...rest){const bytes=await originalRead.call(this,file,...rest);if(key(file)===key(receipt))await mutate();return bytes;},async()=>{
  await patchMethod(fs,'open',()=>async function(file,...rest){const h=await originalOpen.call(this,file,...rest);if(key(file)===key(receipt)&&rest[0]==='r'){const read=h.readFile.bind(h);h.readFile=async(...a)=>{const bytes=await read(...a);await mutate();return bytes;};}return h;},async()=>{
   await assert.rejects(engine.rework(f.project,f.id,'a',rwRequest(run)),/changed|digest|stable/i);
  });
 });
 assert.equal(mutated,true);assert.equal(rwEvents(await engine.status(f.project,f.id)).length,0);return{concurrentChangeRejected:true,noReworkRecorded:true};
});

await test('rw-interface-project-required','New rework CLI requires an explicit project even when cwd contains a matching task',async()=>{
 const f=await fixture('rw-explicit-project',{two:false,});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);
 const r=spawnSync(process.execPath,[cli,'rework','--id',f.id,'--task','a','--run-id',run.runId,'--reason','SYNTHETIC','--reference','SYNTHETIC'],{cwd:f.project,encoding:'utf8',windowsHide:true,shell:false});
 assert.notEqual(r.status,0);assert.match(r.stderr,/project/);assert.equal(rwEvents(await engine.status(f.project,f.id)).length,0);return{explicitProjectRequired:true};
});

await test('rw-cli-pending','A submitted current execution can explicitly enter rework through the real CLI',async()=>{
 const f=await fixture('rw-cli-pending',{two:false,});await approve(f);
 const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);
 const receipt=await fs.readFile(path.join(f.directory,'receipt-'+run.runId+'.json'));
 const r=command(['rework','--project',f.project,'--id',f.id,'--task','a','--run-id',run.runId,'--reason','SYNTHETIC defect','--reference','SYNTHETIC issue rw-1']);
 assert.equal(r.code,0,r.stderr);const out=cliData(r.stdout);assert.equal(out.taskStatus,'stale');
 const state=await engine.status(f.project,f.id);assert.equal(state.tasks.a.status,'stale');assert.deepEqual(await fs.readFile(path.join(f.directory,'receipt-'+run.runId+'.json')),receipt);
 const next=await engine.begin(f.project,f.id,'a');assert.notEqual(next.runId,run.runId);assert.equal((await engine.status(f.project,f.id)).tasks.a.reworkOf.fromRunId,run.runId);
 return{publicCLI:true,oldReceiptPreserved:true,newRun:true};
});

await test('current-defaults','Public draft always uses the current namespace and explicit document structure requiring substantive authoring',async()=>{const project=path.join(root,'current-default');await fs.mkdir(project);const d=await engine.draft(project,'synthetic-default','SYNTHETIC default','general'),c=await readJson(path.join(d.directory,'contract.json'));assertRecord(c,'contract');assert.ok(Array.isArray(c.contextFiles));assert.throws(()=>validateContract(c),/declare deliverables and tasks/);assert.equal(c.recoveryFile,'RECOVERY.md');assert.deepEqual(c.execution,{allowedHosts:['codex'],defaultHost:'codex'});return{current:true};});

await test('evidence-required-files','Current contract review criteria require an explicit string array',async()=>{
 const f=await fixture('evidence-required',{two:false});f.c.tasks[0].acceptance=[{id:'inspect',type:'review',description:'SYNTHETIC review'}];assert.throws(()=>validateContract(f.c),/requiredFiles/);f.c.tasks[0].acceptance[0].requiredFiles=[];validateContract(f.c);return{explicitEmpty:true};
});

await test('evidence-snapshot-lifecycle','Snapshot is readonly and binds actual closed run/output and acceptance token',async()=>{
 const f=await fixture('evidence-life',{two:false,acceptance:[{id:'inspect',type:'review',requiredFiles:[],description:'SYNTHETIC review',requiredFiles:[]}]});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);
 const before=await publicSnapshot(f.directory);const snap=await engine.reviewSnapshotEvidence(f.project,f.id,'a','inspect');assert.equal(snap.persisted,false);assert.equal(snap.semanticReviewed,false);assert.deepEqual(await publicSnapshot(f.directory),before);assert.equal(snap.binding.runId,r.runId);assert.equal(snap.binding.priorAcceptanceAttemptId,null);assert.deepEqual(snap.files.map(x=>x.outputId),['out-a']);
 const reviews={inspect:{binding:snap.binding,files:snap.files,verdict:'pass',reviewer:'SYNTHETIC independent reader',source:'SYNTHETIC source',rationale:'Read the actual output and checked the specified criterion',independence:'SYNTHETIC test'}};
 const v=await verifyFacts(f.project,f.id,'a',reviews);assert.equal(v.taskStatus,'verified');return{snapshotReadOnly:true,verified:true};
});

const currentReview=extra=>({id:'inspect',type:'review',requiredFiles:[],description:'SYNTHETIC inspect actual file content',requiredFiles:[],...extra});

function currentRecord(snap){return{binding:structuredClone(snap.binding),files:structuredClone(snap.files),verdict:'pass',reviewer:'SYNTHETIC independent reader',source:'SYNTHETIC actual source',rationale:'Read actual bound content against the declared criterion',independence:'Synthetic roles only; no human authentication claim'};}

const currentCommand=(id,script)=>({id,type:'command',description:'SYNTHETIC controlled acceptance command',command:process.execPath,args:['-e',script]});

async function currentPending(name,{acceptance=[currentReview()],two=false,logs}={}){
 const f=await fixture(name,{two,acceptance});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');
 await submit(f,'a',run,'ok',logs?{logs}:{});return{...f,run};
}

async function currentSnapshot(f,files=[]){return engine.reviewSnapshotEvidence(f.project,f.id,'a','inspect',{files});}

for(const key of ['taskId','revision','reviewDigest','step','runId','criterionId','receiptSha256','priorAcceptanceAttemptId','dependencyDigest','unknown'])await test('evidence-binding-'+key,'Every binding field is checked before any command',async()=>{
 const f=await currentPending('evidence-bind-'+key.toLowerCase(),{acceptance:[currentCommand('marker',"require('fs').writeFileSync('spawned.txt','bad')"),currentReview()]});
 const r=currentRecord(await currentSnapshot(f));r.binding[key]=key==='revision'?r.binding[key]+1:['reviewDigest','receiptSha256','dependencyDigest'].includes(key)?'0'.repeat(64):['runId','priorAcceptanceAttemptId'].includes(key)?randomUUID():'wrong';
 await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:r}),/binding/);await assert.rejects(fs.stat(path.join(f.project,'spawned.txt')),/ENOENT/);
 const s=await engine.status(f.project,f.id);if(key!=='unknown')assert.equal(s.tasks.a.lastAcceptance.status,'failed');assert.equal(s.tasks.a.status,'pending_acceptance');return{field:key,commands:0};
});

for(const mutation of ['missing-output','wrong-hash','unknown-output','missing-required','duplicate','unknown-row-key','output-id-on-extra'])await test('evidence-manifest-'+mutation,'Manifest coverage, IDs, hashes and duplicates are validated without filling expected hashes',async()=>{
 const f=await currentPending('evidence-man-'+mutation,{acceptance:[currentReview({requiredFiles:['evidence.txt']})]});await fs.writeFile(path.join(f.project,'evidence.txt'),'EVIDENCE');const r=currentRecord(await currentSnapshot(f));
 if(mutation==='missing-output')r.files=r.files.filter(x=>!x.outputId);
 if(mutation==='wrong-hash')r.files[0].sha256='0'.repeat(64);
 if(mutation==='unknown-output')r.files.find(x=>x.outputId).outputId='future';
 if(mutation==='missing-required')r.files=r.files.filter(x=>x.path!=='evidence.txt');
 if(mutation==='duplicate')r.files.push({...r.files[0]});
 if(mutation==='unknown-row-key')r.files[0].unknown=true;
 if(mutation==='output-id-on-extra')r.files.find(x=>!x.outputId).outputId='out-a';
 if(mutation==='unknown-row-key'){const file=path.join(f.directory,'state.json'),before=await fs.readFile(file);let mkdirs=0;await patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},()=>assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:r}),/unknown field/));assert.equal(mkdirs,0);assert.deepEqual(await fs.readFile(file),before);}else await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:r}),/manifest|row|outputId/i);return{mutation};
});

await test('evidence-attempt-token','Failed verify consumes prior attempt only after persistence; retry requires fresh snapshot and actual review',async()=>{
 const f=await currentPending('evidence-token');const r=currentRecord(await currentSnapshot(f)),bad=structuredClone(r);bad.binding.runId=randomUUID();
 await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:bad}),/binding/);
 await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:r}),/binding/);
 const snap=await currentSnapshot(f);assert.ok(snap.binding.priorAcceptanceAttemptId);const v=await verifyFacts(f.project,f.id,'a',{inspect:currentRecord(snap)});assert.equal(v.taskStatus,'verified');
 const before=await engine.status(f.project,f.id);await assert.rejects(verifyFacts(f.project,f.id,'a',{}));const after=await engine.status(f.project,f.id);assert.equal(after.tasks.a.status,'verified');assert.deepEqual(after.tasks.a.evidence,before.tasks.a.evidence);assert.equal(after.tasks.a.lastAcceptance.status,'failed');return{freshRequired:true,oldAcceptancePreserved:true};
});

await test('evidence-extra-evidence-stale','All reviewed extra evidence enters accepted evidence and later drift makes acceptance stale',async()=>{
 const f=await currentPending('evidence-extra');const file=path.join(f.project,'extra.txt');await fs.writeFile(file,'EXTRA');const snap=await currentSnapshot(f,['extra.txt']);await verifyFacts(f.project,f.id,'a',{inspect:currentRecord(snap)});assert.ok((await engine.status(f.project,f.id)).tasks.a.evidence.some(x=>x.path===file));await fs.appendFile(file,'changed');assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'stale');return{extraBound:true};
});

await test('evidence-output-required-merge','Identical normalized output and required path merges; future outputs are not demanded',async()=>{
 const f=await currentPending('evidence-merge',{two:true,acceptance:[currentReview({requiredFiles:['out/a.txt','out/a.txt']})]});const snap=await currentSnapshot(f);assert.equal(snap.files.length,1);assert.equal(snap.files[0].outputId,'out-a');await verifyFacts(f.project,f.id,'a',{inspect:currentRecord(snap)});return{merged:1,futureNotRequired:true};
});

for(const mode of ['output','required','receipt','source','input','failed-output'])await test('evidence-command-drift-'+mode,'Each completed command is checked immediately and later commands cannot restore changed evidence',async()=>{
 const file=mode==='required'?'evidence.txt':mode==='source'?'reviews.json':mode==='input'?'input.txt':mode==='receipt'?'RECEIPT':'out/a.txt';
 const script="const fs=require('fs');let p="+JSON.stringify(file)+";if(p==='RECEIPT'){const path=require('path');const d=fs.readdirSync('harness')[0];p=path.join('harness',d,fs.readdirSync(path.join('harness',d)).find(x=>x.startsWith('receipt-')));}fs.appendFileSync(p,'DRIFT');"+(mode==='failed-output'?'process.exit(7)':'');
 const f=await currentPending('evidence-drift-'+mode,{acceptance:[currentCommand('change',script),currentReview({requiredFiles:mode==='required'?['evidence.txt']:[]}),currentCommand('later',"require('fs').writeFileSync('later.txt','must not run')")]});
 if(mode==='required')await fs.writeFile(path.join(f.project,'evidence.txt'),'ORIGINAL');
 const records={inspect:currentRecord(await currentSnapshot(f))};let options={};
 if(mode==='source'){const source=path.join(f.project,'reviews.json');await writeJson(source,envelope('reviews',{records}));const input=await engine.readReviewsEvidence(source);options={reviewsSource:input.reviewsSource};}
 await assert.rejects(verifyFacts(f.project,f.id,'a',records,options),/drift|changed|approv/i);await assert.rejects(fs.stat(path.join(f.project,'later.txt')),/ENOENT/);
 const attempt=(await engine.status(f.project,f.id)).tasks.a.lastAcceptance;assert.equal(attempt.status,'failed');
 if(mode==='failed-output'){assert.match(attempt.error,/exit 7/);assert.match(attempt.error,/drift/i);assert.equal(attempt.processResult.processState,'closed');assert.equal(attempt.processResult.exitCode,7);}
 return{mode,laterCommands:0,processAndDriftRetained:mode==='failed-output'};
});

await test('evidence-source-cli','CLI reads reviews from the same bytes and accepts source as separate evidence',async()=>{
 const f=await currentPending('evidence-source-cli');const snapCommand=command(['review-snapshot','--project',f.project,'--id',f.id,'--task','a','--criterion','inspect']);assert.equal(snapCommand.code,0,snapCommand.stderr);const snap=cliData(snapCommand.stdout);const file=path.join(f.project,'reviews.json');await writeJson(file,envelope('reviews',{records:{inspect:currentRecord(snap)}}));
 const raw=await fs.readFile(file);const input=await engine.readReviewsEvidence(file);assert.equal(input.reviewsSource.sha256,hash(raw));
 const result=command(['verify','--project',f.project,'--id',f.id,'--task','a','--reviews',file]);assert.equal(result.code,0,result.stderr);const s=await engine.status(f.project,f.id);assert.equal(s.tasks.a.status,'verified');assert.ok(s.tasks.a.evidence.some(x=>x.path===file));await fs.appendFile(file,' ');assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'stale');return{publicCLI:true,sourceBound:true};
});

await test('evidence-source-changed-before-entry','Source metadata cannot be rebound to a later file version',async()=>{
 const f=await currentPending('evidence-source-before');const file=path.join(f.project,'reviews.json');await writeJson(file,envelope('reviews',{records:{inspect:currentRecord(await currentSnapshot(f))}}));const input=await engine.readReviewsEvidence(file);await fs.appendFile(file,' ');
 await assert.rejects(verifyFacts(f.project,f.id,'a',input.reviews,{reviewsSource:input.reviewsSource}),/source changed/i);return{rejected:true};
});

for(const mode of ['relative-dot','outside','case','trailing','directory','hardlink','symlink','control','snapshot','source-self'])await test('evidence-path-'+mode,'Ambiguous, recursive, nonordinary and aliased evidence is refused',async()=>{
 const f=await currentPending('evidence-path-'+mode);let relative;
 if(mode==='relative-dot')relative='out/./a.txt';
 if(mode==='outside')relative='../outside.txt';
 if(mode==='case')relative='OUT/a.txt';
 if(mode==='trailing')relative='out/a.txt.';
 if(mode==='directory')relative='out';
 if(mode==='hardlink'){relative='alias.txt';await fs.link(path.join(f.project,'out/a.txt'),path.join(f.project,relative));}
 if(mode==='symlink'){relative='alias.txt';await fs.symlink(path.join(f.project,'out/a.txt'),path.join(f.project,relative),'file');}
 if(mode==='control')relative=path.relative(f.project,path.join(f.directory,'state.json')).split(path.sep).join('/');
 if(mode==='snapshot'){relative='snap.json';await writeJson(path.join(f.project,relative),await currentSnapshot(f));}
 if(mode==='source-self'){relative='reviews.json';await writeJson(path.join(f.project,relative),envelope('reviews',{records:{inspect:currentRecord(await currentSnapshot(f))}}));const input=await engine.readReviewsEvidence(path.join(f.project,relative));const record=structuredClone(input.reviews);record.records.inspect.files.push({path:relative,sha256:input.reviewsSource.sha256});await assert.rejects(verifyFacts(f.project,f.id,'a',record,{reviewsSource:input.reviewsSource}),/control|recursive|source JSON/i);return{rejected:true};}
 await assert.rejects(currentSnapshot(f,[relative]),/Evidence|evidence|canonical|alias|ordinary|recursive|control|ENOENT|ENOTDIR/i);return{rejected:true};
});

await test('evidence-snapshot-gates','Readonly snapshot rejects active runs, invalid options and writer locks without writes',async()=>{
 const f=await fixture('evidence-gates',{two:false,acceptance:[currentReview()]});await approve(f);await engine.begin(f.project,f.id,'a');const before=await publicSnapshot(f.directory);await assert.rejects(currentSnapshot(f),/active|closed|execution/i);assert.deepEqual(await publicSnapshot(f.directory),before);
 await fs.mkdir(path.join(f.directory,'.writer-lock'));await assert.rejects(currentSnapshot(f),/lock/);await fs.rmdir(path.join(f.directory,'.writer-lock'));
 const out=command(['review-snapshot','--project',f.project,'--id',f.id,'--task','a','--criterion','inspect','--out','no.json']);assert.notEqual(out.code,0);assert.match(out.stderr,/Unsupported/);return{readOnly:true};
});

await test('evidence-snapshot-race','Same-handle mutation and a writer appearing during snapshot are refused without snapshot writes',async()=>{
 for(const mode of ['file','state','lock']){
  const f=await currentPending('evidence-race-'+mode),target=path.join(f.project,'out/a.txt');const before=await fs.readFile(path.join(f.directory,'state.json'));let hit=false;
  await patchMethod(fs,'open',original=>async function(file,...args){
   const handle=await original.call(this,file,...args);if(path.resolve(file)===target&&!hit){hit=true;const read=handle.readFile.bind(handle);handle.readFile=async(...a)=>{const data=await read(...a);if(mode==='file')await fs.appendFile(target,'CHANGED');if(mode==='state')await fs.appendFile(path.join(f.directory,'state.json'),' ');if(mode==='lock')await fs.mkdir(path.join(f.directory,'.writer-lock'));return data;};}return handle;
  },()=>assert.rejects(currentSnapshot(f),/changed|drift|lock/i));assert.equal(hit,true);
  if(mode!=='state')assert.deepEqual(await fs.readFile(path.join(f.directory,'state.json')),before);
  if(mode==='lock')await fs.rmdir(path.join(f.directory,'.writer-lock'));
 }
 return{raceModes:3,noSnapshotPersistence:true};
});

await test('evidence-dependency-identity','Recursive dependency digest includes accepted execution identity but excludes later failed attempts',async()=>{
 const f=await fixture('evidence-deps',{two:true});f.c.tasks[1].acceptance=[currentReview()];f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);await finish(f,'a');const run=await engine.begin(f.project,f.id,'b');await emit(f,'b');await submit(f,'b',run);
 const snapshot=await engine.reviewSnapshotEvidence(f.project,f.id,'b','inspect');
 await assert.rejects(verifyFacts(f.project,f.id,'a'));const again=await engine.reviewSnapshotEvidence(f.project,f.id,'b','inspect');assert.equal(again.binding.dependencyDigest,snapshot.binding.dependencyDigest);
 const a=(await engine.status(f.project,f.id)).tasks.a;await engine.rework(f.project,f.id,'a',{runId:a.runId,reason:'SYNTHETIC rerun same bytes',reference:'SYNTHETIC dependency test'});await finish(f,'a');const b=(await engine.status(f.project,f.id)).tasks.b;await engine.rework(f.project,f.id,'b',{runId:b.runId,reason:'SYNTHETIC stale dependent',reference:'SYNTHETIC same test'});const next=await engine.begin(f.project,f.id,'b');await emit(f,'b');await submit(f,'b',next);const fresh=await engine.reviewSnapshotEvidence(f.project,f.id,'b','inspect');assert.notEqual(fresh.binding.dependencyDigest,snapshot.binding.dependencyDigest);return{identityBound:true,failedAttemptExcluded:true};
});

await test('evidence-boundary-snapshot-text','Serialized snapshots are excluded regardless of filename extension',async()=>{
 const f=await currentPending('evidence-text');await writeJson(path.join(f.project,'snapshot.txt'),await currentSnapshot(f));await assert.rejects(currentSnapshot(f,['snapshot.txt']),/recursive|serialized/i);return{rejected:true};
});

await test('evidence-boundary-late-lock','A writer arriving at the exit boundary prevents readonly snapshot return',async()=>{
 const f=await currentPending('evidence-late-lock');let scans=0,hit=false;
 await patchMethod(fs,'readdir',original=>async function(file,...args){if(path.resolve(file)===f.directory&&++scans===4){hit=true;await fs.mkdir(path.join(f.directory,'.writer-lock'));}return original.call(this,file,...args);},()=>assert.rejects(currentSnapshot(f),/lock/i));
 assert.equal(hit,true);await fs.rmdir(path.join(f.directory,'.writer-lock'));return{rejectedAtExit:true};
});

await test('evidence-boundary-state-same-bytes','Snapshot never parses state from an unrelated ordinary read',async()=>{
 const f=await currentPending('evidence-state-same');let ordinary=0;await patchMethod(fs,'readFile',original=>async function(file,...args){if(typeof file==='string'&&path.resolve(file)===path.join(f.directory,'state.json'))ordinary++;return original.call(this,file,...args);},()=>currentSnapshot(f));
 assert.equal(ordinary,0);return{sameHandleState:true};
});

await test('evidence-boundary-review-wrapper','Copied review wrappers and extensionless snapshots cannot enter manifests',async()=>{
 const f=await currentPending('evidence-wrapper');for(const name of ['saved-review.txt','snapshot']){await writeJson(path.join(f.project,name),envelope('reviews',{records:{inspect:currentRecord(await currentSnapshot(f))}}));await assert.rejects(currentSnapshot(f,[name]),/recursive|serialized/i);}return{formats:2};
});

await test('evidence-boundary-casefold','Windows casefold ambiguity is rejected even when an exact spelling exists',async()=>{
 const f=await currentPending('evidence-casefold');let hit=false;
 await patchMethod(fs,'readdir',original=>async function(file,...args){const names=await original.call(this,file,...args);if(path.resolve(file)===path.join(f.project,'out')&&typeof names[0]==='string'){hit=true;return [...names,'A.txt'];}return names;},async()=>{if(process.platform==='win32')await assert.rejects(currentSnapshot(f),/ambiguous/i);else await currentSnapshot(f);});assert.equal(hit,true);return{platform:process.platform,casefoldChecked:process.platform==='win32'};
});

await test('evidence-boundary-source-facts','API source metadata must describe the submitted review JSON rather than an unrelated file',async()=>{
 const f=await currentPending('evidence-source-facts'),file=path.join(f.project,'reviews.json');await writeJson(file,envelope('reviews',{records:{}}));const input=await engine.readReviewsEvidence(file);await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:currentRecord(await currentSnapshot(f))},{reviewsSource:input.reviewsSource}),/source JSON/);return{rejected:true};
});

await test('evidence-verify-order-two-reviews','All review criteria are validated first in any declaration order',async()=>{
 const f=await currentPending('evidence-order',{acceptance:[currentCommand('first',"require('fs').writeFileSync('spawned','bad')"),currentReview(),currentReview({id:'second'})]});const first=currentRecord(await currentSnapshot(f)),second=currentRecord(await engine.reviewSnapshotEvidence(f.project,f.id,'a','second'));second.binding.criterionId='wrong';await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:first,second}),/binding/);await assert.rejects(fs.stat(path.join(f.project,'spawned')),/ENOENT/);return{commands:0,reviewCount:2};
});

await test('evidence-command-original-log','Execution logs stay separately bound across acceptance commands',async()=>{
 const f=await fixture('evidence-log',{two:false,acceptance:[currentCommand('change-log',"require('fs').appendFileSync('execution.log','DRIFT')"),currentReview(),currentCommand('later',"require('fs').writeFileSync('later','bad')")]});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');const log=path.join(f.project,'execution.log');await fs.writeFile(log,'ACTUAL SYNTHETIC EXECUTION LOG');await submit(f,'a',run,'ok',{logs:[{path:log,sha256:await digest(log)}]});await assert.rejects(verifyFacts(f.project,f.id,'a',{inspect:currentRecord(await currentSnapshot(f))}),/drift|log changed/i);await assert.rejects(fs.stat(path.join(f.project,'later')),/ENOENT/);return{originalLogBound:true};
});

await test('evidence-recursive-dependency-oracle','Dependency digest is a canonical static-shape hash of all recursive verified upstream identities and evidence',async()=>{
 const f=await fixture('evidence-recursive',{two:true});f.c.revision++;f.c.deliverables.push({id:'out-c',path:'out/c.txt'});f.c.tasks.push({id:'c',title:'Consume recursive upstream chain',dependsOn:['b'],outputs:['out-c'],acceptance:[currentCommand('alter-grandparent',"require('fs').appendFileSync('out/a.txt','DRIFT')"),currentReview(),currentCommand('later',"require('fs').writeFileSync('later','bad')")]});f.c.contextFiles.push({path:'phases/c.md',kind:'phase',tasks:['c'],purpose:'SYNTHETIC recursive test',loadWhen:'After context selects c'});await fs.writeFile(path.join(f.directory,'phases/c.md'),'# Synthetic C\n\nInput and method: use verified B and recursive A. Produce [out-c](../../../out/c.txt). Acceptance: review current content. Failure: stop and retain actual evidence.');await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);await finish(f,'a');await finish(f,'b');const r=await engine.begin(f.project,f.id,'c');await emit(f,'c');await submit(f,'c',r);
 const snapshot=await engine.reviewSnapshotEvidence(f.project,f.id,'c','inspect'),state=await engine.status(f.project,f.id),rows=[];
 for(const id of ['a','b']){const s=state.tasks[id],unique=new Map();for(const file of s.evidence)unique.set(await fs.realpath(file.path),file.sha256);rows.push({step:id,runId:s.runId,acceptedAt:s.acceptedAt,evidence:[...unique].sort(([a],[b])=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0).map(([path,sha256])=>({path,sha256}))});}assert.equal(snapshot.binding.dependencyDigest,hash(JSON.stringify(rows)));await assert.rejects(verifyFacts(f.project,f.id,'c',{inspect:currentRecord(snapshot)}));await assert.rejects(fs.stat(path.join(f.project,'later')),/ENOENT/);const attempt=(await engine.status(f.project,f.id)).tasks.c.lastAcceptance;assert.equal(attempt.status,'failed');assert.match(await fs.readFile(path.join(f.project,'out/a.txt'),'utf8'),/DRIFT/);assert.equal(attempt.criterion,'alter-grandparent');const check=attempt.checks.find(x=>x.id==='alter-grandparent');assert.equal(check.result.processState,'closed');assert.equal(check.result.exitCode,0);assert.ok(check.postflightError);return{recursiveUpstream:['a','b'],oracle:'independently selected fixed-shape JSON',commandBoundaryDriftRejected:true,laterCommands:0};
});

for(const mode of ['state','receipt'])await test('evidence-boundary-fresh-'+mode,'A different version already observed during exit recheck cannot be ignored',async()=>{
 const f=await currentPending('evidence-fresh-'+mode),target=path.join(f.directory,mode==='state'?'state.json':'receipt-'+f.run.runId+'.json');let opens=0,hit=false;
 await patchMethod(fs,'lstat',original=>async function(file,...args){const result=await original.call(this,file,...args);if(path.resolve(file)===target&&++opens===4){hit=true;if(mode==='state')await fs.appendFile(target,' ');else{const bytes=await fs.readFile(target),temp=target+'.replacement';await fs.writeFile(temp,bytes);await fs.rename(temp,target);}}return result;},()=>assert.rejects(currentSnapshot(f),/drift|changed|version/i));assert.equal(hit,true);return{newObservedVersionRejected:true,mode};
});

const masterOracle=await readJson(new URL('./current-master-golden.json',import.meta.url));await test('current-master-oracle','Complete current master matches the independent fixed oracle byte for byte',async()=>{assertRecord(masterOracle,'master-oracle');const before=JSON.stringify(masterOracle.contract),actual=renderContract(masterOracle.contract);assert.equal(actual,masterOracle.expected);assert.equal(JSON.stringify(masterOracle.contract),before);return{bytes:Buffer.byteLength(actual)};});

await test('evidence-final-postflight','Final pre-pass drift is recorded as failure without any passed acceptance',async()=>{
 const f=await currentPending('evidence-final-check',{acceptance:[currentReview(),currentCommand('readonly',"require('fs').readFileSync('out/a.txt')")]});const records={inspect:currentRecord(await currentSnapshot(f))},target=path.join(f.project,'out/a.txt');let opens=0,hit=false;
 await patchMethod(fs,'open',original=>async function(file,...args){if(path.resolve(file)===target&&++opens===4){hit=true;await fs.appendFile(target,'DRIFT AT FINAL CHECK');}return original.call(this,file,...args);},()=>assert.rejects(verifyFacts(f.project,f.id,'a',records),/drift|changed/i));assert.equal(hit,true);
 const s=(await engine.status(f.project,f.id)).tasks.a;assert.equal(s.lastAcceptance.criterion,'final-postflight');assert.equal(s.lastAcceptance.status,'failed');assert.ok(!s.acceptanceAttempts.some(x=>x.status==='passed'));return{finalGate:true,noPassedAttempt:true};
});

for(const host of ['codex','claude-code','deepseek-harness'])for(const documents of [true])await test('evidence-host-'+host+'-'+('current'),'Current contract retains reviewed host policy and original native executor through actual closure and acceptance',async()=>{
 const f=await fixture('evidence-host-'+host+'-'+documents,{documents,two:false,execution:{allowedHosts:[host],defaultHost:host}});await approve(f);const r=await engine.begin(f.project,f.id,'a',{host});assert.equal(r.executionBinding.host,host);const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.activeExecutions[0].executionBinding.host,host);await emit(f,'a');await submitFacts(f.project,f.id,'a',{runId:r.runId,executor:host+'-native',reference:'SYNTHETIC actual native fixture '+f.project,result:'ok'});const v=await verifyFacts(f.project,f.id,'a');assert.equal(v.taskStatus,'verified');const s=await engine.status(f.project,f.id);assert.equal(s.tasks.a.executionBinding.executor,host+'-native');return{host,artifactMode:'current',actualClosure:true};
});

await test('evidence-postreview-execution-metadata','Snapshot execution metadata comes from the verified original executor when task-only fields are missing',async()=>{
 const f=await fixture('evidence-meta-original',{two:false,execution:{allowedHosts:['claude-code'],defaultHost:'claude-code'},acceptance:[currentReview()]});await approve(f);await writeJson(path.join(f.project,'host-child-expectations.json'),{host:'claude-code',cwd:f.project});
 const closed=await runLeafFixture(f.project,f.id,'a',{host:'claude-code',executable:path.join(source,'scripts/tests/helpers/host-child.mjs')});assert.equal(closed.phase,'pending_acceptance');const receipt=await readJson(closed.receipt.path);assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,0);
 const stateFile=path.join(f.directory,'state.json'),state=await readJson(stateFile);delete state.tasks.a.executionBinding;await writeJson(stateFile,state); // SYNTHETIC fault only; trusted runtime begin/closure events remain.
 const before=await fs.readFile(stateFile),receiptBefore=await fs.readFile(closed.receipt.path),snap=await currentSnapshot(f);
 assert.deepEqual(snap.execution,{host:'claude-code',mode:'cli',executor:'claude-code-cli'});assert.deepEqual(await fs.readFile(stateFile),before);assert.deepEqual(await fs.readFile(closed.receipt.path),receiptBefore);
 for(const event of state.events)delete event.executionBinding;await writeJson(stateFile,state);const corrupted=await fs.readFile(stateFile);await assert.rejects(currentSnapshot(f),/Current format/);assert.deepEqual(await fs.readFile(stateFile),corrupted);return{actualLocalCLIClosed:true,originalMetadata:true,missingAllTrustRejected:true};
});

await test('current-lock-format-recheck','Current state corrupted at lock acquisition is refused before any command',async()=>{const f=await currentPending('lock-format',{acceptance:[currentCommand('marker',"require('fs').writeFileSync('marker.txt','SYNTHETIC')"),currentReview()]}),reviews=envelope('reviews',{records:{inspect:currentRecord(await currentSnapshot(f))}});let injected=false;const stateFile=path.join(f.directory,'state.json'),before=await fs.readFile(stateFile);await patchMethod(fs,'mkdir',old=>async function(p,...args){const r=await old(p,...args);if(path.resolve(String(p))===path.join(f.directory,'.writer-lock')&&!injected){injected=true;const state=JSON.parse(before);state.kind='contract';await writeJson(stateFile,state);}return r;},()=>assert.rejects(verifyFacts(f.project,f.id,'a',reviews)));assert.ok(injected);await assert.rejects(fs.stat(path.join(f.project,'marker.txt')),{code:'ENOENT'});const corrupt=await fs.readFile(stateFile);assert.notDeepEqual(corrupt,before);return{injected,commands:0,unknownStatePreserved:true};});

function fixErrorFacts(error,seen=new Set()){
 if(error===null||typeof error!=='object')return error;
 if(seen.has(error))return '[cycle]';seen.add(error);
 return Object.fromEntries(Object.getOwnPropertyNames(error).filter(k=>k!=='stack').map(k=>[k,fixErrorFacts(error[k],seen)]));
}

const runRegressionSubset=(args,cwd=work)=>{const r=spawnSync(process.execPath,[path.join(source,'scripts/tests/harness-regression.mjs'),...args],{cwd,encoding:'utf8',windowsHide:true,shell:false,timeout:20000,maxBuffer:8*1024*1024});return {code:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message};};

for(const review of [false,true])await test('postflight-parent-alias-'+review,'Every current postflight keeps the original canonical parent-path restrictions and stops later commands',async()=>{
 const alias="const fs=require('node:fs'),p=require('node:path'),cwd=fs.realpathSync(process.cwd());for(const n of ['out','moved'])if(p.dirname(p.resolve(n))!==cwd)throw new Error('SYNTHETIC path escaped fixture');fs.renameSync('out','moved');fs.symlinkSync(p.resolve('moved'),'out','junction');";
 const acceptance=[...(review?[currentReview()]:[]),{id:'alias',type:'command',description:'SYNTHETIC unexpected parent alias',command:process.execPath,args:['-e',alias]},{id:'later',type:'command',description:'SYNTHETIC must not run after invalidation',command:process.execPath,args:['-e',"require('fs').writeFileSync('later-marker','SYNTHETIC')"]}];
 const f=await fixture('postflight-parent-'+review,{two:false,acceptance});await approve(f);const r=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',r);
 const reviews=review?{inspect:currentRecord(await currentSnapshot(f))}:{};
 const observed=await captureOutcome(verifyFacts(f.project,f.id,'a',reviews));assert.ok(observed.error,'Parent junction introduced by an acceptance command was accepted');assert.match(observed.error.message,/alias|junction|symlink/i);
 assert.notEqual((await engine.status(f.project,f.id)).tasks.a.status,'verified');await assert.rejects(fs.stat(path.join(f.project,'later-marker')),{code:'ENOENT'});assert.equal((await fs.lstat(path.join(f.project,'out'))).isSymbolicLink(),true);return{review,aliasRejected:true,laterCommandStopped:true};
});

await test('closed-stale-rework','Current closed-stale navigation and direct begin require the current run explicit rework',async()=>{
 const f=await fixture('closed-stale',{two:false,});await approve(f);await finish(f,'a');const previous=(await engine.status(f.project,f.id)).tasks.a;await emit(f,'a','SYNTHETIC drift');
 const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.canBegin,false);assert.equal(ctx.workflow.begin,null);assert.equal(ctx.workflow.nextAction,'rework');assert.ok(ctx.workflow.rework);
 await assert.rejects(engine.begin(f.project,f.id,'a'),/rework/i);assert.equal((await engine.status(f.project,f.id)).tasks.a.runId,previous.runId);
 await engine.rework(f.project,f.id,'a',rwRequest(previous));const r=await engine.begin(f.project,f.id,'a');const s=await engine.status(f.project,f.id);assert.equal(s.tasks.a.reworkOf.fromRunId,previous.runId);assert.notEqual(r.runId,previous.runId);await submit(f,'a',r,'failed');return{explicitRework:true,currentRunPreservedUntilRequest:true};
});

await test('initial-and-failed-retry','Current first execution and failed retry do not acquire a stale-rework prerequisite',async()=>{
 const f=await fixture('initial-failed-retry',{two:false,});await approve(f);assert.equal((await engine.taskContext(f.project,f.id,'a')).canBegin,true);const first=await engine.begin(f.project,f.id,'a');await submit(f,'a',first,'failed');const next=await engine.begin(f.project,f.id,'a');assert.notEqual(next.runId,first.runId);await submit(f,'a',next,'failed');return{todo:true,failedRetry:true};
});

await test('rework-stale-dependency','Stale dependencies permit recording rework but still block a replacement begin',async()=>{
 const f=await fixture('rework-stale-dependency',{});await approve(f);await finish(f,'a');await finish(f,'b');const original=(await engine.status(f.project,f.id)).tasks;await emit(f,'a','SYNTHETIC upstream drift');
 await engine.rework(f.project,f.id,'b',rwRequest(original.b));await assert.rejects(engine.begin(f.project,f.id,'b'),/Dependencies/);await engine.rework(f.project,f.id,'a',rwRequest(original.a));await finish(f,'a');const r=await engine.begin(f.project,f.id,'b');assert.equal((await engine.status(f.project,f.id)).tasks.b.reworkOf.fromRunId,original.b.runId);await submit(f,'b',r,'failed');return{reworkBeforeDependencyRepair:true,beginAfterAcceptance:true};
});

for(const defect of ['missing-closure','conflicting-closure','missing-reason','conflicting-reference','unknown-event-type','empty-reference','missing-marker','wrong-request','duplicate-request','missing-receipt-hash'])await test('rework-binding-refusal-'+defect,'Incomplete or conflicting current-run closure/rework facts cannot bypass the current gate',async()=>{
 const f=await fixture('rework-binding-'+defect,{two:false,});await approve(f);await finish(f,'a');const previous=(await engine.status(f.project,f.id)).tasks.a;await engine.rework(f.project,f.id,'a',rwRequest(previous));
 const file=path.join(f.directory,'state.json'),state=await readJson(file),e=state.events.find(e=>e.type==='rework_requested');
 if(defect==='missing-closure')state.events=state.events.filter(e=>!['execution_receipt','execution_closed'].includes(e.type));
 if(defect==='conflicting-closure')state.events.push({...state.events.find(e=>e.type==='execution_receipt'),step:'other'});
 if(defect==='missing-reason')delete e.reason;
 if(defect==='conflicting-reference')e.reference='SYNTHETIC conflicting reference';
 if(defect==='unknown-event-type')e.type='unrecognized';if(defect==='empty-reference')e.reference=' ';if(defect==='missing-marker')delete state.tasks.a.reworkRequest;if(defect==='wrong-request')e.requestId=randomUUID();if(defect==='duplicate-request')state.events.push({...e});if(defect==='missing-receipt-hash'){delete state.tasks.a.receipt.sha256;delete e.receipt.sha256;}
 await writeJson(file,state);if(['missing-reason','unknown-event-type','missing-receipt-hash'].includes(defect)){const bytes=await fs.readFile(file);await assert.rejects(engine.taskContext(f.project,f.id,'a'));await assert.rejects(engine.begin(f.project,f.id,'a'));assert.deepEqual(await fs.readFile(file),bytes);return{defect,unknownStatePreserved:true};}const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.canBegin,false);assert.equal(ctx.workflow.begin,null);assert.equal(ctx.workflow.rework,null);await assert.rejects(engine.begin(f.project,f.id,'a'));assert.equal((await engine.status(f.project,f.id)).tasks.a.runId,previous.runId);return{defect,recoveryRequired:true};
});

for(const discriminator of ['schemaVersion','kind'])await test('current-damaged-contract-'+discriminator,'Unsupported contract retains original current active identity only for stale factual closure',async()=>{const f=await fixture('damaged-'+discriminator.toLowerCase(),{two:false});await approve(f);const r=await engine.begin(f.project,f.id,'a');f.c[discriminator]=discriminator==='kind'?'state':99;await writeJson(path.join(f.directory,'contract.json'),f.c);const ctx=await engine.taskContext(f.project,f.id,'a');assert.equal(ctx.kind,'recovery-context');assert.equal(ctx.approvalValid,false);assert.equal(ctx.acceptedForVerification,false);assert.equal(ctx.canBegin,false);assert.equal(ctx.activeExecutions[0].runId,r.runId);await assert.rejects(engine.begin(f.project,f.id,'a'));const ended=await submit(f,'a',r,'failed');assert.equal(ended.acceptedForVerification,false);return{discriminator,originalIdentity:true};});

for(const mode of ['append','add','remove','contract'])await test('scan-seal-drift-'+mode,'The completed authoring command never seals a version different from its path scan',async()=>{
 const f=await fixture('scan-seal-'+mode,{two:false,unreviewed:true}),phase=path.join(f.directory,'phases/a.md'),hook=path.join(f.project,'scan-hook.mjs');
 const hookSource=`import fs from 'node:fs/promises';import path from 'node:path';import {render} from ${JSON.stringify(pathToFileURL(path.join(source,'scripts/lib/engine.mjs')).href)};const phase=${JSON.stringify(phase)},project=${JSON.stringify(f.project)},id=${JSON.stringify(f.id)},directory=${JSON.stringify(f.directory)},mode=${JSON.stringify(mode)},original=fs.readFile;let hit=false;fs.readFile=async function(file,...args){const value=await original.call(this,file,...args);if(!hit&&typeof file==='string'&&path.resolve(file).toLowerCase()===phase.toLowerCase()){hit=true;if(mode==='append')await fs.appendFile(file,'\\n[missing](<missing-after-scan.txt>)\\n');if(mode==='add'){await fs.mkdir(path.join(directory,'notes'));await fs.writeFile(path.join(directory,'notes/new.md'),'# SYNTHETIC added after collection\\n');}if(mode==='remove')await fs.unlink(file);if(mode==='contract'){const p=path.join(directory,'contract.json'),c=JSON.parse(await original.call(fs,p,'utf8'));c.revision++;c.contextFiles.push({path:'phases/new-b.md',kind:'reference',tasks:['a'],purpose:'SYNTHETIC new B navigation',loadWhen:'After context'});await fs.writeFile(path.join(directory,'phases/new-b.md'),'# SYNTHETIC complete new B document\\n');await fs.writeFile(p,JSON.stringify(c,null,2)+'\\n');await render(project,id);}}return value;};`;
 await fs.writeFile(hook,hookSource.replace('hit=true;','hit=true;await fs.writeFile(path.join(project,\'scan-hook-hit\'),mode);'));const r=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,cli,'prepare-review','--project',f.project,'--id',f.id],{cwd:work,encoding:'utf8',shell:false,windowsHide:true,timeout:20000});assert.equal(r.error,undefined);await writeJson(path.join(f.project,'scan-child-result.json'),{status:r.status,stdout:r.stdout,stderr:r.stderr});assert.equal(await fs.readFile(path.join(f.project,'scan-hook-hit'),'utf8').catch(()=>null),mode,'The actual scan mutation hook must run: '+r.stderr);if(mode==='append')assert.ok((await fs.readFile(phase,'utf8')).includes('missing-after-scan.txt'));assert.notEqual(r.status,0,'Mismatched scan/seal version returned success');const state=await readJson(path.join(f.directory,'state.json'));assert.equal(state.review??null,null);assert.equal(state.events.filter(e=>e.type==='review_prepared').length,0);
 if(mode==='contract'){const stable=command(['prepare-review','--project',f.project,'--id',f.id]);assert.equal(stable.code,0,stable.stderr);assert.equal(cliData(stable.stdout).pathCheck.ok,true);assert.ok(stable.stdout.includes('new-b.md'));}
 return{mode,mixedVersionRejected:true,stableNewContract:mode==='contract'};
});

for(const binding of [null,{}, {format:'sciautoharness',schemaVersion:1,kind:'scan-binding',contractSha256:'0'.repeat(64),documents:[]}])await test('scan-binding-refusal-'+(binding===null?'null':Object.keys(binding).length?'empty-list':'empty-object'),'Present malformed scan bindings cannot silently fall back to unbound prepareReview',async()=>{
 const f=await fixture('scan-binding-'+(binding===null?'n':Object.keys(binding).length?'l':'o'),{two:false,unreviewed:true});await engine.render(f.project,f.id);await assert.rejects(prepareCurrentReview(f.project,f.id,{scanBinding:binding}),/Current format|scan|binding|document/i);const state=await readJson(path.join(f.directory,'state.json'));assert.equal(state.review??null,null);return{invalidBindingRejected:true};
});

await test('cli-boolean-grammar','Public CLI accepts only declared boolean spellings and rejects before business writes',async()=>{
 for(const option of ['read-only','research'])for(const value of ['garbage','TRUE','']){const r=command(['classify','--intent','implement','--'+option+'='+value]);assert.notEqual(r.code,0,'Invalid '+option+' was accepted: '+JSON.stringify(value));assert.equal(r.stdout.trim(),'');}
 for(const [flag,expected]of [['--read-only',true],['--read-only=true',true],['--read-only=false',false]]){const r=command(['classify','--intent','implement',flag]);assert.equal(r.code,0,r.stderr);assert.equal(cliData(r.stdout).readOnly,expected);}
 const review=command(['classify','--intent','review','--read-only=false']);assert.equal(cliData(review.stdout).readOnly,true);
 const f=await fixture('cli-boolean-write',{two:false,unreviewed:true});const tracked=['contract.json','HARNESS.md','state.json','phases/a.md','RECOVERY.md'];const before=await Promise.all(tracked.map(x=>digest(path.join(f.directory,x))));const invalid=command(['prepare-review','--project',f.project,'--id',f.id,'--repair-output-refs=garbage']);assert.notEqual(invalid.code,0);assert.deepEqual(await Promise.all(tracked.map(x=>digest(path.join(f.directory,x)))),before);return{invalidValuesRejected:true,validFlagsPreserved:true,noInvalidWrite:true};
});

await test('dsh-stream-utf8','Malformed UTF-8 fails while all valid multibyte splits and literal replacement characters pass',async()=>{
 const {hostOutputObserver}=await import('../lib/hosts.mjs');const start=Buffer.from(JSON.stringify({type:'session',sessionId:'SYNTHETIC'})+'\n'+JSON.stringify({type:'status',phase:'turn_end',reason:{kind:'completed'}})+'\n'+JSON.stringify({type:'final',text:'PAYLOAD'}).split('PAYLOAD')[0]),end=Buffer.from(JSON.stringify({type:'final',text:'PAYLOAD'}).split('PAYLOAD')[1]);
 for(const bytes of [Buffer.from('中文🙂'),Buffer.from('\uFFFD')]){const observer=hostOutputObserver('deepseek-harness');for(const b of Buffer.concat([start,bytes,end]))observer.write(Buffer.from([b]));assert.equal(observer.finish().ok,true);assert.deepEqual(observer.finish(),observer.finish());}
 for(const bytes of [[0xff],[0x80],[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xe2,0x82]]){const observer=hostOutputObserver('deepseek-harness');for(const b of Buffer.concat([start,Buffer.from(bytes),end]))assert.doesNotThrow(()=>observer.write(Buffer.from([b])));const result=observer.finish();assert.equal(result.ok,false,'Malformed bytes passed: '+bytes);assert.match(result.errors.join(' '),/UTF-8|UTF8/i);}
 const eof=hostOutputObserver('deepseek-harness');eof.write(Buffer.concat([start,Buffer.from([0xe2,0x82])]));assert.equal(eof.finish().ok,false);
 const bom=hostOutputObserver('deepseek-harness');bom.write(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),start,Buffer.from('valid'),end]));assert.equal(bom.finish().ok,false,'Do not silently change existing BOM behavior');return{strictInvalidBytes:true,validUnicodeAndChunks:true,bomBehaviorPreserved:true};
});

await test('dsh-decoder-awaits-close','Protocol decoding failure waits for real child close and preserves raw exit without killing the child',async()=>{
 const f=await fixture('dsh-decoder-close',{two:false,execution:{allowedHosts:['deepseek-harness'],defaultHost:'deepseek-harness'}});await approve(f);const fake=path.join(f.project,'driver.mjs');
 await fs.writeFile(fake,"import fs from 'node:fs/promises';for await(const _ of process.stdin){};const lines=[{type:'session',sessionId:'SYNTHETIC'},{type:'status',phase:'turn_end',reason:{kind:'completed'}}];for(const x of lines)process.stdout.write(JSON.stringify(x)+'\\n');process.stdout.write(Buffer.concat([Buffer.from('{\"type\":\"final\",\"text\":\"'),Buffer.from([255]),Buffer.from('\"}\\n')]));await new Promise(r=>setTimeout(r,80));await fs.writeFile('closed-marker','SYNTHETIC child continued');");
 const result=await runLeafFixture(f.project,f.id,'a',{host:'deepseek-harness',executable:fake,timeoutMs:4000});assert.equal(result.acceptedForVerification,true);const receipt=await readJson(result.receipt.path);assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,0);assert.equal(receipt.result,'failed');assert.equal(receipt.process.hostProtocol.ok,false);assert.equal(await fs.readFile(path.join(f.project,'closed-marker'),'utf8'),'SYNTHETIC child continued');return{actualClosed:true,rawExit:0,protocolFailed:true,childNotKilled:true};
});

for(const mode of ['report','report-state','report-state-lock'])await test('acceptance-guard-diagnostics-'+mode,'Current preserves the report-write cause alongside guard, state and cleanup failures',async()=>{
 const f=await fixture('acceptance-guard-'+mode,{two:false,});await approve(f);const r=await engine.begin(f.project,f.id,'a');const oldWrite=fs.writeFile,oldRename=fs.rename,oldRmdir=fs.rmdir;let reportHit=false,stateHit=false,lockHit=false,outcome;
 fs.writeFile=async function(file,...a){if(key(path.dirname(String(file)))===key(f.directory)&&path.basename(String(file)).startsWith('acceptance-')){reportHit=true;throw new Error('SYNTHETIC report cause');}return oldWrite.call(this,file,...a);};
 fs.rename=async function(from,to,...a){if(mode.includes('state')&&key(to)===key(path.join(f.directory,'state.json'))){stateHit=true;throw new Error('SYNTHETIC state cause');}return oldRename.call(this,from,to,...a);};
 fs.rmdir=async function(file,...a){const result=await oldRmdir.call(this,file,...a);if(mode.includes('lock')&&key(file)===key(path.join(f.directory,'.writer-lock'))){lockHit=true;throw new Error('SYNTHETIC cleanup cause after real release');}return result;};
 try{outcome=await captureOutcome(verifyFacts(f.project,f.id,'a'));}finally{fs.writeFile=oldWrite;fs.rename=oldRename;fs.rmdir=oldRmdir;}
 assert.ok(outcome.error);const facts=fixErrorFacts(outcome.error);const preserved=JSON.stringify(facts);assert.equal(reportHit,true);assert.ok(preserved.includes('SYNTHETIC report cause'),'Report refusal disappeared from returned errors');if(mode.includes('state')){assert.equal(stateHit,true);assert.ok(preserved.includes('SYNTHETIC state cause'));}if(mode.includes('lock')){assert.equal(lockHit,true);assert.ok(preserved.includes('SYNTHETIC cleanup cause'));}
 assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,r.runId);await submit(f,'a',r,'failed');return{mode,allCausesPreserved:true};
});

await test('metadata-string-grammar','Portable metadata validation refuses typed collections/scalars and preserves legal string forms',async()=>{
 const copy=path.join(root,'metadata-strings','sciautoharness');await fs.mkdir(path.dirname(copy),{recursive:true});await fs.cp(source,copy,{recursive:true});const skill=path.join(copy,'SKILL.md'),ui=path.join(copy,'agents/openai.yaml'),checker=path.join(copy,'scripts/check-skill.mjs'),original=await fs.readFile(skill,'utf8'),originalUi=await fs.readFile(ui,'utf8');
 const check=()=>{const r=spawnSync(process.execPath,[checker],{cwd:work,encoding:'utf8',windowsHide:true,shell:false,timeout:10000});assert.equal(r.error,undefined);return r;};assert.equal(check().status,0);
 for(const value of ['[x]','{x: y}','true','false','null','~','1234','true  ','  null','1.','2026-10-26','- value']){await fs.writeFile(skill,original.replace(/^description:.*$/m,'description: '+value));const r=check();assert.notEqual(r.status,0,'Non-string description accepted: '+value);assert.ok(!r.stdout.includes('"valid": true'));}
 for(const value of ['Use local examples safely.','验证本地示例',JSON.stringify('Use "quoted" Unicode 示例 safely.')]){await fs.writeFile(skill,original.replace(/^description:.*$/m,'description: '+value));const r=check();assert.equal(r.status,0,r.stderr);}await fs.writeFile(skill,original);
 for(const field of ['display_name','short_description','default_prompt']){const array=field==='default_prompt'?'["$sciautoharness"]':JSON.stringify(Array.from('A'.repeat(30)));await fs.writeFile(ui,originalUi.replace(new RegExp('^  '+field+':.*$','m'),'  '+field+': '+array));const r=check();assert.notEqual(r.status,0,'Array UI string field accepted: '+field);}await fs.writeFile(ui,originalUi);assert.equal(check().status,0);return{typedValuesRejected:true,safeStringsAccepted:true};
});

await test('runner-zero-selection','Explicit empty selection is nonzero with truthful zero counts; valid prefixes still execute',async()=>{
 const r=runRegressionSubset(['--work-root',path.join(root,'runner-zero-selection'),'--case-prefix','__synthetic_no_match__']);assert.equal(r.error,undefined);assert.notEqual(r.code,0,'Zero selected tests returned success');const lines=r.stdout.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));assert.equal(lines.at(-1).summary.tests,0);
 const good=runRegressionSubset(['--work-root',path.join(root,'runner-valid-prefix'),'--case-prefix','real-child-echo']);assert.equal(good.error,undefined);assert.equal(good.code,0,good.stderr);const summary=JSON.parse(good.stdout.trim().split(/\r?\n/).at(-1)).summary;assert.ok(summary.tests>0);assert.equal(summary.failed,0);return{emptySelectionRefused:true,validSelectionTests:summary.tests};
});

for(const [name,args]of [['missing',['--case-prefix']],['empty',['--case-prefix','']],['option-value',['--case-prefix','--work-root']],['duplicate',['--case-prefix','x','--case-prefix','y']]])await test('runner-prefix-grammar-'+name,'Malformed prefix is rejected before creating its requested work directory',async()=>{
 const directory=path.join(root,'runner-prefix-grammar-'+name);const r=runRegressionSubset(['--work-root',directory,'--work-root',...args]);assert.equal(r.error,undefined);assert.notEqual(r.code,0);await assert.rejects(fs.stat(directory),{code:'ENOENT'});return{name,noFixtureSideEffect:true};
});

async function capturedScanBinding(f){const capture=await capturePackageDocuments(f.directory);assert.deepEqual(capture.issues,[]);return envelope('scan-binding',{contractSha256:hash(await fs.readFile(path.join(f.directory,'contract.json'))),documents:capture.files.map(({path,sha256})=>({path,sha256}))});}
for(const variant of ['missing','reference'])await test('current-api-scan-'+variant,'A valid caller binding cannot bypass actual complete link lint',async()=>{const f=await fixture('api-scan-'+variant,{two:false,unreviewed:true});await engine.render(f.project,f.id);await fs.appendFile(path.join(f.directory,'phases/a.md'),variant==='missing'?'\n[missing](<missing-file.txt>)\n':'\n[reference][local]\n[local]: input.txt\n');const binding=await capturedScanBinding(f),file=path.join(f.directory,'state.json'),before=await digest(file);assertRecord(binding,'scan-binding');await assert.rejects(engine.prepareReview(f.project,f.id,{scanBinding:binding}),variant==='missing'?/MISSING_PATH/:/Reference-style/);const state=await readJson(file);assert.equal(state.review??null,null);assert.equal(state.events.filter(e=>e.type==='review_prepared').length,0);assert.equal(await digest(file),before);return{validBinding:true,actualLintRefused:true,stateUnchanged:true};});
await test('current-api-scan-roots','Only explicitly authorized absolute roots permit project-external references',async()=>{const f=await fixture('api-roots',{two:false,unreviewed:true}),outside=path.join(root,'api-authorized-root');await fs.mkdir(outside);const file=path.join(outside,'input.txt');await fs.writeFile(file,'SYNTHETIC EXTERNAL SOURCE');await engine.render(f.project,f.id);await fs.appendFile(path.join(f.directory,'phases/a.md'),'\n[authorized source](<'+file.replaceAll('\\','/')+'>)\n');const binding=await capturedScanBinding(f);await assert.rejects(engine.prepareReview(f.project,f.id,{scanBinding:binding}),/OUTSIDE_SCOPE/);for(const roots of [['relative'],[null],'bad'])await assert.rejects(engine.prepareReview(f.project,f.id,{scanBinding:binding,allowRoots:roots}),/allowRoots/);const review=await engine.prepareReview(f.project,f.id,{scanBinding:binding,allowRoots:[outside]});assert.equal(review.phase,'pending_user_review');return{defaultRefused:true,explicitAccepted:true};});
await test('current-api-scan-version','Actual lint version must match caller and final seal versions',async()=>{const f=await fixture('api-version',{two:false,unreviewed:true});await engine.render(f.project,f.id);const phase=path.join(f.directory,'phases/a.md'),a=await fs.readFile(phase),b=Buffer.concat([a,Buffer.from('\nCURRENT VERSION B\n')]);await fs.writeFile(phase,b);const binding=await capturedScanBinding(f);let reads=0,injected=false;await patchMethod(fs,'readFile',old=>async function(p,...args){if(path.resolve(String(p))===phase){reads++;if(!injected){injected=true;return args[0]==='utf8'?a.toString('utf8'):a;}}return old(p,...args);},()=>assert.rejects(engine.prepareReview(f.project,f.id,{scanBinding:binding}),/changed.*scan|scan.*sealing/i));assert.ok(injected);assert.deepEqual(await fs.readFile(phase),b);assert.equal((await readJson(path.join(f.directory,'state.json'))).review??null,null);return{injected,phaseReads:reads,unlintedVersionNotSealed:true};});
await test('current-active-cache-review-conflict','A present conflicting active cache cannot replace the trusted complete begin',async()=>{const f=await fixture('active-cache-review',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),file=path.join(f.directory,'state.json'),state=await readJson(file);assert.equal(state.activeExecutions[0].runId,run.runId);state.activeExecutions[0].reviewDigest='0'.repeat(64);assertRecord(state,'state');await writeJson(file,state);const before=await fs.readFile(file);let mkdirs=0;await patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},async()=>{await assert.rejects(engine.status(f.project,f.id),/Conflicting original review binding/);await assert.rejects(engine.taskContext(f.project,f.id,'a'),/Conflicting original review binding/);await assert.rejects(engine.begin(f.project,f.id,'a'),/Conflicting original review binding/);await assert.rejects(engine.submit(f.project,f.id,'a',envelope('submission',payload(f,run))),/Conflicting original review binding/);});assert.equal(mkdirs,0);assert.deepEqual(await fs.readFile(file),before);await assert.rejects(fs.stat(path.join(f.directory,'receipt-'+run.runId+'.json')),{code:'ENOENT'});return{schemaValid:true,mkdirs,originalBytesPreserved:true};});
await test('current-source-inventory','Current release has the exact closed member set including its inventory',async()=>{const inventory=await readJson(path.join(source,'scripts/lib/source-inventory.json'));assertRecord(inventory,'source-inventory');const actual=(await listFiles(source)).map(x=>x.split(path.sep).join('/')).sort();assert.deepEqual(actual,[...inventory.files].sort());assert.equal(actual.length,34);assert.ok(actual.includes('scripts/lib/source-inventory.json'));for(const change of [x=>x.files.pop(),x=>x.files.push(x.files[0]),x=>x.files.reverse()]){const altered=structuredClone(inventory);change(altered);assert.throws(()=>assertRecord(altered,'source-inventory'));}return{members:actual.length,exactSet:true,closedSortedInventory:true};});
await test('current-contract-handle-approval','Captured contract bytes must match approval before any acceptance command',async()=>{const f=await fixture('contract-handle-approval',{two:false,acceptance:[{id:'command',type:'command',description:'SYNTHETIC check marker',command:process.execPath,args:['-e',"require('fs').writeFileSync('marker-A.txt','A')"]},{id:'inspect',type:'review',description:'SYNTHETIC inspect bound result',requiredFiles:[]}]});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);const snapshot=await engine.reviewSnapshotEvidence(f.project,f.id,'a','inspect'),reviews=envelope('reviews',{records:{inspect:currentRecord(snapshot)}}),contract=path.join(f.directory,'contract.json'),a=await fs.readFile(contract),b=Buffer.from(a.toString('utf8').replaceAll('marker-A.txt','marker-B.txt'));assert.notDeepEqual(a,b);assert.equal(a.length,b.length);assertRecord(JSON.parse(b),'contract');let handles=0,spawns=0;const observed=await patchMethod(childProcess,'spawn',old=>(...args)=>{spawns++;return old(...args);},()=>patchMethod(fs,'open',old=>async function(p,flags,...args){const handle=await old(p,flags,...args);if(path.resolve(String(p))!==contract||flags!=='r')return handle;return wrapHandle(handle,{readFile:async(...readArgs)=>{await handle.readFile(...readArgs);handles++;return readArgs[0]==='utf8'?b.toString('utf8'):b;}});},()=>captureOutcome(engine.verify(f.project,f.id,'a',reviews))));assert.ok(handles>0);assert.ok(observed.error,'A captured unapproved command contract was accepted');assert.match(observed.error.message,/contract.*approv|approv.*contract/i);assert.equal(spawns,0);assert.deepEqual(await fs.readFile(contract),a);for(const name of ['marker-A.txt','marker-B.txt'])await assert.rejects(fs.stat(path.join(f.project,name)),{code:'ENOENT'});return{handles,spawns,sameLengthValidContract:true,ordinaryReadApprovedA:true,capturedUnapprovedBRefused:true};});
await test('current-reviews-wrapper-binding','Review source binds the complete wrapper including extensions',async()=>{const f=await fixture('reviews-wrapper',{two:false,acceptance:[{id:'check',type:'command',description:'SYNTHETIC observable command',command:process.execPath,args:['-e',"require('fs').writeFileSync('marker.txt','SYNTHETIC')"]},{id:'inspect',type:'review',description:'SYNTHETIC current review',requiredFiles:[]}]});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);const file=path.join(f.project,'reviews.json'),wrapper=envelope('reviews',{records:{inspect:currentRecord(await engine.reviewSnapshotEvidence(f.project,f.id,'a','inspect'))},extensions:{sourceNote:'original'}});await writeJson(file,wrapper);const input=await engine.readReviewsEvidence(file),changed=structuredClone(input.reviews);changed.extensions.sourceNote='changed';assertRecord(changed,'reviews');let spawns=0;await patchMethod(childProcess,'spawn',old=>(...args)=>{spawns++;return old(...args);},()=>assert.rejects(engine.verify(f.project,f.id,'a',changed,{reviewsSource:input.reviewsSource}),/source JSON.*facts differ/));assert.equal(spawns,0);await assert.rejects(fs.stat(path.join(f.project,'marker.txt')),{code:'ENOENT'});wrapper.records.inspect=currentRecord(await engine.reviewSnapshotEvidence(f.project,f.id,'a','inspect'));await writeJson(file,wrapper);const fresh=await engine.readReviewsEvidence(file);assert.equal((await engine.verify(f.project,f.id,'a',fresh.reviews,{reviewsSource:fresh.reviewsSource})).taskStatus,'verified');assert.equal(await fs.readFile(path.join(f.project,'marker.txt'),'utf8'),'SYNTHETIC');return{wrapperExtensionMismatchRefused:true,initialSpawns:spawns,freshWholeWrapperAccepted:true};});
await test('current-command-control-errors','A simulated observed close zero with a postspawn control error never verifies',async()=>{const f=await fixture('command-control-errors',{two:false,acceptance:[{id:'check',type:'command',description:'SYNTHETIC postspawn control boundary',command:process.execPath,args:['-e','process.exit(0)']}]});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);const{PassThrough}=await import('node:stream');let spawned=0,closeObserved=false;await patchMethod(childProcess,'spawn',()=>()=>{spawned++;const child=new EventEmitter();child.pid=987654;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;queueMicrotask(()=>{child.emit('spawn');child.emit('error',Object.assign(new Error('SYNTHETIC postspawn EPERM'),{code:'EPERM'}));child.stdout.end();child.stderr.end();closeObserved=true;child.emit('close',0,null);});return child;},()=>assert.rejects(engine.verify(f.project,f.id,'a'),/Acceptance.*failed/));assert.equal(spawned,1);assert.ok(closeObserved);const state=await engine.status(f.project,f.id),attempt=state.tasks.a.lastAcceptance;assert.equal(state.tasks.a.status,'pending_acceptance');assert.equal(attempt.status,'failed');assert.equal(attempt.processResult.processState,'closed');assert.equal(attempt.processResult.exitCode,0);assert.ok(attempt.processResult.controlErrors.length);return{simulatedChild:true,spawned,closeObserved,rawExitCode:0,controlErrorRefused:true};});
await test('current-ui-duplicate-refusal','Duplicate frontmatter and UI keys or sections fail the local metadata check',async()=>{const copy=path.join(root,'ui-duplicates','sciautoharness');await fs.mkdir(path.dirname(copy),{recursive:true});await fs.cp(source,copy,{recursive:true});const skill=path.join(copy,'SKILL.md'),ui=path.join(copy,'agents/openai.yaml'),checker=path.join(copy,'scripts/check-skill.mjs'),original=await fs.readFile(skill,'utf8'),originalUi=await fs.readFile(ui,'utf8'),checked=[];for(const variant of ['frontmatter-name','frontmatter-description','ui-key','ui-section']){await fs.writeFile(skill,variant==='frontmatter-name'?original.replace(/^name:.*$/m,x=>x+'\n'+x):variant==='frontmatter-description'?original.replace(/^description:.*$/m,x=>x+'\n'+x):original);await fs.writeFile(ui,variant==='ui-key'?originalUi.replace(/^  display_name:.*$/m,x=>x+'\n'+x):variant==='ui-section'?originalUi+'\n'+originalUi:originalUi);const before=[await digest(skill),await digest(ui)],result=spawnSync(process.execPath,[checker],{cwd:work,encoding:'utf8',shell:false,windowsHide:true});assert.ifError(result.error);assert.notEqual(result.status,0,variant);assert.match(result.stdout+result.stderr,/duplicat|repeat/i,variant);assert.deepEqual([await digest(skill),await digest(ui)],before);checked.push(variant);}return{checked,checkerReadOnly:true};});
await test('current-existing-final-format-preflight','An unsupported runtime-owned same-run final is refused before lock or control writes',async()=>{
 const f=await fixture('existing-final-format',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),file=path.join(f.directory,'receipt-'+run.runId+'.json');await fs.writeFile(file,JSON.stringify({runId:run.runId,executor:'codex-native',reference:'SYNTHETIC unsupported final',result:'ok'}),{flag:'wx'});const before=await publicSnapshot(f.project);let mkdirs=0;await patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},()=>assert.rejects(submitFacts(f.project,f.id,'a',payload(f,run)),/format|namespace|schema|kind/i));assert.equal(mkdirs,0);assert.deepEqual(await publicSnapshot(f.project),before);return{mkdirs,unsupportedFinalPreserved:true};
});
for(const drift of ['none','approval','dependency'])await test('current-state-commit-recovery-'+drift,'A published complete receipt survives actual state commit failure and later eligibility drift',async()=>{
 const f=await fixture('state-commit-'+drift,{two:drift==='dependency'});await approve(f);if(drift==='dependency')await finish(f,'a');const step=drift==='dependency'?'b':'a',run=await engine.begin(f.project,f.id,step),value=payload(f,run,{outcome:'negative'}),final=path.join(f.directory,'receipt-'+run.runId+'.json');let hits=0;
 await patchMethod(fs,'rename',old=>async function(from,to,...args){if(key(to)===key(path.join(f.directory,'state.json'))){const staged=JSON.parse(await fs.readFile(from,'utf8'));if(staged.events.some(e=>e.type==='execution_receipt'&&e.runId===run.runId)){hits++;throw new Error('SYNTHETIC actual state commit failure');}}return old.call(this,from,to,...args);},()=>assert.rejects(submitFacts(f.project,f.id,step,value),/actual state commit failure/));
 assert.equal(hits,2);assertRecord(await readJson(final),'receipt');const bytes=await fs.readFile(final),before=await engine.status(f.project,f.id);assert.equal(before.activeExecutions[0].runId,run.runId);assert.equal(closedCount(before),drift==='dependency'?1:0);
 if(drift==='approval')await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC changed approval input');if(drift==='dependency')await emit(f,'a','SYNTHETIC changed dependency');
 const recovered=await submitFacts(f.project,f.id,step,value);assert.equal(recovered.executionClosed,true);assert.equal(recovered.replayed,true);assert.equal(recovered.acceptedForVerification,drift==='none');const after=await engine.status(f.project,f.id);assert.equal(after.activeExecutions.length,0);assert.equal(after.tasks[step].status,drift==='none'?'pending_acceptance':'stale');assert.equal(after.tasks[step].outcome,'negative');assert.deepEqual(await fs.readFile(final),bytes);assert.equal(after.events.filter(e=>e.type==='execution_receipt'&&e.runId===run.runId).length,1);const replay=await submitFacts(f.project,f.id,step,value);assert.equal(replay.replayed,true);await assert.rejects(submitFacts(f.project,f.id,step,{...value,summary:'SYNTHETIC changed fact'}),/Conflicting/);assert.deepEqual(await fs.readFile(final),bytes);return{drift,stateCommitFailures:hits,originalRunId:run.runId,sameFinalBytes:true,singleClosure:true,acceptedForVerification:recovered.acceptedForVerification};
});
for(const damage of ['dependency','contract'])await test('current-cli-active-damage-'+damage,'A live local child retains its original execution while damaged dependencies or contract block acceptance',async()=>{
 const f=await fixture('cli-active-damage-'+damage,{two:damage==='dependency'});await approve(f);if(damage==='dependency')await finish(f,'a');const step=damage==='dependency'?'b':'a',ready=path.join(f.project,'ready'),release=path.join(f.project,'release');await writeJson(path.join(f.project,'host-child-expectations.json'),{host:'codex',cwd:f.project,readyFile:ready,releaseFile:release,emitArtifact:false});let pending,ended,run,childPid;
 try{
  const originalSpawn=childProcess.spawn;childProcess.spawn=function(...args){const child=originalSpawn.apply(this,args);childPid=child.pid;return child;};syncBuiltinESMExports();try{pending=captureOutcome(runLeafFixture(f.project,f.id,step,{host:'codex',executable:mhChild,timeoutMs:60000}));await waitForReady(()=>fs.access(ready).then(()=>true,()=>false));}finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}
  const original=await engine.status(f.project,f.id);run=original.tasks[step];assert.ok(Number.isInteger(childPid));process.kill(childPid,0);
  if(damage==='dependency')await emit(f,'a','SYNTHETIC changed while child active');else{const file=path.join(f.directory,'contract.json'),c=await readJson(file);delete c.tasks;await writeJson(file,c);}
  const context=await engine.taskContext(f.project,f.id,step);assert.equal(context.activeExecutions[0].runId,run.runId);assert.equal(context.activeExecutions[0].executionBinding.executor,'codex-cli');assert.equal(context.canBegin,false);if(damage==='contract')assert.equal(context.kind,'recovery-context');
  let spawns=0;await patchMethod(childProcess,'spawn',old=>(...args)=>{spawns++;return old(...args);},async()=>{await assert.rejects(engine.begin(f.project,f.id,step));await assert.rejects(engine.verify(f.project,f.id,step));await assert.rejects(engine.prepareReview(f.project,f.id));});assert.equal(spawns,0);process.kill(childPid,0);assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,run.runId);
  await fs.writeFile(release,'SYNTHETIC actual child release');ended=await pending;assert.ok(ended.ok,ended.error?.message);assert.equal(ended.value.executionClosed,true);assert.equal(ended.value.acceptedForVerification,false);const receipt=await readJson(ended.value.receipt.path);assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,0);assert.equal(receipt.process.pid,childPid);assert.equal(receipt.executionBinding.executor,'codex-cli');const bytes=await fs.readFile(ended.value.receipt.path),closed=await readJson(path.join(f.directory,'state.json'));assert.equal(closed.activeExecutions.length,0);assert.equal(closed.tasks[step].status,'stale');assert.equal((await engine.submit(f.project,f.id,step,receipt)).replayed,true);assert.deepEqual(await fs.readFile(ended.value.receipt.path),bytes);assert.equal((await readJson(path.join(f.directory,'state.json'))).events.filter(e=>e.type==='execution_receipt'&&e.runId===run.runId).length,1);return{damage,childPid,actualChildClosed:true,exitCode:0,guardSpawns:spawns,originalRunId:run.runId,staleClosure:true,fullReceiptReplay:true};
 }finally{if(pending&&!ended){await fs.writeFile(release,'SYNTHETIC failure-site release');ended=await pending;if(!ended.ok&&ended.error?.processResult?.processState==='unknown-active')throw ended.error;}}
});
await test('current-path-check-missing-package-cli','The independent path checker reports missing package with real exit one and structured failure',async()=>{const f=await fixture('missing-package-cli',{unreviewed:true,two:false}),before=await publicSnapshot(f.project),result=spawnSync(process.execPath,[path.join(source,'scripts/check-harness-paths.mjs'),'--project',f.project,'--package',path.join(f.project,'missing-package')],{cwd:work,encoding:'utf8',shell:false,windowsHide:true});assert.ifError(result.error);assert.equal(result.status,1);const report=JSON.parse(result.stdout);assert.equal(report.ok,false);assert.ok(report.issues.length);assert.deepEqual(await publicSnapshot(f.project),before);return{exitCode:result.status,ok:report.ok,issues:report.issues.length,projectUnchanged:true};});
for(const point of ['initial','initial-corrupt','after-command','before-commit'])await test('current-acceptance-state-source-'+point,'Acceptance binds the locked state version and preserves any newer state before success or failure persistence',async()=>{
 const f=await fixture('acceptance-state-source-'+point,{two:false,acceptance:[{id:'command',type:'command',description:'SYNTHETIC observable command',command:process.execPath,args:['-e',"require('node:fs').writeFileSync('probe-marker','SYNTHETIC acceptance ran')"]}]});await approve(f);const file=path.join(f.directory,'state.json'),marker=path.join(f.project,'probe-marker'),first=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',first);const A=await fs.readFile(file);await verifyFacts(f.project,f.id,'a');await engine.rework(f.project,f.id,'a',{runId:first.runId,reason:'SYNTHETIC second legitimate source run',reference:'SYNTHETIC current state source fixture'});const second=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',second);const originalB=await fs.readFile(file),B=point==='initial-corrupt'?Buffer.from('{ SYNTHETIC incomplete newer current state'):originalB;assertRecord(JSON.parse(A),'state');assertRecord(JSON.parse(originalB),'state');assert.notEqual(first.runId,second.runId);assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,0);await fs.rename(marker,path.join(f.project,'preserved-setup-marker'));await fs.writeFile(path.join(f.project,'preserved-state-a.json'),A,{flag:'wx'});await fs.writeFile(path.join(f.project,'preserved-state-b.json'),B,{flag:'wx'});await fs.writeFile(file,A);
 let reads=0,injected=false,spawns=0,error,result;const oldRead=fs.readFile,oldWrite=fs.writeFile,oldSpawn=childProcess.spawn;try{
  fs.readFile=async function(target,...args){const bytes=await oldRead.call(this,target,...args);if(!injected&&((point.startsWith('initial')&&key(target)===key(file)&&++reads===2)||(point==='after-command'&&String(target).startsWith(path.join(f.directory,'check-'+first.runId+'-'))))){await oldWrite(file,B);injected=true;}return bytes;};
  fs.writeFile=async function(target,...args){const value=await oldWrite.call(this,target,...args);if(!injected&&point==='before-commit'&&String(target).startsWith(path.join(f.directory,'acceptance-'+first.runId+'-'))){const report=JSON.parse(String(args[0]));if(report.status==='passed'){await oldWrite(file,B);injected=true;}}return value;};childProcess.spawn=function(...args){spawns++;return oldSpawn.apply(this,args);};syncBuiltinESMExports();try{result=await verifyFacts(f.project,f.id,'a');}catch(e){error=e;}
 }finally{fs.readFile=oldRead;fs.writeFile=oldWrite;childProcess.spawn=oldSpawn;syncBuiltinESMExports();}
 assert.ok(injected);assert.ok(error);assert.equal(error.code,'HARNESS_ACCEPTANCE_SOURCE_CHANGED');assert.equal(result,undefined);assert.deepEqual(await fs.readFile(file),B);assert.equal(spawns,point.startsWith('initial')?0:1);assert.equal(await fs.access(marker).then(()=>true,()=>false),!point.startsWith('initial'));if(point==='after-command')assert.ok(error.actionError,'Original postflight error was lost');return{point,sourceRunsActuallyClosed:true,firstRunId:first.runId,newerRunId:second.runId,initialOrdinaryReads:reads,acceptanceSpawns:spawns,newerStatePreserved:true,errorCode:error.code,originalErrorPreserved:point!=='after-command'||!!error.actionError};
});
await test('current-acceptance-contract-source','The execution contract and stable approved contract must be the same initial payload',async()=>{const f=await fixture('acceptance-contract-source',{two:false,acceptance:[{id:'command',type:'command',description:'SYNTHETIC approved B command',command:process.execPath,args:['-e',"require('node:fs').writeFileSync('approved-b-marker','SYNTHETIC approved B')"]}]});await approve(f);const file=path.join(f.directory,'contract.json'),approved=await fs.readFile(file),other=JSON.parse(approved);other.tasks[0].acceptance[0].args=['-e',"require('node:fs').writeFileSync('unapproved-a-marker','SYNTHETIC unapproved A')"];const unapproved=Buffer.from(JSON.stringify(other,null,2)+'\n');assertRecord(other,'contract');const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);const stateFile=path.join(f.directory,'state.json'),before=await fs.readFile(stateFile);let reads=0,injected=false,spawns=0,error;await patchMethod(childProcess,'spawn',old=>(...args)=>{spawns++;return old(...args);},()=>patchMethod(fs,'readFile',old=>async function(target,...args){const bytes=await old.call(this,target,...args);if(key(target)===key(file)&&++reads===2){injected=true;return args[0]==='utf8'?unapproved.toString('utf8'):unapproved;}return bytes;},async()=>{try{await verifyFacts(f.project,f.id,'a');}catch(e){error=e;}}));assert.ok(injected);assert.ok(error);assert.equal(error.code,'HARNESS_ACCEPTANCE_SOURCE_CHANGED');assert.equal(spawns,0);for(const marker of['approved-b-marker','unapproved-a-marker'])await assert.rejects(fs.stat(path.join(f.project,marker)),{code:'ENOENT'});assert.deepEqual(await fs.readFile(file),approved);assert.deepEqual(await fs.readFile(stateFile),before);return{ordinaryContractReads:reads,unapprovedOrdinaryPayload:hash(unapproved),stableApprovedPayload:hash(approved),spawns,statePreserved:true,contractPreserved:true,errorCode:error.code};});


async function objectFacts(file){const s=await fs.stat(file,{bigint:true});return{dev:String(s.dev),ino:String(s.ino),mode:String(s.mode)};}
function ntfsFacts(file,{privateAcl=false}={}){
 const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
 const script=String.raw`$ErrorActionPreference='Stop'
function Native-Path([string]$p){if($p.StartsWith('\\?\')){return $p};if($p.StartsWith('\\')){return '\\?\UNC\'+$p.Substring(2)};return '\\?\'+$p}
$taskPath=Native-Path ${quote(file)}
$item=Get-Item -LiteralPath $taskPath -Force
$acl=Get-Acl -LiteralPath $taskPath
$sections=[Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
$streams=[Collections.Generic.List[object]]::new()
foreach($stream in @(Get-Item -LiteralPath $taskPath -Stream '*' -Force)){if($stream.Stream -ceq ':$DATA'){continue};$bytes=[IO.File]::ReadAllBytes($taskPath+':'+[string]$stream.Stream);$streams.Add([ordered]@{name=[string]$stream.Stream;bytes=[Convert]::ToBase64String($bytes)})}
$facts=[ordered]@{ownerSid=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;groupSid=$acl.GetGroup([Security.Principal.SecurityIdentifier]).Value;sddl=$acl.GetSecurityDescriptorSddlForm($sections);attributes=[string][int64]$item.Attributes;streams=$streams.ToArray()}
if(${privateAcl?'$true':'$false'}){
 $raw=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
 $rules=@(foreach($ace in $raw.DiscretionaryAcl){@{type=[int]$ace.AceType;flags=[int]$ace.AceFlags;mask=$ace.AccessMask;sid=$ace.SecurityIdentifier.Value}})
 $facts.privateAcl=@{present=$null -ne $raw.DiscretionaryAcl;protected=$acl.AreAccessRulesProtected;aces=$rules}
}
$facts|ConvertTo-Json -Depth 8 -Compress`;
 const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{shell:false,windowsHide:true,timeout:30000});assert.ifError(r.error);assert.equal(r.status,0,r.stderr?.toString('utf8'));const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.stdout));assert.ok(Array.isArray(value.streams));value.streams=Object.fromEntries(value.streams.map(s=>[s.name,s.bytes]).sort(([a],[b])=>a<b?-1:a>b?1:0));return value;
}
await test('current-install-empty-directories','Preexisting empty directory identities survive installation and exact rollback',async()=>{const f=await installFixture('empty-directories'),directory=path.join(f.target,'agents');await fs.mkdir(directory,{recursive:true});const tracked=[f.target,directory],before=await Promise.all(tracked.map(objectFacts)),personal=await fs.readFile(f.agents),done=await applyInstall(await previewInstall(f.options));await rollbackInstall(done.rollbackManifest);for(let i=0;i<tracked.length;i++)assert.deepEqual(await objectFacts(tracked[i]),before[i]);assert.deepEqual(await fs.readdir(f.target),['agents']);assert.deepEqual(await fs.readdir(directory),[]);assert.deepEqual(await fs.readFile(f.agents),personal);for(const name of ['references','scripts'])await assert.rejects(fs.stat(path.join(f.target,name)),{code:'ENOENT'});return{existingDirectories:2,identitiesPreserved:true,createdDirectoriesRemoved:true};});
await test('current-install-directory-streams','File and directory security and ADS including named $DATA survive both directions',async()=>{if(process.platform!=='win32')return{notApplicable:'Windows named streams required'};const f=await installFixture('directory-streams'),directory=path.join(f.target,'agents'),license=path.join(f.target,'LICENSE');await fs.mkdir(directory,{recursive:true});const old=Buffer.from('SYNTHETIC original LICENSE\r\n');await fs.writeFile(license,old);const objects=[f.target,directory,license,f.agents],streams=['$DATA','current-stream'],expected=new Map(),personal=await fs.readFile(f.agents);for(const file of objects){const values={};for(const name of streams){const bytes=Buffer.from('SYNTHETIC '+path.basename(file)+' '+name);await fs.writeFile(file+':'+name,bytes);values[name]=bytes.toString('base64');}const facts=ntfsFacts(file);assert.deepEqual(Object.keys(facts.streams),streams);assert.deepEqual(facts.streams,values);expected.set(file,{id:await objectFacts(file),facts});}const plan=await previewInstall({...f.options,replaceSkill:true});for(const relative of ['', 'agents'])assert.deepEqual(plan.canonicalBefore.directories.find(d=>d.relative===relative).security.namedStreams.map(s=>s.name),streams);const done=await applyInstall(plan);for(const stage of ['installed','restored']){if(stage==='restored')await rollbackInstall(done.rollbackManifest);for(const file of objects){assert.deepEqual(await objectFacts(file),expected.get(file).id);assert.deepEqual(ntfsFacts(file),expected.get(file).facts);}}assert.deepEqual(await fs.readFile(license),old);assert.deepEqual(await fs.readFile(f.agents),personal);assert.deepEqual(await fs.readdir(directory),[]);return{ntfsChecked:true,objects:objects.length,namedDollarData:true};});
await test('current-install-container-stream-drift','Container ADS changed during apply prevents installed acceptance',async()=>{if(process.platform!=='win32')return{notApplicable:'Windows named streams required'};const f=await installFixture('container-stream-drift',{copy:true}),license=path.join(f.target,'LICENSE');await fs.writeFile(license,'SYNTHETIC original LICENSE');const plan=await previewInstall(f.options),bytes=Buffer.from('SYNTHETIC container drift');let hit=false,error;await patchMethod(fs,'open',old=>async function(file,flags,...args){const handle=await old(file,flags,...args);if(!hit&&key(file)===key(license)&&flags==='r+'){hit=true;await fs.writeFile(f.skills+':current-drift',bytes);}return handle;},async()=>{try{await applyInstall(plan);}catch(e){error=e;}});assert.ok(hit);assert.ok(error);assert.equal(error.recovery.stage,'verify-installed');assert.equal(error.recovery.completedTargets,plan.changes.length);assert.match(error.message,/container\/anchor.*changed/i);const record=await readJson(error.recovery.manifest);assertRecord(record,'install-record');assert.equal(record.status,'prepared');assert.equal(ntfsFacts(f.skills).streams['current-drift'],bytes.toString('base64'));await assert.rejects(rollbackInstall(error.recovery.manifest),/completed installed/i);return{postflightRefused:true,actualPrefix:record.completedTargets,preparedFactsPreserved:true};});
await test('current-install-config-drift-before-roots','Configuration drift refuses before creating target and backup parent directories',async()=>{const f=await installFixture('config-before-roots'),config=path.join(f.home,'config.toml');await fs.writeFile(config,'SYNTHETIC config\n');const options={...f.options,skillRoot:path.join(f.dir,'not-created','skills')},plan=await previewInstall(options),personal=await fs.readFile(f.agents),changed=Buffer.from('SYNTHETIC user changed config\n');await fs.writeFile(config,changed);await assert.rejects(applyInstall(plan),/changed after preview|fresh plan/i);assert.deepEqual(await fs.readFile(config),changed);assert.deepEqual(await fs.readFile(f.agents),personal);for(const file of [path.dirname(options.skillRoot),path.join(f.home,'harness-install-backups')])await assert.rejects(fs.stat(file),{code:'ENOENT'});return{configPreserved:true,rootsNotCreated:true};});
await test('execution-focus-managed-rule','Reviewed new managed-rule preview preserves exact outside/configuration bytes without applying an install',async()=>{
 const f=await installFixture('focus-managed-rule');
 const before='<!-- sciautoharness:start -->\n## Complex task harness\nSYNTHETIC previous reviewed route.\n<!-- sciautoharness:end -->';
 const after=defaultRule(f.target).trimEnd();
 assert.match(after,/first route commitment, method additions and stage release/);
 assert.match(after,/references\/execution-judgment\.md after context/);
 assert.match(after,/two or three user-facing questions/);
 assert.match(after,/wait for actual user feedback before the next phase/);
 assert.match(after,/Technical acceptance and material-change review remain separate/);
 const prefix=Buffer.from('\ufeffSYNTHETIC personal 中文\r\n');
 const suffix=Buffer.from('\r\nSYNTHETIC suffix 无末尾换行');
 const original=Buffer.concat([prefix,Buffer.from(before),suffix]);
 await fs.writeFile(f.agents,original);
 const config=path.join(f.home,'config.toml'),configBytes=Buffer.from('SYNTHETIC_CONFIG=true\r\n');
 await fs.writeFile(config,configBytes);const snapshot=await publicSnapshot(f.dir);
 const plan=await previewInstall({...f.options,reviewedRule:{before,after}});
 assertRecord(plan,'install-plan');assert.equal(plan.summary.agentsRule,defaultRule(f.target));
 assert.equal(plan.summary.configTomlChanged,false);
 const change=plan.changes.find(c=>c.role==='instructions');assert.ok(change);
 assert.deepEqual(Buffer.from(change.bytes,'base64'),Buffer.concat([prefix,Buffer.from(after),suffix]));
 assert.deepEqual(await fs.readFile(f.agents),original);assert.deepEqual(await fs.readFile(config),configBytes);
 assert.deepEqual(await publicSnapshot(f.dir),snapshot);
 return{previewOnly:true,installApplied:false,rule:plan.summary.agentsRule,exactOutsideBytes:true,configurationUnchanged:true,fixtureUnchanged:true};
});

await test('current-install-reviewed-rule','Exact custom block review preserves outside bytes, inode, no-op and rollback',async()=>{const f=await installFixture('reviewed-rule'),before=defaultRule(f.target).trimEnd().replace('## Complex task harness','## SYNTHETIC custom policy'),after=before.replace('## SYNTHETIC custom policy','## SYNTHETIC reviewed policy'),prefix=Buffer.from('\ufeffSYNTHETIC personal 中文\r\n'),suffix=Buffer.from('\r\nSYNTHETIC suffix 无末尾换行'),original=Buffer.concat([prefix,Buffer.from(before),suffix]);await fs.writeFile(f.agents,original);const identity=await objectFacts(f.agents),snapshot=await publicSnapshot(f.dir);await assert.rejects(previewInstall(f.options),/custom.*reviewed/i);assert.deepEqual(await publicSnapshot(f.dir),snapshot);const done=await applyInstall(await previewInstall({...f.options,reviewedRule:{before,after}}));assert.deepEqual(await fs.readFile(f.agents),Buffer.concat([prefix,Buffer.from(after),suffix]));assert.deepEqual(await objectFacts(f.agents),identity);assert.equal((await applyInstall(await previewInstall({...f.options,reviewedRule:{before:after,after}}))).status,'already-installed');await rollbackInstall(done.rollbackManifest);assert.deepEqual(await fs.readFile(f.agents),original);assert.deepEqual(await objectFacts(f.agents),identity);return{outsideBytesExact:true,inodePreserved:true,noop:true};});
for(const context of ['default','custom','absent'])await test('current-install-reviewed-before-'+context,'Reviewed before is bound even when the current desired block already matches',async()=>{const f=await installFixture('reviewed-before-'+context),after=defaultRule(f.target).trimEnd(),actual=context==='custom'?after.replace('## Complex task harness','## SYNTHETIC custom'):after;await fs.writeFile(f.agents,context==='absent'?'SYNTHETIC personal without a block':'SYNTHETIC prefix\r\n'+actual+'\r\nSYNTHETIC suffix');const before=await publicSnapshot(f.dir);let helpers=0;await patchMethod(childProcess,'spawnSync',old=>(...args)=>{helpers++;return old(...args);},()=>assert.rejects(previewInstall({...f.options,reviewedRule:{before:'SYNTHETIC WRONG EXACT BEFORE',after}}),/before differs|before block is absent/i));assert.equal(helpers,0);assert.deepEqual(await publicSnapshot(f.dir),before);await assert.rejects(fs.stat(path.join(f.home,'harness-install-backups')),{code:'ENOENT'});return{context,helpers};});
for(const variant of ['missing-space','unknown-end','duplicate','unclosed','after-missing','after-duplicate','after-wrong-end'])await test('current-install-marker-'+variant,'Malformed current markers refuse without helper or installation writes',async()=>{const f=await installFixture('marker-'+variant),block=defaultRule(f.target).trimEnd();let actual=block,reviewedRule;if(variant==='missing-space')actual='<!--sciautoharness:start-->\nSYNTHETIC';if(variant==='unknown-end')actual='<!-- sciautoharness:finish -->';if(variant==='duplicate')actual=block+'\n'+block;if(variant==='unclosed')actual='<!-- sciautoharness:start -->\nSYNTHETIC';if(variant.startsWith('after-'))reviewedRule={before:block,after:variant==='after-missing'?'SYNTHETIC text without markers':variant==='after-duplicate'?block+'\n'+block:block.replace('<!-- sciautoharness:end -->','<!-- sciautoharness:finish -->')};await fs.writeFile(f.agents,'SYNTHETIC personal\r\n'+actual);const before=await publicSnapshot(f.dir);let helpers=0;await patchMethod(childProcess,'spawnSync',old=>(...args)=>{helpers++;return old(...args);},()=>assert.rejects(previewInstall({...f.options,...(reviewedRule?{reviewedRule}:{})}),/markers|marker pair/i));assert.equal(helpers,0);assert.deepEqual(await publicSnapshot(f.dir),before);for(const file of [f.target,path.join(f.home,'harness-install-backups')])await assert.rejects(fs.stat(file),{code:'ENOENT'});return{variant,helpers,writes:0};});
async function bindingFixture(name,{primeDirectoryStream=false}={}){const f=await installFixture(name,{copy:true});if(primeDirectoryStream&&process.platform==='win32'){const stream=path.join(f.target,'agents')+':$DATA:$DATA';await fs.writeFile(stream,'SYNTHETIC initialize directory archive attribute');await fs.unlink(stream);}await fs.writeFile(path.join(f.target,'LICENSE'),'SYNTHETIC original LICENSE requiring backup\r\n');const done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest),ci=record.changes.findIndex(c=>c.relative==='LICENSE'),ii=record.changes.findIndex(c=>c.role==='instructions');assert.ok(ci>=0&&ii>=0);assert.equal(record.changes[ci].kind,'replace-skill');return{...f,done,record,ci,ii};}
function currentReseal(record){sealSyntheticManifest(record);assertRecord(record,'install-record');const{bindingDigest,status,...bound}=record;assert.equal(bindingDigest,hash(canonicalJson(bound)));return record;}
await test('current-install-record-binding','Correctly resealed shape-valid records retain original plan, role, slot and inventory bindings',async()=>{const f=await bindingFixture('record-binding'),manifest=f.done.rollbackManifest,original=await fs.readFile(manifest),base=f.record,canonical=r=>r.changes[f.ci],instruction=r=>r.changes[f.ii],other=base.sourceSnapshot.files.find(x=>x.relative!=='LICENSE').relative;const variants=[
 ['host',r=>r.host='claude-code',/conflicts with original plan: host/],
 ['instruction-file',r=>r.instructionFile='CLAUDE.md',/conflicts with original plan: instructionFile/],
 ['home',r=>r.hostHome=path.join(f.dir,'different-home'),/storage is outside fixed installation backup/],
 ['target-root',r=>r.targetSkill=path.join(f.dir,'different-target'),/conflicts with original plan: targetSkill/],
 ['source-root',r=>r.source=path.join(f.dir,'different-source'),/conflicts with original plan: source/],
 ['instruction-target',r=>instruction(r).target=path.join(f.dir,'other','AGENTS.md'),/change differs from original plan/],
 ['change-source',r=>canonical(r).source=path.join(f.dir,'other-source','LICENSE'),/change differs from original plan/],
 ['change-relative',r=>canonical(r).relative=other,/change differs from original plan/],
 ['backup-slot',r=>canonical(r).backup=path.join(path.dirname(manifest),'999.bin'),/Invalid backup\/write progress/],
 ['plan-path',r=>r.planFile.path=path.join(f.dir,'different-plan.json'),/storage is outside fixed installation backup/],
 ['plan-digest',r=>r.planDigest=hash('SYNTHETIC different plan'),/Original reviewed plan differs from manifest/],
 ['duplicate-change',r=>r.changes.push(structuredClone(r.changes[0])),/Incomplete installation journal/],
 ['directory-created',r=>r.directories[0].created=!r.directories[0].created,/Invalid canonical directory progress/],
 ['partial-count',r=>r.completedTargets--,/Incomplete installation journal/],
 ['unconfirmed-write',r=>canonical(r).written=false,/Invalid backup\/write progress/],
 ['unsaved-backup',r=>canonical(r).backupSaved=false,/Invalid backup\/write progress/],
 ['source-inventory',r=>r.sourceSnapshot.files.pop(),/conflicts with original plan: sourceSnapshot/],
 ['final-inventory',r=>r.canonicalAfter.files.pop(),/Installed inventory is not the complete canonical source/],
 ['storage-container',r=>r.containersAfter.pop(),/Invalid installation storage identity journal/]
 ];const license=await fs.readFile(base.changes[f.ci].target);variants.push(['change-role',r=>{const{relative,source,sourceMode,...rest}=canonical(r);r.changes[f.ci]={...rest,role:'instructions',kind:'append-rule',bytes:license.toString('base64')};},/change differs from original plan/],['change-kind',r=>Object.assign(canonical(r),{kind:'create-skill',before:null,beforeIdentity:null,beforeSecurity:null,backup:null,backupSaved:false,backupSnapshot:null}),/change differs from original plan/]);const checked=[];
 for(const[name,mutate,expected]of variants){const forged=structuredClone(base);mutate(forged);currentReseal(forged);const bytes=Buffer.from(JSON.stringify(forged,null,2)+'\n');await fs.writeFile(manifest,bytes);const before=await publicSnapshot(f.dir);let error;try{await rollbackInstall(manifest);}catch(e){error=e;}assert.ok(error,name);assert.match(error.message,expected,name);assert.equal(error.recovery?.stage,'manifest-preflight',name);assert.equal(error.recovery?.completedTargets,0,name);assert.deepEqual(await publicSnapshot(f.dir),before,name);assert.deepEqual(await fs.readFile(manifest),bytes,name);checked.push(name);await fs.writeFile(manifest,original);}
 await rollbackInstall(manifest);return{checked,resealedShapeValid:true,deepBindingGuard:true};});
await test('current-install-prepared-refusal','A valid prepared record remains ineligible for rollback',async()=>{const f=await bindingFixture('prepared-refusal'),record=currentReseal({...structuredClone(f.record),status:'prepared'});await writeJson(f.done.rollbackManifest,record);const before=await publicSnapshot(f.dir);await assert.rejects(rollbackInstall(f.done.rollbackManifest),/Only a completed installed transaction/);assert.deepEqual(await publicSnapshot(f.dir),before);return{preparedRefused:true};});
await test('current-install-original-inode-binding','Resealed current caches cannot rebind an original file object',async()=>{const f=await bindingFixture('original-inode'),target=f.record.changes[f.ci].target,kept=path.join(f.dir,'preserved-original-license'),bytes=await fs.readFile(target);await fs.rename(target,kept);await fs.writeFile(target,bytes,{flag:'wx'});const s=await fs.stat(target,{bigint:true}),replacement={dev:String(s.dev),ino:String(s.ino),nlink:String(s.nlink),mode:String(s.mode)},forged=structuredClone(f.record);forged.changes[f.ci].afterIdentity=replacement;forged.canonicalAfter.files.find(x=>x.relative==='LICENSE').identity=replacement;currentReseal(forged);await writeJson(f.done.rollbackManifest,forged);const before=await publicSnapshot(f.dir),manifestBytes=await fs.readFile(f.done.rollbackManifest);let error;try{await rollbackInstall(f.done.rollbackManifest);}catch(e){error=e;}assert.ok(error);assert.match(error.message,/Original canonical file identity\/security cannot be rebound/);assert.equal(error.recovery.stage,'manifest-preflight');assert.equal(error.recovery.completedTargets,0);assert.deepEqual(await publicSnapshot(f.dir),before);assert.deepEqual(await fs.readFile(f.done.rollbackManifest),manifestBytes);assert.deepEqual(await fs.readFile(kept),bytes);return{shapeValid:true,resealed:true,originalObjectAuthoritative:true};});
await test('current-install-extra-empty-directory','An unknown empty directory in the canonical tree is refused before helpers or writes',async()=>{const f=await installFixture('extra-empty-directory',{copy:true});await fs.mkdir(path.join(f.target,'unknown-empty-directory'));const before=await publicSnapshot(f.dir);let helpers=0,mkdirs=0;await patchMethod(childProcess,'spawnSync',old=>(...args)=>{helpers++;return old(...args);},()=>patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},()=>assert.rejects(previewInstall(f.options),/directory|member|tree|inventory/i)));assert.equal(helpers,0);assert.equal(mkdirs,0);assert.deepEqual(await publicSnapshot(f.dir),before);assert.deepEqual(await fs.readdir(path.join(f.target,'unknown-empty-directory')),[]);return{helpers,mkdirs,unknownEmptyDirectoryPreserved:true};});
await test('current-install-explicit-replacement','Replacing a known changed current file requires explicit replacement authorization before writes',async()=>{const f=await installFixture('explicit-replacement',{copy:true});await fs.appendFile(path.join(f.target,'SKILL.md'),'\nSYNTHETIC known changed current file\n');const before=await publicSnapshot(f.dir);let helpers=0,mkdirs=0;await patchMethod(childProcess,'spawnSync',old=>(...args)=>{helpers++;return old(...args);},()=>patchMethod(fs,'mkdir',old=>(...args)=>{mkdirs++;return old(...args);},()=>assert.rejects(previewInstall({...f.options,replaceSkill:false}),/replaceSkill|replacement|replace|different|existing/i)));assert.equal(helpers,1);assert.equal(mkdirs,0);assert.deepEqual(await publicSnapshot(f.dir),before);const allowed=await previewInstall({...f.options,replaceSkill:true});assertRecord(allowed,'install-plan');assert.ok(allowed.changes.some(c=>c.relative==='SKILL.md'));assert.deepEqual(await publicSnapshot(f.dir),before);return{readonlyMetadataCalls:helpers,mkdirsBeforeAuthorization:mkdirs,explicitAuthorizationAllowsPreview:true,projectUnchanged:true};});


let installedStateRoot=null,installedStateRootSequence=0;
async function stateRuntime(){if(installedStateRoot)return installedStateRoot;const f=await installFixture('state-runtime-'+(++installedStateRootSequence));const done=await applyInstall(await previewInstall(f.options)),runtime=await import(pathToFileURL(path.join(f.target,'scripts/lib/engine.mjs')).href);installedStateRoot={...f,done,runtime};return installedStateRoot;}
async function updateStateRuntime(f){const controller=path.join(f.target,'scripts/lib/engine.mjs'),before=await fs.stat(controller,{bigint:true});await fs.appendFile(controller,'\n// SYNTHETIC reviewed current-controller replacement fixture\n');const plan=await previewInstall({...f.options,replaceSkill:true});assert.equal(plan.changes.length,1);assert.equal(plan.changes[0].relative,'scripts/lib/engine.mjs');const done=await applyInstall(plan);assert.equal(done.changedFiles,1);assert.equal((await fs.stat(controller,{bigint:true})).ino,before.ino);assert.equal(await digest(controller),await digest(path.join(source,'scripts/lib/engine.mjs')));return done;}
await test('current-install-state-preservation','Actual installation preserves approved, active, pending and verified current projects',async()=>{
 const fixtures=[];
 for(const status of ['approved','active','pending_acceptance','verified']){
  const f=await fixture('installed-state-'+status.replaceAll('_','-'),{two:false});await approve(f);let run,value;
  if(status!=='approved'){
   run=await engine.begin(f.project,f.id,'a');
   if(status!=='active'){await emit(f,'a');value=envelope('submission',payload(f,run));await engine.submit(f.project,f.id,'a',value);if(status==='verified')await engine.verify(f.project,f.id,'a');}
  }
  fixtures.push({f,status,run,value,before:await publicSnapshot(f.project),state:await engine.status(f.project,f.id)});
 }
 const root=await stateRuntime(),checked=[];
 for(const row of fixtures){
  const{f,status,run}=row,context=await root.runtime.taskContext(f.project,f.id,'a'),state=await root.runtime.status(f.project,f.id);
  const expectedStatus=status==='approved'?'todo':status==='active'?'executing':status;
  assert.deepEqual(await publicSnapshot(f.project),row.before,status);assert.equal(context.currentStatus,expectedStatus);
  assert.equal(state.review.digest,row.state.review.digest);assert.equal(state.approval.digest,row.state.approval.digest);
  if(run)assert.equal(state.tasks.a.runId,run.runId);if(status==='verified')assert.equal(state.tasks.a.acceptedAt,row.state.tasks.a.acceptedAt);
  const result=spawnSync(process.execPath,[path.join(root.target,'scripts/harness.mjs'),'context','--project',f.project,'--id',f.id,'--task','a'],{cwd:work,encoding:'utf8',shell:false,windowsHide:true});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.equal(cliData(result.stdout).currentStatus,expectedStatus);assert.deepEqual(await publicSnapshot(f.project),row.before);
  if(status==='active'){
   await assert.rejects(root.runtime.begin(f.project,f.id,'a'),/active|executing|cannot begin/i);await emit(f,'a');
   await root.runtime.submit(f.project,f.id,'a',envelope('submission',payload(f,run)));await root.runtime.verify(f.project,f.id,'a');
  }
  if(row.value){
   const before=await root.runtime.status(f.project,f.id),receipt=before.tasks.a.receipt,bytes=await fs.readFile(receipt.path);
   assert.equal((await root.runtime.submit(f.project,f.id,'a',row.value)).replayed,true);
   const after=await root.runtime.status(f.project,f.id);assert.equal(after.tasks.a.acceptedAt,before.tasks.a.acceptedAt);assert.equal(closedCount(after),closedCount(before));assert.deepEqual(await fs.readFile(receipt.path),bytes);
  }
  checked.push(status);
 }
 return{checked,actualInstalledAPI:true,actualInstalledCLI:true,projectBytesPreserved:true};
});
for(const host of ['codex','claude-code','deepseek-harness'])for(const mode of ['native','cli'])for(const stale of [false,true])await test('current-install-state-active-'+host+'-'+mode+'-'+stale,'Physical current runtime update preserves the original active host, mode and actual close',async()=>{
 const root=await stateRuntime(),f=await fixture('installed-active-'+host+'-'+mode+'-'+stale,{two:false,execution:{allowedHosts:[host],defaultHost:host}});await approve(f);const ready=path.join(f.project,'child-ready'),release=path.join(f.project,'child-release');let run,pending,ended,closureAttempted=false;
 try{
  if(mode==='cli'){await writeJson(path.join(f.project,'host-child-expectations.json'),{host,cwd:f.project,readyFile:ready,releaseFile:release});pending=captureOutcome(runLeafOn(root.runtime,f.project,f.id,'a',{host,executable:path.join(root.target,'scripts/tests/helpers/host-child.mjs'),timeoutMs:60000}));await waitForReady(()=>fs.access(ready).then(()=>true,()=>false));const state=await root.runtime.status(f.project,f.id);run={runId:state.tasks.a.runId,executionBinding:state.tasks.a.executionBinding};}
  else{run=await root.runtime.begin(f.project,f.id,'a',{host});await emit(f,'a');}
  if(stale)await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift during original activity\n');
  const before=await publicSnapshot(f.project),updated=await updateStateRuntime(root),context=await root.runtime.taskContext(f.project,f.id,'a'),original=context.activeExecutions.find(x=>x.runId===run.runId);assert.ok(original);assert.deepEqual(original.executionBinding,{host,mode,executor:host+'-'+mode});assert.equal(context.canBegin,false);assert.deepEqual(await publicSnapshot(f.project),before);await assert.rejects(root.runtime.begin(f.project,f.id,'a',{host}),/active|executing/i);await assert.rejects(root.runtime.verify(f.project,f.id,'a'),e=>e.code==='HARNESS_ACTIVE_EXECUTION');
  if(mode==='cli'){await fs.writeFile(release,'SYNTHETIC actual release');ended=await pending;assert.ok(ended.ok,ended.error?.message);assert.equal(ended.value.executionClosed,true);assert.equal(ended.value.acceptedForVerification,!stale);const receipt=await readJson(ended.value.receipt.path);assert.equal(receipt.process.processState,'closed');assert.equal(receipt.process.exitCode,0);}
  else{closureAttempted=true;const value=envelope('submission',{runId:run.runId,executor:host+'-native',reference:'SYNTHETIC owned native branch ended after physical update',result:'ok'});ended={ok:true,value:await root.runtime.submit(f.project,f.id,'a',value)};assert.equal(ended.value.acceptedForVerification,!stale);}
  const closed=await root.runtime.status(f.project,f.id);assert.equal(closed.activeExecutions.length,0);assert.equal(closed.tasks.a.runId,run.runId);assert.equal(closed.tasks.a.executionBinding.executor,host+'-'+mode);assert.equal(closed.tasks.a.status,stale?'stale':'pending_acceptance');if(stale){assert.equal(closed.approval,null);await assert.rejects(root.runtime.verify(f.project,f.id,'a'));}else assert.equal((await root.runtime.verify(f.project,f.id,'a')).taskStatus,'verified');const receipt=await readJson(ended.value.receipt.path),beforeReplay=await root.runtime.status(f.project,f.id),bytes=await fs.readFile(ended.value.receipt.path),replay=await root.runtime.submit(f.project,f.id,'a',receipt);assert.equal(replay.replayed,true);assert.equal(replay.acceptedForVerification,!stale);const afterReplay=await root.runtime.status(f.project,f.id);assert.equal(closedCount(afterReplay),closedCount(beforeReplay));assert.equal(afterReplay.tasks.a.acceptedAt,beforeReplay.tasks.a.acceptedAt);assert.deepEqual(await fs.readFile(ended.value.receipt.path),bytes);return{host,mode,stale,originalRunId:run.runId,actualChangedController:updated.changedFiles,actualChild:mode==='cli',sameReceiptReplay:true};
 }catch(error){installedStateRoot=null;throw error;}
 finally{if(pending&&!ended){await fs.writeFile(release,'SYNTHETIC failure-site release');const final=await pending;if(!final.ok&&final.error?.processResult?.processState==='unknown-active')throw final.error;}if(mode==='native'&&run&&!closureAttempted){try{await root.runtime.submit(f.project,f.id,'a',envelope('submission',{runId:run.runId,executor:host+'-native',reference:'SYNTHETIC native test branch actually ended with failure',result:'failed'}));}catch(error){console.error('SYNTHETIC factual closure also failed: '+error.message);}}}
});
await test('current-install-state-cleanup','Healthy shared current installation rolls back after every original activity actually ends',async()=>{if(!installedStateRoot)return{healthyRootAvailable:false,failedRootsPreserved:true};const root=installedStateRoot,result=await rollbackInstall(root.done.rollbackManifest);assert.equal(result.status,'rolled-back');installedStateRoot=null;return{healthyRootAvailable:true,originalInstallationRestored:true};});


async function protectedFileRows(f){const paths=[...new Set([f.agents,f.done.rollbackManifest,f.record.planFile.path,...f.record.changes.flatMap(c=>[c.target,...(c.backup?[c.backup]:[])])])];return Promise.all(paths.map(async file=>({file,bytes:await fs.readFile(file),identity:await objectFacts(file)})));}
async function sameProtectedRows(rows){for(const row of rows){assert.deepEqual(await fs.readFile(row.file),row.bytes,row.file);assert.deepEqual(await objectFacts(row.file),row.identity,row.file);}}
function ownedFixturePath(f,file){const relative=path.relative(f.dir,path.resolve(file));assert.ok(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Fixture path escaped its declared directory.');}
async function replaceOwnedFile(f,file,label){const kept=path.join(f.dir,'preserved-'+label);ownedFixturePath(f,file);ownedFixturePath(f,kept);const bytes=await fs.readFile(file);await fs.rename(file,kept);await fs.writeFile(file,bytes,{flag:'wx'});const created=await objectFacts(file);assert.notEqual(created.ino,(await objectFacts(kept)).ino);return async()=>{assert.deepEqual(await fs.readFile(file),bytes);assert.deepEqual(await objectFacts(file),created);assert.equal((await fs.lstat(file,{bigint:true})).nlink,1n);await fs.unlink(file);await fs.rename(kept,file);};}
await test('current-install-identity-drift','Each actual object, directory, plan, journal and configuration drift blocks before restoration',async()=>{
 const f=await bindingFixture('identity-drift',{primeDirectoryStream:true}),manifest=f.done.rollbackManifest,checked=[];
 async function refuse(name,expected,{publicGuard=false,injected}={}){const rows=await protectedFileRows(f),raw=await fs.readFile(manifest);let error;try{await rollbackInstall(manifest);}catch(e){error=e;}assert.ok(error,name);assert.match(error.message,expected,name);if(!publicGuard)assert.equal(error.recovery?.completedTargets,0,name);if(injected)assert.ok(injected());await sameProtectedRows(rows);assert.deepEqual(await fs.readFile(manifest),raw);checked.push({name,stage:error.recovery?.stage??'public-preflight',completedTargets:error.recovery?.completedTargets??null});}
 for(const[name,file,expected]of [
  ['target-file',f.record.changes[f.ci].target,/Installed target|changed|identity/i],
  ['backup-file',f.record.changes[f.ci].backup,/backup|changed|identity/i],
  ['plan-file',f.record.planFile.path,/identity|changed|target/i]
 ]){const undo=await replaceOwnedFile(f,file,name);await refuse(name,expected);await undo();}
 const directory=path.join(f.target,'agents'),keptDirectory=path.join(f.dir,'preserved-agents'),discardedDirectory=path.join(f.dir,'own-empty-directory');ownedFixturePath(f,directory);assert.deepEqual(await fs.readdir(directory),['openai.yaml']);await fs.rename(directory,keptDirectory);await fs.mkdir(directory);await fs.rename(path.join(keptDirectory,'openai.yaml'),path.join(directory,'openai.yaml'));const createdDirectory=await objectFacts(directory);await refuse('canonical-directory',/Installed target|directory|changed/i);assert.deepEqual(await objectFacts(directory),createdDirectory);assert.deepEqual(await fs.readdir(directory),['openai.yaml']);await fs.rename(path.join(directory,'openai.yaml'),path.join(keptDirectory,'openai.yaml'));assert.deepEqual(await fs.readdir(directory),[]);await fs.rename(directory,discardedDirectory);await fs.rename(keptDirectory,directory);
 const keptRoot=path.join(f.dir,'preserved-root');ownedFixturePath(f,keptRoot);await fs.rename(f.target,keptRoot);await fs.symlink(keptRoot,f.target,'junction');await refuse('canonical-root-link',/directory|linked|symlink|alias|redirect/i);assert.ok((await fs.lstat(f.target)).isSymbolicLink());await fs.unlink(f.target);await fs.rename(keptRoot,f.target);
 const hardlink=path.join(f.dir,'own-manifest-hardlink');await fs.link(manifest,hardlink);await refuse('manifest-hardlink',/ordinary single-link/,{publicGuard:true});assert.equal((await fs.lstat(manifest,{bigint:true})).nlink,2n);await fs.unlink(hardlink);
 const beforeSwap=await protectedFileRows(f),oldManifest=await fs.readFile(manifest);let swapped=false,undoSwap,error;await patchMethod(fs,'mkdir',old=>async function(file,...args){const result=await old(file,...args);if(!swapped&&key(file)===key(path.join(f.home,'.writer-lock'))){swapped=true;undoSwap=await replaceOwnedFile(f,manifest,'locked-manifest');}return result;},async()=>{try{await rollbackInstall(manifest);}catch(e){error=e;}});assert.ok(swapped);assert.ok(error);assert.match(error.message,/changed|identity|manifest|journal/i);assert.equal(error.recovery?.completedTargets,0);assert.deepEqual(await fs.readFile(manifest),oldManifest);for(const row of beforeSwap)if(row.file!==manifest){assert.deepEqual(await fs.readFile(row.file),row.bytes);assert.deepEqual(await objectFacts(row.file),row.identity);}checked.push({name:'manifest-lock-swap',stage:error.recovery.stage,completedTargets:0});await undoSwap();
 const config=path.join(f.home,'config.toml');await assert.rejects(fs.stat(config),{code:'ENOENT'});const configBytes=Buffer.from('SYNTHETIC unexpected configuration\n');await fs.writeFile(config,configBytes,{flag:'wx'});const configIdentity=await objectFacts(config);await refuse('configuration-content',/configuration|config|snapshot|changed/i);assert.deepEqual(await fs.readFile(config),configBytes);assert.deepEqual(await objectFacts(config),configIdentity);await fs.unlink(config);
 if(process.platform==='win32'){const stream=f.record.changes[f.ci].target+':current-rollback-drift',bytes=Buffer.from('SYNTHETIC named stream drift');await fs.writeFile(stream,bytes,{flag:'wx'});await refuse('named-stream',/Installed target|changed|snapshot/i);assert.deepEqual(await fs.readFile(stream),bytes);await fs.unlink(stream);const directoryStream=path.join(f.target,'agents')+':$DATA:$DATA';await fs.writeFile(directoryStream,bytes,{flag:'wx'});await refuse('directory-named-data-stream',/directory|changed|metadata|snapshot/i);assert.deepEqual(await fs.readFile(directoryStream),bytes);await fs.unlink(directoryStream);}
 await rollbackInstall(manifest);return{checked,directoryStreamArchiveInitializedBeforePlan:process.platform==='win32',originalFilesRestored:true,allRestorationCountsZero:true};
});



for(const bad of ['./out/a.txt','out\\a.txt','out//a.txt','../out/a.txt','C:/out/a.txt','/out/a.txt','out/a.','out/a '])await test('audit-f5-contract-'+Buffer.from(bad).toString('hex'),'Noncanonical business paths are refused before seal or execution',async()=>{
 const f=await fixture('canonical-'+randomUUID().slice(0,8),{two:false});f.c.deliverables[0].path=bad;
 assert.throws(()=>validateContract(f.c),/canonical project-relative path/i);
 return {rejected:bad,stage:'contract validation'};
});
await test('audit-f2-document-change','Native context refuses unreviewed phase content read after refresh',async()=>{
 const f=await fixture('context-doc-race',{two:false});await approve(f);const phase=path.join(f.directory,'phases/a.md');let reads=0,injected=false;
 await patchMethod(fs,'readFile',old=>async function(file,...args){
  if(path.resolve(String(file))===path.resolve(phase)&&++reads===2){injected=true;await fs.writeFile(phase,'# SYNTHETIC UNREVIEWED VERSION B\n');}
  return old(file,...args);
 },()=>assert.rejects(engine.taskContext(f.project,f.id,'a'),e=>e.code==='HARNESS_CONTEXT_SOURCE_CHANGED'));
 assert.equal(injected,true);return{injected,readOnly:true};
});
await test('audit-f2-state-change','Native context refuses a concurrent control-source edit',async()=>{
 const f=await fixture('context-state-race',{two:false});await approve(f);const phase=path.join(f.directory,'phases/a.md'),file=path.join(f.directory,'state.json'),value=await readJson(file);let reads=0,injected=false;
 await patchMethod(fs,'readFile',old=>async function(target,...args){
  if(path.resolve(String(target))===path.resolve(phase)&&++reads===2){injected=true;await writeJson(file,{...value,extensions:{syntheticConcurrentEdit:true}});}
  return old(target,...args);
 },()=>assert.rejects(engine.taskContext(f.project,f.id,'a'),e=>e.code==='HARNESS_CONTEXT_SOURCE_CHANGED'));
 assert.equal(injected,true);return{injected,sourcePreserved:(await readJson(file)).extensions.syntheticConcurrentEdit};
});
await test('audit-f2-byte-preservation','Approved Chinese, BOM and CRLF phase text keeps its exact bytes',async()=>{
 const f=await fixture('context-bytes',{two:false,unreviewed:true}),phase=path.join(f.directory,'phases/a.md'),body='\ufeff# 合成阶段\r\n\r\n逐字节保留正文。\r\n';
 await fs.writeFile(phase,body);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);
 const before=await fs.readFile(path.join(f.directory,'state.json')),context=await engine.taskContext(f.project,f.id,'a'),returned=context.files[0];
 assert.equal(returned.text,body);assert.equal(returned.sha256,hash(Buffer.from(body)));assert.deepEqual(await fs.readFile(path.join(f.directory,'state.json')),before);
 return{approved:context.review.approved,bomAndCrLf:true};
});


for(const variant of ['empty','missing','output-missing','report-missing','accepted-at-missing'])await test('audit-f3-'+variant,'Semantically incomplete accepted evidence blocks downstream work',async()=>{
 const f=await fixture('verified-'+variant);await approve(f);await finish(f,'a');
 const file=path.join(f.directory,'state.json'),s=await readJson(file),receipt=await fs.readFile(s.tasks.a.receipt.path);
 if(variant==='empty')s.tasks.a.evidence=[];
 if(variant==='missing')delete s.tasks.a.evidence;
 if(variant==='output-missing')s.tasks.a.evidence=s.tasks.a.evidence.filter(e=>path.resolve(e.path)!==path.resolve(f.project,'out/a.txt'));
 if(variant==='report-missing')s.tasks.a.evidence=s.tasks.a.evidence.filter(e=>!path.basename(e.path).startsWith('acceptance-'));
 if(variant==='accepted-at-missing')delete s.tasks.a.acceptedAt;
 await writeJson(file,s);
 const refreshed=await engine.status(f.project,f.id);assert.notEqual(refreshed.tasks.a.status,'verified');
 assert.equal((await engine.taskContext(f.project,f.id,'b')).canBegin,false);await assert.rejects(engine.begin(f.project,f.id,'b'),/Dependencies|evidence|stale|recovery/i);
 assert.deepEqual(await fs.readFile(s.tasks.a.receipt.path),receipt);return{upstream:refreshed.tasks.a.status,downstreamBlocked:true};
});
await test('audit-f3-active-closure','An evidence fault blocks new work while preserving an original active run closure',async()=>{
 const f=await fixture('verified-active');await approve(f);await finish(f,'a');const run=await engine.begin(f.project,f.id,'b');
 const file=path.join(f.directory,'state.json'),s=await readJson(file);s.tasks.a.evidence=[];await writeJson(file,s);
 const observed=await engine.status(f.project,f.id);assert.equal(observed.activeExecutions[0].runId,run.runId);
 const closed=await submit(f,'b',run,'failed');assert.equal(closed.acceptedForVerification,false);assert.equal(closed.phase,'stale');assert.equal((await engine.status(f.project,f.id)).activeExecutions.length,0);
 return{originalRunClosed:true,stale:true};
});
for(const drift of ['input','phase','contract'])await test('audit-f4-pending-'+drift,'Pending obligations survive drift and can be administratively resolved without approving work',async()=>{
 const f=await fixture('pending-'+drift,{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');const closed=await submit(f,'a',run),old=await fs.readFile(closed.receipt.path);
 if(drift==='input')await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC DRIFT\n');
 if(drift==='phase')await fs.appendFile(path.join(f.directory,'phases/a.md'),'\nSYNTHETIC DRIFT\n');
 f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);
 await assert.rejects(prepareCurrentReview(f.project,f.id),/pending|unresolved|obligation/i);
 const request=await engine.rework(f.project,f.id,'a',{runId:run.runId,reason:'SYNTHETIC preserve and retire prior result',reference:'SYNTHETIC audited changed input'});
 assert.ok(request.requestId);assert.equal((await engine.status(f.project,f.id)).approval,null);
 await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);
 const reviewed=await prepareCurrentReview(f.project,f.id);assert.equal(reviewed.phase,'pending_user_review');await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);
 assert.deepEqual(await fs.readFile(closed.receipt.path),old);return{drift,receiptPreserved:true,newApprovalStillRequired:true};
});
await test('audit-f4-historical-cache','Removed task and reset cache cannot erase an unresolved closed run',async()=>{
 const f=await fixture('pending-history',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');const closed=await submit(f,'a',run),old=await fs.readFile(closed.receipt.path);
 f.c.revision++;f.c.tasks[0].id='replacement';f.c.contextFiles[0].tasks=['replacement'];await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);
 const file=path.join(f.directory,'state.json'),s=await readJson(file);s.tasks={replacement:{status:'todo'}};await writeJson(file,s);
 await assert.rejects(prepareCurrentReview(f.project,f.id),/pending|unresolved|obligation/i);
 const r=await engine.rework(f.project,f.id,'a',{runId:run.runId,reason:'SYNTHETIC historical obligation',reference:'SYNTHETIC old closed receipt'});
 assert.ok(r.requestId);assert.deepEqual((await engine.status(f.project,f.id)).tasks.replacement,{status:'todo'});
 assert.equal((await prepareCurrentReview(f.project,f.id)).phase,'pending_user_review');
 assert.deepEqual(await fs.readFile(closed.receipt.path),old);return{historicalResolved:true,currentCachePreserved:true};
});


async function auditWaitFor(predicate,label,timeoutMs=10000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw new Error('SYNTHETIC readiness/end not observed: '+label);}
await test('audit-f1-descendant','Direct CLI close retains the original run until its business descendant actually ends',async()=>{
 const f=await fixture('explicit-descendant',{two:false});await approve(f);await fs.mkdir(path.join(f.project,'out'),{recursive:true});
 const nonce=randomUUID(),parent=path.join(f.project,'parent.mjs'),child=path.join(f.project,'finite-child.mjs');
 await fs.writeFile(child,"import fs from 'node:fs';const nonce=process.argv[2],start=Date.now();let n=0;fs.writeFileSync('child.ready',nonce);const timer=setInterval(()=>{fs.writeFileSync('out/a.txt',String(++n));if(Date.now()-start>5000){clearInterval(timer);fs.writeFileSync('child.done',nonce);process.exit(0);}},30);");
 await fs.writeFile(parent,"import fs from 'node:fs';import {spawn} from 'node:child_process';process.stdin.resume();process.stdin.on('end',()=>{const out=fs.openSync('child.stdout','wx'),err=fs.openSync('child.stderr','wx');const c=spawn(process.execPath,['finite-child.mjs',"+JSON.stringify(nonce)+"],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:['ignore',out,err]});fs.closeSync(out);fs.closeSync(err);fs.writeFileSync('child.pid',String(c.pid));c.unref();process.exit(0);});");
 let observed,closed=false,pid;
 const done=async()=>fs.readFile(path.join(f.project,'child.done'),'utf8').then(v=>v===nonce,()=>false);
 try{
  observed=await engine.run(f.project,f.id,'a',{host:'codex',executable:parent,timeoutMs:2000});
  pid=Number(await fs.readFile(path.join(f.project,'child.pid'),'utf8'));
  await auditWaitFor(()=>fs.readFile(path.join(f.project,'out/a.txt'),'utf8').then(v=>Number(v)>0,()=>false),'business output ready');
  const before=Number(await fs.readFile(path.join(f.project,'out/a.txt'),'utf8'));await new Promise(r=>setTimeout(r,120));const after=Number(await fs.readFile(path.join(f.project,'out/a.txt'),'utf8'));assert.ok(after>before);
  assert.equal(observed.executionClosed,false);assert.equal(observed.phase,'executing');assert.equal(observed.acceptedForVerification,false);assert.ok(!observed.receipt);
  const s=await engine.status(f.project,f.id);assert.equal(s.activeExecutions.length,1);assert.equal(s.activeExecutions[0].runId,observed.runId);assert.equal(s.events.filter(e=>e.type==='process_observed').length,1);
  await assert.rejects(engine.begin(f.project,f.id,'a'),/active|executing/i);await assert.rejects(engine.rework(f.project,f.id,'a',{runId:observed.runId,reason:'SYNTHETIC',reference:'SYNTHETIC'}),/active|executing/i);await assert.rejects(engine.verify(f.project,f.id,'a'),/active|executing/i);await assert.rejects(prepareCurrentReview(f.project,f.id),/active|executing/i);
  const facts={runId:observed.runId,executor:'codex-cli',reference:'SYNTHETIC finite child task',result:'ok'};
  await assert.rejects(submitFacts(f.project,f.id,'a',facts),/business|activity|ended/i);
  await assert.rejects(submitFacts(f.project,f.id,'a',{...facts,businessEnd:{status:'ended',reference:'  '}}),/business|nonblank|nonempty/i);
  await assert.rejects(submitFacts(f.project,f.id,'a',{...facts,businessEnd:{status:'ended',reference:'SYNTHETIC'},process:{...observed.processObservation.process,exitCode:7}}),/conflict|original|observation/i);
  await auditWaitFor(done,'finite descendant done');await auditWaitFor(async()=>{try{process.kill(pid,0);return false;}catch{return true;}},'finite descendant actual exit');
  const reference='SYNTHETIC observed nonce '+nonce+' done and owned PID ended';
  const args=['submit','--project',f.project,'--id',f.id,'--task','a','--run-id',observed.runId,'--executor','codex-cli','--reference',facts.reference,'--result','ok','--business-end-reference',reference];
  const first=command(args);assert.equal(first.code,0,first.stderr);assert.equal(cliData(first.stdout).phase,'pending_acceptance');closed=true;
  const replay=command(args);assert.equal(replay.code,0,replay.stderr);assert.equal(cliData(replay.stdout).replayed,true);
  assert.equal((await engine.verify(f.project,f.id,'a')).taskStatus,'verified');return{before,after,activeUntilActualEnd:true,publicInlineAndReplay:true,ownedPidEnded:true};
 }finally{
  await auditWaitFor(done,'cleanup finite child end');if(pid)await auditWaitFor(async()=>{try{process.kill(pid,0);return false;}catch{return true;}},'cleanup owned PID actual exit');
  if(observed?.executionClosed===false&&!closed)await submitFacts(f.project,f.id,'a',{runId:observed.runId,executor:'codex-cli',reference:'SYNTHETIC failed test cleanup after actual child end',result:'failed',businessEnd:{status:'ended',reference:'SYNTHETIC done nonce and owned PID actually ended'}});
 }
});


await test('audit-compat-stale-published-receipt','A receipt published before state loss may later close stale and remain administratively recoverable',async()=>{
 const f=await fixture('published-stale',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');
 const facts={runId:run.runId,executor:'codex-native',reference:'SYNTHETIC published before state fault',result:'ok'};
 await publishWithoutState(f,run,facts);await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift after receipt publication\n');
 const closed=await submitFacts(f.project,f.id,'a',facts);assert.equal(closed.phase,'stale');assert.equal(closed.acceptedForVerification,false);
 const bytes=await fs.readFile(closed.receipt.path);assert.equal(JSON.parse(bytes).acceptedForVerification,true);
 const request=await engine.rework(f.project,f.id,'a',{runId:run.runId,reason:'SYNTHETIC stale factual closure disposition',reference:'SYNTHETIC original final is preserved'});assert.ok(request.requestId);
 assert.deepEqual(await fs.readFile(closed.receipt.path),bytes);return{staleClosure:true,originalReceiptPreserved:true,administrativeRework:true};
});
await test('audit-compat-external-log','Explicit absolute execution logs retain their accepted evidence scope',async()=>{
 const f=await fixture('external-log',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');
 const log=path.join(root,'explicit-external-log-'+randomUUID()+'.txt');await fs.writeFile(log,'SYNTHETIC explicit log outside the fixture project\n');
 await submit(f,'a',run,'ok',{logs:[{path:log,sha256:await digest(log)}]});const v=await engine.verify(f.project,f.id,'a');assert.equal(v.taskStatus,'verified');assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'verified');
 return{absoluteLog:true,outsideProject:true};
});
await test('audit-compat-external-review-source','An explicitly read external reviews envelope remains valid accepted evidence',async()=>{
 const criterion={id:'meaning-a',type:'review',description:'SYNTHETIC inspect actual fixture bytes',requiredFiles:[]};
 const f=await fixture('external-reviews',{two:false,acceptance:[criterion]});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);
 const snapshot=await engine.reviewSnapshotEvidence(f.project,f.id,'a','meaning-a'),file=path.join(root,'explicit-external-review-'+randomUUID()+'.json');
 await writeJson(file,envelope('reviews',{records:{'meaning-a':currentRecord(snapshot)}}));const input=await engine.readReviewsEvidence(file);
 const v=await engine.verify(f.project,f.id,'a',input.reviews,{reviewsSource:input.reviewsSource});assert.equal(v.taskStatus,'verified');assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'verified');
 return{externalReviewsSource:true};
});


await test('audit-status-begin','A same-review pending cache relabelled todo cannot start a replacement writer',async()=>{
 const f=await fixture('status-begin');f.c.tasks[1].dependsOn=[];f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);
 const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);
 const file=path.join(f.directory,'state.json'),state=await readJson(file);state.tasks.a.status='todo';await writeJson(file,state);
 const context=await engine.taskContext(f.project,f.id,'a');let unexpected;
 try{await assert.rejects((async()=>{unexpected=await engine.begin(f.project,f.id,'a');return unexpected;})(),/pending|rework|obligation/i);}
 finally{if(unexpected)await submit(f,'a',unexpected,'failed');}
 assert.equal(context.canBegin,false);
 const b=await engine.begin(f.project,f.id,'b');await submit(f,'b',b,'failed');return{selectedStepBlocked:true,independentStepAllowed:true};
});
await test('audit-status-rework','An eligible closed run with a damaged todo cache has a truthful administrative recovery',async()=>{
 const f=await fixture('status-rework',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');await submit(f,'a',run);
 const file=path.join(f.directory,'state.json'),state=await readJson(file);state.tasks.a.status='todo';await writeJson(file,state);
 assert.equal((await engine.taskContext(f.project,f.id,'a')).workflow.rework!==null,true);
 const request=await engine.rework(f.project,f.id,'a',{runId:run.runId,reason:'SYNTHETIC repair of cache status',reference:'SYNTHETIC trusted closed ledger'});
 const actual=await engine.status(f.project,f.id),event=actual.events.find(e=>e.type==='rework_requested'&&e.requestId===request.requestId);assert.equal(event.administrative,true);assert.equal(event.previous.status,'todo');
 f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);await approve(f);
 const next=await engine.begin(f.project,f.id,'a');await submit(f,'a',next,'failed');return{truthfulPrevious:true,newReviewApprovalRequired:true};
});


async function auditLeafFixture(name){
 const f=await fixture(name,{two:false});await approve(f);const entry=path.join(f.project,'known-leaf.mjs');f.auditNonce=randomUUID();
 await fs.writeFile(entry,"import fs from 'node:fs';const nonce="+JSON.stringify(f.auditNonce)+";process.stdin.resume();process.stdin.on('end',()=>{fs.writeFileSync('leaf.ready',nonce);fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/a.txt','SYNTHETIC known finite leaf '+nonce);fs.writeFileSync('leaf.done',nonce);process.exit(0);});");
 return{f,entry};
}
async function auditRunLeaf(f,entry){
 const observed=await engine.run(f.project,f.id,'a',{executable:entry,timeoutMs:3000});
 assert.equal(await fs.readFile(path.join(f.project,'leaf.ready'),'utf8'),f.auditNonce);assert.equal(await fs.readFile(path.join(f.project,'leaf.done'),'utf8'),f.auditNonce);
 const pid=observed.processObservation.process.pid;assert.ok(Number.isInteger(pid));
 await auditWaitFor(async()=>{try{process.kill(pid,0);return false;}catch{return true;}},'owned leaf actual exit');
 return observed;
}

function auditEndFacts(observed,reference='SYNTHETIC fixed no-descendant leaf actually reached process close'){
 return{runId:observed.runId,executor:observed.executionBinding.executor,reference:observed.processObservation.reference,result:processSucceeded(observed.processObservation.process)?'ok':'failed',businessEnd:{status:'ended',reference}};
}
for(const point of ['after-read','changed-then-restored'])await test('audit-more-f2-'+point,'Context refuses document changes across body capture and final review validation',async()=>{
 const f=await fixture('ctx-'+point,{two:false});await approve(f);const phase=path.join(f.directory,'phases/a.md'),original=await fs.readFile(phase);let reads=0,injected=false;
 await patchMethod(fs,'readFile',old=>async function(file,...args){
  if(path.resolve(String(file))===path.resolve(phase)&&++reads===2){
   injected=true;if(point==='changed-then-restored'){await fs.writeFile(phase,'# SYNTHETIC transient unapproved B\n');const bytes=await old(file,...args);await fs.writeFile(phase,original);return bytes;}
   const bytes=await old(file,...args);await fs.writeFile(phase,'# SYNTHETIC changed after body read\n');return bytes;
  }return old(file,...args);
 },()=>assert.rejects(engine.taskContext(f.project,f.id,'a'),e=>e.code==='HARNESS_CONTEXT_SOURCE_CHANGED'));
 assert.ok(injected);return{point,injected};
});
await test('audit-more-f2-invalid-utf8','Invalid document UTF-8 is refused for blocked API and public CLI contexts without state writes',async()=>{
 const f=await fixture('ctx-invalid-utf8',{two:false});await approve(f);const file=path.join(f.directory,'state.json'),before=await fs.readFile(file);
 await fs.writeFile(path.join(f.directory,'phases/a.md'),Buffer.from([0xff,0xfe,0xc0,0xaf]));
 await assert.rejects(engine.taskContext(f.project,f.id,'a'),e=>e.code==='HARNESS_CONTEXT_SOURCE_CHANGED');
 const r=command(['context','--project',f.project,'--id',f.id,'--task','a']);assert.equal(r.code,1);assert.match(r.stderr,/UTF-8|CONTEXT_SOURCE_CHANGED/);assert.equal(r.stdout,'');assert.deepEqual(await fs.readFile(file),before);
 return{apiAndCLIRefused:true,stateUnchanged:true};
});
await test('audit-more-f2-cli-race','The actual public context command refuses an injected real phase-file write',async()=>{
 const f=await fixture('ctx-cli-race',{two:false});await approve(f);const phase=path.join(f.directory,'phases/a.md'),shim=path.join(f.project,'context-race.mjs');
 await fs.writeFile(shim,"import fs from 'node:fs/promises';import path from 'node:path';const target="+JSON.stringify(phase)+",old=fs.readFile;let n=0;fs.readFile=async function(file,...args){if(path.resolve(String(file))===path.resolve(target)&&++n===2)await fs.writeFile(target,'# SYNTHETIC concurrent unreviewed CLI phase\\n');return old(file,...args);};");
 const r=spawnSync(process.execPath,['--import',pathToFileURL(shim).href,cli,'context','--project',f.project,'--id',f.id,'--task','a'],{cwd:work,encoding:'utf8',shell:false,windowsHide:true});
 assert.ifError(r.error);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/Context differs|CONTEXT_SOURCE_CHANGED/);return{actualPublicCLI:true};
});
for(const variant of ['conflicting-duplicate','run-id-missing','same-hash-duplicate'])await test('audit-more-f3-'+variant,'Accepted evidence handles identity damage and duplicate evidence explicitly',async()=>{
 const f=await fixture('accepted-'+variant);await approve(f);await finish(f,'a');const file=path.join(f.directory,'state.json'),s=await readJson(file);
 if(variant==='run-id-missing')delete s.tasks.a.runId;else s.tasks.a.evidence.push({...s.tasks.a.evidence[0],...(variant==='conflicting-duplicate'?{sha256:'0'.repeat(64)}:{})});
 await writeJson(file,s);const status=await engine.status(f.project,f.id);
 if(variant==='same-hash-duplicate'){assert.equal(status.tasks.a.status,'verified');assert.equal((await engine.taskContext(f.project,f.id,'b')).canBegin,true);}
 else{assert.equal(status.tasks.a.status,'stale');assert.equal((await engine.taskContext(f.project,f.id,variant==='run-id-missing'?'a':'b')).canBegin,false);await assert.rejects(engine.begin(f.project,f.id,variant==='run-id-missing'?'a':'b'));}
 return{variant,status:status.tasks.a.status};
});
await test('audit-more-f3-bound-report','A consistently rehashed but mismatched report cannot replace original acceptance identity',async()=>{
 const f=await fixture('accepted-report-binding');await approve(f);await finish(f,'a');const stateFile=path.join(f.directory,'state.json'),s=await readJson(stateFile),accepted=s.events.find(e=>e.type==='acceptance'),file=accepted.report,original=await fs.readFile(file),report=JSON.parse(original);
 await fs.writeFile(path.join(f.project,'preserved-original-report.json'),original);report.runId=randomUUID();await writeJson(file,report);const sha256=await digest(file);
 function rehash(value){if(!value||typeof value!=='object')return;if(value.path===file&&value.sha256)value.sha256=sha256;if(value.type==='acceptance'&&value.report===file)value.reportSha256=sha256;for(const v of Object.values(value))rehash(v);}rehash(s);await writeJson(stateFile,s);
 assert.equal((await engine.status(f.project,f.id)).tasks.a.status,'stale');await assert.rejects(engine.begin(f.project,f.id,'b'));
 const oldRun=s.tasks.a.runId;await engine.rework(f.project,f.id,'a',{runId:oldRun,reason:'SYNTHETIC invalid report identity, preserve then rerun',reference:'SYNTHETIC original and changed reports both preserved'});
 assert.equal((await finish(f,'a')).taskStatus,'verified');assert.equal((await engine.taskContext(f.project,f.id,'b')).canBegin,true);
 return{wrongIdentityRejected:true,supportedReworkRestored:true};
});
await test('audit-more-f4-failed-acceptance','A failed acceptance attempt does not resolve a pending obligation after drift',async()=>{
 const f=await fixture('failed-acceptance-drift',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a'),closed=await submit(f,'a',run),bytes=await fs.readFile(closed.receipt.path);
 await assert.rejects(engine.verify(f.project,f.id,'a'));assert.equal((await engine.status(f.project,f.id)).tasks.a.lastAcceptance.status,'failed');
 await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift\n');f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);await assert.rejects(prepareCurrentReview(f.project,f.id),/pending|obligation/i);
 await engine.rework(f.project,f.id,'a',{runId:run.runId,reason:'SYNTHETIC preserve failed acceptance and retire result',reference:'SYNTHETIC failed report'});
 assert.equal((await prepareCurrentReview(f.project,f.id)).phase,'pending_user_review');await assert.rejects(engine.begin(f.project,f.id,'a'),/approval/i);assert.deepEqual(await fs.readFile(closed.receipt.path),bytes);
 return{failedAttemptPreserved:true,approvalStillRequired:true};
});
await test('audit-more-f4-other-current-run','Administrative disposition of an older accepted run preserves a newer closed cache and its pending obligation',async()=>{
 const f=await fixture('history-current-run',{two:false});await approve(f);const old=await engine.begin(f.project,f.id,'a');await emit(f,'a');const first=await submit(f,'a',old);await engine.verify(f.project,f.id,'a');const firstBytes=await fs.readFile(first.receipt.path);
 f.c.revision++;await writeJson(path.join(f.directory,'contract.json'),f.c);await engine.render(f.project,f.id);f.review=await prepareCurrentReview(f.project,f.id);await approve(f);const next=await engine.begin(f.project,f.id,'a');await emit(f,'a','SYNTHETIC new approved revision');const second=await submit(f,'a',next),before=structuredClone((await engine.status(f.project,f.id)).tasks.a);
 const request=await engine.rework(f.project,f.id,'a',{runId:old.runId,reason:'SYNTHETIC historical disposition only',reference:'SYNTHETIC original accepted run'});
 const state=await engine.status(f.project,f.id),event=state.events.find(e=>e.type==='rework_requested'&&e.requestId===request.requestId);assert.equal(event.administrative,true);assert.equal(event.previous,null);assert.deepEqual(state.tasks.a,before);
 await assert.rejects(prepareCurrentReview(f.project,f.id),/pending|obligation/i);assert.deepEqual(await fs.readFile(first.receipt.path),firstBytes);assert.equal((await readJson(second.receipt.path)).runId,next.runId);
 return{historicalOnly:true,newCachePreserved:true,currentPendingStillGuarded:true};
});
await test('audit-more-f1-observation-recovery','Observation publication failure preserves active identity and permits original-facts recovery after actual leaf end',async()=>{
 const{f,entry}=await auditLeafFixture('observation-recovery');let writes=0,error;
 await patchMethod(fs,'rename',old=>async function(from,to,...args){if(path.resolve(String(to))===path.resolve(f.directory,'state.json')){const value=await readJson(from);if(value.events.some(e=>e.type==='process_observed')){writes++;throw new Error('SYNTHETIC observation state publication');}}return old(from,to,...args);},async()=>{try{await auditRunLeaf(f,entry);}catch(e){error=e;}});
 assert.ok(error);assert.equal(error.executionClosed,false);assert.equal(error.processResult.processState,'closed');assert.equal(await fs.readFile(path.join(f.project,'leaf.done'),'utf8'),f.auditNonce);await auditWaitFor(async()=>{try{process.kill(error.processResult.pid,0);return false;}catch{return true;}},'owned failed-observation leaf actual exit');assert.equal(writes,2);const state=await engine.status(f.project,f.id);assert.equal(state.activeExecutions[0].runId,error.runId);assert.equal(state.events.filter(e=>e.type==='process_observed').length,0);
 const facts={runId:error.runId,executor:'codex-cli',reference:error.logs[0].path,result:'ok',process:error.processResult,logs:error.logs,businessEnd:{status:'ended',reference:'SYNTHETIC known no-descendant source actually exited; preserve original observation failure'},summary:'SYNTHETIC recovered original observation-publication error, without reexecution'};
 const closed=await submitFacts(f.project,f.id,'a',facts);assert.equal(closed.phase,'pending_acceptance');assert.equal((await engine.status(f.project,f.id)).events.filter(e=>e.type==='begin').length,1);return{activeRetained:true,originalFactsRecovered:true,noReexecution:true};
});
await test('audit-more-f1-result-schema','Public run result branches reject mixed receipt and observation shapes',async()=>{
 const{f,entry}=await auditLeafFixture('observation-union'),observed=await auditRunLeaf(f,entry);
 assertRecord(envelope('command-result',{command:'run',data:observed}),'command-result');
 assert.throws(()=>assertRecord(envelope('command-result',{command:'run',data:{...observed,executionClosed:true}}),'command-result'));
 assert.throws(()=>assertRecord(envelope('command-result',{command:'run',data:{...observed,receipt:{path:'SYNTHETIC',sha256:'0'.repeat(64)}}}),'command-result'));
 await submitFacts(f.project,f.id,'a',auditEndFacts(observed));return{branchesExclusive:true};
});
await test('audit-more-f1-legacy-replay','Synthetic old-format complete CLI receipts replay without being treated as new end authorization',async()=>{
 const{f,entry}=await auditLeafFixture('legacy-format-replay'),observed=await auditRunLeaf(f,entry),closed=await submitFacts(f.project,f.id,'a',auditEndFacts(observed));
 const receipt=await readJson(closed.receipt.path);delete receipt.businessEnd;await writeJson(closed.receipt.path,receipt);const sha256=await digest(closed.receipt.path),stateFile=path.join(f.directory,'state.json'),state=await readJson(stateFile);
 state.events=state.events.filter(e=>e.type!=='process_observed');for(const e of state.events){if(e.type==='begin')delete e.closureProtocol;if(e.type==='execution_receipt')e.receiptSha256=sha256;}state.tasks.a.receipt.sha256=sha256;await writeJson(stateFile,state);
 const before=await fs.readFile(closed.receipt.path),replay=await engine.submit(f.project,f.id,'a',receipt);assert.equal(replay.replayed,true);assert.deepEqual(await fs.readFile(closed.receipt.path),before);return{syntheticLegacyFormat:true,exactReceiptReplay:true};
});
await test('audit-more-f1-legacy-active','A synthetic older active CLI protocol cannot be closed by the updated runtime',async()=>{
 const f=await fixture('legacy-active',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a',{mode:'cli'}),file=path.join(f.directory,'state.json'),state=await readJson(file);delete state.events.find(e=>e.type==='begin').closureProtocol;await writeJson(file,state);const before=await fs.readFile(file);
 await assert.rejects(submitFacts(f.project,f.id,'a',{runId:run.runId,executor:'codex-cli',reference:'SYNTHETIC negative legacy-protocol input',result:'failed',process:syntheticClosedProcess(),businessEnd:{status:'ended',reference:'SYNTHETIC negative input must not authorize takeover'}}),/original controller|older active/i);
 assert.deepEqual(await fs.readFile(file),before);return{olderActivePreserved:true,noNewReceipt:(await fs.readdir(f.directory)).every(n=>!n.startsWith('receipt-'))};
});
for(const fault of ['duplicate','cache-conflict','orphan'])await test('audit-more-f1-observation-'+fault,'Conflicting process observation records are refused without rewriting the original state',async()=>{
 const{f,entry}=await auditLeafFixture('observation-'+fault),observed=await auditRunLeaf(f,entry),file=path.join(f.directory,'state.json'),state=await readJson(file),event=state.events.find(e=>e.type==='process_observed');
 if(fault==='duplicate')state.events.push(structuredClone(event));if(fault==='cache-conflict')event.process.exitCode=7;if(fault==='orphan')event.runId=randomUUID();await writeJson(file,state);const before=await fs.readFile(file);
 await assert.rejects(submitFacts(f.project,f.id,'a',{...auditEndFacts(observed),result:'failed'}),/observation|original|begin|conflict/i);
 assert.deepEqual(await fs.readFile(file),before);return{fault,statePreserved:true};
});


await test('audit-final-f1-published-legacy-active','An older active protocol remains on its original controller even when a complete final was published',async()=>{
 const{f,entry}=await auditLeafFixture('published-legacy-active'),observed=await auditRunLeaf(f,entry);
 await publishWithoutState(f,{runId:observed.runId},auditEndFacts(observed));const file=path.join(f.directory,'receipt-'+observed.runId+'.json'),receipt=await readJson(file);delete receipt.businessEnd;await writeJson(file,receipt);
 const stateFile=path.join(f.directory,'state.json'),state=await readJson(stateFile);state.events=state.events.filter(e=>e.type!=='process_observed');delete state.events.find(e=>e.type==='begin').closureProtocol;for(const r of state.activeExecutions??[])delete r.processObservation;await writeJson(stateFile,state);
 const before=await fs.readFile(stateFile),bytes=await fs.readFile(file),facts={runId:receipt.runId,executor:receipt.executor,reference:receipt.reference,result:receipt.result,process:receipt.process,logs:receipt.logs,outcome:receipt.outcome};
 await assert.rejects(engine.submit(f.project,f.id,'a',receipt),/older active|original controller/i);await assert.rejects(submitFacts(f.project,f.id,'a',facts),/older active|original controller/i);
 assert.deepEqual(await fs.readFile(stateFile),before);assert.deepEqual(await fs.readFile(file),bytes);return{publishedIsNotClosed:true,olderActiveUnchanged:true};
});
await test('audit-final-f1-cached-without-event','Cached terminal observations without source events block control writes',async()=>{
 const{f,entry}=await auditLeafFixture('cached-no-event'),observed=await auditRunLeaf(f,entry),file=path.join(f.directory,'state.json'),state=await readJson(file);
 state.events=state.events.filter(e=>e.type!=='process_observed');await writeJson(file,state);const before=await fs.readFile(file);
 await assert.rejects(submitFacts(f.project,f.id,'a',{...auditEndFacts(observed),process:observed.processObservation.process,logs:observed.processObservation.logs}),/observation|source event/i);
 assert.deepEqual(await fs.readFile(file),before);return{orphanCachePreserved:true};
});
await test('audit-final-f1-missing-cache-view','A source observation can derive a missing redundant cache view',async()=>{
 const{f,entry}=await auditLeafFixture('missing-observation-view'),observed=await auditRunLeaf(f,entry),file=path.join(f.directory,'state.json'),state=await readJson(file);
 for(const r of state.activeExecutions)delete r.processObservation;await writeJson(file,state);
 assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].processObservation.process.pid,observed.processObservation.process.pid);
 assert.equal((await submitFacts(f.project,f.id,'a',auditEndFacts(observed))).phase,'pending_acceptance');return{derivedFromSourceEvent:true};
});
await test('audit-final-f1-receipt-lock-race','A complete receipt input cannot recreate a final removed at the writer-lock boundary',async()=>{
 const f=await fixture('receipt-lock-race',{two:false});await approve(f);const run=await engine.begin(f.project,f.id,'a');await emit(f,'a');const value=payload(f,run);await publishWithoutState(f,run,value);
 const file=path.join(f.directory,'receipt-'+run.runId+'.json'),receipt=await readJson(file),bytes=await fs.readFile(file),stateFile=path.join(f.directory,'state.json'),before=await fs.readFile(stateFile),preserved=path.join(f.project,'preserved-final-receipt.json');let moved=false;
 await patchMethod(fs,'mkdir',old=>async function(target,...args){const result=await old(target,...args);if(!moved&&path.resolve(String(target))===path.resolve(f.directory,'.writer-lock')){moved=true;await fs.rename(file,preserved);}return result;},()=>assert.rejects(engine.submit(f.project,f.id,'a',receipt),e=>e.code==='HARNESS_SUBMISSION_SOURCE_CHANGED'));
 assert.equal(moved,true);await assert.rejects(fs.stat(file),{code:'ENOENT'});assert.deepEqual(await fs.readFile(preserved),bytes);assert.deepEqual(await fs.readFile(stateFile),before);assert.equal((await engine.status(f.project,f.id)).activeExecutions[0].runId,run.runId);
 return{noFinalRecreation:true,originalActiveAndPreservedBytes:true};
});

for(const [mode,link,wanted]of [
 ['bare-parentheses','[x](report(part).txt)',false],['bare-prefix-trap','[x](report.txt(part))',false],
 ['angle-parentheses','[x](<report(part).txt>)',true],['angle-missing','[x](<missing(part).txt>)',false],
 ['percent-parentheses','[x](report%28part%29.txt)',true],['ordinary','[x](report.txt)',true],
 ['space-angle','[x](<report part.txt>)',true],['title','[x](report.txt "title")',false],
 ['escaped','[x](report\\(part\\).txt)',false],['unpaired','[x](report(part.txt)',false],
 ['fenced','```md\n[x](missing(part).txt)\n```',true],['unclosed-fence','```md\nexample',false]
])await test('pack-f6-'+mode,'Bounded Markdown scanner never certifies a prefix of an unsupported destination',async()=>{
 const project=path.join(root,'pack-f6-'+mode);await fs.mkdir(project);for(const name of ['report','report.txt','report(part','report.txt(part','report(part).txt','report part.txt'])await fs.writeFile(path.join(project,name),'SYNTHETIC');await fs.writeFile(path.join(project,'HARNESS.md'),link+'\n');
 const r=await checkHarnessPaths({project,package:project});assert.equal(r.ok,wanted);if(!wanted&&mode!=='angle-missing')assert.ok(r.uncovered.length);if(mode==='bare-parentheses'||mode==='bare-prefix-trap')assert.equal(r.checked.length,0);return{ok:r.ok,checked:r.checked.map(x=>x.reference),issues:r.issues.map(x=>x.code),uncovered:r.uncovered.length};
});


function setFixtureAcl(file,{broad=false}={}){
 const script=String.raw`$ErrorActionPreference='Stop'
$p=[Console]::In.ReadToEnd();$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl=if((Get-Item -LiteralPath $p).PSIsContainer){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()}
$acl.SetOwner([Security.Principal.SecurityIdentifier]::new($sid));$acl.SetAccessRuleProtection($true,$false)
$inherit=if((Get-Item -LiteralPath $p).PSIsContainer){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
foreach($who in @($sid,'S-1-5-18')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($who),'FullControl',$inherit,'None','Allow'))}
if(${broad?'$true':'$false'}){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'ReadAndExecute',$inherit,'None','Allow'))}
Set-Acl -LiteralPath $p -AclObject $acl
`;
 const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:Buffer.from(file),windowsHide:true,shell:false});assert.ifError(r.error);assert.equal(r.status,0,r.stderr?.toString());
}
function assertPrivateFacts(facts,{directory=false,owner=facts.ownerSid}={}){
 assert.equal(facts.ownerSid,owner);
 assert.equal(facts.privateAcl.present,true);
 assert.equal(facts.privateAcl.protected,directory);
 assert.deepEqual(facts.streams,{});
 const expected=new Set([owner,'S-1-5-18']);
 assert.equal(facts.privateAcl.aces.length,expected.size);
 for(const ace of facts.privateAcl.aces){
  assert.equal(ace.type,0);
  assert.equal(ace.flags,directory?3:16);
  assert.equal(ace.mask,0x1f01ff);
  assert.ok(expected.delete(ace.sid));
 }
 assert.equal(expected.size,0);
}
await test('pack-f7-private-storage','All sensitive transaction bytes begin life under a private leaf even below a broad-readable parent',async()=>{
 if(process.platform!=='win32')return{notApplicable:'Actual Windows DACL check requires Windows'};
 const f=await installFixture('pack-private',{copy:true});await fs.writeFile(path.join(f.target,'LICENSE'),'SYNTHETIC private original');const parent=path.join(f.home,'harness-install-backups');await fs.mkdir(parent);setFixtureAcl(parent,{broad:true});setFixtureAcl(f.agents);const parentBefore=ntfsFacts(parent),agentsBefore=ntfsFacts(f.agents);const plan=await previewInstall(f.options);const observed=[],checkedCategories=new Set();let storageOwner;const checkFirst=file=>{const category=file.endsWith('.tmp')?'temp':file.endsWith('.bin')?'backup':'plan';if(!checkedCategories.has(category)){const facts=ntfsFacts(plan.backupDirectory,{privateAcl:true});storageOwner??=facts.ownerSid;assertPrivateFacts(facts,{directory:true,owner:storageOwner});checkedCategories.add(category);}observed.push(path.basename(file));};
 const checkedFiles=new Set();
 await patchMethod(fs,'open',old=>async function(file,flags,...args){
  const privateOpen=typeof file==='string'&&file.startsWith(plan.backupDirectory+path.sep)&&flags==='wx';
  if(privateOpen)checkFirst(file);
  const handle=await old(file,flags,...args);
  if(!privateOpen)return handle;
  return wrapHandle(handle,{writeFile:async(...writeArgs)=>{
   const category=file.endsWith('.tmp')?'temp':file.endsWith('.bin')?'backup':'plan';
   if(!checkedFiles.has(category)){
    const facts=ntfsFacts(file,{privateAcl:true});
    assert.equal((await handle.stat()).size,0);
    assertPrivateFacts(facts,{owner:storageOwner});
    checkedFiles.add(category);
   }
   return handle.writeFile(...writeArgs);
  }});
 },()=>patchMethod(fs,'writeFile',old=>async function(file,...args){
  if(typeof file==='string'&&file.startsWith(plan.backupDirectory+path.sep))checkFirst(file);
  return old(file,...args);
 },async()=>{
 const done=await applyInstall(plan);const members=await fs.readdir(plan.backupDirectory);for(const name of members){const facts=ntfsFacts(path.join(plan.backupDirectory,name),{privateAcl:true});assertPrivateFacts(facts,{owner:storageOwner});}assert.deepEqual(ntfsFacts(parent),parentBefore);assert.deepEqual(ntfsFacts(f.agents),agentsBefore);await rollbackInstall(done.rollbackManifest);assert.deepEqual(ntfsFacts(f.agents),agentsBefore);
 }));assert.ok(observed.includes('plan.json'));assert.ok(observed.some(x=>x.endsWith('.tmp')));assert.ok(observed.some(x=>x.endsWith('.bin')));assert.deepEqual([...checkedFiles].sort(),['backup','plan','temp']);return{firstSensitiveWritePrivate:true,parentUnchanged:true,originalDaclPreserved:true,observedWrites:observed.length};
});
for(const mode of ['helper-failed','truncated','wrong-id','wrong-path','wrong-role','wrong-count','broad-acl','wrong-file-id'])await test('pack-f7-'+mode,'Private creation helper faults refuse before any sensitive or target bytes are written',async()=>{
 if(process.platform!=='win32')return{notApplicable:'Actual Windows helper interception requires Windows'};
 const f=await installFixture('private-'+mode),plan=await previewInstall(f.options),before=await fs.readFile(f.agents);let hit=false,error;
 await patchMethod(childProcess,'spawnSync',old=>function(exe,args,options){let request;try{request=JSON.parse(options?.input?.toString());}catch{}if(request?.action!=='createPrivateStorage')return old(exe,args,options);hit=true;if(mode==='helper-failed')return{status:1,signal:null,stdout:Buffer.from(JSON.stringify(envelope('metadata-response',{complete:false,stage:'createPrivateStorage',failedPath:request.entries[0].path,completed:[],error:{name:'Injected',message:'SYNTHETIC private create failure'}}))),stderr:Buffer.alloc(0)};const result=old(exe,args,options);if(mode==='truncated')return{...result,stdout:Buffer.from('{')};const value=JSON.parse(result.stdout);if(mode==='wrong-id')value.results[0].id='99';if(mode==='wrong-path')value.results[0].path+='-wrong';if(mode==='wrong-role')value.results[0].objectKind='file';if(mode==='wrong-count')value.results=[];if(mode==='broad-acl')value.results[0].metadata.sddl+='(A;OICI;FR;;;WD)';if(mode==='wrong-file-id')value.createdObjectId='0';return{...result,stdout:Buffer.from(JSON.stringify(value))};},async()=>{try{await applyInstall(plan);}catch(e){error=e;}});
 assert.equal(hit,true);assert.ok(error);assert.equal(error.recovery.completedTargets,0);assert.deepEqual(await fs.readFile(f.agents),before);assert.equal(await existsForTest(f.target),false);const files=await existsForTest(plan.backupDirectory)?await fs.readdir(plan.backupDirectory):[];assert.deepEqual(files,[]);return{mode,zeroSensitiveFiles:true,zeroTargetWrites:true,stage:error.recovery.stage};
});
async function existsForTest(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}


await test('pack-f8-classification','Actual runner classification distinguishes failure and explicit skip with exact counts',async()=>{
 const rows=[await captureCase('p','pass',async()=>null),await captureCase('f','fail',async()=>{throw new Error('SYNTHETIC failure')}),await captureCase('s','skip',async()=>({notApplicable:'SYNTHETIC unavailable capability',detail:42}))];
 assert.deepEqual(caseCounts(rows),{tests:3,passed:1,failed:1,skipped:1});assert.equal(rows[2].pass,false);assert.equal(rows[2].skipped,true);assert.equal(rows[2].observed.detail,42);assert.match(rows[1].error,/SYNTHETIC/);assert.deepEqual(caseCounts([rows[2]]),{tests:1,passed:0,failed:0,skipped:1});
 for(const reason of ['', '  ',null,0,false]){const r=await captureCase('invalid','invalid',async()=>({notApplicable:reason}));assert.equal(r.pass,false);assert.notEqual(r.skipped,true);assert.ok(r.error);}
 for(const value of [null,undefined,false])assert.equal((await captureCase('plain','plain',async()=>value)).pass,true);return{mixed:caseCounts(rows),allSkip:caseCounts([rows[2]]),invalidReasonsFailed:true};
});
await test('pack-f8-typed-contract','Legacy typed records stay readable and contradictory skip/count facts are rejected',async()=>{
 const good=envelope('case-result',{id:'p',expected:'legacy pass',pass:true}),bad=envelope('case-result',{id:'f',expected:'legacy fail',pass:false}),skip=envelope('case-result',{id:'s',expected:'skip',pass:false,skipped:true,skipReason:'Unavailable capability'});
 for(const row of [good,bad,skip])assertRecord(row,'case-result');
 const legacy=envelope('regression-results',{tests:2,passed:1,failed:1,cases:[good,bad],workRoot:work});assertRecord(legacy,'regression-results');const mixed={...legacy,tests:3,skipped:1,cases:[good,bad,skip]};assertRecord(mixed,'regression-results');assertRecord({...mixed,tests:1,passed:0,failed:0,cases:[skip]},'regression-results');
 for(const row of [{...skip,pass:true},{...skip,skipReason:' '},{...good,skipReason:'orphan'},{...skip,unknown:true}])assert.throws(()=>assertRecord(row,'case-result'));
 for(const value of [{...mixed,skipped:0},{...mixed,tests:4},{...mixed,passed:2},{...mixed,cases:[good,bad,{...skip,pass:true}]}])assert.throws(()=>assertRecord(value,'regression-results'));const omitted={...mixed};delete omitted.skipped;assert.throws(()=>assertRecord(omitted,'regression-results'));return{legacyReadable:true,mixedValid:true,contradictionsRefused:true};
});
await test('pack-f8-platform-branch','An injected unavailable-platform branch emits skip and zero selection remains an error',async()=>{
 const dir=path.join(root,'pack-f8-platform');await fs.mkdir(dir);const hook=path.join(dir,'platform-hook.mjs');await fs.writeFile(hook,"Object.defineProperty(process,'platform',{value:'linux'});\n");
 const r=spawnSync(process.execPath,['--import',pathToFileURL(hook).href,path.join(source,'scripts/tests/harness-regression.mjs'),'--work-root',dir,'--case-prefix','current-install-directory-streams'],{cwd:work,windowsHide:true,shell:false});assert.ifError(r.error);assert.equal(r.status,0,r.stderr?.toString());const line=r.stdout.toString().trim().split(/\r?\n/).map(x=>JSON.parse(x)).find(x=>x.summary),summary=line.summary,result=await readJson(summary.resultFile);assert.deepEqual({tests:summary.tests,passed:summary.passed,failed:summary.failed,skipped:summary.skipped},{tests:1,passed:0,failed:0,skipped:1});assert.equal(result.results[0].pass,false);assert.equal(result.results[0].skipped,true);assert.ok(result.results[0].skipReason);
 const z=spawnSync(process.execPath,[path.join(source,'scripts/tests/harness-regression.mjs'),'--work-root',dir,'--case-prefix','NO-SUCH-CASE'],{cwd:work,windowsHide:true,shell:false});assert.equal(z.status,1);const zero=JSON.parse(z.stdout.toString()).summary;assert.deepEqual({tests:zero.tests,passed:zero.passed,failed:zero.failed,skipped:zero.skipped},{tests:0,passed:0,failed:0,skipped:0});assert.ok(zero.selectionError);return{branchInjectionOnly:true,actualPosixExecution:false,allSkip:{passed:0,skipped:1},zeroSelectionExit:1};
});

for(const mode of ['preexisting','directory-swap','second-capture-drift','missing-file-id'])await test('pack-f7-boundary-'+mode,'Unconfirmed private creation and changed identities/security refuse before the first sensitive write',async()=>{
 if(process.platform!=='win32')return{notApplicable:'Windows private storage boundary required'};
 const f=await installFixture('private-boundary-'+mode),plan=await previewInstall(f.options),before=await fs.readFile(f.agents);let created=false,hit=false,error;
 await patchMethod(childProcess,'spawnSync',old=>function(exe,args,options){let request;try{request=JSON.parse(options?.input?.toString());}catch{}if(request?.action==='createPrivateStorage'){hit=true;if(mode==='preexisting'){const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command','[IO.Directory]::CreateDirectory([Console]::In.ReadToEnd()) | Out-Null'],{input:Buffer.from(plan.backupDirectory),windowsHide:true,shell:false});assert.equal(r.status,0);}const result=old(exe,args,options);created=result.status===0;if(created&&mode==='directory-swap'){const original=plan.backupDirectory+'-preserved';const script='[IO.Directory]::Move($args[0],$args[1]);[IO.Directory]::CreateDirectory($args[0])|Out-Null';const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',script,plan.backupDirectory,original],{windowsHide:true,shell:false});assert.equal(r.status,0,r.stderr?.toString());}if(created&&mode==='missing-file-id'){const value=JSON.parse(result.stdout);delete value.createdObjectId;return{...result,stdout:Buffer.from(JSON.stringify(value))};}return result;}
 const result=old(exe,args,options);if(created&&mode==='second-capture-drift'&&request?.action==='capture'&&request.entries.length===1&&key(request.entries[0].path)===key(plan.backupDirectory)){const value=JSON.parse(result.stdout);value.results[0].metadata.sddl+='(A;OICI;FR;;;WD)';return{...result,stdout:Buffer.from(JSON.stringify(value))};}return result;},async()=>{try{await applyInstall(plan);}catch(e){error=e;}});
 assert.ok(hit);assert.ok(error);assert.equal(error.recovery.completedTargets,0);assert.deepEqual(await fs.readFile(f.agents),before);assert.deepEqual(await fs.readdir(plan.backupDirectory),[]);return{mode,zeroSensitiveFiles:true,zeroTargetWrites:true};
});

await test('pack-f7-initial-identity-handoff','Private creation retains the first helper-matched identity instead of rebasing to a later same-ACL directory',async()=>{
 if(process.platform!=='win32')return{notApplicable:'Windows identity handoff requires Windows'};
 const f=await installFixture('private-id-handoff'),plan=await previewInstall(f.options),before=await fs.readFile(f.agents);let created=false,swapped=false,error;
 await patchMethod(childProcess,'spawnSync',old=>function(exe,args,options){const r=old(exe,args,options);let request;try{request=JSON.parse(options?.input?.toString());}catch{}if(request?.action==='createPrivateStorage'&&r.status===0){const replacement=structuredClone(request);replacement.entries[0].path+='-replacement';const made=old(exe,args,{...options,input:Buffer.from(JSON.stringify(replacement))});assert.equal(made.status,0,made.stderr?.toString());created=true;}return r;},()=>patchMethod(fs,'lstat',old=>async function(file,...args){const st=await old(file,...args);if(created&&!swapped&&key(file)===key(plan.backupDirectory)){swapped=true;await fs.rename(plan.backupDirectory,plan.backupDirectory+'-original');await fs.rename(plan.backupDirectory+'-replacement',plan.backupDirectory);}return st;},async()=>{try{await applyInstall(plan);}catch(e){error=e;}}));
 assert.ok(swapped);assert.ok(error);assert.equal(error.recovery.completedTargets,0);assert.deepEqual(await fs.readFile(f.agents),before);assert.deepEqual(await fs.readdir(plan.backupDirectory),[]);return{sameAclReplacementRefused:true,zeroSensitiveBytes:true};
});

for(const mode of ['directory-before-open','file-acl-after-open'])await test('pack-f7-sensitive-'+mode,'Sensitive file bytes are withheld until the opened file and original private parent are verified',async()=>{
 if(process.platform!=='win32')return{notApplicable:'Windows sensitive file ACL check required'};
 const f=await installFixture('sensitive-'+mode,{bytes:Buffer.from('SYNTHETIC private sentinel '+randomUUID())}),parent=path.join(f.home,'harness-install-backups');await fs.mkdir(parent);setFixtureAcl(parent,{broad:true});const plan=await previewInstall(f.options),planFile=path.join(plan.backupDirectory,'plan.json'),before=await fs.readFile(f.agents);let hit=false,error;
 const swap=async()=>{hit=true;await fs.rename(plan.backupDirectory,plan.backupDirectory+'-preserved');await fs.mkdir(plan.backupDirectory);};
 await patchMethod(fs,'writeFile',old=>async function(file,...args){if(!hit&&mode==='directory-before-open'&&key(file)===key(planFile))await swap();return old(file,...args);},()=>patchMethod(fs,'open',old=>async function(file,flags,...args){if(!hit&&mode==='directory-before-open'&&key(file)===key(planFile))await swap();const handle=await old(file,flags,...args);if(!hit&&mode==='file-acl-after-open'&&key(file)===key(planFile)&&flags==='wx'){hit=true;setFixtureAcl(planFile,{broad:true});}return handle;},async()=>{try{await applyInstall(plan);}catch(e){error=e;}}));
 assert.ok(hit);assert.ok(error);assert.equal(error.recovery.completedTargets,0);assert.deepEqual(await fs.readFile(f.agents),before);assert.equal((await fs.stat(planFile)).size,0);return{mode,zeroSensitiveBytes:true,zeroTargetWrites:true};
});

for(const mode of ['before-publication','after-publication','cleanup-failure'])await test('pack-io-'+mode,'Injected confirmation-journal errors preserve actual written prefix and stop all later business writes',async()=>{
 const f=await installFixture('io-'+mode,{copy:true});await fs.writeFile(path.join(f.target,'LICENSE'),'SYNTHETIC changed license');const plan=await previewInstall(f.options),manifest=path.join(plan.backupDirectory,'rollback.json');let hit=false,error,diagnostic,unlinked=false;const handles=new Map();
 await patchMethod(fs,'open',old=>async function(file,...args){const h=await old(file,...args);if(!String(file).includes('rollback.json.'))return h;const token=randomUUID();handles.set(token,{path:String(file),closed:false});return wrapHandle(h,{close:async()=>{const r=await h.close();handles.get(token).closed=true;return r;}});},()=>patchMethod(fs,'unlink',old=>async function(file,...args){if(mode==='cleanup-failure'&&hit&&String(file).startsWith(manifest+'.')){unlinked=true;throw Object.assign(new Error('SYNTHETIC cleanup denied'),{code:'EACCES'});}return old(file,...args);},()=>patchMethod(fs,'rename',old=>async function(from,to,...args){if(!hit&&key(to)===key(manifest)){const pending=await readJson(from);if(pending.completedTargets===1){hit=true;diagnostic={injected:true,mode,candidateCount:pending.completedTargets,lastOperation:pending.operations.at(-1),before:{source:await ioPathFacts(from),destination:await ioPathFacts(to)},ownedHandles:[...handles.values()].filter(x=>key(x.path)===key(from))};assert.ok(diagnostic.ownedHandles.length);assert.ok(diagnostic.ownedHandles.every(x=>x.closed));if(mode==='after-publication')await old(from,to,...args);const fault=Object.assign(new Error('SYNTHETIC EPERM journal rename'),{code:'EPERM',syscall:'rename',path:String(from),dest:String(to)});diagnostic.error=rawIOError(fault);throw fault;}}return old(from,to,...args);},async()=>{try{await applyInstall(plan);}catch(e){error=e;}})));
 assert.ok(hit);assert.ok(error);assert.equal(error.recovery.completedTargets,1);assert.equal(await digest(plan.changes[0].target),plan.changes[0].after);for(const c of plan.changes.slice(1))assert.equal((await inspectForTest(c.target)).sha256,c.before);const journal=await readJson(manifest);assert.equal(journal.status,'prepared');assert.equal(journal.completedTargets,mode==='after-publication'?1:0);await assert.rejects(rollbackInstall(manifest),/completed installed/i);assert.match(error.message,/SYNTHETIC EPERM/);if(mode==='cleanup-failure'){assert.ok(unlinked);assert.match(error.message,/cleanup denied/);}diagnostic.after={source:await ioPathFacts(diagnostic.error.path),destination:await ioPathFacts(manifest)};diagnostic.persistedCount=journal.completedTargets;diagnostic.actualCount=1;diagnostic.nextTargetsUnchanged=true;diagnostic.publication=error.cause?.journalPublished??null;return diagnostic;
});
async function inspectForTest(file){try{return{sha256:await digest(file)};}catch(e){if(e.code==='ENOENT')return{sha256:null};throw e;}}

await test('pack-io-observer-errors','Observer failures remain distinct and never replace the original operation error',async()=>{
 const primary=Object.assign(new Error('SYNTHETIC original operation'),{code:'ORIGINAL_PROBE',recovery:{completedTargets:3}}),warnings=[];let result;
 await patchMethod(process.stderr,'write',old=>function(value){warnings.push(String(value));return true;},()=>patchMethod(fs,'writeFile',old=>async function(file,...args){if(String(file).endsWith('observer-primary-io-diagnostics.json')||String(file).endsWith('observer-success-io-diagnostics.json'))throw Object.assign(new Error('SYNTHETIC diagnostic persistence'),{code:'EACCES'});return old(file,...args);},async()=>{
  result=await captureOutcome(withIODiagnostics('observer-primary',async()=>{throw primary;}));assert.equal(result.error,primary);assert.equal(result.error.code,'ORIGINAL_PROBE');assert.equal(result.error.recovery.completedTargets,3);assert.equal(result.error.observerFailure.stage,'persist-diagnostic');
  const success=await captureOutcome(withIODiagnostics('observer-success',async()=>({actualBodyCompleted:true})));assert.equal(success.error.observerOnly,true);assert.equal(success.error.observerFailure.stage,'persist-diagnostic');assert.notEqual(success.error,primary);
 }));assert.ok(warnings.join('').includes('ORIGINAL_PROBE'));
 const dir=path.join(root,'observer-pre-read');await fs.mkdir(dir);const from=path.join(dir,'rollback.json.synthetic.tmp'),to=path.join(dir,'rollback.json');await fs.writeFile(from,'SYNTHETIC non-JSON bytes');await fs.writeFile(to,'SYNTHETIC previous bytes');
 await withIODiagnostics('observer-pre-read',()=>fs.rename(from,to));assert.equal(await fs.readFile(to,'utf8'),'SYNTHETIC non-JSON bytes');const evidence=await readJson(path.join(root,'observer-pre-read-io-diagnostics.json'));assert.equal(evidence.observations.length,1);const row=evidence.observations[0];assert.equal(row.nativeAttempted,true);assert.equal(row.outcome,'published');assert.equal(row.observerFailures[0].stage,'read-candidate');assert.equal(row.error,undefined);assert.ok(row.before.startedAt&&row.before.completedAt);
 return{primaryIdentityPreserved:true,observerOnlyFailureSeparated:true,preReadFailureDidNotReplaceNativeOperation:true,observationWindowsRecorded:true};
});
const selectionError=casePrefix!==null&&results.length===0?'No regression cases matched --case-prefix '+casePrefix:null;

const summary={suite:'sciautoharness-regression',syntheticOnly:true,node:process.version,platform:process.platform,fixtureRoot:root,source,selection:casePrefix??'all',fixturePreparationRetries,...caseCounts(results),...(selectionError?{selectionError}:{}),results};

const resultFile=path.join(root,'regression-results.json');

await writeJson(resultFile,summary);

console.log(JSON.stringify({summary:{tests:summary.tests,passed:summary.passed,failed:summary.failed,skipped:summary.skipped,fixtureRoot:root,resultFile,...(selectionError?{selectionError}:{})}}));

if(selectionError)console.error(selectionError);

process.exitCode=summary.failed||selectionError?1:0;
