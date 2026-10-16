'use strict';
// Autonomous local synthetic fleet recovery. NEVER communicates outside loopback.
// Attests recovered package, reuses original private SQLite + credential identity,
// bounds restarts and quarantines unrepairable failures instead of reopening unsafe state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fail=code=>{throw Error(code);};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ID=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DIGEST=/^[a-f0-9]{64}$/;
const STATES=new Set(['pending','healthy','unhealthy','quarantined']);
const OUTCOMES=new Set(['pending','healthy','restored_same_state','recovery_failed',
 'restart_budget_exhausted']);
const local=url=>{
 if(typeof url!=='string')fail('SUPERVISOR_ENDPOINT_INVALID');
 let u;try{u=new URL(url);}catch{fail('SUPERVISOR_ENDPOINT_INVALID');}
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||
    u.pathname!=='/'||u.search||u.hash||!Number.isInteger(Number(u.port))||
    Number(u.port)<1||Number(u.port)>65535||u.origin!==url)fail('SUPERVISOR_ENDPOINT_INVALID');
 return u;
};
const paused=ms=>Number.isSafeInteger(ms)&&ms>=250&&ms<=3600000;
function createPrivateFleetSupervisor({fleet,maxRestarts=2,intervalMs=5000}={}){
 if(!fleet||!Array.isArray(fleet.apps)||fleet.apps.length<1||fleet.apps.length>30||
    typeof fleet.recover!=='function'||typeof fleet.stop!=='function'||
    !Number.isSafeInteger(maxRestarts)||maxRestarts<1||maxRestarts>3||
    !paused(intervalMs)||typeof fleet.stateRoot!=='string'||!path.isAbsolute(fleet.stateRoot))
  fail('SUPERVISOR_CONFIG_INVALID');
 const ids=new Set(),statuses=new Map();
 for(const app of fleet.apps){
  if(!['document','quote','inventory'].includes(app.family)||!ID.test(app.id)||app.id.length>60||
    !DIGEST.test(app.digest))
   fail('SUPERVISOR_CONFIG_INVALID');
  local(app.origin);
  const id=app.family+':'+app.id;
  if(ids.has(id))fail('SUPERVISOR_CONFIG_INVALID');
  ids.add(id);
  statuses.set(id,{family:app.family,id:app.id,sourceDigest:app.digest,
   status:'pending',restartAttempts:0,successfulRestarts:0,lastOutcome:'pending'});
 }
 const reportPath=path.join(fleet.stateRoot,'private-watchdog-report.json');
 let closed=false,busy=false,timer=null,cycle=0,probes=0,restartLimit=maxRestarts;
 function privateRoot(){
  let root;try{root=fs.lstatSync(fleet.stateRoot);}catch{fail('SUPERVISOR_STATE_UNSAFE');}
  if(!root.isDirectory()||root.isSymbolicLink()||
     fs.realpathSync(fleet.stateRoot)!==path.resolve(fleet.stateRoot)||
     (process.platform!=='win32'&&(root.mode&0o077)!==0))fail('SUPERVISOR_STATE_UNSAFE');
  return root;
 }
 function restoreCheckpoint(){
  privateRoot();
  if(!fs.existsSync(reportPath))return;
  let stat,report;
  try{
   stat=fs.lstatSync(reportPath);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>128*1024||
      (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('SUPERVISOR_CHECKPOINT_INVALID');
   report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  }catch(error){
   if(error?.message==='SUPERVISOR_CHECKPOINT_INVALID')throw error;
   fail('SUPERVISOR_CHECKPOINT_INVALID');
  }
  if(!report||typeof report!=='object'||Array.isArray(report))fail('SUPERVISOR_CHECKPOINT_INVALID');
  const {digest,...body}=report;
  if(!DIGEST.test(digest)||hash(body)!==digest||body.schemaVersion!==2||
    body.kind!=='private-autonomous-fleet-watchdog'||body.mode!=='synthetic-local-only'||
    !Number.isSafeInteger(body.restartLimit)||body.restartLimit<1||body.restartLimit>3||
    !Number.isSafeInteger(body.checks)||body.checks<0||
    !Number.isSafeInteger(body.probes)||body.probes<0||
    !Array.isArray(body.services)||body.services.length!==statuses.size||
    body.noPublicNetworkAccess!==true||body.externalContacts!==0||
    body.transmittedMessages!==0||body.externalOrders!==0||body.paymentsSent!==0||
    body.realCustomers!==null||body.collectedRevenue!==null||
    body.publicHostingEnabled!==false||body.releaseApproved!==false)
   fail('SUPERVISOR_CHECKPOINT_INVALID');
  const restored=new Map();
  for(const saved of body.services){
   if(!saved||typeof saved!=='object'||Array.isArray(saved)||
     Object.keys(saved).sort().join(',')!==
      'family,id,lastOutcome,restartAttempts,sourceDigest,status,successfulRestarts'||
     !['document','quote','inventory'].includes(saved.family)||!ID.test(saved.id)||
     !DIGEST.test(saved.sourceDigest)||!STATES.has(saved.status)||
     !OUTCOMES.has(saved.lastOutcome)||!Number.isSafeInteger(saved.restartAttempts)||
     saved.restartAttempts<0||saved.restartAttempts>body.restartLimit||
     !Number.isSafeInteger(saved.successfulRestarts)||saved.successfulRestarts<0||
     saved.successfulRestarts>saved.restartAttempts)
    fail('SUPERVISOR_CHECKPOINT_INVALID');
   const key=saved.family+':'+saved.id,current=statuses.get(key);
   if(!current||restored.has(key)||current.sourceDigest!==saved.sourceDigest)
    fail('SUPERVISOR_CHECKPOINT_INVALID');
   restored.set(key,{...saved});
  }
  const entries=[...restored.values()];
  if(body.healthy!==entries.filter(x=>x.status==='healthy').length||
    body.quarantined!==entries.filter(x=>x.status==='quarantined').length||
    body.recoveryAttempts!==entries.reduce((n,x)=>n+x.restartAttempts,0)||
    body.verifiedRecoveries!==entries.reduce((n,x)=>n+x.successfulRestarts,0))
   fail('SUPERVISOR_CHECKPOINT_INVALID');
  // The first supervisor fixes this session's budget. Later process
  // configuration is not authority to widen or reinterpret it.
  restartLimit=body.restartLimit;
  for(const [key,saved] of restored){
   // A completed quarantine and every consumed attempt survive supervisor restarts.
   if(saved.status==='quarantined'||saved.restartAttempts>=restartLimit){
    saved.status='quarantined';saved.lastOutcome='restart_budget_exhausted';
   }
   statuses.set(key,saved);
  }
  cycle=body.checks;probes=body.probes;
 }
 restoreCheckpoint();
 async function check(app){
  const u=local(app.origin);
  const response=await fetch(u.origin+'/health',{signal:AbortSignal.timeout(2000),
   cache:'no-store',headers:{Accept:'application/json'}});
  if(response.status!==200||response.headers.get('cache-control')!=='no-store')return false;
  const body=await response.json();
  return body.status==='ok'&&body.releaseApproved===false;
 }
 function snapshot(){
  const entries=[...statuses.values()].map(s=>({...s}));
  const body={schemaVersion:2,kind:'private-autonomous-fleet-watchdog',
   mode:'synthetic-local-only',restartLimit,checks:cycle,probes,
   services:entries,healthy:entries.filter(x=>x.status==='healthy').length,
   quarantined:entries.filter(x=>x.status==='quarantined').length,
   recoveryAttempts:entries.reduce((n,x)=>n+x.restartAttempts,0),
   verifiedRecoveries:entries.reduce((n,x)=>n+x.successfulRestarts,0),
   noPublicNetworkAccess:true,externalContacts:0,
   transmittedMessages:0,externalOrders:0,paymentsSent:0,
   realCustomers:null,collectedRevenue:null,publicHostingEnabled:false,releaseApproved:false};
  return {...body,digest:hash(body)};
 }
 function write(snapshot){
  privateRoot();
  if(fs.existsSync(reportPath)){
   const stat=fs.lstatSync(reportPath);
   if(!stat.isFile()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077)!==0))
    fail('SUPERVISOR_STATE_UNSAFE');
  }
  const temp=reportPath+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   const fd=fs.openSync(temp,'wx',0o600);
   try{fs.writeFileSync(fd,JSON.stringify(snapshot,null,2)+'\n');fs.fsyncSync(fd);}
   finally{fs.closeSync(fd);}
   fs.renameSync(temp,reportPath);
   if(process.platform!=='win32'){
    const dir=fs.openSync(fleet.stateRoot,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
   }
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }
 async function tick(){
  if(closed)fail('SUPERVISOR_STOPPED');
  if(busy)return {kind:'private-watchdog-tick-busy',skipped:true,externalContacts:0,releaseApproved:false};
  busy=true;
  try{
   cycle++;
   for(const s of statuses.values()){
    if(s.status==='quarantined')continue;
    const app=fleet.apps.find(x=>x.family===s.family&&x.id===s.id);
    if(!app||app.digest!==s.sourceDigest)fail('SUPERVISOR_SOURCE_DRIFT');
    let healthy=false;
    try{healthy=await check(app);}catch{}
    probes++;
    if(healthy){s.status='healthy';s.lastOutcome='healthy';continue;}
    if(s.restartAttempts>=restartLimit){
     s.status='quarantined';s.lastOutcome='restart_budget_exhausted';continue;
    }
    s.restartAttempts++;
    // Commit the consumed budget BEFORE attempting recovery. A supervisor crash
    // inside fleet.recover must not replay the attempt after restart.
    s.status='unhealthy';s.lastOutcome='pending';
    write(snapshot());
    try{
     const event=await fleet.recover(s.family,s.id);
     if(event.recovered!==true||event.sourceDigest!==s.sourceDigest||event.statePreserved!==true||
       event.releaseApproved!==false||event.localOnly!==true)fail('SUPERVISOR_RECOVERY_INVALID');
     const replacement=fleet.apps.find(x=>x.family===s.family&&x.id===s.id);
     if(!replacement||replacement.digest!==s.sourceDigest||!await check(replacement))
      fail('SUPERVISOR_RECOVERY_FAILED');
     s.successfulRestarts++;s.status='healthy';s.lastOutcome='restored_same_state';
    }catch(error){
     s.status=s.restartAttempts>=restartLimit?'quarantined':'unhealthy';
     s.lastOutcome='recovery_failed';
    }
   }
   const report=snapshot();write(report);
   return report;
  }finally{busy=false;}
 }
 function start(){
  if(closed||timer)fail('SUPERVISOR_ALREADY_RUNNING');
  timer=setInterval(()=>{tick().catch(()=>{/* No external messages: hold unhealthy service. */});},intervalMs);
  timer.unref();
  return {enabled:true,intervalMs,loopbackOnly:true,contactsSent:0};
 }
 function stop(){
  if(timer){clearInterval(timer);timer=null;}closed=true;
  return {stopped:true,externalContacts:0};
 }
 return Object.freeze({tick,start,stop,report:snapshot,reportPath});
}
module.exports={createPrivateFleetSupervisor};
