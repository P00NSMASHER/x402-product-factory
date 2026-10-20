'use strict';
const fs=require('node:fs'),path=require('node:path');
const {privateDirectory:safeDir,privateJson:writeJSON,
  immutablePrivateJson:writeReceipt,privateProcessLock,preserveIncompleteStages}=require('./shared-contracts');
const {validateRecipe}=require('../kernel');
const {compileApplication,writeApplication,verifyApplication}=require('./assembler');
const {acceptApplication,validReceipt}=require('./acceptance');
const ROOT=path.resolve(__dirname,'../../..');
const fail=code=>{throw new Error(code);};
const exists=p=>{try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function manufactureBatch({recipes,outputRoot,sourceRoot=ROOT,maxAttempts=2,retryFailed=false,accept=acceptApplication}={}){
  if(!Array.isArray(recipes)||recipes.length<1||recipes.length>100||new Set(recipes.map(r=>r?.id)).size!==recipes.length||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>3||typeof retryFailed!=='boolean'||typeof accept!=='function')fail('BATCH_INVALID');
  const validated=recipes.map(validateRecipe);
  if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))fail('OUTPUT_UNSAFE');
  const output=path.resolve(outputRoot),relative=path.relative(path.resolve(sourceRoot),output);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('OUTPUT_UNSAFE');
  fs.mkdirSync(output,{recursive:true,mode:0o700});safeDir(output);
  const lock=privateProcessLock(path.join(output,'.manufacturing.lock'));
  const report={kind:'full-stack-manufacturing',accepted:0,failed:0,reused:0,results:[],
    verification:accept===acceptApplication?'executed-packaged-workflow':'injected-test-only',
    realCustomers:null,collectedRevenue:null,externalMessagesSent:0,paymentsSent:0,releaseApproved:false};
  try{
    preserveIncompleteStages(output,{prefixes:['.assembly-']});
    const receiptDir=path.join(output,'verification'),quarantineDir=path.join(output,'.quarantine');
    for(const dir of [receiptDir,quarantineDir]){fs.mkdirSync(dir,{recursive:true,mode:0o700});safeDir(dir);}
    for(const recipe of validated){
      let app;
      try{app=compileApplication(recipe,{sourceRoot});}catch{report.failed++;report.results.push({id:recipe.id,status:'quarantined',reason:'SOURCE_INVALID',attempts:0});continue;}
      const artifact=recipe.id+'-'+app.digest,destination=path.join(output,artifact),quarantine=path.join(quarantineDir,artifact+'.json');
      let outcome=null,attempts=0;
      if(exists(quarantine)&&!retryFailed){report.failed++;report.results.push({id:recipe.id,digest:app.digest,status:'quarantined',reason:'PREVIOUS_FAILURE',attempts:0});continue;}
      if(exists(destination)){
        try{
          verifyApplication(destination,app.digest);
          const evidence=accept(destination,app.digest);
          if(!validReceipt(evidence,recipe.id,app.digest))fail('ACCEPTANCE_FAILED');
          verifyApplication(destination,app.digest);
          writeReceipt(path.join(receiptDir,artifact+'.json'),evidence);outcome={id:recipe.id,digest:app.digest,artifact,status:'accepted',reused:true,attempts:1};
        }catch{outcome={id:recipe.id,digest:app.digest,status:'quarantined',reason:'EXISTING_ARTIFACT_REJECTED',attempts:1};}
      }else{
        for(;attempts<maxAttempts&&!outcome;){
          attempts++;const stage=fs.mkdtempSync(path.join(output,'.assembly-')),candidate=path.join(stage,'app');
          try{
            writeApplication(app,candidate);const evidence=accept(candidate,app.digest);
            if(!validReceipt(evidence,recipe.id,app.digest))fail('ACCEPTANCE_FAILED');
            verifyApplication(candidate,app.digest);
            if(exists(destination))fail('OUTPUT_EXISTS');
            fs.renameSync(candidate,destination);
            writeReceipt(path.join(receiptDir,artifact+'.json'),evidence);
            outcome={id:recipe.id,digest:app.digest,artifact,status:'accepted',reused:false,attempts};
          }catch{
            // Once a directory exists it is never overwritten by an automatic retry.
            if(exists(destination)||attempts===maxAttempts)outcome={id:recipe.id,digest:app.digest,status:'quarantined',reason:'ACCEPTANCE_FAILED',attempts};
          }finally{fs.rmSync(stage,{recursive:true,force:true});}
        }
      }
      if(outcome.status==='accepted'){
        report.accepted++;if(outcome.reused)report.reused++;
        if(exists(quarantine)){const stat=fs.lstatSync(quarantine);if(!stat.isFile()||stat.isSymbolicLink())fail('OUTPUT_UNSAFE');fs.unlinkSync(quarantine);}
      }else{report.failed++;writeJSON(quarantine,outcome);}
      report.results.push(outcome);
      writeJSON(path.join(output,'manufacturing-report.json'),report);
    }
    writeJSON(path.join(output,'manufacturing-report.json'),report);return report;
  }finally{lock.release();}
}
module.exports={manufactureBatch};

