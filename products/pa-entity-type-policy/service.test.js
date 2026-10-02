"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseAllowedKinds,createEntityTypePolicyService}=require("./service");

test("allowedKinds parser dedupes and validates",()=>{
  assert.deepEqual(parseAllowedKinds("llc, corporation,llc"),["llc","corporation"]);
  assert.throws(()=>parseAllowedKinds("llc,bank"),e=>e.code==="INVALID_INPUT");
});
test("service resolves a matching LLC policy",async()=>{
  const service=createEntityTypePolicyService({
    registry:{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,entity:{businessName:company,filingNumber:"1",registrationType:"Foreign Limited Liability Company"}};}},
    now:()=>"2026-10-02T14:00:00.000Z"
  });
  const r=await service.check({company:"OpenAI OpCo",allowedKinds:"llc,corporation"});
  assert.equal(r.decision,"policy_match");assert.equal(r.registrationKind,"llc");assert.equal(r.chargeable,true);
});
test("completed policy mismatch remains chargeable",async()=>{
  const service=createEntityTypePolicyService({registry:{async lookup(){return{available:true,strongMatch:true,ambiguous:false,entity:{businessName:"Example Inc",registrationType:"Domestic Business Corporation"}};}}});
  const r=await service.check({company:"Example Inc",allowedKinds:"llc"});
  assert.equal(r.decision,"policy_mismatch");assert.equal(r.chargeable,true);
});
test("registry transport failure is non-chargeable",async()=>{
  const service=createEntityTypePolicyService({registry:{async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}}});
  const r=await service.check({company:"Example LLC",allowedKinds:"llc"});
  assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);
});
