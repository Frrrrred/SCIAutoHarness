// SYNTHETIC fixture only. Uses Node plus installed Python stdlib zipfile; no model/network/install.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const [mode,project,layout='members',variant='complete']=process.argv.slice(2);
assert.ok(path.isAbsolute(project));
const members={
 'code/prepare.mjs':`import fs from 'node:fs/promises';import path from 'node:path';export default async function(p){const raw=JSON.parse(await fs.readFile(path.join(p,'raw.json'),'utf8'));const c=JSON.parse(await fs.readFile(path.join(p,'config/analysis.json'),'utf8'));await fs.mkdir(path.join(p,'data'),{recursive:true});await fs.writeFile(path.join(p,'data/clean.csv'),'x,y\\n'+raw.map(x=>x+','+(x*c.factor)).join('\\n')+'\\n');}\n`,
 'code/analyze.mjs':`import fs from 'node:fs/promises';import path from 'node:path';export default async function(p){const rows=(await fs.readFile(path.join(p,'data/clean.csv'),'utf8')).trim().split('\\n').slice(1);const sum=rows.reduce((s,r)=>s+Number(r.split(',')[1]),0);await fs.mkdir(path.join(p,'results'),{recursive:true});await fs.writeFile(path.join(p,'results/summary.json'),JSON.stringify({sum})+'\\n');}\n`,
 'config/analysis.json':'{"factor":2}\n'
};
const python=(code,args)=>execFileSync('python',['-B','-X','utf8','-c',code,...args],{cwd:project,encoding:'utf8',timeout:10000,windowsHide:true,shell:false});
async function put(base,values){for(const [name,text]of Object.entries(values)){const file=path.join(base,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);}}
async function load(){
 if(layout==='members'){const values={};for(const n of Object.keys(members))values[n]=await fs.readFile(path.join(project,n),'utf8');return values;}
 const archive=path.join(project,'packages/code.zip');
 const code="import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n names=z.namelist()\n assert len(names)==len(set(names)), 'duplicate archive member'\n expected=json.loads(sys.argv[2])\n assert set(names)==set(expected), 'missing or unexpected archive members'\n print(json.dumps({n:z.read(n).decode('utf-8') for n in names}))";
 return JSON.parse(python(code,[archive,JSON.stringify(Object.keys(members))]));
}
if(mode==='build-code'){
 if(layout==='members')await put(project,members);
 else {const stage=path.join(project,'.build-code');await put(stage,members);await fs.mkdir(path.join(project,'packages'),{recursive:true});const names=Object.keys(members).filter(n=>variant!=='missing'||!n.endsWith('analyze.mjs'));python("import json,sys,zipfile,pathlib\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n for n in json.loads(sys.argv[3]): z.write(pathlib.Path(sys.argv[2])/n,n)",[path.join(project,'packages/code.zip'),stage,JSON.stringify(names)]);}
}else if(mode==='verify-code'){
 const values=await load();assert.deepEqual(values,members);const stage=path.join(project,'.checked-code');await put(stage,values);for(const n of ['code/prepare.mjs','code/analyze.mjs'])assert.equal(typeof(await import(pathToFileURL(path.join(stage,n)).href)).default,'function');
}else if(mode==='prepare'||mode==='analyze'){
 const values=await load();assert.deepEqual(values,members);const stage=path.join(project,'.consumed-code');await put(stage,values);
 // Config consumed by the actual versioned preparation program is copied byte-exactly from the checked member.
 if(layout==='archive')await put(project,{'config/analysis.json':values['config/analysis.json']});
 await (await import(pathToFileURL(path.join(stage,'code',mode==='prepare'?'prepare.mjs':'analyze.mjs')).href)).default(project);
}else if(mode==='verify-data')assert.equal(await fs.readFile(path.join(project,'data/clean.csv'),'utf8'),'x,y\n1,2\n2,4\n3,6\n');
else if(mode==='verify-analysis')assert.deepEqual(JSON.parse(await fs.readFile(path.join(project,'results/summary.json'),'utf8')),{sum:12});
else throw new Error('Unknown synthetic mode');
console.log(JSON.stringify({synthetic:true,mode,layout}));
