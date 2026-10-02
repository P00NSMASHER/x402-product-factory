"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessFormationAge}=require("./decision");

function parseAge(value){
  if(value===undefined||value===null||value==="")return 365;
  const raw=String(value).trim();
  if(!/^\d+$/.test(raw)){const e=new Error("minAgeDays must be an integer");e.code="INVALID_INPUT";throw e;}
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n<1||n>36500){const e=new Error("minAgeDays must be between 1 and 36500");e.code="INVALID_INPUT";throw e;}
  return n;
}

function validateFormationAgeInput(input){
  const company=String(input?.company??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;}
  return {company,minAgeDays:parseAge(input?.minAgeDays)};
}

function createFormationAgeService({registry,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  return {async check(input){
    const normalized=validateFormationAgeInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      evidence=sourceUnavailable("pa_registry",detail);
    }

    const result=assessFormationAge(evidence,{minAgeDays:normalized.minAgeDays,now:now()});
    return {
      ...result,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence
    };
  }};
}

module.exports={parseAge,validateFormationAgeInput,createFormationAgeService};
