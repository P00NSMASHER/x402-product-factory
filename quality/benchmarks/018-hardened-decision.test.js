"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const hard=require("./018-hardened-decision");
const NOW="2026-10-02T12:00:00Z";
function base(){
 return {
  registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,
    strongCandidateCount:1,identityComplete:true,matchScore:0,
    entity:{businessName:"Example LLC"}},
  ofac:{available:true,query:"Example LLC",minScore:90,
    totalCandidatesAboveThreshold:0,candidates:[]},
  rdap:{available:true,registered:true,nameAligned:true,
    events:{registration:"2020-01-01T00:00:00Z"}}
 };
}
test("strict calendar and RFC3339 source date validation",()=>{
 assert.equal(hard.exactDateMs("2026-02-31"),null);
 assert.equal(hard.exactDateMs("2026-13-01"),null);
 assert.equal(hard.exactDateMs("February 1 2026"),null);
 assert.equal(hard.exactDateMs("2020-01-01T00:00:00Z"),Date.parse("2020-01-01T00:00:00Z"));
});
test("one strong registry match among multiple weak candidates is valid",()=>{
 for(const count of [1,2,3]){
  const evidence=base();evidence.registry.candidateCount=count;
  const r=hard.assessHardenedCounterparty(evidence,{now:NOW});
  assert.equal(r.decision,"proceed");
  assert.deepEqual(r.synthetic_contract_issue_codes,[]);
 }
});
test("actual source-contract contradictions never become automatic proceed",()=>{
 const changes=[
  x=>{x.registry.candidateCount=2;x.registry.strongCandidateCount=2;},
  x=>{x.registry.candidateCount=4;},
  x=>{x.registry.candidateCount=-1;},
  x=>{x.registry.candidateCount=0;},
  x=>{delete x.registry.strongCandidateCount;},
  x=>{x.registry.identityComplete=false;},
  x=>{x.ofac.totalCandidatesAboveThreshold=-1;},
  x=>{x.ofac.candidates=[{score:99}];},
  x=>{x.ofac.totalCandidatesAboveThreshold=1;},
  x=>{delete x.ofac.totalCandidatesAboveThreshold;},
  x=>{x.ofac.query="Another LLC";},
  x=>{x.ofac.minScore=70;},
  x=>{x.rdap.events.registration="2026-02-31";}
 ];
 for(const change of changes){
  const e=base();change(e);
  const r=hard.assessHardenedCounterparty(e,{now:NOW});
  assert.equal(r.decision,"human_review");
  assert.ok(r.synthetic_contract_issue_codes.length>0);
  assert.ok(Object.values(r.checks).some(c=>c.status==="review"));
 }
});
test("coherent records preserve inclusive 90-day registration boundary",()=>{
 const e=base();
 e.rdap.events.registration="2026-07-04";
 assert.equal(hard.assessHardenedCounterparty(e,{now:NOW}).decision,"proceed");
 e.rdap.events.registration="2026-07-05";
 assert.equal(hard.assessHardenedCounterparty(e,{now:NOW}).decision,"human_review");
});
test("offline decision hardening does not load payment or production runtime",()=>{
 const fs=require("node:fs");
 for(const file of ["018-hardened-decision","018-source-contract-v2"]){
  const src=fs.readFileSync(require.resolve("./"+file),"utf8");
  assert.doesNotMatch(src,/packages\/x402|createFactoryRuntime|settleSamePayment|verifyPayment/);
 }
});
