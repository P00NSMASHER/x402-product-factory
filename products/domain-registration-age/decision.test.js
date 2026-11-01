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


test("RFC3339 time-zone offsets map to the actual UTC registration day",()=>{
  assert.equal(dateOnlyMs("2026-03-03T23:45:00-05:00"),Date.parse("2026-03-04T00:00:00Z"));
  assert.equal(dateOnlyMs("2026-03-03T00:30:00+14:00"),Date.parse("2026-03-02T00:00:00Z"));
  assert.equal(dateOnlyMs("2026-03-04T00:10:00+14:00"),Date.parse("2026-03-03T00:00:00Z"));
  assert.equal(dateOnlyMs("2026-03-03T00:00:00z"),Date.parse("2026-03-03T00:00:00Z"));
});

test("future date after UTC offset conversion must not pass as a historical registration",()=>{
  const result=assessDomainAge(
    {available:true,registered:true,events:{registration:"2026-03-03T23:45:00-05:00"}},
    {now:"2026-03-03T23:59:00Z"}
  );
  assert.equal(result.decision,"human_review");
  assert.deepEqual(result.reasonCodes,["REGISTRATION_DATE_IN_FUTURE"]);
  assert.equal(result.ageDays,null);
  const alreadyRegistered=assessDomainAge(
    {available:true,registered:true,events:{registration:"2026-03-04T00:10:00+14:00"}},
    {now:"2026-03-03T23:59:00Z"}
  );
  assert.equal(alreadyRegistered.decision,"recent_registration");
  assert.equal(alreadyRegistered.ageDays,0);
});

test("registration timestamps cannot hide malformed suffixes or clock fields",()=>{
  for(const malformed of [
    "2026-03-03not-really-a-date",
    "2026-03-03T99:99:99Z",
    "2026-03-03T23:61:00Z",
    "2026-03-03T00:00:00+24:00",
    "2026-03-03T00:00:00+00:99",
    "2026-02-30T00:00:00Z",
    "2026-03-03T12:00:00",
  ]){
    assert.equal(dateOnlyMs(malformed),null,malformed);
    const verdict=assessDomainAge(
      {available:true,registered:true,events:{registration:malformed}},
      {now:"2026-03-04T00:00:00Z"}
    );
    assert.equal(verdict.decision,"human_review",malformed);
    assert.ok(verdict.reasonCodes.includes("REGISTRATION_DATE_UNAVAILABLE"),malformed);
  }
});
