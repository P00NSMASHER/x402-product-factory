"use strict";

const defaultPayment=require("./payment");

const EXPOSE_HEADERS=
  "PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After";

function header(event,name){
  const wanted=String(name).toLowerCase();
  for(const [key,value] of Object.entries(event?.headers||{})){
    if(String(key).toLowerCase()===wanted&&value!=null)return String(value);
  }
  return undefined;
}

function json(statusCode,body,headers={}){
  return {
    statusCode,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*",
      "access-control-expose-headers":EXPOSE_HEADERS,
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

function normalizeBase(value){
  if(typeof value!=="string"||!value.startsWith("https://")){
    throw new TypeError("https publicApiBase is required");
  }
  return value.endsWith("/")?value.slice(0,-1):value;
}

function requireProduct(product){
  if(!product||typeof product!=="object")throw new TypeError("product metadata is required");
  for(const key of [
    "id","method","path","price_usdc","amount_atomic_usdc",
    "service_name","resource_description","search_tags","example_query","decisions"
  ]){
    if(product[key]==null)throw new TypeError("product."+key+" is required");
  }
  if(product.method!=="GET")throw new TypeError("standard paid handler currently supports GET only");
  if(!Array.isArray(product.search_tags)||product.search_tags.length===0){
    throw new TypeError("product.search_tags must be non-empty");
  }
  if(!Array.isArray(product.decisions)||product.decisions.length===0){
    throw new TypeError("product.decisions must be non-empty");
  }
  return product;
}

function productPaymentDocument({product,publicApiBase,payment=defaultPayment}){
  const item=requireProduct(product);
  const base=normalizeBase(publicApiBase);
  return payment.paymentDocument({
    resourceUrl:base+item.path,
    amountAtomic:item.amount_atomic_usdc,
    description:item.resource_description,
    serviceName:item.service_name,
    tags:item.search_tags,
    inputExample:{
      type:"http",
      method:item.method,
      queryParams:item.example_query
    },
    outputExample:{
      type:"json",
      example:{
        decision:item.decisions[0],
        paid:true
      }
    }
  });
}

function invalidPaymentReason(error){
  return error?.message==="payment_header_too_large"
    ?"payment_header_too_large"
    :error?.message==="invalid_payment_payload"
      ?"invalid_payment_payload"
      :"invalid_payment_header";
}

function createStandardPaidHandler({
  product,
  service,
  validateInput,
  publicApiBase,
  fetchImpl=fetch,
  payment=defaultPayment
}){
  const item=requireProduct(product);
  if(!service||typeof service.check!=="function")throw new TypeError("service.check() is required");
  if(typeof validateInput!=="function")throw new TypeError("validateInput() is required");
  normalizeBase(publicApiBase);

  const price="$"+item.price_usdc;
  const paymentRequirements=payment.requirements(item.amount_atomic_usdc);
  const document=productPaymentDocument({product:item,publicApiBase,payment});

  return async function handle({query={},event={}}={}){
    const signature=header(event,"payment-signature")??header(event,"x-payment");
    if(!signature)return payment.paymentRequiredResponse({document,price});

    let paymentPayload;
    try{
      paymentPayload=payment.decodePayment(signature);
    }catch(error){
      return payment.paymentRequiredResponse({
        reason:invalidPaymentReason(error),
        document,
        price
      });
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

    const verification=await payment.verifyPayment({
      paymentPayload,
      paymentRequirements,
      fetchImpl
    });
    if(verification.kind==="unresolved"){
      return temporaryPaymentFailure(verification.reason);
    }
    if(verification.kind==="terminal"){
      return payment.paymentRequiredResponse({
        reason:verification.reason,
        document,
        price
      });
    }

    let result;
    try{
      result=await service.check(normalized);
    }catch{
      return json(502,{
        error:"required_source_unavailable",
        chargeable:false
      });
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

    const settlement=await payment.settleSamePayment({
      paymentPayload,
      paymentRequirements,
      fetchImpl
    });
    if(settlement.kind==="unresolved"){
      return temporaryPaymentFailure(settlement.reason);
    }
    if(settlement.kind==="terminal"){
      return payment.paymentRequiredResponse({
        reason:settlement.reason,
        document,
        price
      });
    }

    return json(
      200,
      {...result,paid:true,price},
      {
        "PAYMENT-RESPONSE":payment.encodeHeader(settlement.receipt),
        "x402-settled":"true"
      }
    );
  };
}

module.exports={
  EXPOSE_HEADERS,
  header,
  json,
  temporaryPaymentFailure,
  normalizeBase,
  requireProduct,
  productPaymentDocument,
  invalidPaymentReason,
  createStandardPaidHandler
};
