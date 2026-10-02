"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="reviewPennsylvaniaVendorDomainAge";

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
    summary:"Resolve a PA vendor and review a newly registered domain",
    description:"Resolve a supplied Pennsylvania company name to one unique strong Department of State legal-entity match, check whether the supplied domain plausibly aligns with that resolved legal name, and compare its authoritative RDAP registration age against a caller threshold. Returns established_domain_match, recent_domain_review, domain_mismatch, unregistered_domain, company_not_found, or human_review. Recent registration is a review signal, not proof of fraud, and domain-name alignment does not prove ownership or control.",
    tags:["Pennsylvania Business Registry","Vendor Identity","Domain Age","RDAP","Human Review"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"domain",in:"query",required:true,schema:{type:"string",minLength:3,maxLength:253},example:"openai.com"},
      {name:"minDomainAgeDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:3650,default:90},example:90}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.005000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid PA entity + domain-age review."},
      400:{description:"Invalid input; payment not settled."},
      402:{description:"Payment required."},
      502:{description:"PA registry or authoritative RDAP source unavailable; payment not settled."},
      503:{description:"Payment unresolved; retry same authorization."}
    }
  }};
}

function llmsText(base){
  return [
    "# PA Vendor New-Domain Review x402",
    "",
    "Endpoint: GET "+base.replace(/\/$/,"")+RESOURCE_PATH+"?company=OpenAI%20OpCo&domain=openai.com&minDomainAgeDays=90",
    "Price: $0.005 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; IANA RDAP bootstrap plus authoritative registry RDAP.",
    "The service resolves the Pennsylvania legal entity first and aligns the domain against the resolved legal name.",
    "Decisions: established_domain_match, recent_domain_review, domain_mismatch, unregistered_domain, company_not_found, human_review.",
    "Recent domain registration is a human-review signal, not proof of fraud.",
    "Domain-name alignment does not prove ownership or control.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
