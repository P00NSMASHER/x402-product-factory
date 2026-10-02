"use strict";

const assert=require("node:assert/strict");
const registry=require("../product-registry.json");

function unique(values,label){
  const seen=new Set();
  for(const value of values){
    assert.ok(!seen.has(value),`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function main(){
  assert.equal(registry.version,1);
  assert.ok(Array.isArray(registry.products));
  assert.ok(registry.products.length>=4);

  unique(registry.products.map(p=>p.id),"product id");
  unique(registry.products.map(p=>p.number),"product number");
  unique(registry.products.map(p=>p.path),"product route");

  const numbers=registry.products.map(p=>Number(p.number));
  assert.ok(numbers.every(Number.isInteger),"product numbers must be integers");
  const sorted=[...numbers].sort((a,b)=>a-b);
  assert.deepEqual(numbers,sorted,"product registry must remain numerically ordered");

  for(const p of registry.products){
    assert.match(p.number,/^\d{3}$/);
    assert.ok(["GET","POST"].includes(p.method));
    assert.match(p.path,/^\//);
    assert.match(p.price_usdc,/^\d+\.\d{3}$/);
    assert.ok(Array.isArray(p.decision_values)||p.id==="pa-entity-lookup");
  }

  const staging=registry.products.filter(p=>/staging$/.test(p.status));
  for(const p of staging){
    assert.ok(p.release_gate, `${p.id} staging product must name a release gate`);
    assert.ok(p.deployment_blocker, `${p.id} staging product must record its current deploy blocker`);
  }

  console.log(JSON.stringify({
    ok:true,
    count:registry.products.length,
    products:registry.products.map(p=>({
      number:p.number,id:p.id,status:p.status,method:p.method,path:p.path,price_usdc:p.price_usdc
    }))
  },null,2));
}

main();
