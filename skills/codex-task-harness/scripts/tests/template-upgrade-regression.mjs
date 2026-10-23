// SYNTHETIC local upgrade tests. Baseline code is explicit, hash-bound and never modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const argv=process.argv.slice(2),option=name=>{const i=argv.indexOf(name);return i<0?null:argv[i+1];};
const required=name=>{const v=option(name);if(!v||!path.isAbsolute(v))throw new Error(`Supply ${name} ABSOLUTE_PATH`);return path.resolve(v);};
const baseline=required('--baseline-source'),manifest=required('--baseline-manifest'),work=required('--work-root');
const candidate=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
assert.notEqual(baseline,candidate,'Use a separate frozen baseline');
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=async(p,v)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,JSON.stringify(v,null,2)+'\n');};
async function tree(dir){const result={};async function walk(d){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else{assert.ok(e.isFile(),'No linked test inputs');result[path.relative(dir,p).replaceAll('\\','/')]=hash(await fs.readFile(p));}}}await walk(dir);return result;}
const rawManifest=await json(manifest),expected=rawManifest.currentSkillHashes??rawManifest;
assert.deepEqual(await tree(baseline),expected,'Baseline source does not match its supplied hash map');
const baselineHashes=await tree(baseline),candidateHashes=await tree(candidate);
const old=await import(pathToFileURL(path.join(baseline,'scripts/lib/engine.mjs')).href);
const current=await import(pathToFileURL(path.join(candidate,'scripts/lib/engine.mjs')).href);
await fs.mkdir(work,{recursive:true});const root=await fs.mkdtemp(path.join(work,'upgrade-'));
let commandNumber=0;const results=[],fixturePreparationRetries=[],prepared=option('--prepared-index')?await json(required('--prepared-index')):null;
if(prepared)assert.deepEqual(prepared.baselineHashes,baselineHashes);
function cmd(source,args,exit=0){
 const argv=[path.join(source,'scripts/harness.mjs'),...args],r=spawnSync(process.execPath,argv,{cwd:work,encoding:'utf8',timeout:20000,windowsHide:true,shell:false});
 const name=String(++commandNumber).padStart(4,'0');return fs.mkdir(path.join(root,'commands'),{recursive:true}).then(async()=>{
  await fs.writeFile(path.join(root,'commands',name+'.stdout'),r.stdout??'');await fs.writeFile(path.join(root,'commands',name+'.stderr'),r.stderr??'');
  await write(path.join(root,'commands',name+'.json'),{execPath:process.execPath,argv,cwd:work,status:r.status,signal:r.signal,error:r.error?.message??null,sourceHashes:source===baseline?baselineHashes:candidateHashes});
  assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,exit,r.stderr+' '+r.stdout);return exit===0?JSON.parse(r.stdout):r;
 });
}
const args=(f,command,step)=>[command,'--project',f.project,'--id',f.id,...(step?['--task',step]:[])];
async function cli(f,command,step,extra=[],exit=0,source=candidate){return cmd(source,[...args(f,command,step),...extra],exit);}
async function fixture(label,layout,declared){
 const project=path.join(root,label),id='synthetic-'+label;await fs.mkdir(project);const d=await old.draft(project,id,'SYNTHETIC baseline-to-candidate upgrade only','general',layout==='layered'?'layered':undefined);
 const f={project,id,directory:d.directory,layout,declared};f.c=await json(path.join(d.directory,'contract.json'));assert.equal(Object.hasOwn(f.c,'templateVersion'),false);
 if(declared)f.c.templateVersion=1;
 f.c.inputs=[{source:'SYNTHETIC immutable input, no real observations',path:'input.txt'}];await fs.writeFile(path.join(project,'input.txt'),'SYNTHETIC ORIGINAL\n');
 f.c.deliverables=['a','b'].map(s=>({id:'out-'+s,path:'out/'+s+'.txt'}));
 f.c.tasks=['a','b'].map((s,i)=>({id:s,title:'SYNTHETIC '+s,dependsOn:i?['a']:[],outputs:['out-'+s],acceptance:[{id:'artifact-'+s,type:'artifact',description:'SYNTHETIC artifact exists'},{id:'command-'+s,type:'command',description:'SYNTHETIC real criterion',command:process.execPath,args:['-e',`require('node:fs').writeFileSync('criterion-${s}.txt','SYNTHETIC');console.log('SYNTHETIC checked')`]}]}));
 if(layout==='layered')f.c.contextFiles=f.c.tasks.map(t=>({path:'phases/'+t.id+'.md',kind:'phase',tasks:[t.id],purpose:'SYNTHETIC phase',loadWhen:'After context selects '+t.id}));
 await write(path.join(d.directory,'contract.json'),f.c);
 if(layout==='layered'){
  const refs=await cli(f,'refs',null,[],0,baseline);
  for(const doc of refs.documents.filter(x=>x.path!=='HARNESS.md')){await fs.mkdir(path.dirname(doc.file),{recursive:true});await fs.writeFile(doc.file,`# SYNTHETIC upgrade phase\n\nResume with master/recovery, then context. Input: ${doc.inputs[0].absoluteMarkdown}\n\nMethod: execute deterministic local child only. Outputs: ${doc.deliverables.map(x=>x.markdown).join(', ')}\n\nAcceptance: actual criterion and byte checks. Failure: retain original run and evidence. Handoff: verified dependencies only.\n`);}
  for(let attempt=0;;attempt++){
   try{f.review=(await cli(f,'prepare-review',null,[],0,baseline)).review;break;}
   catch(error){const s=await state(f);if(attempt>=2||process.platform!=='win32'||!/EPERM:.*rename[\s\S]*HARNESS\.md/.test(error.message)||s.phase!=='draft'||s.review||s.approval||Object.keys(s.tasks).length)throw error;fixturePreparationRetries.push({id:f.id,attempt:attempt+1,error:error.message});await new Promise(r=>setTimeout(r,(attempt+1)*200));}
  }
 }else{await cli(f,'render',null,[],0,baseline);f.review=await cli(f,'review',null,[],0,baseline);}
 await approve(old,f);return f;
}
async function approve(runtime,f){return runtime.recordDecision(f.project,f.id,{actor:'user',decision:'approve',taskId:f.id,revision:f.c.revision,digest:f.review.digest,message:'SYNTHETIC TEST APPROVAL ONLY, never real authorization',source:'SYNTHETIC isolated upgrade regression'});}
async function produce(f,step,exit=0){
 const output=path.join(f.project,'out',step+'.txt');await fs.mkdir(path.dirname(output),{recursive:true});
 const r=spawnSync(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],'SYNTHETIC actual production\\n');console.log('SYNTHETIC produced');process.exitCode=Number(process.argv[2])",output,String(exit)],{cwd:f.project,encoding:'utf8',windowsHide:true,shell:false,timeout:10000});assert.equal(r.error,undefined);assert.equal(r.status,exit);assert.equal(r.signal,null);
 const log=path.join(f.project,'producer-'+step+'-'+Date.now()+'.log');await fs.writeFile(log,r.stdout+r.stderr);
 return {reference:log,result:exit===0?'ok':'failed',process:{processState:'closed',pid:r.pid,exitCode:r.status,signal:r.signal,timedOut:false},logs:[{path:log,sha256:hash(await fs.readFile(log))}]};
}
async function pending(runtime,f,step,result='ok'){const b=await runtime.begin(f.project,f.id,step),p=await produce(f,step,result==='ok'?0:7);const facts={runId:b.runId,executor:'codex-native',...p};await runtime.submit(f.project,f.id,step,facts);return {b,facts};}
async function finish(runtime,f,step){const p=await pending(runtime,f,step);await runtime.verify(f.project,f.id,step);return p;}
const state=f=>json(path.join(f.directory,'state.json'));
const closed=(s,run)=>s.events.filter(e=>e.type==='execution_receipt'&&e.runId===run).length;
async function evidence(f){const t=await tree(f.directory);return Object.fromEntries(Object.entries(t).filter(([k])=>/^(receipt-|acceptance-|check-|execution-)/.test(k)));}
async function preserve(f,before){const after=await tree(f.directory);for(const [p,h]of Object.entries(before))assert.equal(after[p],h,'Old evidence changed: '+p);}
async function checkpoint(f,label){await write(path.join(root,'checkpoints',f.id+'-'+label+'.json'),{project:f.project,files:await tree(f.project),state:await state(f)});}
async function readonly(f,step='a',valid=true,tasksUnchanged=valid){
 const before=await tree(f.project),s=await state(f);const status=await cli(f,'status'),ctx=await cli(f,'context',step);assert.deepEqual(await tree(f.project),before,'status/context wrote old package');
 assert.equal(status.review.digest,s.review.digest);if(valid)assert.deepEqual(status.approval,s.approval);else assert.equal(status.approval,null);if(tasksUnchanged)assert.deepEqual(status.tasks,s.tasks);
 const trusted=(await old.status(f.project,f.id)).activeExecutions;assert.deepEqual(status.activeExecutions,trusted);assert.deepEqual(ctx.activeExecutions,trusted);return {status,ctx};
}
async function final(f){const s=await current.status(f.project,f.id);assert.equal(s.phase,'verified');assert.equal(s.activeExecutions.length,0);await checkpoint(f,'final');return s;}
async function recover(f,approvalLost){
 if(approvalLost){f.c=await json(path.join(f.directory,'contract.json'));if(f.declared)f.c.templateVersion=1;else delete f.c.templateVersion;f.c.revision++;await write(path.join(f.directory,'contract.json'),f.c);await current.render(f.project,f.id);f.review=await current.prepareReview(f.project,f.id);await approve(current,f);}
 let s=await current.status(f.project,f.id);for(const t of f.c.tasks)if(s.tasks[t.id].status!=='verified'){await finish(current,f,t.id);s=await current.status(f.project,f.id);}return final(f);
}
async function test(id,body){try{results.push({id,pass:true,observed:await body()});}catch(e){results.push({id,pass:false,error:e.message,stack:e.stack});}console.log(JSON.stringify(results.at(-1)));}
async function barrier(f,exit=0){
 const helper=path.join(baseline,'scripts/tests/helpers/controlled-child.mjs'),ready=path.join(f.project,'ready.json'),release=path.join(f.project,'release.txt');
 const code="import {pathToFileURL} from 'node:url';const [helper,ready,release,exit]=process.argv.slice(1);process.exitCode=Number(exit);process.argv=[process.execPath,helper,'barrier',ready,release];await import(pathToFileURL(helper).href);";
 const child=spawn(process.execPath,['--input-type=module','-e',code,helper,ready,release,String(exit)],{cwd:f.project,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let out='',err='',ended=false;
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const end=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{ended=true;resolve({code,signal});});});
 let saved;
 const close=async()=>{if(saved)return saved;await fs.writeFile(release,'SYNTHETIC release');child.stdin.end();const r=await end;assert.equal(r.code,exit);assert.equal(r.signal,null);const log=path.join(f.project,'actual-child.log');await fs.writeFile(log,out+err);assert.match(out,/barrier released/);return saved={reference:log,result:r.code===0?'ok':'failed',process:{processState:'closed',pid:child.pid,exitCode:r.code,signal:r.signal,timedOut:false},logs:[{path:log,sha256:hash(await fs.readFile(log))}]};};
 try{const start=Date.now();for(;;){try{await fs.access(ready);break;}catch(e){if(e.code!=='ENOENT')throw e;}assert.equal(ended,false,'Child ended before readiness');assert.ok(Date.now()-start<10000,'Child readiness timeout');await new Promise(r=>setTimeout(r,10));}assert.equal((await json(ready)).pid,child.pid);}catch(e){await close();throw e;}
 return {close,isActive:()=>!ended};
}

const basic=['approved','pending','verified','complete'];
if(argv.includes('--prepare-only')){
 const fixtures={};for(const layout of ['layered','legacy'])for(const declared of [false,true])for(const point of basic){
  const key=layout+'-'+(declared?'one':'missing')+'-'+point,f=await fixture(key,layout,declared);
  if(point==='pending')f.original=await pending(old,f,'a');if(['verified','complete'].includes(point))f.original=await finish(old,f,'a');if(point==='complete')await finish(old,f,'b');await checkpoint(f,'baseline');fixtures[key]=f;
 }
 const index=path.join(work,'prepared-index.json');await write(index,{baselineHashes,root,fixtures});console.log(JSON.stringify({preparedIndex:index,fixtures:Object.keys(fixtures).length}));
}else{
 for(const layout of ['layered','legacy'])for(const declared of [false,true]){
  const prefix=layout+'-'+(declared?'one':'missing');
  for(const point of basic)await test(prefix+'-'+point,async()=>{
   const key=prefix+'-'+point;let f=prepared?.fixtures[key];
   if(!f){f=await fixture(key,layout,declared);if(point==='pending')f.original=await pending(old,f,'a');if(['verified','complete'].includes(point))f.original=await finish(old,f,'a');if(point==='complete')await finish(old,f,'b');}
   await checkpoint(f,'before-upgrade');const keep=await evidence(f),prior=await state(f);await readonly(f,point==='complete'?'b':'a');
   if(point==='approved'){await finish(current,f,'a');await finish(current,f,'b');}
   if(point==='pending'){await assert.rejects(current.begin(f.project,f.id,'a'));await assert.rejects(current.prepareReview(f.project,f.id));await current.verify(f.project,f.id,'a');await finish(current,f,'b');}
   if(point==='verified')await finish(current,f,'b');
   if(f.original){const before=await state(f),r=await current.submit(f.project,f.id,'a',f.original.facts);assert.equal(r.replayed,true);assert.equal(r.phase,'verified');const after=await state(f);assert.equal(after.tasks.a.acceptedAt,before.tasks.a.acceptedAt);assert.equal(closed(after,f.original.b.runId),1);}
   await final(f);await preserve(f,keep);assert.equal((await state(f)).review.digest,prior.review.digest);return {project:f.project,originalDigest:prior.review.digest,final:'verified',oldEvidencePreserved:true};
  });
  for(const mode of ['ok','failed','approval','dependency','unknown','v2'])await test(prefix+'-active-'+mode,async()=>{
   const f=await fixture(prefix+'-active-'+mode,layout,declared),step=mode==='dependency'?'b':'a';if(step==='b')await finish(old,f,'a');
   const b=await cli(f,'begin',step,[],0,baseline);if(mode==='ok')await produce(f,step);const child=await barrier(f,mode==='failed'?7:0);let facts;
   try{
    await checkpoint(f,'baseline-active');const keep=await evidence(f);assert.equal(child.isActive(),true);await readonly(f,step);
    if(mode==='approval')await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift');
    if(mode==='dependency')await fs.appendFile(path.join(f.project,'out/a.txt'),'SYNTHETIC drift');
    if(['unknown','v2'].includes(mode)){const c=await json(path.join(f.directory,'contract.json'));c.templateVersion=mode==='unknown'?4:2;await write(path.join(f.directory,'contract.json'),c);}
    const stale=['approval','dependency','unknown','v2'].includes(mode),lost=['approval','unknown','v2'].includes(mode);
    const seen=await readonly(f,step,!lost,!stale);assert.equal(seen.status.activeExecutions[0].runId,b.runId);assert.equal(seen.status.activeExecutions[0].reviewDigest,b.reviewDigest);assert.equal(child.isActive(),true);
    const criterionFiles=Object.fromEntries(Object.entries(await tree(f.project)).filter(([p])=>p.startsWith('criterion-')));
    assert.match((await cli(f,'begin',step,[],1)).stderr,/HARNESS_ACTIVE_EXECUTION/);assert.match((await cli(f,'verify',step,[],1)).stderr,/HARNESS_ACTIVE_EXECUTION/);await cli(f,'review',null,[],1);await cli(f,'prepare-review',null,[],1);if(mode==='unknown')await cli(f,'render',null,[],1);
    assert.deepEqual(Object.fromEntries(Object.entries(await tree(f.project)).filter(([p])=>p.startsWith('criterion-'))),criterionFiles,'Guard ran a criterion');
    facts={runId:b.runId,executor:'codex-native',...await child.close()};const payload=path.join(f.project,'actual-submission.json');await write(payload,facts);
    const r=await cli(f,'submit',step,['--receipt',payload]);assert.equal(r.executionClosed,true);assert.equal(r.acceptedForVerification,!stale);assert.equal(r.phase,stale?'stale':mode==='failed'?'failed':'pending_acceptance');
    const receipt=path.join(f.directory,'receipt-'+b.runId+'.json'),bytes=await fs.readFile(receipt);const replay=await current.submit(f.project,f.id,step,facts);assert.equal(replay.replayed,true);assert.equal(replay.phase,r.phase);assert.deepEqual(await fs.readFile(receipt),bytes);assert.equal(closed(await state(f),b.runId),1);await preserve(f,keep);
    if(mode==='ok'){await current.verify(f.project,f.id,'a');await finish(current,f,'b');await final(f);}else await recover(f,lost);
    const prior=await state(f);await current.submit(f.project,f.id,step,facts);assert.deepEqual((await state(f)).tasks,prior.tasks);assert.deepEqual(await fs.readFile(receipt),bytes);return {project:f.project,runId:b.runId,process:facts.process,closure:r.phase,final:'verified'};
   }finally{await child.close();}
  });
  for(const loss of ['none','approval','dependency'])await test(prefix+'-published-state-failure-'+loss,async()=>{
   const f=await fixture(prefix+'-published-'+loss,layout,declared),step=loss==='dependency'?'b':'a';if(step==='b')await finish(old,f,'a');let hits=0,error;const rename=fs.rename;
   fs.rename=async function(from,to,...rest){if(path.resolve(String(to))===path.join(f.directory,'state.json')){const s=await json(from);if(s.events.some(e=>e.type==='execution_receipt'&&e.step===step)){hits++;throw new Error('SYNTHETIC state publication failure');}}return rename.call(this,from,to,...rest);};
   try{await old.run(f.project,f.id,step,{codex:path.join(baseline,'scripts/tests/helpers/controlled-child.mjs'),timeoutMs:5000});}catch(e){error=e;}finally{fs.rename=rename;}
   assert.equal(hits,2);assert.equal(error.executionClosed,false);assert.equal(error.processResult.processState,'closed');assert.equal(error.processResult.exitCode,0);
   const facts=JSON.parse(JSON.stringify(error.submissionFacts)),file=path.join(f.directory,'receipt-'+facts.runId+'.json'),bytes=await fs.readFile(file);await checkpoint(f,'published-before-upgrade');
   if(loss==='approval')await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift');if(loss==='dependency')await fs.appendFile(path.join(f.project,'out/a.txt'),'SYNTHETIC drift');
   const r=await current.submit(f.project,f.id,step,facts);assert.equal(r.replayed,true);assert.equal(r.executionClosed,true);assert.equal(r.acceptedForVerification,loss==='none');assert.equal(r.phase,loss==='none'?'pending_acceptance':'stale');
   await current.submit(f.project,f.id,step,facts);assert.equal(closed(await state(f),facts.runId),1);assert.deepEqual(await fs.readFile(file),bytes);
   await assert.rejects(current.submit(f.project,f.id,step,{...facts,result:'failed'}),/Conflicting/);assert.deepEqual(await fs.readFile(file),bytes);
   if(loss==='none'){await produce(f,step);await current.verify(f.project,f.id,step);}await recover(f,loss==='approval');assert.deepEqual(await fs.readFile(file),bytes);return {project:f.project,runId:facts.runId,stateFaultHits:hits,process:error.processResult,closure:r.phase,final:'verified'};
  });
  for(const change of ['summary','body','version','mismatch','receipt-facts','receipt-json','receipt-review','receipt-hash'])await test(prefix+'-reject-'+change,async()=>{
   const f=await fixture(prefix+'-reject-'+change,layout,declared),p=await pending(old,f,'a'),file=path.join(f.directory,'receipt-'+p.b.runId+'.json');const prior=await state(f);
   if(['summary','body','version','mismatch'].includes(change)){
    if(change==='version'){f.c.templateVersion=2;await write(path.join(f.directory,'contract.json'),f.c);}
    else{const master=path.join(f.directory,'HARNESS.md'),text=await fs.readFile(master,'utf8');
     if(change==='summary'){const {renderContract}=await import('../lib/contract.mjs');await fs.writeFile(master,renderContract({...f.c,templateVersion:2}));}
     else{await fs.writeFile(master,change==='body'?text+'\nSYNTHETIC changed':text.replace(layout==='layered'?'Execution receipts and exit zero mean pending acceptance.':'Exit zero means pending acceptance.','SYNTHETIC mismatched summary'));if(change==='mismatch'){f.c.templateVersion=2;await write(path.join(f.directory,'contract.json'),f.c);}}
    }
    assert.equal((await current.status(f.project,f.id)).approval,null);await assert.rejects(current.verify(f.project,f.id,'a'));
    await assert.rejects(current.prepareReview(f.project,f.id));f.c.revision++;f.c.templateVersion=2;await write(path.join(f.directory,'contract.json'),f.c);await current.render(f.project,f.id);f.review=await current.prepareReview(f.project,f.id);assert.notEqual(f.review.digest,prior.review.digest);assert.equal((await current.status(f.project,f.id)).approval,null);await approve(current,f);await finish(current,f,'a');await finish(current,f,'b');await final(f);
   }else{
    let facts={...p.facts};if(change==='receipt-facts')facts.reference+=' changed';if(change==='receipt-review')facts.reviewDigest='wrong';if(change==='receipt-json')await fs.writeFile(file,'{');if(change==='receipt-hash')await fs.appendFile(file,' ');
    const bytes=await fs.readFile(file);await assert.rejects(current.submit(f.project,f.id,'a',facts));assert.deepEqual(await fs.readFile(file),bytes);assert.equal(closed(await state(f),p.b.runId),1);
   }
   return {project:f.project,rejected:change};
  });
 }
 assert.deepEqual(await tree(candidate),candidateHashes,'Candidate changed during the suite');assert.deepEqual(await tree(baseline),baselineHashes,'Baseline changed during the suite');
 const summary={suite:'template-upgrade-regression',syntheticOnly:true,node:process.version,execPath:process.execPath,platform:process.platform,baseline,baselineHashes,candidate,candidateHashes,fixturePreparationRetries,preparedIndex:option('--prepared-index'),fixtureRoot:root,tests:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
 await write(path.join(root,'upgrade-results.json'),summary);console.log(JSON.stringify({tests:summary.tests,passed:summary.passed,failed:summary.failed,resultFile:path.join(root,'upgrade-results.json')}));process.exitCode=summary.failed?1:0;
}
assert.deepEqual(await tree(baseline),baselineHashes,'Frozen baseline was modified');
