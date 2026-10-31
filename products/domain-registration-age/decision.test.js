"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessDomainAge,dateOnlyMs}=require("./decision");
test("old registration is established",()=>{
 const r=assessDomainAge({available:true,registered:true,events:{registration:"2020-01-01T00:00:00Z"}},{minAgeDays:90,now:"2026-10-02T12:00:00Z"});
 assert.equal(r.decision,"established");assert.ok(r.ageDays>90);
});
test("recent registration is recent_registration",()=>{
 const r=assessDomainAge({available:true,registered:true,events:{registration:"2026-09-15T00:00:00Z"}},{minAgeDays:90,now:"2026-10-02T12:00:00Z"});
 assert.equal(r.decision,"recent_registration");
});
test("cutoff date counts as established",()=>{
 const r=assessDomainAge({available:true,registered:true,events:{registration:"2026-07-04T22:00:00Z"}},{minAgeDays:90,now:"2026-10-02T23:59:00Z"});
 assert.equal(r.cutoffDate,"2026-07-04");assert.equal(r.decision,"established");
});
test("valid unregistered result is explicit",()=>{
 const r=assessDomainAge({available:true,registered:false,events:{}},{minAgeDays:90,now:"2026-10-02T12:00:00Z"});
 assert.equal(r.decision,"unregistered");
});
test("missing registration event requires human review",()=>{
 const r=assessDomainAge({available:true,registered:true,events:{}},{minAgeDays:90,now:"2026-10-02T12:00:00Z"});
 assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("REGISTRATION_DATE_UNAVAILABLE"));
});

test("invalid calendar dates are rejected rather than silently normalized",()=>{
  assert.equal(dateOnlyMs("2026-02-30"),null);
  assert.equal(dateOnlyMs("2025-02-29"),null);
  const r=assessDomainAge(
    {available:true,registered:true,events:{registration:"2026-02-30T10:00:00Z"}},
    {minAgeDays:90,now:"2026-03-03T12:00:00Z"}
  );
  assert.equal(r.decision,"human_review");
  assert.equal(r.ageDays,null);
  assert.ok(r.reasonCodes.includes("REGISTRATION_DATE_UNAVAILABLE"));
});

test("future registration dates require human review rather than negative age",()=>{
  const r=assessDomainAge(
    {available:true,registered:true,events:{registration:"2026-03-04T00:00:00Z"}},
    {minAgeDays:90,now:"2026-03-03T12:00:00Z"}
  );
  assert.equal(r.decision,"human_review");
  assert.equal(r.registrationDate,null);
  assert.equal(r.ageDays,null);
  assert.deepEqual(r.reasonCodes,["REGISTRATION_DATE_IN_FUTURE"]);
});

test("valid leap-day registration and full RDAP timestamps retain their meaning",()=>{
  const r=assessDomainAge(
    {available:true,registered:true,events:{registration:"2024-02-29T15:10:00Z"}},
    {minAgeDays:90,now:"2024-03-01T12:00:00Z"}
  );
  assert.equal(r.decision,"recent_registration");
  assert.equal(r.registrationDate,"2024-02-29");
  assert.equal(r.ageDays,1);
  assert.equal(dateOnlyMs("2024-02-29"),Date.parse("2024-02-29T00:00:00Z"));
});

test("same-day and established registration outcomes remain unchanged",()=>{
  const sameDay=assessDomainAge(
    {available:true,registered:true,events:{registration:"2026-03-03"}},
    {minAgeDays:90,now:"2026-03-03T12:00:00Z"}
  );
  assert.equal(sameDay.decision,"recent_registration");
  assert.equal(sameDay.ageDays,0);
  const old=assessDomainAge(
    {available:true,registered:true,events:{registration:"2007-01-19T15:00:00Z"}},
    {minAgeDays:90,now:"2026-03-03T12:00:00Z"}
  );
  assert.equal(old.decision,"established");
});
