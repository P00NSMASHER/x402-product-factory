"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="reviewPennsylvaniaEntityOfacName";

function catalogResource(base){
  base=base.replace(/\/$/,"");
  const d=productPaymentDocument(base);
  return {
    resource:base+RESOURCE_PATH,
    method:"GET",
    description:d.resource.description,
    price:PRICE,
    tags:d.resource.tags,
    accepts:[requirements(AMOUNT_ATOMIC)],
    extensions:d.extensions
  };
}

function openApiPath(){
  return {get:{
    operationId:OPERATION_ID,
    summary:"Resolve a PA legal entity and screen its legal name against OFAC",
    description:"Resolve a supplied Pennsylvania company name to one unique strong Department of State legal-entity match, then screen the resolved legal name against current OFAC SDN primary-name and alias data. Returns candidate_found, no_candidate, company_not_found, or human_review. This is first-pass candidate-name screening only: a candidate is not a legal sanctions determination, no_candidate is not sanctions clearance, and OFAC 50 Percent Rule ownership analysis is not included.",
    tags:["Pennsylvania Business Registry","OFAC","SDN","Vendor Identity","Human Review"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"minScore",in:"query",required:false,schema:{type:"integer",minimum:70,maximum:100,default:90},example:90}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.005000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid legal-entity resolution and OFAC candidate-name review."},
      400:{description:"Invalid input; payment not settled."},
      402:{description:"Payment required."},
      502:{description:"PA registry or OFAC source unavailable; payment not settled."},
      503:{description:"Payment unresolved; retry same authorization."}
    }
  }};
}

function llmsText(base){
  return [
    "# PA Entity OFAC Review Gate x402",
    "",
    "Endpoint: GET "+base.replace(/\/$/,"")+RESOURCE_PATH+"?company=OpenAI%20OpCo&minScore=90",
    "Price: $0.005 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; current U.S. Treasury OFAC SDN primary-name and alias files.",
    "The service resolves the Pennsylvania legal entity first, then screens the resolved legal name rather than the raw input alias.",
    "Decisions: candidate_found, no_candidate, company_not_found, human_review.",
    "Candidate-name screening only; candidate_found is not a legal sanctions determination and no_candidate is not sanctions clearance.",
    "OFAC 50 Percent Rule ownership analysis is not included.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
