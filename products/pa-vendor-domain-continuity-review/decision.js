"use strict";

const {dateOnlyMs,utcDayStartMs}=require("../domain-expiration-horizon/decision");

const DAY_MS=86400000;

function assessVendorDomainContinuity({registry,rdap},{
  minExpirationDays=180,
  minStableDays=30,
  now=new Date().toISOString()
}={}){
  if(!Number.isInteger(minExpirationDays)||minExpirationDays<1||minExpirationDays>3650){
    throw new Error("invalid_min_expiration_days");
  }
  if(!Number.isInteger(minStableDays)||minStableDays<1||minStableDays>3650){
    throw new Error("invalid_min_stable_days");
  }
  const today=utcDayStartMs(now);
  if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const reasonCodes=[];
  const matchedEntity=registry?.entity??null;

  if(registry?.available!==true){
    return {
      decision:"human_review",reasonCodes:["PA_REGISTRY_UNAVAILABLE"],
      matchedEntity:null,domain:rdap?.domain??null,
      expirationDate:null,daysUntilExpiration:null,
      lastChangedDate:null,daysSinceLastChanged:null,
      minExpirationDays,minStableDays,checkedAt
    };
  }

  const candidateCount=Number.isInteger(registry.candidateCount)
    ?registry.candidateCount
    :(registry.entity?1:0);
  if(!registry.entity&&candidateCount===0){
    return {
      decision:"human_review",reasonCodes:["PA_ENTITY_NOT_FOUND"],
      matchedEntity:null,domain:rdap?.domain??null,
      expirationDate:null,daysUntilExpiration:null,
      lastChangedDate:null,daysSinceLastChanged:null,
      minExpirationDays,minStableDays,checkedAt
    };
  }

  if(registry.strongMatch!==true||registry.ambiguous===true){
    return {
      decision:"human_review",
      reasonCodes:[registry.ambiguous===true?"PA_REGISTRY_MATCH_AMBIGUOUS":"PA_REGISTRY_MATCH_UNCERTAIN"],
      matchedEntity,domain:rdap?.domain??null,
      expirationDate:null,daysUntilExpiration:null,
      lastChangedDate:null,daysSinceLastChanged:null,
      minExpirationDays,minStableDays,checkedAt
    };
  }

  if(rdap?.available!==true){
    return {
      decision:"human_review",reasonCodes:["RDAP_EVIDENCE_UNAVAILABLE"],
      matchedEntity,domain:rdap?.domain??null,
      expirationDate:null,daysUntilExpiration:null,
      lastChangedDate:null,daysSinceLastChanged:null,
      minExpirationDays,minStableDays,checkedAt
    };
  }

  if(rdap.registered===false){
    return {
      decision:"human_review",reasonCodes:["DOMAIN_UNREGISTERED"],
      matchedEntity,domain:rdap?.domain??null,
      expirationDate:null,daysUntilExpiration:null,
      lastChangedDate:null,daysSinceLastChanged:null,
      minExpirationDays,minStableDays,checkedAt
    };
  }

  if(rdap.registered!==true){
    return {
      decision:"human_review",reasonCodes:["DOMAIN_REGISTRATION_STATUS_UNKNOWN"],
      matchedEntity,domain:rdap?.domain??null,
      expirationDate:null,daysUntilExpiration:null,
      lastChangedDate:null,daysSinceLastChanged:null,
      minExpirationDays,minStableDays,checkedAt
    };
  }

  if(rdap.nameAligned!==true){
    reasonCodes.push("DOMAIN_LEGAL_NAME_MISMATCH");
  }

  const expirationRaw=rdap?.events?.expiration??rdap?.events?.expiry??null;
  const expirationMs=dateOnlyMs(expirationRaw);
  let expirationDate=null;
  let daysUntilExpiration=null;
  if(expirationMs==null){
    reasonCodes.push("EXPIRATION_DATE_UNAVAILABLE");
  }else{
    expirationDate=new Date(expirationMs).toISOString().slice(0,10);
    daysUntilExpiration=Math.floor((expirationMs-today)/DAY_MS);
    if(daysUntilExpiration<minExpirationDays){
      reasonCodes.push("DOMAIN_EXPIRATION_RUNWAY_BELOW_THRESHOLD");
    }
  }

  const changedRaw=rdap?.events?.lastChanged??null;
  const changedMs=dateOnlyMs(changedRaw);
  let lastChangedDate=null;
  let daysSinceLastChanged=null;
  if(changedMs==null){
    reasonCodes.push("LAST_CHANGED_DATE_UNAVAILABLE");
  }else{
    lastChangedDate=new Date(changedMs).toISOString().slice(0,10);
    daysSinceLastChanged=Math.floor((today-changedMs)/DAY_MS);
    if(daysSinceLastChanged<minStableDays){
      reasonCodes.push("DOMAIN_CHANGED_TOO_RECENTLY");
    }
  }

  return {
    decision:reasonCodes.length===0?"stable_domain":"human_review",
    reasonCodes,
    matchedEntity,
    domain:rdap?.domain??null,
    expirationDate,
    daysUntilExpiration,
    minExpirationDays,
    lastChangedDate,
    daysSinceLastChanged,
    minStableDays,
    checkedAt
  };
}

module.exports={DAY_MS,assessVendorDomainContinuity};
