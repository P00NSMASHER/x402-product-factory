"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseDistance,createVendorDistanceService}=require("./service");
test("distance parser accepts decimals and bounds",()=>{assert.equal(parseDistance("25.1254"),25.125);assert.throws(()=>parseDistance("0"),e=>e.code==="INVALID_INPUT");assert.throws(()=>parseDistance("1001"),e=>e.code==="INVALID_INPUT");});
function adapters(){return{
 registry:{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",address1:"600 North Second Street, Suite 401",city:"Harrisburg",state:"PA",zip:"17101",county:"Dauphin"}};}},
 address:{async compare(){return{available:true,suppliedMatched:true,registryMatched:true,distanceMiles:0,suppliedMatchedAddress:"600 NORTH SECOND ST, HARRISBURG, PA, 17101",registryMatchedAddress:"600 NORTH SECOND ST, HARRISBURG, PA, 17101"};}}
};}
test("service returns within_radius for completed evidence",async()=>{const s=createVendorDistanceService(adapters());const r=await s.check({company:"OpenAI OpCo",originAddress:"600 North Second Street, Harrisburg, PA 17101",maxDistanceMiles:"25"});assert.equal(r.decision,"within_radius");assert.equal(r.chargeable,true);});
test("completed outside radius remains chargeable",async()=>{const a=adapters();a.address={async compare(){return{available:true,suppliedMatched:true,registryMatched:true,distanceMiles:55};}};const r=await createVendorDistanceService(a).check({company:"Example LLC",originAddress:"1 Main St, Pottsville, PA 17901",maxDistanceMiles:"25"});assert.equal(r.decision,"outside_radius");assert.equal(r.chargeable,true);});
test("Census outage is non-chargeable",async()=>{const a=adapters();a.address={async compare(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}};const r=await createVendorDistanceService(a).check({company:"Example LLC",originAddress:"1 Main St, Pottsville, PA 17901",maxDistanceMiles:"25"});assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);});
