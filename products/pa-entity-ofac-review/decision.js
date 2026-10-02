"use strict";

function assessPaEntityOfacReview({registry,ofac},{minScore=90,checkedAt=new Date().toISOString()}={}){
  const checks={};
  const reasonCodes=[];

  if(registry?.available!==true){
    checks.registry={status:"review",reason:"PA_REGISTRY_UNAVAILABLE"};
    return {
      decision:"human_review",
      reasonCodes:["PA_REGISTRY_UNAVAILABLE"],
      checks,
      matchedEntity:null,
      screenedName:null,
      candidateCount:0,
      candidates:[],
      minScore,
      checkedAt
    };
  }

  const candidateCount=Number.isInteger(registry.candidateCount)?registry.candidateCount:(registry.entity?1:0);
  if(!registry.entity&&candidateCount===0){
    checks.registry={status:"pass",reason:"PA_ENTITY_NOT_FOUND"};
    return {
      decision:"company_not_found",
      reasonCodes:["PA_ENTITY_NOT_FOUND"],
      checks,
      matchedEntity:null,
      screenedName:null,
      candidateCount:0,
      candidates:[],
      minScore,
      checkedAt
    };
  }

  if(registry.strongMatch!==true||registry.ambiguous===true){
    checks.registry={status:"review",reason:registry.ambiguous===true?"PA_REGISTRY_MATCH_AMBIGUOUS":"PA_REGISTRY_MATCH_UNCERTAIN"};
    return {
      decision:"human_review",
      reasonCodes:[checks.registry.reason],
      checks,
      matchedEntity:registry.entity??null,
      screenedName:null,
      candidateCount:0,
      candidates:[],
      minScore,
      checkedAt
    };
  }

  const screenedName=typeof registry.entity?.businessName==="string"
    ?registry.entity.businessName.trim()
    :"";
  if(!screenedName){
    checks.registry={status:"review",reason:"PA_REGISTRY_LEGAL_NAME_UNAVAILABLE"};
    return {
      decision:"human_review",
      reasonCodes:["PA_REGISTRY_LEGAL_NAME_UNAVAILABLE"],
      checks,
      matchedEntity:registry.entity??null,
      screenedName:null,
      candidateCount:0,
      candidates:[],
      minScore,
      checkedAt
    };
  }
  checks.registry={status:"pass",reason:"PA_REGISTRY_STRONG_MATCH"};

  if(ofac?.available!==true){
    checks.ofac={status:"review",reason:"OFAC_EVIDENCE_UNAVAILABLE"};
    return {
      decision:"human_review",
      reasonCodes:["OFAC_EVIDENCE_UNAVAILABLE"],
      checks,
      matchedEntity:registry.entity,
      screenedName,
      candidateCount:0,
      candidates:[],
      minScore,
      checkedAt
    };
  }

  const candidates=Array.isArray(ofac.candidates)?ofac.candidates:[];
  const total=Number.isInteger(ofac.totalCandidatesAboveThreshold)
    ?ofac.totalCandidatesAboveThreshold
    :candidates.length;
  const found=total>0;
  checks.ofac={
    status:"pass",
    reason:found?"OFAC_REVIEW_CANDIDATE_FOUND":"NO_OFAC_NAME_CANDIDATE_AT_THRESHOLD"
  };

  return {
    decision:found?"candidate_found":"no_candidate",
    reasonCodes:[checks.ofac.reason],
    checks,
    matchedEntity:registry.entity,
    screenedName,
    candidateCount:total,
    candidates,
    minScore,
    checkedAt
  };
}

module.exports={assessPaEntityOfacReview};
