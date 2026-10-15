'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {parse,privateSave,main}=require('./audit-app-production-integration');
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'private-app-integration-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const report=()=>({candidatePr:56,canonicalStackChecked:33,
 candidateWorkflowsPassed:9,candidateWorkflowCount:9,
 candidateBehindBy:60,findings:[{code:'DEFAULT_BRANCH_HISTORY_NOT_IN_CANDIDATE'}],
 releaseStatus:'BLOCK_MAIN_RECONCILIATION',
 sourceIntegrationReady:false,productionReady:false,releaseApproved:false,
 automaticMergesAllowed:false,externalContacts:0,paymentsSent:0,
 mergesPerformed:0,deploymentsPerformed:0,product025Unlocked:false});
test('read-only command refuses releases, unsafe flags, real contact, tokens and public paths',()=>{
 const allowed='/tmp/read-only-integration/report.json';
 assert.deepEqual(parse(['--audit-live','--output',allowed]),{
  output:allowed,requireIntegrated:false});
 assert.equal(parse(['--audit-live','--output',allowed,'--require-integrated']).requireIntegrated,true);
 for(const flags of [
  [],['--run'],['--audit-live'],['--audit-live','--send-email','buyer@example.com'],
  ['--audit-live','--deploy','--output',allowed],
  ['--audit-live','--output','relative.json'],
  ['--audit-live','--output',path.resolve(__dirname,'../.env')],
  ['--audit-live','--output',allowed,'--output','/tmp/second'],
  ['--audit-live','--output',allowed,'--permission','contents:write'],
  ['--audit-live','--output',allowed,'--merge'],
  ['--audit-live','--output',allowed,'--require-integrated','--require-integrated']]){
  assert.throws(()=>parse(flags),/APP_INTEGRATION_/);
 }
});
test('local report is privately created with hash and never overwritten or symlink-followed',t=>{
 const d=tmp(t),filename=path.join(d,'readiness.json');
 const original=report(),envelope=privateSave(filename,original);
 assert.equal(envelope.productionAuthorization,false);
 assert.equal(envelope.independentSignature,false);
 assert.equal(envelope.digest,crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'));
 assert.equal(JSON.parse(fs.readFileSync(filename,'utf8')).report.productionReady,false);
 if(process.platform!=='win32')assert.equal(fs.statSync(filename).mode&0o077,0);
 assert.throws(()=>privateSave(filename,report()),/APP_INTEGRATION_OUTPUT_EXISTS/);
 const trap=path.join(d,'locked.txt');fs.writeFileSync(trap,'no-change',{mode:0o600});
 const link=path.join(d,'link.json');fs.symlinkSync(trap,link);
 assert.throws(()=>privateSave(link,report()),/APP_INTEGRATION_OUTPUT_EXISTS/);
 assert.equal(fs.readFileSync(trap,'utf8'),'no-change');
});
test('report refuses fake release approval, external contacts and merge/deploy success claims',t=>{
 const d=tmp(t);
 for(const mutate of [
  x=>x.productionReady=true,
  x=>x.releaseApproved=true,
  x=>x.externalContacts=1,
  x=>x.mergesPerformed=1,
  x=>x.deploymentsPerformed=1,
  x=>x.automaticMergesAllowed=true,
  x=>x.product025Unlocked=true
 ]){
  const bad=report();mutate(bad);
  assert.throws(()=>privateSave(path.join(d,'blocked.json'),bad),/APP_INTEGRATION_UNSAFE_REPORT/);
  assert.equal(fs.existsSync(path.join(d,'blocked.json')),false);
 }
});
test('unattended execution writes only honest redacted source review, not production signal',async t=>{
 const d=tmp(t),file=path.join(d,'audit.json');
 const output=await main(['--audit-live','--output',file],{
  auditImpl:async(doc,opts)=>{assert.equal(doc.candidate.prNumber,56);
    assert.equal(opts.token,'READONLY_MOCK_TOKEN');return report();},
  token:'READONLY_MOCK_TOKEN'
 });
 assert.equal(output.candidatePr,56);
 assert.equal(output.exactHeadWorkflowPasses,9);
 assert.equal(output.mainCommitsBehind,60);
 assert.equal(output.privateReportWritten,true);
 assert.equal(output.requireIntegratedFailed,false);
 assert.equal(output.sourceIntegrationReady,false);
 assert.equal(output.releaseApproved,false);
 assert.equal(output.externalContacts,0);
 assert.equal(output.mergesPerformed,0);
 assert.equal(output.deploymentsPerformed,0);
 const stored=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(stored.report.sourceIntegrationReady,false);
 assert.equal(stored.report.productionReady,false);
 assert.equal(JSON.stringify(stored).includes('READONLY_MOCK_TOKEN'),false);
});
test('strict readiness demand reports failure without modifying source, main or targets',async t=>{
 const d=tmp(t),out=await main(['--audit-live','--output',path.join(d,'strict.json'),'--require-integrated'],{
  auditImpl:async()=>report(),token:'READONLY_MOCK_TOKEN'
 });
 assert.equal(out.requireIntegratedFailed,true);
 assert.equal(out.productionReady,false);
 assert.equal(out.mergesPerformed,0);
 assert.equal(fs.existsSync(path.join(d,'strict.json')),true);
});
