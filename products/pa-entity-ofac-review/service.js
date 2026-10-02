"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {assessPaEntityOfacReview}=require("./decision");

function validatePaEntityOfacInput(input){
  const company=String(input?.company??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){
    const e=new Error("company length must be 2-120");
    e.code="INVALID_INPUT";
    throw e;
  }
  const raw=input?.minScore===undefined||input?.minScore===null||input?.minScore===""
    ?"90":String(input.minScore).trim();
  if(!/^\d+$/.test(raw)){
    const e=new Error("minScore must be an integer");
    e.code="INVALID_INPUT";
    throw e;
  }
  const minScore=Number(raw);
  if(!Number.isInteger(minScore)||minScore<70||minScore>100){
    const e=new Error("minScore must be between 70 and 100");
    e.code="INVALID_INPUT";
    throw e;
  }
  return {company,minScore};
}

function createPaEntityOfacReviewService({registry,ofac,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  requireAdapter("ofac",ofac,"lookup");

  return {async check(input){
    const normalized=validatePaEntityOfacInput(input);
    const sourceFailures=[];
    let registryEvidence;

    try{
      registryEvidence=normalizedEvidence(
        "pa_registry",
        await registry.lookup({company:normalized.company})
      );
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      registryEvidence=sourceUnavailable("pa_registry",detail);
    }

    let ofacEvidence=null;
    const legalName=
      registryEvidence?.available===true&&
      registryEvidence?.strongMatch===true&&
      registryEvidence?.ambiguous!==true&&
      typeof registryEvidence?.entity?.businessName==="string"
        ?registryEvidence.entity.businessName.trim()
        :"";

    if(legalName){
      try{
        ofacEvidence=normalizedEvidence(
          "ofac_sdn",
          await ofac.lookup({
            name:legalName,
            minScore:normalized.minScore,
            limit:3
          })
        );
      }catch(error){
        const detail=error?.code||error?.message||"lookup failed";
        sourceFailures.push({source:"ofac_sdn",detail});
        ofacEvidence=sourceUnavailable("ofac_sdn",detail);
      }
    }

    const result=assessPaEntityOfacReview(
      {registry:registryEvidence,ofac:ofacEvidence},
      {minScore:normalized.minScore,checkedAt:now()}
    );

    return {
      ...result,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence:{
        registry:registryEvidence,
        ofac:ofacEvidence
      },
      limitations:[
        "Candidate-name screening only; a match is not a legal determination.",
        "A no-candidate result is not sanctions clearance.",
        "OFAC 50 Percent Rule ownership analysis is not included.",
        "A Pennsylvania registry match does not prove good standing, ownership, or authority to contract."
      ]
    };
  }};
}

module.exports={validatePaEntityOfacInput,createPaEntityOfacReviewService};
