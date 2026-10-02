"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessTreasuryRateSpread}=require("./decision");

function cleanSecurity(value,field){
  const text=String(value??"").trim().replace(/\s+/g," ");
  if(text.length<2||text.length>100){
    const e=new Error(field+" length must be 2-100");
    e.code="INVALID_INPUT";
    throw e;
  }
  return text;
}

function validateTreasuryRateSpreadInput(input){
  const leftSecurity=cleanSecurity(input?.leftSecurity,"leftSecurity");
  const rightSecurity=cleanSecurity(input?.rightSecurity,"rightSecurity");
  if(leftSecurity.toLowerCase()===rightSecurity.toLowerCase()){
    const e=new Error("leftSecurity and rightSecurity must differ");
    e.code="INVALID_INPUT";
    throw e;
  }
  const raw=input?.toleranceBps;
  const toleranceBps=raw==null||String(raw).trim()===""?2:Number(raw);
  if(!Number.isFinite(toleranceBps)||toleranceBps<0||toleranceBps>1000){
    const e=new Error("toleranceBps must be between 0 and 1000");
    e.code="INVALID_INPUT";
    throw e;
  }
  return {leftSecurity,rightSecurity,toleranceBps};
}

function createTreasuryRateSpreadService({treasury,now=()=>new Date().toISOString()}){
  requireAdapter("treasury",treasury,"compare");
  return {async check(input){
    const normalized=validateTreasuryRateSpreadInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence(
        "treasury_fiscal_data",
        await treasury.compare({
          leftSecurity:normalized.leftSecurity,
          rightSecurity:normalized.rightSecurity
        })
      );
    }catch(error){
      const detail=error?.code||error?.message||"comparison failed";
      sourceFailures.push({source:"treasury_fiscal_data",detail});
      evidence=sourceUnavailable("treasury_fiscal_data",detail);
    }

    const result=assessTreasuryRateSpread(evidence,{
      toleranceBps:normalized.toleranceBps,
      checkedAt:now()
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

module.exports={validateTreasuryRateSpreadInput,createTreasuryRateSpreadService};
