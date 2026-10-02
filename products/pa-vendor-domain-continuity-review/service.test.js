"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createVendorDomainContinuityService}=require("./service");

function good(){
  return {
    registry:{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",address1:"100 Market St",city:"Pottsville",state:"PA",zip:"17901"}};}},
    rdap:{async lookup({domain}){return{available:true,registered:true,domain,events:{expiration:"2029-01-19T00:00:00Z",lastChanged:"2024-10-17T00:00:00Z"}};}}
  };
}
test("service composes stable continuity evidence",async()=>{
  const r=await createVendorDomainContinuityService({...good(),now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
  assert.equal(r.decision,"stable_domain");assert.equal(r.chargeable,true);assert.equal(r.resolvedLegalName,"Example LLC");
});
test("completed expiration review is chargeable",async()=>{
  const a=good();a.rdap={async lookup({domain}){return{available:true,registered:true,domain,events:{expiration:"2026-10-20",lastChanged:"2024-10-17"}};}};
  const r=await createVendorDomainContinuityService({...a,now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
  assert.equal(r.decision,"human_review");assert.equal(r.chargeable,true);
});
test("RDAP outage is non-chargeable",async()=>{
  const a=good();a.rdap={async lookup(){const e=new Error("timeout");e.code="SOURCE_TIMEOUT";throw e;}};
  const r=await createVendorDomainContinuityService({...a,now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
  assert.equal(r.chargeable,false);assert.equal(r.decision,"human_review");
});
test("invalid thresholds fail before source work",async()=>{
  let calls=0;const a=good();a.registry={async lookup(){calls++;return{};}};
  const s=createVendorDomainContinuityService(a);
  await assert.rejects(()=>s.check({company:"Example LLC",domain:"example.com",minStableDays:0}),(e)=>e.code==="INVALID_INPUT");
  assert.equal(calls,0);
});
