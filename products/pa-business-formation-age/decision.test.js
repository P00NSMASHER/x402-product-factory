"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessFormationAge}=require("./decision");

const entity={businessName:"Example LLC",creationDate:"2020-01-01"};
const base={available:true,strongMatch:true,entity};

test("old entity meets threshold",()=>{
  const r=assessFormationAge(base,{minAgeDays:365,now:"2026-10-02T12:00:00Z"});
  assert.equal(r.decision,"established_entity");
  assert.ok(r.ageDays>365);
});

test("recent entity is below threshold",()=>{
  const r=assessFormationAge({available:true,strongMatch:true,entity:{...entity,creationDate:"2026-09-20"}},{minAgeDays:30,now:"2026-10-02T12:00:00Z"});
  assert.equal(r.decision,"recent_entity");
});

test("no entity returns company_not_found",()=>{
  const r=assessFormationAge({available:true,strongMatch:false,entity:null},{minAgeDays:365,now:"2026-10-02T12:00:00Z"});
  assert.equal(r.decision,"company_not_found");
});

test("ambiguous or weak match requires human review",()=>{
  const r=assessFormationAge({available:true,strongMatch:false,entity},{minAgeDays:365,now:"2026-10-02T12:00:00Z"});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("PA_REGISTRY_MATCH_UNCERTAIN"));
});

test("missing formation date requires human review",()=>{
  const r=assessFormationAge({available:true,strongMatch:true,entity:{...entity,creationDate:null}},{minAgeDays:365,now:"2026-10-02T12:00:00Z"});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("FORMATION_DATE_UNAVAILABLE"));
});
