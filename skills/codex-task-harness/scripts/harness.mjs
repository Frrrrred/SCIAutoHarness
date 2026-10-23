#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, validateContract } from './lib/contract.mjs';
import { draft, render, prepareReview, recordDecision, status, taskContext, begin, submit, run, verify, taskDirectory } from './lib/engine.mjs';
import { checkHarnessPaths } from './check-harness-paths.mjs';
import { applyInstall, previewInstall, rollbackInstall } from './lib/install.mjs';
import { json, contained, inside, exists, locked, atomicWrite, formatRuntimeError } from './lib/files.mjs';
import { resolveCodex, runProcess } from './lib/process.mjs';
import os from 'node:os';
import { EXECUTION_SUMMARY } from './lib/templates.mjs';

const HELP = `codex-task-harness (local Node.js; no automatic downloads)
  help
  classify --intent review --stages 3 [--research] [--read-only]
  init [--project PATH]                         installation preview only
  install-preview --codex-home PATH --skill-root PATH [--out FILE] [--replace-skill]
  install --plan FILE                          apply an already reviewed preview
  rollback --manifest FILE                    explicit rollback, refuses user drift
  draft --project PATH --id ID --goal TEXT [--domain software|research|general] [--layout layered]
  refs --project ABSOLUTE_PATH --id ID [--next | --document PACKAGE_RELATIVE_MD] [--allow-root AUTHORIZED_ROOT ...]
  prepare-review --project ABSOLUTE_PATH --id ID [--repair-output-refs] [--handoff-only] [--allow-root AUTHORIZED_ROOT ...]
  handoff --project ABSOLUTE_PATH --id ID [--allow-root AUTHORIZED_ROOT ...]  read-only current pending-review Markdown
  render --project PATH --id ID                 regenerate HARNESS from contract
  review --project PATH --id ID                 validate and seal review package
  decision --project PATH --id ID --record FILE direct user decision record
  status --project PATH --id ID                 read-only current evidence status
  context --project PATH --id ID --task STEP    read-only selected stage and constraints
  begin --project PATH --id ID --task STEP      host-native Codex execution boundary
  submit --project PATH --id ID --task STEP --receipt FILE
  submit --project PATH --id ID --task STEP --run-id RUN --executor codex-native --reference TEXT --result ok|failed
  run --project PATH --id ID --task STEP [--codex LOCAL_EXECUTABLE] [--timeout-ms N]
  verify --project PATH --id ID --task STEP [--reviews FILE]
  doctor                                       version/help probes only; no model

Fill the draft contract before review. A generated skeleton is not ready for approval.
Decision JSON: actor=user, decision=approve|reject|revise, taskId, revision, digest,
message, source. The caller must have a real user message; this records, not authenticates,
identity. ${EXECUTION_SUMMARY}
Install/global enable and real codex run require the user's applicable authorization.`;

const SUBMIT_HELP={
  command:'submit',
  inlineRequired:['project','id','task','run-id','executor','reference','result'],
  inlineOptional:['summary','outcome'],
  inlineExampleArgs:['submit','--project','<PROJECT>','--id','<ID>','--task','<STEP>','--run-id','<RUN_ID>','--executor','codex-native','--reference','<REFERENCE>','--result','ok'],
  fileMode:'Alternatively use --receipt FILE containing runId, executor, reference, result, optional summary/outcome. Do not mix file and inline fields.',
  ownership:'File mode takes a separate input payload. Never create receipt-<runId>.json or state.json yourself; runtime-owned files are created by the runtime. Inline mode needs no payload file.',
  recovery:'After confirmed end, identical original facts may replay a complete same-run receipt. Runtime validates identity/review/hash/caller facts and preserves the existing file. Closed replay is idempotent; conflicting or partial evidence blocks without deletion, overwrite or renewed eligibility.',
  process:'Post-spawn error/kill failure is not close. Keep the original observer and active run until actual close; unknown-active cannot be auto-submitted. Logging cleanup errors retain processResult.',
  evidence:'Use the actual original begin runId and truthful end-of-execution evidence. Current approved ok results become pending acceptance and still need verify. A stale or orphan run may close factually after approval/dependency loss, but remains stale and cannot restore approval or accept results. This does not stop or authenticate a process.'
};

function options(args, allowed, repeat=[]) {
  const result={};
  for(let i=0;i<args.length;i++) {
    const match=args[i].match(/^--([a-z-]+)(?:=(.*))?$/);
    if(!match || !allowed.includes(match[1]) || (Object.hasOwn(result,match[1])&&!repeat.includes(match[1]))) throw new Error(`Unsupported or repeated argument: ${args[i]}`);
    const key=match[1];
    if(['research','read-only','replace-skill','repair-output-refs','next','handoff-only','help'].includes(key)) result[key]=match[2]===undefined?true:match[2]==='true';
    else { const value=match[2]??args[++i]; if(value===undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`); if(repeat.includes(key))(result[key]??=[]).push(value);else result[key]=value; }
  }
  return result;
}
const requireOption=(o,key)=>{if(!o[key])throw new Error(`--${key} is required.`);return o[key];};
const isUnreviewedDraft=state=>state.phase==='draft'&&!state.review&&!state.approval&&Object.values(state.tasks??{}).every(t=>t.status==='todo');
const authoringAction=(command,project,id)=>({command:process.execPath,args:[fileURLToPath(import.meta.url),command,'--project',project,'--id',id]});
async function authoringPackage(project,id,allowRoots) {
  const directory=await taskDirectory(project,id);
  const contract=validateContract(await json(await contained(directory,'contract.json')));
  if(contract.taskId!==id)throw new Error('Task identity mismatch.');
  if(contract.layout!=='layered')throw new Error('Authoring commands require an explicitly layered contract; legacy interfaces remain available.');
  const roots=[await fs.realpath(project)];
  for(const root of allowRoots){if(!path.isAbsolute(root))throw new Error('--allow-root requires an explicitly authorized absolute root.');roots.push(await fs.realpath(root));}
  const scoped=async target=>{
    for(const root of roots)if(inside(root,target))return contained(root,path.relative(root,target));
    throw new Error(`Input outside explicit project/authorized roots: ${target}`);
  };
  const inputs=[];for(const [index,input] of contract.inputs.entries())if(input.path)inputs.push({index,source:input.source,target:await scoped(path.resolve(project,input.path))});
  const deliverables=[];for(const d of contract.deliverables)deliverables.push({id:d.id,target:await contained(project,d.path)});
  return {directory,contract,inputs,deliverables};
}
async function authoringReferences(project,id,allowRoots,selected) {
  const {directory,contract,inputs,deliverables}=await authoringPackage(project,id,allowRoots);
  const names=[...new Set(['HARNESS.md',contract.recoveryFile,...contract.contextFiles.map(x=>x.path),...contract.reviewFiles.filter(x=>typeof x==='string'&&x.endsWith('.md'))])];
  if(selected!==undefined&&!names.includes(selected))throw new Error('--document must name a declared package-relative Markdown document.');
  const documents=[],identities=new Set();
  for(const relative of names){
    if(path.isAbsolute(relative)||path.win32.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw new Error('Document must remain package-relative.');
    const file=await contained(directory,relative);
    let real=file,stat;try{real=await fs.realpath(file);stat=await fs.stat(file,{bigint:true});}catch(e){if(e.code!=='ENOENT')throw e;}
    const keys=[process.platform==='win32'?real.toLowerCase():real,...(stat?.ino?[`${stat.dev}:${stat.ino}`]:[])];
    if(keys.some(key=>identities.has(key)))throw new Error(`Document alias: ${relative}`);keys.forEach(key=>identities.add(key));
    const map=(target,label)=>{
      const reference=path.relative(path.dirname(file),target).split(path.sep).join('/');
      const literal=reference.replaceAll('%','%25').replaceAll('#','%23');
      return {reference,markdown:`[${label}](<${literal}>)`};
    };
    if(selected===undefined||relative===selected)documents.push({path:relative,file,
      inputs:inputs.map(x=>{
        const literal=x.target.split(path.sep).join('/').replaceAll('%','%25').replaceAll('#','%23');
        return {...x,...map(x.target,`input-${x.index}`),absoluteMarkdown:`[input-${x.index}](<${literal}>)`};
      }),
      deliverables:deliverables.map(x=>({...x,...map(x.target,x.id)}))});
  }
  return {taskId:id,revision:contract.revision,project,package:directory,documents,persisted:false};
}
async function nextAuthoringDocument(project,id,allowRoots) {
  const mapped=await authoringReferences(project,id,allowRoots);
  const {contract}=await authoringPackage(project,id,allowRoots);
  const names=[...new Set([...contract.contextFiles.map(x=>x.path),contract.recoveryFile,...contract.reviewFiles.filter(x=>typeof x==='string'&&x.endsWith('.md'))])];
  const inventory=[];
  for(const name of names){
    const doc=mapped.documents.find(x=>x.path===name);let status;
    try{status=(await fs.readFile(doc.file,'utf8')).trim()?'present':'empty';}catch(e){if(e.code!=='ENOENT')throw e;status='missing';}
    inventory.push({path:name,status});
  }
  const pending=inventory.filter(x=>x.status!=='present');let documents=[];
  if(pending.length){
    const doc=mapped.documents.find(x=>x.path===pending[0].path),context=contract.contextFiles.find(x=>x.path===doc.path);
    const tasks=contract.tasks.filter(t=>context?.tasks.includes(t.id)).map(({id,title,dependsOn,outputs,acceptance})=>({id,title,dependsOn,outputs,acceptance}));
    const outputs=new Set(tasks.flatMap(t=>t.outputs));
    const inherited=['HARNESS.md',...contract.contextFiles.filter(x=>x.kind==='reference'&&x.path!==doc.path&&context?.tasks.some(t=>x.tasks.includes(t))).map(x=>x.path)];
    const inherits=inherited.map(relative=>{
      const parent=mapped.documents.find(x=>x.path===relative);
      const reference=path.relative(path.dirname(doc.file),parent.file).split(path.sep).join('/');
      return {path:relative,file:parent.file,reference,markdown:`[${relative}](<${reference.replaceAll('%','%25').replaceAll('#','%23')}>)`};
    });
    documents=[{...doc,inherits,purpose:context?.purpose??(doc.path===contract.recoveryFile?'Recovery, interruption and invalidation rules':'Declared review attachment'),kind:context?.kind??(doc.path===contract.recoveryFile?'recovery':'attachment'),tasks,deliverables:context?doc.deliverables.filter(x=>outputs.has(x.id)):doc.deliverables}];
  }
  const state=await json(await contained(mapped.package,'state.json'));
  const finish=authoringAction('prepare-review',project,id);finish.args.push(...(isUnreviewedDraft(state)?['--repair-output-refs']:[]),'--handoff-only',...allowRoots.flatMap(root=>['--allow-root',root]));
  return {taskId:mapped.taskId,revision:mapped.revision,project:mapped.project,package:mapped.package,inventory,pendingDocuments:pending.length,documents,contentReviewed:false,persisted:false,next:pending.length?{action:'write_document',document:pending[0].path,instruction:'Write this substantive document now using the supplied Markdown links. Inherit global constraints through inherits instead of repeating them. Specify stage-specific inputs/prerequisites, method/assumptions, outputs/ownership, acceptance evidence, failure actions and handoff. Complete all major documents before optional elaboration; there is no length or fixed document-count criterion. Keep existing document paths and task IDs; write the missing document separately rather than renumbering stages or mixing it with contract changes. The renderer owns HARNESS.md. Then call refs --next again. Nonempty means present, not semantically verified; review the complete content before sealing.'}:{action:'review_content_then_prepare_review',...finish,instruction:'Review the complete content before sealing. For a previously reviewed package, increment the contract revision after changes and use this returned action without draft-only reference repair. If valid, prepare review and normally deliver the successful Markdown; do not reread the whole package after success without a specific new defect.'}};
}
function reviewPresentation(directory,contract,review,pathCheck) {
  const documents=['HARNESS.md',...contract.contextFiles.map(x=>x.path),contract.recoveryFile,...contract.reviewFiles].filter((x,i,a)=>a.indexOf(x)===i).map(relative=>({path:relative,file:path.resolve(directory,relative)}));
  const navigation=[...new Set(['HARNESS.md','contract.json',...documents.map(x=>x.path)])].map(relative=>{
    const label=relative.replaceAll('[','\\[').replaceAll(']','\\]');
    const file=path.resolve(directory,relative).split(path.sep).join('/').replaceAll('%','%25').replaceAll('#','%23');
    return `- [${label}](<${file}>)`;
  }).join('\n');
  const handoffMarkdown=`完整 Harness 已准备，当前状态为 pending_user_review，等待最终用户审查。\n\n任务 ID：${review.taskId}；修订：${review.revision}。\n\n审查摘要：${review.digest}\n\n路径检查：${pathCheck.documents} 份 Markdown 文档，0 个问题、0 个未覆盖项；机器 review 已成功。总控已与当前契约一致，并已纳入当前受审摘要。总体边界、阶段方法、验收及未解决项见以下完整审查包：\n\n${navigation}\n\n请最终用户审查当前 ID、修订和摘要绑定的完整版本，并直接批准、拒绝或提出修改。批准前不开始正式工作；机器检查不替代内容和科学有效性审查。`;
  return {documents,handoffMarkdown,next:'Use handoffMarkdown for the normal final reply. Preserve literal link targets: E:/..., never /E:/.... Wait for direct final-user approval.'};
}
async function repairOutputReferences(project,id,allowRoots) {
  const directory=await taskDirectory(project,id);
  return locked(directory,async()=>{
    const state=await json(await contained(directory,'state.json'));
    if(!isUnreviewedDraft(state))throw new Error('Output reference repair requires an unreviewed, unapproved, unexecuted draft.');
    const mapping=await authoringReferences(project,id,allowRoots);
    const {contract}=await authoringPackage(project,id,allowRoots);
    const changes=[],writes=[];
    for(const doc of mapping.documents){
      if(doc.path==='HARNESS.md')continue; // The existing renderer owns the master.
      const before=await fs.readFile(doc.file,'utf8');let fence=null,lineNumber=0;const parts=[];
      for(const line of before.split(/(?<=\n)/)){
        lineNumber++;const marker=line.match(/^\s*(`{3,}|~{3,})/);
        if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;parts.push(line);continue;}
        if(fence){parts.push(line);continue;}
        const edits=[];const codeTokens=[...line.matchAll(/(?<!`)(`+)([^\r\n]*?)\1(?!`)/g)];
        const codeSpans=codeTokens.map(m=>[m.index,m.index+m[0].length]);
        const links=[...line.matchAll(/(?<!!)\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^\s)]+))\s*\)/g)];
        for(const m of links){
          if(codeSpans.some(([a,b])=>m.index>=a&&m.index<b))continue;
          const raw=m[2]??m[3];let decoded;try{decoded=decodeURIComponent(raw);}catch{continue;}
          if(!/^(?:\.\.\/)*[^?#]+$/.test(decoded)||path.isAbsolute(decoded)||path.win32.isAbsolute(decoded)||decoded.includes('\\'))continue;
          const tail=decoded.replace(/^(?:\.\.\/)*/,'');if(tail.split('/').some(x=>!x||x==='.'||x==='..'))continue;
          const candidates=doc.deliverables.filter(d=>{
            const declared=contract.deliverables.find(x=>x.id===d.id).path;
            return !doc.inputs.some(x=>x.target===d.target)&&!path.isAbsolute(declared)&&!path.win32.isAbsolute(declared)&&declared===tail&&(m[1]===d.id||m[1]===path.posix.basename(declared));
          });
          if(candidates.length!==1)continue;const target=candidates[0];if(decoded===target.reference)continue;
          const oldTarget=path.resolve(path.dirname(doc.file),decoded);if(!inside(project,oldTarget))continue;
          try{await contained(project,path.relative(project,oldTarget));}catch{continue;}
          if(await exists(oldTarget))continue;
          const next=target.reference.replaceAll('%','%25').replaceAll('#','%23');
          const start=m.index+m[0].indexOf('](')+2+m[0].slice(m[0].indexOf('](')+2).indexOf(raw);
          edits.push({start,end:start+raw.length,text:next});changes.push({document:doc.path,line:lineNumber,old:raw,new:next,output:target.id});
        }
        for(const token of codeTokens){
          if(token[1].length!==1||links.some(m=>token.index>=m.index&&token.index<m.index+m[0].length))continue;
          const literal=token[2];
          const candidates=doc.deliverables.filter(d=>{
            const declared=contract.deliverables.find(x=>x.id===d.id).path;
            return !path.isAbsolute(declared)&&!path.win32.isAbsolute(declared)&&declared===literal&&!doc.inputs.some(x=>x.target===d.target);
          });
          if(candidates.length!==1)continue;
          const oldTarget=path.resolve(path.dirname(doc.file),literal);if(!inside(project,oldTarget))continue;
          try{await contained(project,path.relative(project,oldTarget));}catch{continue;}
          if(await exists(oldTarget))continue;
          const target=candidates[0];
          edits.push({start:token.index,end:token.index+token[0].length,text:target.markdown});
          changes.push({document:doc.path,line:lineNumber,old:token[0],new:target.markdown,output:target.id,syntax:'single-backtick'});
        }
        let updated=line;for(const e of edits.sort((a,b)=>b.start-a.start))updated=updated.slice(0,e.start)+e.text+updated.slice(e.end);parts.push(updated);
      }
      const after=parts.join('');if(after!==before)writes.push({file:doc.file,before,after});
    }
    // Preflight all declared files before writing; detect drift rather than replacing it.
    for(const w of writes)if(await fs.readFile(w.file,'utf8')!==w.before)throw new Error('Draft changed during output reference repair.');
    for(const w of writes)await atomicWrite(w.file,w.after);
    return {documents:writes.length,changes};
  });
}
async function completeReview(project,id,allowRoots,repair=false) {
  const {directory,contract}=await authoringPackage(project,id,allowRoots);
  const repaired=repair?{outputRefRepair:await repairOutputReferences(project,id,allowRoots)}:{};
  await render(project,id);
  const checked=await checkHarnessPaths({project,package:directory,planned:contract.deliverables.map(d=>d.path),allowRoots});
  const pathCheck={ok:checked.ok,documents:checked.documents,issues:checked.issues,uncovered:checked.uncovered};
  if(!checked.ok)return {phase:'path_check_failed',pathCheck,review:null,...repaired,next:{repairUsing:authoringAction('refs',project,id),recheck:authoringAction('prepare-review',project,id)}};
  const review=await prepareReview(project,id);
  return {phase:review.phase,pathCheck,review,...repaired,...reviewPresentation(directory,contract,review,pathCheck)};
}
async function currentHandoff(project,id,allowRoots) {
  const {directory,contract}=await authoringPackage(project,id,allowRoots);
  const stateFile=await contained(directory,'state.json'),lock=path.join(directory,'.writer-lock');
  if(await exists(lock))throw new Error('A writer is active or interrupted; resolve its real state before handoff.');
  const before=await fs.readFile(stateFile);
  const ready=s=>s.phase==='pending_user_review'&&!s.approval&&!s.blocker&&s.review?.revision===contract.revision&&s.review?.digest&&contract.tasks.every(t=>s.tasks[t.id]?.status==='todo');
  const state=await status(project,id);
  if(!ready(state))throw new Error('A current, unchanged pending review is required. Handoff does not render, prepare review, approve or execute.');
  const checked=await checkHarnessPaths({project,package:directory,planned:contract.deliverables.map(d=>d.path),allowRoots});
  const pathCheck={ok:checked.ok,documents:checked.documents,issues:checked.issues,uncovered:checked.uncovered};
  if(!checked.ok)throw new Error(`Current handoff path check failed: ${JSON.stringify(pathCheck)}`);
  const current=await status(project,id);
  if(!ready(current)||current.review.digest!==state.review.digest||await exists(lock)||!before.equals(await fs.readFile(stateFile)))throw new Error('Review or execution state changed during handoff; no delivery text was produced.');
  return reviewPresentation(directory,contract,{taskId:id,revision:current.review.revision,digest:current.review.digest},pathCheck).handoffMarkdown;
}
export async function main(argv=process.argv.slice(2)) {
  const command=argv[0]??'help';
  if(['help','--help','-h'].includes(command)) { console.log(command==='help'&&argv[1]==='submit'?JSON.stringify(SUBMIT_HELP,null,2):HELP);return; }
  const allowed={classify:['intent','stages','deliverables','research','read-only'],init:['project','path','out'], 'install-preview':['codex-home','skill-root','out','replace-skill'],install:['plan'],rollback:['manifest'],draft:['project','id','goal','domain','layout'],refs:['project','id','document','allow-root','next'],'prepare-review':['project','id','allow-root','repair-output-refs','handoff-only'],handoff:['project','id','allow-root'],render:['project','id'],review:['project','id'],decision:['project','id','record'],status:['project','id'],context:['project','id','task'],begin:['project','id','task'],submit:['project','id','task','receipt','run-id','executor','reference','result','summary','outcome'],run:['project','id','task','codex','timeout-ms'],verify:['project','id','task','reviews'],doctor:[]};
  if(!allowed[command])throw new Error(`Unknown command ${command}. Use help.`);
  const authoring=['refs','prepare-review','handoff'].includes(command);
  const o=options(argv.slice(1),[...allowed[command],'help'],authoring?['allow-root']:[]);
  if(o.help){console.log(command==='submit'?JSON.stringify(SUBMIT_HELP,null,2):HELP);return;}
  if(authoring&&!path.isAbsolute(requireOption(o,'project')))throw new Error('--project must be absolute for authoring commands.');
  const project=authoring?await fs.realpath(o.project):path.resolve(o.project??o.path??process.cwd());
  let result;
  if(command==='classify') {
    const number=(value)=>{const n=Number(value??1);if(!Number.isInteger(n)||n<1)throw new Error('Stages/deliverables must be positive integers.');return n;};
    result=classify({intent:o.intent,stages:number(o.stages),deliverables:number(o.deliverables),research:o.research,readOnly:o['read-only']});
  } else if(command==='init' || command==='install-preview') {
    result=await previewInstall(command==='init'?{codexHome:project,skillRoot:path.join(project,'.agents','skills')}:{codexHome:requireOption(o,'codex-home'),skillRoot:requireOption(o,'skill-root'),replaceSkill:o['replace-skill']});
    if(o.out)await fs.writeFile(path.resolve(o.out),`${JSON.stringify(result,null,2)}\n`,{flag:'wx'});
  } else if(command==='install') result=await applyInstall(await json(requireOption(o,'plan')));
  else if(command==='rollback')result=await rollbackInstall(requireOption(o,'manifest'));
  else if(command==='doctor') {
    const invocation=await resolveCodex(); const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'codex-task-harness-doctor-'));
    const versionLog=path.join(tmp,'version.txt'),helpLog=path.join(tmp,'help.txt');
    const version=await runProcess(invocation.command,[...invocation.prefix,'--version'],{cwd:project,log:versionLog,timeoutMs:10000});
    const help=await runProcess(invocation.command,[...invocation.prefix,'exec','--help'],{cwd:project,log:helpLog,timeoutMs:10000});
    const helpText=await fs.readFile(helpLog,'utf8');
    result={node:process.version,codex: (await fs.readFile(versionLog,'utf8')).trim(),versionExit:version.code,helpExit:help.code,execArgumentsSupported:['--sandbox','--skip-git-repo-check','--json','--config'].every(x=>helpText.includes(x)),actualModelRun:false,evidenceDirectory:tmp};
  } else {
    const id=requireOption(o,'id');
    if(command==='draft'){
      result=await draft(project,id,requireOption(o,'goal'),o.domain,o.layout);
      if(o.layout==='layered')Object.assign(result,{next:'Fill and check the contract first. For a stable complete contract, use authoring.refs once to obtain every document mapping, then write all substantive documents from those mappings without repeating unchanged refs calls. Use authoring.next for partial authoring or after mapping changes. Review the complete content before sealing; normally deliver the successful Markdown next.',authoring:{refs:authoringAction('refs',project,id),next:{...authoringAction('refs',project,id),args:[...authoringAction('refs',project,id).args,'--next']},prepareReview:{...authoringAction('prepare-review',project,id),args:[...authoringAction('prepare-review',project,id).args,'--repair-output-refs','--handoff-only']}}});
    }
    if(command==='refs'){
      if(o.next&&o.document!==undefined)throw new Error('--next and --document are mutually exclusive.');
      result=o.next?await nextAuthoringDocument(project,id,o['allow-root']??[]):await authoringReferences(project,id,o['allow-root']??[],o.document);
    }
    if(command==='handoff')result=await currentHandoff(project,id,o['allow-root']??[]);
    if(command==='prepare-review'){
      result=await completeReview(project,id,o['allow-root']??[],o['repair-output-refs']===true);
      if(!result.pathCheck.ok)process.exitCode=1;
    }
    if(command==='render')result=await render(project,id);
    if(command==='review')result=await prepareReview(project,id);
    if(command==='decision')result=await recordDecision(project,id,await json(requireOption(o,'record')));
    if(command==='status')result=await status(project,id);
    if(command==='context')result=await taskContext(project,id,requireOption(o,'task'));
    if(command==='begin')result=await begin(project,id,requireOption(o,'task'));
    if(command==='submit'){
      const fields=['run-id','executor','reference','result','summary','outcome'];
      if(Object.hasOwn(o,'receipt')&&fields.some(key=>Object.hasOwn(o,key)))throw new Error('File and inline submission fields are mutually exclusive. Use help submit.');
      if(Object.hasOwn(o,'receipt')){const sourceFile=path.resolve(requireOption(o,'receipt'));result=await submit(project,id,requireOption(o,'task'),await json(sourceFile),{sourceFile});}
      else result=await submit(project,id,requireOption(o,'task'),{runId:requireOption(o,'run-id'),executor:requireOption(o,'executor'),reference:requireOption(o,'reference'),result:requireOption(o,'result'),...(o.summary===undefined?{}:{summary:o.summary}),...(o.outcome===undefined?{}:{outcome:o.outcome})});
    }
    if(command==='run')result=await run(project,id,requireOption(o,'task'),{codex:o.codex,timeoutMs:o['timeout-ms']===undefined?undefined:Number(o['timeout-ms'])});
    if(command==='verify')result=await verify(project,id,requireOption(o,'task'),o.reviews?await json(o.reviews):{});
  }
  console.log(command==='handoff'?result:command==='prepare-review'&&o['handoff-only']&&result.handoffMarkdown?result.handoffMarkdown:JSON.stringify(result,null,2)); return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(formatRuntimeError(e));process.exitCode=1;});
