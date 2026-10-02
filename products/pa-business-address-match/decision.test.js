"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessBusinessAddress}=require("./decision");
const BASE={
  registry:{available:true,strongMatch:true,entity:{businessName:"Example LLC"}},
  address:{available:true,suppliedMatched:true,registryMatched:true,sameStreetNumber:true,sameZip:true,distanceMiles:0.01}
};
const clone=v=>JSON.parse(JSON.stringify(v));
test("passing evidence returns match",()=>assert.equal(assessBusinessAddress(clone(BASE)).decision,"match"));
test("weak registry identity requires review",()=>{const e=clone(BASE);e.registry.strongMatch=false;assert.equal(assessBusinessAddress(e).decision,"human_review");});
test("street mismatch requires review",()=>{const e=clone(BASE);e.address.sameStreetNumber=false;assert.ok(assessBusinessAddress(e).reasonCodes.includes("ADDRESS_STREET_NUMBER_MISMATCH"));});
test("ZIP mismatch requires review",()=>{const e=clone(BASE);e.address.sameZip=false;assert.ok(assessBusinessAddress(e).reasonCodes.includes("ADDRESS_ZIP_MISMATCH"));});
test("0.25 miles passes",()=>{const e=clone(BASE);e.address.distanceMiles=.25;assert.equal(assessBusinessAddress(e).decision,"match");});
test("over 0.25 miles requires review",()=>{const e=clone(BASE);e.address.distanceMiles=.250001;assert.ok(assessBusinessAddress(e).reasonCodes.includes("ADDRESS_DISTANCE_EXCEEDS_THRESHOLD"));});
