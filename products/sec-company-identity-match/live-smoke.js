"use strict";

const assert=require("node:assert/strict");
const {createSecFilingsAdapter}=require("../../packages/sources/sec-filings");
const {createSecCompanyIdentityService}=require("./service");

async function main(){
  const service=createSecCompanyIdentityService({
    sec:createSecFilingsAdapter()
  });

  const result=await service.check({
    company:"Apple",
    ticker:"AAPL"
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    company:result.company,
    sourceFailures:result.sourceFailures,
    source:result.evidence?.provenance?.source
  },null,2));

  if(Array.isArray(result.sourceFailures)&&result.sourceFailures.length>0){
    const onlyContactBlock=result.sourceFailures.every(x=>x.detail==="SEC_USER_AGENT_REQUIRED");
    if(onlyContactBlock){
      console.log("SEC_CONTACT_IDENTITY_REQUIRED");
      return;
    }
    throw new Error("unexpected SEC source failure: "+JSON.stringify(result.sourceFailures));
  }

  assert.equal(result.chargeable,true);
  assert.equal(result.decision,"match");
  assert.equal(result.company?.cik,"0000320193");
}

main().catch(e=>{console.error(e);process.exit(1);});
