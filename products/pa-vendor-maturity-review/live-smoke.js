"use strict";

const assert=require("node:assert/strict");
const {createPaRegistryAdapter,createRdapAdapter}=require("../../packages/sources/live-pa-identity");
const {createVendorMaturityService}=require("./service");

async function main(){
  const service=createVendorMaturityService({
    registry:createPaRegistryAdapter(),
    rdap:createRdapAdapter()
  });
  const result=await service.check({
    company:"OpenAI OpCo",
    domain:"openai.com",
    minEntityAgeDays:30,
    minDomainAgeDays:90
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    matchedEntity:result.matchedEntity,
    resolvedLegalName:result.resolvedLegalName,
    entityAgeDays:result.entityAgeDays,
    minEntityAgeDays:result.minEntityAgeDays,
    domain:result.domain,
    domainAgeDays:result.domainAgeDays,
    minDomainAgeDays:result.minDomainAgeDays,
    nameAligned:result.evidence?.rdap?.nameAligned,
    sourceFailures:result.sourceFailures
  },null,2));

  if(result.sourceFailures?.length){
    console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(result.sourceFailures));
    return;
  }

  assert.equal(result.chargeable,true);
  assert.equal(result.decision,"established_vendor");
  assert.equal(result.matchedEntity?.businessName,"Openai Opco, Llc");
  assert.equal(result.resolvedLegalName,"Openai Opco, Llc");
  assert.ok(result.entityAgeDays>=30);
  assert.ok(result.domainAgeDays>=90);
  assert.equal(result.evidence?.rdap?.nameAligned,true);
  assert.deepEqual(result.reasonCodes,[]);
}

main().catch(error=>{console.error(error);process.exit(1);});
