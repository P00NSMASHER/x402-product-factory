"use strict";
const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {PA_COUNTIES,normalizeCountyName,assessRegisteredCountyPolicy}=require("./decision");

function validateCompany(value){
  const company=String(value??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;}
  return company;
}

function parseAllowedCounties(value){
  const raw=String(value??"").trim();
  if(!raw){const e=new Error("allowedCounties is required");e.code="INVALID_INPUT";throw e;}
  const parts=raw.split(",").map(v=>v.trim()).filter(Boolean);
  if(parts.length<1||parts.length>PA_COUNTIES.length){const e=new Error("allowedCounties must contain 1-67 Pennsylvania counties");e.code="INVALID_INPUT";throw e;}
  const normalized=[];
  const invalid=[];
  for(const part of parts){
    const county=normalizeCountyName(part);
    if(!county)invalid.push(part);
    else if(!normalized.includes(county))normalized.push(county);
  }
  if(invalid.length){const e=new Error("unsupported Pennsylvania counties: "+invalid.join(","));e.code="INVALID_INPUT";throw e;}
  return normalized;
}

function validateRegisteredCountyPolicyInput(input){
  return {company:validateCompany(input?.company),allowedCounties:parseAllowedCounties(input?.allowedCounties)};
}

function createRegisteredCountyPolicyService({registry,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  return {async check(input){
    const normalized=validateRegisteredCountyPolicyInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      evidence=sourceUnavailable("pa_registry",detail);
    }
    const result=assessRegisteredCountyPolicy(evidence,normalized.allowedCounties,now());
    return {...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence};
  }};
}

module.exports={parseAllowedCounties,validateRegisteredCountyPolicyInput,createRegisteredCountyPolicyService};
