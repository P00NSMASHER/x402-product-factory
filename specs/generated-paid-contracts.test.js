"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../packages/x402/payment");
const {PAID_HANDLER_MODULES:HAND_PAID_HANDLER_MODULES}=require("../generated/product-modules");
const {PAID_HANDLER_MODULES:GENERATED_PAID_HANDLER_MODULES}=require("../generated/spec-paid-handlers");
const contracts=require("../generated/spec-contract-cases.json");

const BASE="https://candidate.example";
const HANDLER_SETS=[
  ["hand",HAND_PAID_HANDLER_MODULES],
  ["generated",GENERATED_PAID_HANDLER_MODULES]
];

function response(body,status=200){
  return {
    status,
    ok:status>=200&&status<300,
    async json(){return body;}
  };
}

function paymentSignature(){
  return encodeHeader({x402Version:2,payload:{signed:true}});
}

function paidHandlerFactory(productId,modules){
  const moduleExports=modules[productId];
  assert.ok(moduleExports,productId+" paid handler module missing");
  const matches=Object.entries(moduleExports)
    .filter(([name,value])=>typeof value==="function"&&/^createPaid.*Handler$/.test(name));
  assert.equal(matches.length,1,productId+" must expose exactly one paid handler factory");
  return matches[0][1];
}

function createHandler(productId,modules,{serviceCheck,fetchImpl}){
  const factory=paidHandlerFactory(productId,modules);
  return factory({
    service:{check:serviceCheck},
    publicApiBase:BASE,
    fetchImpl
  });
}

for(const [source,modules] of HANDLER_SETS){
  for(const item of contracts.cases){
    test(source+" paid contract "+item.id,async()=>{
      const productId=item.id.split(":")[0];
      let serviceCalls=0;
      const urls=[];

      if(item.kind==="payment_required"){
        const handler=createHandler(productId,modules,{
          serviceCheck:async()=>{serviceCalls+=1;return{};},
          fetchImpl:async url=>{urls.push(String(url));return response({});}
        });
        const result=await handler({query:item.query,event:{headers:{}}});
        assert.equal(result.statusCode,item.expected_status);
        assert.equal(result.headers["x402-price"],"$"+item.price_usdc);
        assert.ok(result.headers["PAYMENT-REQUIRED"]);
        assert.equal(serviceCalls,0);
        assert.equal(urls.length,0);
        return;
      }

      if(item.kind==="invalid_input"){
        const handler=createHandler(productId,modules,{
          serviceCheck:async()=>{serviceCalls+=1;return{};},
          fetchImpl:async url=>{urls.push(String(url));return response({});}
        });
        const result=await handler({
          query:item.query,
          event:{headers:{"payment-signature":paymentSignature()}}
        });
        assert.equal(result.statusCode,item.expected_status);
        assert.equal(serviceCalls,0);
        assert.equal(urls.length,0);
        return;
      }

      if(item.kind==="required_source_failure"){
        const handler=createHandler(productId,modules,{
          serviceCheck:async()=>{
            serviceCalls+=1;
            return {
              decision:"human_review",
              sourceFailures:[{source:"fixture",detail:"SOURCE_HTTP_ERROR"}],
              chargeable:false,
              checkedAt:"2026-10-02T20:00:00.000Z"
            };
          },
          fetchImpl:async url=>{
            const value=String(url);
            urls.push(value);
            if(value.endsWith("/verify"))return response({isValid:true});
            throw new Error("settlement must not run after required source failure");
          }
        });
        const result=await handler({
          query:item.query,
          event:{headers:{"payment-signature":paymentSignature()}}
        });
        assert.equal(result.statusCode,item.expected_status);
        assert.equal(JSON.parse(result.body).chargeable,false);
        assert.equal(serviceCalls,1);
        assert.equal(urls.length,1);
        assert.ok(urls[0].endsWith("/verify"));
        return;
      }

      if(item.kind==="payment_unresolved"){
        const handler=createHandler(productId,modules,{
          serviceCheck:async()=>{serviceCalls+=1;return{};},
          fetchImpl:async url=>{
            urls.push(String(url));
            throw new Error("fixture facilitator outage");
          }
        });
        const result=await handler({
          query:item.query,
          event:{headers:{"payment-signature":paymentSignature()}}
        });
        const body=JSON.parse(result.body);
        assert.equal(result.statusCode,item.expected_status);
        assert.equal(body.paymentState,"unresolved");
        assert.equal(body.retrySamePayment,true);
        assert.equal(serviceCalls,0);
        assert.equal(urls.length,1);
        assert.ok(urls[0].endsWith("/verify"));
        return;
      }

      if(item.kind==="paid_success"){
        const decision=item.allowed_decisions[0];
        const handler=createHandler(productId,modules,{
          serviceCheck:async()=>{
            serviceCalls+=1;
            return {
              decision,
              reasonCodes:[],
              sourceFailures:[],
              chargeable:true,
              checkedAt:"2026-10-02T20:00:00.000Z"
            };
          },
          fetchImpl:async url=>{
            const value=String(url);
            urls.push(value);
            if(value.endsWith("/verify"))return response({isValid:true});
            if(value.endsWith("/settle"))return response({success:true,transaction:"0xabc"});
            throw new Error("unexpected facilitator URL: "+value);
          }
        });
        const result=await handler({
          query:item.query,
          event:{headers:{"payment-signature":paymentSignature()}}
        });
        const body=JSON.parse(result.body);
        assert.equal(result.statusCode,item.expected_status);
        assert.equal(serviceCalls,1);
        assert.equal(urls.length,2);
        assert.ok(urls[0].endsWith("/verify"));
        assert.ok(urls[1].endsWith("/settle"));
        assert.ok(item.allowed_decisions.includes(body.decision));
        assert.equal(body.paid,true);
        assert.equal(body.price,"$"+item.price_usdc);
        assert.equal(result.headers["x402-settled"],"true");
        assert.ok(result.headers["PAYMENT-RESPONSE"]);
        return;
      }

      assert.fail("unknown generated contract kind: "+item.kind);
    });
  }
}
