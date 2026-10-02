"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="reviewPennsylvaniaVendorMaturity";

function trimSlash(value){
  return value.endsWith("/")?value.slice(0,-1):value;
}

function catalogResource(base){
  const normalized=trimSlash(base);
  const d=productPaymentDocument(normalized);
  return {
    resource:normalized+RESOURCE_PATH,
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
    summary:"Review Pennsylvania vendor entity and domain maturity",
    description:"Resolve a supplied Pennsylvania company name to one unique strong Department of State legal entity, compare its formation age against minEntityAgeDays, verify the supplied domain through authoritative RDAP, require legal-name/domain alignment, and compare domain registration age against minDomainAgeDays. Returns established_vendor or human_review. Established history is a bounded maturity signal only and is not proof of legitimacy, safety, fraud risk, creditworthiness, ownership, authority, good standing, or legal compliance.",
    tags:["Vendor Maturity","Pennsylvania Business Registry","Formation Age","Domain Age","RDAP","Human Review"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"domain",in:"query",required:true,schema:{type:"string",minLength:3,maxLength:253},example:"openai.com"},
      {name:"minEntityAgeDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:36500,default:30},example:30},
      {name:"minDomainAgeDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:3650,default:90},example:90}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.007000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid vendor maturity review."},
      400:{description:"Invalid input; payment not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"PA registry or authoritative RDAP unavailable; payment not settled."},
      503:{description:"Payment unresolved; retry same authorization."}
    }
  }};
}

function llmsText(base){
  const normalized=trimSlash(base);
  return [
    "# PA Vendor Maturity Review x402",
    "",
    "Endpoint: GET "+normalized+RESOURCE_PATH+"?company=OpenAI%20OpCo&domain=openai.com&minEntityAgeDays=30&minDomainAgeDays=90",
    "Price: $0.007 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; IANA RDAP bootstrap plus authoritative registry RDAP.",
    "The service resolves the Pennsylvania legal entity, evaluates formation age, aligns the domain against the resolved legal name, and evaluates authoritative domain registration age.",
    "Decision: established_vendor or human_review.",
    "Established vendor is a maturity/history workflow signal only; older entity/domain history is not proof of legitimacy, safety, fraud risk, creditworthiness, ownership, authority, or legal compliance.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
