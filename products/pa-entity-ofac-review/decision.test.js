"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessPaEntityOfacReview}=require("./decision");

const entity={businessName:"Example Holdings LLC",filingNumber:"123"};
function registry(overrides={}){return{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity,...overrides};}

test("resolved legal entity with no OFAC candidate returns no_candidate",()=>{
  const r=assessPaEntityOfacReview({
    registry:registry(),
    ofac:{available:true,totalCandidatesAboveThreshold:0,candidates:[]}
  },{minScore:90});
  assert.equal(r.decision,"no_candidate");
  assert.equal(r.screenedName,"Example Holdings LLC");
});

test("OFAC candidate returns candidate_found without automatic rejection",()=>{
  const candidate={uid:"1",primaryName:"EXAMPLE HOLDINGS",score:94};
  const r=assessPaEntityOfacReview({
    registry:registry(),
    ofac:{available:true,totalCandidatesAboveThreshold:1,candidates:[candidate]}
  },{minScore:90});
  assert.equal(r.decision,"candidate_found");
  assert.equal(r.candidateCount,1);
  assert.deepEqual(r.candidates,[candidate]);
});

test("no PA entity is explicit company_not_found and does not require OFAC evidence",()=>{
  const r=assessPaEntityOfacReview({
    registry:registry({strongMatch:false,candidateCount:0,entity:null}),
    ofac:null
  },{minScore:90});
  assert.equal(r.decision,"company_not_found");
});

test("ambiguous PA entity requires human review",()=>{
  const r=assessPaEntityOfacReview({
    registry:registry({strongMatch:false,ambiguous:true,candidateCount:2}),
    ofac:null
  },{minScore:90});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("PA_REGISTRY_MATCH_AMBIGUOUS"));
});

test("OFAC source unavailable after registry match requires human review",()=>{
  const r=assessPaEntityOfacReview({
    registry:registry(),
    ofac:{available:false}
  },{minScore:90});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("OFAC_EVIDENCE_UNAVAILABLE"));
});
