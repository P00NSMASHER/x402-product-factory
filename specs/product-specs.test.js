"use strict";

const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const {buildIndex,check:checkGeneratedIndex}=require("../scripts/generate-product-spec-index");
const {
  PAYMENT,
  buildDiscovery,
  buildContractCases,
  renderDocs,
  check:checkGeneratedSpecArtifacts
}=require("../scripts/generate-spec-artifacts");
const {METADATA_MODULES}=require("../generated/product-modules");
const GENERATED_SPEC_METADATA=require("../generated/spec-metadata");

const ROOT=path.resolve(__dirname,"..");
const SPEC_FILES=[
  "003-pa-vendor-identity-match.json",
  "004-pa-business-address-match.json",
  "005-pa-business-domain-match.json",
  "006-sec-filing-freshness.json",
  "007-domain-registration-age.json"
];

function toMicros(value){
  const match=String(value).match(/^(-?)(\d+)\.(\d{3,6})$/);
  assert.ok(match,"expected fixed decimal amount: "+value);
  const sign=match[1]==="-"?-1n:1n;
  const fraction=(match[3]+"000000").slice(0,6);
  return sign*(BigInt(match[2])*1000000n+BigInt(fraction));
}

function oneDecimalRatioPct(numerator,denominator){
  assert.notEqual(denominator,0n);
  const scaled=numerator*1000n/denominator;
  return Number(scaled)/10;
}

function loadSpecs(){
  return SPEC_FILES.map(file=>JSON.parse(fs.readFileSync(path.join(__dirname,file),"utf8")));
}

test("product specs 003-007 are registry-bound and structurally complete",()=>{
  const specs=loadSpecs();
  assert.equal(specs.length,5);
  assert.deepEqual(specs.map(spec=>spec.number),["003","004","005","006","007"]);

  for(const spec of specs){
    assert.equal(spec.schema_version,1);
    assert.match(spec.discovery.operation_id,/^[A-Za-z][A-Za-z0-9]+$/);
    assert.ok(spec.discovery.service_name.length>=3&&spec.discovery.service_name.length<=32);
    assert.ok(spec.discovery.summary.length>=10);
    assert.ok(spec.discovery.description.length>=30);
    assert.ok(spec.discovery.resource_description.length>=30);
    assert.ok(Array.isArray(spec.discovery.search_tags));
    assert.ok(spec.discovery.search_tags.length>=1&&spec.discovery.search_tags.length<=5);
    assert.equal(new Set(spec.discovery.search_tags).size,spec.discovery.search_tags.length);
    assert.ok(Array.isArray(spec.discovery.openapi_tags));
    assert.ok(spec.discovery.openapi_tags.length>=1&&spec.discovery.openapi_tags.length<=8);
    assert.equal(new Set(spec.discovery.openapi_tags).size,spec.discovery.openapi_tags.length);
    const product=registry.products.find(item=>item.number===spec.number);
    assert.ok(product,"registry entry missing for "+spec.number);

    assert.equal(spec.id,product.id);
    assert.equal(spec.api.method,product.method);
    assert.equal(spec.api.path,product.path);
    assert.equal(spec.economics.price_usdc,product.price_usdc);
    assert.equal(spec.launch.current_status,product.status);
    assert.equal(spec.launch.release_gate,product.release_gate);
    assert.deepEqual([...spec.api.outputs.decisions].sort(),[...product.decision_values].sort());

    assert.equal(spec.buyer.expected_purchase_frequency.status,"unmeasured");
    assert.equal(spec.buyer.expected_purchase_frequency.value,null);
    assert.equal(spec.buyer.expected_purchase_frequency.unit,null);
    assert.ok(spec.buyer.expected_purchase_frequency.measurement_plan.length>=10);

    assert.ok(Array.isArray(spec.api.inputs)&&spec.api.inputs.length>0);
    assert.ok(Array.isArray(spec.sources)&&spec.sources.length>0);
    assert.ok(Array.isArray(spec.discovery.search_tags)&&spec.discovery.search_tags.length>=1&&spec.discovery.search_tags.length<=5);
    assert.ok(Array.isArray(spec.discovery.openapi_tags)&&spec.discovery.openapi_tags.length>=1);
    assert.ok(Array.isArray(spec.decision.rules)&&spec.decision.rules.length>0);
    assert.ok(fs.existsSync(path.join(ROOT,spec.decision.implementation)),spec.id+" decision implementation missing");
    assert.ok(Array.isArray(spec.launch.criteria)&&spec.launch.criteria.length>0);

    for(const source of spec.sources){
      assert.equal(typeof source.authority,"string");
      assert.equal(typeof source.refresh_policy,"string");
      assert.equal(typeof source.cache_policy,"string");
      assert.ok(
        source.freshness_limit_seconds===null ||
        (Number.isInteger(source.freshness_limit_seconds)&&source.freshness_limit_seconds>=0)
      );
    }

    assert.equal(spec.failure_behavior.automatic_reject,false);
    assert.equal(spec.economics.configured_direct_source_fee_usd,"0.000000");
    assert.equal(spec.economics.incremental_hosting_cost_usd,null);
    assert.equal(spec.economics.target_contribution_margin_pct,70);
    assert.equal(spec.economics.meets_target_before_unknown_costs,false);

    const price=toMicros(spec.economics.price_usdc);
    const settlement=toMicros(spec.economics.paid_settlement_cost_usd);
    const source=toMicros(spec.economics.configured_direct_source_fee_usd);
    const expected=oneDecimalRatioPct(price-settlement-source,price);
    assert.equal(spec.economics.post_allowance_margin_floor_pct,expected,spec.id+" margin floor");
  }
});

test("commercially important edge conditions remain explicit",()=>{
  const byNumber=Object.fromEntries(loadSpecs().map(spec=>[spec.number,spec]));
  assert.equal(byNumber["003"].decision.parameters.censusMaxDistanceMiles,0.25);
  assert.equal(byNumber["004"].decision.parameters.censusMaxDistanceMiles,0.25);
  assert.equal(byNumber["006"].decision.parameters.maxAgeDays.default,30);
  assert.equal(byNumber["006"].decision.parameters.maxAgeDays.minimum,1);
  assert.equal(byNumber["006"].decision.parameters.maxAgeDays.maximum,365);
  assert.equal(byNumber["007"].decision.parameters.minAgeDays.default,90);
  assert.equal(byNumber["007"].decision.parameters.minAgeDays.maximum,3650);
  assert.ok(byNumber["007"].economics.post_allowance_margin_floor_pct<0);
});


test("generated product spec index is current",()=>{
  const index=buildIndex();
  assert.equal(index.schema_version,1);
  assert.deepEqual(index.products.map(product=>product.number),["003","004","005","006","007"]);
  assert.doesNotThrow(()=>checkGeneratedIndex());
});


test("spec compiler generates discovery docs and standard contract cases without drift",()=>{
  const discovery=buildDiscovery();
  assert.equal(discovery.schema_version,1);
  assert.equal(discovery.products.length,5);
  assert.deepEqual(discovery.products.map(product=>product.number),["003","004","005","006","007"]);

  for(const product of discovery.products){
    assert.equal(product.payment.x402_version,2);
    assert.equal(product.payment.network,PAYMENT.network);
    assert.equal(product.payment.asset,PAYMENT.asset);
    assert.equal(product.payment.payTo,PAYMENT.payTo);
    assert.equal(product.payment.scheme,"exact");
    assert.deepEqual(product.payment.extra,{name:"USD Coin",version:"2"});
    assert.match(product.payment.amount_atomic_usdc,/^\d+$/);
    assert.ok(Array.isArray(product.inputs)&&product.inputs.length>0);
    assert.ok(Array.isArray(product.sources)&&product.sources.length>0);
  }

  const contracts=buildContractCases();
  assert.equal(contracts.cases.length,25);
  for(const number of ["003","004","005","006","007"]){
    const spec=loadSpecs().find(item=>item.number===number);
    const cases=contracts.cases.filter(item=>item.path===spec.api.path);
    assert.deepEqual(cases.map(item=>item.expected_status).sort((a,b)=>a-b),[200,400,402,502,503]);
    const success=cases.find(item=>item.kind==="paid_success");
    assert.deepEqual(success.allowed_decisions,spec.api.outputs.decisions);
  }

  const docs=renderDocs();
  assert.match(docs,/003 pa-vendor-identity-match/);
  assert.match(docs,/007 domain-registration-age/);
  assert.match(docs,/Purchase frequency: \*\*unmeasured\*\*/);
  assert.doesNotThrow(()=>checkGeneratedSpecArtifacts());
});


test("spec discovery stays at parity with current hand-written runtime metadata",()=>{
  const base="https://candidate.example";
  const specs=loadSpecs();

  for(const spec of specs){
    const metadata=METADATA_MODULES[spec.id];
    assert.ok(metadata,spec.id+" metadata module missing");

    const resource=metadata.catalogResource(base);
    assert.equal(resource.resource,base+spec.api.path);
    assert.equal(resource.method,spec.api.method);
    assert.equal(resource.price,"$"+spec.economics.price_usdc);
    assert.ok(Array.isArray(resource.accepts)&&resource.accepts.length>0);

    const accepts=resource.accepts[0];
    assert.equal(accepts.amount,String(BigInt(spec.economics.price_usdc.replace(".",""))*1000n));
    assert.equal(accepts.network,PAYMENT.network);
    assert.equal(accepts.asset,PAYMENT.asset);
    assert.equal(accepts.payTo,PAYMENT.payTo);
    assert.deepEqual(accepts.extra,{name:"USD Coin",version:"2"});

    const openApi=metadata.openApiPath();
    const operation=openApi[spec.api.method.toLowerCase()];
    assert.ok(operation,spec.id+" OpenAPI method missing");
    assert.equal(operation["x-payment-info"].price.amount,spec.economics.price_usdc+"000");
    assert.equal(operation["x-payment-info"].network,PAYMENT.network);
    assert.equal(operation["x-payment-info"].payTo,PAYMENT.payTo);
    assert.deepEqual(operation.tags,spec.discovery.openapi_tags);

    const actualNames=(operation.parameters||[]).map(parameter=>parameter.name);
    const specNames=spec.api.inputs.map(input=>input.name);
    assert.deepEqual(actualNames,specNames,spec.id+" OpenAPI input order");
  }
});


test("generated spec metadata matches current runtime metadata core contract",()=>{
  const base="https://candidate.example";
  for(const spec of loadSpecs()){
    const currentMetadata=METADATA_MODULES[spec.id];
    const currentResource=currentMetadata.catalogResource(base);
    const generatedResource=GENERATED_SPEC_METADATA.catalogResource(spec.id,base);

    assert.equal(generatedResource.resource,currentResource.resource);
    assert.equal(generatedResource.method,currentResource.method);
    assert.equal(generatedResource.description,currentResource.description);
    assert.equal(generatedResource.price,currentResource.price);
    assert.deepEqual(generatedResource.tags,spec.discovery.search_tags);
    assert.ok(generatedResource.tags.length>=1&&generatedResource.tags.length<=5);

    const currentAccept=currentResource.accepts[0];
    const generatedAccept=generatedResource.accepts[0];
    for(const key of ["scheme","network","amount","asset","payTo","maxTimeoutSeconds"]){
      assert.equal(generatedAccept[key],currentAccept[key],spec.id+" "+key);
    }
    assert.deepEqual(generatedAccept.extra,currentAccept.extra);

    const currentOperation=currentMetadata.openApiPath()[spec.api.method.toLowerCase()];
    const generatedOperation=GENERATED_SPEC_METADATA.openApiPath(spec.id)[spec.api.method.toLowerCase()];
    assert.equal(generatedOperation.operationId,currentOperation.operationId);
    assert.equal(generatedOperation.summary,currentOperation.summary);
    assert.equal(generatedOperation.description,currentOperation.description);
    assert.deepEqual(generatedOperation.tags,spec.discovery.openapi_tags);
    assert.deepEqual(generatedOperation.tags,currentOperation.tags);
    assert.deepEqual(
      generatedOperation.parameters.map(parameter=>parameter.name),
      currentOperation.parameters.map(parameter=>parameter.name)
    );
    assert.deepEqual(generatedOperation["x-payment-info"],currentOperation["x-payment-info"]);
    if(spec.api.input_rule){
      assert.equal(generatedOperation["x-input-rule"],spec.api.input_rule);
      assert.equal(generatedOperation["x-input-rule"],currentOperation["x-input-rule"]);
    }
  }
});
