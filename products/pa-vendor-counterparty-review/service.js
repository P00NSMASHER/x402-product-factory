"use strict";

const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {domainNameAligned}=require("../pa-vendor-identity-match/service");
const {assessCounterpartyReview}=require("./decision");
const {registryContradictions,contradictoryEvidence}=require("./evidence-contract");

function normalizeDomain(raw){
  let domain=String(raw??"").trim().toLowerCase();
  if(domain.endsWith("."))domain=domain.slice(0,-1);
  if(domain.length<3||domain.length>253||!/^[a-z0-9.-]+$/.test(domain)||!domain.includes(".")){
    const e=new Error("invalid domain");e.code="INVALID_INPUT";throw e;
  }
  const labels=domain.split(".");
  if(labels.some(x=>!x||x.length>63||x.startsWith("-")||x.endsWith("-"))){
    const e=new Error("invalid domain");e.code="INVALID_INPUT";throw e;
  }
  return domain;
}

function parseInteger(value,{name,min,max,defaultValue}){
  if(value===undefined||value===null||value==="")return defaultValue;
  const raw=String(value).trim();
  if(!/^\d+$/.test(raw)){const e=new Error(name+" must be an integer");e.code="INVALID_INPUT";throw e;}
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n<min||n>max){
    const e=new Error(name+" must be between "+min+" and "+max);e.code="INVALID_INPUT";throw e;
  }
  return n;
}

function validateCounterpartyInput(input){
  const company=String(input?.company??"").trim().replace(/\s+/g," ");
  if(company.length<2||company.length>120){
    const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;
  }
  return {
    company,
    domain:normalizeDomain(input?.domain),
    minScore:parseInteger(input?.minScore,{name:"minScore",min:70,max:100,defaultValue:90}),
    minDomainAgeDays:parseInteger(input?.minDomainAgeDays,{name:"minDomainAgeDays",min:1,max:3650,defaultValue:90})
  };
}

function createCounterpartyReviewService({registry,ofac,rdap,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  requireAdapter("ofac",ofac,"lookup");
  requireAdapter("rdap",rdap,"lookup");

  return {async check(input){
    const normalized=validateCounterpartyInput(input);
    const sourceFailures=[];
    function registerFailure(source,detail){
      // One report per failed source, no duplicate "unavailable" and
      // "inconsistent" entries for the same lookup.
      if(!sourceFailures.some(item=>item.source===source)){
        sourceFailures.push({source,detail});
      }
    }
    let registryEvidence;

    try{
      registryEvidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      registryEvidence=sourceUnavailable("pa_registry",detail);
    }

    // Validate BEFORE screening the legal name. A malformed strong-match
    // claim cannot trigger downstream OFAC or RDAP work.
    const registryIssues=registryContradictions(registryEvidence);
    if(registryEvidence?.available!==true){
      registerFailure("pa_registry","SOURCE_UNAVAILABLE");
    }else if(registryIssues.length){
      registerFailure("pa_registry","SOURCE_CONTRACT_INVALID");
    }
    const legalNameCandidate=
      registryEvidence?.available===true&&
      registryEvidence?.strongMatch===true&&
      registryEvidence?.ambiguous!==true&&
      typeof registryEvidence?.entity?.businessName==="string"
        ?registryEvidence.entity.businessName.trim()
        :"";
    if(registryEvidence?.strongMatch===true&&!legalNameCandidate){
      registerFailure("pa_registry","LEGAL_NAME_MISSING");
    }
    let ofacEvidence=null;
    let rdapEvidence=null;
    const legalName=sourceFailures.some(item=>item.source==="pa_registry")
      ?""
      :legalNameCandidate;

    if(legalName){
      const [ofacResult,rdapResult]=await Promise.allSettled([
        ofac.lookup({name:legalName,minScore:normalized.minScore,limit:3}),
        rdap.lookup({domain:normalized.domain})
      ]);

      if(ofacResult.status==="fulfilled"){
        ofacEvidence=normalizedEvidence("ofac_sdn",ofacResult.value);
      }else{
        const error=ofacResult.reason;
        const detail=error?.code||error?.message||"lookup failed";
        sourceFailures.push({source:"ofac_sdn",detail});
        ofacEvidence=sourceUnavailable("ofac_sdn",detail);
      }

      if(rdapResult.status==="fulfilled"){
        rdapEvidence=normalizedEvidence("rdap",rdapResult.value);
        rdapEvidence={
          ...rdapEvidence,
          nameAligned:
            rdapEvidence.available===true&&rdapEvidence.registered===true
              ?domainNameAligned(normalized.domain,legalName)
              :false,
          alignedAgainstLegalName:legalName
        };
      }else{
        const error=rdapResult.reason;
        const detail=error?.code||error?.message||"lookup failed";
        sourceFailures.push({source:"rdap",detail});
        rdapEvidence=sourceUnavailable("rdap",detail);
      }
    }

    // The source adapter may complete a transport request but return
    // unavailable or malformed evidence. That is a non-chargeable failure,
    // not a paid "human_review" of successful required source evidence.
    if(legalName){
      if(ofacEvidence?.available!==true)registerFailure("ofac_sdn","SOURCE_UNAVAILABLE");
      if(rdapEvidence?.available!==true)registerFailure("rdap","SOURCE_UNAVAILABLE");
    }
    const checkedAt=now();
    const evidence={registry:registryEvidence,ofac:ofacEvidence,rdap:rdapEvidence};
    const contractIssues=contradictoryEvidence(evidence,{
      now:checkedAt,minScore:normalized.minScore
    });
    if(rdapEvidence?.available===true){
      if(rdapEvidence.registered!==true&&rdapEvidence.registered!==false){
        contractIssues.push({check:"domain",code:"DOMAIN_REGISTRATION_STATUS_UNKNOWN"});
      }else if(rdapEvidence.registered===true&&
          (rdapEvidence.events?.registration??rdapEvidence.events?.registered??null)===null){
        contractIssues.push({check:"domain",code:"DOMAIN_REGISTRATION_DATE_UNAVAILABLE"});
      }
    }
    const labels={registry:"pa_registry",ofac:"ofac_sdn",domain:"rdap"};
    for(const issue of contractIssues){
      registerFailure(labels[issue.check],"SOURCE_CONTRACT_INVALID");
    }
    const assessed=assessCounterpartyReview(evidence,{
      minScore:normalized.minScore,minDomainAgeDays:normalized.minDomainAgeDays,
      now:checkedAt
    });
    const reasonCodes=[...new Set([
      ...assessed.reasonCodes,...contractIssues.map(item=>item.code)
    ])];
    const checks={...assessed.checks};
    for(const issue of contractIssues){
      checks[issue.check]={status:"review",reason:issue.code};
    }
    const result={
      ...assessed,
      decision:contractIssues.length?"human_review":assessed.decision,
      reasonCodes,checks
    };

    return {
      ...result,
      input:normalized,
      resolvedLegalName:legalName||null,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence,
      limitations:[
        "Proceed is only a workflow signal that configured review triggers were not hit.",
        "OFAC evidence is candidate-name screening only; a no-candidate result is not sanctions clearance.",
        "OFAC 50 Percent Rule ownership analysis is not included.",
        "Domain-name alignment is a deterministic heuristic and does not prove domain ownership or control.",
        "Recent domain registration is a review signal, not proof of fraud.",
        "A Pennsylvania registry match does not prove good standing, ownership, authority to contract, creditworthiness, or legal compliance."
      ]
    };
  }};
}

module.exports={normalizeDomain,parseInteger,validateCounterpartyInput,createCounterpartyReviewService};
