"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {createCounterpartyReviewService}=require("../../products/pa-vendor-counterparty-review/service");
const {assessHardenedCounterparty}=require("./018-hardened-decision");

const NOW="2026-10-02T12:00:00Z";
function simulatedAdapters(changes={}){
  const calls={registry:0,ofac:0,rdap:0};
  const responses={
    registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,strongCandidateCount:1,identityComplete:true,matchScore:0,
      entity:{businessName:"Example LLC"}},
    ofac:{available:true,query:"Example LLC",minScore:90,totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,domain:"example.com",
      events:{registration:"2020-01-01T00:00:00Z"}}
  };
  for(const [key,value] of Object.entries(changes))responses[key]=value;
  const adapters={
    registry:{async lookup(){calls.registry++;if(responses.registry instanceof Error)throw responses.registry;
      return structuredClone(responses.registry);}},
    ofac:{async lookup(){calls.ofac++;if(responses.ofac instanceof Error)throw responses.ofac;
      return structuredClone(responses.ofac);}},
    rdap:{async lookup(){calls.rdap++;if(responses.rdap instanceof Error)throw responses.rdap;
      return structuredClone(responses.rdap);}}
  };
  return {calls,adapters};
}
async function run(changes={}){
  const f=simulatedAdapters(changes);
  const service=createCounterpartyReviewService({...f.adapters,now:()=>NOW});
  const input={company:"Example LLC",domain:"example.com",minScore:90,minDomainAgeDays:90};
  const actual=await service.check(input);
  const proposal=assessHardenedCounterparty(actual.evidence,{now:NOW});
  return {actual,proposal,calls:f.calls};
}
test("source-contract replay catches contradictory unique-registry status",async()=>{
  const x=await run({registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:2,strongCandidateCount:2,identityComplete:true,matchScore:0,
    entity:{businessName:"Example LLC"}}});
  assert.deepEqual(x.calls,{registry:1,ofac:0,rdap:0});
  assert.equal(x.actual.decision,"human_review");
  assert.equal(x.actual.chargeable,false);
  assert.deepEqual(x.actual.sourceFailures.map(e=>e.source),["pa_registry"]);
  assert.equal(x.proposal.decision,"human_review");
  assert.ok(x.proposal.reasonCodes.includes("PA_REGISTRY_STRONG_MATCH_INCONSISTENT"));
});
test("adapter-consistent two ranked PA candidates with one strong match remain valid",async()=>{
 const f=simulatedAdapters({registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:2,
    strongCandidateCount:1,identityComplete:true,matchScore:0,entity:{businessName:"Example LLC"}}});
 const result=await createCounterpartyReviewService({...f.adapters,now:()=>NOW}).check({
    company:"Example LLC",domain:"example.com",minScore:90,minDomainAgeDays:90
 });
 assert.equal(assessHardenedCounterparty(result.evidence,{now:NOW}).decision,"proceed");
});
test("source-contract replay catches negative OFAC candidate tally",async()=>{
  const x=await run({ofac:{available:true,totalCandidatesAboveThreshold:-1,candidates:[]}});
  assert.deepEqual(x.calls,{registry:1,ofac:1,rdap:1});
  assert.equal(x.actual.decision,"human_review");
  assert.equal(x.actual.chargeable,false);
  assert.deepEqual(x.actual.sourceFailures.map(e=>e.source),["ofac_sdn"]);
  assert.equal(x.proposal.decision,"human_review");
  assert.ok(x.proposal.reasonCodes.includes("OFAC_CANDIDATE_COUNTS_INCONSISTENT"));
});
test("registry transport failure prevents dependent source calls and is nonchargeable",async()=>{
  const x=await run({registry:new Error("fixture source unavailable")});
  assert.deepEqual(x.calls,{registry:1,ofac:0,rdap:0});
  assert.equal(x.actual.chargeable,false);
  assert.equal(x.actual.decision,"human_review");
  assert.equal(x.proposal.decision,"human_review");
});
test("OFAC outage remains nonchargeable even with coherent RDAP",async()=>{
  const x=await run({ofac:new Error("synthetic timeout")});
  assert.deepEqual(x.calls,{registry:1,ofac:1,rdap:1});
  assert.equal(x.actual.chargeable,false);
  assert.equal(x.actual.decision,"human_review");
  assert.equal(x.proposal.decision,"human_review");
});
test("normal registry OFAC and RDAP evidence remains unchanged in offline candidate",async()=>{
  const x=await run();
  assert.deepEqual(x.calls,{registry:1,ofac:1,rdap:1});
  assert.equal(x.actual.decision,"proceed");
  assert.equal(x.proposal.decision,"proceed");
  assert.deepEqual(x.proposal.synthetic_contract_issue_codes,[]);
});
test("impossible calendar date must not be accepted as established domain",async()=>{
  const x=await run({rdap:{available:true,registered:true,domain:"example.com",
    events:{registration:"2026-02-31"}}});
  assert.equal(x.actual.decision,"human_review");
  assert.equal(x.actual.chargeable,false);
  assert.deepEqual(x.actual.sourceFailures.map(e=>e.source),["rdap"]);
  assert.equal(x.proposal.decision,"human_review");
  assert.ok(x.proposal.reasonCodes.includes("DOMAIN_REGISTRATION_DATE_INVALID"));
});
