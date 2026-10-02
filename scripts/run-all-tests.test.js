"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {discoverTests}=require("./run-all-tests");

test("dynamic factory test discovery finds product/package/runtime/script tests",()=>{
  const files=discoverTests();
  const rel=files.map(file=>path.relative(path.resolve(__dirname,".."),file).replaceAll("\\","/"));
  assert.ok(rel.includes("packages/x402/payment.test.js"));
  assert.ok(rel.includes("packages/discovery/generator.test.js"));
  assert.ok(rel.includes("products/pa-entity-type-policy/decision.test.js"));
  assert.ok(rel.includes("products/pa-registered-county-policy/decision.test.js"));
  assert.ok(rel.includes("products/pa-local-vendor-policy-gate/decision.test.js"));
  assert.ok(rel.includes("runtime/create-runtime.test.js"));
  assert.ok(rel.includes("scripts/validate-portfolio-coverage.test.js"));
  assert.equal(new Set(rel).size,rel.length);
  assert.deepEqual(rel,[...rel].sort());
});
