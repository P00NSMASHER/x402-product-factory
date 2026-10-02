"use strict";
function dateOnlyMs(value){
  if(typeof value!=="string")return null;
  const date=value.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const ms=Date.parse(date+"T00:00:00Z");
  return Number.isFinite(ms)?ms:null;
}
function utcDayStartMs(value){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return null;
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function assessDomainLastChanged(evidence,{maxAgeDays=90,now=new Date().toISOString()}={}){
  if(!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>3650)throw new Error("invalid_max_age_days");
  const today=utcDayStartMs(now);if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const cutoff=today-maxAgeDays*86400000;
  const cutoffDate=new Date(cutoff).toISOString().slice(0,10);

  if(evidence?.available!==true)return{decision:"human_review",reasonCodes:["RDAP_EVIDENCE_UNAVAILABLE"],lastChangedDate:null,ageDays:null,maxAgeDays,cutoffDate,checkedAt};
  if(evidence.registered===false)return{decision:"unregistered",reasonCodes:["DOMAIN_UNREGISTERED"],lastChangedDate:null,ageDays:null,maxAgeDays,cutoffDate,checkedAt};
  if(evidence.registered!==true)return{decision:"human_review",reasonCodes:["DOMAIN_REGISTRATION_STATUS_UNKNOWN"],lastChangedDate:null,ageDays:null,maxAgeDays,cutoffDate,checkedAt};

  const raw=evidence?.events?.lastChanged??null;
  const changed=dateOnlyMs(raw);
  if(changed==null)return{decision:"human_review",reasonCodes:["LAST_CHANGED_DATE_UNAVAILABLE"],lastChangedDate:null,ageDays:null,maxAgeDays,cutoffDate,checkedAt};

  const ageDays=Math.floor((today-changed)/86400000);
  const recent=changed>=cutoff;
  return{
    decision:recent?"recently_changed":"stable_since_window",
    reasonCodes:[recent?"DOMAIN_CHANGED_WITHIN_WINDOW":"DOMAIN_LAST_CHANGED_BEFORE_WINDOW"],
    lastChangedDate:new Date(changed).toISOString().slice(0,10),
    ageDays,maxAgeDays,cutoffDate,checkedAt
  };
}
module.exports={dateOnlyMs,utcDayStartMs,assessDomainLastChanged};
