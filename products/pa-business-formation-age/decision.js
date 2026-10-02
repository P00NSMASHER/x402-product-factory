"use strict";

const DAY_MS=86400000;

function validDate(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(value+"T00:00:00Z");
  return Number.isFinite(time)?time:null;
}

function assessFormationAge(evidence,{minAgeDays=365,now=new Date().toISOString()}={}){
  const reasonCodes=[];
  const entity=evidence?.entity??null;

  if(evidence?.available!==true){
    return {
      decision:"human_review",
      reasonCodes:["PA_REGISTRY_UNAVAILABLE"],
      matchedEntity:entity,
      creationDate:null,
      ageDays:null,
      minAgeDays,
      cutoffDate:null,
      checkedAt:now
    };
  }

  if(entity==null){
    return {
      decision:"company_not_found",
      reasonCodes:["PA_ENTITY_NOT_FOUND"],
      matchedEntity:null,
      creationDate:null,
      ageDays:null,
      minAgeDays,
      cutoffDate:null,
      checkedAt:now
    };
  }

  if(evidence.strongMatch!==true){
    return {
      decision:"human_review",
      reasonCodes:["PA_REGISTRY_MATCH_UNCERTAIN"],
      matchedEntity:entity,
      creationDate:entity.creationDate??null,
      ageDays:null,
      minAgeDays,
      cutoffDate:null,
      checkedAt:now
    };
  }

  const created=validDate(entity.creationDate);
  const nowTime=Date.parse(now);
  if(created==null||!Number.isFinite(nowTime)||created>nowTime){
    return {
      decision:"human_review",
      reasonCodes:["FORMATION_DATE_UNAVAILABLE"],
      matchedEntity:entity,
      creationDate:entity.creationDate??null,
      ageDays:null,
      minAgeDays,
      cutoffDate:null,
      checkedAt:now
    };
  }

  const ageDays=Math.floor((nowTime-created)/DAY_MS);
  const cutoffTime=nowTime-minAgeDays*DAY_MS;
  const cutoffDate=new Date(cutoffTime).toISOString().slice(0,10);
  const established=created<=cutoffTime;

  return {
    decision:established?"established_entity":"recent_entity",
    reasonCodes:[established?"FORMATION_AGE_AT_OR_ABOVE_THRESHOLD":"FORMATION_AGE_BELOW_THRESHOLD"],
    matchedEntity:entity,
    creationDate:entity.creationDate,
    ageDays,
    minAgeDays,
    cutoffDate,
    checkedAt:now
  };
}

module.exports={DAY_MS,validDate,assessFormationAge};
