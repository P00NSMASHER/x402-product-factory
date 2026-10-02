"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessFilingFreshness}=require("./decision");

function parsePositiveInt(value,field,defaultValue,min,max){
  if(value===undefined||value===null||value==="")return defaultValue;
  const raw=typeof value==="number"?String(value):String(value).trim();
  if(!/^\d+$/.test(raw)){
    const e=new Error(field+" must be an integer");
    e.code="INVALID_INPUT";
    throw e;
  }
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n<min||n>max){
    const e=new Error(field+" must be between "+min+" and "+max);
    e.code="INVALID_INPUT";
    throw e;
  }
  return n;
}

function validateFilingFreshnessInput(input){
  const ticker=String(input?.ticker??"").trim().toUpperCase();
  const cik=String(input?.cik??"").trim();
  if(Boolean(ticker)===Boolean(cik)){
    const e=new Error("provide exactly one of ticker or cik");
    e.code="INVALID_INPUT";
    throw e;
  }
  if(ticker&&(ticker.length>12||!/^[A-Z0-9.\-]+$/.test(ticker))){
    const e=new Error("invalid ticker");
    e.code="INVALID_INPUT";
    throw e;
  }
  if(cik&&!/^\d{1,10}$/.test(cik)){
    const e=new Error("invalid cik");
    e.code="INVALID_INPUT";
    throw e;
  }
  const form=String(input?.form??"").trim().toUpperCase();
  if(form.length>20){
    const e=new Error("form is too long");
    e.code="INVALID_INPUT";
    throw e;
  }
  const maxAgeDays=parsePositiveInt(input?.maxAgeDays,"maxAgeDays",30,1,365);
  return {ticker,cik,form,maxAgeDays};
}

function createSecFilingFreshnessService({sec,now=()=>new Date().toISOString()}){
  requireAdapter("sec",sec,"lookup");

  return {async check(input){
    const normalized=validateFilingFreshnessInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("sec_edgar",await sec.lookup({
        ticker:normalized.ticker,
        cik:normalized.cik,
        form:normalized.form,
        limit:25
      }));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"sec_edgar",detail});
      evidence=sourceUnavailable("sec_edgar",detail);
    }

    const result=assessFilingFreshness(evidence,{
      maxAgeDays:normalized.maxAgeDays,
      now:now()
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

module.exports={validateFilingFreshnessInput,createSecFilingFreshnessService};
