"use strict";
const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="checkPennsylvaniaEntityTypePolicy";
function catalogResource(base){
  base=base.replace(/\/$/,"");const d=productPaymentDocument(base);
  return{resource:base+RESOURCE_PATH,method:"GET",description:d.resource.description,price:PRICE,tags:d.resource.tags,accepts:[requirements(AMOUNT_ATOMIC)],extensions:d.extensions};
}
function openApiPath(){
  return{get:{
    operationId:OPERATION_ID,
    summary:"Check a Pennsylvania entity type against caller policy",
    description:"Resolve a Pennsylvania business name to one strong registry entity, normalize its Department of State registration type to llc, corporation, limited_partnership, llp, professional_corporation, or other, and compare it with caller-supplied allowedKinds. Returns policy_match, policy_mismatch, company_not_found, or human_review. The result only evaluates the supplied policy and is not legal advice or proof of good standing, ownership, authority, tax treatment, liability protection, fraud risk, sanctions status, creditworthiness, or regulatory compliance.",
    tags:["Pennsylvania Business Registry","Entity Type","Procurement Policy"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"allowedKinds",in:"query",required:true,schema:{type:"string"},example:"llc,corporation"}
    ],
    "x-payment-info":{price:{mode:"fixed",currency:"USD",amount:"0.002000"},protocols:[{x402:{}}],network:"eip155:8453",payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"},
    responses:{200:{description:"Completed paid entity-type policy result."},400:{description:"Invalid input; payment is not settled."},402:{description:"Payment required."},502:{description:"Pennsylvania registry unavailable; payment is not settled."},503:{description:"Payment unresolved; retry same authorization."}}
  }};
}
function llmsText(base){
  return["# PA Entity Type Policy x402","","Endpoint: GET "+base.replace(/\/$/,"")+RESOURCE_PATH+"?company=OpenAI%20OpCo&allowedKinds=llc%2Ccorporation","Price: $0.002 USDC on Base via x402.","Source: Pennsylvania Department of State via data.pa.gov.","Kinds: llc, corporation, limited_partnership, llp, professional_corporation, other.","Decisions: policy_match, policy_mismatch, company_not_found, human_review.","This is a caller-defined policy check only; it is not legal advice or proof of good standing, ownership, authority, tax treatment, liability protection, fraud risk, sanctions status, creditworthiness, or regulatory compliance.","On HTTP 503 retry the same PAYMENT-SIGNATURE."].join("\n");
}
module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
