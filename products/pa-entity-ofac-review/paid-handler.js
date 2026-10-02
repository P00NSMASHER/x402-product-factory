"use strict";

const {
  encodeHeader,decodePayment,requirements,paymentDocument,
  paymentRequiredResponse,verifyPayment,settleSamePayment
}=require("../../packages/x402/payment");
const {validatePaEntityOfacInput}=require("./service");

const AMOUNT_ATOMIC="5000";
const PRICE="$0.005";
const RESOURCE_PATH="/api/pa-entity-ofac-review";

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
  base=base.replace(/\/$/,"");
  return paymentDocument({
    resourceUrl:base+RESOURCE_PATH,
    amountAtomic:AMOUNT_ATOMIC,
    description:"Resolve a Pennsylvania company to a unique legal entity and screen the resolved legal name against the current U.S. Treasury OFAC SDN primary-name and alias data. Returns candidate_found, no_candidate, company_not_found, or human_review. Candidate-name screening is not a legal sanctions determination; no_candidate is not sanctions clearance and OFAC 50 Percent Rule ownership analysis is not included.",
    serviceName:"PA Entity OFAC Review Gate",
    tags:["pennsylvania-business-registry","OFAC","SDN","legal-entity","sanctions-screening","human-review"],
    inputExample:{type:"http",method:"GET",queryParams:{company:"OpenAI OpCo",minScore:"90"}},
    outputExample:{type:"json",example:{decision:"no_candidate",screenedName:"Openai Opco, Llc",candidateCount:0,paid:true}}
  });
}

function createPaidPaEntityOfacHandler({service,publicApiBase,fetchImpl=fetch}){
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
      normalized=validatePaEntityOfacInput({
        company:query.company??"",
        minScore:query.minScore
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
  productPaymentDocument,createPaidPaEntityOfacHandler
};
