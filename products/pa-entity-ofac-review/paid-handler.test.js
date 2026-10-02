"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,
  productPaymentDocument,createPaidPaEntityOfacHandler
}=require("./paid-handler");

function response(body,status=200){return{status,ok:status>=200&&status<300,async json(){return body;}};}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});

test("Product 016 terms are $0.005 / 5000 atomic",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(PRICE,"$0.005");
  assert.equal(AMOUNT_ATOMIC,"5000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"5000");
});

test("unpaid request returns 402 before service work",async()=>{
  let calls=0;
  const h=createPaidPaEntityOfacHandler({
    publicApiBase:"https://example.test",
    service:{async check(){calls++;}},
    fetchImpl:async()=>response({})
  });
  const r=await h({query:{company:"OpenAI OpCo"},event:{headers:{}}});
  assert.equal(r.statusCode,402);
  assert.equal(calls,0);
});

test("invalid threshold is rejected before facilitator work",async()=>{
  let network=0;
  const h=createPaidPaEntityOfacHandler({
    publicApiBase:"https://example.test",
    service:{async check(){throw new Error("should not run");}},
    fetchImpl:async()=>{network++;return response({});}
  });
  const r=await h({
    query:{company:"OpenAI OpCo",minScore:"101"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,400);
  assert.equal(network,0);
});

test("valid payment verifies then settles after completed evidence",async()=>{
  const urls=[];
  const h=createPaidPaEntityOfacHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"no_candidate",
      screenedName:"Openai Opco, Llc",
      candidateCount:0,
      sourceFailures:[],
      chargeable:true
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      return url.endsWith("/verify")
        ?response({isValid:true})
        :response({success:true,transaction:"0x016"});
    }
  });
  const r=await h({
    query:{company:"OpenAI OpCo",minScore:"90"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(u=>u.split("/").pop()),["verify","settle"]);
  assert.equal(JSON.parse(r.body).paid,true);
});

test("source transport failure never settles",async()=>{
  const urls=[];
  const h=createPaidPaEntityOfacHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",
      sourceFailures:[{source:"ofac_sdn",detail:"SOURCE_HTTP_ERROR"}],
      chargeable:false
    };}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({
    query:{company:"OpenAI OpCo"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,502);
  assert.equal(urls.length,1);
  assert.ok(urls[0].endsWith("/verify"));
});
