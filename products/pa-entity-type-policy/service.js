"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {KNOWN_KINDS,assessEntityTypePolicy}=require("./decision");

function validateCompany(value){
  const company=String(value??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;}
  return company;
}

function parseAllowedKinds(value){
  const raw=String(value??"").trim();
  if(!raw){const e=new Error("allowedKinds is required");e.code="INVALID_INPUT";throw e;}
  const kinds=[...new Set(raw.split(",").map(v=>v.trim().toLowerCase()).filter(Boolean))];
  if(kinds.length<1||kinds.length>KNOWN_KINDS.length){const e=new Error("allowedKinds must contain 1-6 supported values");e.code="INVALID_INPUT";throw e;}
  const invalid=kinds.filter(v=>!KNOWN_KINDS.includes(v));
  if(invalid.length){const e=new Error("unsupported allowedKinds: "+invalid.join(","));e.code="INVALID_INPUT";throw e;}
  return kinds;
}

function validateEntityTypePolicyInput(input){
  return {company:validateCompany(input?.company),allowedKinds:parseAllowedKinds(input?.allowedKinds)};
}

function createEntityTypePolicyService({registry,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  return {async check(input){
    const normalized=validateEntityTypePolicyInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      evidence=sourceUnavailable("pa_registry",detail);
    }
    const result=assessEntityTypePolicy(evidence,normalized.allowedKinds,now());
    return {
      ...result,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence
    };
  }};
}

module.exports={parseAllowedKinds,validateEntityTypePolicyInput,createEntityTypePolicyService};
