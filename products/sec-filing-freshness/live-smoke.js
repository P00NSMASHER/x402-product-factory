"use strict";

const assert=require("node:assert/strict");
const {createSecFilingsAdapter}=require("../../packages/sources/sec-filings");
const {createSecFilingFreshnessService}=require("./service");

async function main(){
  const service=createSecFilingFreshnessService({
    sec:createSecFilingsAdapter()
  });

  const result=await service.check({
    ticker:"AAPL",
    maxAgeDays:365
  });

  console.log(JSON.stringify({
    decision:result.decision,
    reasonCodes:result.reasonCodes,
    company:result.company,
    latestMatchingFiling:result.latestMatchingFiling,
    matchingFilingCount:result.matchingFilingCount,
    recentFilingCount:result.recentFilingCount,
    maxAgeDays:result.maxAgeDays,
    cutoffDate:result.cutoffDate,
    source:result.evidence?.provenance?.source
  },null,2));

  if (Array.isArray(result.sourceFailures) && result.sourceFailures.length > 0) {
    console.log("TRANSIENT_SOURCE_BLOCKED", JSON.stringify(result.sourceFailures));
    return;
  }
  assert.equal(result.chargeable,true);
  assert.equal(result.evidence.available,true);
  assert.equal(result.evidence.found,true);
  assert.equal(result.company?.cik,"0000320193");
  assert.ok(["recent_filing","no_recent_filing"].includes(result.decision));
  assert.ok(result.matchingFilingCount>=0);
}

main().catch(e=>{console.error(e);process.exit(1);});
