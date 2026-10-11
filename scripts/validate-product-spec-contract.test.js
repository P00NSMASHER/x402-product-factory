"use strict";

const assert=require("node:assert/strict");
const test=require("node:test");
const {loadSpecs,discoverSpecFiles}=require("./generate-product-spec-index");
const {validateSpecSet}=require("./validate-product-spec-contract");

const originals=loadSpecs();
const filenames=discoverSpecFiles();
const clone=()=>structuredClone(originals);
const rejected=(specs,match,options={filenames})=>{
  assert.throws(
    ()=>validateSpecSet(specs,options),
    error=>error.code==="PRODUCT_SPEC_CONTRACT_INVALID"&&match.test(error.message)
  );
};

test("canonical 003-012 specification set passes before generation",()=>{
  assert.strictEqual(validateSpecSet(clone(),{filenames}).length,10);
});

test("filename and product identity drift fail closed",()=>{
  const specs=clone();
  rejected(specs,/filename does not match identity/,{filenames:["003-impostor.json",...filenames.slice(1)]});
  specs[0].number="025";
  rejected(specs,/Product 025\+ demand freeze/);
  specs[0].number="003";
  specs[0].id="pa-vendor-something-else";
  rejected(specs,/registry id mismatch/,{filenames:null});
});

test("duplicate numbers, routes and operation IDs are rejected",()=>{
  const specs=clone();
  specs.push(structuredClone(specs[0]));
  rejected(specs,/duplicate product number/,{filenames:null});
  const other=clone();
  other[1].api.path=other[0].api.path;
  rejected(other,/registry route mismatch|route owned by another product/);
  const operations=clone();
  operations[1].discovery.operation_id=operations[0].discovery.operation_id;
  rejected(operations,/duplicate operation id/);
});

test("product rail, fee and deployment identity must match registry",()=>{
  const changes=[
    [s=>{s[0].economics.price_usdc="0.003";},/registry price mismatch/],
    [s=>{s[0].economics.price_usdc="0.005123";},/noncanonical USDC price/],
    [s=>{s[0].economics.price_usdc="0.000";},/nonpositive USDC price/],
    [s=>{s[0].api.method="POST";},/unsupported\/mismatched method/],
    [s=>{s[0].launch.current_status="production";},/registry status mismatch/],
    [s=>{s[0].launch.release_gate="scripts/not-a-gate.js";},/registry release gate mismatch/],
    [s=>{s[0].api.outputs.decisions=["consistent","approve"];},/registry decision mismatch/]
  ];
  for(const [change,match] of changes){
    const specs=clone();change(specs);rejected(specs,match);
  }
});

test("compiler never renders a path-traversal import",()=>{
  const changes=[
    [s=>{s[0].implementation.service_module="../../secret.js";},/unsafe service path/],
    [s=>{s[0].decision.implementation="../outside.js";},/unsafe decision path/],
    [s=>{s[0].implementation.input_validator_export="x];require('fs')";},/unsafe validator export/],
    [s=>{s[0].api.path="/api/../admin";},/unsafe route/]
  ];
  for(const [change,match] of changes){
    const specs=clone();change(specs);rejected(specs,match);
  }
});

test("undocumented inputs, repeated inputs and missing evidence fail closed",()=>{
  const changes=[
    [s=>{s[0].api.inputs.push({...s[0].api.inputs[0]});},/duplicate input name/],
    [s=>{s[0].api.example_query.undeclared="yes";},/undeclared example input/],
    [s=>{s[0].api.inputs=[];},/missing inputs/],
    [s=>{s[0].sources=[];},/missing source evidence/],
    [s=>{s[0].sources.push({...s[0].sources[0]});},/duplicate source id/],
    [s=>{s[0].failure_behavior.automatic_reject=true;},/automatic rejection is not allowed/],
    [s=>{s[0].discovery.search_tags=[..."abcdef"];},/search tag count/]
  ];
  for(const [change,match] of changes){
    const specs=clone();change(specs);rejected(specs,match);
  }
});


test("commercial claims require external evidence rather than spec assertions",()=>{
  const changes=[
    [s=>{s[0].buyer.expected_purchase_frequency.status="measured";},/purchase frequency cannot claim verified demand/],
    [s=>{s[0].buyer.expected_purchase_frequency.value=100;},/purchase frequency cannot claim verified demand/],
    [s=>{s[0].economics.incremental_hosting_cost_usd="0.000000";},/hosting cost must remain unknown/],
    [s=>{s[0].economics.paid_settlement_cost_usd="0.000000";},/post-allowance margin floor mismatch/],
    [s=>{s[0].economics.configured_direct_source_fee_usd="0.000100";},/post-allowance margin floor mismatch/],
    [s=>{s[0].economics.post_allowance_margin_floor_pct=70;},/post-allowance margin floor mismatch/],
    [s=>{s[0].economics.meets_target_before_unknown_costs=true;},/margin-target claim inconsistent/],
    [s=>{s[0].economics.paid_settlement_cost_usd="-1.000000";},/six-place USD/],
    [s=>{s[0].economics.target_contribution_margin_pct=101;},/invalid margin target/]
  ];
  for(const [mutation,match] of changes){
    const specs=clone();mutation(specs);rejected(specs,match);
  }
});

test("typed generated API examples reject malformed values and broken one-of rules",()=>{
  const changes=[
    [s=>{s[0].api.example_query.company="a";},/example violates string input constraint/],
    [s=>{delete s[0].api.example_query.company;},/required example input missing/],
    [s=>{s[0].api.inputs[0].required="optional";},/invalid input required flag/],
    [s=>{s[0].api.inputs[0].maxLength=1;},/inverted string bounds/],
    [s=>{s[0].api.inputs[0].unexpected=true;},/unexpected input descriptor/],
    [s=>{s[4].api.example_query.minAgeDays=0;},/example violates numeric input constraint/],
    [s=>{s[4].api.inputs[1].default=3651;},/default violates numeric input constraint/],
    [s=>{s[3].api.example_query.cik="123";},/exactly-one input example or rule invalid/],
    [s=>{s[3].api.example_query.ticker=123;},/example violates string input constraint/],
    [s=>{s[3].api.inputs[1].pattern="(";},/unsafe input pattern/],
    [s=>{s[3].api.input_rule=null;},/exactly-one input example or rule invalid/]
  ];
  for(const [mutation,match] of changes){
    const specs=clone();mutation(specs);rejected(specs,match);
  }
});


test("new enum and payment example corruption fails before generation",()=>{
  const mutations=[
    [s=>{s[5].api.inputs[2].enum=["gte","gte"];},/invalid enum/],
    [s=>{s[5].api.inputs[2].default="gt";},/default violates enum/],
    [s=>{s[5].api.payment_example_query.thresholdPercent="9";},/payment example differs/],
    [s=>{s[8].api.payment_example_query.extra="abc";},/undeclared payment example input/],
    [s=>{s[9].api.payment_example_output.paid=false;},/invalid payment output example/],
    [s=>{s[6].api.payment_example_output.decision="cleared";},/invalid payment output example/]
  ];
  for(const [mutate,pattern] of mutations){
    const s=clone();mutate(s);rejected(s,pattern);
  }
});
