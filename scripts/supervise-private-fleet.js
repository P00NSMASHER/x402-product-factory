'use strict';
// Out-of-process crash supervisor for synthetic localhost-only app previews.
// Never sends people messages, calls external APIs, deploys, spends, or changes schedules.
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {parse}=require('./run-private-fleet-preview');
const CLI=path.join(__dirname,'run-private-fleet-preview.js');
const fail=code=>{throw Error(code);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
async function watch(input,{maxRestarts=2}={}){
 if(!['--watch','--resume-watch'].includes(input.mode)||!Number.isSafeInteger(maxRestarts)||
  maxRestarts<1||maxRestarts>3)fail('HOST_USAGE_INVALID');
 let signalReceived=false,current=null,generation=0;
 const terminate=()=>{signalReceived=true;current?.child.kill('SIGTERM');};
 process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
 try{
  let resume=input.mode==='--resume-watch';
  while(!signalReceived){
   current=startChild(input,{resume});
   const ready=await current.ready;
   generation++;
   process.stdout.write(JSON.stringify({kind:'private-host-watch-ready',generation,
    pid:current.child.pid,origin:ready.origin,appCount:ready.appCount,
    resumed:resume,externalContacts:0,publicHostingEnabled:false,releaseApproved:false})+'\n');
   await current.completion;
   if(signalReceived)break;
   if(generation>maxRestarts)fail('HOST_RESTART_BUDGET_EXHAUSTED');
   resume=true;
   await wait(500);
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
module.exports={parseHost,startChild,exerciseCrash,watch,main};
