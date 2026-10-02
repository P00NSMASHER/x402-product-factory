"use strict";

const PA_COUNTIES=Object.freeze([
"Adams","Allegheny","Armstrong","Beaver","Bedford","Berks","Blair","Bradford","Bucks","Butler","Cambria","Cameron","Carbon","Centre","Chester","Clarion","Clearfield","Clinton","Columbia","Crawford","Cumberland","Dauphin","Delaware","Elk","Erie","Fayette","Forest","Franklin","Fulton","Greene","Huntingdon","Indiana","Jefferson","Juniata","Lackawanna","Lancaster","Lawrence","Lebanon","Lehigh","Luzerne","Lycoming","McKean","Mercer","Mifflin","Monroe","Montgomery","Montour","Northampton","Northumberland","Perry","Philadelphia","Pike","Potter","Schuylkill","Snyder","Somerset","Sullivan","Susquehanna","Tioga","Union","Venango","Warren","Washington","Wayne","Westmoreland","Wyoming","York"
]);

const COUNTY_CANONICAL=new Map(PA_COUNTIES.map(name=>[name.toLowerCase(),name]));

function normalizeCountyName(value){
  const text=String(value??"").trim().replace(/\s+county$/i,"").replace(/\s+/g," ").toLowerCase();
  return COUNTY_CANONICAL.get(text)??null;
}

function assessRegisteredCountyPolicy(evidence,allowedCounties,checkedAt=new Date().toISOString()){
  const allowed=new Set(Array.isArray(allowedCounties)?allowedCounties:[]);
  const entity=evidence?.entity??null;
  let decision="human_review";
  let reasonCode="PA_REGISTRY_EVIDENCE_INCOMPLETE";
  let registeredCounty=null;

  if(evidence?.available!==true){
    reasonCode="PA_REGISTRY_UNAVAILABLE";
  }else if(!entity){
    decision="company_not_found";
    reasonCode="PA_ENTITY_NOT_FOUND";
  }else if(evidence.ambiguous===true||evidence.strongMatch!==true){
    reasonCode="PA_REGISTRY_MATCH_UNCERTAIN";
  }else{
    registeredCounty=normalizeCountyName(entity.county);
    if(!registeredCounty){
      reasonCode="REGISTERED_COUNTY_UNAVAILABLE";
    }else if(allowed.has(registeredCounty)){
      decision="policy_match";
      reasonCode="REGISTERED_COUNTY_ALLOWED";
    }else{
      decision="policy_mismatch";
      reasonCode="REGISTERED_COUNTY_NOT_ALLOWED";
    }
  }

  return {
    decision,
    reasonCode,
    allowedCounties:[...allowed],
    registeredCounty,
    sourceCounty:entity?.county??null,
    matchedEntity:entity,
    checkedAt
  };
}

module.exports={PA_COUNTIES,normalizeCountyName,assessRegisteredCountyPolicy};
