"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {managedProducts}=require("../packages/discovery/generator");
const {encodeHeader}=require("../packages/x402/payment");
const {createFactoryRuntime}=require("./create-runtime");

function adapters(){
  const never=async()=>{throw new Error("source should not run for unpaid request");};
  return {
    registry:{lookup:never},
    address:{compare:never},
    rdap:{lookup:never},
    sec:{lookup:never},
    treasury:{latest:never,lookup:never,history:never,compare:never},
    ofac:{screen:never,lookup:never}
  };
}

test("runtime wires exactly every modular staging product",()=>{
  const runtime=createFactoryRuntime({publicApiBase:"https://candidate.example",adapters:adapters(),fetchImpl:async()=>{throw new Error("network should not run");}});
  const expected=managedProducts();
  assert.equal(runtime.routes.size,expected.length);
  assert.deepEqual(
    [...runtime.routes.keys()],
    expected.map(p=>p.method+" "+p.path)
  );
  assert.ok(expected.length>=1);
  assert.ok(expected.some(p=>p.id==="domain-last-changed-recency"));
  assert.ok(expected.some(p=>p.id==="sec-company-identity-match"));
  assert.ok(expected.some(p=>p.id==="treasury-average-rate-trend"));
  assert.ok(expected.some(p=>p.id==="treasury-average-rate-spread"));
  assert.ok(expected.some(p=>p.id==="pa-entity-ofac-review"));
});

test("every staged paid route returns 402 without source or facilitator work",async()=>{
  let networkCalls=0;
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters(),
    fetchImpl:async()=>{networkCalls++;throw new Error("unexpected network");}
  });
  for(const product of runtime.stagingProducts){
    const response=await runtime.handle({method:product.method,path:product.path,query:{},event:{headers:{}}});
    assert.equal(response.statusCode,402,product.id+" must challenge unpaid calls");
    const body=JSON.parse(response.body);
    assert.equal(body.price,"$"+product.price_usdc);
    assert.equal(body.network,"eip155:8453");
    assert.equal(String(body.payTo).toLowerCase(),"0x708f7b52b56eafd7fc1de65fc7752ed732914021");
  }
  assert.equal(networkCalls,0);
});

test("runtime serves one compiled catalog containing every staged route",async()=>{
  const runtime=createFactoryRuntime({publicApiBase:"https://candidate.example",adapters:adapters()});
  const response=await runtime.handle({method:"GET",path:"/.well-known/x402"});
  assert.equal(response.statusCode,200);
  const body=JSON.parse(response.body);
  assert.equal(body.resources.length,runtime.stagingProducts.length);
  assert.deepEqual(
    body.resources.map(r=>new URL(r.resource).pathname),
    runtime.stagingProducts.map(p=>p.path)
  );
  for(const resource of body.resources){
    assert.ok(Array.isArray(resource.accepts)&&resource.accepts.length===1);
  }
});

test("runtime serves compiled OpenAPI and llms surfaces",async()=>{
  const runtime=createFactoryRuntime({publicApiBase:"https://candidate.example",adapters:adapters()});
  const openapi=JSON.parse((await runtime.handle({path:"/openapi.json"})).body);
  assert.deepEqual(Object.keys(openapi.paths),runtime.stagingProducts.map(p=>p.path));
  const llms=(await runtime.handle({path:"/llms.txt"})).body;
  for(const product of runtime.stagingProducts){
    assert.ok(llms.includes(product.path));
  }
});

test("health reports staged product count and unknown route is 404",async()=>{
  const runtime=createFactoryRuntime({publicApiBase:"https://candidate.example",adapters:adapters()});
  const health=JSON.parse((await runtime.handle({path:"/api/_healthcheck"})).body);
  assert.equal(health.ok,true);
  assert.equal(health.stagingProductCount,runtime.stagingProducts.length);
  assert.equal((await runtime.handle({path:"/missing"})).statusCode,404);
});

test("every staged route answers CORS payment-header preflight",async()=>{
  let networkCalls=0;
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters(),
    fetchImpl:async()=>{networkCalls++;throw new Error("unexpected network");}
  });
  for(const product of runtime.stagingProducts){
    const response=await runtime.handle({
      method:"OPTIONS",
      path:product.path,
      event:{headers:{}}
    });
    assert.equal(response.statusCode,204,product.id+" preflight status");
    assert.match(response.headers["access-control-allow-methods"],/GET/);
    assert.match(response.headers["access-control-allow-methods"],/OPTIONS/);
    assert.match(response.headers["access-control-allow-headers"],/PAYMENT-SIGNATURE/);
    assert.match(response.headers["access-control-allow-headers"],/X-PAYMENT/);
  }
  assert.equal(networkCalls,0);
});

test("every staged route rejects malformed payment before network work",async()=>{
  let networkCalls=0;
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters(),
    fetchImpl:async()=>{networkCalls++;throw new Error("unexpected network");}
  });
  for(const product of runtime.stagingProducts){
    const response=await runtime.handle({
      method:product.method,
      path:product.path,
      query:{},
      event:{headers:{"payment-signature":"not-valid-base64-json"}}
    });
    assert.equal(response.statusCode,402,product.id+" malformed payment status");
  }
  assert.equal(networkCalls,0);
});

test("every staged route validates required input before facilitator verification",async()=>{
  let networkCalls=0;
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters(),
    fetchImpl:async()=>{networkCalls++;throw new Error("facilitator must not run for invalid input");}
  });
  const signature=encodeHeader({x402Version:2,payload:{signed:true}});
  for(const product of runtime.stagingProducts){
    const response=await runtime.handle({
      method:product.method,
      path:product.path,
      query:{},
      event:{headers:{"payment-signature":signature}}
    });
    assert.equal(response.statusCode,400,product.id+" invalid-input status");
  }
  assert.equal(networkCalls,0);
});

test("runtime serves canonical product index aligned with staged routes",async()=>{
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters()
  });
  const response=await runtime.handle({path:"/product-index.json"});
  assert.equal(response.statusCode,200);
  const index=JSON.parse(response.body);
  assert.deepEqual(index.products.map(p=>p.id),runtime.stagingProducts.map(p=>p.id));
  assert.deepEqual(index.products.map(p=>p.path),runtime.stagingProducts.map(p=>p.path));
  assert.deepEqual(index.products.map(p=>p.price_usdc),runtime.stagingProducts.map(p=>p.price_usdc));
});
