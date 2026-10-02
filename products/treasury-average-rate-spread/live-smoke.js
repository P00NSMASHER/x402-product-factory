"use strict";

const assert=require("node:assert/strict");
const {createTreasuryAverageRatesAdapter}=require("../../packages/sources/treasury-average-rates");
const {createTreasuryRateSpreadService}=require("./service");

async function main(){
  const service=createTreasuryRateSpreadService({
    treasury:createTreasuryAverageRatesAdapter()
  });
  const result=await service.check({
    leftSecurity:"Treasury Bills",
    rightSecurity:"Treasury Notes",
    toleranceBps:2
  });

  console.log(JSON.stringify({
    decision:result.decision,
    recordDate:result.recordDate,
    spreadBps:result.spreadBps,
    toleranceBps:result.toleranceBps,
    left:result.left,
    right:result.right,
    reasonCodes:result.reasonCodes,
    source:result.evidence?.provenance
  },null,2));

  assert.ok(["left_higher","right_higher","within_tolerance"].includes(result.decision));
  assert.deepEqual(result.reasonCodes,[]);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result.recordDate));
  assert.ok(Number.isFinite(result.spreadBps));
  assert.equal(result.left.recordDate,result.recordDate);
  assert.equal(result.right.recordDate,result.recordDate);
  assert.ok(Number.isFinite(result.left.averageInterestRatePercent));
  assert.ok(Number.isFinite(result.right.averageInterestRatePercent));
}

main().catch(error=>{console.error(error);process.exit(1);});
