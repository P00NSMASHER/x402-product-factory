"use strict";
const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {validateDomainAgeInput}=require("../domain-registration-age/service");
const {assessDomainExpiration}=require("./decision");

function validateExpirationInput(input){
  const base=validateDomainAgeInput({domain:input?.domain,minAgeDays:1});
  const raw=input?.horizonDays===undefined||input?.horizonDays===null||input?.horizonDays===""?"60":String(input.horizonDays).trim();
  if(!/^\d+$/.test(raw)){const e=new Error("horizonDays must be an integer");e.code="INVALID_INPUT";throw e;}
  const horizonDays=Number(raw);
  if(!Number.isSafeInteger(horizonDays)||horizonDays<1||horizonDays>3650){const e=new Error("horizonDays must be between 1 and 3650");e.code="INVALID_INPUT";throw e;}
  return{domain:base.domain,horizonDays};
}

function createDomainExpirationService({rdap,now=()=>new Date().toISOString()}){
  requireAdapter("rdap",rdap,"lookup");
  return{async check(input){
    const normalized=validateExpirationInput(input);
    const sourceFailures=[];
    let evidence;
    try{evidence=normalizedEvidence("rdap",await rdap.lookup({domain:normalized.domain}));}
    catch(error){const detail=error?.code||error?.message||"lookup failed";sourceFailures.push({source:"rdap",detail});evidence=sourceUnavailable("rdap",detail);}
    const result=assessDomainExpiration(evidence,{horizonDays:normalized.horizonDays,now:now()});
    return{...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence};
  }};
}
module.exports={validateExpirationInput,createDomainExpirationService};
