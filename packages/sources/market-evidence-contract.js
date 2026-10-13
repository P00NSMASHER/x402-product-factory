"use strict";

// Field-level contract for the EXISTING SEC and Treasury source adapter outputs.
// This validates data used for a paid decision; it does not fetch sources,
// change decision policies, declare regulatory clearance or authorize billing.
const {sourceUnavailable}=require("./contracts");

function invalid(){
  const error=new Error("source_contract_incomplete");
  error.code="SOURCE_CONTRACT_INVALID";
  throw error;
}
function requireValid(condition){
  if(!condition)invalid();
}
function canonicalDay(raw){
  if(typeof raw!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
  const stamp=Date.parse(raw+"T00:00:00Z");
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===raw
    ?stamp:null;
}
function validDay(raw,now){
  const day=canonicalDay(raw),current=canonicalDay(String(now).slice(0,10));
  return day!==null&&current!==null&&day<=current;
}
function string(value,min=1,max=240){
  return typeof value==="string"&&value.trim().length>=min&&value.length<=max;
}
function finiteRate(value){
  return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100;
}
function sameTerm(a,b){
  return typeof a==="string"&&typeof b==="string"&&
    a.trim().replace(/\s+/g," ").toLowerCase()===
    b.trim().replace(/\s+/g," ").toLowerCase();
}
function includesTerm(candidate,query){
  return string(candidate,2,200)&&string(query,2,100)&&
    candidate.toLowerCase().includes(query.toLowerCase());
}
function validateSecEvidence(evidence,{cik="",form="",limit=25,now,requireFilings=false}={}){
  requireValid(evidence?.available===true&&typeof evidence.found==="boolean"&&
    Array.isArray(evidence.filings)&&
    Number.isInteger(limit)&&limit>=1&&limit<=25&&evidence.filings.length<=limit);
  if(evidence.found===false){
    requireValid(evidence.company===null&&evidence.filings.length===0);
    return;
  }
  requireValid(evidence.company&&
    string(evidence.company.name,2,240)&&
    typeof evidence.company.cik==="string"&&/^\d{10}$/.test(evidence.company.cik)&&
    Array.isArray(evidence.company.tickers)&&
    Array.isArray(evidence.company.exchanges));
  if(cik){
    requireValid(/^\d{1,10}$/.test(String(cik))&&
      evidence.company.cik===String(cik).padStart(10,"0"));
  }
  for(const filing of evidence.filings){
    requireValid(filing&&string(filing.form,1,25)&&
      validDay(filing.filingDate,now));
    if(form)requireValid(sameTerm(filing.form,form));
    // The SEC adapter's required arrays must be aligned; the selected row
    // must retain the accession/primary document values as strings.
    requireValid(typeof filing.accessionNumber==="string"&&
      typeof filing.primaryDocument==="string");
  }
  if(requireFilings&&evidence.filings.length===0){
    // This may be a normal real submission with no recent matching filings.
    // Do NOT upgrade that completed negative to a source error.
  }
}
function rowShape(row,{now,recordDate=null,query=""}={}){
  requireValid(row&&
    validDay(row.recordDate,now)&&
    (recordDate===null||row.recordDate===recordDate)&&
    string(row.securityDescription,2,200)&&
    (!query||includesTerm(row.securityDescription,query))&&
    finiteRate(row.averageInterestRatePercent));
}
function validateTreasuryLookup(evidence,{security,now}){
  requireValid(evidence?.available===true&&validDay(evidence.recordDate,now)&&
    sameTerm(evidence.query,security)&&
    typeof evidence.found==="boolean"&&
    typeof evidence.ambiguous==="boolean"&&
    Number.isSafeInteger(evidence.matchCount)&&evidence.matchCount>=0&&
    evidence.matchCount<=300&&
    Array.isArray(evidence.matches)&&
    evidence.matches.length===evidence.matchCount&&
    evidence.found===(evidence.matchCount>0)&&
    evidence.ambiguous===(evidence.matchCount>1));
  if(evidence.matchCount===1){
    requireValid(evidence.selected&&typeof evidence.selected==="object"&&
      !Array.isArray(evidence.selected));
    rowShape(evidence.selected,{now,recordDate:evidence.recordDate,query:security});
    requireValid(evidence.matches[0]&&
      evidence.matches[0].recordDate===evidence.selected.recordDate&&
      evidence.matches[0].securityDescription===evidence.selected.securityDescription&&
      evidence.matches[0].averageInterestRatePercent===
        evidence.selected.averageInterestRatePercent);
  }else{
    requireValid(evidence.selected===null);
  }
}
function descriptionList(items,{security="",max=300}={}){
  requireValid(Array.isArray(items)&&items.length<=max&&
    items.every(item=>string(item,2,200)&&(!security||includesTerm(item,security))));
}
function validateTreasuryHistory(evidence,{security,now}){
  requireValid(evidence?.available===true&&sameTerm(evidence.query,security)&&
    typeof evidence.found==="boolean"&&
    typeof evidence.ambiguous==="boolean"&&
    Array.isArray(evidence.points)&&evidence.points.length<=2);
  descriptionList(evidence.matchDescriptions,{security});
  if(!evidence.found||evidence.ambiguous){
    requireValid(evidence.points.length===0);
    return; // Real not-found and ambiguous categories are completed reviews.
  }
  requireValid(evidence.matchDescriptions.length===1&&
    evidence.points.length>=1);
  let previous=null;
  for(const point of evidence.points){
    rowShape(point,{now,query:security});
    requireValid(sameTerm(point.securityDescription,evidence.matchDescriptions[0]));
    if(previous!==null)requireValid(point.recordDate<previous);
    previous=point.recordDate;
  }
  // One valid monthly point is an authentic insufficient-history review.
}
function treasurySide(side,{security,recordDate,now}){
  requireValid(side&&sameTerm(side.query,security)&&
    typeof side.found==="boolean"&&typeof side.ambiguous==="boolean");
  descriptionList(side.matchDescriptions,{security});
  if(!side.found||side.ambiguous){
    requireValid(side.selected===null);
    return;
  }
  requireValid(side.matchDescriptions.length===1&&side.selected);
  rowShape(side.selected,{now,recordDate,query:security});
  requireValid(sameTerm(side.selected.securityDescription,side.matchDescriptions[0]));
}
function validateTreasurySpread(evidence,{leftSecurity,rightSecurity,now}){
  requireValid(evidence?.available===true&&validDay(evidence.recordDate,now));
  treasurySide(evidence.left,{security:leftSecurity,recordDate:evidence.recordDate,now});
  treasurySide(evidence.right,{security:rightSecurity,recordDate:evidence.recordDate,now});
}
const VALIDATORS=Object.freeze({
  sec:validateSecEvidence,
  treasuryLookup:validateTreasuryLookup,
  treasuryHistory:validateTreasuryHistory,
  treasurySpread:validateTreasurySpread
});
function guardMarketEvidence({
  kind,evidence,source,sourceFailures,expected
}={}){
  if(!Object.hasOwn(VALIDATORS,kind)||!Array.isArray(sourceFailures)||
     !string(source,2,80)||!expected||typeof expected!=="object"){
    throw new TypeError("invalid market source gate configuration");
  }
  if(evidence?.available!==true)return evidence;
  try{
    VALIDATORS[kind](evidence,expected);
    return evidence;
  }catch(error){
    // Only source-contract errors can turn a transport-success result into
    // non-chargeable evidence; never echo malformed upstream content.
    if(error?.code!=="SOURCE_CONTRACT_INVALID")throw error;
    if(!sourceFailures.some(item=>item.source===source)){
      sourceFailures.push({source,detail:"SOURCE_CONTRACT_INVALID"});
    }
    return sourceUnavailable(source,"SOURCE_CONTRACT_INVALID");
  }
}
module.exports={
  canonicalDay,validDay,finiteRate,validateSecEvidence,
  validateTreasuryLookup,validateTreasuryHistory,validateTreasurySpread,
  guardMarketEvidence
};
