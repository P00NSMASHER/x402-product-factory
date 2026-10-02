"use strict";
const assert=require("node:assert/strict");
const {createVendorDistanceService}=require("./service");
const {createPaRegistryAdapter,createCensusAddressAdapter}=require("../../packages/sources/live-pa-identity");
async function main(){
 const s=createVendorDistanceService({registry:createPaRegistryAdapter(),address:createCensusAddressAdapter()});
 const r=await s.check({company:"OpenAI OpCo",originAddress:"600 North Second Street, Suite 401, Harrisburg, PA 17101",maxDistanceMiles:"25"});
 console.log(JSON.stringify({decision:r.decision,reasonCode:r.reasonCode,distanceMiles:r.distanceMiles,maxDistanceMiles:r.maxDistanceMiles,originMatchedAddress:r.originMatchedAddress,registryMatchedAddress:r.registryMatchedAddress,matchedEntity:r.matchedEntity,sourceFailures:r.sourceFailures},null,2));
 assert.equal(r.decision,"within_radius");assert.ok(r.distanceMiles<=25);assert.deepEqual(r.sourceFailures,[]);
}
main().catch(e=>{console.error(e);process.exit(1);});
