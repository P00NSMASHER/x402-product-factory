"use strict";
const {normalizeRegistrationKind}=require("../pa-entity-type-policy/decision");
const {normalizeCountyName}=require("../pa-registered-county-policy/decision");
const {validDate,DAY_MS}=require("../pa-business-formation-age/decision");

function assessLocalVendorPolicy(evidence,{allowedKinds,allowedCounties,minAgeDays,now=new Date().toISOString()}){
  const entity=evidence?.entity??null;
  const checkedAt=now;
  const reasons=[];
  const checks={
    entityType:{status:"review",registrationKind:null},
    county:{status:"review",registeredCounty:null},
    formationAge:{status:"review",ageDays:null}
  };

  if(evidence?.available!==true){
    return {decision:"human_review",reasonCodes:["PA_REGISTRY_UNAVAILABLE"],checks,matchedEntity:entity,checkedAt};
  }
  if(!entity){
    return {decision:"company_not_found",reasonCodes:["PA_ENTITY_NOT_FOUND"],checks,matchedEntity:null,checkedAt};
  }
  if(evidence.ambiguous===true||evidence.strongMatch!==true){
    return {decision:"human_review",reasonCodes:["PA_REGISTRY_MATCH_UNCERTAIN"],checks,matchedEntity:entity,checkedAt};
  }

  const registrationKind=normalizeRegistrationKind(entity.registrationType);
  checks.entityType.registrationKind=registrationKind;
  if(!registrationKind){
    checks.entityType.status="review";checks.entityType.reason="REGISTRATION_TYPE_UNRECOGNIZED";reasons.push("REGISTRATION_TYPE_UNRECOGNIZED");
  }else if(allowedKinds.includes(registrationKind)){
    checks.entityType.status="pass";checks.entityType.reason="ENTITY_TYPE_ALLOWED";
  }else{
    checks.entityType.status="review";checks.entityType.reason="ENTITY_TYPE_NOT_ALLOWED";reasons.push("ENTITY_TYPE_NOT_ALLOWED");
  }

  const registeredCounty=normalizeCountyName(entity.county);
  checks.county.registeredCounty=registeredCounty;
  if(!registeredCounty){
    checks.county.status="review";checks.county.reason="REGISTERED_COUNTY_UNAVAILABLE";reasons.push("REGISTERED_COUNTY_UNAVAILABLE");
  }else if(allowedCounties.includes(registeredCounty)){
    checks.county.status="pass";checks.county.reason="REGISTERED_COUNTY_ALLOWED";
  }else{
    checks.county.status="review";checks.county.reason="REGISTERED_COUNTY_NOT_ALLOWED";reasons.push("REGISTERED_COUNTY_NOT_ALLOWED");
  }

  const created=validDate(entity.creationDate);
  const nowTime=Date.parse(now);
  if(created==null||!Number.isFinite(nowTime)||created>nowTime){
    checks.formationAge.status="review";checks.formationAge.reason="FORMATION_DATE_UNAVAILABLE";reasons.push("FORMATION_DATE_UNAVAILABLE");
  }else{
    const ageDays=Math.floor((nowTime-created)/DAY_MS);
    checks.formationAge.ageDays=ageDays;
    if(ageDays>=minAgeDays){
      checks.formationAge.status="pass";checks.formationAge.reason="FORMATION_AGE_AT_OR_ABOVE_THRESHOLD";
    }else{
      checks.formationAge.status="review";checks.formationAge.reason="FORMATION_AGE_BELOW_THRESHOLD";reasons.push("FORMATION_AGE_BELOW_THRESHOLD");
    }
  }

  return {
    decision:reasons.length===0?"proceed":"human_review",
    reasonCodes:reasons,
    checks,
    matchedEntity:entity,
    policy:{allowedKinds:[...allowedKinds],allowedCounties:[...allowedCounties],minAgeDays,automaticReject:false},
    checkedAt
  };
}

module.exports={assessLocalVendorPolicy};
