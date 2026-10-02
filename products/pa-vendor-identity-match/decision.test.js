"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const { assessVendorIdentity }=require("./decision");

const PASSING=Object.freeze({
  registry:{available:true,strongMatch:true,entity:{businessName:"Example LLC",filingNumber:"123"}},
  address:{available:true,suppliedMatched:true,registryMatched:true,sameStreetNumber:true,sameZip:true,distanceMiles:0.10},
  rdap:{available:true,registered:true,nameAligned:true}
});
const clone=(v)=>JSON.parse(JSON.stringify(v));

test("all identity checks passing returns consistent",()=>assert.equal(assessVendorIdentity(clone(PASSING)).decision,"consistent"));
test("uncertain registry match requires review",()=>{const e=clone(PASSING);e.registry.strongMatch=false;assert.equal(assessVendorIdentity(e).decision,"human_review");});
test("street number mismatch requires review",()=>{const e=clone(PASSING);e.address.sameStreetNumber=false;assert.ok(assessVendorIdentity(e).reasonCodes.includes("ADDRESS_STREET_NUMBER_MISMATCH"));});
test("ZIP mismatch requires review",()=>{const e=clone(PASSING);e.address.sameZip=false;assert.ok(assessVendorIdentity(e).reasonCodes.includes("ADDRESS_ZIP_MISMATCH"));});
test("address exactly at 0.25 miles passes",()=>{const e=clone(PASSING);e.address.distanceMiles=.25;assert.equal(assessVendorIdentity(e).decision,"consistent");});
test("address above threshold requires review",()=>{const e=clone(PASSING);e.address.distanceMiles=.250001;assert.ok(assessVendorIdentity(e).reasonCodes.includes("ADDRESS_DISTANCE_EXCEEDS_THRESHOLD"));});
test("unregistered domain requires review",()=>{const e=clone(PASSING);e.rdap.registered=false;assert.ok(assessVendorIdentity(e).reasonCodes.includes("DOMAIN_NOT_CONFIRMED_REGISTERED"));});
test("registered but unrelated domain requires review",()=>{const e=clone(PASSING);e.rdap.nameAligned=false;assert.ok(assessVendorIdentity(e).reasonCodes.includes("DOMAIN_VENDOR_NAME_MISMATCH"));});
test("unavailable evidence fails closed, never rejects",()=>{const e=clone(PASSING);e.registry.available=false;e.address.available=false;e.rdap.available=false;const r=assessVendorIdentity(e);assert.equal(r.decision,"human_review");assert.equal(r.policy.automaticReject,false);});
