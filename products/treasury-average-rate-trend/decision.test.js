"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessTreasuryRateTrend}=require("./decision");

function evidence(latest,previous){
  return {
    available:true,found:true,ambiguous:false,
    points:[
      {recordDate:"2026-08-31",securityDescription:"Total Marketable",averageInterestRatePercent:latest},
      {recordDate:"2026-07-31",securityDescription:"Total Marketable",averageInterestRatePercent:previous}
    ]
  };
}

test("positive move above threshold is rising",()=>{
  const r=assessTreasuryRateTrend(evidence(3.475,3.425),{minChangeBps:1});
  assert.equal(r.decision,"rising");
  assert.equal(r.changeBps,5);
});

test("negative move above threshold is falling",()=>{
  const r=assessTreasuryRateTrend(evidence(3.425,3.475),{minChangeBps:1});
  assert.equal(r.decision,"falling");
  assert.equal(r.changeBps,-5);
});

test("small move is unchanged",()=>{
  const r=assessTreasuryRateTrend(evidence(3.475,3.47),{minChangeBps:1});
  assert.equal(r.decision,"unchanged");
  assert.equal(r.changeBps,0.5);
});

test("ambiguous security fails closed",()=>{
  const r=assessTreasuryRateTrend({available:true,found:true,ambiguous:true,points:[]},{minChangeBps:1});
  assert.equal(r.decision,"human_review");
});

test("missing prior month fails closed",()=>{
  const r=assessTreasuryRateTrend({available:true,found:true,ambiguous:false,points:[{recordDate:"2026-08-31",averageInterestRatePercent:3.4}]},{minChangeBps:1});
  assert.equal(r.decision,"human_review");
});

test("missing, blank, and nonnumeric Treasury source rates fail closed",()=>{
  for(const missing of [null,undefined,"","  ",false,[],{}, "NaN","Infinity","0x10"]){
    for(const side of ["latest","previous"]){
      const result=side==="latest"
        ? assessTreasuryRateTrend(evidence(missing,3.4),{minChangeBps:1})
        : assessTreasuryRateTrend(evidence(3.4,missing),{minChangeBps:1});
      assert.equal(result.decision,"human_review",JSON.stringify({missing,side}));
      assert.deepEqual(result.reasonCodes,["TREASURY_HISTORY_INVALID"]);
      assert.equal(result.changeBps,null);
      assert.equal(result.changePercentPoints,null);
    }
  }
});

test("genuine zero-percent observations and decimal string rates remain supported",()=>{
  const zero=assessTreasuryRateTrend(evidence(0,0),{minChangeBps:1});
  assert.equal(zero.decision,"unchanged");
  assert.equal(zero.changeBps,0);

  const numeric=assessTreasuryRateTrend(evidence("3.450","3.425"),{minChangeBps:1});
  assert.equal(numeric.decision,"rising");
  assert.equal(numeric.changeBps,2.5);
});
