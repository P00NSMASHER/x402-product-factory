"use strict";

const {
  encodeHeader,
  decodePayment,
  requirements,
  paymentDocument,
  paymentRequiredResponse,
  verifyPayment,
  settleSamePayment,
}=require("./payment");

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

function temporaryPaymentFailure(reason){
  return json(
    503,
    {error:reason,paymentState:"unresolved",retrySamePayment:true},
    {"Retry-After":"2"}
  );
}

function standardPaymentDocument({product,publicApiBase}){
  if(!product||typeof product!=="object")throw new TypeError("product metadata is required");
  if(typeof publicApiBase!=="string"||!/^https:\/\//.test(publicApiBase)){
    throw new TypeError("https publicApiBase is required");
  }
  const base=publicApiBase.replace(/\/$/,"");
  return paymentDocument({
    resourceUrl:base+product.path,
    amountAtomic:product.amount_atomic_usdc,
    description:product.resource_description,
    serviceName:product.service_name,
    tags:product.search_tags,
    inputExample:{
      type:"http",
      method:product.method,
      queryParams:product.example_query
    },
    outputExample:{
      type:"json",
      example:{decision:product.decisions[0],paid:true}
    }
  });
}

function createStandardPaidHandler({
  product,
  validateInput,
  service,
  publicApiBase,
  fetchImpl=fetch
}){
  if(!product||typeof product!=="object")throw new TypeError("product metadata is required");
  if(product.method!=="GET")throw new TypeError("standard-x402-get-v1 requires GET");
  if(typeof validateInput!=="function")throw new TypeError("validateInput() is required");
  if(!service||typeof service.check!=="function")throw new TypeError("service.check() is required");
  if(typeof publicApiBase!=="string"||!/^https:\/\//.test(publicApiBase)){
    throw new TypeError("https publicApiBase is required");
  }

  const paymentRequirements=requirements(product.amount_atomic_usdc);
  const document=standardPaymentDocument({product,publicApiBase});
  const price="$"+product.price_usdc;

  return async function handle({query={},event={}}={}){
    const signature=header(event,"payment-signature")??header(event,"x-payment");
    if(!signature)return paymentRequiredResponse({document,price});

    let paymentPayload;
    try{
      paymentPayload=decodePayment(signature);
    }catch(error){
      const reason=
        error?.message==="payment_header_too_large"?"payment_header_too_large":
        error?.message==="invalid_payment_payload"?"invalid_payment_payload":
        "invalid_payment_header";
      return paymentRequiredResponse({reason,document,price});
    }

    let normalized;
    try{
      normalized=validateInput(query);
    }catch(error){
      return json(400,{
        error:"invalid_request",
        detail:error?.message||"invalid_input"
      });
    }

    const verification=await verifyPayment({
      paymentPayload,
      paymentRequirements,
      fetchImpl
    });
    if(verification.kind==="unresolved"){
      return temporaryPaymentFailure(verification.reason);
    }
    if(verification.kind==="terminal"){
      return paymentRequiredResponse({
        reason:verification.reason,
        document,
        price
      });
    }

    let result;
    try{
      result=await service.check(normalized);
    }catch{
      return json(502,{error:"required_source_unavailable",chargeable:false});
    }

    if(
      result?.chargeable!==true||
      (Array.isArray(result?.sourceFailures)&&result.sourceFailures.length>0)
    ){
      return json(502,{
        error:"required_source_unavailable",
        sourceFailures:result?.sourceFailures||[],
        checkedAt:result?.checkedAt??null,
        chargeable:false
      });
    }

    const settlement=await settleSamePayment({
      paymentPayload,
      paymentRequirements,
      fetchImpl
    });
    if(settlement.kind==="unresolved"){
      return temporaryPaymentFailure(settlement.reason);
    }
    if(settlement.kind==="terminal"){
      return paymentRequiredResponse({
        reason:settlement.reason,
        document,
        price
      });
    }

    return json(
      200,
      {...result,paid:true,price},
      {
        "PAYMENT-RESPONSE":encodeHeader(settlement.receipt),
        "x402-settled":"true"
      }
    );
  };
}

module.exports={
  header,
  json,
  temporaryPaymentFailure,
  standardPaymentDocument,
  createStandardPaidHandler
};
