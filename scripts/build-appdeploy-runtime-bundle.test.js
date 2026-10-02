"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {managedProducts}=require("../packages/discovery/generator");
const {
  collectRuntimeGraph,
  buildAppDeployRuntimeBundle
}=require("./build-appdeploy-runtime-bundle");

function inertAdapters(){
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

test("runtime graph is fully relative and includes every staged product module",()=>{
  const graph=collectRuntimeGraph();
  assert.deepEqual(graph.external,[]);
  assert.ok(graph.modules.some(m=>m.id==="runtime/create-runtime.js"));
  assert.ok(graph.modules.some(m=>m.id==="runtime/appdeploy-bridge.js"));
  for(const product of managedProducts()){
    assert.ok(
      graph.modules.some(m=>m.id.startsWith("products/"+product.id+"/")),
      product.id+" must be present in runtime bundle graph"
    );
  }
});

test("generated AppDeploy runtime bundle is executable ESM",async()=>{
  const built=buildAppDeployRuntimeBundle();
  assert.equal(built.external.length,0);
  assert.ok(built.moduleCount>managedProducts().length);
  assert.match(built.source,/export const createFactoryRuntime/);
  assert.match(built.source,/export const createAppDeployRouteMap/);

  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x402-appdeploy-bundle-"));
  const file=path.join(dir,"factory-runtime-bundle.mjs");
  fs.writeFileSync(file,built.source,"utf8");
  const mod=await import(pathToFileURL(file).href);

  assert.equal(typeof mod.createFactoryRuntime,"function");
  assert.equal(typeof mod.createAppDeployRouteMap,"function");

  const runtime=mod.createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:inertAdapters(),
    fetchImpl:async()=>{throw new Error("network should not run");}
  });
  assert.equal(runtime.stagingProducts.length,managedProducts().length);

  const routes=mod.createAppDeployRouteMap(runtime);
  assert.equal(
    Object.keys(routes).length,
    mod.STATIC_GET_PATHS.length+2*managedProducts().length
  );

  const first=runtime.stagingProducts[0];
  const unpaid=await routes[first.method+" "+first.path][0]({
    query:{},
    event:{headers:{}}
  });
  assert.equal(unpaid.statusCode,402);
});

test("bundle generation is deterministic",()=>{
  const a=buildAppDeployRuntimeBundle();
  const b=buildAppDeployRuntimeBundle();
  assert.equal(a.source,b.source);
  assert.deepEqual(a.moduleIds,b.moduleIds);
});
