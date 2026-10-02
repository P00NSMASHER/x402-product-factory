"use strict";

const {dateOnlyMs,utcDayStartMs}=require("../domain-registration-age/decision");

function assessPaVendorNewDomain({registry,rdap},{
  minDomainAgeDays=90,
  now=new Date().toISOString()
}={}){
  if(!Number.isInteger(minDomainAgeDays)||minDomainAgeDays<1||minDomainAgeDays>3650){
    throw new Error("invalid_min_domain_age_days");
  }
  const today=utcDayStartMs(now);
  if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const cutoff=today-minDomainAgeDays*86400000;
  const cutoffDate=new Date(cutoff).toISOString().slice(0,10);

  const base={
    matchedEntity:registry?.entity??null,
    domain:rdap?.domain??null,
    registrationDate:null,
    domainAgeDays:null,
    minDomainAgeDays,
    cutoffDate,
    checkedAt
  };

  if(registry?.available!==true){
    return {...base,decision:"human_review",reasonCodes:["PA_REGISTRY_UNAVAILABLE"]};
  }
  const candidateCount=Number.isInteger(registry.candidateCount)
    ?registry.candidateCount
    :(registry.entity?1:0);
  if(!registry.entity&&candidateCount===0){
    return {...base,decision:"company_not_found",reasonCodes:["PA_ENTITY_NOT_FOUND"]};
  }
  if(registry.strongMatch!==true||registry.ambiguous===true){
    return {
      ...base,
      decision:"human_review",
      reasonCodes:[registry.ambiguous===true?"PA_REGISTRY_MATCH_AMBIGUOUS":"PA_REGISTRY_MATCH_UNCERTAIN"]
    };
  }

  if(rdap?.available!==true){
    return {...base,decision:"human_review",reasonCodes:["RDAP_EVIDENCE_UNAVAILABLE"]};
  }
  if(rdap.registered===false){
    return {...base,decision:"unregistered_domain",reasonCodes:["DOMAIN_UNREGISTERED"]};
  }
  if(rdap.registered!==true){
    return {...base,decision:"human_review",reasonCodes:["DOMAIN_REGISTRATION_STATUS_UNKNOWN"]};
  }
  if(rdap.nameAligned!==true){
    return {...base,decision:"domain_mismatch",reasonCodes:["DOMAIN_LEGAL_NAME_MISMATCH"]};
  }

  const registrationRaw=rdap?.events?.registration??rdap?.events?.registered??null;
  const registrationMs=dateOnlyMs(registrationRaw);
  if(registrationMs==null){
    return {...base,decision:"human_review",reasonCodes:["DOMAIN_REGISTRATION_DATE_UNAVAILABLE"]};
  }

  const domainAgeDays=Math.floor((today-registrationMs)/86400000);
  const established=registrationMs<=cutoff;

  return {
    ...base,
    decision:established?"established_domain_match":"recent_domain_review",
    reasonCodes:[
      established
        ?"DOMAIN_ALIGNED_AND_AGE_AT_OR_ABOVE_THRESHOLD"
        :"DOMAIN_ALIGNED_BUT_REGISTERED_WITHIN_THRESHOLD"
    ],
    registrationDate:new Date(registrationMs).toISOString().slice(0,10),
    domainAgeDays
  };
}

module.exports={assessPaVendorNewDomain};
