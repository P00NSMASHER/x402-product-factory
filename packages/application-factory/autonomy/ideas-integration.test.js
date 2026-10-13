'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {planCycle,runCycle}=require('./loop');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),STEP=21600000;
const at=n=>new Date(EPOCH+n*STEP).toISOString();
const sourceDate='2026-10-13';
const idea=(cycle,adjust={})=>({
 schemaVersion:1,cycle,
 hypothesis:{
  customerProblem:'Regional service operators lose time locating checked-out equipment and certificates.',
  buyerTrigger:'A maintenance department needs a replacement loaner item for a field assignment.',
  expensiveFailure:'Delayed custody evidence prevents the release of ready equipment to the next job.',
  discoveryQuestion:'How do your coordinators find current equipment custody and service approval records?',
  differentiator:'Unify custody registers, safety release checks and dispatch handoff status in one queue.',
  status:'unverified'
 },
 sources:[{url:'https://www.osha.gov/laws-regs',observedOn:sourceDate},
          {url:'https://www.sba.gov/business-guide',observedOn:sourceDate}],
 recipe:{version:1,family:'document-workflow',id:'equipment-custody-cycle-'+cycle,title:'Equipment Custody Cycle '+cycle,
  buyer:'Equipment dispatch coordinators at small maintenance organizations',
  outcome:'Track custody checklists and dated safe-to-release references for loaner equipment.',
  recordLabel:'Equipment item',defaultDueDays:7,reminderEveryDays:3,renewalWindowDays:22,
  requirements:[
   {id:'custody-register',label:'Custody history record',renewable:false},
   {id:'postuse-inspection',label:'Return inspection receipt',renewable:true},
   {id:'dispatch-authorization',label:'Dispatch release form',renewable:false},
   {id:'service-condition-report',label:'Service condition report',renewable:false}
  ]},...adjust
});
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'factory-blueprint-integration-'));
 const ideas=path.join(directory,'ideas'),outputRoot=path.join(directory,'output');
 fs.mkdirSync(ideas,{mode:0o700});t.after(()=>fs.rmSync(directory,{force:true,recursive:true}));
 return {ideas,outputRoot,save:(cycle,payload=idea(cycle))=>fs.writeFileSync(path.join(ideas,'cycle-'+cycle+'.json'),JSON.stringify(payload)+'\n')};
}
test('normal first 72 slots keep their original deterministic product selections',t=>{
 const f=fixture(t);f.save(72);
 const r=planCycle({at:at(4),blueprintDirectory:f.ideas});
 assert.equal(r.recipes.length,1);assert.equal(r.cycle,4);assert.match(r.recipes[0].id,/^[a-z]+/);
 assert.notEqual(r.recipes[0].id,'equipment-custody-cycle-72');
});
test('after original catalog exhausts, a freshly researched blueprint is admitted for its exact slot',t=>{
 const f=fixture(t);f.save(72);
 const r=planCycle({at:at(72),blueprintDirectory:f.ideas});
 assert.equal(r.recipes.length,1);assert.equal(r.recipes[0].id,'equipment-custody-cycle-72');
 assert.equal(r.exhausted,false);assert.equal(r.releaseApproved,false);assert.equal(r.marketValidated,false);
 const absent=planCycle({at:at(73),blueprintDirectory:f.ideas});
 assert.equal(absent.exhausted,true);assert.equal(absent.recipes.length,0);
});
test('new idea can be accepted after missed slots instead of permanently exhausting the machine',t=>{
 const f=fixture(t);f.save(80,idea(80));
 assert.equal(planCycle({at:at(79),blueprintDirectory:f.ideas}).exhausted,true);
 assert.equal(planCycle({at:at(80),blueprintDirectory:f.ideas}).recipes[0].id,'equipment-custody-cycle-80');
});
test('real packaged candidate is compiled, tested and committed without a customer',t=>{
 const f=fixture(t);f.save(72);
 const r=runCycle({at:at(72),blueprintDirectory:f.ideas,outputRoot:f.outputRoot});
 assert.equal(r.planned,1);assert.equal(r.accepted,1);assert.equal(r.failed,0);
 assert.equal(r.verification,'executed-packaged-workflow');
 assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
 assert.equal(r.releaseApproved,false);assert.equal(r.transmittedMessages,0);
 assert.equal(r.artifacts.length,1);assert.equal(r.artifacts[0].status,'accepted');
 const second=runCycle({at:at(72),blueprintDirectory:f.ideas,outputRoot:f.outputRoot});
 assert.equal(second.reused,1);assert.equal(second.accepted,1);
});
test('changing an admitted blueprint after a cycle has a receipt cannot silently rewrite it',t=>{
 const f=fixture(t);f.save(72);
 const r=runCycle({at:at(72),blueprintDirectory:f.ideas,outputRoot:f.outputRoot});
 assert.equal(r.accepted,1);
 const changed=idea(72);changed.recipe.defaultDueDays=8;f.save(72,changed);
 assert.throws(()=>runCycle({at:at(72),blueprintDirectory:f.ideas,outputRoot:f.outputRoot}),/CYCLE_SOURCE_DRIFT/);
});
