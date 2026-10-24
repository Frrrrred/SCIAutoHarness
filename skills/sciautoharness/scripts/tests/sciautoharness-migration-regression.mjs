import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {previewInstall,applyInstall,rollbackInstall,skillSource} from '../lib/install.mjs';
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
async function test(id,fn){if(casePrefix&&!id.startsWith(casePrefix))return;try{const evidence=await fn();results.push({id,pass:true,evidence});}catch(e){results.push({id,pass:false,error:{message:e.message,stack:e.stack}});}}
await test('s4-fresh-three-roots',async()=>{
 const dir=path.join(root,'fresh'),home=path.join(dir,'home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});
 const text='SYNTHETIC user policy\r\n';await fs.writeFile(path.join(home,'AGENTS.md'),text);
 const p=await previewInstall({hostHome:home,skillRoot:skills});
 assert.equal(p.safetyVersion,4);assert.equal(p.product,'sciautoharness');assert.equal(p.targetSkill,path.join(skills,'sciautoharness'));
 assert.equal(p.agentCompat,path.join(skills,'agent-task-harness'));assert.equal(p.legacyCompat,path.join(skills,'codex-task-harness'));
 assert.equal(p.changes.length,(await listFiles(skillSource)).length+13);
 const done=await applyInstall(p);assert.equal(done.status,'installed');
 for(const name of ['agent-task-harness','codex-task-harness']){
  const wrapper=await fs.readFile(path.join(skills,name,'scripts/harness.mjs'),'utf8');assert.ok(wrapper.includes('../../sciautoharness/'));
  assert.match(await fs.readFile(path.join(skills,name,'agents/openai.yaml'),'utf8'),/allow_implicit_invocation: false/);
 }
 assert.equal((await previewInstall({hostHome:home,skillRoot:skills})).changes.length,0);
 assert.equal((await applyInstall(await previewInstall({hostHome:home,skillRoot:skills}))).status,'already-installed');
 await rollbackInstall(done.rollbackManifest);assert.equal(await fs.readFile(path.join(home,'AGENTS.md'),'utf8'),text);
 for(const n of ['sciautoharness','agent-task-harness','codex-task-harness'])await assert.rejects(fs.stat(path.join(skills,n)),{code:'ENOENT'});
 return {threeRoots:true,exactRoundtrip:true};
});
await test('s4-directory-preserve-existing',async()=>{
 const dir=path.join(root,'existing-dirs'),home=path.join(dir,'home'),skills=path.join(dir,'skills'),canonical=path.join(skills,'sciautoharness'),nested=path.join(canonical,'agents');
 await fs.mkdir(home,{recursive:true});await fs.mkdir(nested,{recursive:true});
 const ids=await Promise.all([canonical,nested].map(async p=>String((await fs.stat(p,{bigint:true})).ino)));
 const done=await applyInstall(await previewInstall({hostHome:home,skillRoot:skills}));await rollbackInstall(done.rollbackManifest);
 for(const[p,i]of [[canonical,ids[0]],[nested,ids[1]]])assert.equal(String((await fs.stat(p,{bigint:true})).ino),i);
 return{preexistingEmptyDirectoryIdentityPreserved:true};
});
await test('s4-directory-linked-root',async()=>{
 const dir=path.join(root,'linked-root'),home=path.join(dir,'home'),skills=path.join(dir,'skills');await fs.mkdir(home,{recursive:true});
 const done=await applyInstall(await previewInstall({hostHome:home,skillRoot:skills})),target=path.join(skills,'sciautoharness'),moved=path.join(skills,'moved-canonical');
 await fs.rename(target,moved);await fs.symlink(moved,target,process.platform==='win32'?'junction':'dir');
 const before={};for(const rel of await listFiles(moved))before[rel]=hash(await fs.readFile(path.join(moved,rel)));const instruction=await fs.readFile(path.join(home,'AGENTS.md'));
 await assert.rejects(rollbackInstall(done.rollbackManifest),/linked|directory|identity|root/i);
 const after={};for(const rel of await listFiles(moved))after[rel]=hash(await fs.readFile(path.join(moved,rel)));assert.deepEqual(after,before);assert.deepEqual(await fs.readFile(path.join(home,'AGENTS.md')),instruction);
 return{sameFilesUnderJunctionRefusedBeforeMutation:true};
});
// The fixed public B0 actually produces safety3; never relabel a new record.
const repo=path.resolve(skillSource,'../..'),frozen=path.join(root,'sources','official','skills','agent-task-harness');
for(const[relative,expected]of Object.entries(inventories.agentFull[0])){
 const r=spawnSync('git',['-C',repo,'show',inventories.officialCommit+':skills/agent-task-harness/'+relative],{shell:false,windowsHide:true,maxBuffer:8*1024*1024});
 assert.equal(r.status,0,String(r.stderr));assert.equal(hash(r.stdout),expected);
 const p=path.join(frozen,relative);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,r.stdout);
}
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
 const plan=await previewInstall(f.options);assert.equal(plan.safetyVersion,4);assert.equal(plan.migration.sources[0].members.length,withAccepted?37:36);
 const done=await applyInstall(plan),record=await readJson(done.rollbackManifest),moved=record.changes.find(c=>c.target===p);
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
 const before=await snapshot(f.dir);await assert.rejects(previewInstall(f.options));assert.deepEqual(await snapshot(f.dir),before);return{noMutation:true};
});
for(const kind of ['product','agentCompat','role','kind','backup-slot','inventory','source-role','downgrade3','downgrade2','duplicate-target'])await test('s4-binding-'+kind,async()=>{
 const f=await oldInstall('binding-'+kind),done=await applyInstall(await previewInstall(f.options)),record=await readJson(done.rollbackManifest);
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
 const f=await oldInstall('inode'),done=await applyInstall(await previewInstall(f.options)),r=await readJson(done.rollbackManifest),c=r.changes.find(c=>c.role==='agentCompat'&&c.after),kept=c.target+'.kept';
 await fs.rename(c.target,kept);await fs.writeFile(c.target,await fs.readFile(kept));const before=await snapshot(f.dir);await assert.rejects(rollbackInstall(done.rollbackManifest),/identity|changed/);assert.deepEqual(await snapshot(f.dir),before);
 await fs.unlink(c.target);await fs.rename(kept,c.target);await rollbackInstall(done.rollbackManifest);return{equalBytesDifferentInodeRefused:true};
});
await test('s4-custom-block-outside-bytes',async()=>{
 const f=await oldInstall('custom'),raw=await fs.readFile(f.agents,'utf8'),a=raw.indexOf('<!-- agent-task-harness:start -->'),b=raw.indexOf('<!-- agent-task-harness:end -->')+'<!-- agent-task-harness:end -->'.length;
 const before=raw.slice(a,b).replace('## Complex task harness','## SYNTHETIC custom'),after=before.replaceAll('agent-task-harness','sciautoharness'),prefix=raw.slice(0,a),suffix=raw.slice(b)+'\r\nSYNTHETIC suffix';
 await fs.writeFile(f.agents,prefix+before+suffix);const inode=(await fs.stat(f.agents,{bigint:true})).ino;
 const options={...f.options,reviewedRule:{before,after}};
 const done=await applyInstall(await previewInstall(options));assert.deepEqual(await fs.readFile(f.agents),Buffer.from(prefix+after+suffix));assert.equal((await fs.stat(f.agents,{bigint:true})).ino,inode);
 assert.equal((await previewInstall(options)).changes.length,0);assert.equal((await applyInstall(await previewInstall(options))).status,'already-installed');
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
 const done=await applyInstall(await previewInstall(f.options));
 for(const entry of ['sciautoharness','agent-task-harness','codex-task-harness']){const ctx=cli(f,entry,['context','--project',project,'--id',id,'--task','a']);assert.equal(ctx.review.digest,review.digest);assert.equal(ctx.review.approved,true);if(state==='active')assert.equal(ctx.activeExecutions[0].runId,run.runId);}
 if(state==='active')cli(f,'agent-task-harness',['submit','--project',project,'--id',id,'--task','a','--run-id',run.runId,'--executor','codex-native','--reference','SYNTHETIC original work','--result','ok']);
 if(state!=='verified')cli(f,'agent-task-harness',['verify','--project',project,'--id',id,'--task','a']);
 const status=cli(f,'sciautoharness',['status','--project',project,'--id',id]);assert.equal(status.tasks.a.status,'verified');assert.equal(status.approval.digest,review.digest);
 await rollbackInstall(done.rollbackManifest);return{threeActualCLIEntries:true,originalRun:run.runId,originalReview:review.digest};
});
for(const kind of ['rename-exdev','journal-unconfirmed','alias-write','installed-manifest'])await test('s4-partial-'+kind,async()=>{
 const f=await oldInstall('fault-'+kind),plan=await previewInstall(f.options);let moved=false,hit=false,error;
 const method=kind==='rename-exdev'?'rename':kind==='alias-write'?'open':'writeFile',saved=fs[method],rename=fs.rename;
 if(method!=='rename')fs.rename=async function(a,b,...args){const result=await rename.call(this,a,b,...args);if(String(b).includes('.sciautoharness-rollback'))moved=true;return result;};
 fs[method]=async function(file,...args){const text=String(file),match=kind==='rename-exdev'?String(args[0]).includes('.sciautoharness-rollback'):kind==='journal-unconfirmed'?moved&&text.includes('rollback.json.'):kind==='alias-write'?moved&&text===path.join(f.old,'SKILL.md'):text.includes('rollback.json.')&&String(args[0]).includes('"status": "installed"');if(match&&!hit){hit=true;throw Object.assign(new Error('SYNTHETIC '+kind),{code:kind==='rename-exdev'?'EXDEV':'EACCES'});}return saved.call(this,file,...args);};
 try{await applyInstall(plan);}catch(e){error=e;}finally{fs[method]=saved;if(method!=='rename')fs.rename=rename;}
 assert.equal(hit,true);assert.ok(error?.recovery);assert.equal((await readJson(error.recovery.manifest)).status,'prepared');await assert.rejects(rollbackInstall(error.recovery.manifest),/completed/);
 const rec=await readJson(error.recovery.manifest);for(const c of rec.changes.filter(c=>c.retire)){let n=0;for(const p of [c.target,c.backup]){if(!await fs.access(p).then(()=>true,()=>false))continue;const st=await fs.stat(p,{bigint:true});if(String(st.ino)===c.beforeIdentity.ino&&hash(await fs.readFile(p))===c.before)n++;}assert.equal(n,1);}
 return{preparedRefused:true,originalObjectsPreserved:true,stage:error.recovery.stage};
});
const report={suite:'sciautoharness-migration',node:process.version,root,tests:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results};
await fs.writeFile(path.join(root,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
