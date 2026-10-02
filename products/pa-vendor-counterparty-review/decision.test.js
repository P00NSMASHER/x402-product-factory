"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessCounterpartyReview}=require("./decision");

const BASE={
  registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:"Example LLC"}},
  ofac:{available:true,totalCandidatesAboveThreshold:0,candidates:[]},
  rdap:{available:true,registered:true,nameAligned:true,domain:"example.com",events:{registration:"2020-01-01T00:00:00Z"}}
};
const clone=v=>JSON.parse(JSON.stringify(v));
const opts={minScore:90,minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"};

test("all checks passing returns proceed",()=>{
  const r=assessCounterpartyReview(clone(BASE),opts);
  assert.equal(r.decision,"proceed");assert.deepEqual(r.reasonCodes,[]);assert.ok(r.domainAgeDays>90);
});
test("OFAC candidate requires human review",()=>{
  const e=clone(BASE);e.ofac.totalCandidatesAboveThreshold=1;e.ofac.candidates=[{score:96}];
  const r=assessCounterpartyReview(e,opts);
  assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("OFAC_CANDIDATE_REQUIRES_REVIEW"));
});
test("recent aligned domain requires human review",()=>{
  const e=clone(BASE);e.rdap.events.registration="2026-09-20T00:00:00Z";
  const r=assessCounterpartyReview(e,opts);
  assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("DOMAIN_RECENT_REGISTRATION"));
});
test("domain legal-name mismatch requires human review",()=>{
  const e=clone(BASE);e.rdap.nameAligned=false;
  assert.ok(assessCounterpartyReview(e,opts).reasonCodes.includes("DOMAIN_LEGAL_NAME_MISMATCH"));
});
test("OFAC candidate and recent domain both surface deterministically",()=>{
  const e=clone(BASE);e.ofac.totalCandidatesAboveThreshold=1;e.rdap.events.registration="2026-09-20";
  const r=assessCounterpartyReview(e,opts);
  assert.deepEqual(r.reasonCodes,["OFAC_CANDIDATE_REQUIRES_REVIEW","DOMAIN_RECENT_REGISTRATION"]);
});
test("company not found is human review, never automatic reject",()=>{
  const e=clone(BASE);e.registry={available:true,strongMatch:false,ambiguous:false,candidateCount:0,entity:null};
  const r=assessCounterpartyReview(e,opts);
  assert.equal(r.decision,"human_review");assert.deepEqual(r.reasonCodes,["PA_ENTITY_NOT_FOUND"]);
});
test("source-unavailable evidence becomes human review",()=>{
  const e=clone(BASE);e.ofac={available:false};e.rdap={available:false};
  const r=assessCounterpartyReview(e,opts);
  assert.deepEqual(r.reasonCodes,["OFAC_EVIDENCE_UNAVAILABLE","RDAP_EVIDENCE_UNAVAILABLE"]);
});
