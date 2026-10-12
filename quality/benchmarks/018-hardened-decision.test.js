"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const hard=require("./018-hardened-decision");

test("strict date parser refuses impossible, future and wrong shapes",()=>{
  assert.equal(hard.exactDateMs("2026-02-31"),null);
  assert.equal(hard.exactDateMs("2026-13-01"),null);
  assert.equal(hard.exactDateMs("February 1 2026"),null);
  assert.equal(hard.exactDateMs("2020-01-01T00:00:00Z"),Date.parse("2020-01-01T00:00:00Z"));
});
test("hardened decision cannot transform registry or OFAC count contradictions into permission",()=>{
  const base={
    registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:"Example LLC"}},
    ofac:{available:true,totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,nameAligned:true,events:{registration:"2020-01-01"}}
  };
  for(const change of [
    x=>{x.registry.candidateCount=2;},
    x=>{x.registry.candidateCount=-1;},
    x=>{x.registry.candidateCount=0;},
    x=>{x.ofac.totalCandidatesAboveThreshold=-1;},
    x=>{x.ofac.candidates=[{score:99}];},
    x=>{delete x.ofac.totalCandidatesAboveThreshold;},
    x=>{x.rdap.events.registration="2026-02-31";}
  ]){
    const x=structuredClone(base);change(x);
    const r=hard.assessHardenedCounterparty(x);
    assert.equal(r.decision,"human_review");
    assert.ok(r.synthetic_contract_issue_codes.length>0);
    assert.ok(r.checks.registry?.status==="review"||
      r.checks.ofac?.status==="review"||r.checks.domain?.status==="review");
  }
});
test("normal evidence and boundary dates preserve inherited reason decisions",()=>{
  const x={
    registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:"Example LLC"}},
    ofac:{available:true,totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,nameAligned:true,events:{registration:"2020-01-01"}}
  };
  const base=hard.assessHardenedCounterparty(x);
  assert.equal(base.decision,"proceed");
  assert.deepEqual(base.synthetic_contract_issue_codes,[]);
  x.rdap.events.registration="2026-07-04";
  assert.equal(hard.assessHardenedCounterparty(x).decision,"proceed");
  x.rdap.events.registration="2026-07-05";
  assert.equal(hard.assessHardenedCounterparty(x).decision,"human_review");
});
test("hardened quality code does not import product runtime or payment infrastructure",()=>{
  const fs=require("node:fs");
  const src=fs.readFileSync(require.resolve("./018-hardened-decision"),"utf8");
  assert.doesNotMatch(src,/packages\/x402|createFactoryRuntime|settleSamePayment|verifyPayment/);
});
