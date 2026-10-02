"use strict";

const {dateOnlyMs,utcDayStartMs}=require("../domain-registration-age/decision");

function assessCounterpartyReview({registry,ofac,rdap},{
  minScore=90,
  minDomainAgeDays=90,
  now=new Date().toISOString()
}={}){
  if(!Number.isInteger(minScore)||minScore<70||minScore>100)throw new Error("invalid_min_score");
  if(!Number.isInteger(minDomainAgeDays)||minDomainAgeDays<1||minDomainAgeDays>3650)throw new Error("invalid_min_domain_age_days");
  const today=utcDayStartMs(now);
  if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const checks={};
  const reasonCodes=[];
  const matchedEntity=registry?.entity??null;
  const screenedLegalName=
    typeof matchedEntity?.businessName==="string"&&matchedEntity.businessName.trim()
      ?matchedEntity.businessName.trim()
      :null;

  if(registry?.available!==true){
    checks.registry={status:"review",reason:"PA_REGISTRY_UNAVAILABLE"};
    return {
      decision:"human_review",reasonCodes:["PA_REGISTRY_UNAVAILABLE"],checks,
      matchedEntity:null,screenedLegalName:null,domain:rdap?.domain??null,
      domainAgeDays:null,minScore,minDomainAgeDays,checkedAt
    };
  }

  const candidateCount=Number.isInteger(registry.candidateCount)
    ?registry.candidateCount
    :(registry.entity?1:0);
  if(!registry.entity&&candidateCount===0){
    checks.registry={status:"review",reason:"PA_ENTITY_NOT_FOUND"};
    return {
      decision:"human_review",reasonCodes:["PA_ENTITY_NOT_FOUND"],checks,
      matchedEntity:null,screenedLegalName:null,domain:rdap?.domain??null,
      domainAgeDays:null,minScore,minDomainAgeDays,checkedAt
    };
  }

  if(registry.strongMatch!==true||registry.ambiguous===true){
    const reason=registry.ambiguous===true
      ?"PA_REGISTRY_MATCH_AMBIGUOUS"
      :"PA_REGISTRY_MATCH_UNCERTAIN";
    checks.registry={status:"review",reason};
    return {
      decision:"human_review",reasonCodes:[reason],checks,
      matchedEntity,screenedLegalName,domain:rdap?.domain??null,
      domainAgeDays:null,minScore,minDomainAgeDays,checkedAt
    };
  }

  if(!screenedLegalName){
    checks.registry={status:"review",reason:"PA_REGISTRY_LEGAL_NAME_UNAVAILABLE"};
    return {
      decision:"human_review",reasonCodes:["PA_REGISTRY_LEGAL_NAME_UNAVAILABLE"],checks,
      matchedEntity,screenedLegalName:null,domain:rdap?.domain??null,
      domainAgeDays:null,minScore,minDomainAgeDays,checkedAt
    };
  }
  checks.registry={status:"pass",reason:"PA_REGISTRY_STRONG_MATCH"};

  if(ofac?.available!==true){
    checks.ofac={status:"review",reason:"OFAC_EVIDENCE_UNAVAILABLE"};
    reasonCodes.push("OFAC_EVIDENCE_UNAVAILABLE");
  }else{
    const candidates=Array.isArray(ofac.candidates)?ofac.candidates:[];
    const total=Number.isInteger(ofac.totalCandidatesAboveThreshold)
      ?ofac.totalCandidatesAboveThreshold
      :candidates.length;
    if(total>0){
      checks.ofac={status:"review",reason:"OFAC_CANDIDATE_REQUIRES_REVIEW",candidateCount:total};
      reasonCodes.push("OFAC_CANDIDATE_REQUIRES_REVIEW");
    }else{
      checks.ofac={status:"pass",reason:"NO_OFAC_NAME_CANDIDATE_AT_THRESHOLD",candidateCount:0};
    }
  }

  let domainAgeDays=null;
  if(rdap?.available!==true){
    checks.domain={status:"review",reason:"RDAP_EVIDENCE_UNAVAILABLE"};
    reasonCodes.push("RDAP_EVIDENCE_UNAVAILABLE");
  }else if(rdap.registered===false){
    checks.domain={status:"review",reason:"DOMAIN_UNREGISTERED"};
    reasonCodes.push("DOMAIN_UNREGISTERED");
  }else if(rdap.registered!==true){
    checks.domain={status:"review",reason:"DOMAIN_REGISTRATION_STATUS_UNKNOWN"};
    reasonCodes.push("DOMAIN_REGISTRATION_STATUS_UNKNOWN");
  }else if(rdap.nameAligned!==true){
    checks.domain={status:"review",reason:"DOMAIN_LEGAL_NAME_MISMATCH"};
    reasonCodes.push("DOMAIN_LEGAL_NAME_MISMATCH");
  }else{
    const registrationRaw=rdap?.events?.registration??rdap?.events?.registered??null;
    const registrationMs=dateOnlyMs(registrationRaw);
    if(registrationMs==null){
      checks.domain={status:"review",reason:"DOMAIN_REGISTRATION_DATE_UNAVAILABLE"};
      reasonCodes.push("DOMAIN_REGISTRATION_DATE_UNAVAILABLE");
    }else{
      domainAgeDays=Math.floor((today-registrationMs)/86400000);
      if(domainAgeDays<minDomainAgeDays){
        checks.domain={status:"review",reason:"DOMAIN_RECENT_REGISTRATION",domainAgeDays};
        reasonCodes.push("DOMAIN_RECENT_REGISTRATION");
      }else{
        checks.domain={status:"pass",reason:"DOMAIN_ALIGNED_AND_ESTABLISHED",domainAgeDays};
      }
    }
  }

  return {
    decision:reasonCodes.length===0?"proceed":"human_review",
    reasonCodes,
    checks,
    matchedEntity,
    screenedLegalName,
    domain:rdap?.domain??null,
    domainAgeDays,
    minScore,
    minDomainAgeDays,
    checkedAt
  };
}

module.exports={assessCounterpartyReview};
