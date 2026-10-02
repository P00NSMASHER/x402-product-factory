"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createVendorMaturityService}=require("./service");

function good(){
  return {
    registry:{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",creationDate:"2020-01-01",address1:"100 Market St",city:"Pottsville",state:"PA",zip:"17901"}};}},
    rdap:{async lookup({domain}){return{available:true,registered:true,domain,events:{registration:"2015-01-01T00:00:00Z"}};}}
  };
}
test("service composes established evidence",async()=>{
  const r=await createVendorMaturityService({...good(),now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
  assert.equal(r.decision,"established_vendor");assert.equal(r.chargeable,true);assert.equal(r.resolvedLegalName,"Example LLC");
});
test("completed recent entity is chargeable human review",async()=>{
  const a=good();a.registry={async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",creationDate:"2026-09-20",address1:"100 Market St",city:"Pottsville",state:"PA",zip:"17901"}};}};
  const r=await createVendorMaturityService({...a,now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
  assert.equal(r.decision,"human_review");assert.equal(r.chargeable,true);assert.ok(r.reasonCodes.includes("ENTITY_RECENT_FORMATION"));
});
test("RDAP transport failure is non-chargeable",async()=>{
  const a=good();a.rdap={async lookup(){const e=new Error("timeout");e.code="SOURCE_TIMEOUT";throw e;}};
  const r=await createVendorMaturityService({...a,now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
  assert.equal(r.chargeable,false);assert.equal(r.decision,"human_review");
});
test("invalid age thresholds fail before source work",async()=>{
  let calls=0;const a=good();a.registry={async lookup(){calls++;return{};}};
  const s=createVendorMaturityService(a);
  await assert.rejects(()=>s.check({company:"Example LLC",domain:"example.com",minEntityAgeDays:0}),(e)=>e.code==="INVALID_INPUT");
  assert.equal(calls,0);
});
