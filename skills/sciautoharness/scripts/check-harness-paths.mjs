import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const within=(root,file)=>{const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
const absolute=p=>path.isAbsolute(p)||path.win32.isAbsolute(p);
const pathLike=s=>absolute(s)||/^(?:\.{1,2}[\\/])/.test(s)||/^[^\s`]+[\\/][^`]+\.[\p{L}\p{N}]+$/u.test(s)||/^[^\s`]+\.[\p{L}\p{N}]{1,12}$/u.test(s);

// Deliberately bounded local-path lint, not a general Markdown parser or authorization system.
export async function checkHarnessPaths({project,package:packageDir,planned=[],allowRoots=[]}){
 const result={ok:false,documents:0,checked:[],issues:[],uncovered:[],remoteLinksSkipped:0,limitation:'Checks inline Markdown file links and unambiguous single-backtick paths outside fenced examples. No remote fetch, anchor validation, source-content inspection or semantic approval. Unsupported reference syntax is reported, not certified.'};
 const issue=(code,extra)=>result.issues.push({code,...extra});
 project=path.resolve(project);packageDir=path.resolve(packageDir);
 let realProject,realPackage;
 try{realProject=await fs.realpath(project);realPackage=await fs.realpath(packageDir);}catch(e){issue('INVALID_PACKAGE',{message:e.message});return result;}
 if(!within(project,packageDir)||!within(realProject,realPackage)){issue('INVALID_PACKAGE',{path:packageDir,message:'Package must be inside the explicit project.'});return result;}
 const roots=[realProject];
 for(const r of allowRoots)roots.push(await fs.realpath(path.resolve(r)));
 const plannedPaths=new Set();
 for(const p of planned){const target=path.resolve(project,p);if(!within(project,target)){issue('OUTSIDE_SCOPE',{reference:p,resolved:target});continue;}plannedPaths.add(target);}
 const seen=new Set();const docs=[];
 async function collect(dir){
  const real=await fs.realpath(dir);
  if(!within(realPackage,real)){issue('OUTSIDE_DOCUMENT_PACKAGE',{path:dir});return;}
  if(seen.has(real)){issue('DOCUMENT_ALIAS',{path:dir});return;}seen.add(real);
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);let stat;
   try{stat=await fs.stat(file);}catch(e){issue('UNREADABLE_DOCUMENT',{path:file,message:e.message});continue;}
   if(stat.isDirectory()){await collect(file);continue;}
   if(!file.endsWith('.md'))continue;
   const realFile=await fs.realpath(file);
   if(!within(realPackage,realFile)){issue('OUTSIDE_DOCUMENT_PACKAGE',{path:file});continue;}
   if(seen.has(realFile)){issue('DOCUMENT_ALIAS',{path:file});continue;}seen.add(realFile);docs.push(file);
  }
 }
 await collect(packageDir);
 if(!docs.length)issue('NO_DOCUMENTS',{path:packageDir});
 async function reference(document,line,raw){
  let value=raw.trim();const row={document,line,reference:value};
  if(/^(?:https?:|mailto:|data:)/i.test(value)){result.remoteLinksSkipped++;return;}
  if(value.startsWith('#'))return;
  if(/[<>{}*?]/.test(value)||/^[a-z][a-z0-9+.-]*:/i.test(value)&&!absolute(value)){result.uncovered.push({...row,reason:'Template, wildcard or unsupported URI syntax.'});return;}
  value=value.split('#')[0];
  try{value=decodeURIComponent(value);}catch{result.uncovered.push({...row,reason:'Invalid percent encoding.'});return;}
  const resolved=absolute(value)?path.resolve(value):path.resolve(path.dirname(document),value.replaceAll('\\',path.sep));row.resolved=resolved;
  // Resolve the nearest existing ancestor before any read, including future outputs via linked parents.
  let ancestor=resolved;
  while(true){try{await fs.lstat(ancestor);break;}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR'){issue('UNREADABLE_PATH',{...row,message:e.message});return;}const parent=path.dirname(ancestor);if(parent===ancestor){issue('OUTSIDE_SCOPE',row);return;}ancestor=parent;}}
  let real;try{real=await fs.realpath(ancestor);}catch(e){issue('UNREADABLE_PATH',{...row,message:e.message});return;}
  if(!roots.some(root=>within(root,real))){issue('OUTSIDE_SCOPE',row);return;}
  if(plannedPaths.has(resolved)){result.checked.push({...row,status:'planned'});return;}
  try{await fs.stat(resolved);result.checked.push({...row,status:'exists'});}catch(e){issue(e.code==='ENOENT'||e.code==='ENOTDIR'?'MISSING_PATH':'UNREADABLE_PATH',{...row,...(e.code==='ENOENT'||e.code==='ENOTDIR'?{}:{message:e.message})});}
 }
 for(const document of docs){
  result.documents++;const lines=(await fs.readFile(document,'utf8')).split(/\r?\n/);let fence=null;
  for(let i=0;i<lines.length;i++){
   let line=lines[i];const marker=line.match(/^\s*(`{3,}|~{3,})/);
   if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;continue;}if(fence)continue;
   if(/^\s*\[[^\]]+\]:/.test(line)||/\[[^\]]+\]\[[^\]]*\]/.test(line)){result.uncovered.push({document,line:i+1,reason:'Reference-style links are not covered; use explicit inline file links.'});continue;}
   const links=[...line.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))\s*\)/g)];
   for(const m of links)await reference(document,i+1,m[1]??m[2]);
   line=line.replace(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))\s*\)/g,'');
   if(/!?\[[^\]]*\]\(/.test(line))result.uncovered.push({document,line:i+1,reason:'Unsupported inline link form; use [label](<literal path>) without a title.'});
   for(const m of line.matchAll(/(?<!`)`([^`\r\n]+)`(?!`)/g)){const value=m[1];if(pathLike(value))await reference(document,i+1,value);}
  }
  if(fence)result.uncovered.push({document,line:lines.length,reason:'Unclosed fenced example.'});
 }
 result.ok=result.issues.length===0&&result.uncovered.length===0;return result;
}
export async function main(args){
 const o={planned:[],allowRoots:[]};
 for(let i=0;i<args.length;i++){const key=args[i],v=args[++i];if(!v)throw Error(`Missing value for ${key}`);if(key==='--planned')o.planned.push(v);else if(key==='--allow-root')o.allowRoots.push(v);else if(key==='--project'&&!o.project)o.project=v;else if(key==='--package'&&!o.package)o.package=v;else throw Error(`Unknown or repeated option ${key}`);}
 if(!o.project||!o.package)throw Error('Use --project ABSOLUTE_PROJECT --package ABSOLUTE_PACKAGE [--planned PROJECT_RELATIVE_OUTPUT] [--allow-root EXPLICITLY_AUTHORIZED_ROOT].');
 if(!absolute(o.project)||!absolute(o.package))throw Error('Project and package must be explicit absolute paths.');
 const r=await checkHarnessPaths(o);console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.log(JSON.stringify({ok:false,issues:[{code:'INVALID_ARGUMENTS',message:e.message}]}));process.exitCode=1;});
