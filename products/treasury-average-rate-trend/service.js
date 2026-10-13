"use strict";
const {trackRequiredEvidence,safeSourceErrorCode}=require("../../packages/sources/contracts");
const {guardMarketEvidence}=require("../../packages/sources/market-evidence-contract");

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessTreasuryRateTrend}=require("./decision");

function validateTreasuryTrendInput(input){
  const security=String(input?.security??"").trim().replace(/\s+/g," ");
  if(security.length<2||security.length>100){
    const e=new Error("security length must be 2-100");
    e.code="INVALID_INPUT";
    throw e;
  }

  const raw=input?.minChangeBps;
  const value=raw===undefined||raw===null||raw===""?1:Number(raw);
  if(!Number.isSafeInteger(value)||value<1||value>1000){
    const e=new Error("minChangeBps must be an integer between 1 and 1000");
    e.code="INVALID_INPUT";
    throw e;
  }
  return {security,minChangeBps:value};
}

function createTreasuryRateTrendService({treasury,now=()=>new Date().toISOString()}){
  requireAdapter("treasury",treasury,"history");

  return {async check(input){
    const normalized=validateTreasuryTrendInput(input);
    const sourceFailures=[];
    const observedAt=now();
  const recordEvidence=(source,result)=>trackRequiredEvidence(source,result,sourceFailures);
    let evidence;
    try{
      evidence=recordEvidence("treasury_fiscal_data",await treasury.history({
        security:normalized.security,
        points:2
      }));
      evidence=guardMarketEvidence({
        kind:"treasuryHistory",source:"treasury_fiscal_data",
        evidence,sourceFailures,expected:{security:normalized.security,now:observedAt}
      });
    }catch(error){
      const detail=safeSourceErrorCode(error);
      sourceFailures.push({source:"treasury_fiscal_data",detail});
      evidence=sourceUnavailable("treasury_fiscal_data",detail);
    }

    const result=assessTreasuryRateTrend(evidence,{
      minChangeBps:normalized.minChangeBps,
      checkedAt:observedAt
    });

    return {
      ...result,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence
    };
  }};
}

module.exports={validateTreasuryTrendInput,createTreasuryRateTrendService};
