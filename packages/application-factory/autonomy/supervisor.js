'use strict';
// Private-state recovery of missed synthetic application build slots. No external effects.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {planCycle,runCycle,INTERVAL}=require('./loop');
const {compileApplication,verifyApplication}=require('../manufacturing/assembler');
const {validReceipt}=require('../manufacturing/acceptance');
const ROOT=path.resolve(__dirname,'../../..'),EPOCH=Date.parse('2026-10-13T00:00:00Z');
const fail=code=>{throw new Error(code);};
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const abs=v=>typeof v==='string'&&path.isAbsolute(v);
const utc=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&
 Number.isFinite(Date.parse(v));
const location=raw=>{
 if(!abs(raw))fail('OUTPUT_UNSAFE');
 const output=path.resolve(raw),relative=path.relative(ROOT,output);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('OUTPUT_UNSAFE');
 const ancestor=fs.existsSync(output)?output:path.dirname(output);
 if(fs.existsSync(ancestor)){
  const stat=fs.lstatSync(ancestor);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
     (process.platform==='win32'?fs.realpathSync(ancestor).toLowerCase():fs.realpathSync(ancestor))!==
     (process.platform==='win32'?path.resolve(ancestor).toLowerCase():path.resolve(ancestor)))fail('OUTPUT_UNSAFE');
 }
 return output;
};
function dirState(output){
 const state=path.join(output,'autonomy');
 if(!fs.existsSync(state))return null;
 const info=fs.lstatSync(state);
 if(!info.isDirectory()||info.isSymbolicLink()||
   (process.platform!=='win32'&&(info.mode&0o077)!==0))fail('OUTPUT_UNSAFE');
 return state;
}
function readSafe(filename,code,cap){
 let stat;try{stat=fs.lstatSync(filename);}catch(e){if(e.code==='ENOENT')return null;fail(code);}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>cap)fail(code);
 if(process.platform!=='win32'&&(stat.mode&0o077)!==0)fail(code);
 try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail(code);}
}
function inspect(output,plan){
 const state=dirState(output);
 if(!state)return 'missing';
 const saved=readSafe(path.join(state,'cycle-'+plan.cycle+'.json'),'RECOVERY_RECEIPT_INVALID',24000);
 if(!saved)return 'missing';
 if(saved.schemaVersion!==1||saved.kind!=='autonomous-factory-cycle'||saved.cycle!==plan.cycle||
    saved.batchSize!==1||saved.planned!==1||saved.exhausted!==false||
    saved.releaseApproved!==false||saved.marketValidated!==false||saved.realCustomers!==null||
    saved.collectedRevenue!==null||saved.transmittedMessages!==0||saved.paymentsSent!==0||
    !/^[a-f0-9]{64}$/.test(saved.digest||'')||
    saved.digest!==sha(JSON.stringify({...saved,digest:undefined}))||
    !Array.isArray(saved.identities)||saved.identities.length!==1||!Array.isArray(saved.artifacts)||
    saved.artifacts.length!==1)fail('RECOVERY_RECEIPT_INVALID');
 const scheduledFor=new Date(EPOCH+plan.cycle*INTERVAL).toISOString();
 const legacy=saved.scheduledFor===undefined&&saved.executedAt===undefined&&
   saved.recoveredLate===undefined&&saved.executionKind===undefined;
 if(!legacy&&(!utc(saved.scheduledFor)||!utc(saved.executedAt)||saved.scheduledFor!==scheduledFor||
   saved.executionKind!=='initial-execution'||
   saved.recoveredLate!==(Date.parse(saved.executedAt)>=Date.parse(scheduledFor)+INTERVAL)))
  fail('RECOVERY_RECEIPT_INVALID');
 const recipe=plan.recipes[0],digest=compileApplication(recipe).digest;
 if(saved.ideaDigest!==plan.ideaDigest||saved.identities[0].id!==recipe.id||
    saved.identities[0].digest!==digest)fail('RECOVERY_SOURCE_DRIFT');
 const artifact=saved.artifacts[0],expected=recipe.id+'-'+digest;
 if(saved.accepted===0&&saved.failed===1&&artifact.status==='quarantined'){
   return 'quarantined';
 }
 if(saved.accepted!==1||saved.failed!==0||artifact.id!==recipe.id||
    artifact.digest!==digest||artifact.artifact!==expected||artifact.status!=='accepted')fail('RECOVERY_RECEIPT_INVALID');
 if(saved.verification==='injected-test-only')return 'requires_real_acceptance';
 if(saved.verification!=='executed-packaged-workflow')fail('RECOVERY_RECEIPT_INVALID');
 try{verifyApplication(path.join(output,expected),digest);}catch{fail('RECOVERY_ARTIFACT_INVALID');}
 const evidence=readSafe(path.join(output,'verification',expected+'.json'),'RECOVERY_RECEIPT_INVALID',65536);
 if(!validReceipt(evidence,recipe.id,digest))fail('RECOVERY_RECEIPT_INVALID');
 return 'completed';
}
function planRecovery({at=new Date().toISOString(),outputRoot,windowCycles=8,blueprintDirectory}={}){
 if(!Number.isSafeInteger(windowCycles)||windowCycles<1||windowCycles>8)fail('RECOVERY_CONFIG_INVALID');
 const output=location(outputRoot),current=planCycle({at,blueprintDirectory});
 const blockedCycles=[];let skippedCompleted=0,missingIdeas=0,selectedCycle=null,nextAction='no_due_work';
 for(let cycle=Math.max(0,current.cycle-windowCycles+1);cycle<=current.cycle;cycle++){
   const candidate=planCycle({at:new Date(EPOCH+cycle*INTERVAL).toISOString(),blueprintDirectory});
   if(!candidate.recipes.length){missingIdeas++;continue;}
   if(candidate.recipes.length!==1)fail('RECOVERY_CONFIG_INVALID');
   const status=inspect(output,candidate);
   if(status==='completed'){skippedCompleted++;continue;}
   if(status==='quarantined'){blockedCycles.push(cycle);continue;}
   selectedCycle=cycle;nextAction=status==='requires_real_acceptance'?'requires_real_acceptance':'manufacture_and_verify';break;
 }
 return {kind:'autonomous-recovery-plan',currentCycle:current.cycle,selectedCycle,
   windowCycles,skippedCompleted,skippedQuarantined:blockedCycles.length,blockedCycles,
   missingIdeas,nextAction,marketValidated:false,realCustomers:null,collectedRevenue:null,
   transmittedMessages:0,paymentsSent:0,releaseApproved:false};
}
function runRecovery({at=new Date().toISOString(),outputRoot,windowCycles=8,blueprintDirectory,accept}={}){
 const output=location(outputRoot);
 fs.mkdirSync(output,{recursive:true,mode:0o700});
 const checked=location(output);
 if(checked!==output)fail('OUTPUT_UNSAFE');
 if(process.platform!=='win32'&&(fs.lstatSync(output).mode&0o077)!==0)fail('OUTPUT_UNSAFE');
 const state=path.join(output,'autonomy');fs.mkdirSync(state,{recursive:true,mode:0o700});
 if(!dirState(output))fail('OUTPUT_UNSAFE');
 const lock=path.join(state,'.supervisor.lock');
 let handle;try{handle=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('RECOVERY_BUSY');throw error;}
 try{
  const selection=planRecovery({at,outputRoot:output,windowCycles,blueprintDirectory});
  let report=null;
  if(selection.selectedCycle!==null){
   report=runCycle({at:new Date(EPOCH+selection.selectedCycle*INTERVAL).toISOString(),
     outputRoot:output,...(blueprintDirectory?{blueprintDirectory}:{}),...(accept?{accept}:{})});
   if(report.releaseApproved!==false||report.marketValidated!==false||report.realCustomers!==null||
      report.collectedRevenue!==null||report.transmittedMessages!==0||report.paymentsSent!==0)fail('RECOVERY_UNSAFE');
  }
  return {kind:'autonomous-recovery-run',selectedCycle:selection.selectedCycle,
   currentCycle:selection.currentCycle,windowCycles,skippedCompleted:selection.skippedCompleted,
   skippedQuarantined:selection.skippedQuarantined,blockedCycles:selection.blockedCycles,
   missingIdeas:selection.missingIdeas,
   nextAction:report?.failed?'inspect_quarantined_candidate':selection.nextAction,
   accepted:report?.accepted||0,failed:report?.failed||0,
   verification:report?.verification||'no-work',report,
   marketValidated:false,realCustomers:null,collectedRevenue:null,
   transmittedMessages:0,paymentsSent:0,releaseApproved:false};
 }finally{fs.closeSync(handle);fs.unlinkSync(lock);}
}
module.exports={planRecovery,runRecovery};
