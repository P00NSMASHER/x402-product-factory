"use strict";

// Generates deterministic, schema-guided hostile query variants, never
// payment attempts or live upstream calls. Fixture values are synthetic.
const fs=require("node:fs");
const path=require("node:path");
const {loadSpecs}=require("../scripts/generate-spec-artifacts");
const OUT=path.join(__dirname,"generated","ADVERSARIAL_COVERAGE.json");
function fail(message){const e=new Error("ADVERSARIAL_MATRIX: "+message);e.code="ADVERSARIAL_MATRIX";throw e;}
function casesFor(spec){
  if(!spec||!/^\d{3}$/.test(spec.number)||Number(spec.number)<3||Number(spec.number)>24||
     !Array.isArray(spec.api?.inputs)||!spec.api?.example_query)fail("invalid product specification");
  const list=[],seen=new Set(),base=spec.api.example_query;
  function add(kind,field,modified){
    const key=kind+":"+field+":"+JSON.stringify(modified);
    if(seen.has(key))return;
    seen.add(key);
    if(JSON.stringify(modified)===JSON.stringify(base))fail("ineffective input mutation: "+kind);
    list.push({kind,field,query:modified});
  }
  function edit(field,value,kind){
    const query={...base};
    if(value===undefined)delete query[field];
    else query[field]=value;
    add(kind,field,query);
  }
  for(const input of spec.api.inputs){
    const f=input.name;
    if(input.required===true){
      edit(f,undefined,"omit-required");
      if(input.type==="string"){
        edit(f," ","blank-required");
        if(input.minLength>1)edit(f,"x".repeat(input.minLength-1),"below-string-min");
      }
    }
    if(input.type==="string"){
      if(Number.isInteger(input.maxLength)&&input.maxLength<=500){
        edit(f,"x".repeat(input.maxLength+1),"above-string-max");
      }
      if(Array.isArray(input.enum)&&input.enum.length){
        edit(f,"unsupported_value","outside-enum");
      }
      if(input.pattern&&Object.hasOwn(base,f)){
        edit(f,"!invalid!","regex-mismatch");
      }
    }else if(input.type==="integer"||input.type==="number"){
      edit(f,"not_a_number","non-numeric");
      if(typeof input.minimum==="number"){
        const below=input.type==="integer"?input.minimum-1:input.minimum-0.5;
        edit(f,String(below),"below-numeric-min");
      }
      if(typeof input.maximum==="number"){
        edit(f,String(input.maximum+1),"above-numeric-max");
      }
      if(input.type==="integer"&&typeof input.minimum==="number"){
        edit(f,String(input.minimum+0.5),"fractional-integer");
      }
    }else if(input.type==="boolean"){
      edit(f,"not_boolean","invalid-boolean");
    }
  }
  const grouped=spec.api.inputs.filter(x=>x.required==="exactly_one_of_ticker_or_cik");
  if(grouped.length){
    const missing={...base};delete missing.ticker;delete missing.cik;
    add("missing-exactly-one","ticker_or_cik",missing);
    const both={...base};
    both.ticker="AAPL";both.cik="320193";
    add("multiple-exclusive-identifiers","ticker_or_cik",both);
    const malformed={...base};delete malformed.ticker;malformed.cik="not_a_cik";
    add("malformed-exclusive-identifier","cik",malformed);
  }
  if(list.length===0)fail("no hostile variants for "+spec.id);
  return list;
}
function coverage(specs=loadSpecs()){
  if(!Array.isArray(specs)||specs.length!==22)fail("expected complete 003–024 specification set");
  const sorted=[...specs].sort((a,b)=>a.number.localeCompare(b.number));
  const products=sorted.map((p,i)=>{
    if(p.number!==String(i+3).padStart(3,"0"))fail("missing product in hostile matrix");
    const list=casesFor(p);
    return {number:p.number,id:p.id,hostile_case_count:list.length,
      mutation_kinds:[...new Set(list.map(x=>x.kind))].sort()};
  });
  return {
    schema_version:1,
    coverage_type:"invalid_query_mutations_unpaid_before_verification",
    generator:"quality/adversarial-contracts.js",
    products_reviewed:products.length,
    hostile_queries_per_implementation:products.reduce((n,p)=>n+p.hostile_case_count,0),
    implementation_count:2,
    real_upstream_requests_permitted:false,
    real_payment_submission_permitted:false,
    products
  };
}
function serialize(specs=loadSpecs()){
  return JSON.stringify(coverage(specs),null,2)+"\n";
}
function execute(mode,content=serialize()){
  if(!["check","write"].includes(mode))fail("use --check or --write");
  if(mode==="check"){
    if(!fs.existsSync(OUT)||fs.readFileSync(OUT,"utf8")!==content)fail("stale generated hostile query coverage");
  }else{
    fs.mkdirSync(path.dirname(OUT),{recursive:true});
    fs.writeFileSync(OUT,content,"utf8");
  }
  return {ok:true,mode,hostileQueriesPerImplementation:JSON.parse(content).hostile_queries_per_implementation};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!["--check","--write"].includes(args[0]))fail("use --check or --write");
    process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
  }catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1;}
}
module.exports={casesFor,coverage,serialize,execute};
