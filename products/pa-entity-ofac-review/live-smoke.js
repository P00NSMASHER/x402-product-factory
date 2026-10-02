"use strict";

const assert=require("node:assert/strict");
const {createPaRegistryAdapter}=require("../../packages/sources/live-pa-identity");
const {createOfacNameAdapter}=require("../../packages/sources/ofac-name-screen");
const {createPaEntityOfacReviewService}=require("./service");

async function main(){
  const service=createPaEntityOfacReviewService({
    registry:createPaRegistryAdapter(),
    ofac:createOfacNameAdapter()
  });
  const result=await service.check({
    company:"OpenAI OpCo",
    minScore:90
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    matchedEntity:result.matchedEntity,
    screenedName:result.screenedName,
    candidateCount:result.candidateCount,
    candidates:result.candidates,
    minScore:result.minScore,
    sourceFailures:result.sourceFailures
  },null,2));

  assert.equal(result.decision,"no_candidate");
  assert.equal(result.matchedEntity?.businessName,"Openai Opco, Llc");
  assert.equal(result.screenedName,"Openai Opco, Llc");
  assert.equal(result.candidateCount,0);
  assert.deepEqual(result.sourceFailures,[]);
}

main().catch(error=>{console.error(error);process.exit(1);});
