// SYNTHETIC strict local child. Never imports an agent package or calls a model.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const expected=JSON.parse(await fs.readFile(path.join(process.cwd(),'host-child-expectations.json'),'utf8'));
const argv={
 'codex':['exec','--sandbox','workspace-write','-c','approval_policy="on-request"','--skip-git-repo-check','--json','-'],
 'claude-code':['-p'],
 'deepseek-harness':['--profile','headless','--json','-']
};
assert.ok(Object.hasOwn(argv,expected.host),'Explicit synthetic host is required.');
assert.deepEqual(process.argv.slice(2),argv[expected.host]);
assert.equal(path.resolve(process.cwd()),path.resolve(expected.cwd));
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=Buffer.concat(chunks),text=input.toString('utf8');
assert.ok(text.includes('SYNTHETIC'));
assert.ok(text.includes('runId')&&text.includes('review digest'));
await fs.writeFile(path.join(process.cwd(),'host-child-observed.json'),JSON.stringify({host:expected.host,argv:process.argv.slice(2),cwd:process.cwd(),input:text,inputBytes:input.length,inputSha256:createHash('sha256').update(input).digest('hex'),stdinEof:true},null,2)+'\n');
if(expected.delayMs)await new Promise(resolve=>setTimeout(resolve,expected.delayMs));
if(expected.emitArtifact!==false){await fs.mkdir('out',{recursive:true});await fs.writeFile('out/a.txt','SYNTHETIC strict child artifact\n');}
if(expected.stderrNoise)process.stderr.write('SYNTHETIC stderr diagnostic\n');
if(expected.host==='deepseek-harness'){
 const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
 write({type:'session',sessionId:'SYNTHETIC-session',cwd:process.cwd()});
 if(expected.outputMode==='malformed')process.stdout.write('SYNTHETIC invalid JSON\n');
 else if(expected.outputMode==='error-event')write({type:'error',message:'SYNTHETIC direct driver error'});
 else {
  write({type:'status',phase:'turn_end',turn:1,reason:{kind:expected.outputMode==='failed-final'?'error':'completed'}});
  if(expected.outputMode==='unfinished-turn')write({type:'status',phase:'turn_start',turn:2});
  if(expected.outputMode!=='missing-final'){
   const final=JSON.stringify({type:'final',text:'SYNTHETIC \u4e2d\u6587 final answer'});
   if(expected.outputMode==='chunked')for(const byte of Buffer.from(final+'\n'))process.stdout.write(Buffer.from([byte]));
   else process.stdout.write(final+(expected.outputMode==='no-newline'?'':'\n'));
  }
 }
}else process.stdout.write(JSON.stringify({type:'result',text:'SYNTHETIC completed'})+'\n');
process.exitCode=expected.exitCode??0;
