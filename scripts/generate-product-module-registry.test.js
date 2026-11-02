"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {moduleDirectory,buildSource}=require("./generate-product-module-registry");

test("module directory defaults to the canonical product id",()=>{
  assert.equal(moduleDirectory({id:"example-product"}),"example-product");
});

test("Product 002 legacy directory is keyed by its canonical registry id",()=>{
  const source=buildSource();
  for(const moduleName of ["metadata","service","paid-handler"]){
    assert.match(
      source,
      new RegExp('"pa-vendor-intake-gate":require\\("\\.\\./products/pa-vendor-gate/'+moduleName+'"\\)')
    );
  }
});

test("unsafe module directories are rejected",()=>{
  assert.throws(
    ()=>moduleDirectory({id:"example",module_directory:"../outside"}),
    /invalid module_directory/
  );
});
