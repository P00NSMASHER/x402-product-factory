"use strict";

const KNOWN_KINDS=Object.freeze([
  "llc",
  "corporation",
  "limited_partnership",
  "llp",
  "professional_corporation",
  "other"
]);

function normalizeRegistrationKind(value){
  const text=String(value||"").toUpperCase().replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
  if(!text)return null;
  if(/PROFESSIONAL.*CORPORATION|PROFESSIONAL CORPORATION|\bP C\b/.test(text))return "professional_corporation";
  if(/LIMITED LIABILITY PARTNERSHIP|\bLLP\b/.test(text))return "llp";
  if(/LIMITED PARTNERSHIP|\bL P\b|\bLP\b/.test(text))return "limited_partnership";
  if(/LIMITED LIABILITY COMPANY|\bLLC\b/.test(text))return "llc";
  if(/CORPORATION|\bCORP\b|\bINCORPORATED\b|\bINC\b/.test(text))return "corporation";
  if(text.length>=3)return "other";
  return null;
}

function assessEntityTypePolicy(evidence,allowedKinds,checkedAt=new Date().toISOString()){
  const allowed=new Set(Array.isArray(allowedKinds)?allowedKinds:[]);
  const entity=evidence?.entity??null;
  let decision="human_review";
  let reasonCode="PA_REGISTRY_EVIDENCE_INCOMPLETE";
  let registrationKind=null;

  if(evidence?.available!==true){
    reasonCode="PA_REGISTRY_UNAVAILABLE";
  }else if(!entity){
    decision="company_not_found";
    reasonCode="PA_ENTITY_NOT_FOUND";
  }else if(evidence.ambiguous===true||evidence.strongMatch!==true){
    reasonCode="PA_REGISTRY_MATCH_UNCERTAIN";
  }else{
    registrationKind=normalizeRegistrationKind(entity.registrationType);
    if(!registrationKind){
      reasonCode="REGISTRATION_TYPE_UNRECOGNIZED";
    }else if(allowed.has(registrationKind)){
      decision="policy_match";
      reasonCode="ENTITY_TYPE_ALLOWED";
    }else{
      decision="policy_mismatch";
      reasonCode="ENTITY_TYPE_NOT_ALLOWED";
    }
  }

  return {
    decision,
    reasonCode,
    allowedKinds:[...allowed],
    registrationKind,
    registrationType:entity?.registrationType??null,
    matchedEntity:entity,
    checkedAt
  };
}

module.exports={KNOWN_KINDS,normalizeRegistrationKind,assessEntityTypePolicy};
