"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createTreasuryRateTrendService,validateTreasuryTrendInput}=require("./service");

test("input defaults minChangeBps to 1",()=>{
  assert.deepEqual(validateTreasuryTrendInput({security:"Total Marketable"}),{
    security:"Total Marketable",minChangeBps:1
  });
});

test("service returns falling from two Treasury months",async()=>{
  const service=createTreasuryRateTrendService({
    treasury:{async history(input){
      assert.equal(input.security,"Total Marketable");
      assert.equal(input.points,2);
      return {
        available:true,found:true,ambiguous:false,
        points:[
          {recordDate:"2026-08-31",securityDescription:"Total Marketable",averageInterestRatePercent:3.475},
          {recordDate:"2026-07-31",securityDescription:"Total Marketable",averageInterestRatePercent:3.525}
        ],
        provenance:{source:"U.S. Treasury Fiscal Data"}
      };
    }},
    now:()=>"2026-10-02T09:30:00.000Z"
  });
  const r=await service.check({security:"Total Marketable"});
  assert.equal(r.decision,"falling");
  assert.equal(r.changeBps,-5);
  assert.equal(r.chargeable,true);
});

test("source outage is non-chargeable human review",async()=>{
  const service=createTreasuryRateTrendService({
    treasury:{async history(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}}
  });
  const r=await service.check({security:"Total Marketable"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(r.sourceFailures[0].detail,"SOURCE_HTTP_ERROR");
});
