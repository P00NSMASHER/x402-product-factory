"use strict";
const assert=require("node:assert/strict");
const {createOfacNameAdapter}=require("../../packages/sources/ofac-name-screen");
const {createOfacReviewService}=require("./service");

async function main(){
  const service=createOfacReviewService({ofac:createOfacNameAdapter()});
  const result=await service.check({name:"OpenAI OpCo",minScore:90});

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    candidateCount:result.candidateCount,
    candidates:result.candidates,
    minScore:result.minScore,
    source:result.evidence?.provenance?.source,
    sourceFailures:result.sourceFailures,
    limitations:result.limitations
  },null,2));

  if(Array.isArray(result.sourceFailures)&&result.sourceFailures.length){
    console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(result.sourceFailures));
    return;
  }

  assert.equal(result.chargeable,true);
  assert.equal(result.evidence.available,true);
  assert.ok(["candidate_found","no_candidate"].includes(result.decision));
  assert.ok(Number.isInteger(result.candidateCount));
  assert.ok(result.limitations.some(x=>/not sanctions clearance/i.test(x)));
}

main().catch(error=>{console.error(error);process.exit(1);});
