"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessVendorDomainContinuity}=require("./decision");

const BASE={
  registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:"Example LLC"}},
  rdap:{available:true,registered:true,nameAligned:true,domain:"example.com",events:{
    expiration:"2029-01-19T00:00:00Z",
    lastChanged:"2024-10-17T00:00:00Z"
  }}
};
const clone=v=>JSON.parse(JSON.stringify(v));
const opts={minExpirationDays:180,minStableDays:30,now:"2026-10-02T12:00:00Z"};

test("aligned domain with runway and stability returns stable_domain",()=>{
  const r=assessVendorDomainContinuity(clone(BASE),opts);
  assert.equal(r.decision,"stable_domain");assert.deepEqual(r.reasonCodes,[]);
  assert.ok(r.daysUntilExpiration>=180);assert.ok(r.daysSinceLastChanged>=30);
});
test("expiring domain requires review",()=>{
  const e=clone(BASE);e.rdap.events.expiration="2026-10-20";
  const r=assessVendorDomainContinuity(e,opts);
  assert.ok(r.reasonCodes.includes("DOMAIN_EXPIRATION_RUNWAY_BELOW_THRESHOLD"));
});
test("recently changed domain requires review",()=>{
  const e=clone(BASE);e.rdap.events.lastChanged="2026-09-25";
  const r=assessVendorDomainContinuity(e,opts);
  assert.ok(r.reasonCodes.includes("DOMAIN_CHANGED_TOO_RECENTLY"));
});
test("expiration and recent-change triggers both surface",()=>{
  const e=clone(BASE);e.rdap.events.expiration="2026-10-20";e.rdap.events.lastChanged="2026-09-25";
  assert.deepEqual(
    assessVendorDomainContinuity(e,opts).reasonCodes,
    ["DOMAIN_EXPIRATION_RUNWAY_BELOW_THRESHOLD","DOMAIN_CHANGED_TOO_RECENTLY"]
  );
});
test("domain mismatch requires review",()=>{
  const e=clone(BASE);e.rdap.nameAligned=false;
  assert.ok(assessVendorDomainContinuity(e,opts).reasonCodes.includes("DOMAIN_LEGAL_NAME_MISMATCH"));
});
test("missing authoritative dates require review",()=>{
  const e=clone(BASE);e.rdap.events={};
  assert.deepEqual(
    assessVendorDomainContinuity(e,opts).reasonCodes,
    ["EXPIRATION_DATE_UNAVAILABLE","LAST_CHANGED_DATE_UNAVAILABLE"]
  );
});
