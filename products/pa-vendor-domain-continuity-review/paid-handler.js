"use strict";

const {
  encodeHeader,decodePayment,requirements,paymentDocument,
  paymentRequiredResponse,verifyPayment,settleSamePayment
}=require("../../packages/x402/payment");
const {validateVendorDomainContinuityInput}=require("./service");

const AMOUNT_ATOMIC="6000";
const PRICE="$0.006";
const RESOURCE_PATH="/api/pa-vendor-domain-continuity-review";

function trimSlash(value){
  return value.endsWith("/")?value.slice(0,-1):value;
}

function header(event,name){
  const wanted=name.toLowerCase();
  for(const [key,value] of Object.entries(event?.headers||{})){
    if(key.toLowerCase()===wanted&&value!=null)return String(value);
  }
}

function json(statusCode,body,headers={}){
  return {
    statusCode,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*",
      "access-control-expose-headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",
      ...headers
    },
    body:JSON.stringify(body)
  };
}

function temporary(reason){
  return json(503,{error:reason,paymentState:"unresolved",retrySamePayment:true},{"Retry-After":"2"});
}

function productPaymentDocument(base){
  const normalized=trimSlash(base);
  return paymentDocument({
    resourceUrl:normalized+RESOURCE_PATH,
    amountAtomic:AMOUNT_ATOMIC,
    description:"Resolve a Pennsylvania vendor to a unique legal entity, verify legal-name/domain alignment through authoritative RDAP, require sufficient expiration runway, and require that the authoritative domain lastChanged event is old enough for automated continuation. Returns stable_domain or human_review. This is a continuity/timing workflow signal, not proof of ownership, safety, fraud risk, security, or legal compliance.",
    serviceName:"PA Vendor Domain Continuity Review",
    tags:["vendor-intake","domain-continuity","pennsylvania-business-registry","rdap","expiration","last-changed","human-review"],
    inputExample:{type:"http",method:"GET",queryParams:{
      company:"OpenAI OpCo",
      domain:"openai.com",
      minExpirationDays:"180",
      minStableDays:"30"
    }},
    outputExample:{type:"json",example:{
      decision:"stable_domain",
      daysUntilExpiration:840,
      daysSinceLastChanged:715,
      paid:true
    }}
  });
}

function createPaidVendorDomainContinuityHandler({service,publicApiBase,fetchImpl=fetch}){
  if(!service||typeof service.check!=="function")throw new TypeError("service.check() is required");
  const req=requirements(AMOUNT_ATOMIC);
  const doc=productPaymentDocument(publicApiBase);

  return async function handle({query={},event={}}={}){
    const signature=header(event,"payment-signature")??header(event,"x-payment");
    if(!signature)return paymentRequiredResponse({document:doc,price:PRICE});

    let payload;
    try{payload=decodePayment(signature);}
    catch(error){
      const reason=
        error?.message==="payment_header_too_large"?"payment_header_too_large":
        error?.message==="invalid_payment_payload"?"invalid_payment_payload":
        "invalid_payment_header";
      return paymentRequiredResponse({reason,document:doc,price:PRICE});
    }

    let normalized;
    try{
      normalized=validateVendorDomainContinuityInput({
        company:query.company??"",
        domain:query.domain??"",
        minExpirationDays:query.minExpirationDays,
        minStableDays:query.minStableDays
      });
    }catch(error){
      return json(400,{error:"invalid_request",detail:error?.message||"invalid_input"});
    }

    const verification=await verifyPayment({paymentPayload:payload,paymentRequirements:req,fetchImpl});
    if(verification.kind==="unresolved")return temporary(verification.reason);
    if(verification.kind==="terminal")return paymentRequiredResponse({reason:verification.reason,document:doc,price:PRICE});

    let result;
    try{result=await service.check(normalized);}
    catch{return json(502,{error:"required_source_unavailable",chargeable:false});}

    if(result?.chargeable!==true||(Array.isArray(result?.sourceFailures)&&result.sourceFailures.length)){
      return json(502,{
        error:"required_source_unavailable",
        sourceFailures:result?.sourceFailures||[],
        checkedAt:result?.checkedAt??null,
        chargeable:false
      });
    }

    const settlement=await settleSamePayment({paymentPayload:payload,paymentRequirements:req,fetchImpl});
    if(settlement.kind==="unresolved")return temporary(settlement.reason);
    if(settlement.kind==="terminal")return paymentRequiredResponse({reason:settlement.reason,document:doc,price:PRICE});

    return json(200,{...result,paid:true,price:PRICE},{
      "PAYMENT-RESPONSE":encodeHeader(settlement.receipt),
      "x402-settled":"true"
    });
  };
}

module.exports={
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,
  productPaymentDocument,createPaidVendorDomainContinuityHandler
};
