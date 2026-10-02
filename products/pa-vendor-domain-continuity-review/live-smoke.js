"use strict";

const assert=require("node:assert/strict");
const {createPaRegistryAdapter,createRdapAdapter}=require("../../packages/sources/live-pa-identity");
const {createVendorDomainContinuityService}=require("./service");

async function main(){
  const service=createVendorDomainContinuityService({
    registry:createPaRegistryAdapter(),
    rdap:createRdapAdapter()
  });
  const result=await service.check({
    company:"OpenAI OpCo",
    domain:"openai.com",
    minExpirationDays:180,
    minStableDays:30
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    matchedEntity:result.matchedEntity,
    resolvedLegalName:result.resolvedLegalName,
    domain:result.domain,
    expirationDate:result.expirationDate,
    daysUntilExpiration:result.daysUntilExpiration,
    minExpirationDays:result.minExpirationDays,
    lastChangedDate:result.lastChangedDate,
    daysSinceLastChanged:result.daysSinceLastChanged,
    minStableDays:result.minStableDays,
    nameAligned:result.evidence?.rdap?.nameAligned,
    sourceFailures:result.sourceFailures
  },null,2));

  if(result.sourceFailures?.length){
    console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(result.sourceFailures));
    return;
  }

  assert.equal(result.chargeable,true);
  assert.equal(result.decision,"stable_domain");
  assert.equal(result.matchedEntity?.businessName,"Openai Opco, Llc");
  assert.equal(result.resolvedLegalName,"Openai Opco, Llc");
  assert.ok(result.daysUntilExpiration>=180);
  assert.ok(result.daysSinceLastChanged>=30);
  assert.equal(result.evidence?.rdap?.nameAligned,true);
  assert.deepEqual(result.reasonCodes,[]);
}

main().catch(error=>{console.error(error);process.exit(1);});
