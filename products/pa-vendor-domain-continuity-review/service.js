"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {domainNameAligned}=require("../pa-vendor-identity-match/service");
const {assessVendorDomainContinuity}=require("./decision");

function normalizeDomain(raw){
  let domain=String(raw??"").trim().toLowerCase();
  if(domain.endsWith("."))domain=domain.slice(0,-1);
  if(domain.length<3||domain.length>253||!/^[a-z0-9.-]+$/.test(domain)||!domain.includes(".")){
    const e=new Error("invalid domain");e.code="INVALID_INPUT";throw e;
  }
  const labels=domain.split(".");
  if(labels.some(x=>!x||x.length>63||x.startsWith("-")||x.endsWith("-"))){
    const e=new Error("invalid domain");e.code="INVALID_INPUT";throw e;
  }
  return domain;
}

function parseInteger(value,{name,min,max,defaultValue}){
  if(value===undefined||value===null||value==="")return defaultValue;
  const raw=String(value).trim();
  if(!/^\d+$/.test(raw)){const e=new Error(name+" must be an integer");e.code="INVALID_INPUT";throw e;}
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n<min||n>max){
    const e=new Error(name+" must be between "+min+" and "+max);e.code="INVALID_INPUT";throw e;
  }
  return n;
}

function validateVendorDomainContinuityInput(input){
  const company=String(input?.company??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){
    const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;
  }
  return {
    company,
    domain:normalizeDomain(input?.domain),
    minExpirationDays:parseInteger(input?.minExpirationDays,{name:"minExpirationDays",min:1,max:3650,defaultValue:180}),
    minStableDays:parseInteger(input?.minStableDays,{name:"minStableDays",min:1,max:3650,defaultValue:30})
  };
}

function createVendorDomainContinuityService({registry,rdap,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  requireAdapter("rdap",rdap,"lookup");

  return {async check(input){
    const normalized=validateVendorDomainContinuityInput(input);
    const sourceFailures=[];

    let registryEvidence;
    try{
      registryEvidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      registryEvidence=sourceUnavailable("pa_registry",detail);
    }

    let rdapEvidence=null;
    const legalName=
      registryEvidence?.available===true&&
      registryEvidence?.strongMatch===true&&
      registryEvidence?.ambiguous!==true&&
      typeof registryEvidence?.entity?.businessName==="string"
        ?registryEvidence.entity.businessName.trim()
        :"";

    if(legalName){
      try{
        rdapEvidence=normalizedEvidence("rdap",await rdap.lookup({domain:normalized.domain}));
        rdapEvidence={
          ...rdapEvidence,
          nameAligned:
            rdapEvidence.available===true&&rdapEvidence.registered===true
              ?domainNameAligned(normalized.domain,legalName)
              :false,
          alignedAgainstLegalName:legalName
        };
      }catch(error){
        const detail=error?.code||error?.message||"lookup failed";
        sourceFailures.push({source:"rdap",detail});
        rdapEvidence=sourceUnavailable("rdap",detail);
      }
    }

    const result=assessVendorDomainContinuity(
      {registry:registryEvidence,rdap:rdapEvidence},
      {
        minExpirationDays:normalized.minExpirationDays,
        minStableDays:normalized.minStableDays,
        now:now()
      }
    );

    return {
      ...result,
      input:normalized,
      resolvedLegalName:legalName||null,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence:{registry:registryEvidence,rdap:rdapEvidence},
      limitations:[
        "Stable domain is a continuity/timing workflow signal only.",
        "Expiration runway does not guarantee renewal or uninterrupted service.",
        "Last-changed recency does not by itself establish compromise, ownership transfer, malicious activity, or fraud.",
        "Legal-name/domain alignment does not prove domain ownership or control.",
        "A Pennsylvania registry match does not prove good standing, ownership, authority, creditworthiness, or legal compliance."
      ]
    };
  }};
}

module.exports={
  normalizeDomain,parseInteger,validateVendorDomainContinuityInput,
  createVendorDomainContinuityService
};
