"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {normalizeCik,normalizeTicker}=require("../../packages/sources/sec-filings");
const {assessSecCompanyIdentity}=require("./decision");

function validateSecCompanyIdentityInput(input){
  const company=String(input?.company??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>160){
    const e=new Error("company must be 2-160 characters");
    e.code="INVALID_INPUT";
    throw e;
  }

  const rawTicker=String(input?.ticker??"").trim();
  const rawCik=String(input?.cik??"").trim();
  if(Boolean(rawTicker)===Boolean(rawCik)){
    const e=new Error("provide exactly one of ticker or cik");
    e.code="INVALID_INPUT";
    throw e;
  }

  const ticker=rawTicker?normalizeTicker(rawTicker):null;
  const cik=rawCik?normalizeCik(rawCik):null;
  if(rawTicker&&!ticker){
    const e=new Error("invalid ticker");
    e.code="INVALID_INPUT";
    throw e;
  }
  if(rawCik&&!cik){
    const e=new Error("invalid cik");
    e.code="INVALID_INPUT";
    throw e;
  }

  return {company,ticker:ticker??"",cik:cik??""};
}

function createSecCompanyIdentityService({sec,now=()=>new Date().toISOString()}){
  requireAdapter("sec",sec,"lookup");

  return {async check(input){
    const normalized=validateSecCompanyIdentityInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("sec_edgar",await sec.lookup({
        ticker:normalized.ticker,
        cik:normalized.cik,
        form:"",
        limit:1
      }));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"sec_edgar",detail});
      evidence=sourceUnavailable("sec_edgar",detail);
    }

    const result=assessSecCompanyIdentity(evidence,{
      expectedCompany:normalized.company,
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

module.exports={validateSecCompanyIdentityInput,createSecCompanyIdentityService};
