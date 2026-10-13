'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {verifyApplication}=require('./assembler');
const CHECKS=Object.freeze(['tenantIsolation','idempotentIntake','encryptedEvidence','headlessAutomation','restartPersistence','verifiedRecovery','oldCredentialsRejected']);
function validReceipt(result,recipeId,digest){
  return result&&result.kind==='assembled-application-acceptance'&&result.passed===true&&result.recipeId===recipeId&&
    result.artifactDigest===digest&&CHECKS.every(key=>result[key]===true)&&result.externalMessagesSent===0&&
    result.paymentsSent===0&&result.realCustomers===null&&result.collectedRevenue===null&&result.releaseApproved===false;
}
function acceptApplication(root,digest){
  const manifest=verifyApplication(root,digest);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'factory-assembled-execution-'));
  // Do not inherit operator keys, tokens, NODE_OPTIONS, NODE_PATH, or proxy settings.
  const env={PATH:process.env.PATH||'',TZ:'UTC'};
  for(const key of ['SystemRoot','WINDIR','TEMP','TMP','TMPDIR'])if(process.env[key])env[key]=process.env[key];
  try{
    const child=spawnSync(process.execPath,[path.join(__dirname,'exercise-candidate.cjs'),root,scratch,digest],
      {encoding:'utf8',env,timeout:20000,killSignal:'SIGKILL',maxBuffer:128*1024,windowsHide:true});
    if(child.status!==0||child.error)throw new Error('ACCEPTANCE_FAILED');
    let result;try{result=JSON.parse(child.stdout);}catch{throw new Error('ACCEPTANCE_FAILED');}
    if(!validReceipt(result,manifest.recipeId,digest))throw new Error('ACCEPTANCE_FAILED');
    verifyApplication(root,digest);return result;
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
module.exports={acceptApplication,validReceipt,CHECKS};
