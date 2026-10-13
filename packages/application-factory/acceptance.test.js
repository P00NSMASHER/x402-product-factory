"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {accept}=require("./acceptance");
const {main}=require("../../scripts/build-application-factory");
test("100 generated artifacts execute their own embedded kernel successfully",()=>{
  const report=accept();
  assert.equal(report.passed,true);assert.equal(report.completeGeneratedKernelJourneys,100);
  assert.equal(report.generatedEditions,100);assert.equal(report.realCustomers,null);
  assert.equal(report.collectedRevenue,null);assert.equal(report.releaseApproved,false);
});
test("application CLI validates three editions without publishing",()=>{
  const result=main(["--check"]);
  assert.equal(result.editions.length,3);assert.equal(result.mode,"validate-only");
  assert.equal(result.releaseApproved,false);
});
test("application CLI fails on unexpected arguments",()=>{
  assert.throws(()=>main(["--publish"]),/USAGE/);
  assert.throws(()=>main([]),/USAGE/);
  assert.throws(()=>main(["--check","extra"]),/USAGE/);
});
