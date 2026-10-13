'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {planRecovery}=require('./supervisor');
const {verifyApplication}=require('../manufacturing/assembler');
const ROOT=path.resolve(__dirname,'../../..'),EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const fail=code=>{throw Error(code);};
const exists=p=>{try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function privateDir(p,create=false){
 if(typeof p!=='string'||!path.isAbsolute(p))fail('CHECKPOINT_PATH_UNSAFE');
 const resolved=path.resolve(p);if(create)fs.mkdirSync(resolved,{recursive:true,mode:0o700});
 const st=fs.lstatSync(resolved),actual=fs.realpathSync(resolved);
 if(!st.isDirectory()||st.isSymbolicLink()||actual.toLowerCase()!==resolved.toLowerCase()||
    (process.platform!=='win32'&&(st.mode&0o077)))fail('CHECKPOINT_PATH_UNSAFE');
 return resolved;
}
function privateFile(p,max=65536){
 const st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>max||
    (process.platform!=='win32'&&(st.mode&0o077)))fail('CHECKPOINT_INVALID');
 return fs.readFileSync(p);
}
function sameOrAbsent(from,to){
 if(!exists(to))return false;
 if(digest(privateFile(from,1024*1024))!==digest(privateFile(to,1024*1024)))fail('CHECKPOINT_CONFLICT');
 return true;
}
function restoreCheckpoint({sourceRoot,outputRoot,maxCycles=32,blueprintDirectory}={}){
 if(!Number.isSafeInteger(maxCycles)||maxCycles<1||maxCycles>32)fail('CHECKPOINT_CONFIG_INVALID');
 const source=privateDir(sourceRoot);
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))fail('CHECKPOINT_PATH_UNSAFE');
 const relative=path.relative(ROOT,path.resolve(outputRoot));
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('CHECKPOINT_PATH_UNSAFE');
 const output=privateDir(outputRoot,true);
 if(source===output)fail('CHECKPOINT_PATH_UNSAFE');
 const report={kind:'autonomous-checkpoint-restore',verifiedImports:0,alreadyPresent:0,skippedFixtures:0,
  skippedQuarantined:0,skippedStale:0,cyclesRestored:[],transmittedMessages:0,paymentsSent:0,
  outreachEnabled:false,realCustomers:null,collectedRevenue:null,releaseApproved:false};
 const state=path.join(source,'autonomy');if(!exists(state))return report;privateDir(state);
 const lock=path.join(output,'.checkpoint-import.lock');let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('CHECKPOINT_BUSY');throw e;}
 try{
  const names=fs.readdirSync(state).filter(n=>/^cycle-(0|[1-9]\d{0,5})\.json$/.test(n));
  const cycles=names.map(n=>Number(n.slice(6,-5))).sort((a,b)=>a-b).slice(-maxCycles);
  const pending=[];let total=0;
  for(const cycle of cycles){
   const receipt=path.join(state,'cycle-'+cycle+'.json');let body;
   try{body=JSON.parse(privateFile(receipt,24000));}catch{fail('CHECKPOINT_INVALID');}
   let status;
   try{
    const r=planRecovery({at:new Date(EPOCH+cycle*SLOT).toISOString(),outputRoot:source,
      windowCycles:1,blueprintDirectory});
    status=r.skippedCompleted?'verified':r.skippedQuarantined?'quarantined':
      r.nextAction==='requires_real_acceptance'?'fixture':r.missingIdeas?'stale':'invalid';
   }catch(e){status=e.message==='RECOVERY_SOURCE_DRIFT'?'stale':'invalid';}
   if(status==='invalid')fail('CHECKPOINT_INVALID');
   if(status!=='verified'){report[status==='quarantined'?'skippedQuarantined':
      status==='fixture'?'skippedFixtures':'skippedStale']++;continue;}
   if(!Array.isArray(body.artifacts)||body.artifacts.length!==1)fail('CHECKPOINT_INVALID');
   const artifact=body.artifacts[0].artifact,hash=body.artifacts[0].digest;
   if(typeof artifact!=='string'||!/^[-a-z0-9]{2,130}-[a-f0-9]{64}$/.test(artifact)||
     typeof hash!=='string'||artifact!==body.artifacts[0].id+'-'+hash)fail('CHECKPOINT_INVALID');
   const appSource=path.join(source,artifact),appDest=path.join(output,artifact);
   privateDir(appSource);try{verifyApplication(appSource,hash);}catch{fail('CHECKPOINT_INVALID');}
   const files=JSON.parse(privateFile(path.join(appSource,'manifest.json'))).files;
   for(const name of Object.keys(files)){const st=fs.lstatSync(path.join(appSource,name));
     if(!st.isFile()||st.isSymbolicLink())fail('CHECKPOINT_INVALID');total+=st.size;
   }
   if(total>12*1024*1024)fail('CHECKPOINT_TOO_LARGE');
   const proofSource=path.join(source,'verification',artifact+'.json'),
     proofDest=path.join(output,'verification',artifact+'.json'),
     receiptDest=path.join(output,'autonomy','cycle-'+cycle+'.json');
   privateFile(proofSource);if(exists(appDest))try{verifyApplication(appDest,hash);}catch{fail('CHECKPOINT_CONFLICT');}
   const p=exists(proofDest)?sameOrAbsent(proofSource,proofDest):false,
     q=exists(receiptDest)?sameOrAbsent(receipt,receiptDest):false;
   pending.push({cycle,appSource,appDest,hash,proofSource,proofDest,receipt,receiptDest,
     already:exists(appDest)&&p&&q});
  }
  privateDir(path.join(output,'autonomy'),true);privateDir(path.join(output,'verification'),true);
  for(const item of pending){
   if(item.already){report.alreadyPresent++;continue;}
   const stage=fs.mkdtempSync(path.join(output,'.checkpoint-stage-'));
   try{
    if(!exists(item.appDest)){
     const candidate=path.join(stage,'app');fs.cpSync(item.appSource,candidate,{recursive:true,dereference:false});
     verifyApplication(candidate,item.hash);
     if(exists(item.appDest))fail('CHECKPOINT_CONFLICT');
     fs.renameSync(candidate,item.appDest);
    }
    for(const [sourceFile,target] of [[item.proofSource,item.proofDest],[item.receipt,item.receiptDest]]){
     if(!exists(target)){
      const temp=path.join(stage,crypto.randomBytes(8).toString('hex'));
      fs.copyFileSync(sourceFile,temp,fs.constants.COPYFILE_EXCL);
      if(digest(privateFile(temp))!==digest(privateFile(sourceFile)))fail('CHECKPOINT_INVALID');
      if(exists(target))fail('CHECKPOINT_CONFLICT');
      fs.renameSync(temp,target);
     }
    }
    report.verifiedImports++;report.cyclesRestored.push(item.cycle);
   }finally{fs.rmSync(stage,{recursive:true,force:true});}
  }
  return report;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={restoreCheckpoint};
