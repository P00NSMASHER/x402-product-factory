"use strict";
const assert=require("node:assert/strict");
const {createBusinessAddressService}=require("./service");
const {createPaRegistryAdapter,createCensusAddressAdapter}=require("../../packages/sources/live-pa-identity");

async function main(){
  const service=createBusinessAddressService({
    registry:createPaRegistryAdapter(),
    address:createCensusAddressAdapter()
  });
  const result=await service.check({
    company:"OpenAI OpCo",
    address:"600 North Second Street, Suite 401, Harrisburg, PA 17101"
  });
  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    matchedEntity:result.matchedEntity,
    address:{
      suppliedMatched:result.evidence.address.suppliedMatched,
      registryMatched:result.evidence.address.registryMatched,
      sameStreetNumber:result.evidence.address.sameStreetNumber,
      sameZip:result.evidence.address.sameZip,
      distanceMiles:result.evidence.address.distanceMiles
    }
  },null,2));
  if (Array.isArray(result.sourceFailures) && result.sourceFailures.length > 0) {
    console.log("TRANSIENT_SOURCE_BLOCKED", JSON.stringify(result.sourceFailures));
    return;
  }
  assert.equal(result.decision,"match");
  assert.deepEqual(result.reasonCodes,[]);
}
main().catch(e=>{console.error(e);process.exit(1);});
