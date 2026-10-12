"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const contract=require("./018-source-contract-v2");
const {REASONS}=contract;
const registry={
  available:true,strongMatch:true,ambiguous:false,entity:{businessName:"Example LLC"},
  candidateCount:1,strongCandidateCount:1,matchScore:0,identityComplete:true
};
const ofac={available:true,query:"Example LLC",minScore:90,totalCandidatesAboveThreshold:0,candidates:[]};
const clone=x=>structuredClone(x);
test("PA adapter can return 2-3 ranked search results while exactly one is strong",()=>{
  for(const n of [1,2,3]){
    const r={...clone(registry),candidateCount:n};
    assert.deepEqual(contract.registryContradictions(r),[]);
  }
  for(const changes of [
    {candidateCount:0},{candidateCount:4},{candidateCount:-1},
    {candidateCount:1.5},{strongCandidateCount:2,candidateCount:2},
    {strongCandidateCount:0},{identityComplete:false},{matchScore:2}
  ]){
    const changed={...clone(registry),...changes};
    assert.ok(contract.registryContradictions(changed).length>0);
  }
});
test("OFAC actual adapter returns a bounded candidate list and independent full count",()=>{
  assert.deepEqual(contract.ofacContradictions(ofac,{legalName:"Example LLC",minScore:90}),[]);
  assert.deepEqual(contract.ofacContradictions({...ofac,totalCandidatesAboveThreshold:4,
    candidates:[{score:99},{score:98},{score:97}]},{legalName:"Example LLC",minScore:90}),[]);
  for(const changes of [
    {totalCandidatesAboveThreshold:-1},
    {totalCandidatesAboveThreshold:0,candidates:[{score:99}]},
    {totalCandidatesAboveThreshold:1,candidates:[]},
    {totalCandidatesAboveThreshold:2,candidates:[{score:99},{score:98},{score:97}]}
  ]){
    assert.ok(contract.ofacContradictions({...ofac,...changes},
      {legalName:"Example LLC",minScore:90}).length>0);
  }
});
test("screening another legal name or threshold cannot count as negative evidence",()=>{
  assert.ok(contract.ofacContradictions({...ofac,query:"Different LLC"},
    {legalName:"Example LLC",minScore:90}).some(x=>x.code===REASONS.OFAC_CONTEXT));
  assert.ok(contract.ofacContradictions({...ofac,minScore:95},
    {legalName:"Example LLC",minScore:90}).some(x=>x.code===REASONS.OFAC_CONTEXT));
  assert.ok(contract.ofacContradictions({...ofac,query:undefined},
    {legalName:"Example LLC",minScore:90}).some(x=>x.code===REASONS.OFAC_CONTEXT));
});
test("RDAP registration timestamps must be valid and not future-dated",()=>{
  assert.equal(contract.exactDateMs("2026-02-31"),null);
  assert.equal(contract.exactDateMs("2026-13-01"),null);
  assert.notEqual(contract.exactDateMs("2020-01-01T00:00:00Z"),null);
  assert.notEqual(contract.exactDateMs("2020-01-01T00:00:00+00:00"),null);
  const base={available:true,registered:true,nameAligned:true,
    events:{registration:"2020-01-01T00:00:00Z"}};
  assert.deepEqual(contract.rdapContradictions(base,{now:"2026-10-02T12:00:00Z"}),[]);
  for(const v of ["2026-02-31","2027-01-01"]){
    assert.ok(contract.rdapContradictions({...base,events:{registration:v}},
      {now:"2026-10-02T12:00:00Z"}).length>0);
  }
});
