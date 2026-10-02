"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {validateNoNestedSellerCalls}=require("./validate-no-nested-seller-calls");

test("factory implementation has no hard-coded nested AppDeploy seller calls",()=>{
  const result=validateNoNestedSellerCalls();
  assert.equal(result.ok,true,JSON.stringify(result.violations,null,2));
  assert.ok(result.scannedCount>=20);
  assert.deepEqual(result.violations,[]);
});
