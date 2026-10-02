"use strict";
function dateOnlyMs(value){
  if(typeof value!=="string")return null;
  const date=value.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const ms=Date.parse(date+"T00:00:00Z");
  return Number.isFinite(ms)?ms:null;
}
function utcDayStartMs(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function assessDomainExpiration(evidence,{horizonDays=60,now=new Date().toISOString()}={}){
  if(!Number.isInteger(horizonDays)||horizonDays<1||horizonDays>3650)throw new Error("invalid_horizon_days");
  const today=utcDayStartMs(now);
  if(today==null)throw new Error("invalid_now");
  const checkedAt=new Date(now).toISOString();
  const cutoff=today+horizonDays*86400000;
  const cutoffDate=new Date(cutoff).toISOString().slice(0,10);

  if(evidence?.available!==true)return{decision:"human_review",reasonCodes:["RDAP_EVIDENCE_UNAVAILABLE"],expirationDate:null,daysUntilExpiration:null,horizonDays,cutoffDate,checkedAt};
  if(evidence.registered===false)return{decision:"unregistered",reasonCodes:["DOMAIN_UNREGISTERED"],expirationDate:null,daysUntilExpiration:null,horizonDays,cutoffDate,checkedAt};
  if(evidence.registered!==true)return{decision:"human_review",reasonCodes:["DOMAIN_REGISTRATION_STATUS_UNKNOWN"],expirationDate:null,daysUntilExpiration:null,horizonDays,cutoffDate,checkedAt};

  const raw=evidence?.events?.expiration??evidence?.events?.expiry??null;
  const expiration=dateOnlyMs(raw);
  if(expiration==null)return{decision:"human_review",reasonCodes:["EXPIRATION_DATE_UNAVAILABLE"],expirationDate:null,daysUntilExpiration:null,horizonDays,cutoffDate,checkedAt};

  const daysUntilExpiration=Math.floor((expiration-today)/86400000);
  const soon=expiration<=cutoff;
  return{
    decision:soon?"expiring_soon":"not_expiring_soon",
    reasonCodes:[soon?"EXPIRATION_WITHIN_HORIZON":"EXPIRATION_BEYOND_HORIZON"],
    expirationDate:new Date(expiration).toISOString().slice(0,10),
    daysUntilExpiration,
    horizonDays,
    cutoffDate,
    checkedAt
  };
}
module.exports={dateOnlyMs,utcDayStartMs,assessDomainExpiration};
