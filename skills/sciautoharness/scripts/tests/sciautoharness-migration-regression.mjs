import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {previewInstall,applyInstall,rollbackInstall,skillSource} from '../lib/install.mjs';
import {frozenWriter} from './rename-regression.mjs';
import {listFiles} from '../lib/files.mjs';
import inventories from '../lib/installation-inventories.json' with {type:'json'};
import acceptedDelta from './fixtures/accepted-portable-delta.json' with {type:'json'};
const args=process.argv.slice(2),workArg=args.indexOf('--work-root');
if(workArg<0||!path.isAbsolute(args[workArg+1]??''))throw new Error('Declare absolute --work-root');
const root=path.join(args[workArg+1],'sciautoharness-'+randomUUID());await fs.mkdir(root,{recursive:true});
const results=[],hash=b=>createHash('sha256').update(b).digest('hex');
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const writeJson=async(p,x)=>fs.writeFile(p,JSON.stringify(x,null,2)+'\n');
const prefixOption=args.indexOf('--case-prefix'),casePrefix=prefixOption<0?null:args[prefixOption+1];
async function test(id,fn){if(casePrefix&&!id.startsWith(casePrefix))return;try{const evidence=await fn();results.push({id,pass:true,evidence});}catch(e){results.push({id,pass:false,error:{message:e.message,stack:e.stack,recovery:e.recovery,metadataFacts:e.metadataFacts}});}process.stderr.write(JSON.stringify({id,pass:results.at(-1).pass,at:new Date().toISOString()})+'\n');}
const api4=await frozenWriter({source:skillSource,destination:path.join(root,'sources/safety4/skills/sciautoharness'),commit:inventories.canonicalSafety4.commit,skill:'sciautoharness',inventory:inventories.canonicalSafety4.files});
await test('s4-fresh-three-roots',async()=>{
 const dir=path.join(root,'fresh'),home=path.join(dir,'home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});
 const text='SYNTHETIC user policy\r\n';await fs.writeFile(path.join(home,'AGENTS.md'),text);
 const p=await api4.previewInstall({hostHome:home,skillRoot:skills});
 assert.equal(p.safetyVersion,4);assert.equal(p.product,'sciautoharness');assert.equal(p.targetSkill,path.join(skills,'sciautoharness'));
 assert.equal(p.agentCompat,path.join(skills,'agent-task-harness'));assert.equal(p.legacyCompat,path.join(skills,'codex-task-harness'));
 assert.equal(p.changes.length,(await listFiles(api4.skillSource)).length+13);
 const done=await api4.applyInstall(p);assert.equal(done.status,'installed');
 for(const name of ['agent-task-harness','codex-task-harness']){
  const wrapper=await fs.readFile(path.join(skills,name,'scripts/harness.mjs'),'utf8');assert.ok(wrapper.includes('../../sciautoharness/'));
  assert.match(await fs.readFile(path.join(skills,name,'agents/openai.yaml'),'utf8'),/allow_implicit_invocation: false/);
 }
 assert.equal((await api4.previewInstall({hostHome:home,skillRoot:skills})).changes.length,0);
 assert.equal((await api4.applyInstall(await api4.previewInstall({hostHome:home,skillRoot:skills}))).status,'already-installed');
 await rollbackInstall(done.rollbackManifest);assert.equal(await fs.readFile(path.join(home,'AGENTS.md'),'utf8'),text);
 for(const n of ['sciautoharness','agent-task-harness','codex-task-harness'])await assert.rejects(fs.stat(path.join(skills,n)),{code:'ENOENT'});
 return {threeRoots:true,exactRoundtrip:true};
});
await test('s4-directory-preserve-existing',async()=>{
 const dir=path.join(root,'existing-dirs'),home=path.join(dir,'home'),skills=path.join(dir,'skills'),canonical=path.join(skills,'sciautoharness'),nested=path.join(canonical,'agents');
 await fs.mkdir(home,{recursive:true});await fs.mkdir(nested,{recursive:true});
 const ids=await Promise.all([canonical,nested].map(async p=>String((await fs.stat(p,{bigint:true})).ino)));
 const done=await api4.applyInstall(await api4.previewInstall({hostHome:home,skillRoot:skills}));await rollbackInstall(done.rollbackManifest);
 for(const[p,i]of [[canonical,ids[0]],[nested,ids[1]]])assert.equal(String((await fs.stat(p,{bigint:true})).ino),i);
 return{preexistingEmptyDirectoryIdentityPreserved:true};
});
await test('s4-directory-linked-root',async()=>{
 const dir=path.join(root,'linked-root'),home=path.join(dir,'home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});
 const done=await api4.applyInstall(await api4.previewInstall({hostHome:home,skillRoot:skills})),target=path.join(skills,'sciautoharness'),moved=path.join(skills,'moved-canonical');
 await fs.rename(target,moved);await fs.symlink(moved,target,process.platform==='win32'?'junction':'dir');
 const before={};for(const rel of await listFiles(moved))before[rel]=hash(await fs.readFile(path.join(moved,rel)));const instruction=await fs.readFile(path.join(home,'AGENTS.md'));
 await assert.rejects(rollbackInstall(done.rollbackManifest),/linked|directory|identity|root/i);
 const after={};for(const rel of await listFiles(moved))after[rel]=hash(await fs.readFile(path.join(moved,rel)));assert.deepEqual(after,before);assert.deepEqual(await fs.readFile(path.join(home,'AGENTS.md')),instruction);
 return{sameFilesUnderJunctionRefusedBeforeMutation:true};
});
// The fixed public B0 actually produces safety3; never relabel a new record.
const repo=path.resolve(skillSource,'../..'),frozen=path.join(root,'sources','official','skills','agent-task-harness');
await frozenWriter({source:skillSource,destination:frozen,commit:inventories.officialCommit,skill:'agent-task-harness',inventory:inventories.agentFull[0]});
const accepted=path.join(root,'sources','accepted','skills','agent-task-harness');await fs.cp(frozen,accepted,{recursive:true});
for(const[rel,text]of Object.entries(acceptedDelta)){const p=path.join(accepted,rel);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text);}
for(const[rel,h]of Object.entries(inventories.agentFull[1]))assert.equal(hash(await fs.readFile(path.join(accepted,rel))),h);
const api3=await import(pathToFileURL(path.join(frozen,'scripts/lib/install.mjs'))),apiAccepted=await import(pathToFileURL(path.join(accepted,'scripts/lib/install.mjs')));
async function oldInstall(name,{withAccepted=false}={}){
 const dir=path.join(root,name),home=path.join(dir,'home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});
 const agents=path.join(home,'AGENTS.md'),original=Buffer.from('\ufeffSYNTHETIC private policy\r\n中文 without final LF');await fs.writeFile(agents,original);
 const first=await api3.applyInstall(await api3.previewInstall({hostHome:home,skillRoot:skills}));assert.equal((await readJson(first.rollbackManifest)).safetyVersion,3);
 let done=first;if(withAccepted)done=await apiAccepted.applyInstall(await apiAccepted.previewInstall({hostHome:home,skillRoot:skills,replaceSkill:true}));
 return{dir,home,skills,agents,original,first,done,old:path.join(skills,'agent-task-harness'),options:{hostHome:home,skillRoot:skills,replaceSkill:true,migrateLegacy:true}};
}
async function snapshot(dir){const out={};if(!await fs.access(dir).then(()=>true,()=>false))return out;for(const rel of await listFiles(dir)){const p=path.join(dir,rel),s=await fs.stat(p,{bigint:true});out[rel]={sha:hash(await fs.readFile(p)),ino:String(s.ino),dev:String(s.dev),mode:String(s.mode),nlink:String(s.nlink)};}return out;}
function cli(f,name,args){const r=spawnSync(process.execPath,[path.join(f.skills,name,'scripts/harness.mjs'),...args],{shell:false,windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
async function metadata(p){const r=spawnSync('pwsh',['-NoProfile','-Command',`$a=Get-Acl -LiteralPath '${p.replaceAll("'","''")}';@{owner=$a.Owner;sddl=$a.Sddl}|ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
for(const withAccepted of [false,true])await test('s4-genuine3-chain-'+withAccepted,async()=>{
 const f=await oldInstall('chain-'+withAccepted,{withAccepted}),before=await snapshot(f.old),thin=await snapshot(path.join(f.skills,'codex-task-harness')),rule=await fs.readFile(f.agents),p=path.join(f.old,'SKILL.md');
 let meta=null;if(process.platform==='win32'){await fs.writeFile(p+':sciauto-synthetic','SYNTHETIC NTFS stream');meta=await metadata(p);}
 const plan=await api4.previewInstall(f.options);assert.equal(plan.safetyVersion,4);assert.equal(plan.migration.sources[0].members.length,withAccepted?37:36);
 const done=await api4.applyInstall(plan),record=await readJson(done.rollbackManifest),moved=record.changes.find(c=>c.target===p);
 assert.equal(moved.retire,true);if(meta){assert.deepEqual(await metadata(moved.backup),meta);assert.equal(await fs.readFile(moved.backup+':sciauto-synthetic','utf8'),'SYNTHETIC NTFS stream');}
 await assert.rejects(rollbackInstall(f.done.rollbackManifest),/identity|changed/);
 await rollbackInstall(done.rollbackManifest);assert.deepEqual(await snapshot(f.old),before);assert.deepEqual(await snapshot(path.join(f.skills,'codex-task-harness')),thin);assert.deepEqual(await fs.readFile(f.agents),rule);
 if(meta){assert.deepEqual(await metadata(p),meta);assert.equal(await fs.readFile(p+':sciauto-synthetic','utf8'),'SYNTHETIC NTFS stream');}
 await rollbackInstall(f.done.rollbackManifest);if(withAccepted)await rollbackInstall(f.first.rollbackManifest);assert.deepEqual(await fs.readFile(f.agents),f.original);
 return{genuineSafety3:true,inventory:withAccepted?37:36,originalIdentityRestored:true,metadataChecked:!!meta,stackedRollback:true};
});
for(const kind of ['unknown-full-file','same-byte-source-inode','no-migrate','mixed-markers','near-marker','custom-without-review'])await test('s4-refusal-'+kind,async()=>{
 const f=await oldInstall('refuse-'+kind);
 if(kind==='unknown-full-file')await fs.writeFile(path.join(f.old,'unknown.txt'),'SYNTHETIC unknown');
 if(kind==='same-byte-source-inode'){const p=path.join(f.old,'SKILL.md');await fs.link(p,p+'.link');}
 if(kind==='no-migrate')f.options.migrateLegacy=false;
 if(kind==='mixed-markers')await fs.appendFile(f.agents,'\n<!-- sciautoharness:start -->\nx\n<!-- sciautoharness:end -->');
 if(kind==='near-marker')await fs.appendFile(f.agents,'\n<!--sciautoharness:finish-->');
 if(kind==='custom-without-review')await fs.writeFile(f.agents,(await fs.readFile(f.agents,'utf8')).replace('## Complex task harness','## SYNTHETIC custom'));
 const before=await snapshot(f.dir);await assert.rejects(api4.previewInstall(f.options));assert.deepEqual(await snapshot(f.dir),before);return{noMutation:true};
});
for(const kind of ['product','agentCompat','role','kind','backup-slot','inventory','source-role','downgrade3','downgrade2','duplicate-target'])await test('s4-binding-'+kind,async()=>{
 const f=await oldInstall('binding-'+kind),done=await api4.applyInstall(await api4.previewInstall(f.options)),record=await readJson(done.rollbackManifest);
 if(kind==='product')record.product='wrong';
 if(kind==='agentCompat')record.agentCompat=path.join(f.dir,'wrong-root');
 if(kind==='role')record.changes.find(c=>c.retire).role='canonical';
 if(kind==='kind')record.changes.find(c=>c.retire).kind='create-skill';
 if(kind==='backup-slot')record.changes.find(c=>c.backup).backup=path.join(path.dirname(done.rollbackManifest),'999.bin');
 if(kind==='inventory')record.migration.sources[0].inventoryDigest='bad';
 if(kind==='source-role')record.migration.sources[0].role='canonical';
 if(kind==='downgrade3')record.safetyVersion=3;
 if(kind==='downgrade2')record.safetyVersion=2;
 if(kind==='duplicate-target')record.changes.push(structuredClone(record.changes[0]));
 const{bindingDigest,status,...bound}=record;record.bindingDigest=hash(JSON.stringify(bound));const forged=path.join(path.dirname(done.rollbackManifest),'forged.json');await writeJson(forged,record);
 const before=await snapshot(f.dir);await assert.rejects(rollbackInstall(forged));assert.deepEqual(await snapshot(f.dir),before);await rollbackInstall(done.rollbackManifest);return{resealedTamperRefused:true,noMutation:true};
});
await test('s4-equal-bytes-new-object',async()=>{
 const f=await oldInstall('inode'),done=await api4.applyInstall(await api4.previewInstall(f.options)),r=await readJson(done.rollbackManifest),c=r.changes.find(c=>c.role==='agentCompat'&&c.after),kept=c.target+'.kept';
 await fs.rename(c.target,kept);await fs.writeFile(c.target,await fs.readFile(kept));const before=await snapshot(f.dir);await assert.rejects(rollbackInstall(done.rollbackManifest),/identity|changed/);assert.deepEqual(await snapshot(f.dir),before);
 await fs.unlink(c.target);await fs.rename(kept,c.target);await rollbackInstall(done.rollbackManifest);return{equalBytesDifferentInodeRefused:true};
});
await test('s4-custom-block-outside-bytes',async()=>{
 const f=await oldInstall('custom'),raw=await fs.readFile(f.agents,'utf8'),a=raw.indexOf('<!-- agent-task-harness:start -->'),b=raw.indexOf('<!-- agent-task-harness:end -->')+'<!-- agent-task-harness:end -->'.length;
 const before=raw.slice(a,b).replace('## Complex task harness','## SYNTHETIC custom'),after=before.replaceAll('agent-task-harness','sciautoharness'),prefix=raw.slice(0,a),suffix=raw.slice(b)+'\r\nSYNTHETIC suffix';
 await fs.writeFile(f.agents,prefix+before+suffix);const inode=(await fs.stat(f.agents,{bigint:true})).ino;
 const options={...f.options,reviewedRule:{before,after}};
 const done=await api4.applyInstall(await api4.previewInstall(options));assert.deepEqual(await fs.readFile(f.agents),Buffer.from(prefix+after+suffix));assert.equal((await fs.stat(f.agents,{bigint:true})).ino,inode);
 assert.equal((await api4.previewInstall(options)).changes.length,0);assert.equal((await api4.applyInstall(await api4.previewInstall(options))).status,'already-installed');
 await rollbackInstall(done.rollbackManifest);assert.deepEqual(await fs.readFile(f.agents),Buffer.from(prefix+before+suffix));return{customPreserved:true,outsideBytes:true,inode:true};
});
for(const state of ['active','pending','verified'])await test('s4-three-entries-original-'+state,async()=>{
 const f=await oldInstall('task-'+state),project=path.join(f.dir,'project');await fs.mkdir(project);
 const engine=await import(pathToFileURL(path.join(frozen,'scripts/lib/engine.mjs'))),id='synthetic-shared',d=await engine.draft(project,id,'SYNTHETIC shared-entry original run','general');
 const c=await readJson(path.join(d.directory,'contract.json'));c.deliverables=[{id:'out',path:'out.txt'}];c.tasks=[{id:'a',title:'Synthetic output',dependsOn:[],outputs:['out'],acceptance:[{id:'exists',type:'artifact',description:'Synthetic output exists'}]}];await writeJson(path.join(d.directory,'contract.json'),c);
 await engine.render(project,id);const review=await engine.prepareReview(project,id);await engine.recordDecision(project,id,{actor:'user',decision:'approve',taskId:id,revision:c.revision,digest:review.digest,message:'SYNTHETIC approval only',source:'SYNTHETIC regression authorized by real task'});
 const run=await engine.begin(project,id,'a');await fs.writeFile(path.join(project,'out.txt'),'SYNTHETIC output');
 if(state!=='active')await engine.submit(project,id,'a',{runId:run.runId,executor:'codex-native',reference:'SYNTHETIC original work',result:'ok'});
 if(state==='verified')await engine.verify(project,id,'a');
 const done=await api4.applyInstall(await api4.previewInstall(f.options));
 for(const entry of ['sciautoharness','agent-task-harness','codex-task-harness']){const ctx=cli(f,entry,['context','--project',project,'--id',id,'--task','a']);assert.equal(ctx.review.digest,review.digest);assert.equal(ctx.review.approved,true);if(state==='active')assert.equal(ctx.activeExecutions[0].runId,run.runId);}
 if(state==='active')cli(f,'agent-task-harness',['submit','--project',project,'--id',id,'--task','a','--run-id',run.runId,'--executor','codex-native','--reference','SYNTHETIC original work','--result','ok']);
 if(state!=='verified')cli(f,'agent-task-harness',['verify','--project',project,'--id',id,'--task','a']);
 const status=cli(f,'sciautoharness',['status','--project',project,'--id',id]);assert.equal(status.tasks.a.status,'verified');assert.equal(status.approval.digest,review.digest);
 await rollbackInstall(done.rollbackManifest);return{threeActualCLIEntries:true,originalRun:run.runId,originalReview:review.digest};
});
for(const kind of ['rename-exdev','journal-unconfirmed','alias-write','installed-manifest'])await test('s4-partial-'+kind,async()=>{
 const f=await oldInstall('fault-'+kind),plan=await api4.previewInstall(f.options);let moved=false,hit=false,error;
 const method=kind==='rename-exdev'?'rename':kind==='alias-write'?'open':'writeFile',saved=fs[method],rename=fs.rename;
 if(method!=='rename')fs.rename=async function(a,b,...args){const result=await rename.call(this,a,b,...args);if(String(b).includes('.sciautoharness-rollback'))moved=true;return result;};
 fs[method]=async function(file,...args){const text=String(file),match=kind==='rename-exdev'?String(args[0]).includes('.sciautoharness-rollback'):kind==='journal-unconfirmed'?moved&&text.includes('rollback.json.'):kind==='alias-write'?moved&&text===path.join(f.old,'SKILL.md'):text.includes('rollback.json.')&&String(args[0]).includes('"status": "installed"');if(match&&!hit){hit=true;throw Object.assign(new Error('SYNTHETIC '+kind),{code:kind==='rename-exdev'?'EXDEV':'EACCES'});}return saved.call(this,file,...args);};
 try{await api4.applyInstall(plan);}catch(e){error=e;}finally{fs[method]=saved;if(method!=='rename')fs.rename=rename;}
 assert.equal(hit,true);assert.ok(error?.recovery);assert.equal((await readJson(error.recovery.manifest)).status,'prepared');await assert.rejects(rollbackInstall(error.recovery.manifest),/completed/);
 const rec=await readJson(error.recovery.manifest);for(const c of rec.changes.filter(c=>c.retire)){let n=0;for(const p of [c.target,c.backup]){if(!await fs.access(p).then(()=>true,()=>false))continue;const st=await fs.stat(p,{bigint:true});if(String(st.ino)===c.beforeIdentity.ino&&hash(await fs.readFile(p))===c.before)n++;}assert.equal(n,1);}
 return{preparedRefused:true,originalObjectsPreserved:true,stage:error.recovery.stage};
});
await test('s5-fresh-single-root',async()=>{
 const dir=path.join(root,'s5-fresh'),home=path.join(dir,'home'),skills=path.join(dir,'skills');
 await fs.mkdir(home,{recursive:true});const original=Buffer.from('SYNTHETIC canonical-only policy\r\n');await fs.writeFile(path.join(home,'AGENTS.md'),original);
 const plan=await previewInstall({hostHome:home,skillRoot:skills});
 assert.equal(plan.safetyVersion,5);assert.equal(plan.product,'sciautoharness');
 assert.equal(plan.changes.length,(await listFiles(skillSource)).length+1);
 const done=await applyInstall(plan);assert.equal(done.status,'installed');
 for(const name of ['agent-task-harness','codex-task-harness'])await assert.rejects(fs.lstat(path.join(skills,name)),{code:'ENOENT'});
 const noop=await previewInstall({hostHome:home,skillRoot:skills});assert.equal(noop.changes.length,0);assert.equal((await applyInstall(noop)).status,'already-installed');
 const retired=path.join(skills,'agent-task-harness');await fs.mkdir(retired);const rejected=spawnSync(process.execPath,[path.join(skills,'sciautoharness/scripts/check-skill.mjs')],{shell:false,windowsHide:true,encoding:'utf8'});assert.equal(rejected.status,1);assert.match(rejected.stderr,/Retired skill entry remains in discovery/);await fs.rmdir(retired);
 await rollbackInstall(done.rollbackManifest);assert.deepEqual(await fs.readFile(path.join(home,'AGENTS.md')),original);
 for(const name of ['sciautoharness','agent-task-harness','codex-task-harness'])await assert.rejects(fs.lstat(path.join(skills,name)),{code:'ENOENT'});
 return{singleRoot:true,noop:true,exactRoundtrip:true};
});
// Current format guards. All scenes are synthetic and remain below --work-root.
async function s5Four(name){const dir=path.join(root,'s5-'+name),home=path.join(dir,'home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});await fs.writeFile(path.join(home,'AGENTS.md'),'SYNTHETIC original policy\r\n');const previous=await api4.applyInstall(await api4.previewInstall({hostHome:home,skillRoot:skills}));return{dir,home,skills,previous,options:{hostHome:home,skillRoot:skills,replaceSkill:true,migrateLegacy:true}};}
for(const accepted of [false,true])await test('s5-genuine3-stack-'+accepted,async()=>{
 const f=await oldInstall('s5-stack3-'+accepted,{withAccepted:accepted}),before=await snapshot(f.skills),plan=await previewInstall(f.options);
 assert.equal(plan.retirements.length,2);assert.equal(plan.retirements.find(t=>t.role==='agentCompat').inventoryKind,'full');
 const done=await applyInstall(plan);for(const t of plan.retirements)await assert.rejects(fs.stat(t.root),{code:'ENOENT'});
 await rollbackInstall(done.rollbackManifest);assert.deepEqual(await snapshot(f.skills),before);await rollbackInstall(f.done.rollbackManifest);if(accepted)await rollbackInstall(f.first.rollbackManifest);
 assert.deepEqual(await fs.readFile(f.agents),f.original);return{genuineSafety3:true,acceptedVariant:accepted,originalObjects:true,olderRollback:true};
});
await test('s5-genuine4-stack-directory-streams',async()=>{
 const f=await s5Four('stack4-streams'),old=path.join(f.skills,'agent-task-harness'),empty=path.join(old,'references');await fs.mkdir(empty,{recursive:true});
 const streams=process.platform==='win32'?[old,empty,path.join(old,'SKILL.md')]:[];
 for(const p of streams)for(const name of ['sciauto-synthetic','$DATA'])await fs.writeFile(p+':'+name,'SYNTHETIC named stream '+name);
 const before=await snapshot(f.skills),plan=await previewInstall(f.options);assert.equal(plan.retirements.length,2);
 for(const t of plan.retirements)assert.equal(t.inventoryKind,'thin');
 if(streams.length){const t=plan.retirements.find(t=>t.root===old);for(const relative of ['', 'references'])assert.deepEqual(t.before.directories.find(d=>d.relative===relative).security.namedStreams.map(s=>s.name),['$DATA','sciauto-synthetic']);}
 const done=await applyInstall(plan);await assert.rejects(rollbackInstall(f.previous.rollbackManifest));await rollbackInstall(done.rollbackManifest);
 assert.deepEqual(await snapshot(f.skills),before);for(const p of streams)for(const name of ['sciauto-synthetic','$DATA'])assert.equal(await fs.readFile(p+':'+name,'utf8'),'SYNTHETIC named stream '+name);
 await rollbackInstall(f.previous.rollbackManifest);return{genuineSafety4:true,thinRoots:2,emptyHistoricalDirectory:true,fileAndDirectoryADS:streams.length>0,dollarDataStream:streams.length>0,olderRollback:true};
});
for(const kind of ['extra-file','extra-empty-directory','modified-file','hardlink','junction','missing-permission'])await test('s5-refusal-'+kind,async()=>{
 const f=await s5Four('refusal-'+kind),old=path.join(f.skills,'agent-task-harness');
 if(kind==='extra-file')await fs.writeFile(path.join(old,'unknown.txt'),'SYNTHETIC');
 if(kind==='extra-empty-directory')await fs.mkdir(path.join(old,'unknown-empty'));
 if(kind==='modified-file')await fs.appendFile(path.join(old,'SKILL.md'),'SYNTHETIC');
 if(kind==='hardlink')await fs.link(path.join(old,'SKILL.md'),path.join(f.dir,'linked-original'));
 if(kind==='junction'){const moved=path.join(f.dir,'linked-original');await fs.rename(old,moved);await fs.symlink(moved,old,process.platform==='win32'?'junction':'dir');}
 if(kind==='missing-permission')f.options.replaceSkill=false;
 const rule=await fs.readFile(path.join(f.home,'AGENTS.md'));await assert.rejects(previewInstall(f.options));assert.deepEqual(await fs.readFile(path.join(f.home,'AGENTS.md')),rule);return{kind,refusedBeforeWrite:true};
});
await test('s5-preview-drift-before-directory-creation',async()=>{
 const dir=path.join(root,'s5-drift'),home=path.join(dir,'home'),skills=path.join(dir,'not-created/skills');await fs.mkdir(home,{recursive:true});const config=path.join(home,'config.toml');await fs.writeFile(config,'SYNTHETIC one');
 const plan=await previewInstall({hostHome:home,skillRoot:skills});await fs.writeFile(config,'SYNTHETIC changed');await assert.rejects(applyInstall(plan),/changed after preview/);await assert.rejects(fs.stat(path.dirname(skills)),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(home,'harness-install-backups')),{code:'ENOENT'});return{configDrift:true,noCreatedRoot:true};
});
await test('s5-resealed-manifest-matrix',async()=>{
 const f=await s5Four('resealed'),done=await applyInstall(await previewInstall(f.options)),original=await fs.readFile(done.rollbackManifest),base=JSON.parse(original),checks=[];
 const mutations={product:r=>r.product='wrong',host:r=>r.host='claude-code',home:r=>r.hostHome=path.join(f.dir,'wrong'),root:r=>r.targetSkill=path.join(f.dir,'wrong'),vault:r=>r.retirementRoot=path.join(f.skills,'unsafe'),role:r=>r.retirements[0].role='canonical',inventory:r=>r.retirements[0].inventoryDigest='bad',tree:r=>r.retirements[0].before.directories[0].identity.ino='0',security:r=>r.retirements[0].before.directories[0].security={bad:true},duplicate:r=>r.changes.push(structuredClone(r.changes[0])),directory:r=>r.directories[0].created=!r.directories[0].created,plan:r=>r.planFile.path=path.join(f.dir,'wrong'),prepared:r=>r.status='prepared',partial:r=>r.completedRetirements=0,...Object.fromEntries([1,2,3,4].map(n=>['downgrade'+n,r=>r.safetyVersion=n]))};
 for(const [name,mutate]of Object.entries(mutations)){const r=structuredClone(base);mutate(r);const{bindingDigest,status,...bound}=r;r.bindingDigest=hash(JSON.stringify(bound));await writeJson(done.rollbackManifest,r);await fs.writeFile(path.join(f.dir,'forged-'+name+'.json'),JSON.stringify(r,null,2));const before=await snapshot(f.skills);await assert.rejects(rollbackInstall(done.rollbackManifest));assert.deepEqual(await snapshot(f.skills),before);checks.push(name);}
 await fs.writeFile(done.rollbackManifest,original);await rollbackInstall(done.rollbackManifest);return{checks,resealedRejected:true};
});
for(const kind of ['old-root-intrusion','vault-file-identity','vault-directory-identity','canonical-directory-identity','backup-identity','config-content','named-stream'])await test('s5-rollback-drift-'+kind,async()=>{
 const f=await s5Four('rollback-drift-'+kind),config=path.join(f.home,'config.toml');await fs.writeFile(config,'SYNTHETIC stable');const done=await applyInstall(await previewInstall(f.options)),r=await readJson(done.rollbackManifest);let restore=async()=>{};
 if(kind==='old-root-intrusion'){const p=r.retirements[0].root;await fs.mkdir(p);restore=()=>fs.rmdir(p);}
 if(kind==='vault-file-identity'||kind==='backup-identity'){const p=kind==='backup-identity'?r.changes.find(c=>c.backup).backup:path.join(r.retirements[0].vault,'SKILL.md'),kept=p+'.original';await fs.rename(p,kept);await fs.writeFile(p,await fs.readFile(kept));restore=async()=>{await fs.unlink(p);await fs.rename(kept,p);};}
 if(kind==='vault-directory-identity'||kind==='canonical-directory-identity'){const p=kind==='vault-directory-identity'?path.join(r.retirements[0].vault,'agents'):path.join(r.targetSkill,'agents'),kept=p+'.original';await fs.rename(p,kept);await fs.mkdir(p);for(const name of await fs.readdir(kept))await fs.rename(path.join(kept,name),path.join(p,name));restore=async()=>{for(const name of await fs.readdir(p))await fs.rename(path.join(p,name),path.join(kept,name));await fs.rmdir(p);await fs.rename(kept,p);};}
 if(kind==='config-content'){await fs.writeFile(config,'SYNTHETIC drift');restore=()=>fs.writeFile(config,'SYNTHETIC stable');}
 if(kind==='named-stream'&&process.platform==='win32'){const p=r.retirements[0].vault+':$DATA';await fs.writeFile(p,'SYNTHETIC drift stream');restore=async()=>{await fs.unlink(p);const attributes=r.retirements[0].before.directories[0].security.attributes;const reset=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',`[IO.File]::SetAttributes('${r.retirements[0].vault.replaceAll("'","''")}',[IO.FileAttributes]${attributes})`],{windowsHide:true,shell:false,encoding:'utf8'});assert.equal(reset.status,0,reset.stderr);};}
 if(kind==='named-stream'&&process.platform!=='win32')return{notApplicable:'NTFS required'};
 const before=await snapshot(f.skills),rule=await fs.readFile(path.join(f.home,'AGENTS.md'));await assert.rejects(rollbackInstall(done.rollbackManifest));assert.deepEqual(await snapshot(f.skills),before);assert.deepEqual(await fs.readFile(path.join(f.home,'AGENTS.md')),rule);await restore();await rollbackInstall(done.rollbackManifest);return{kind,refusedBeforeMutation:true};
});
for(const kind of ['rename-exdev','journal-after-rename','canonical-write','installed-manifest'])await test('s5-partial-'+kind,async()=>{
 const f=await s5Four('partial-'+kind),plan=await previewInstall(f.options);let moved=false,hit=false,error;const rename=fs.rename,method=kind==='rename-exdev'?'rename':kind==='canonical-write'?'open':'writeFile',saved=fs[method];
 if(method!=='rename')fs.rename=async function(a,b,...args){const value=await rename.call(this,a,b,...args);if(String(b).includes('.sciautoharness-rollback'))moved=true;return value;};
 fs[method]=async function(file,...args){const text=String(file),match=kind==='rename-exdev'?String(args[0]).includes('.sciautoharness-rollback'):kind==='journal-after-rename'?moved&&text.includes('rollback.json.'):kind==='canonical-write'?moved&&text===path.join(f.skills,'sciautoharness','scripts/lib/install.mjs'):text.includes('rollback.json.')&&String(args[0]).includes('"status": "installed"');if(match&&!hit){hit=true;throw Object.assign(new Error('SYNTHETIC '+kind),{code:kind==='rename-exdev'?'EXDEV':'EACCES'});}return saved.call(this,file,...args);};
 try{await applyInstall(plan);}catch(e){error=e;}finally{fs[method]=saved;if(method!=='rename')fs.rename=rename;}
 assert.equal(hit,true);assert.ok(error?.recovery);assert.equal((await readJson(error.recovery.manifest)).status,'prepared');await assert.rejects(rollbackInstall(error.recovery.manifest),/completed/);
 if(kind==='journal-after-rename'){assert.equal(error.recovery.stage,'progress-journal');assert.equal(error.recovery.failedTarget,error.recovery.manifest);assert.equal(error.recovery.completedRetirements,1);}
 for(const t of plan.retirements){let n=0;for(const p of [t.root,t.vault]){if(!await fs.access(p).then(()=>true,()=>false))continue;const st=await fs.stat(p,{bigint:true});if(String(st.ino)===t.before.directories[0].identity.ino)n++;}assert.equal(n,1);}
 return{kind,partialRefused:true,exactlyOneOriginalTree:true,recovery:error.recovery};
});
await test('s5-original-container-stream-drift',async()=>{
 if(process.platform!=='win32')return{notApplicable:'NTFS required'};
 const f=await s5Four('container-stream'),plan=await previewInstall(f.options),open=fs.open;let hit=false,error;
 fs.open=async function(p,...args){const result=await open.call(this,p,...args);if(!hit&&String(p)===path.join(f.skills,'sciautoharness','scripts/lib/install.mjs')){hit=true;await fs.writeFile(f.skills+':sciauto-drift','SYNTHETIC stream during apply');}return result;};
 try{await applyInstall(plan);}catch(e){error=e;}finally{fs.open=open;}
 assert.equal(hit,true);assert.match(error?.message??'',/container\/anchor identity or metadata changed/);assert.equal((await readJson(error.recovery.manifest)).status,'prepared');return{postApplyContainerDriftRejected:true,partialPreserved:true};
});

for(const kind of ['resealed-original-file','manifest-hardlink','manifest-lock-swap'])await test('s5-preflight-'+kind,async()=>{
 const f=await s5Four('preflight-'+kind),done=await applyInstall(await previewInstall(f.options)),base=await readJson(done.rollbackManifest);let restore=async()=>{},caught,hit=false;
 if(kind==='resealed-original-file'){
  const p=path.join(f.skills,'sciautoharness','LICENSE'),kept=path.join(f.dir,'original-license');await fs.rename(p,kept);await fs.writeFile(p,await fs.readFile(kept));const st=await fs.stat(p,{bigint:true}),id={dev:String(st.dev),ino:String(st.ino),nlink:String(st.nlink),mode:String(st.mode)};
  base.canonicalAfter.files.find(x=>x.relative==='LICENSE').identity=id;for(const c of base.changes)if(c.target===p)c.afterIdentity=id;const{bindingDigest,status,...bound}=base;base.bindingDigest=hash(JSON.stringify(bound));await writeJson(done.rollbackManifest,base);
  restore=async()=>{await fs.unlink(p);await fs.rename(kept,p);};
 }
 if(kind==='manifest-hardlink'){const p=path.join(f.dir,'linked-manifest.json');await fs.link(done.rollbackManifest,p);restore=()=>fs.unlink(p);}
 const before=await snapshot(f.skills),rule=await fs.readFile(path.join(f.home,'AGENTS.md'));
 const saved=fs.mkdir;
 if(kind==='manifest-lock-swap')fs.mkdir=async function(p,...a){const result=await saved.call(this,p,...a);if(!hit&&String(p)===path.join(f.home,'.writer-lock')){hit=true;const kept=path.join(f.dir,'original-manifest.json');await fs.rename(done.rollbackManifest,kept);await fs.writeFile(done.rollbackManifest,await fs.readFile(kept));restore=async()=>{await fs.unlink(done.rollbackManifest);await fs.rename(kept,done.rollbackManifest);};}return result;};
 try{await rollbackInstall(done.rollbackManifest);}catch(e){caught=e;}finally{fs.mkdir=saved;}
 assert.ok(caught,'Malformed/replaced original must fail preflight');assert.equal(caught.recovery.completedTargets,0);assert.deepEqual(await snapshot(f.skills),before);assert.deepEqual(await fs.readFile(path.join(f.home,'AGENTS.md')),rule);if(kind==='manifest-lock-swap')assert.equal(hit,true);
 await restore();return{kind,refusedBeforeAnyRestoration:true,originalPlanUnchanged:true};
});

const report={suite:'sciautoharness-migration',node:process.version,root,tests:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
await fs.writeFile(path.join(root,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
