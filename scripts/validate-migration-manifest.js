"use strict";

const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const manifest=require("../MIGRATION_MANIFEST.json");

function unique(values,label){
  const seen=new Set();
  for(const value of values){
    assert.ok(!seen.has(value),"duplicate "+label+": "+value);
    seen.add(value);
  }
}

function classify(product){
  if(["reference-production","production-reference"].includes(product.status))return "production";
  if(/staging$/.test(product.status))return "staging";
  if(product.status==="design")return "design";
  throw new Error("unclassified registry status "+product.number+" "+product.status);
}

function main(){
  const registryNumbers=registry.products.map(p=>p.number);
  const all=manifest.products||[];

  unique(all,"manifest product");
  assert.deepEqual(all,registryNumbers,"migration manifest products must exactly match registry numbers");
  assert.equal(manifest.classification_source,"product-registry.json");
  assert.match(String(manifest.classification_rule||""),/derive/i);

  const derived={production:[],staging:[],design:[]};
  for(const product of registry.products){
    derived[classify(product)].push(product.number);
  }

  assert.deepEqual(
    [...derived.production,...derived.staging,...derived.design].sort(),
    [...registryNumbers].sort(),
    "registry-derived classifications must cover every product exactly once"
  );

  console.log(JSON.stringify({
    ok:true,
    productCount:registryNumbers.length,
    production:derived.production,
    staging:derived.staging,
    design:derived.design,
    intendedRepository:manifest.intended_repository
  },null,2));
}
main();
