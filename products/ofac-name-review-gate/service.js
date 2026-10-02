"use strict";
const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessOfacNameReview}=require("./decision");
function validateOfacInput(input){
 const name=String(input?.name??"").trim().replace(/\s+/g," ");
 if(name.length<2||name.length>160){const e=new Error("name length must be 2-160");e.code="INVALID_INPUT";throw e;}
 const raw=input?.minScore===undefined||input?.minScore===null||input?.minScore===""?"90":String(input.minScore).trim();
 if(!/^\d+$/.test(raw)){const e=new Error("minScore must be an integer");e.code="INVALID_INPUT";throw e;}
 const minScore=Number(raw);if(!Number.isInteger(minScore)||minScore<70||minScore>100){const e=new Error("minScore must be between 70 and 100");e.code="INVALID_INPUT";throw e;}
 return{name,minScore};
}
function createOfacReviewService({ofac,now=()=>new Date().toISOString()}){
 requireAdapter("ofac",ofac,"lookup");
 return{async check(input){
  const normalized=validateOfacInput(input);const sourceFailures=[];let evidence;
  try{evidence=normalizedEvidence("ofac_sdn",await ofac.lookup({name:normalized.name,minScore:normalized.minScore,limit:3}));}
  catch(error){const detail=error?.code||error?.message||"lookup failed";sourceFailures.push({source:"ofac_sdn",detail});evidence=sourceUnavailable("ofac_sdn",detail);}
  const result=assessOfacNameReview(evidence,{minScore:normalized.minScore,checkedAt:now()});
  return{...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence,limitations:["Candidate-name screening only; a match is not a legal determination.","A no-candidate result is not sanctions clearance.","OFAC 50 Percent Rule ownership analysis is not included."]};
 }};
}
module.exports={validateOfacInput,createOfacReviewService};
