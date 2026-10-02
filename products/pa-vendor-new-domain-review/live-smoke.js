"use strict";

const assert=require("node:assert/strict");
const {createPaRegistryAdapter,createRdapAdapter}=require("../../packages/sources/live-pa-identity");
const {createPaVendorNewDomainService}=require("./service");

async function main(){
  const service=createPaVendorNewDomainService({
    registry:createPaRegistryAdapter(),
    rdap:createRdapAdapter()
  });
  const result=await service.check({
    company:"OpenAI OpCo",
    domain:"openai.com",
    minDomainAgeDays:90
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    matchedEntity:result.matchedEntity,
    resolvedLegalName:result.resolvedLegalName,
    domain:result.domain,
    registrationDate:result.registrationDate,
    domainAgeDays:result.domainAgeDays,
    minDomainAgeDays:result.minDomainAgeDays,
    nameAligned:result.evidence?.rdap?.nameAligned,
    alignedAgainstLegalName:result.evidence?.rdap?.alignedAgainstLegalName,
    sourceFailures:result.sourceFailures
  },null,2));

  if(result.sourceFailures?.length){
    console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(result.sourceFailures));
    return;
  }

  assert.equal(result.chargeable,true);
  assert.equal(result.decision,"established_domain_match");
  assert.equal(result.matchedEntity?.businessName,"Openai Opco, Llc");
  assert.equal(result.resolvedLegalName,"Openai Opco, Llc");
  assert.equal(result.evidence?.rdap?.nameAligned,true);
  assert.equal(result.evidence?.rdap?.alignedAgainstLegalName,"Openai Opco, Llc");
  assert.equal(result.registrationDate,"2007-01-19");
  assert.ok(result.domainAgeDays>=90);
  assert.deepEqual(result.sourceFailures,[]);
}

main().catch(error=>{console.error(error);process.exit(1);});
