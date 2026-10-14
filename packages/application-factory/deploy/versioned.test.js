'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {rehearseSyntheticVersions,verifyVersionPair,verifiedFamilyArtifact}=require('./versioned');
const {manufactureBatch}=require('../manufacturing/line');
const {manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const docs=require('../recipes.json'),quotes=require('../quote-family/recipes.json');
const inventory=require('../inventory-family/recipes.json');
const root=t=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'factory-real-version-test-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
function baselines(p){
 const d={document:path.join(p,'document'),quote:path.join(p,'quote'),inventory:path.join(p,'inventory')};
 const a=manufactureBatch({recipes:[docs[0]],outputRoot:d.document});
 const b=manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:d.quote});
 const c=manufactureInventoryBatch({catalog:[inventory[0]],outputRoot:d.inventory});
 for(const row of [a,b,c]){assert.equal(row.accepted,1);assert.equal(row.failed,0);}
 return d;
}
test('three true semantic versions switch and fail back with independent SQLite state',t=>{
 if(process.platform==='win32')return t.skip('Real packaged Linux service acceptance is required');
 const folder=root(t),baselineRoots=baselines(folder),outputRoot=path.join(folder,'receipts');
 const report=rehearseSyntheticVersions({baselineRoots,outputRoot});
 assert.equal(report.kind,'private-distinct-version-rollback-rehearsal');
 assert.equal(report.testedVersionPairs,3);
 assert.equal(report.verifiedTrafficFallbacks,3);
 assert.equal(report.persistedStateFamiliesChecked,3);
 assert.equal(report.unsafeAutomaticStateMigrationsBlocked,3);
 assert.equal(report.uncheckpointedWalSnapshotsVerified,3);
 assert.equal(report.mainFileOnlyRecoveryDenied,3);
 assert.equal(report.failed,0);
 assert.equal(report.releaseApproved,false);assert.equal(report.realCustomers,null);
 assert.equal(report.collectedRevenue,null);assert.equal(report.paymentsSent,0);
 const saved=JSON.parse(fs.readFileSync(path.join(outputRoot,'versioned-report.json'),'utf8'));
 const {digest,...body}=saved;
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),digest);
 assert.equal(saved.testedFamilies,3);assert.equal(saved.results.length,3);
 assert.equal(saved.publicHostingEnabled,false);assert.equal(saved.productionStateMigrationTested,false);
 assert.equal(saved.productionRollbackExecuted,false);assert.equal(saved.failed,0);
 assert.equal(saved.sharedStateMigrationApproved,false);
 assert.equal(saved.observedSchemaDriftDenied,true);
 assert.equal(saved.persistedStateFamiliesChecked,3);
 assert.equal(saved.uncheckpointedWalSnapshotsVerified,3);
 assert.equal(saved.mainFileOnlyRecoveryDenied,3);
 for(const row of saved.results){
  assert.notEqual(row.baselineDigest,row.candidateDigest);
  assert.equal(row.localTrafficRollbackPassed,true);
  assert.equal(row.unhealthyResponsesFailClosed,true);
  assert.equal(row.sourceVerifiedBeforeAndAfter,true);
  assert.equal(row.productionRollbackExecuted,false);
  assert.equal(row.isolatedVersionState,true);
  assert.equal(row.persistedStateIntegrityVerified,true);
  assert.equal(row.uncheckpointedWalSnapshotVerified,true);
  assert.equal(row.mainFileOnlyRecoveryDenied,true);
  assert.equal(row.walCommittedReceipts,1);
  assert.equal(row.unsupportedSchemaRejected,true);
  assert.equal(row.sourceIdentityMismatchRejected,true);
  assert.equal(row.sharedStateMigrationApproved,false);
  assert.equal(typeof row.stateCompatibilityOutcome,'string');
 }
 const modes=Object.fromEntries(saved.results.map(x=>[x.family,x.stateCompatibilityOutcome]));
 assert.deepEqual(modes,{
  document:'old_workspace_still_bound_to_old_recipe',
  quote:'quote_receipts_replay_under_new_validity_policy',
  inventory:'rejects_changed_inventory_recipe'
 });
 assert.throws(()=>rehearseSyntheticVersions({baselineRoots,outputRoot}),/VERSION_OUTPUT_EXISTS/);
});
test('same version or superficial title-only edit cannot qualify as a distinct rollout',t=>{
 if(process.platform==='win32')return t.skip('Real packaged Linux service acceptance is required');
 const folder=root(t),baselineRoots=baselines(folder);
 assert.throws(()=>verifyVersionPair({family:'document',id:docs[0].id,
  baselineRoot:baselineRoots.document,candidateRoot:baselineRoots.document}),/VERSION_NOT_CHANGED/);
 const renamed={...docs[0],title:docs[0].title+' marketing'};
 const candidateRoot=path.join(folder,'marketing');
 const out=manufactureBatch({recipes:[renamed],outputRoot:candidateRoot});
 assert.equal(out.accepted,1);
 assert.throws(()=>verifyVersionPair({family:'document',id:docs[0].id,
  baselineRoot:baselineRoots.document,candidateRoot}),/VERSION_BEHAVIOR_UNCHANGED/);
});
test('verified manufactured receipt cannot be forged after accepted test',t=>{
 if(process.platform==='win32')return t.skip('Real packaged Linux service acceptance is required');
 const folder=root(t),baselineRoots=baselines(folder),filename=path.join(baselineRoots.quote,'verification',quotes[0].id+'.json');
 fs.writeFileSync(filename,JSON.stringify({passed:true}));
 assert.throws(()=>verifiedFamilyArtifact({family:'quote',root:baselineRoots.quote,id:quotes[0].id}),
  /VERSION_RECEIPT_INVALID/);
 assert.throws(()=>rehearseSyntheticVersions({baselineRoots,outputRoot:path.join(folder,'uncreated')}),
  /VERSION_RECEIPT_INVALID/);
 assert.equal(fs.existsSync(path.join(folder,'uncreated')),false);
});
test('invalid family, relative paths and repository-internal output are refused',()=>{
 assert.throws(()=>verifiedFamilyArtifact({family:'service',root:'/tmp',id:'bad'}),/VERSION_INPUT_INVALID/);
 assert.throws(()=>rehearseSyntheticVersions({baselineRoots:{document:'/tmp',quote:'/tmp'},
  outputRoot:'/tmp/versioned'}),/VERSION_INPUT_INVALID/);
 assert.throws(()=>rehearseSyntheticVersions({baselineRoots:{document:'/tmp',quote:'/tmp',inventory:'/tmp'},
  outputRoot:path.resolve(__dirname,'not-a-production-deploy')}),/VERSION_PATH_UNSAFE/);
});
