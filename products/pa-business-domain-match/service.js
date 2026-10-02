"use strict";
const {assessBusinessDomain}=require("./decision");
const {sourceUnavailable,requireAdapter,normalizedEvidence}=require("../../packages/sources/contracts");
const {validateVendorIdentityInput,canonicalBusinessName,domainNameAligned}=require("../pa-vendor-identity-match/service");

function validateBusinessDomainInput(input){
  const n=validateVendorIdentityInput({company:input?.company,address:"placeholder address",domain:input?.domain});
  return {company:n.company,domain:n.domain};
}

function createBusinessDomainService({registry,rdap,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  requireAdapter("rdap",rdap,"lookup");
  return {async check(input){
    const normalized=validateBusinessDomainInput(input);
    const sourceFailures=[];
    let registryEvidence;
    try{registryEvidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));}
    catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      registryEvidence=sourceUnavailable("pa_registry",detail);
    }

    let rdapEvidence;
    try{
      rdapEvidence=normalizedEvidence("rdap",await rdap.lookup({domain:normalized.domain}));
      rdapEvidence={
        ...rdapEvidence,
        nameAligned:
          rdapEvidence.available===true&&rdapEvidence.registered===true
            ? domainNameAligned(normalized.domain,normalized.company)
            : false
      };
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"rdap",detail});
      rdapEvidence=sourceUnavailable("rdap",detail);
    }

    const decision=assessBusinessDomain({registry:registryEvidence,rdap:rdapEvidence},now());
    return {
      ...decision,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence:{registry:registryEvidence,rdap:rdapEvidence}
    };
  }};
}
module.exports={validateBusinessDomainInput,createBusinessDomainService,canonicalBusinessName,domainNameAligned};
