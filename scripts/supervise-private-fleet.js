'use strict';
// Out-of-process crash supervisor for synthetic localhost-only app previews.
// Never sends people messages, calls external APIs, deploys, spends, or changes schedules.
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {parse}=require('./run-private-fleet-preview');
const CLI=path.join(__dirname,'run-private-fleet-preview.js');
const CHECKPOINT='.private-host-supervisor.json';
const fail=code=>{throw Error(code);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
function parseHost(args=process.argv.slice(2)){
 if(!Array.isArray(args)||!['--watch','--resume-watch','--exercise-crash'].includes(args[0]))
  fail('HOST_USAGE_INVALID');
 const mode=args[0],input=parse([mode==='--resume-watch'?'--resume':'--serve',...args.slice(1)]);
 if(input.portalPort!==0)fail('HOST_USAGE_INVALID'); // Stable external port is not authorized.
 return {...input,mode};
}
const sourceFlags=input=>['--document',input.sources.document,'--quote',input.sources.quote,
 '--inventory',input.sources.inventory,'--state-root',input.stateRoot];
function sanitizedReady(ready,input){
 if(!ready||ready.kind!=='local-private-app-portal'||ready.stateDirectory!==input.stateRoot||
  typeof ready.origin!=='string'||!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(ready.origin)||
  !Number.isSafeInteger(ready.appCount)||ready.appCount<3||ready.appCount>30||
  !Array.isArray(ready.applications)||ready.applications.length!==ready.appCount||
  !Array.isArray(ready.credentialFiles)||ready.credentialFiles.length!==ready.appCount||
  ready.releaseApproved!==false||ready.publicHostingEnabled!==false||
  ready.watchdogActive!==true||ready.automaticLocalRecovery!==true||ready.externalContacts!==0)
  fail('HOST_READY_INVALID');
 const ids=new Set(),origins=new Set([ready.origin]);
 for(let i=0;i<ready.appCount;i++){
  const row=ready.applications[i],secret=ready.credentialFiles[i];
  if(!row||!secret||!['document','quote','inventory'].includes(row.family)||
   !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(row.id)||
   row.id.length>60||row.family!==secret.family||row.id!==secret.id||
   typeof row.origin!=='string'||!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(row.origin)||
   typeof secret.file!=='string'||!path.isAbsolute(secret.file)||
   !secret.file.startsWith(input.stateRoot+path.sep)||
   !secret.file.endsWith(path.sep+'credentials.json'))
   fail('HOST_READY_INVALID');
  if(ids.has(row.family+':'+row.id)||origins.has(row.origin))fail('HOST_READY_INVALID');
  ids.add(row.family+':'+row.id);origins.add(row.origin);
 }
 return ready;
}
function startChild(input,{resume=false,timeoutMs=30000}={}){
 const command=resume?'--resume':'--serve',flags=[command,...sourceFlags(input)];
 const env={TZ:'UTC'};
 for(const key of ['PATH','SystemRoot','WINDIR','TMP','TEMP','TMPDIR'])
  if(process.env[key])env[key]=process.env[key];
 const child=spawn(process.execPath,[CLI,...flags],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 let completed=false,buf='',done=false;
 const completion=new Promise(resolve=>child.once('close',(code,signal)=>{completed=true;resolve({code,signal});}));
 const ready=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{
   if(done)return;done=true;child.kill('SIGKILL');reject(Error('HOST_BOOT_TIMEOUT'));
  },timeoutMs);
  const finish=(error,result)=>{
   if(done)return;done=true;clearTimeout(timeout);
   error?reject(error):resolve(result);
  };
  child.stdout.on('data',bytes=>{
   if(done)return;
   buf+=bytes.toString('utf8');
   if(buf.length>65536){finish(Error('HOST_UNEXPECTED_OUTPUT'));child.kill('SIGKILL');return;}
   const newline=buf.indexOf('\n');
   if(newline<0)return;
   let report;try{report=JSON.parse(buf.slice(0,newline));}
   catch{finish(Error('HOST_READY_INVALID'));child.kill('SIGKILL');return;}
   try{finish(null,sanitizedReady(report,input));}
   catch(error){finish(error);child.kill('SIGKILL');}
  });
  child.once('error',()=>finish(Error('HOST_CHILD_FAILED')));
  child.once('close',()=>finish(Error('HOST_CHILD_EXITED_EARLY')));
 });
 // Consume bounded child stderr, but do not echo it or any potential credentials.
 let stderrBytes=0;
 child.stderr.on('data',data=>{stderrBytes+=data.length;if(stderrBytes>131072)child.stderr.removeAllListeners('data');});
 return {child,ready,completion,isCompleted:()=>completed};
}
async function halt(handle){
 if(!handle||handle.isCompleted())return;
 handle.child.kill('SIGTERM');
 const done=await Promise.race([handle.completion.then(()=>true),wait(4500).then(()=>false)]);
 if(!done){handle.child.kill('SIGKILL');await handle.completion;}
}
function credentialFingerprint(ready){
 const rows=[];
 for(const row of ready.credentialFiles){
  const stat=fs.lstatSync(row.file);
  if(!stat.isFile()||stat.isSymbolicLink()||
    (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('HOST_SECRET_UNSAFE');
  rows.push({id:row.family+':'+row.id,sha256:crypto.createHash('sha256').update(fs.readFileSync(row.file)).digest('hex')});
 }
 return rows;
}
function safeStateRoot(stateRoot){
 let stat;try{stat=fs.lstatSync(stateRoot);}catch{fail('HOST_CHECKPOINT_MISSING');}
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(stateRoot)!==path.resolve(stateRoot)||
  (process.platform!=='win32'&&(stat.mode&0o077)!==0)||
  (typeof process.getuid==='function'&&stat.uid!==process.getuid()))fail('HOST_CHECKPOINT_UNSAFE');
 return stateRoot;
}
function hostIdentity(input){
 const root=safeStateRoot(input.stateRoot),reportFile=path.join(root,'preview-report.json');
 let stat,raw;try{stat=fs.lstatSync(reportFile);raw=fs.readFileSync(reportFile);}
 catch{fail('HOST_CHECKPOINT_SOURCE_INVALID');}
 if(!stat.isFile()||stat.isSymbolicLink()||raw.length<32||raw.length>262144||
  (process.platform!=='win32'&&(stat.mode&0o077)!==0)||
  (typeof process.getuid==='function'&&stat.uid!==process.getuid()))fail('HOST_CHECKPOINT_SOURCE_INVALID');
 return {stateRoot:path.resolve(root),sources:Object.fromEntries(['document','quote','inventory'].map(f=>{
   let real;try{real=fs.realpathSync(input.sources[f]);}catch{fail('HOST_CHECKPOINT_SOURCE_INVALID');}
   return [f,real];
  })),previewReportSha256:sha(raw)};
}
function bodyChecksum(body){
 const copy={...body};delete copy.integritySha256;return sha(JSON.stringify(copy));
}
function checkpointPath(input){return path.join(input.stateRoot,CHECKPOINT);}
function validateCheckpoint(value,input){
 if(!exact(value,['kind','schemaVersion','createdAt','updatedAt','maxRestarts','restartAttempts',
  'launchesStarted','status','identity','failures','integritySha256'])||
  value.kind!=='private-host-supervisor-checkpoint'||value.schemaVersion!==1||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt)||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.updatedAt)||
  !Number.isSafeInteger(value.maxRestarts)||value.maxRestarts<1||value.maxRestarts>3||
  !Number.isSafeInteger(value.restartAttempts)||value.restartAttempts<0||
  value.restartAttempts>value.maxRestarts||!Number.isSafeInteger(value.launchesStarted)||
  value.launchesStarted<1||!['watching','restarting','exhausted'].includes(value.status)||
  !Array.isArray(value.failures)||value.failures.length<value.restartAttempts||value.failures.length>4||
  typeof value.integritySha256!=='string'||value.integritySha256!==bodyChecksum(value)||
  JSON.stringify(value.identity)!==JSON.stringify(hostIdentity(input)))fail('HOST_CHECKPOINT_INVALID');
 for(const event of value.failures)if(!exact(event,['launcherOrdinal','observedAt','exitCode','signal'])||
  !Number.isSafeInteger(event.launcherOrdinal)||event.launcherOrdinal<1||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.observedAt)||
  !(event.exitCode===null||Number.isSafeInteger(event.exitCode))||
  !(event.signal===null||typeof event.signal==='string'&&/^[A-Z0-9]+$/.test(event.signal)))
  fail('HOST_CHECKPOINT_INVALID');
 if(value.status==='exhausted'&&value.restartAttempts!==value.maxRestarts)
  fail('HOST_CHECKPOINT_INVALID');
 return value;
}
function readCheckpoint(input,{required=true}={}){
 const filename=checkpointPath(input);let stat,raw;
 try{stat=fs.lstatSync(filename);raw=fs.readFileSync(filename,'utf8');}
 catch(error){if(!required&&error.code==='ENOENT')return null;fail('HOST_CHECKPOINT_MISSING');}
 if(!stat.isFile()||stat.isSymbolicLink()||Buffer.byteLength(raw)>65536||
  (process.platform!=='win32'&&(stat.mode&0o077)!==0)||
  (typeof process.getuid==='function'&&stat.uid!==process.getuid()))fail('HOST_CHECKPOINT_UNSAFE');
 let value;try{value=JSON.parse(raw);}catch{fail('HOST_CHECKPOINT_INVALID');}
 return validateCheckpoint(value,input);
}
function writeCheckpoint(input,value){
 safeStateRoot(input.stateRoot);
 const complete={...value,integritySha256:bodyChecksum(value)},filename=checkpointPath(input);
 const temporary=filename+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 let fd;
 try{
  fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(complete)+'\n');
  fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(temporary,filename);
  if(process.platform!=='win32')fs.chmodSync(filename,0o600);
  const dir=fs.openSync(input.stateRoot,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 }finally{if(fd!==undefined&&fd!==null)fs.closeSync(fd);fs.rmSync(temporary,{force:true});}
 return validateCheckpoint(complete,input);
}
function initialCheckpoint(input,maxRestarts){
 const now=new Date().toISOString();
 return writeCheckpoint(input,{kind:'private-host-supervisor-checkpoint',schemaVersion:1,
  createdAt:now,updatedAt:now,maxRestarts,restartAttempts:0,launchesStarted:1,
  status:'watching',identity:hostIdentity(input),failures:[]});
}
function updateCheckpoint(input,current,changes){
 return writeCheckpoint(input,{...current,...changes,updatedAt:new Date().toISOString(),integritySha256:undefined});
}
async function request(origin,route,{token,body,key,method='GET'}={}){
 if(!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin))fail('HOST_ENDPOINT_UNSAFE');
 const headers=token?{Authorization:'Bearer '+token}:{};
 if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=key;}
 const res=await fetch(origin+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
  signal:AbortSignal.timeout(5000)});
 let result;try{result=await res.json();}catch{fail('HOST_HTTP_INVALID');}
 return {status:res.status,body:result};
}
function credential(row){
 const c=JSON.parse(fs.readFileSync(row.file,'utf8'));
 if(!c||c.schemaVersion!==1||c.syntheticOnly!==true||c.family!==row.family||c.id!==row.id||
  !c.credentials||typeof c.credentials.operator!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(c.credentials.operator))
  fail('HOST_SECRET_UNSAFE');
 return c.credentials.operator;
}
async function seed(ready){
 const sorted=Object.fromEntries(['document','quote','inventory'].map(f=>[f,ready.applications.find(x=>x.family===f)]));
 const login=Object.fromEntries(['document','quote','inventory'].map(f=>[f,ready.credentialFiles.find(x=>x.family===f)]));
 if(Object.values(sorted).some(v=>!v)||Object.values(login).some(v=>!v))fail('HOST_FAMILIES_MISSING');
 const today=new Date().toISOString().slice(0,10),in3=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const doc=sorted.document,quote=sorted.quote,inventory=sorted.inventory;
 const docKey=credential(login.document),quoteKey=credential(login.quote),inventoryKey=credential(login.inventory);
 let result=await request(doc.origin,'/v1/workspaces/'+doc.id+'/commands',
  {token:docKey,method:'POST',key:'host-resume-document-001',
   body:{command:{type:'add',name:'Synthetic host-crash record',dueOn:today}}});
 if(result.status!==200)fail('HOST_STATE_SEED_FAILED');
 result=await request(quote.origin,'/v1/quotes',{token:quoteKey,method:'POST',key:'host-resume-quote-0001',
  body:{clientLabel:'Synthetic host-crash estimate',validUntil:in3}});
 if(result.status!==201)fail('HOST_STATE_SEED_FAILED');
 const before=await request(inventory.origin,'/v1/context',{token:inventoryKey});
 if(before.status!==200||!before.body.items?.length)fail('HOST_STATE_SEED_FAILED');
 const sku=before.body.items[0].sku;
 result=await request(inventory.origin,'/v1/command',{token:inventoryKey,method:'POST',
  key:'host-resume-stock-0001',body:{sku,command:{type:'receive',quantity:5},expectedRevision:1}});
 if(result.status!==200)fail('HOST_STATE_SEED_FAILED');
 return {sku};
}
async function verifyState(before,after,{sku}){
 if(before.appCount!==after.appCount)fail('HOST_CANDIDATE_DRIFT');
 const earlier=new Map(before.applications.map(v=>[v.family+':'+v.id,v]));
 for(const app of after.applications)if(!earlier.has(app.family+':'+app.id))fail('HOST_CANDIDATE_DRIFT');
 const a=Object.fromEntries(['document','quote','inventory'].map(f=>[f,after.applications.find(v=>v.family===f)]));
 const k=Object.fromEntries(['document','quote','inventory'].map(f=>[f,credential(after.credentialFiles.find(v=>v.family===f))]));
 const doc=await request(a.document.origin,'/v1/workspaces/'+a.document.id,{token:k.document});
 const quote=await request(a.quote.origin,'/v1/quotes',{token:k.quote});
 const inv=await request(a.inventory.origin,'/v1/context',{token:k.inventory});
 if(doc.status!==200||doc.body.records?.length!==1||
  quote.status!==200||quote.body.length!==1||
  inv.status!==200||inv.body.items?.find(v=>v.sku===sku)?.onHand!==5)
   fail('HOST_STATE_NOT_PRESERVED');
 for(const f of ['document','quote','inventory']){
  const app=a[f];const raw=f==='document'?'/v1/workspaces':f==='quote'?'/v1/quotes':'/v1/context';
  if((await request(app.origin,raw)).status!==401)fail('HOST_AUTH_BYPASS');
 }
}
async function exerciseCrash(input){
 if(input.mode!=='--exercise-crash')fail('HOST_USAGE_INVALID');
 let first=null,second=null;
 try{
  first=startChild(input);
  const previous=await first.ready;
  const secrets=credentialFingerprint(previous),seeded=await seed(previous);
  first.child.kill('SIGKILL');
  const exit=await first.completion;
  if(exit.signal!=='SIGKILL')fail('HOST_FAULT_NOT_INJECTED');
  second=startChild(input,{resume:true});
  const recovered=await second.ready;
  await verifyState(previous,recovered,seeded);
  if(JSON.stringify(secrets)!==JSON.stringify(credentialFingerprint(recovered)))fail('HOST_CREDENTIAL_CHANGED');
  return {kind:'unattended-private-host-crash-recovery',apps:recovered.appCount,
   killedLauncher:true,newLauncherBooted:true,sqliteRecordStatePreserved:true,
   sourcePackageIdentitiesUnchanged:true,syntheticCredentialHashesPreserved:true,
   tenantApiBoundariesVerified:true,privateLoopbackOnly:true,
   externalContacts:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,
   publicHostingEnabled:false,releaseApproved:false};
 }finally{await halt(second);await halt(first);}
}
async function watch(input,{maxRestarts=2,start=startChild,restartDelayMs=500}={}){
 if(!['--watch','--resume-watch'].includes(input.mode)||!Number.isSafeInteger(maxRestarts)||
  maxRestarts<1||maxRestarts>3||!Number.isSafeInteger(restartDelayMs)||restartDelayMs<0||restartDelayMs>5000)
  fail('HOST_USAGE_INVALID');
 let signalReceived=false,current=null,generation=0,checkpoint=null;
 if(input.mode==='--resume-watch'){
  checkpoint=readCheckpoint(input);
  if(checkpoint.status==='exhausted')fail('HOST_RESTART_BUDGET_EXHAUSTED');
  // The first launcher fixes the budget. A later process cannot raise it to
  // erase prior attempts (or silently reinterpret the existing checkpoint).
  maxRestarts=checkpoint.maxRestarts;
 }
 const terminate=()=>{signalReceived=true;current?.child.kill('SIGTERM');};
 process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
 try{
  let resume=input.mode==='--resume-watch';
  while(!signalReceived){
   current=start(input,{resume});
   const ready=await current.ready;
   generation++;
   if(checkpoint)checkpoint=updateCheckpoint(input,checkpoint,{status:'watching',
    launchesStarted:checkpoint.launchesStarted+1});
   else checkpoint=initialCheckpoint(input,maxRestarts);
   process.stdout.write(JSON.stringify({kind:'private-host-watch-ready',generation,
    pid:current.child.pid,origin:ready.origin,appCount:ready.appCount,
    resumed:resume,restartAttempts:checkpoint.restartAttempts,
    externalContacts:0,publicHostingEnabled:false,releaseApproved:false})+'\n');
   const exit=await current.completion;
   if(signalReceived)break;
   const failures=[...checkpoint.failures,{launcherOrdinal:checkpoint.launchesStarted,
    observedAt:new Date().toISOString(),exitCode:Number.isSafeInteger(exit.code)?exit.code:null,
    signal:typeof exit.signal==='string'&&/^[A-Z0-9]+$/.test(exit.signal)?exit.signal:null}];
   if(checkpoint.restartAttempts>=maxRestarts){
    checkpoint=updateCheckpoint(input,checkpoint,{status:'exhausted',failures});
    fail('HOST_RESTART_BUDGET_EXHAUSTED');
   }
   checkpoint=updateCheckpoint(input,checkpoint,{status:'restarting',failures,
    restartAttempts:checkpoint.restartAttempts+1});
   resume=true;
   await wait(restartDelayMs);
  }
  return {kind:'private-host-watch-stopped',generation,externalContacts:0,releaseApproved:false};
 }finally{
  await halt(current);
  process.off('SIGTERM',terminate);process.off('SIGINT',terminate);
 }
}
async function main(args=process.argv.slice(2)){
 const input=parseHost(args);
 return input.mode==='--exercise-crash'?exerciseCrash(input):watch(input);
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(()=>{
 console.error('Private host recovery held an unsafe or exhausted synthetic session; no external contact.');
 process.exitCode=1;
});
module.exports={parseHost,startChild,exerciseCrash,watch,main,readCheckpoint};
