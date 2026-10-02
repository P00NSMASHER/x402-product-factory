"use strict";
function assessOfacNameReview(evidence,{minScore=90,checkedAt=new Date().toISOString()}={}){
 if(!Number.isInteger(minScore)||minScore<70||minScore>100)throw new Error("invalid_min_score");
 if(evidence?.available!==true)return{decision:"human_review",reasonCodes:["OFAC_EVIDENCE_UNAVAILABLE"],candidateCount:0,candidates:[],minScore,checkedAt};
 const candidates=Array.isArray(evidence.candidates)?evidence.candidates:[];
 const total=Number.isInteger(evidence.totalCandidatesAboveThreshold)?evidence.totalCandidatesAboveThreshold:candidates.length;
 const found=total>0;
 return{decision:found?"candidate_found":"no_candidate",reasonCodes:[found?"OFAC_REVIEW_CANDIDATE_FOUND":"NO_OFAC_NAME_CANDIDATE_AT_THRESHOLD"],candidateCount:total,candidates,minScore,checkedAt};
}
module.exports={assessOfacNameReview};
