"use strict";
const {trackRequiredEvidence,safeSourceErrorCode,requireAdapter,sourceUnavailable}=require("../../packages/sources/contracts");
const {guardDomainEvidence}=require("../../packages/sources/domain-evidence-contract");
const {assessDomainAge}=require("./decision");

function parseAge(value){
  if(value===undefined||value===null||value==="")return 90;
  const raw=String(value).trim();
  if(!/^\d+$/.test(raw)){const e=new Error("minAgeDays must be an integer");e.code="INVALID_INPUT";throw e;}
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n<1||n>3650){const e=new Error("minAgeDays must be between 1 and 3650");e.code="INVALID_INPUT";throw e;}
  return n;
}

function validateDomainAgeInput(input){
  const domain=String(input?.domain??"").trim().toLowerCase().replace(/\.$/,"");
  if(domain.length<3||domain.length>253||!/^[a-z0-9.-]+$/.test(domain)||!domain.includes(".")){
    const e=new Error("invalid domain");e.code="INVALID_INPUT";throw e;
  }
  const labels=domain.split(".");
  if(labels.some(x=>!x||x.length>63||x.startsWith("-")||x.endsWith("-"))){
    const e=new Error("invalid domain");e.code="INVALID_INPUT";throw e;
  }
  return {domain,minAgeDays:parseAge(input?.minAgeDays)};
}

function createDomainAgeService({rdap,now=()=>new Date().toISOString()}){
  requireAdapter("rdap",rdap,"lookup");
  return {async check(input){
    const normalized=validateDomainAgeInput(input);
    const sourceFailures=[];
    let evidence;
    try{evidence=trackRequiredEvidence("rdap",await rdap.lookup({domain:normalized.domain}),sourceFailures);}
    catch(error){
      const detail=safeSourceErrorCode(error);
      sourceFailures.push({source:"rdap",detail});
      evidence=sourceUnavailable("rdap",detail);
    }
    const observedAt=now();
    evidence=guardDomainEvidence({evidence,profile:"registration",domain:normalized.domain,now:observedAt,sourceFailures});
    const result=assessDomainAge(evidence,{minAgeDays:normalized.minAgeDays,now:observedAt});
    return {...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence};
  }};
}
module.exports={parseAge,validateDomainAgeInput,createDomainAgeService};
