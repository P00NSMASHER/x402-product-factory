"use strict";

const {validDate}=require("../pa-business-formation-age/decision");
const {dateOnlyMs,utcDayStartMs}=require("../domain-registration-age/decision");

const DAY_MS=86400000;

function assessVendorMaturity({registry,rdap},{
  minEntityAgeDays=30,
  minDomainAgeDays=90,
  now=new Date().toISOString()
}={}){
  if(!Number.isInteger(minEntityAgeDays)||minEntityAgeDays<1||minEntityAgeDays>36500){
    throw new Error("invalid_min_entity_age_days");
  }
  if(!Number.isInteger(minDomainAgeDays)||minDomainAgeDays<1||minDomainAgeDays>3650){
    throw new Error("invalid_min_domain_age_days");
  }
  const today=utcDayStartMs(now);
  if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const reasonCodes=[];
  const matchedEntity=registry?.entity??null;

  if(registry?.available!==true){
    return {
      decision:"human_review",reasonCodes:["PA_REGISTRY_UNAVAILABLE"],
      matchedEntity:null,entityAgeDays:null,domain:rdap?.domain??null,domainAgeDays:null,
      minEntityAgeDays,minDomainAgeDays,checkedAt
    };
  }

  const candidateCount=Number.isInteger(registry.candidateCount)
    ?registry.candidateCount
    :(registry.entity?1:0);
  if(!registry.entity&&candidateCount===0){
    return {
      decision:"human_review",reasonCodes:["PA_ENTITY_NOT_FOUND"],
      matchedEntity:null,entityAgeDays:null,domain:rdap?.domain??null,domainAgeDays:null,
      minEntityAgeDays,minDomainAgeDays,checkedAt
    };
  }

  if(registry.strongMatch!==true||registry.ambiguous===true){
    return {
      decision:"human_review",
      reasonCodes:[registry.ambiguous===true?"PA_REGISTRY_MATCH_AMBIGUOUS":"PA_REGISTRY_MATCH_UNCERTAIN"],
      matchedEntity,entityAgeDays:null,domain:rdap?.domain??null,domainAgeDays:null,
      minEntityAgeDays,minDomainAgeDays,checkedAt
    };
  }

  let entityAgeDays=null;
  const formationMs=validDate(matchedEntity?.creationDate);
  if(formationMs==null||formationMs>today){
    reasonCodes.push("FORMATION_DATE_UNAVAILABLE");
  }else{
    entityAgeDays=Math.floor((today-formationMs)/DAY_MS);
    if(entityAgeDays<minEntityAgeDays)reasonCodes.push("ENTITY_RECENT_FORMATION");
  }

  let domainAgeDays=null;
  if(rdap?.available!==true){
    reasonCodes.push("RDAP_EVIDENCE_UNAVAILABLE");
  }else if(rdap.registered===false){
    reasonCodes.push("DOMAIN_UNREGISTERED");
  }else if(rdap.registered!==true){
    reasonCodes.push("DOMAIN_REGISTRATION_STATUS_UNKNOWN");
  }else if(rdap.nameAligned!==true){
    reasonCodes.push("DOMAIN_LEGAL_NAME_MISMATCH");
  }else{
    const registrationRaw=rdap?.events?.registration??rdap?.events?.registered??null;
    const registrationMs=dateOnlyMs(registrationRaw);
    if(registrationMs==null||registrationMs>today){
      reasonCodes.push("DOMAIN_REGISTRATION_DATE_UNAVAILABLE");
    }else{
      domainAgeDays=Math.floor((today-registrationMs)/DAY_MS);
      if(domainAgeDays<minDomainAgeDays)reasonCodes.push("DOMAIN_RECENT_REGISTRATION");
    }
  }

  return {
    decision:reasonCodes.length===0?"established_vendor":"human_review",
    reasonCodes,
    matchedEntity,
    entityAgeDays,
    minEntityAgeDays,
    domain:rdap?.domain??null,
    domainAgeDays,
    minDomainAgeDays,
    checkedAt
  };
}

module.exports={DAY_MS,assessVendorMaturity};
