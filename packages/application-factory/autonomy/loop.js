'use strict';
// Bounded unattended local candidate manufacturing. No charge, publish, contact or model API use.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildCandidateCatalog}=require('./catalog');
const {compileApplication}=require('../manufacturing/assembler');
const {manufactureBatch}=require('../manufacturing/line');
const ROOT=path.resolve(__dirname,'../../..');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),INTERVAL=6*60*60*1000;
const fail=code=>{throw new Error(code);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonicalDate=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString().slice(0,10)===value.slice(0,10)&&
 new Date(value).getUTCFullYear()<=2099;
function planCycle({at=new Date().toISOString(),batchSize=1}={}){
 if(!canonicalDate(at)||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>2)fail('CYCLE_INVALID');
 const time=Date.parse(at),cycle=Math.floor((time-EPOCH)/INTERVAL);
 if(time<EPOCH||!Number.isSafeInteger(cycle))fail('CYCLE_INVALID');
 const catalog=buildCandidateCatalog();
 const start=cycle*batchSize;
 const recipes=start>=catalog.length?[]:catalog.slice(start,Math.min(catalog.length,start+batchSize));
 return {kind:'autonomous-candidate-cycle',cycle,scheduleHours:6,batchSize,
   recipes,exhausted:recipes.length===0,nextAction:recipes.length?'manufacture_and_verify':'catalog_refresh_required',
   mode:'synthetic-candidate-only',marketValidated:false,releaseApproved:false,
   realCustomers:null,collectedRevenue:null,paymentsSent:0,transmittedMessages:0};
}
function safeOutput(root){
 if(typeof root!=='string'||!path.isAbsolute(root))fail('OUTPUT_UNSAFE');
 const resolved=path.resolve(root),relative=path.relative(ROOT,resolved);
 if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('OUTPUT_UNSAFE');
 fs.mkdirSync(resolved,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(resolved);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(resolved)!==resolved||
   (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('OUTPUT_UNSAFE');
 return resolved;
}
function validReceipt(value,plan){
 return value&&value.schemaVersion===1&&value.cycle===plan.cycle&&value.batchSize===plan.batchSize&&
   Array.isArray(value.identities)&&value.identities.length===plan.recipes.length&&
   value.identities.every((x,i)=>x&&x.id===plan.recipes[i].id&&/^[0-9a-f]{64}$/.test(x.digest))&&
   typeof value.digest==='string'&&/^[0-9a-f]{64}$/.test(value.digest)&&
   hash(JSON.stringify({...value,digest:undefined}))===value.digest;
}
function savedReceipt(filename,plan){
 if(!fs.existsSync(filename))return null;
 const stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>24000)fail('CYCLE_RECEIPT_INVALID');
 let row;try{row=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail('CYCLE_RECEIPT_INVALID');}
 if(!validReceipt(row,plan))fail('CYCLE_RECEIPT_INVALID');
 return row;
}
function persistReceipt(filename,data){
 const payload={...data},tmp=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 payload.digest=hash(JSON.stringify({...payload,digest:undefined}));
 try{
  const fd=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(payload,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,filename);
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function runCycle({at=new Date().toISOString(),batchSize=1,outputRoot,accept}={}){
 const plan=planCycle({at,batchSize}),output=safeOutput(outputRoot);
 const stateDir=path.join(output,'autonomy');
 fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
 const stateStat=fs.lstatSync(stateDir);
 if(!stateStat.isDirectory()||stateStat.isSymbolicLink()||(process.platform!=='win32'&&(stateStat.mode&0o077)!==0))fail('OUTPUT_UNSAFE');
 const lock=path.join(stateDir,'.cycle.lock'),receipt=path.join(stateDir,'cycle-'+plan.cycle+'.json');
 let handle;
 try{handle=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('CYCLE_BUSY');throw error;}
 try{
  const identities=plan.recipes.map(r=>({id:r.id,digest:compileApplication(r).digest}));
  const prior=savedReceipt(receipt,plan);
  if(prior&&prior.identities.some((x,i)=>x.digest!==identities[i].digest))fail('CYCLE_SOURCE_DRIFT');
  const result=plan.exhausted?{accepted:0,failed:0,reused:0,results:[],
     verification:'catalog-exhausted-no-run'}:
     manufactureBatch({...{
       recipes:plan.recipes,outputRoot:output,maxAttempts:2,retryFailed:false},
       ...(accept?{accept}:{} )
     });
  const report={schemaVersion:1,kind:'autonomous-factory-cycle',cycle:plan.cycle,
    scheduleHours:6,batchSize,planned:plan.recipes.length,
    accepted:result.accepted,failed:result.failed,reused:result.reused,
    exhausted:plan.exhausted,nextAction:result.failed?'inspect_quarantined_candidate':plan.nextAction,
    identities,artifacts:result.results,verification:result.verification,
    marketValidated:false,sourceEvidence:'curated_workflow_hypotheses_not_buyer_verified',
    mode:'synthetic-candidate-only',transmittedMessages:0,paymentsSent:0,
    realCustomers:null,collectedRevenue:null,releaseApproved:false};
  persistReceipt(receipt,report);
  return report;
 }finally{fs.closeSync(handle);fs.unlinkSync(lock);}
}
module.exports={planCycle,runCycle,INTERVAL};
