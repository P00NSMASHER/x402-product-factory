"use strict";

function parseDate(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const ms=Date.parse(value+"T00:00:00Z");
  return Number.isFinite(ms)?ms:null;
}

function utcDayStartMs(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
}

function assessFilingFreshness(evidence,{maxAgeDays=30,now=new Date().toISOString()}={}){
  const checkedAt=new Date(now);
  const checkedDayMs=utcDayStartMs(now);
  if(Number.isNaN(checkedAt.getTime())||checkedDayMs==null)throw new Error("invalid_now");
  if(!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>365)throw new Error("invalid_max_age_days");

  const cutoffMs=checkedDayMs-maxAgeDays*86400000;
  const cutoffDate=new Date(cutoffMs).toISOString().slice(0,10);

  if(evidence?.available!==true){
    return {
      decision:"company_not_found",
      reasonCodes:["SEC_EVIDENCE_UNAVAILABLE"],
      company:null,
      latestMatchingFiling:null,
      matchingFilingCount:0,
      recentFilingCount:0,
      maxAgeDays,
      cutoffDate,
      checkedAt:checkedAt.toISOString()
    };
  }

  if(evidence.found!==true){
    return {
      decision:"company_not_found",
      reasonCodes:["SEC_COMPANY_NOT_FOUND"],
      company:null,
      latestMatchingFiling:null,
      matchingFilingCount:0,
      recentFilingCount:0,
      maxAgeDays,
      cutoffDate,
      checkedAt:checkedAt.toISOString()
    };
  }

  const filings=Array.isArray(evidence.filings)?evidence.filings:[];
  const dated=filings
    .map(f=>({filing:f,ms:parseDate(f?.filingDate)}))
    .filter(x=>x.ms!=null)
    .sort((a,b)=>b.ms-a.ms);

  const recent=dated.filter(x=>x.ms>=cutoffMs);
  const latest=dated[0]?.filing??null;

  return {
    decision:recent.length>0?"recent_filing":"no_recent_filing",
    reasonCodes:recent.length>0?["RECENT_SEC_FILING_FOUND"]:["NO_SEC_FILING_IN_WINDOW"],
    company:evidence.company??null,
    latestMatchingFiling:latest,
    matchingFilingCount:filings.length,
    recentFilingCount:recent.length,
    maxAgeDays,
    cutoffDate,
    checkedAt:checkedAt.toISOString()
  };
}

module.exports={parseDate,utcDayStartMs,assessFilingFreshness};
