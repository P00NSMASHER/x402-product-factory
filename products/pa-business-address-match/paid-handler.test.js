"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidBusinessAddressHandler}=require("./paid-handler");

function response(body,status=200){return{status,ok:status>=200&&status<300,async json(){return body;}};}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});
const query=()=>({company:"OpenAI OpCo",address:"600 North Second Street, Suite 401, Harrisburg, PA 17101"});

test("Product 004 payment terms are $0.003 / 3000 atomic",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(PRICE,"$0.003");
  assert.equal(AMOUNT_ATOMIC,"3000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"3000");
});

test("unpaid request returns 402 without source work",async()=>{
  let called=0;
  const h=createPaidBusinessAddressHandler({publicApiBase:"https://example.test",service:{async check(){called++;}},fetchImpl:async()=>response({})});
  const r=await h({query:query(),event:{headers:{}}});
  assert.equal(r.statusCode,402);
  assert.equal(called,0);
});

test("valid payment settles only after chargeable result",async()=>{
  const urls=[];
  const h=createPaidBusinessAddressHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{decision:"match",reasonCodes:[],sourceFailures:[],chargeable:true,checkedAt:"2026-10-02T09:30:00.000Z"};}},
    fetchImpl:async url=>{
      urls.push(url);
      if(url.endsWith("/verify"))return response({isValid:true});
      if(url.endsWith("/settle"))return response({success:true,transaction:"0x004"});
      throw new Error("unexpected");
    }
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);
  assert.equal(JSON.parse(r.body).paid,true);
  assert.equal(r.headers["x402-settled"],"true");
});

test("source transport failure never settles",async()=>{
  const urls=[];
  const h=createPaidBusinessAddressHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{decision:"human_review",sourceFailures:[{source:"census_address",detail:"SOURCE_HTTP_ERROR"}],chargeable:false};}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,502);
  assert.equal(urls.length,1);
  assert.ok(urls[0].endsWith("/verify"));
});
