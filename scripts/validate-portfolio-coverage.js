"use strict";

const fs=require("node:fs");
const path=require("node:path");

function validatePortfolioCoverage(root=path.resolve(__dirname,"..")){
  const read=(relative)=>fs.readFileSync(path.join(root,relative),"utf8");
  const exists=(relative)=>fs.existsSync(path.join(root,relative));

  const registry=JSON.parse(read("product-registry.json"));
  const migration=JSON.parse(read("MIGRATION_MANIFEST.json"));
  const modules=require(path.join(root,"generated/product-modules.js"));
  const ci=read(".github/workflows/factory-pa-vendor-gate-ci.yml");
  const smokeWorkflow=read(".github/workflows/factory-product-003-live-smoke.yml");

  const products=registry.products.filter(p=>/staging$/.test(String(p.status)));
  const problems=[];

  const requiredProductFiles=[
    "decision.js",
    "decision.test.js",
    "service.js",
    "service.test.js",
    "paid-handler.js",
    "paid-handler.test.js",
    "metadata.js",
    "metadata.test.js",
    "live-smoke.js",
    "DEPLOYMENT_PLAN.md"
  ];

  for(const product of products){
    const base="products/"+product.id;

    for(const name of requiredProductFiles){
      if(!exists(base+"/"+name)) problems.push(product.id+":missing_file:"+name);
    }

    if(!product.release_gate){
      problems.push(product.id+":missing_registry_release_gate");
    }else if(!exists(product.release_gate)){
      problems.push(product.id+":release_gate_file_missing:"+product.release_gate);
    }

    if(!product.deployment_blocker){
      problems.push(product.id+":missing_registry_deployment_blocker");
    }

    if(!migration.products.includes(product.number)){
      problems.push(product.id+":missing_migration_manifest_number");
    }
    if(!migration.staging_products.includes(product.number)){
      problems.push(product.id+":missing_migration_staging_classification");
    }

    if(!modules.METADATA_MODULES[product.id]){
      problems.push(product.id+":missing_generated_metadata_module");
    }
    if(!modules.SERVICE_MODULES[product.id]){
      problems.push(product.id+":missing_generated_service_module");
    }
    if(!modules.PAID_HANDLER_MODULES[product.id]){
      problems.push(product.id+":missing_generated_paid_handler_module");
    }
  }

  const architectureChecks=[
    ["ci_dynamic_tests",ci.includes("scripts/run-all-tests.js")],
    ["ci_dynamic_release_gates",ci.includes("scripts/run-release-gates.js")],
    ["ci_generated_registry_check",ci.includes("generate-product-module-registry.js --check")],
    ["smoke_dynamic_runner",smokeWorkflow.includes("scripts/run-live-smokes.js")]
  ];
  for(const [name,ok] of architectureChecks){
    if(!ok)problems.push("factory:"+name+":missing");
  }

  return {
    ok:problems.length===0,
    stagingProductCount:products.length,
    stagingProductIds:products.map(p=>p.id),
    architecture:Object.fromEntries(architectureChecks),
    problems
  };
}

if(require.main===module){
  const result=validatePortfolioCoverage();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=2;
}

module.exports={validatePortfolioCoverage};
