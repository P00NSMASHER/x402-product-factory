"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidSecFilingFreshnessHandler
}=require("./paid-handler");

function response(body,status=200){return{status,ok:status>=200&&status<300,async json(){return body;}};}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});

test("Product 006 terms are $0.005 / 5000 atomic",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(PRICE,"$0.005");
  assert.equal(AMOUNT_ATOMIC,"5000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"5000");
});

test("unpaid request returns 402 without SEC work",async()=>{
  let calls=0;
  const h=createPaidSecFilingFreshnessHandler({
    publicApiBase:"https://example.test",
    service:{async check(){calls++;}},
    fetchImpl:async()=>response({})
  });
  const r=await h({query:{ticker:"AAPL"},event:{headers:{}}});
  assert.equal(r.statusCode,402);
  assert.equal(calls,0);
});

test("invalid freshness input is rejected before payment verification",async()=>{
  let network=0;
  const h=createPaidSecFilingFreshnessHandler({
    publicApiBase:"https://example.test",
    service:{async check(){throw new Error("should not run");}},
    fetchImpl:async()=>{network++;return response({});}
  });
  const r=await h({
    query:{ticker:"AAPL",cik:"320193"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,400);
  assert.equal(network,0);
});

test("valid payment verifies, computes, settles, returns decision",async()=>{
  const urls=[];
  const h=createPaidSecFilingFreshnessHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"recent_filing",
      sourceFailures:[],
      chargeable:true,
      checkedAt:"2026-10-02T12:00:00.000Z"
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      if(url.endsWith("/verify"))return response({isValid:true});
      if(url.endsWith("/settle"))return response({success:true,transaction:"0x006"});
      throw new Error("unexpected");
    }
  });
  const r=await h({
    query:{ticker:"AAPL",maxAgeDays:"30"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);
  assert.equal(JSON.parse(r.body).decision,"recent_filing");
  assert.equal(r.headers["x402-settled"],"true");
});

test("SEC transport failure after verification never settles",async()=>{
  const urls=[];
  const h=createPaidSecFilingFreshnessHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"company_not_found",
      sourceFailures:[{source:"sec_edgar",detail:"SOURCE_HTTP_ERROR"}],
      chargeable:false
    };}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({
    query:{ticker:"AAPL"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,502);
  assert.equal(urls.length,1);
  assert.ok(urls[0].endsWith("/verify"));
});
