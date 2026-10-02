"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessDomainAge}=require("./decision");
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
