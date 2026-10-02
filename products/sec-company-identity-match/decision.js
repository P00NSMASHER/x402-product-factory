"use strict";

function canonicalCompanyName(value){
  let text=String(value||"")
    .toUpperCase()
    .replace(/&/g," AND ")
    .replace(/[^A-Z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
  const suffix=/\s+(?:INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LIMITED|LTD|PLC|L\s*L\s*C|LLC)$/;
  let previous="";
  while(text!==previous){
    previous=text;
    text=text.replace(suffix,"").trim();
  }
  return text;
}

function assessSecCompanyIdentity(evidence,{expectedCompany,checkedAt=new Date().toISOString()}){
  if(evidence?.available!==true){
    return {
      decision:"human_review",
      reasonCodes:["SEC_EVIDENCE_UNAVAILABLE"],
      company:null,
      canonicalExpected:canonicalCompanyName(expectedCompany),
      canonicalSec:null,
      checkedAt
    };
  }

  if(evidence.found!==true||!evidence.company){
    return {
      decision:"company_not_found",
      reasonCodes:["SEC_COMPANY_NOT_FOUND"],
      company:null,
      canonicalExpected:canonicalCompanyName(expectedCompany),
      canonicalSec:null,
      checkedAt
    };
  }

  const canonicalExpected=canonicalCompanyName(expectedCompany);
  const canonicalSec=canonicalCompanyName(evidence.company.name);
  const match=Boolean(canonicalExpected)&&canonicalExpected===canonicalSec;

  return {
    decision:match?"match":"human_review",
    reasonCodes:match?[]:["SEC_COMPANY_NAME_MISMATCH"],
    company:evidence.company,
    canonicalExpected,
    canonicalSec,
    checkedAt
  };
}

module.exports={canonicalCompanyName,assessSecCompanyIdentity};
