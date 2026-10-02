"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessTreasuryRateThreshold}=require("./decision");

function validateTreasuryThresholdInput(input){
  const security=String(input?.security??"").trim().replace(/\s+/g," ");
  if(security.length<2||security.length>100){
    const e=new Error("security length must be 2-100");
    e.code="INVALID_INPUT";
    throw e;
  }
  const raw=String(input?.thresholdPercent??"").trim();
  if(raw===""||!/^\d+(?:\.\d+)?$/.test(raw)){
    const e=new Error("thresholdPercent must be numeric");
    e.code="INVALID_INPUT";
    throw e;
  }
  const thresholdPercent=Number(raw);
  if(!Number.isFinite(thresholdPercent)||thresholdPercent<0||thresholdPercent>100){
    const e=new Error("thresholdPercent must be between 0 and 100");
    e.code="INVALID_INPUT";
    throw e;
  }
  const operator=String(input?.operator??"gte").trim().toLowerCase()||"gte";
  if(!["gte","lte"].includes(operator)){
    const e=new Error("operator must be gte or lte");
    e.code="INVALID_INPUT";
    throw e;
  }
  return {security,thresholdPercent,operator};
}

function createTreasuryRateThresholdService({treasury,now=()=>new Date().toISOString()}){
  requireAdapter("treasury",treasury,"lookup");
  return {async check(input){
    const normalized=validateTreasuryThresholdInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("treasury_fiscal_data",await treasury.lookup({security:normalized.security}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"treasury_fiscal_data",detail});
      evidence=sourceUnavailable("treasury_fiscal_data",detail);
    }
    const decision=assessTreasuryRateThreshold(evidence,{
      thresholdPercent:normalized.thresholdPercent,
      operator:normalized.operator,
      checkedAt:now()
    });
    return {
      ...decision,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence
    };
  }};
}

module.exports={validateTreasuryThresholdInput,createTreasuryRateThresholdService};
