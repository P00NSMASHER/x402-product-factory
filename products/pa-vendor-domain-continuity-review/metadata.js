"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="reviewPennsylvaniaVendorDomainContinuity";

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
    summary:"Review Pennsylvania vendor domain continuity",
    description:"Resolve a supplied Pennsylvania company name to one unique strong Department of State legal entity, verify the supplied domain through authoritative RDAP, require legal-name/domain alignment, require days until expiration at/above minExpirationDays, and require days since the authoritative lastChanged event at/above minStableDays. Returns stable_domain or human_review. This is a continuity/timing workflow signal only and does not prove ownership, renewal, uninterrupted service, security, fraud risk, compromise, malicious activity, good standing, authority, or legal compliance.",
    tags:["Vendor Domain Continuity","Pennsylvania Business Registry","RDAP","Expiration","Last Changed","Human Review"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"domain",in:"query",required:true,schema:{type:"string",minLength:3,maxLength:253},example:"openai.com"},
      {name:"minExpirationDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:3650,default:180},example:180},
      {name:"minStableDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:3650,default:30},example:30}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.006000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid vendor domain-continuity review."},
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
    "# PA Vendor Domain Continuity Review x402",
    "",
    "Endpoint: GET "+normalized+RESOURCE_PATH+"?company=OpenAI%20OpCo&domain=openai.com&minExpirationDays=180&minStableDays=30",
    "Price: $0.006 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; IANA RDAP bootstrap plus authoritative registry RDAP.",
    "The service resolves the Pennsylvania legal entity, aligns the domain against the resolved legal name, checks expiration runway, and checks time since the authoritative lastChanged event.",
    "Decision: stable_domain or human_review.",
    "Stable domain is a continuity/timing workflow signal only; it does not prove ownership, renewal, uninterrupted service, security, fraud risk, compromise, malicious activity, good standing, authority, or legal compliance.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
