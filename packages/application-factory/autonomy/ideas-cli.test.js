'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{spawnSync}=require('node:child_process');
let subject={};try{subject=require('../../../scripts/validate-autonomy-ideas');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const ROOT=path.resolve(__dirname,'../../..');
const dir=()=>path.join(ROOT,'packages/application-factory/autonomy/ideas');
test('new ideas are validated as unverified research and do not claim commercial release',()=>{
 assert.equal(typeof subject.auditBacklog,'function','missing research admission command');
 const r=subject.auditBacklog({directory:dir()});
 assert.equal(r.kind,'unverified-autonomy-blueprint-inbox');assert.ok(r.admitted>=3);
 assert.equal(r.commercialValidation,'unverified');assert.equal(r.outreachEnabled,false);
 assert.equal(r.marketValidated,false);assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
 assert.equal(r.releaseApproved,false);assert.ok(r.cycles.includes(72));
});
test('reviewing the idea inbox is a read-only CLI operation',()=>{
 const cli=path.join(ROOT,'scripts/validate-autonomy-ideas.js');
 const result=spawnSync(process.execPath,[cli,'--check'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);
 assert.ok(report.admitted>=3);assert.equal(report.outreachEnabled,false);
 assert.equal(report.paymentsSent,0);assert.equal(report.externalMessagesSent,0);
});
test('no flags permit messaging, billing, arbitrary internet code or directory injection',()=>{
 const cli=path.join(ROOT,'scripts/validate-autonomy-ideas.js');
 for(const flags of [['--send'],['--allow-payments'],['--unsafe-code'],['--idea-dir','/tmp/foo'],
   ['--build-pending'],['--build-pending','--output','relative'],['--check','--check']]){
  const child=spawnSync(process.execPath,[cli,...flags],{encoding:'utf8',timeout:10000});
  assert.notEqual(child.status,0,'unexpected success: '+flags.join(' '));
 }
});
test('a bounded three-candidate synthetic acceptance report remains labeled as injected',t=>{
 assert.equal(typeof subject.runPending,'function','missing preview build command');
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'factory-idea-preview-'));
 t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
 const {verifyApplication}=require('../manufacturing/assembler');
 const {CHECKS}=require('../manufacturing/acceptance');
 const injected=(root,digest)=>{
  const manifest=verifyApplication(root,digest);
  return {kind:'assembled-application-acceptance',passed:true,recipeId:manifest.recipeId,
    artifactDigest:digest,...Object.fromEntries(CHECKS.map(k=>[k,true])),
    externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};
 };
 const r=subject.runPending({directory:dir(),outputRoot:scratch,accept:injected});
 assert.equal(r.accepted,3);assert.equal(r.failed,0);assert.equal(r.previewLimit,3);
 assert.equal(r.verification,'injected-test-only');assert.equal(r.collectedRevenue,null);
 assert.equal(r.releaseApproved,false);assert.equal(r.externalMessagesSent,0);
});
