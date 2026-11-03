"use strict";

function dateOnlyMs(value){
  if(typeof value!=="string")return null;
  // RDAP eventDate is an RFC 3339 instant. Comparing its first ten
  // characters incorrectly assigns offset timestamps to the local day.
  const timestamp=/^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.exec(value);
  const date=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:timestamp?.[1];
  if(!date)return null;
  const midnight=Date.parse(date+"T00:00:00Z");
  if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)return null;
  if(!timestamp)return midnight;
  if(Number(timestamp[2])>23||Number(timestamp[3])>59||Number(timestamp[4])>59)return null;
  const zone=timestamp[5];
  if(zone!=="Z"&&zone!=="z"&&(Number(zone.slice(1,3))>23||Number(zone.slice(4,6))>59))return null;
  // Canonicalize permitted lower-case delimiters for consistent runtimes.
  const instant=Date.parse(value.replace("t","T").replace(/z$/,"Z"));
  if(!Number.isFinite(instant))return null;
  return Date.parse(new Date(instant).toISOString().slice(0,10)+"T00:00:00Z");
}

function utcDayStartMs(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}

function assessDomainAge(evidence,{minAgeDays=90,now=new Date().toISOString()}={}){
  if(!Number.isInteger(minAgeDays)||minAgeDays<1||minAgeDays>3650)throw new Error("invalid_min_age_days");
  const today=utcDayStartMs(now);
  if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const cutoffMs=today-minAgeDays*86400000;
  const cutoffDate=new Date(cutoffMs).toISOString().slice(0,10);

  if(evidence?.available!==true){
    return {decision:"human_review",reasonCodes:["RDAP_EVIDENCE_UNAVAILABLE"],registrationDate:null,ageDays:null,minAgeDays,cutoffDate,checkedAt};
  }
  if(evidence.registered===false){
    return {decision:"unregistered",reasonCodes:["DOMAIN_UNREGISTERED"],registrationDate:null,ageDays:null,minAgeDays,cutoffDate,checkedAt};
  }
  if(evidence.registered!==true){
    return {decision:"human_review",reasonCodes:["DOMAIN_REGISTRATION_STATUS_UNKNOWN"],registrationDate:null,ageDays:null,minAgeDays,cutoffDate,checkedAt};
  }

  const registrationDate=evidence?.events?.registration??evidence?.events?.registered??null;
  const registrationMs=dateOnlyMs(registrationDate);
  if(registrationMs==null){
    return {decision:"human_review",reasonCodes:["REGISTRATION_DATE_UNAVAILABLE"],registrationDate:null,ageDays:null,minAgeDays,cutoffDate,checkedAt};
  }

  // A future registration cannot establish historical domain age.
  if(registrationMs>today){
    return {decision:"human_review",reasonCodes:["REGISTRATION_DATE_IN_FUTURE"],registrationDate:null,ageDays:null,minAgeDays,cutoffDate,checkedAt};
  }

  const ageDays=Math.floor((today-registrationMs)/86400000);
  const established=registrationMs<=cutoffMs;
  return {
    decision:established?"established":"recent_registration",
    reasonCodes:[established?"DOMAIN_AGE_AT_OR_ABOVE_THRESHOLD":"DOMAIN_REGISTERED_WITHIN_THRESHOLD"],
    registrationDate:new Date(registrationMs).toISOString().slice(0,10),
    ageDays,
    minAgeDays,
    cutoffDate,
    checkedAt
  };
}

module.exports={dateOnlyMs,utcDayStartMs,assessDomainAge};
