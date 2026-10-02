"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessVendorDistance}=require("./decision");
const BASE={registry:{available:true,strongMatch:true,ambiguous:false,entity:{businessName:"Example LLC"}},address:{available:true,suppliedMatched:true,registryMatched:true,distanceMiles:12.5,suppliedMatchedAddress:"A",registryMatchedAddress:"B"}};
test("distance at threshold is within_radius",()=>assert.equal(assessVendorDistance(BASE,12.5).decision,"within_radius"));
test("distance above threshold is outside_radius",()=>{const r=assessVendorDistance(BASE,10);assert.equal(r.decision,"outside_radius");assert.equal(r.reasonCode,"DISTANCE_ABOVE_THRESHOLD");});
test("origin geocode failure requires review",()=>{const e={...BASE,address:{...BASE.address,suppliedMatched:false}};assert.equal(assessVendorDistance(e,25).reasonCode,"ORIGIN_ADDRESS_NOT_GEOCODED");});
test("registry address geocode failure requires review",()=>{const e={...BASE,address:{...BASE.address,registryMatched:false}};assert.equal(assessVendorDistance(e,25).reasonCode,"REGISTRY_ADDRESS_NOT_GEOCODED");});
test("missing entity returns company_not_found",()=>assert.equal(assessVendorDistance({...BASE,registry:{...BASE.registry,entity:null}},25).decision,"company_not_found"));
