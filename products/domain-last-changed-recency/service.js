"use strict";
const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {validateDomainAgeInput}=require("../domain-registration-age/service");
const {assessDomainLastChanged}=require("./decision");
function validateRecencyInput(input){
  const base=validateDomainAgeInput({domain:input?.domain,minAgeDays:1});
  const raw=input?.maxAgeDays===undefined||input?.maxAgeDays===null||input?.maxAgeDays===""?"90":String(input.maxAgeDays).trim();
  if(!/^\d+$/.test(raw)){const e=new Error("maxAgeDays must be an integer");e.code="INVALID_INPUT";throw e;}
  const maxAgeDays=Number(raw);
  if(!Number.isSafeInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>3650){const e=new Error("maxAgeDays must be between 1 and 3650");e.code="INVALID_INPUT";throw e;}
  return{domain:base.domain,maxAgeDays};
}
function createDomainLastChangedService({rdap,now=()=>new Date().toISOString()}){
  requireAdapter("rdap",rdap,"lookup");
  return{async check(input){
    const normalized=validateRecencyInput(input);
    const sourceFailures=[];
    let evidence;
    try{evidence=normalizedEvidence("rdap",await rdap.lookup({domain:normalized.domain}));}
    catch(error){const detail=error?.code||error?.message||"lookup failed";sourceFailures.push({source:"rdap",detail});evidence=sourceUnavailable("rdap",detail);}
    const result=assessDomainLastChanged(evidence,{maxAgeDays:normalized.maxAgeDays,now:now()});
    return{...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence};
  }};
}
module.exports={validateRecencyInput,createDomainLastChangedService};
