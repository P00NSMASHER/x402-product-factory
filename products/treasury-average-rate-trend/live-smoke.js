"use strict";
const assert=require("node:assert/strict");
const {createTreasuryAverageRatesAdapter}=require("../../packages/sources/treasury-average-rates");
const {createTreasuryRateTrendService}=require("./service");

async function main(){
  const service=createTreasuryRateTrendService({
    treasury:createTreasuryAverageRatesAdapter()
  });

  const result=await service.check({
    security:"Total Marketable",
    minChangeBps:1
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    latest:result.latest,
    previous:result.previous,
    changeBps:result.changeBps,
    minChangeBps:result.minChangeBps,
    source:result.evidence?.provenance?.source,
    sourceFailures:result.sourceFailures
  },null,2));

  if(Array.isArray(result.sourceFailures)&&result.sourceFailures.length>0){
    throw new Error("Treasury source failure: "+JSON.stringify(result.sourceFailures));
  }

  assert.equal(result.chargeable,true);
  assert.ok(["rising","falling","unchanged"].includes(result.decision));
  assert.ok(result.latest);
  assert.ok(result.previous);
  assert.equal(typeof result.changeBps,"number");
}

main().catch(e=>{console.error(e);process.exit(1);});
