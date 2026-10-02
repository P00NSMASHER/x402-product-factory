"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {validateDeployCandidate}=require("./validate-deploy-candidate");
const {managedProducts}=require("../packages/discovery/generator");

test("candidate is blocked when required SEC identity is absent",()=>{
  const result=validateDeployCandidate({
    publicApiBase:"https://candidate.example",
    env:{}
  });
  assert.equal(result.ready,false);
  assert.ok(result.problems.includes("deployment_prerequisites_missing"));
  assert.ok(result.prerequisites.missing.some(x=>x.productId==="sec-filing-freshness"));
});

test("candidate is structurally ready with a declared SEC contact",()=>{
  const result=validateDeployCandidate({
    publicApiBase:"https://candidate.example",
    env:{SEC_USER_AGENT:"x402-product-factory-ci/1.0 ci@example.com"}
  });
  assert.equal(result.ready,true,JSON.stringify(result.problems));
  const count=managedProducts().length;
  assert.equal(result.productCount,count);
  assert.equal(result.paidRouteCount,count);
  assert.equal(result.optionsRouteCount,count);
  assert.equal(result.appDeployRouteCount,result.staticRouteCount+2*count);
  assert.deepEqual(result.problems,[]);
  assert.ok(result.releaseFiles.includes("x402-catalog.json"));
  assert.ok(result.releaseFiles.includes("openapi.json"));
  assert.ok(result.releaseFiles.includes("llms.txt"));
  assert.ok(result.releaseFiles.includes("product-index.json"));
  assert.ok(result.releaseFiles.includes("bundle-manifest.json"));
  assert.ok(result.releaseFiles.includes("release-manifest.json"));
  assert.ok(result.releaseFiles.includes("factory-runtime-bundle.js"));
  assert.ok(result.releaseFiles.includes("appdeploy-backend-index.ts"));
  assert.ok(result.releaseFiles.includes("appdeploy-deploy-files.json"));
  assert.equal(result.generatedEntrypointRouteCount,result.appDeployRouteCount);
});
