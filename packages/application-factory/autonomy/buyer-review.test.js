'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {reviewFactoryOpportunities}=require('./buyer-review');
const {loadScoutedLeads}=require('./scout');
const {loadOpportunities}=require('./cross-family');

test('unified source-pinned review covers eleven genuinely different apps',()=>{
 const report=reviewFactoryOpportunities();
 assert.equal(report.kind,'unified-operator-buyer-evidence-review');
 assert.equal(report.totalReviewPackets,11);
 assert.deepEqual(report.familyCounts,{
  'document-workflow':3,'quote-to-order':4,'inventory-control':4,
 });
 assert.equal(new Set(report.packets.map(x=>x.id)).size,11);
 assert.equal(report.independentExternalBuyerEvidence,false);
 assert.equal(report.measuredRealBuyerPain,null);
 assert.equal(report.collectedRevenue,null);
 assert.equal(report.realCustomers,null);
 assert.equal(report.externalMessagesSent,0);
 assert.equal(report.paymentsSent,0);
 assert.equal(report.releaseApproved,false);
 assert.equal(report.publicDeploymentEnabled,false);
 assert.equal(report.autoApprove,false);
 const digests=new Map([
  ...loadScoutedLeads().filter(x=>x.status==='admitted-unverified')
   .map(x=>[x.recipe.id,x.digest]),
  ...loadOpportunities().map(x=>[x.key,x.proposalDigest]),
 ]);
 for(const row of report.packets){
  assert.match(row.sourceDigest,/^[0-9a-f]{64}$/);
  assert.equal(row.sourceDigest,digests.get(row.id));
  assert.equal(row.sourceUrls.length,2);
  assert.ok(row.sourceUrls.every(url=>url.startsWith('https://')));
  assert.ok(row.proposedJob.length>30&&row.proposedBuyer.length>10);
  assert.ok(row.interviewQuestion.includes('?'));
  assert.ok(row.disconfirmationRule.includes('Reject or revise'));
  assert.equal(row.existingBuyerEvidence,'NOT_COLLECTED');
  assert.equal(row.confirmedConversations,null);
  assert.equal(row.verifiedWorkflowCompletions,null);
  assert.equal(row.verifiedRevenue,null);
  assert.equal(row.externalContactPermitted,false);
  assert.equal(row.consentRequiredForAnyRealEvaluation,true);
  assert.equal(row.minimumInitialConversations,3);
  assert.equal(row.buyerDemandValidated,false);
  assert.equal(row.deploymentApproved,false);
 }
});
test('changed unverified source cannot reuse previously printed source digest',t=>{
 const original=loadOpportunities();
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-review-suite-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'cross-family','proposals.json'),'utf8'));
 fixture.proposals[0].problem+=' This requires an independent buyer review.';
 const file=path.join(root,'proposals.json');
 fs.writeFileSync(file,JSON.stringify(fixture));
 const report=reviewFactoryOpportunities({crossFamily:{sourceFile:file}});
 const changed=report.packets.find(x=>x.id===original[0].key);
 assert.notEqual(changed.sourceDigest,original[0].proposalDigest);
 assert.equal(changed.buyerDemandValidated,false);
});
test('fabricated demand status fails closed before emitting review packets',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-review-hostile-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const input=JSON.parse(fs.readFileSync(path.join(__dirname,'cross-family','proposals.json'),'utf8'));
 input.proposals[0].sourceStatus='paid_buyers_verified';
 const file=path.join(root,'bad.json');fs.writeFileSync(file,JSON.stringify(input));
 assert.throws(()=>reviewFactoryOpportunities({crossFamily:{sourceFile:file}}),/OPPORTUNITY_INVALID/);
});
test('CLI exposes only read-only check; denies sending, billing and deployment',()=>{
 const script=path.resolve(__dirname,'../../../scripts/review-factory-opportunities.js');
 const call=(...args)=>spawnSync(process.execPath,[script,...args],
  {encoding:'utf8',timeout:15000});
 const good=call('--check');
 assert.equal(good.status,0,good.stderr);
 assert.equal(JSON.parse(good.stdout).totalReviewPackets,11);
 for(const args of [['--send'],['--deploy'],['--email'],['--charge'],['--write','out']])
  assert.notEqual(call(...args).status,0,args.join(' '));
});
