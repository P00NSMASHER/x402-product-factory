"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {stagingProducts,discoverReleaseGates}=require("./run-release-gates");

test("every staging product resolves to one existing release gate",()=>{
  const products=stagingProducts();
  const gates=discoverReleaseGates();
  assert.equal(gates.length,products.length);
  assert.deepEqual(gates.map(g=>g.product.id),products.map(p=>p.id));
  assert.equal(new Set(gates.map(g=>g.relative)).size,gates.length);
  for(const gate of gates){
    assert.match(gate.relative,/^scripts\/validate-product-\d{3}\.js$/);
  }
});
