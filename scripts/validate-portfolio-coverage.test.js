"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {validatePortfolioCoverage}=require("./validate-portfolio-coverage");

test("every staging product has complete factory wiring",()=>{
  const result=validatePortfolioCoverage();
  assert.equal(result.ok,true,JSON.stringify(result.problems,null,2));
  assert.ok(result.stagingProductCount>=1);
  assert.equal(result.problems.length,0);
});
