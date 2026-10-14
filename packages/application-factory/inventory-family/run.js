'use strict';
// Run a self-contained local inventory app. Never exposes a public listener or external purchasing.
const fs=require('node:fs'),path=require('node:path');
const {openStore}=require('./store'),{createServer}=require('./server');
const recipe=require('./recipe.json');
const fail=code=>{throw Error(code);};
function privateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))fail('STATE_PATH_UNSAFE');
 const root=path.resolve(dir),relative=path.relative(__dirname,root);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('STATE_PATH_UNSAFE');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const s=fs.lstatSync(root),real=fs.realpathSync(root);
 if(!s.isDirectory()||s.isSymbolicLink()||real.toLowerCase()!==root.toLowerCase()||
   (process.platform!=='win32'&&(s.mode&0o077)!==0))fail('STATE_PATH_UNSAFE');
 return root;
}
function args(raw){
 const [action,...rest]=raw;
 if(!['serve','provision','sweep'].includes(action)||rest.length%2)fail('USAGE_INVALID');
 const values={};for(let i=0;i<rest.length;i+=2){
  const key=rest[i],value=rest[i+1];
  if(!['--state-dir','--tenant','--port'].includes(key)||Object.hasOwn(values,key)||
     typeof value!=='string'||!value||value.startsWith('--'))fail('USAGE_INVALID');
  values[key]=value;
 }
 if(!values['--state-dir']||action==='provision'&&!values['--tenant']||
    action!=='provision'&&values['--tenant']||action!=='serve'&&values['--port'])fail('USAGE_INVALID');
 return {action,values};
}
async function main(argv=process.argv.slice(2)){
 const {action,values}=args(argv),dir=privateDir(values['--state-dir']);
 const store=openStore({filename:path.join(dir,'inventory.sqlite'),recipe});
 let server=null;
 try{
  if(action==='provision'){
   const tenant=values['--tenant'],prefix=tenant.replace(/[^a-z0-9-]/g,'');
   if(prefix!==tenant||!prefix||prefix.length>60)fail('TENANT_INVALID');
   const operatorFile=path.join(dir,prefix+'-operator.json'),reviewerFile=path.join(dir,prefix+'-reviewer.json');
   if(fs.existsSync(operatorFile)||fs.existsSync(reviewerFile))fail('CREDENTIAL_EXISTS');
   const credentials=store.provision(tenant);
   for(const [filename,role,key] of [[operatorFile,'operator',credentials.operatorKey],
     [reviewerFile,'reviewer',credentials.reviewerKey]]){
    const fd=fs.openSync(filename,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({tenantId:tenant,role,accessKey:key},null,2)+'\n');fs.fsyncSync(fd);}
    finally{fs.closeSync(fd);}
   }
   return {mode:'local-synthetic',tenantId:tenant,credentialFilesCreated:2,
    credentialsPrinted:false,releaseApproved:false};
  }
  if(action==='sweep')return store.sweep();
  const port=values['--port']===undefined?8791:Number(values['--port']);
  if(!Number.isSafeInteger(port)||port<1||port>65535)fail('PORT_INVALID');
  server=createServer({store,pollMs:60000,automation:true});
  await server.listen({port});
  // Stay listening until explicitly terminated. No PID/background service is installed.
  await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
  return {mode:'local-only',releaseApproved:false};
 }finally{await server?.close();store.close();}
}
if(require.main===module)main().then(v=>{console.log(JSON.stringify(v));}).catch(()=>{
 console.error('Inventory candidate refused invalid or unsafe local operation. No external purchase was placed.');
 process.exitCode=1;
});
module.exports={main};
