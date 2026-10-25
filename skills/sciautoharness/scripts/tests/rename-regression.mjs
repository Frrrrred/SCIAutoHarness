import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import{pathToFileURL}from'node:url';
import inventories from '../lib/installation-inventories.json' with {type:'json'};
import{legacyInventories}from'../lib/identity.mjs';
import{previewInstall,applyInstall,rollbackInstall}from'../lib/install.mjs';
import*as candidate from'../lib/engine.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const readJson=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const writeJson=async(f,x)=>fs.writeFile(f,JSON.stringify(x,null,2)+'\n');
// Genuine frozen writers are reconstructed only from this explicitly supplied clone.
// Portable installations without preserved Git objects cannot claim historical-source coverage.
export async function frozenWriter({source,destination,commit,skill,inventory}){
 const repo=path.resolve(source,'../..'),git=path.join(repo,'.git');
 const st=await fs.lstat(git);assert.ok(st.isDirectory()&&!st.isSymbolicLink(),'Explicit full clone required');assert.equal(await fs.realpath(git),git);
 for(const p of [path.join(git,'commondir'),path.join(git,'objects/info/alternates')])assert.equal(await fs.access(p).then(()=>true,()=>false),false,'External Git object indirection is not accepted');
 assert.match(commit,/^[0-9a-f]{40}$/);assert.match(skill,/^(?:codex-task-harness|agent-task-harness|sciautoharness)$/);
 for(const [relative,expected]of Object.entries(inventory)){
  assert.ok(!relative.includes('..')&&!path.isAbsolute(relative));const r=spawnSync('git',['--git-dir='+git,'show',commit+':skills/'+skill+'/'+relative],{shell:false,windowsHide:true,maxBuffer:8*1024*1024});
  assert.equal(r.status,0,'A full clone with the preserved source commit is required: '+r.stderr);assert.equal(hash(r.stdout),expected);
  const file=path.join(destination,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,r.stdout);
 }
 return import(pathToFileURL(path.join(destination,'scripts/lib/install.mjs')));
}
export async function runRenameTests({test,source,root,patchMethod,fixturePreparationRetries}){
 const work=path.join(root,'rename');await fs.mkdir(work);
 const repo=path.resolve(source,'../..'),index={stateCheckpoints:[],extensionCheckpoints:[]},indexFile=path.join(work,'old-state-capture.json');
 const commits=['9b2532ffb6437193d6f6800a54a115ea2b6552e5','38d7d99dcd60b94f702d82f640b7dc4172530cfa'];
 const sources=[];
 for(const [i,commit]of commits.entries()){
  const dir=path.join(work,'frozen-'+i,'skills','codex-task-harness');
  await frozenWriter({source,destination:dir,commit,skill:'codex-task-harness',inventory:legacyInventories[i]});sources.push(dir);
 }
 const genuine3=path.join(work,'frozen-safety3','skills','agent-task-harness');
 await frozenWriter({source,destination:genuine3,commit:inventories.officialCommit,skill:'agent-task-harness',inventory:inventories.agentFull[0]});
 const original3=await import(pathToFileURL(path.join(genuine3,'scripts/lib/install.mjs')));
 const original4=await frozenWriter({source,destination:path.join(work,'frozen-safety4/skills/sciautoharness'),commit:inventories.canonicalSafety4.commit,skill:'sciautoharness',inventory:inventories.canonicalSafety4.files});
 const baseline=sources[0],engine=await import(pathToFileURL(path.join(baseline,'scripts/lib/engine.mjs')));
async function inventory(root){
  const files={};
  async function walk(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      assert.ok(!entry.isSymbolicLink(),'No unexpected link in captured fixture.');
      if(entry.isDirectory())await walk(file);
      else if(entry.isFile()){
        const bytes=await fs.readFile(file),stat=await fs.stat(file,{bigint:true});
        files[path.relative(root,file).split(path.sep).join('/')]=
          {bytes:bytes.length,sha256:hash(bytes),ino:stat.ino.toString(),dev:stat.dev.toString(),mode:stat.mode.toString(),nlink:stat.nlink.toString(),uid:stat.uid.toString(),gid:stat.gid.toString()};
      }else throw new Error('Unexpected fixture member: '+file);
    }
  }
  await walk(root);return files;
}
const commands=[];
function command(args){
  const r=spawnSync(process.execPath,[path.join(baseline,'scripts/harness.mjs'),...args],
    {cwd:work,encoding:'utf8',shell:false,windowsHide:true,timeout:30000});
  const record={args,code:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message??null};
  commands.push(record);
  assert.equal(r.status,0,JSON.stringify(record));
  return JSON.parse(r.stdout);
}
async function oldFixture(version,layered,state,{extension=false,entry="canonical",host="codex",tag=""}={}){
  const name=`${entry}-${host}-v-${version}-${layered?'layered':'legacy'}-${state.replaceAll('_','-')}${extension?'-extension':''}${tag?'-'+tag:''}`;
  const project=path.join(work,'states',name),id='synthetic-'+hash(Buffer.from(name)).slice(0,24);
  await fs.mkdir(project,{recursive:true});
  const d=await engine.draft(project,id,'SYNTHETIC current-baseline continuation fixture','general',layered?'layered':undefined);
  const c=await readJson(path.join(d.directory,'contract.json'));
  if(version==='missing')delete c.templateVersion;else c.templateVersion=version;
  c.inputs=[{source:'SYNTHETIC immutable fixture input; no real observations or authorization',path:'input.txt'}];
  await fs.writeFile(path.join(project,'input.txt'),'SYNTHETIC BASELINE INPUT\n');
  c.deliverables=[{id:'out-a',path:'out/a.txt'},{id:'out-b',path:'out/b.txt'}];
  c.tasks=['a','b'].map((step,i)=>({id:step,title:'Produce synthetic '+step,dependsOn:i?['a']:[],outputs:['out-'+step],
    acceptance:[{id:'exists-'+step,type:'artifact',description:'Synthetic declared artifact must exist'}]}));
  if(version===4)c.execution={allowedHosts:[host],defaultHost:host};
  if(extension)c.execution={allowedHosts:['deepseek-harness'],defaultHost:'deepseek-harness',customLegacyValue:'SYNTHETIC arbitrary old data'};
  if(layered)c.contextFiles=c.tasks.map(t=>({path:`phases/${t.id}.md`,kind:'phase',tasks:[t.id],purpose:'Synthetic '+t.id+' phase',loadWhen:'After context selects '+t.id}));
  await writeJson(path.join(d.directory,'contract.json'),c);
  if(layered){
    const refs=command(['refs','--project',project,'--id',id]);
    for(const doc of refs.documents.filter(x=>x.path!=='HARNESS.md')){
      await fs.mkdir(path.dirname(doc.file),{recursive:true});
      await fs.writeFile(doc.file,`# Synthetic ${doc.path}\n\nResume with master and recovery, then context. Load this stage only after context selects it.\n\nInput: ${doc.inputs[0].absoluteMarkdown}\n\nMethod: deterministic local writes under this synthetic project. All approval values are synthetic and never represent a real user.\n\nPlanned outputs: ${doc.deliverables.map(x=>x.markdown).join(', ')}\n\nAcceptance: inspect actual bytes and state transitions.\n\nFailure: preserve the original run and all evidence; stop this fixture on an assertion failure.\n\nHandoff: use current context before proceeding.\n`);
    }
  }
  async function prepareOld(action){
   for(let attempt=0;attempt<3;attempt++)try{return await action();}catch(error){
    const last=commands.at(-1),message=error.message+' '+(last?.stderr??'');
    const target=path.join(d.directory,'HARNESS.md'),stateFile=path.join(d.directory,'state.json');
    if(attempt===2||!message.includes('EPERM')||!message.includes('rename')||!message.includes(target)||!message.includes('HARNESS.md.')||!message.includes('.tmp'))throw error;
    const state=await readJson(stateFile);if(state.phase!=='draft'||state.approval||state.events.some(e=>e.type!=='draft')||Object.keys(state.tasks).length||await fs.access(path.join(d.directory,'review.json')).then(()=>true,()=>false))throw error;
    fixturePreparationRetries.push({suite:'rename',id,attempt:attempt+1,phase:'never-approved frozen-producer preparation',error:{message:error.message,code:error.code,stderr:last?.stderr??null},proof:{phase:state.phase,events:state.events.map(e=>e.type),approval:state.approval??null,tasks:Object.keys(state.tasks)}});
    await new Promise(resolve=>setTimeout(resolve,200));
   }
  }
  let review;
  if(layered){
    const prepared=await prepareOld(()=>command(['prepare-review','--project',project,'--id',id]));
    assert.equal(prepared.pathCheck.ok,true);review=prepared.review;
  }else{
    await prepareOld(()=>engine.render(project,id));
    const r=spawnSync(process.execPath,[path.join(baseline,'scripts/check-harness-paths.mjs'),'--project',project,'--package',d.directory,'--planned','out/a.txt','--planned','out/b.txt'],{cwd:work,encoding:'utf8',shell:false,windowsHide:true,timeout:30000});
    commands.push({args:['check-harness-paths','--project',project,'--package',d.directory],code:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message??null});
    assert.equal(r.status,0,r.stderr+' '+r.stdout);assert.equal(JSON.parse(r.stdout).ok,true);
    review=await prepareOld(()=>engine.prepareReview(project,id));
  }
  const approval={actor:'user',decision:'approve',taskId:id,revision:c.revision,digest:review.digest,
    message:'SYNTHETIC APPROVAL FIXTURE ONLY; not a real user decision.',source:'SYNTHETIC regression authorized by the real implementation task'};
  await engine.recordDecision(project,id,approval);
  let started=null,submitted=null,verified=null;
  if(state!=='approved'){
    started=await engine.begin(project,id,'a',{host,mode:'native'});
    if(state!=='active'){
      await fs.mkdir(path.join(project,'out'),{recursive:true});
      await fs.writeFile(path.join(project,'out/a.txt'),'SYNTHETIC BASELINE ARTIFACT A\n');
      submitted=await engine.submit(project,id,'a',{runId:started.runId,executor:host+'-native',reference:'SYNTHETIC baseline work in '+project,result:'ok'});
      assert.equal(submitted.phase,'pending_acceptance');
      if(state==='verified')verified=await engine.verify(project,id,'a');
    }
  }
  const status=await engine.status(project,id);
  assert.ok(status.approval);
  assert.equal(status.tasks.a?.status??'todo',({approved:'todo',pending_acceptance:'pending_acceptance',verified:'verified',active:'executing'})[state]);
  const record={entry,host,version,layout:layered?'layered':'legacy',initialState:state,extension,project,id,directory:d.directory,
    contract:c,review,approval,started,submitted,verified,status,files:await inventory(project)};
  (extension?(index.extensionCheckpoints??=[]):index.stateCheckpoints).push(record);
  await writeJson(indexFile,index);
  return record;
}

const entryPaths={canonical:path.join(source,'scripts/harness.mjs'),legacy:path.join(path.dirname(source),'codex-task-harness/scripts/harness.mjs')};
function call(entry,args){const r=spawnSync(process.execPath,[entryPaths[entry],...args],{cwd:work,encoding:'utf8',shell:false,windowsHide:true,timeout:30000});commands.push({entry,args,code:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message??null});assert.ifError(r.error);return r;}
function cliJson(entry,args){const r=call(entry,args);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
async function continueOld(f){
 const requestedEntry=f.entry;let removedEntryChecked=false;if(f.entry==='legacy'){const before=await inventory(f.project),gone=call('legacy',['context','--project',f.project,'--id',f.id,'--task','a']);assert.equal(gone.status,1);assert.match(gone.stderr,/MODULE_NOT_FOUND/);assert.deepEqual(await inventory(f.project),before);removedEntryChecked=true;f={...f,entry:'canonical'};}
 const args=['--project',f.project,'--id',f.id],receipt=f.submitted?await fs.readFile(f.submitted.receipt.path):null,before=await inventory(f.project),ctx=cliJson(f.entry,['context',...args,'--task','a']);
 assert.deepEqual(await inventory(f.project),before);assert.equal(ctx.review.digest,f.review.digest);assert.equal(ctx.review.approved,true);
 if(f.initialState==='active'){assert.equal(ctx.activeExecutions[0].runId,f.started.runId);assert.notEqual(call(f.entry,['begin',...args,'--task','a']).status,0);assert.notEqual(call(f.entry,['verify',...args,'--task','a']).status,0);}
 const complete=async step=>{const state=cliJson(f.entry,['status',...args]);if(state.tasks[step].status==='verified')return;
  const run=step==='a'&&f.initialState==='active'?f.started:cliJson(f.entry,['begin',...args,'--task',step,'--host',f.host]);
  await fs.mkdir(path.join(f.project,'out'),{recursive:true});await fs.writeFile(path.join(f.project,'out',step+'.txt'),'SYNTHETIC continuation '+step+'\n');
  const result=cliJson(f.entry,['submit',...args,'--task',step,'--run-id',run.runId,'--executor',f.host+'-native','--reference','SYNTHETIC actual continuation','--result','ok']);assert.equal(result.executionClosed,true);assert.equal(result.acceptedForVerification,true);cliJson(f.entry,['verify',...args,'--task',step]);
 };
 if(f.initialState==='pending_acceptance')cliJson(f.entry,['verify',...args,'--task','a']);else if(f.initialState!=='verified')await complete('a');
 if(f.initialState==='verified'){const value=JSON.parse(receipt),r=cliJson(f.entry,['submit',...args,'--task','a','--run-id',value.runId,'--executor',value.executor,'--reference',value.reference,'--result',value.result]);assert.equal(r.replayed,true);}
 await complete('b');const ended=cliJson(f.entry,['status',...args]);assert.equal(ended.phase,'verified');assert.equal(ended.review.digest,f.review.digest);assert.equal(ended.approval.digest,f.review.digest);assert.equal(ended.activeExecutions.length,0);
 if(receipt)assert.deepEqual(await fs.readFile(f.submitted.receipt.path),receipt);if(f.initialState==='verified')assert.equal(ended.tasks.a.acceptedAt,f.status.tasks.a.acceptedAt);
 assert.deepEqual(await readJson(path.join(f.directory,'contract.json')),f.contract);
 return{entry:requestedEntry,currentEntry:f.entry,removedEntryChecked,version:f.version,host:f.host,initialState:f.initialState,phase:ended.phase,originalRunId:f.started?.runId??null};
}
for(const entry of ['canonical','legacy'])for(const version of ['missing',1,2,3,4])for(const layered of [false,true])for(const state of ['approved','pending_acceptance','verified','active'])await test(`rename-old-${entry}-${version}-${layered?'layered':'legacy'}-${state.replaceAll('_','-')}`,'A genuine preserved runtime produces the original scene; removed legacy paths refuse without mutation and the canonical entry continues the same run',async()=>continueOld(await oldFixture(version,layered,state,{entry})));
for(const entry of ['canonical','legacy'])for(const host of ['claude-code','deepseek-harness'])for(const layered of [false,true])for(const state of ['approved','pending_acceptance','verified','active'])await test(`rename-host-${entry}-${host}-${layered?'layered':'legacy'}-${state.replaceAll('_','-')}`,'Published template4 host bindings survive every old state through the canonical entry; removed legacy paths refuse without state changes',async()=>continueOld(await oldFixture(4,layered,state,{entry,host})));
for(const entry of ['canonical','legacy'])await test('rename-old-extension-'+entry,'Arbitrary template3 execution JSON is preserved and keeps original Codex semantics',async()=>continueOld(await oldFixture(3,true,'approved',{entry,extension:true})));
for(const entry of ['canonical','legacy'])for(const kind of ['help','unknown','path-failure'])await test(`rename-entry-${entry}-${kind}`,'Canonical entry retains help and failure exits; the retired entry is absent',async()=>{
 if(entry==='legacy'){const r=kind==='path-failure'?spawnSync(process.execPath,[path.join(path.dirname(entryPaths[entry]),'check-harness-paths.mjs'),'--project',work,'--package',path.join(work,'missing-package')],{shell:false,windowsHide:true,encoding:'utf8'}):call(entry,kind==='help'?['help']:['context','--unknown','invalid']);assert.equal(r.status,1);assert.match(r.stderr,/MODULE_NOT_FOUND/);return{removedEntry:true,code:r.status};}
 if(kind==='path-failure'){const r=spawnSync(process.execPath,[path.join(path.dirname(entryPaths[entry]),'check-harness-paths.mjs'),'--project',work,'--package',path.join(work,'missing-package')],{encoding:'utf8',shell:false,windowsHide:true});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).ok,false);return{code:r.status};}
 const r=call(entry,kind==='help'?['help']:['context','--unknown','invalid']);assert.equal(r.status,kind==='help'?0:1);if(kind==='help')assert.match(r.stdout,/SCIAutoHarness \(local Node.js/);else assert.match(r.stderr,/Unknown|unknown/);return{code:r.status,nonempty:true};
});
const golden=await readJson(path.join(source,'scripts/tests/template-v4-golden.json'));
for(const example of golden.cases)await test('rename-frozen-'+example.id,'Renaming preserves independently captured template4 rendered bytes',async()=>{const{renderContract}=await import('../lib/contract.mjs');assert.equal(renderContract(example.contract),example.master);return{oracleCommit:golden.provenance.sourceCommit};});
async function oldInstall(name,{safety=2,host='codex',replacement=false}={},attempt=0){
 const dir=path.join(work,'install-'+name),home=path.join(dir,'home'),skillRoot=path.join(dir,'skills'),oldSource=sources[safety===1?1:0],api=await import(pathToFileURL(path.join(oldSource,'scripts/lib/install.mjs')));await fs.mkdir(home,{recursive:true});
 const file=path.join(home,host==='claude-code'?'CLAUDE.md':'AGENTS.md'),bytes=Buffer.concat([Buffer.from([239,187,191]),Buffer.from('# SYNTHETIC original rules\r\nUnicode \u4e2d\u6587 without final newline')]);await fs.writeFile(file,bytes);
 if(replacement){await fs.cp(oldSource,path.join(skillRoot,'codex-task-harness'),{recursive:true});await fs.writeFile(path.join(skillRoot,'codex-task-harness/LICENSE'),'SYNTHETIC longer original LICENSE\n');}
 const before=await inventory(dir),p=await api.previewInstall(safety===1?{codexHome:home,skillRoot,replaceSkill:replacement}:{host,hostHome:home,skillRoot,replaceSkill:replacement});let done;
 try{done=await api.applyInstall(p);}catch(error){
  // This frozen producer only prepares synthetic input. Preserve a failed scene;
  // never retry a candidate operation or reuse its partially written targets.
  const r=error.recovery,c=error.cause;
  if(attempt===2||c?.code!=='EPERM'||c.syscall!=='rename'||r?.stage!=='installed-manifest'||path.resolve(c.dest??'')!==path.resolve(r.manifest)||!String(c.path).startsWith(r.manifest+'.')||!String(c.path).endsWith('.tmp'))throw error;
  const record=await readJson(r.manifest);assert.equal(record.status,'prepared');assert.equal(record.safetyVersion,safety);
  assert.equal(record.changes.length,p.changes.length);for(const change of p.changes)assert.equal(hash(await fs.readFile(change.target)),change.after);
  fixturePreparationRetries.push({suite:'rename',id:name,attempt:attempt+1,phase:'isolated frozen-install producer; candidate not entered',error:{message:error.message,code:c.code,syscall:c.syscall,path:c.path,dest:c.dest,recovery:r},proof:{status:record.status,safetyVersion:safety,allProducerTargetsWritten:true,preservedScene:dir,files:await inventory(dir)}});
  await new Promise(resolve=>setTimeout(resolve,200));
  return oldInstall(name+'-fresh-setup-'+(attempt+1),{safety,host,replacement},attempt+1);
 }assert.equal(p.safetyVersion,safety);
 return{dir,home,skillRoot,file,bytes,before,done,options:{host,hostHome:home,skillRoot,replaceSkill:true,migrateLegacy:true},old:path.join(skillRoot,'codex-task-harness')};
}
for(const safety of [1,2])for(const host of safety===1?['codex']:['codex','claude-code','deepseek-harness'])for(const replacement of [false,true])await test(`rename-legacy-rollback-${safety}-${host}-${replacement}`,'The candidate consumes a genuine unmodified published safety1/2 manifest and preserves original identities',async()=>{
 const f=await oldInstall(`legacy-${safety}-${host}-${replacement}`,{safety,host,replacement});await rollbackInstall(f.done.rollbackManifest);for(const[rel,expected]of Object.entries(f.before)){const actual=(await inventory(f.dir))[rel];assert.deepEqual(actual,expected);}assert.deepEqual(await fs.readFile(f.file),f.bytes);return{safety,host,replacement};
});
for(const host of ['codex','claude-code','deepseek-harness'])await test('rename-migration-lifecycle-'+host,'Full old installation migrates to one engine, preserves original objects and can restore the genuine old scene before old rollback',async()=>{
 const f=await oldInstall('migration-'+host,{host}),before=await inventory(f.old),license=path.join(f.old,'SKILL.md');const ads='SYNTHETIC original NTFS stream';let acl;
 if(process.platform==='win32'){await fs.writeFile(license+':rename-synthetic',ads);const r=spawnSync('pwsh',['-NoProfile','-Command',`(Get-Acl -LiteralPath '${license.replaceAll("'","''")}').Sddl`],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);acl=r.stdout.trim();}
 const p=await previewInstall(f.options);assert.equal(p.safetyVersion,5);const retirement=p.retirements.find(t=>t.root===f.old);assert.equal(retirement.inventoryKind,'full');const done=await applyInstall(p),relocated=path.join(retirement.vault,'SKILL.md');if(acl){assert.equal(await fs.readFile(relocated+':rename-synthetic','utf8'),ads);const r=spawnSync('pwsh',['-NoProfile','-Command',`(Get-Acl -LiteralPath '${relocated.replaceAll("'","''")}').Sddl`],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),acl);}assert.equal((await previewInstall(f.options)).changes.length,0);
 await assert.rejects(fs.stat(f.old),{code:'ENOENT'});await assert.rejects(rollbackInstall(f.done.rollbackManifest),/identity|changed/);
 await rollbackInstall(done.rollbackManifest);assert.deepEqual(await inventory(f.old),before);if(acl){assert.equal(await fs.readFile(license+':rename-synthetic','utf8'),ads);const r=spawnSync('pwsh',['-NoProfile','-Command',`(Get-Acl -LiteralPath '${license.replaceAll("'","''")}').Sddl`],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),acl);}
 await rollbackInstall(f.done.rollbackManifest);assert.deepEqual(await fs.readFile(f.file),f.bytes);return{host,identityExact:true,metadataChecked:!!acl,oldRollbackUsableAgain:true};
});
for(const kind of ['custom','duplicate','mixed','malformed','unknown-file','no-migrate-flag'])await test('rename-migration-refusal-'+kind,'Unsafe or unreviewed legacy migration refuses before any target mutation',async()=>{
 const f=await oldInstall('refusal-'+kind);if(kind==='custom')await fs.appendFile(f.file,'\n<!-- agent-task-harness:start -->\ncustom\n<!-- agent-task-harness:end -->');if(kind==='duplicate')await fs.appendFile(f.file,'\n<!-- codex-task-harness:start -->\nx\n<!-- codex-task-harness:end -->');if(kind==='mixed'){const b=await fs.readFile(f.file,'utf8');await fs.writeFile(f.file,b.replace('<!-- codex-task-harness:end -->','<!-- agent-task-harness:end -->'));}if(kind==='malformed')await fs.appendFile(f.file,'\n<!-- agent-task-harness:start -->');if(kind==='unknown-file')await fs.writeFile(path.join(f.old,'unknown.txt'),'SYNTHETIC preserve');if(kind==='no-migrate-flag')f.options.migrateLegacy=false;
 const before=await inventory(f.dir);await assert.rejects(previewInstall(f.options),/managed|markers|extra|migration|migrate|legacy/i);assert.deepEqual(await inventory(f.dir),before);return{kind,noWrites:true};
});
for(const kind of ['parent-mkdir','vault-mkdir','vault-realpath','rename-exdev','journal-after-rename','alias-write'])await test('rename-migration-fault-'+kind,'Migration failures retain actual stage, target and original trees; the historical alias-write label injects a canonical write after retirement',async()=>{
 const f=await oldInstall('fault-'+kind),p=await previewInstall(f.options);let hit=false,moved=false;
 const method=kind.includes('mkdir')?'mkdir':kind==='vault-realpath'?'realpath':kind==='journal-after-rename'?'writeFile':kind==='alias-write'?'open':'rename';
 const oldRename=fs.rename;await patchMethod(fs,'rename',old=>async function(a,b,...args){const v=await old.call(this,a,b,...args);if(String(b).includes('.sciautoharness-rollback'))moved=true;return v;},()=>patchMethod(fs,method,old=>async function(file,...a){
  const text=String(file),matches=kind==='parent-mkdir'?text.endsWith('.sciautoharness-rollback'):kind==='vault-mkdir'?path.basename(path.dirname(text))==='.sciautoharness-rollback':kind==='vault-realpath'?text.endsWith('.sciautoharness-rollback'):kind==='rename-exdev'?String(a[0]).includes('.sciautoharness-rollback'):kind==='journal-after-rename'?moved&&text.includes('rollback.json.'):kind==='alias-write'?moved&&text===path.join(f.skillRoot,'sciautoharness','SKILL.md'):false;
  if(matches&&!hit){hit=true;throw Object.assign(new Error('SYNTHETIC migration '+kind),{code:kind==='rename-exdev'?'EXDEV':'EACCES'});}return old.call(this,file,...a);
 },async()=>{await assert.rejects(applyInstall(p),e=>{assert.ok(e.recovery);assert.ok(e.recovery.failedTarget);assert.match(e.message,new RegExp('SYNTHETIC migration '+kind));return true;});}));assert.equal(hit,true);assert.equal(fs.rename,oldRename);
 const manifests=(await fs.readdir(path.join(f.home,'harness-install-backups'))).filter(x=>x!==path.basename(path.dirname(f.done.rollbackManifest)));
 for(const id of manifests){const file=path.join(f.home,'harness-install-backups',id,'rollback.json');if(!await fs.access(file).then(()=>true,()=>false))continue;const record=await readJson(file);for(const t of record.retirements){let matches=0;for(const file of [t.root,t.vault]){if(!await fs.access(file).then(()=>true,()=>false))continue;const st=await fs.stat(file,{bigint:true});if(st.ino.toString()===t.before.directories[0].identity.ino&&st.dev.toString()===t.before.directories[0].identity.dev)matches++;}assert.equal(matches,1,'Exactly one original tree survives each partial migration');}}
 if(kind==='rename-exdev')assert.equal(await hash(await fs.readFile(path.join(f.old,'LICENSE'))),legacyInventories[0].LICENSE);
 return{kind,diagnostics:true,moved};
});
for(const entry of ['canonical','legacy'])await test('rename-cross-entry-install-lock-'+entry,'The retired entry is absent and the canonical entry honors the original shared installation writer lock',async()=>{
 const f=await oldInstall('lock-'+entry),p=await previewInstall(f.options),file=path.join(f.dir,'preview.json');await writeJson(file,p);const before=await inventory(f.dir);await fs.mkdir(path.join(f.skillRoot,'.writer-lock'));try{if(entry==='legacy'){const gone=call('legacy',['install','--plan',file]);assert.equal(gone.status,1);assert.match(gone.stderr,/MODULE_NOT_FOUND/);}const r=call('canonical',['install','--plan',file]);assert.equal(r.status,1);assert.match(r.stderr,/writer|holds/);}finally{await fs.rmdir(path.join(f.skillRoot,'.writer-lock'));}assert.deepEqual(await inventory(f.dir),before);return{entry,sharedLock:true};
});
for(const host of ['codex','claude-code','deepseek-harness'])for(const stale of [false,true])for(const mode of ['native','cli'])await test(`rename-active-migration-${host}-${mode}-${stale}`,'Active native work or an actual synthetic CLI process spans full-skill migration and preserves original host, mode, run identity and stale closure',async()=>{
 const f=await oldFixture(4,true,'approved',{entry:'canonical',host,tag:'span-'+mode+'-'+stale});const install=await oldInstall(`active-${host}-${mode}-${stale}`,{host});let run,promise,release;
 if(mode==='native')run=await engine.begin(f.project,f.id,'a',{host});
 else{
  const ready=path.join(f.project,'child-ready');release=path.join(f.project,'child-release');await writeJson(path.join(f.project,'host-child-expectations.json'),{host,cwd:f.project,readyFile:ready,releaseFile:release});const empty=path.join(f.project,'empty-path');await fs.mkdir(empty);
  const{spawn}=await import('node:child_process');const child=spawn(process.execPath,[path.join(install.old,'scripts/harness.mjs'),'run','--project',f.project,'--id',f.id,'--task','a','--host',host,'--executable',path.join(source,'scripts/tests/helpers/host-child.mjs')],{cwd:work,windowsHide:true,shell:false,env:{...process.env,PATH:empty}});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);promise=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}));});promise.catch(()=>{});
  for(let i=0;i<1000;i++){if(await fs.access(ready).then(()=>true,()=>false))break;if(i===999)throw new Error('Synthetic child did not reach ready');await new Promise(r=>setTimeout(r,10));}
  const before=await candidate.taskContext(f.project,f.id,'a');run={runId:before.activeExecutions[0].runId};
 }
 try{
  const migrated=await applyInstall(await previewInstall(install.options));const installedEntry=path.join(install.skillRoot,'sciautoharness/scripts/harness.mjs'),installedCall=args=>spawnSync(process.execPath,[installedEntry,...args],{shell:false,windowsHide:true,encoding:'utf8',cwd:work});const observed=installedCall(['context','--project',f.project,'--id',f.id,'--task','a']);assert.equal(observed.status,0,observed.stderr);const ctx=JSON.parse(observed.stdout);await assert.rejects(fs.stat(install.old),{code:'ENOENT'});assert.equal(ctx.activeExecutions[0].runId,run.runId);assert.ok(ctx.workflow.submission.args.includes(host+'-'+mode));assert.notEqual(installedCall(['begin','--project',f.project,'--id',f.id,'--task','a']).status,0);
  if(stale)await fs.appendFile(path.join(f.project,'input.txt'),'SYNTHETIC drift during migration');let closed;
  if(mode==='cli'){await fs.writeFile(release,'SYNTHETIC release');const result=await promise;release=null;assert.equal(result.code,0,result.stderr);assert.equal(result.signal,null);closed=JSON.parse(result.stdout);}else{await fs.mkdir(path.join(f.project,'out'),{recursive:true});await fs.writeFile(path.join(f.project,'out/a.txt'),'SYNTHETIC native artifact');closed=await candidate.submit(f.project,f.id,'a',{runId:run.runId,executor:host+'-native',reference:'SYNTHETIC migration-spanning actual work',result:'ok'});}
  assert.equal(closed.executionClosed,true);assert.equal(closed.acceptedForVerification,!stale);const receipt=await readJson(closed.receipt.path),receiptBytes=await fs.readFile(closed.receipt.path);assert.equal(receipt.runId,run.runId);assert.equal(receipt.executor,host+'-'+mode);assert.equal((await candidate.submit(f.project,f.id,'a',receipt)).replayed,true);assert.deepEqual(await fs.readFile(closed.receipt.path),receiptBytes);
  if(stale){assert.equal(closed.phase,'stale');await assert.rejects(candidate.verify(f.project,f.id,'a'));}else assert.equal((await candidate.verify(f.project,f.id,'a')).taskStatus,'verified');
  await rollbackInstall(migrated.rollbackManifest);return{host,mode,stale,originalRun:run.runId,confirmedEnd:true};
 }finally{if(release){await fs.writeFile(release,'SYNTHETIC release after assertion failure');await promise;}}
});
await test('rename-two-commit-refresh','Two ordinary new commits preserve history and make every final path last-changed in the final full tree without exposing an empty default ref',async()=>{
 const dir=path.join(work,'git-graph');await fs.mkdir(dir);const git=(args,input)=>{const r=spawnSync('git',['-C',dir,'-c','user.name=SYNTHETIC','-c','user.email=synthetic@example.invalid',...args],{input,encoding:'utf8',windowsHide:true,shell:false});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};git(['init','-b','main']);await fs.writeFile(path.join(dir,'one.txt'),'SYNTHETIC one\n');await fs.mkdir(path.join(dir,'nested'));await fs.writeFile(path.join(dir,'nested/two.txt'),'SYNTHETIC two\n');git(['add','--all']);git(['commit','-m','SYNTHETIC baseline']);const base=git(['rev-parse','HEAD']);await fs.writeFile(path.join(dir,'one.txt'),'SYNTHETIC final\n');git(['add','--all']);const tree=git(['write-tree']),empty=git(['mktree'],''),e=git(['commit-tree',empty,'-p',base,'-m','SYNTHETIC empty transition']),f=git(['commit-tree',tree,'-p',e,'-m','SYNTHETIC final full tree']);assert.equal(git(['rev-parse','HEAD']),base);git(['update-ref','refs/heads/main',f,base]);assert.equal(git(['rev-parse','HEAD^{tree}']),tree);git(['merge-base','--is-ancestor',base,f]);assert.equal(git(['rev-list','--count',base+'..'+f]),'2');assert.equal(git(['status','--porcelain']),'');for(const p of git(['ls-tree','-r','--name-only',f]).split('\n'))assert.equal(git(['log','-1','--format=%H',f,'--',p]),f);return{ordinaryCommits:2,allPathsRefreshed:true,historyPreserved:true};
});

for(const form of ['bare','equals-true','equals-false'])await test('rename-migration-cli-flag-'+form,'The documented migration boolean is parsed as a boolean and false never authorizes retirement',async()=>{
 const f=await oldInstall('flag-'+form),flag=form==='bare'?'--migrate-legacy':'--migrate-legacy='+form.slice(7),r=call('canonical',['install-preview','--host','codex','--host-home',f.home,'--skill-root',f.skillRoot,'--replace-skill',flag]);assert.equal(r.status,form==='equals-false'?1:0,r.stderr);if(r.status===0)assert.equal(JSON.parse(r.stdout).migrateLegacy,true);else assert.match(r.stderr,/migrate|legacy/);return{form,code:r.status};
});
for(const field of ['product','targetSkill','legacyCompat','retirementRoot','hostHome','instructionFile','role','kind','downgrade2'])await test('rename-safety3-binding-'+field,'Resealed malformed records cannot broaden fixed migration roles or downgrade original identities',async()=>{
 const f=await oldInstall('binding-'+field),done=await original3.applyInstall(await original3.previewInstall(f.options)),record=await readJson(done.rollbackManifest);assert.equal(record.safetyVersion,3);
 if(field==='role')record.changes.find(c=>c.retire).role='canonical';else if(field==='kind'){const c=record.changes.find(c=>c.kind==='retire-legacy');c.retire=false;}else if(field==='downgrade2')record.safetyVersion=2;else record[field]=field==='retirementRoot'?path.join(f.skillRoot,'unsafe-vault'):field==='product'?'wrong-product':field==='instructionFile'?'WRONG.md':path.join(f.dir,'wrong-root');
 const{bindingDigest,status,...bound}=record;record.bindingDigest=hash(JSON.stringify(bound));const forged=path.join(path.dirname(done.rollbackManifest),'forged.json');await writeJson(forged,record);const before=await inventory(f.dir);await assert.rejects(rollbackInstall(forged));assert.deepEqual(await inventory(f.dir),before);await rollbackInstall(done.rollbackManifest);return{field,noMutation:true};
});
await test('rename-safety2-original-downgrade','A genuine frozen safety2 record retains its original safety1 downgrade protection',async()=>{
 const f=await oldInstall('safety2-downgrade'),record=await readJson(f.done.rollbackManifest);record.safetyVersion=1;const file=path.join(path.dirname(f.done.rollbackManifest),'downgraded.json');await writeJson(file,record);const before=await inventory(f.dir);await assert.rejects(rollbackInstall(file),/safety|legacy|binding/i);assert.deepEqual(await inventory(f.dir),before);await rollbackInstall(f.done.rollbackManifest);return{genuineSafety2:true};
});

for(const entry of ['canonical','legacy'])await test('rename-cross-entry-task-lock-'+entry,'The retired task entry is absent; the canonical entry honors the original persistent task writer gate without creating a run',async()=>{
 const f=await oldFixture(4,true,'approved',{entry,tag:'writer-lock'}),before=await inventory(f.project),lock=path.join(f.directory,'.writer-lock');await fs.mkdir(lock);try{if(entry==='legacy'){const gone=call('legacy',['begin','--project',f.project,'--id',f.id,'--task','a']);assert.equal(gone.status,1);assert.match(gone.stderr,/MODULE_NOT_FOUND/);}const r=call('canonical',['begin','--project',f.project,'--id',f.id,'--task','a']);assert.equal(r.status,1);assert.match(r.stderr,/writer|holds/);}finally{await fs.rmdir(lock);}assert.deepEqual(await inventory(f.project),before);return{entry,noRun:true};
});
for(const lockFault of [false,true])await test('rename-compat-directory-cleanup-'+lockFault,'Compatibility-directory cleanup reports its own target after all file operations and preserves outer cleanup facts',async()=>{
 const dir=path.join(work,'compat-cleanup-'+lockFault),home=path.join(dir,'home'),skillRoot=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});await fs.writeFile(path.join(home,'AGENTS.md'),'SYNTHETIC preserved');const done=await original4.applyInstall(await original4.previewInstall({hostHome:home,skillRoot})),record=await readJson(done.rollbackManifest),failure=path.join(skillRoot,'codex-task-harness','scripts');let hit=false,error;
 await patchMethod(fs,'rmdir',old=>async function(file,...a){if(String(file)===failure){hit=true;throw Object.assign(new Error('SYNTHETIC compatibility cleanup'),{code:'EACCES'});}if(lockFault&&String(file)===path.join(home,'.writer-lock'))throw new Error('SYNTHETIC compatibility outer cleanup');return old.call(this,file,...a);},async()=>{try{await rollbackInstall(done.rollbackManifest);}catch(e){error=e;}});assert.equal(hit,true);const e=lockFault?error.actionError:error;assert.equal(e.recovery.failedTarget,failure);assert.equal(e.recovery.stage,'cleanup-directories');assert.equal(e.recovery.completedTargets,record.changes.length);assert.equal((await readJson(done.rollbackManifest)).status,'installed');if(lockFault)assert.equal(error.code,'LOCK_CLEANUP_FAILED');return{lockFault,completedFiles:record.changes.length,failedTargetRole:'legacyCompat'};
});
await test('rename-relocated-identity-drift','Same bytes in a replacement archive inode cannot impersonate the preserved original',async()=>{
 const f=await oldInstall('relocated-drift'),done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest),t=record.retirements[0],backup=path.join(t.vault,'SKILL.md'),original=path.join(f.dir,'kept-original');await fs.rename(backup,original);await fs.writeFile(backup,await fs.readFile(original));const before=await inventory(f.dir);await assert.rejects(rollbackInstall(done.rollbackManifest),/original|identity|changed/);assert.deepEqual(await inventory(f.dir),before);await fs.unlink(backup);await fs.rename(original,backup);await rollbackInstall(done.rollbackManifest);return{sameBytesDifferentObjectRefused:true};
});


await test('rename-reviewed-custom-rule','Only an explicitly reviewed exact custom-block patch can migrate custom policy while preserving every outside byte and original object',async()=>{
 const f=await oldInstall('custom-reviewed'),text=await fs.readFile(f.file,'utf8'),start=text.indexOf('<!-- codex-task-harness:start -->'),end=text.indexOf('<!-- codex-task-harness:end -->')+'<!-- codex-task-harness:end -->'.length;
 const before=text.slice(start,end).replace('## Complex task harness','## SYNTHETIC custom policy'),prefix=text.slice(0,start),suffix=text.slice(end)+'\r\nSYNTHETIC suffix without final LF';await fs.writeFile(f.file,prefix+before+suffix);const original=await fs.readFile(f.file),identity=(await fs.stat(f.file,{bigint:true})).ino;
 await assert.rejects(previewInstall(f.options),/managed rule differs/);const after=before.replaceAll('codex-task-harness','sciautoharness');const p=await previewInstall({...f.options,reviewedRule:{before,after}}),done=await applyInstall(p);
 assert.deepEqual(await fs.readFile(f.file),Buffer.from(prefix+after+suffix));assert.equal((await fs.stat(f.file,{bigint:true})).ino,identity);await rollbackInstall(done.rollbackManifest);assert.deepEqual(await fs.readFile(f.file),original);assert.equal((await fs.stat(f.file,{bigint:true})).ino,identity);return{explicitReviewRequired:true,outsideByteExact:true,identityExact:true};
});


for(const spelling of ['missing-space','unknown-end'])await test('rename-malformed-reserved-marker-'+spelling,'Reserved marker variants cannot survive as hidden duplicate or mixed instruction blocks',async()=>{
 const f=await oldInstall('near-marker-'+spelling);await fs.appendFile(f.file,spelling==='missing-space'?'\n<!--agent-task-harness:start-->':'\n<!-- agent-task-harness:finish -->');const before=await inventory(f.dir);await assert.rejects(previewInstall(f.options),/Malformed.*markers/);assert.deepEqual(await inventory(f.dir),before);return{spelling,noWrites:true};
});
for(const kind of ['missing','old','duplicate'])await test('rename-reviewed-rule-marker-'+kind,'Explicit custom review still binds exactly one canonical managed block before writes',async()=>{
 const f=await oldInstall('reviewed-marker-'+kind),text=await fs.readFile(f.file,'utf8'),a=text.indexOf('<!-- codex-task-harness:start -->'),b=text.indexOf('<!-- codex-task-harness:end -->')+'<!-- codex-task-harness:end -->'.length,before=text.slice(a,b),canonical=before.replaceAll('codex-task-harness','sciautoharness'),after=kind==='missing'?'SYNTHETIC missing managed markers':kind==='old'?before:canonical+canonical,snapshot=await inventory(f.dir);await assert.rejects(previewInstall({...f.options,reviewedRule:{before,after}}),/canonical block/);assert.deepEqual(await inventory(f.dir),snapshot);return{kind,noWrites:true};
});


for(const kind of ['default','custom','absent'])await test('rename-reviewed-before-binding-'+kind,'An exact reviewed patch cannot use a mismatching or nonexistent original block',async()=>{
 const f=await oldInstall('before-binding-'+kind),text=await fs.readFile(f.file,'utf8'),a=text.indexOf('<!-- codex-task-harness:start -->'),b=text.indexOf('<!-- codex-task-harness:end -->')+'<!-- codex-task-harness:end -->'.length,old=text.slice(a,b),canonical=old.replaceAll('codex-task-harness','sciautoharness');if(kind==='custom')await fs.writeFile(f.file,text.replace('## Complex task harness','## SYNTHETIC custom'));if(kind==='absent')await fs.writeFile(f.file,'SYNTHETIC user policy without managed block');const before=await inventory(f.dir);await assert.rejects(previewInstall({...f.options,reviewedRule:{before:'SYNTHETIC wrong before block',after:canonical}}),/differs|absent|exact review/);assert.deepEqual(await inventory(f.dir),before);return{kind,noMutation:true};
});

await writeJson(path.join(work,'commands.json'),commands);

}
