import fs from 'node:fs/promises';
import path from 'node:path';
import { contained, digest, safeId } from './files.mjs';
import { validateLayered,renderLayered,layeredReviewFiles } from './context.mjs';
import { CURRENT_TEMPLATE_VERSION, EXECUTION_SUMMARY, templateVersion } from './templates.mjs';
import {draftPolicy,executionPolicy} from './hosts.mjs';

export function classify({ intent = 'implement', stages = 1, deliverables = 1, research = false, readOnly = false } = {}) {
  const inspectOnly = readOnly || ['explain', 'review', 'diagnose', 'compare', 'plan'].includes(intent);
  return { needsHarness: research || stages > 1 || deliverables > 1, persistentWritesAuthorizedByIntent: !inspectOnly, intent, readOnly: inspectOnly };
}
export function skeleton(taskId, goal, domain = 'general') {
  safeId(taskId);
  if (!['software','research','general'].includes(domain)) throw new Error('Domain must be software, research or general.');
  return {
    schemaVersion: 1, templateVersion: CURRENT_TEMPLATE_VERSION, taskId, revision: 1, domain, goal,
    execution: draftPolicy(),
    nonGoals: [], inputs: [], deliverables: [], skills: [], assumptions: [], risks: [], stops: [],
    permissions: { localWrites: true, network: false, install: false, externalWrites: false, longGpu: false },
    resources: { budget: 'not specified; ask before incurring new cost', stopConditions: [] },
    reviewFiles: [], tasks: [],
    ...(domain === 'research' ? { protocol: { question: '', estimand: '', dataProvenance: '', independentUnit: '', replication: '', controlsConfounding: '', primaryExploratory: '', analysis: '', leakage: '', uncertainty: '', provenanceToClaims: '', negativeResults: 'Preserve null, opposite and inconclusive findings; never repair toward positivity.' } } : {}),
  };
}
const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || /^(TODO|TBD|UNKNOWN|AUTHOR_INPUT_NEEDED|\u5f85\u586b\u5199|\u5f85\u786e\u8ba4)$/i.test(value.trim())) throw new Error(`BLOCKED: ${label} is missing or unresolved.`);
};
// IDs name artifacts; ownership must also be unique for the actual file target.
const pathKey = file => {
  const normalized=path.normalize(file);
  if(process.platform==='win32' && normalized.split(path.sep).some(p=>p!=='.' && p!=='..' && /[. ]$/.test(p))) throw new Error(`Ambiguous Windows output path: ${file}`);
  return process.platform==='win32'?normalized.toLowerCase():normalized;
};
function checkOutputPath(seen, id, file, inode) {
  const key=pathKey(file);
  for(const other of seen) {
    if(key===other.key || key.startsWith(other.key+path.sep) || other.key.startsWith(key+path.sep)) throw new Error(`Output path conflict: ${other.id} (${other.file}) and ${id} (${file}).`);
    if(inode && inode===other.inode) throw new Error(`Output path conflict: ${other.id} (${other.file}) and ${id} (${file}) address the same file.`);
  }
  seen.push({id,file,key,inode});
}
async function outputIdentity(file) {
  let ancestor=file;const suffix=[];
  for(;;) {
    try {
      const stat=await fs.stat(ancestor,{bigint:true});
      const real=await fs.realpath(ancestor);
      if(ancestor===file && !stat.isFile()) throw new Error(`Output must name a file: ${file}`);
      return {file:path.join(real,...suffix),inode:ancestor===file && stat.ino!==0n?`${stat.dev}:${stat.ino}`:undefined,nlink:ancestor===file?stat.nlink:0n};
    } catch(e) {
      if(e.code!=='ENOENT')throw e;
      suffix.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);
    }
  }
}
export function validateContract(c) {
  if (c.schemaVersion !== 1) throw new Error('Unsupported contract schema.');
  templateVersion(c);
  executionPolicy(c);
  safeId(c.taskId);
  if (!Number.isInteger(c.revision) || c.revision < 1) throw new Error('revision must be a positive integer.');
  if (!['software','research','general'].includes(c.domain)) throw new Error('Invalid domain.');
  requiredText(c.goal,'goal');
  for (const key of ['nonGoals','inputs','deliverables','skills','assumptions','risks','stops','reviewFiles','tasks']) if (!Array.isArray(c[key])) throw new Error(`${key} must be an array.`);
  for (const key of ['localWrites','network','install','externalWrites','longGpu']) if (typeof c.permissions?.[key] !== 'boolean') throw new Error(`permissions.${key} must be explicitly true or false.`);
  if (!c.permissions.localWrites) throw new Error('Use an in-session review package for read-only tasks; this persistent runtime requires authorized local writes.');
  if (!c.deliverables.length || !c.tasks.length) throw new Error('BLOCKED: declare deliverables and tasks before user review.');
  // Diagnose authoring shape errors together, before ID/ownership checks obscure their location.
  const shapeErrors=[];
  const fieldId=(value,location)=>{try{safeId(value);}catch{shapeErrors.push(`${location}: use an ID starting with a lowercase letter, followed by lowercase letters, digits or hyphens.`);}};
  c.deliverables.forEach((d,i)=>fieldId(d?.id,`deliverables[${i}].id`));
  const declared=new Set(c.deliverables.map(d=>d?.id).filter(id=>typeof id==='string'));
  c.tasks.forEach((t,i)=>{
    if(Array.isArray(t?.outputs))t.outputs.forEach((id,j)=>{if(!declared.has(id))shapeErrors.push(`tasks[${i}].outputs[${j}]: reference a declared deliverables[].id; declare intermediate artifacts too, and put the file path in that deliverable's path.`);});
    if(Array.isArray(t?.acceptance))t.acceptance.forEach((a,j)=>{
      const location=`tasks[${i}].acceptance[${j}]`;
      if(!a || typeof a!=='object' || Array.isArray(a))shapeErrors.push(`${location}: use an object with id, type and description, not a string.`);
      else fieldId(a.id,`${location}.id`);
    });
  });
  if(shapeErrors.length)throw new Error(`Invalid contract fields:\n${shapeErrors.join('\n')}`);
  const deliverables = new Set();const outputPaths=[];
  for (const d of c.deliverables) {
    safeId(d.id); requiredText(d.path,`deliverable ${d.id} path`);
    if (deliverables.has(d.id)) throw new Error('Duplicate deliverable ID.');
    deliverables.add(d.id);
    checkOutputPath(outputPaths,d.id,d.path);
  }
  const tasks = new Map(); const owned = new Set();
  for (const t of c.tasks) {
    safeId(t.id); requiredText(t.title,`task ${t.id} title`);
    if (tasks.has(t.id)) throw new Error('Duplicate task ID.');
    tasks.set(t.id,t);
    if (!Array.isArray(t.dependsOn) || !Array.isArray(t.outputs) || !t.outputs.length || !Array.isArray(t.acceptance) || !t.acceptance.length) throw new Error(`Task ${t.id} needs dependencies, outputs and acceptance criteria.`);
    for (const id of t.outputs) { if (!deliverables.has(id) || owned.has(id)) throw new Error(`Output ${id} is missing or has multiple writing owners.`); owned.add(id); }
    const ids = new Set();
    for (const a of t.acceptance) {
      safeId(a.id); requiredText(a.description,'acceptance description');
      if (ids.has(a.id)) throw new Error('Duplicate acceptance ID.'); ids.add(a.id);
      if (!['artifact','command','review'].includes(a.type)) throw new Error('Acceptance type must be artifact, command or review.');
      if (a.type === 'command') {
        requiredText(a.command,'validation command');
        if (!Array.isArray(a.args) || !a.args.every(x => typeof x === 'string')) throw new Error('Validation command args must be an explicit string array; no shell expansion.');
      }
    }
    if (c.domain === 'research' && !t.acceptance.some(a => a.type === 'review')) throw new Error(`Research task ${t.id} needs a scientific evidence review; process exit/artifact existence alone is insufficient.`);
  }
  if (owned.size !== deliverables.size) throw new Error('Every deliverable must have a writing owner.');
  const visiting = new Set(); const visited = new Set();
  const visit = id => {
    if (!tasks.has(id)) throw new Error(`Unknown dependency ${id}.`);
    if (visiting.has(id)) throw new Error('Dependency cycle.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of tasks.get(id).dependsOn) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of tasks.keys()) visit(id);
  for (const input of c.inputs) { requiredText(input.source,'input source'); if (input.path) requiredText(input.path,'input path'); }
  if (c.domain === 'research') {
    for (const key of ['question','estimand','dataProvenance','independentUnit','replication','controlsConfounding','primaryExploratory','analysis','leakage','uncertainty','provenanceToClaims','negativeResults']) {
      requiredText(c.protocol?.[key],`protocol.${key}`);
      if(c.layout==='layered'&&/^(?:N\/A|not applicable|\u4e0d\u9002\u7528|\u65e0)$/i.test(c.protocol[key].trim()))throw new Error(`BLOCKED: protocol.${key} needs a reason and suitable evidence when not applicable; see references/research.md.`);
    }
  }
  validateLayered(c);
  return c;
}
// Metadata only: include nested review documents and existing runtime evidence.
async function protectedIdentities(dir) {
  const identities=new Map();
  async function collect(directory) {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const file=path.join(directory,entry.name);
      if(entry.isSymbolicLink())continue; // Never follow unknown directory links.
      if(entry.isDirectory()){await collect(file);continue;}
      if(!entry.isFile())continue;
      const stat=await fs.stat(file,{bigint:true});
      if(stat.ino!==0n)identities.set(`${stat.dev}:${stat.ino}`,file);
      else if(stat.nlink>1n)throw new Error(`Protected file identity is unavailable for a multiply linked file: ${file}`);
    }
  }
  await collect(dir);return identities;
}
export function renderContract(c) {
  const version=templateVersion(c);
  if(version===4&&c.layout!=='layered')return `# Task harness: ${c.taskId} · revision ${c.revision}\n\nGoal: ${c.goal}\n\nDomain: ${c.domain}. Status: review required before formal work.\n\n## User review\n\nReview the complete contract below, including all inputs, outputs, dependencies, permissions, host policy, methods, acceptance and recovery boundaries. Approval binds only the current complete task ID, revision and digest. Silence or agent self-assessment is not approval. Changes to reviewed files or bound inputs require a revised review. Runtime records do not authenticate an operator or provide an OS sandbox. The current host must honor actual user authorization.\n\n## Reviewed host policy\n\n${JSON.stringify(executionPolicy(c))}\n\nOnly a reviewed allowed host may begin new work. Preserve the original host, mode and executor when closing an active run, even after approval becomes stale. Hosts have different tools and permission controls; selection grants no extra rights.\n\n## Execution and evidence\n\nThe selected host performs actual work; this shared runtime records contracts, execution identity and evidence. Dependencies must be currently verified. ${EXECUTION_SUMMARY} All mandatory outputs and acceptance criteria must pass before verified. Preserve negative and inconclusive findings, original facts and recovery evidence.\n\n## Complete machine contract\n\n\`\`\`json\n${JSON.stringify(c,null,2)}\n\`\`\`\n`;
  const executionSummary=version===1?'Exit zero means pending acceptance.':EXECUTION_SUMMARY;
  const executionOwner=version===3?'Codex executes; the harness runtime records contracts and evidence.':'Codex executes; Ruflo records contracts and evidence.';
  if(c.layout==='layered')return renderLayered(c);
  return `# Task harness: ${c.taskId} · revision ${c.revision}\n\nGoal: ${c.goal}\n\nDomain: ${c.domain}. Status: review required before formal work.\n\n## User review\n\nReview the complete contract below: scope, all deliverables, inputs, dependencies, permissions, skills, acceptance, assumptions, risks and stopping rules. Approval applies only to the current review digest. Reply approve, reject, or request a revision. Silence does not approve. Changes to this file, the contract, review attachments or bound file inputs invalidate approval.\n\nThe runtime records supplied user authorization; it does not authenticate user identity or enforce all permissions at the OS level. Native Codex must obey the user's actual authorization. No model may approve its own plan.\n\n## Execution and evidence\n\n${executionOwner} Dependency tasks must be verified before dependent execution. ${executionSummary} All declared outputs and acceptance criteria must pass before verified. Relevant artifact/receipt changes invalidate verification and downstream tasks. Negative and inconclusive findings are legitimate outcomes.\n\n## Complete machine contract\n\n\`\`\`json\n${JSON.stringify(c,null,2)}\n\`\`\`\n`;
}
export async function reviewSnapshot(project, dir, c) {
  validateContract(c);
  if ((await fs.readFile(path.join(dir,'HARNESS.md'),'utf8')) !== renderContract(c)) throw new Error('HARNESS.md differs from the machine contract. Run render, then review the regenerated complete package.');
  const files = [];
  for (const relative of ['contract.json','HARNESS.md',...await layeredReviewFiles(dir,c)]) {
    if (['state.json','.writer-lock'].includes(relative)) throw new Error('Mutable state is not a review attachment.');
    const file = await contained(dir, relative);
    files.push({ path: file, sha256: await digest(file), kind: 'review' });
  }
  const inputPaths=[];
  for (const input of c.inputs.filter(x=>x.path)) {
    const file = path.resolve(project, input.path);
    if (!(await fs.stat(file)).isFile()) throw new Error(`Bind a file or controlled manifest for input: ${input.path}`);
    const identity=await outputIdentity(file);
    if(identity.nlink>1n&&!identity.inode)throw new Error(`Input identity unavailable for multiply linked immutable input: ${input.path}`);
    inputPaths.push({...identity,key:pathKey(identity.file),id:input.source});
    const sha256 = await digest(file);
    if (input.sha256 && input.sha256 !== sha256) throw new Error(`Input digest mismatch: ${input.path}`);
    files.push({path:file,sha256,kind:'input'});
  }
  const outputPaths=[];const protectedFiles=await protectedIdentities(dir);
  for (const d of c.deliverables) {
    const output=await contained(project,d.path);
    if (output.startsWith(`${dir}${path.sep}`) || output===dir) throw new Error('Deliverables must not overwrite the runtime review/state/receipt directory.');
    const identity=await outputIdentity(output);
    if(identity.nlink>1n&&!identity.inode)throw new Error(`Output file identity is unavailable for a multiply linked file: ${d.path}`);
    if(identity.inode&&protectedFiles.has(identity.inode))throw new Error(`Output path conflict with protected runtime/review file: ${d.path} aliases ${protectedFiles.get(identity.inode)}.`);
    const control=pathKey(await fs.realpath(dir));const target=pathKey(identity.file);
    if(target===control || target.startsWith(control+path.sep)) throw new Error('Deliverables must not overwrite the runtime review/state/receipt directory.');
    for(const input of inputPaths)if(pathKey(identity.file)===input.key||(identity.inode&&identity.inode===input.inode))throw new Error(`Immutable input/output identity conflict: ${input.id} (${input.file}) and ${d.id} (${identity.file}).`);
    checkOutputPath(outputPaths,d.id,identity.file,identity.inode);
  }
  return files;
}
