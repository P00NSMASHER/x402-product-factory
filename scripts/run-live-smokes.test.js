"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {stagingProducts,discoverLiveSmokes}=require("./run-live-smokes");

test("every staging product resolves to one live smoke",()=>{
  const products=stagingProducts();
  const smokes=discoverLiveSmokes();
  assert.equal(smokes.length,products.length);
  assert.deepEqual(smokes.map(x=>x.product.id),products.map(x=>x.id));
  assert.equal(new Set(smokes.map(x=>x.relative)).size,smokes.length);
  for(const smoke of smokes){
    assert.match(smoke.relative,/^products\/.+\/live-smoke\.js$/);
  }
});
