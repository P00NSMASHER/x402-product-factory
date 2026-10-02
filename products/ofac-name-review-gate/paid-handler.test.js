"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
  createPaidOfacReviewHandler
}=require("./paid-handler");

function response(body,status=200){
  return {status,ok:status>=200&&status<300,async json(){return body;}};
}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});

test("Product 009 terms are $0.003 / 3000 atomic",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(PRICE,"$0.003");
  assert.equal(AMOUNT_ATOMIC,"3000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"3000");
});

test("unpaid request returns 402 without OFAC work",async()=>{
  let calls=0;
  const h=createPaidOfacReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){calls++;}},
    fetchImpl:async()=>response({})
  });
  const r=await h({query:{name:"Example LLC"},event:{headers:{}}});
  assert.equal(r.statusCode,402);
  assert.equal(calls,0);
});

test("invalid input is rejected before verification",async()=>{
  let network=0;
  const h=createPaidOfacReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){throw new Error("should not run");}},
    fetchImpl:async()=>{network++;return response({});}
  });
  const r=await h({
    query:{name:"",minScore:"90"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,400);
  assert.equal(network,0);
});

test("valid payment verifies, screens, settles, then returns result",async()=>{
  const urls=[];
  const h=createPaidOfacReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"no_candidate",
      candidateCount:0,
      candidates:[],
      sourceFailures:[],
      chargeable:true
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      if(url.endsWith("/verify"))return response({isValid:true});
      if(url.endsWith("/settle"))return response({success:true,transaction:"0x009"});
      throw new Error("unexpected");
    }
  });
  const r=await h({
    query:{name:"Example LLC",minScore:"90"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);
  assert.equal(JSON.parse(r.body).decision,"no_candidate");
  assert.equal(r.headers["x402-settled"],"true");
});

test("OFAC source failure after verification never settles",async()=>{
  const urls=[];
  const h=createPaidOfacReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",
      sourceFailures:[{source:"ofac_sdn",detail:"SOURCE_HTTP_ERROR"}],
      chargeable:false
    };}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({
    query:{name:"Example"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,502);
  assert.equal(JSON.parse(r.body).chargeable,false);
  assert.equal(urls.length,1);
  assert.ok(urls[0].endsWith("/verify"));
});
