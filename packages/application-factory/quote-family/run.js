'use strict';
// Local-development CLI. Secrets are written to private files, never output in logs.
const fs=require('node:fs'),path=require('node:path');
const {openStore}=require('./store'),{createServer}=require('./server');
const recipe=require('./recipe.json');
function argumentsFor(argv){
 if(!Array.isArray(argv)||argv.length<1||!['provision','serve','sweep'].includes(argv[0]))throw Error('USAGE_INVALID');
 const [command,...rest]=argv;if(rest.length%2)throw Error('USAGE_INVALID');
 const result=Object.create(null);
 for(let i=0;i<rest.length;i+=2){if(!['--state-dir','--tenant','--port'].includes(rest[i])||
  Object.hasOwn(result,rest[i])||!rest[i+1]||rest[i+1].startsWith('--'))throw Error('USAGE_INVALID');result[rest[i]]=rest[i+1];}
 if(!result['--state-dir']||!path.isAbsolute(result['--state-dir'])||
  (command==='provision'&&!result['--tenant'])||(command!=='provision'&&result['--tenant']))throw Error('USAGE_INVALID');
 if(command!=='serve'&&result['--port'])throw Error('USAGE_INVALID');
 return {command,opts:result};
}
async function main(argv=process.argv.slice(2)){
 const {command,opts}=argumentsFor(argv),state=path.resolve(opts['--state-dir']),rel=path.relative(__dirname,state);
 if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw Error('STATE_PATH_UNSAFE');
 fs.mkdirSync(state,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(state);if(!stat.isDirectory()||stat.isSymbolicLink()||
  fs.realpathSync(state).toLowerCase()!==state.toLowerCase()||
  (process.platform!=='win32'&&(stat.mode&0o077)))throw Error('STATE_PATH_UNSAFE');
 const store=openStore({filename:path.join(state,'quotes.sqlite'),recipe});let app;
 try{
  if(command==='provision'){
   const p=store.provision(opts['--tenant']);
   // Keys are generated once, separated by role; do not overwrite existing key files.
   const targets=[['operator',p.operatorToken],['reviewer',p.reviewerToken]];
   for(const [role,token] of targets){const filename=path.join(state,opts['--tenant']+'-'+role+'.json');
    const fd=fs.openSync(filename,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({tenant:p.tenant,role,token},null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   }
   return {tenant:p.tenant,rolesProvisioned:2,releaseApproved:false,credentialsPrinted:false};
  }
  if(command==='sweep')return store.sweep();
  const port=opts['--port']===undefined?8788:Number(opts['--port']);
  app=createServer({store});await app.listen(port);
  process.stdout.write(JSON.stringify({mode:'private-local-candidate',port:app.port(),releaseApproved:false})+'\n');
  const close=async()=>{await app.close();store.close();};
  process.once('SIGTERM',()=>{close().finally(()=>process.exit(0));});
  process.once('SIGINT',()=>{close().finally(()=>process.exit(0));});
  await new Promise(()=>{});
 }finally{if(command!=='serve')store.close();}
}
if(require.main===module)main().then(result=>console.log(JSON.stringify(result))).catch(()=>{
 console.error('Local quote app refused invalid state, access or unsupported operation.');process.exitCode=1;});
module.exports={main,argumentsFor};
