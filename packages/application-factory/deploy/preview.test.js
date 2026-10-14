'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {rehearsePrivateDeployments,verifyInputs}=require('./preview');
const {manufactureBatch}=require('../manufacturing/line');
const {manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const docs=require('../recipes.json'),quotes=require('../quote-family/recipes.json'),
 inventories=require('../inventory-family/recipes.json');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-deployment-tests-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const sources={document:path.join(dir,'document'),quote:path.join(dir,'quote'),inventory:path.join(dir,'inventory')};
 return {dir,sources};
}
function create(f){
 const r1=manufactureBatch({recipes:[docs[0]],outputRoot:f.sources.document});
 const r2=manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:f.sources.quote});
 const r3=manufactureInventoryBatch({catalog:[inventories[0]],outputRoot:f.sources.inventory});
 assert.equal(r1.accepted,1);assert.equal(r2.accepted,1);assert.equal(r3.accepted,1);
 return [r1,r2,r3];
}
test('an isolated staged deployment truly boots, probes and restarts each assembled family',t=>{
 if(process.platform==='win32')return t.skip('Linux full packaged acceptance required');
 const f=fixture(t);create(f);
 const outputRoot=path.join(f.dir,'staged');
 const r=rehearsePrivateDeployments({sources:f.sources,outputRoot});
 assert.equal(r.stagedApps,3);assert.equal(r.failed,0);
 assert.equal(r.publicHostingEnabled,false);assert.equal(r.releaseApproved,false);
 assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
 assert.equal(r.transmittedMessages,0);assert.equal(r.paymentsSent,0);
 const manifest=JSON.parse(fs.readFileSync(path.join(outputRoot,'deployment-report.json')));
 assert.equal(manifest.stagedApps,3);assert.equal(manifest.results.length,3);
 assert.equal(manifest.localLoopbackVerified,true);
 assert.equal(manifest.approvedDeploymentTarget,null);assert.equal(manifest.tlsValidated,false);
 assert.equal(manifest.rollbackExecuted,false);assert.equal(manifest.realCustomerReady,false);
 for(const row of manifest.results){assert.equal(row.webProbesPassed,2);assert.equal(row.integrityVerified,true);}
 assert.throws(()=>rehearsePrivateDeployments({sources:f.sources,outputRoot}),/DEPLOYMENT_OUTPUT_EXISTS/);
});
test('corrupted accepted proof cannot be promoted into a staging-ready receipt',t=>{
 if(process.platform==='win32')return t.skip('Linux full packaged acceptance required');
 const f=fixture(t);const entries=create(f),where=path.join(f.sources.document,'verification',
  entries[0].results[0].artifact+'.json');
 fs.writeFileSync(where,'{"passed":true}');
 assert.throws(()=>rehearsePrivateDeployments({sources:f.sources,
  outputRoot:path.join(f.dir,'should-not-exist')}),/DEPLOYMENT_RECEIPT_INVALID/);
 assert.equal(fs.existsSync(path.join(f.dir,'should-not-exist')),false);
});
test('tampered executable bytes cannot be promoted even if report claims success',t=>{
 if(process.platform==='win32')return t.skip('Linux full packaged acceptance required');
 const f=fixture(t);const entries=create(f),row=entries[2].results[0];
 fs.appendFileSync(path.join(f.sources.inventory,row.artifact,'client.js'),'\n/* corrupted */');
 assert.throws(()=>verifyInputs(f.sources),/DEPLOYMENT_PACKAGE_INVALID/);
});
test('public URLs, missing roots and repository-local deployment outputs are never accepted',()=>{
 for(const sources of [null,{}, {document:'https://host',quote:'/tmp/a',inventory:'/tmp/b'}])
  assert.throws(()=>verifyInputs(sources),/DEPLOYMENT_INPUT_INVALID|DEPLOYMENT_PATH_UNSAFE/);
 assert.throws(()=>rehearsePrivateDeployments({sources:{},
  outputRoot:path.join(__dirname,'public-release')}),/DEPLOYMENT_PATH_UNSAFE/);
});
