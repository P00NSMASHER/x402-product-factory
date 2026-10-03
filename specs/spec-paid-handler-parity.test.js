"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../packages/x402/payment");
const {PAID_HANDLER_MODULES:HAND}=require("../generated/product-modules");
const {PAID_HANDLER_MODULES:GENERATED}=require("../generated/spec-paid-handlers");

const PRODUCTS=[
  require("./003-pa-vendor-identity-match.json"),
  require("./004-pa-business-address-match.json"),
  require("./005-pa-business-domain-match.json"),
  require("./006-sec-filing-freshness.json"),
  require("./007-domain-registration-age.json")
];

const PUBLIC_BASE="https://candidate.example";
const SIGNATURE=encodeHeader({x402Version:2,payload:{signed:true}});

function handFactory(moduleExports,productId){
  const matches=Object.entries(moduleExports||{})
    .filter(([name,value])=>/^createPaid.*Handler$/.test(name)&&typeof value==="function");
  assert.equal(matches.length,1,productId+" hand-written handler factory");
  return matches[0][1];
}

function response(status,body){
  return {status,ok:status>=200&&status<300,json:async()=>body};
}

function scriptedFetch(steps){
  const calls=[];
  let index=0;
  const fetchImpl=async(url,init={})=>{
    calls.push({
      url:String(url),
      method:init.method||"GET",
      body:typeof init.body==="string"?JSON.parse(init.body):init.body??null
    });
    const step=steps[index++]||{status:500,body:{}};
    return response(step.status,step.body);
  };
  return {fetchImpl,calls,remaining:()=>steps.length-index};
}

function challengeView(value){
  const body=JSON.parse(value.body);
  const accepts=(body.accepts||[]).map(item=>({
    scheme:item.scheme,
    network:item.network,
    amount:item.amount,
    asset:String(item.asset||"").toLowerCase(),
    payTo:String(item.payTo||"").toLowerCase(),
    maxTimeoutSeconds:item.maxTimeoutSeconds,
    extra:item.extra
  }));
  return {
    statusCode:value.statusCode,
    headers:{
      contentType:value.headers?.["content-type"],
      cacheControl:value.headers?.["cache-control"],
      price:value.headers?.["x402-price"],
      asset:value.headers?.["x402-asset"],
      network:value.headers?.["x402-network"],
      payTo:String(value.headers?.["x402-pay-to"]||"").toLowerCase()
    },
    body:{
      error:body.error??null,
      x402Version:body.x402Version,
      price:body.price,
      currency:body.currency,
      network:body.network,
      payTo:String(body.payTo||"").toLowerCase(),
      resource:{
        url:body.resource?.url,
        mimeType:body.resource?.mimeType,
        serviceName:body.resource?.serviceName
      },
      accepts,
      input:body.extensions?.bazaar?.info?.input??null
    }
  };
}

function comparableResponse(value){
  if(value.statusCode===402)return challengeView(value);
  return {
    statusCode:value.statusCode,
    headers:value.headers,
    body:JSON.parse(value.body)
  };
}

function serviceFor(mode,decision){
  const calls=[];
  const service={
    async check(input){
      calls.push(input);
      if(mode==="throw")throw new Error("source exploded");
      if(mode==="source-failure"){
        return {
          decision,
          checkedAt:"2026-10-02T00:00:00.000Z",
          sourceFailures:[{source:"test",detail:"SOURCE_DOWN"}],
          chargeable:false
        };
      }
      return {
        decision,
        checkedAt:"2026-10-02T00:00:00.000Z",
        sourceFailures:[],
        chargeable:true,
        evidence:{fixture:true}
      };
    }
  };
  return {service,calls};
}

async function runVariant({product,generated,scenario}){
  const moduleExports=generated?GENERATED[product.id]:HAND[product.id];
  assert.ok(moduleExports,product.id+" handler module");
  const createHandler=generated
    ? moduleExports.createPaidSpecHandler
    : handFactory(moduleExports,product.id);
  assert.equal(typeof createHandler,"function");

  const serviceMode=
    scenario==="source-exception"?"throw":
    scenario==="source-failure"?"source-failure":
    "success";
  const state=serviceFor(serviceMode,product.api.outputs.decisions[0]);

  let steps=[];
  if([
    "verification-terminal","verification-unresolved","source-exception",
    "source-failure","settlement-terminal","success"
  ].includes(scenario)){
    steps.push(
      scenario==="verification-terminal"
        ?{status:200,body:{isValid:false,invalidReason:"bad_signature"}}
        :scenario==="verification-unresolved"
          ?{status:503,body:{}}
          :{status:200,body:{isValid:true}}
    );
  }
  if(scenario==="settlement-terminal"){
    steps.push({status:200,body:{success:false,errorReason:"payment_settlement_failed"}});
  }else if(scenario==="success"){
    steps.push({status:200,body:{success:true,transaction:"0xabc",network:"eip155:8453"}});
  }

  const network=scriptedFetch(steps);
  const handler=createHandler({
    service:state.service,
    publicApiBase:PUBLIC_BASE,
    fetchImpl:network.fetchImpl
  });

  const query=scenario==="invalid-input"?{}:product.api.example_query;
  const event=
    scenario==="unpaid"
      ?{headers:{}}
      :scenario==="malformed-payment"
        ?{headers:{"payment-signature":"not-valid-base64-json"}}
        :{headers:{"payment-signature":SIGNATURE}};

  const result=await handler({query,event});
  return {result,calls:state.calls,networkCalls:network.calls};
}

test("generated paid handlers preserve hand-written protocol behavior for Products 003-007",async()=>{
  const scenarios=[
    "unpaid",
    "malformed-payment",
    "invalid-input",
    "verification-terminal",
    "verification-unresolved",
    "source-exception",
    "source-failure",
    "settlement-terminal",
    "success"
  ];

  for(const product of PRODUCTS){
    for(const scenario of scenarios){
      const hand=await runVariant({product,generated:false,scenario});
      const generated=await runVariant({product,generated:true,scenario});

      assert.deepEqual(
        comparableResponse(generated.result),
        comparableResponse(hand.result),
        product.id+" "+scenario+" response parity"
      );
      assert.deepEqual(
        generated.calls,
        hand.calls,
        product.id+" "+scenario+" normalized service input parity"
      );
      assert.deepEqual(
        generated.networkCalls,
        hand.networkCalls,
        product.id+" "+scenario+" facilitator call parity"
      );
    }
  }
});

test("generated challenge metadata stays within factory search-tag limit",async()=>{
  for(const product of PRODUCTS){
    const {result}=await runVariant({product,generated:true,scenario:"unpaid"});
    const body=JSON.parse(result.body);
    assert.ok(Array.isArray(body.resource?.tags),product.id+" tags array");
    assert.ok(body.resource.tags.length<=5,product.id+" search tags <= 5");
  }
});
