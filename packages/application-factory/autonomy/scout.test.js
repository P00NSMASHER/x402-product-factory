'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadScoutedLeads,inspectScout}=require('./scout');
const {planCycle,runCycle}=require('./loop');
const SOURCE=path.join(__dirname,'scout','leads.json');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const at=c=>new Date(EPOCH+c*SLOT).toISOString();
const temp=t=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'factory-scout-tests-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
test('three freshly researched leads generate distinct future apps without slot-by-slot operator drafting',()=>{
 const rows=loadScoutedLeads();
 assert.deepEqual(rows.map(r=>r.cycle),[75,76,77]);
 assert.equal(new Set(rows.map(r=>r.recipe.id)).size,3);
 assert.ok(rows.every(r=>r.readinessScore>=70&&r.status==='admitted-unverified'));
 assert.ok(rows.every(r=>r.sources.length===2&&r.sourceVerification==='operator_provided_unverified'));
 for(const row of rows){
  const plan=planCycle({at:at(row.cycle)});
  assert.equal(plan.recipes.length,1);assert.equal(plan.recipes[0].id,row.recipe.id);
  assert.equal(plan.ideaDigest,row.digest);assert.equal(plan.exhausted,false);
  assert.equal(plan.releaseApproved,false);
 }
 const summary=inspectScout();
 assert.equal(summary.eligible,3);assert.equal(summary.independentMarketEvidence,false);
 assert.equal(summary.marketValidated,false);assert.equal(summary.collectedRevenue,null);
 assert.equal(planCycle({at:at(78)}).exhausted,true);
});
test('original reviewed exact-cycle idea keeps precedence without reordering future leads',t=>{
 const root=temp(t),folder=path.join(root,'ideas');fs.mkdirSync(folder);
 const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'ideas','cycle-74.json'),'utf8'));
 seed.cycle=75;seed.recipe.id='manifest-exception-reviewed-75';
 fs.writeFileSync(path.join(folder,'cycle-75.json'),JSON.stringify(seed));
 const rows=loadScoutedLeads({blueprintDirectory:folder});
 assert.equal(rows[0].status,'overridden-by-exact-blueprint');
 assert.equal(rows[1].cycle,76);assert.equal(rows[1].recipe.id,'refrigerant-transfer-review');
 assert.equal(planCycle({at:at(75),blueprintDirectory:folder}).recipes[0].id,'manifest-exception-reviewed-75');
});
test('scout cannot inject executable code or duplicate previously reserved problem identity',t=>{
 const root=temp(t),input=JSON.parse(fs.readFileSync(SOURCE,'utf8')),target=path.join(root,'leads.json');
 input.leads[1].recipe.requirements=input.leads[0].recipe.requirements;
 fs.writeFileSync(target,JSON.stringify(input));
 assert.throws(()=>loadScoutedLeads({sourceFile:target}),/SCOUT_IDEA_INVALID/);
 const bad=JSON.parse(fs.readFileSync(SOURCE,'utf8'));
 bad.leads[0].recipe.requirements[0].label='<script>attack</script>';
 fs.writeFileSync(target,JSON.stringify(bad));
 assert.throws(()=>loadScoutedLeads({sourceFile:target}),/SCOUT_IDEA_INVALID/);
});
test('source URLs, missing disclaimers, corrupt queue and symlinked sources fail closed',t=>{
 const root=temp(t),target=path.join(root,'leads.json');
 const payload=JSON.parse(fs.readFileSync(SOURCE,'utf8'));
 payload.leads[0].sources[0].url='https://localhost/private';fs.writeFileSync(target,JSON.stringify(payload));
 assert.throws(()=>loadScoutedLeads({sourceFile:target}),/SCOUT_SOURCE_INVALID/);
 const v=JSON.parse(fs.readFileSync(SOURCE,'utf8'));v.leads[0].recipe.outcome='This app certifies all safety requirements.';
 fs.writeFileSync(target,JSON.stringify(v));
 assert.throws(()=>loadScoutedLeads({sourceFile:target}),/SCOUT_RISK_DISCLOSURE_MISSING/);
 fs.writeFileSync(target,'{invalid-json'+ ' '.repeat(128));assert.throws(()=>loadScoutedLeads({sourceFile:target}),/SCOUT_INVALID/);
 fs.rmSync(target);fs.symlinkSync(SOURCE,target);
 assert.throws(()=>loadScoutedLeads({sourceFile:target}),/SCOUT_PATH_UNSAFE/);
});
test('real generated scout slot is packaged, exercised and reused without a duplicate app',t=>{
 if(process.platform==='win32')return t.skip('Linux packaged recovery acceptance is required');
 const root=temp(t);
 const first=runCycle({at:at(75),outputRoot:root});
 assert.equal(first.accepted,1);assert.equal(first.failed,0);
 assert.equal(first.verification,'executed-packaged-workflow');
 const second=runCycle({at:at(75),outputRoot:root});
 assert.equal(second.reused,1);assert.equal(second.artifacts[0].artifact,first.artifacts[0].artifact);
 assert.equal(second.realCustomers,null);assert.equal(second.releaseApproved,false);
});
