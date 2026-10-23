import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { exists } from './files.mjs';

export async function resolveCodex(explicit, {platform=process.platform,pathValue=process.env.PATH??''}={}) {
  const candidates = explicit ? [path.resolve(explicit)] : pathValue.split(path.delimiter).filter(Boolean).flatMap(dir => platform === 'win32' ? [path.join(dir,'codex.exe'),path.join(dir,'node_modules','@openai','codex','bin','codex.js'),path.join(dir,'codex.cmd')] : [path.join(dir,'codex')]);
  for (const file of candidates) {
    if (!(await exists(file))) continue;
    if (/\.(cmd|bat|ps1)$/i.test(file)) {
      const js=path.join(path.dirname(file),'node_modules','@openai','codex','bin','codex.js');
      if(platform==='win32' && await exists(js)) return {command:process.execPath,prefix:[js]};
      throw new Error('This shim has no adjacent npm Codex package. Supply the real local Codex executable or codex.js; shell shims are not executed.');
    }
    return /\.m?js$/i.test(file) ? {command:process.execPath,prefix:[file]} : {command:file,prefix:[]};
  }
  throw new Error('Local Codex executable not found. Install/configure it only with explicit user authorization; no automatic download is performed.');
}
export async function runProcess(command,args,{cwd,input='',log,timeoutMs,prepareInput,launchGuard}={}) {
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new Error('timeoutMs must be positive when specified.');
  if (typeof command !== 'string' || !Array.isArray(args) || !args.every(x=>typeof x==='string')) throw new Error('Use an executable and explicit argument array.');
  if(prepareInput!==undefined&&typeof prepareInput!=='function')throw new Error('prepareInput must be a function when specified.');
  if(launchGuard!==undefined&&typeof launchGuard!=='function')throw new Error('launchGuard must be a function when specified.');
  let handle;
  try { handle=await fs.open(log,'wx'); }
  catch(e) {e.processResult={processState:'not-started',code:null,exitCode:null,signal:null,error:e.message,errorStage:'log-open',timedOut:false,outputBytes:0};throw e;}
  const prepare=async()=>{if(prepareInput){input=await prepareInput();if(typeof input!=='string')throw new Error('Prepared execution input must be a string.');}};
  const beforeStartFailure=async(original)=>{
    const errors=[{stage:'prepare-input',message:original?.message??String(original)}];
    try{await handle.close();}catch(e){errors.push({stage:'log-close',message:e.message});}
    return Object.assign(new Error(errors.map(e=>`${e.stage}: ${e.message}`).join('; '),{cause:original}),{processResult:{processState:'not-started',pid:null,code:null,exitCode:null,signal:null,timedOut:false,outputBytes:0,controlErrors:[],errors,error:errors.map(e=>e.message).join('; '),errorStage:'prepare-input'}});
  };
  const start=()=>new Promise((resolve,reject)=>{
    let child,timer,started=false,finishing=false,timedOut=false,bytes=0,queue=Promise.resolve();
    const errors=[],controlErrors=[];
    const remember=(stage,e)=>errors.push({stage,message:e.message,code:e.code??null});
    const kill=()=>{try{if(child.kill('SIGKILL')===false)controlErrors.push({stage:'kill',message:'kill returned false'});}catch(e){controlErrors.push({stage:'kill',message:e.message,code:e.code??null});}};
    const append=data=>{if(finishing)return;bytes+=data.length;queue=queue.then(async()=>{try{let offset=0;while(offset<data.length){const {bytesWritten}=await handle.write(data,offset,data.length-offset);if(!bytesWritten)throw new Error('Log write made no progress');offset+=bytesWritten;}}catch(e){remember('log-write',e);kill();}});};
    // Only a never-started spawn failure or the actual close event can settle this promise.
    const finish=async(processState,exitCode,signal)=>{
      if(finishing)return;finishing=true;clearTimeout(timer);
      await queue;
      try{await handle.close();}catch(e){remember('log-close',e);}
      const result={processState,pid:child?.pid??null,code:timedOut?124:exitCode,exitCode,signal,timedOut,outputBytes:bytes,controlErrors,...(errors.length?{errors,error:errors.map(e=>`${e.stage}: ${e.message}`).join('; '),errorStage:errors[0].stage}:{})};
      if(errors.length){const e=new Error(result.error);e.processResult=result;reject(e);}else resolve(result);
    };
    const scheduleFinish=(...args)=>{void finish(...args).catch(e=>{e.processResult??={processState:started?'closed':'not-started',code:null,exitCode:args[1],signal:args[2],error:e.message,errorStage:'settle',timedOut,outputBytes:bytes,controlErrors};reject(e);});};
    try {child=spawn(command,args,{cwd,stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});}
    catch(e){remember('spawn',e);scheduleFinish('not-started',null,null);return;}
    child.on('spawn',()=>{started=true;});
    child.stdout.on('data',append);child.stderr.on('data',append);
    child.stdin.on('error',e=>{if(e.code!=='EPIPE')remember('stdin',e);});
    child.on('error',e=>{
      if(started||child.pid){controlErrors.push({stage:'process',message:e.message,code:e.code??null});return;}
      remember('spawn',e);scheduleFinish('not-started',null,null);
    });
    child.on('close',(code,signal)=>scheduleFinish(started||child.pid?'closed':'not-started',code,signal));
    try{child.stdin.end(input);}catch(e){remember('stdin',e);kill();}
    if(timeoutMs&&!finishing)timer=setTimeout(()=>{timedOut=true;kill();},timeoutMs);
  });
  if(!launchGuard){try{await prepare();}catch(e){throw await beforeStartFailure(e);}return start();}
  let observed,guardFailed=false,guardError;
  try{
    await launchGuard(async()=>{
      if(observed)throw new Error('Launch guard invoked more than once.');
      await prepare();
      // The synchronous spawn occurs while the runtime writer lock is still held.
      observed=start().then(value=>({value}),error=>({error}));
    });
  }catch(e){guardFailed=true;guardError=e;}
  if(!observed)throw await beforeStartFailure(guardError);
  // Observe actual close even when releasing the launch lock failed; attach rejection immediately.
  const settled=await observed;
  if(guardFailed){
    const actual=settled.error?.processResult??settled.value??{processState:'unknown-active',code:null};
    throw Object.assign(new Error(`Launch guard/cleanup failed: ${guardError?.message??String(guardError)}`,{cause:guardError}),{processResult:{...actual,error:[actual.error,`launch-guard: ${guardError?.message??String(guardError)}`].filter(Boolean).join('; '),errorStage:actual.errorStage??'launch-guard'},launchGuardError:guardError,...(settled.error?{processError:settled.error}:{})});
  }
  if(Object.hasOwn(settled,'error'))throw settled.error;
  return settled.value;
}
