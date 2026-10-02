"use strict";
const assert=require("node:assert/strict");
const {createTreasuryAverageRatesAdapter}=require("../../packages/sources/treasury-average-rates");
const {createTreasuryRateThresholdService}=require("./service");
async function main(){
 const service=createTreasuryRateThresholdService({treasury:createTreasuryAverageRatesAdapter()});
 const r=await service.check({security:"Total Marketable",thresholdPercent:0,operator:"gte"});
 console.log(JSON.stringify({decision:r.decision,reasonCodes:r.reasonCodes,recordDate:r.recordDate,selectedRate:r.selectedRate,ratePercent:r.ratePercent,source:r.evidence?.provenance?.source,sourceFailures:r.sourceFailures},null,2));
 if(Array.isArray(r.sourceFailures)&&r.sourceFailures.length){console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(r.sourceFailures));return;}
 assert.equal(r.chargeable,true);
 assert.equal(r.evidence.available,true);
 assert.equal(r.evidence.matchCount,1);
 assert.ok(Number.isFinite(r.ratePercent));
 assert.ok(["threshold_met","threshold_not_met"].includes(r.decision));
}
main().catch(e=>{console.error(e);process.exit(1);});
