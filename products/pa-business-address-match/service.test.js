"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createBusinessAddressService}=require("./service");

function good(){
  return {
    registry:{async lookup({company}){return {available:true,strongMatch:true,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",address1:"100 Market St",city:"Pottsville",state:"PA",zip:"17901"}};}},
    address:{async compare(){return {available:true,suppliedMatched:true,registryMatched:true,sameStreetNumber:true,sameZip:true,distanceMiles:0.01};}}
  };
}

test("service composes registry and Census into match",async()=>{
  const service=createBusinessAddressService({...good(),now:()=>"2026-10-02T09:30:00.000Z"});
  const r=await service.check({company:"Example LLC",address:"100 Market St, Pottsville, PA 17901"});
  assert.equal(r.decision,"match");
  assert.equal(r.chargeable,true);
  assert.deepEqual(r.sourceFailures,[]);
});

test("registry source outage is non-chargeable",async()=>{
  const a=good();
  a.registry={async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}};
  const service=createBusinessAddressService(a);
  const r=await service.check({company:"Example LLC",address:"100 Market St, Pottsville, PA 17901"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(r.sourceFailures[0].source,"pa_registry");
});

test("completed address mismatch is chargeable human review",async()=>{
  const a=good();
  a.address={async compare(){return {available:true,suppliedMatched:true,registryMatched:true,sameStreetNumber:false,sameZip:true,distanceMiles:0.01};}};
  const service=createBusinessAddressService(a);
  const r=await service.check({company:"Example LLC",address:"200 Market St, Pottsville, PA 17901"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,true);
  assert.ok(r.reasonCodes.includes("ADDRESS_STREET_NUMBER_MISMATCH"));
});
