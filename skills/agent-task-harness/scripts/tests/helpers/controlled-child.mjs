// SYNTHETIC local diagnostic helper: never calls a model, network, shell or another child.
const mode=process.argv[2]??'echo';
if(mode==='wait'){console.log('SYNTHETIC ready');setInterval(()=>{},1000);}
else if(mode==='barrier'){
  const fs=await import('node:fs/promises'),path=await import('node:path');
  const [ready,release]=process.argv.slice(3);
  for(const file of [ready,release]){const rel=path.relative(process.cwd(),path.resolve(file));if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('SYNTHETIC barrier files must be inside the test cwd');}
  process.stdin.resume();
  await fs.writeFile(ready,JSON.stringify({synthetic:true,pid:process.pid})+'\n',{flag:'wx'});console.log('SYNTHETIC barrier ready');
  let checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{await fs.access(release);clearInterval(timer);console.log('SYNTHETIC barrier released');}catch(e){if(e.code!=='ENOENT'){clearInterval(timer);console.error(e);process.exitCode=1;}}finally{checking=false;}},10);
}
else if(mode==='exec'||mode==='eof'){
  let bytes=0;process.stdin.on('data',b=>{bytes+=b.length;});
  process.stdin.on('end',()=>{console.log(JSON.stringify({synthetic:true,stdinBytes:bytes}));});
} else {process.stdout.write('SYNTHETIC stdout\n');process.stderr.write('SYNTHETIC stderr\n');if(mode==='fail')process.exitCode=7;}
