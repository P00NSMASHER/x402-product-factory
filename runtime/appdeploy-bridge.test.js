"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {createFactoryRuntime}=require("./create-runtime");
const {STATIC_GET_PATHS,createAppDeployRouteMap}=require("./appdeploy-bridge");

function adapters(){
  const never=async()=>{throw new Error("source should not run");};
  return {
    registry:{lookup:never},
    address:{compare:never},
    rdap:{lookup:never},
    sec:{lookup:never},
    treasury:{lookup:never,history:never,compare:never},
    ofac:{lookup:never}
  };
}

test("AppDeploy bridge exposes all static discovery and staged paid routes",()=>{
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters(),
    fetchImpl:async()=>{throw new Error("network should not run");}
  });
  const routes=createAppDeployRouteMap(runtime);
  const expected=[
    ...STATIC_GET_PATHS.map(path=>"GET "+path),
    ...runtime.stagingProducts.flatMap(product=>[
      product.method+" "+product.path,
      "OPTIONS "+product.path
    ])
  ];
  assert.deepEqual(Object.keys(routes),expected);
  assert.equal(Object.keys(routes).length,STATIC_GET_PATHS.length+2*runtime.stagingProducts.length);
});

test("AppDeploy bridge unpaid paid-route invocation returns 402",async()=>{
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters(),
    fetchImpl:async()=>{throw new Error("network should not run");}
  });
  const routes=createAppDeployRouteMap(runtime);
  const product=runtime.stagingProducts[0];
  const handler=routes[product.method+" "+product.path][0];
  const response=await handler({query:{},event:{headers:{}}});
  assert.equal(response.statusCode,402);
});

test("AppDeploy bridge forwards OPTIONS and compiled discovery surfaces",async()=>{
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:adapters()
  });
  const routes=createAppDeployRouteMap(runtime);

  const product=runtime.stagingProducts[0];
  const preflight=await routes["OPTIONS "+product.path][0]({query:{},event:{headers:{}}});
  assert.equal(preflight.statusCode,204);

  const catalog=await routes["GET /.well-known/x402"][0]({query:{},event:{headers:{}}});
  assert.equal(catalog.statusCode,200);
  assert.equal(JSON.parse(catalog.body).resources.length,runtime.stagingProducts.length);
});
