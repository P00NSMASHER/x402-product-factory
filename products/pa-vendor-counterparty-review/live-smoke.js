"use strict";

const assert=require("node:assert/strict");
const {createPaRegistryAdapter,createRdapAdapter}=require("../../packages/sources/live-pa-identity");
const {createOfacNameAdapter}=require("../../packages/sources/ofac-name-screen");
const {createCounterpartyReviewService}=require("./service");

async function main(){
  const service=createCounterpartyReviewService({
    registry:createPaRegistryAdapter(),
    ofac:createOfacNameAdapter(),
    rdap:createRdapAdapter()
  });
  const result=await service.check({
    company:"OpenAI OpCo",
    domain:"openai.com",
    minScore:90,
    minDomainAgeDays:90
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    matchedEntity:result.matchedEntity,
    resolvedLegalName:result.resolvedLegalName,
    ofacCandidateCount:result.checks?.ofac?.candidateCount??null,
    domain:result.domain,
    domainAgeDays:result.domainAgeDays,
    minDomainAgeDays:result.minDomainAgeDays,
    domainNameAligned:result.evidence?.rdap?.nameAligned,
    sourceFailures:result.sourceFailures
  },null,2));

  if(result.sourceFailures?.length){
    console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(result.sourceFailures));
    return;
  }

  assert.equal(result.chargeable,true);
  assert.equal(result.decision,"proceed");
  assert.equal(result.matchedEntity?.businessName,"Openai Opco, Llc");
  assert.equal(result.resolvedLegalName,"Openai Opco, Llc");
  assert.equal(result.checks?.ofac?.candidateCount,0);
  assert.equal(result.evidence?.rdap?.nameAligned,true);
  assert.ok(result.domainAgeDays>=90);
  assert.deepEqual(result.reasonCodes,[]);
}

main().catch(error=>{console.error(error);process.exit(1);});
