"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {managedProducts}=require("../packages/discovery/generator");
const {STATIC_GET_PATHS}=require("../runtime/appdeploy-bridge");
const {buildAppDeployEntrypoint}=require("./build-appdeploy-entrypoint");

test("AppDeploy entrypoint uses proven SDK secret access rather than process.env",()=>{
  const built=buildAppDeployEntrypoint("https://candidate.example");
  assert.match(built.source,/import \{ router, secrets \} from '@appdeploy\/sdk'/);
  assert.match(built.source,/secrets\.listSecretNames\(\)/);
  assert.match(built.source,/secrets\.readSecret\('SEC_USER_AGENT'\)/);
  assert.doesNotMatch(built.source,/process\.env/);
  assert.equal(built.publicApiBase,"https://candidate.example");
});

test("AppDeploy entrypoint emits every static, paid, and OPTIONS route",()=>{
  const built=buildAppDeployEntrypoint("https://candidate.example/");
  const products=managedProducts();
  assert.equal(built.productCount,products.length);
  assert.equal(built.staticRouteCount,STATIC_GET_PATHS.length);
  assert.equal(built.paidRouteCount,products.length);
  assert.equal(built.optionsRouteCount,products.length);
  assert.equal(built.totalRouteCount,STATIC_GET_PATHS.length+2*products.length);

  for(const path of STATIC_GET_PATHS){
    assert.ok(built.source.includes(JSON.stringify("GET "+path)));
  }
  for(const product of products){
    assert.ok(built.source.includes(JSON.stringify(product.method+" "+product.path)));
    assert.ok(built.source.includes(JSON.stringify("OPTIONS "+product.path)));
  }
});

test("AppDeploy entrypoint is deterministic",()=>{
  const a=buildAppDeployEntrypoint("https://candidate.example");
  const b=buildAppDeployEntrypoint("https://candidate.example/");
  assert.equal(a.source,b.source);
  assert.deepEqual(a.productIds,b.productIds);
});
