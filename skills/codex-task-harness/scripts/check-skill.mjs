#!/usr/bin/env node
// Deliberately checks this package's simple single-line metadata subset.
// It is not a general YAML parser or the upstream Python quick_validate tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const text=await fs.readFile(path.join(root,'SKILL.md'),'utf8');
const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
if(!match)throw new Error('Missing frontmatter.');
const data={};
for(const line of match[1].split(/\r?\n/)) {
  const pair=line.match(/^([a-z-]+): (.+)$/);if(!pair || Object.hasOwn(data,pair[1]))throw new Error('Unsupported or duplicate metadata; this checker accepts a simple single-line subset.');
  data[pair[1]]=pair[2].startsWith('"')?JSON.parse(pair[2]):pair[2];
}
if(Object.keys(data).some(k=>!['name','description','license'].includes(k)))throw new Error('Unexpected frontmatter field.');
if(!/^[a-z][a-z0-9-]{0,63}$/.test(data.name)||data.name!==path.basename(root))throw new Error('Invalid name/folder.');
if(typeof data.description!=='string'||!data.description.trim()||data.description.length>1024||/[<>]/.test(data.description))throw new Error('Invalid description.');
if(data.license!=='MIT')throw new Error('Expected MIT license.');
if(/^\s*\[TODO:[^\n]*\]\s*$/m.test(text))throw new Error('Unfinished scaffold.');
for(const m of text.matchAll(/\]\(([^)]+)\)/g))if(!/^[a-z]+:/i.test(m[1]))await fs.access(path.resolve(root,m[1]));
const yaml=await fs.readFile(path.join(root,'agents','openai.yaml'),'utf8');
const parsed={};let scope='';
for(const line of yaml.trim().split(/\r?\n/)) {
  const header=line.match(/^([a-z]+):$/);if(header){scope=header[1];parsed[scope]={};continue;}
  const p=line.match(/^  ([a-z_]+): (.+)$/);if(!p||!scope)throw new Error('Unsupported UI YAML structure.');
  parsed[scope][p[1]]=p[2]==='true'?true:p[2]==='false'?false:JSON.parse(p[2]);
}
if(parsed.policy?.allow_implicit_invocation!==true)throw new Error('Implicit invocation disabled.');
if(!parsed.interface?.default_prompt.includes(`$${data.name}`))throw new Error('Default prompt must name the skill.');
const n=Array.from(parsed.interface?.short_description??'').length;if(n<25||n>64)throw new Error('UI short description length.');
console.log(JSON.stringify({valid:true,checker:'portable single-line metadata/link/UI subset',name:data.name,descriptionCharacters:data.description.length,implicitInvocation:true,upstreamPythonValidatorRun:false},null,2));
