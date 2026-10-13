'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {runCycle}=require('./loop');
const {verifyApplication}=require('../manufacturing/assembler');
const {CHECKS}=require('../manufacturing/acceptance');
let fleet={};try{fleet=require('./fleet');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),TICK=21600000,at=n=>new Date(EPOCH+n*TICK).toISOString();
const setup=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-fleet-ledger-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const fixture=(dir,digest)=>{const m=verifyApplication(dir,digest);return {kind:'assembled-application-acceptance',
 passed:true,recipeId:m.recipeId,artifactDigest:digest,...Object.fromEntries(CHECKS.map(k=>[k,true])),
 externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};};
test('fleet marks true verified work separately from missing builds',t=>{
 const root=setup(t);runCycle({at:at(0),outputRoot:root});
 assert.equal(typeof fleet.buildFleet,'function','missing fleet ledger engine');
 const result=fleet.buildFleet({outputRoot:root,at:at(1),lookbackCycles:2});
 assert.equal(result.kind,'autonomous-factory-fleet');assert.equal(result.summary.verifiedApps,1);
 assert.equal(result.summary.pendingApps,1);assert.equal(result.summary.quarantinedApps,0);
 assert.equal(result.apps.length,2);assert.equal(result.apps[0].state,'verified');
 assert.equal(result.apps[1].state,'pending');
 assert.equal(result.collectedRevenue,null);assert.equal(result.realCustomers,null);
 assert.equal(result.marketValidated,false);assert.equal(result.releaseApproved,false);
 assert.equal(result.outreachEnabled,false);assert.equal(result.transmittedMessages,0);
});
test('injected fixture-only acceptance is not a verified fleet app',t=>{
 const root=setup(t);runCycle({at:at(0),outputRoot:root,accept:fixture});
 const report=fleet.buildFleet({outputRoot:root,at:at(0),lookbackCycles:1});
 assert.equal(report.summary.verifiedApps,0);
 assert.equal(report.summary.unverifiedFixtures,1);
 assert.equal(report.apps[0].state,'needs-real-acceptance');
});
test('quarantined candidate does not count toward app production',t=>{
 const root=setup(t);runCycle({at:at(0),outputRoot:root,accept:()=>{throw Error('fixture');}});
 const report=fleet.buildFleet({outputRoot:root,at:at(0),lookbackCycles:1});
 assert.equal(report.summary.quarantinedApps,1);assert.equal(report.summary.verifiedApps,0);
 assert.equal(report.apps[0].state,'quarantined');
});
test('unavailable researched slot means idea missing rather than an imaginary app',t=>{
 const root=setup(t);const report=fleet.buildFleet({outputRoot:root,at:at(80),lookbackCycles:1});
 assert.equal(report.summary.missingIdeas,1);assert.equal(report.summary.verifiedApps,0);
 assert.equal(report.apps[0].state,'research-required');
});
test('tampered cycle receipt is never shown as a successful build',t=>{
 const root=setup(t);runCycle({at:at(0),outputRoot:root});
 const receipt=path.join(root,'autonomy','cycle-0.json');
 fs.appendFileSync(receipt,'INVALID');
 assert.throws(()=>fleet.buildFleet({outputRoot:root,at:at(0),lookbackCycles:1}),/FLEET_INTEGRITY_INVALID/);
});
test('report is deterministic, bounded and does not fetch from a remote service',t=>{
 const root=setup(t),a=fleet.buildFleet({outputRoot:root,at:at(10),lookbackCycles:5});
 const b=fleet.buildFleet({outputRoot:root,at:at(10),lookbackCycles:5});
 assert.deepEqual(a,b);assert.equal(a.apps.length,5);
 for(const lookbackCycles of [0,65,-1,'4'])assert.throws(
 ()=>fleet.buildFleet({outputRoot:root,at:at(10),lookbackCycles}),/FLEET_CONFIG_INVALID/);
});
test('fleet preview is static, mobile responsive and contains no checkout or outbound messaging',t=>{
 const root=setup(t),r=fleet.buildFleet({outputRoot:root,at:at(0),lookbackCycles:1});
 assert.equal(typeof fleet.renderFleetHtml,'function');
 const html=fleet.renderFleetHtml(r);
 assert.match(html,/Autonomous Factory Fleet/);assert.match(html,/Content-Security-Policy/);
 assert.match(html,/viewport/);assert.doesNotMatch(html,/<script\b|<form\b|fetch\(|mailto:|checkout|stripe|http:/i);
 assert.equal(fleet.renderFleetHtml(r),html);
});
test('fleet cannot certify tampered release approvals in renderer input',t=>{
 const root=setup(t),r=fleet.buildFleet({outputRoot:root,at:at(0),lookbackCycles:1});
 for(const override of [{releaseApproved:true},{collectedRevenue:100},{marketValidated:true}]){
  assert.throws(()=>fleet.renderFleetHtml({...r,...override}),/FLEET_INVALID/);
 }
});
