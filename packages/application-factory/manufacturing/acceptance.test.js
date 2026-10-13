'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipes=require('../recipes.json'),A=require('./assembler');
let V={};try{V=require('./acceptance');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function setup(t,recipe=recipes[0]){
  assert.equal(typeof V.acceptApplication,'function','assembled application acceptance must exist');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-package-acceptance-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=A.compileApplication(recipe),output=path.join(root,'app');A.writeApplication(app,output);return {root,app,output};
}
for(const recipe of recipes)test('assembled '+recipe.id+' passes real scoped intake, evidence, automation and recovery',t=>{
  const x=setup(t,recipe),result=V.acceptApplication(x.output,x.app.digest);
  assert.equal(result.passed,true);assert.equal(result.recipeId,recipe.id);assert.equal(result.artifactDigest,x.app.digest);
  for(const key of ['tenantIsolation','idempotentIntake','encryptedEvidence','headlessAutomation','restartPersistence','verifiedRecovery','oldCredentialsRejected'])assert.equal(result[key],true,key);
  assert.equal(result.externalMessagesSent,0);assert.equal(result.paymentsSent,0);assert.equal(result.releaseApproved,false);
  assert.equal(A.verifyApplication(x.output,x.app.digest).digest,x.app.digest);
});
test('never executes an artifact whose expected identity fails',t=>{
  const x=setup(t);fs.appendFileSync(path.join(x.output,'scripts/run-application-runtime.js'),'\nthrow new Error("do not execute");');
  assert.throws(()=>V.acceptApplication(x.output,x.app.digest),/ARTIFACT_INVALID/);
});
test('child-process environment excludes operator credentials and inherited Node injection',t=>{
  const x=setup(t),old=process.env.FACTORY_VAULT_KEY_HEX,oldNode=process.env.NODE_OPTIONS;
  process.env.FACTORY_VAULT_KEY_HEX='DO_NOT_INHERIT';process.env.NODE_OPTIONS='--require=/does-not-exist-factory-test';
  try{assert.equal(V.acceptApplication(x.output,x.app.digest).passed,true);}finally{
    if(old===undefined)delete process.env.FACTORY_VAULT_KEY_HEX;else process.env.FACTORY_VAULT_KEY_HEX=old;
    if(oldNode===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=oldNode;
  }
});
