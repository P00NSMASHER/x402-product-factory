"use strict";
const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {parseAllowedKinds}=require("../pa-entity-type-policy/service");
const {parseAllowedCounties}=require("../pa-registered-county-policy/service");
const {parseAge}=require("../pa-business-formation-age/service");
const {assessLocalVendorPolicy}=require("./decision");

function validateCompany(value){
  const company=String(value??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;}
  return company;
}
function validateLocalVendorPolicyInput(input){
  return {
    company:validateCompany(input?.company),
    allowedKinds:parseAllowedKinds(input?.allowedKinds),
    allowedCounties:parseAllowedCounties(input?.allowedCounties),
    minAgeDays:parseAge(input?.minAgeDays)
  };
}
function createLocalVendorPolicyService({registry,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  return {async check(input){
    const normalized=validateLocalVendorPolicyInput(input);
    const sourceFailures=[];
    let evidence;
    try{
      evidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      evidence=sourceUnavailable("pa_registry",detail);
    }
    const result=assessLocalVendorPolicy(evidence,{
      allowedKinds:normalized.allowedKinds,
      allowedCounties:normalized.allowedCounties,
      minAgeDays:normalized.minAgeDays,
      now:now()
    });
    return {...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence};
  }};
}
module.exports={validateLocalVendorPolicyInput,createLocalVendorPolicyService};
