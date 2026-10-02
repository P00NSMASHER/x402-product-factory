"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessVendorMaturity}=require("./decision");
const BASE={
  registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:"Example LLC",creationDate:"2020-01-01"}},
  rdap:{available:true,registered:true,nameAligned:true,domain:"example.com",events:{registration:"2015-01-01T00:00:00Z"}}
};
const clone=v=>JSON.parse(JSON.stringify(v));
const opts={minEntityAgeDays:30,minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"};

test("established entity and aligned established domain return established_vendor",()=>{
  const r=assessVendorMaturity(clone(BASE),opts);
  assert.equal(r.decision,"established_vendor");assert.deepEqual(r.reasonCodes,[]);
  assert.ok(r.entityAgeDays>30);assert.ok(r.domainAgeDays>90);
});
test("recent entity requires review even with old domain",()=>{
  const e=clone(BASE);e.registry.entity.creationDate="2026-09-20";
  const r=assessVendorMaturity(e,opts);
  assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("ENTITY_RECENT_FORMATION"));
});
test("recent domain requires review even with old entity",()=>{
  const e=clone(BASE);e.rdap.events.registration="2026-09-20";
  const r=assessVendorMaturity(e,opts);
  assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("DOMAIN_RECENT_REGISTRATION"));
});
test("recent entity and recent domain both surface",()=>{
  const e=clone(BASE);e.registry.entity.creationDate="2026-09-20";e.rdap.events.registration="2026-09-20";
  assert.deepEqual(assessVendorMaturity(e,opts).reasonCodes,["ENTITY_RECENT_FORMATION","DOMAIN_RECENT_REGISTRATION"]);
});
test("domain mismatch requires review",()=>{
  const e=clone(BASE);e.rdap.nameAligned=false;
  assert.ok(assessVendorMaturity(e,opts).reasonCodes.includes("DOMAIN_LEGAL_NAME_MISMATCH"));
});
test("company not found requires human review",()=>{
  const e=clone(BASE);e.registry={available:true,strongMatch:false,ambiguous:false,candidateCount:0,entity:null};
  assert.deepEqual(assessVendorMaturity(e,opts).reasonCodes,["PA_ENTITY_NOT_FOUND"]);
});
