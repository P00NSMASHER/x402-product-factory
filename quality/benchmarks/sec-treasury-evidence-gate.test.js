"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const {createFactoryRuntime,chooseFactory}=require("../../runtime/create-runtime");
const {PAID_HANDLER_MODULES:HAND}=require("../../generated/product-modules");
const {encodeHeader}=require("../../packages/x402/payment");
const contract=require("../../packages/sources/market-evidence-contract");

const NUMBERS=["006","008","013","014","015"];
const specs=loadSpecs().filter(s=>NUMBERS.includes(s.number));
const registry=require("../../product-registry.json");
const NOW="2026-10-02T12:00:00Z";
const SIGNATURE=encodeHeader({x402Version:2,payload:{synthetic:true}});
const SOURCE={sec_edgar:"sec",treasury_fiscal_data:"treasury"};
const clone=x=>structuredClone(x);
const secCompany={name:"Apple Inc.",cik:"0000320193",tickers:["AAPL"],exchanges:["Nasdaq"]};
const secFilings=[{form:"8-K",filingDate:"2026-10-01",
  accessionNumber:"0000320193-26-000001",primaryDocument:"a8k.htm"}];
const treasuryRow=(desc,date,rate)=>({
  recordDate:date,securityDescription:desc,
  securityType:"Marketable",averageInterestRatePercent:rate
});
const TREASURY_DATE="2026-09-30";
const EVIDENCE={
  "006":{available:true,found:true,company:secCompany,filings:secFilings},
  "013":{available:true,found:true,company:secCompany,filings:[]},
  "008":{available:true,found:true,ambiguous:false,
    query:"Total Marketable",recordDate:TREASURY_DATE,matchCount:1,
    selected:treasuryRow("Total Marketable",TREASURY_DATE,3.75),
    matches:[treasuryRow("Total Marketable",TREASURY_DATE,3.75)]},
  "014":{available:true,found:true,ambiguous:false,query:"Total Marketable",
    matchDescriptions:["Total Marketable"],
    points:[treasuryRow("Total Marketable","2026-08-31",3.475),
      treasuryRow("Total Marketable","2026-07-31",3.525)]},
  "015":{available:true,recordDate:TREASURY_DATE,
    left:{query:"Treasury Bills",found:true,ambiguous:false,
      matchDescriptions:["Treasury Bills"],selected:treasuryRow("Treasury Bills",TREASURY_DATE,4.123)},
    right:{query:"Treasury Notes",found:true,ambiguous:false,
      matchDescriptions:["Treasury Notes"],selected:treasuryRow("Treasury Notes",TREASURY_DATE,3.456)}}
};
const BAD={
  "006":[
    e=>{e.company.name="";},
    e=>{e.company.cik="unverified";},
    e=>{e.filings[0].filingDate="2026-02-31";},
    e=>{e.filings[0].filingDate="2028-01-01";},
    e=>{e.filings[0].form="10-Q";e.filings[0].filingDate=null;}
  ],
  "013":[
    e=>{e.company.name="";},
    e=>{e.company.cik="unverified";},
    e=>{e.company.tickers=null;},
    e=>{e.found="false";},
    e=>{e.filings=[{form:"8-K",filingDate:"2026-02-31",accessionNumber:"1",primaryDocument:"a.htm"}];}
  ],
  "008":[
    e=>{e.recordDate="2026-02-31";},
    e=>{e.selected.averageInterestRatePercent=null;e.matches[0].averageInterestRatePercent=null;},
    e=>{e.selected.averageInterestRatePercent=Infinity;e.matches[0].averageInterestRatePercent=Infinity;},
    e=>{e.query="Wrong Security";},
    e=>{e.matches[0].averageInterestRatePercent=2;},
    e=>{e.matchCount=2;}
  ],
  "014":[
    e=>{e.points[0].averageInterestRatePercent=null;},
    e=>{e.points[0].recordDate="2028-01-01";},
    e=>{e.points[1].recordDate=e.points[0].recordDate;},
    e=>{e.matchDescriptions=["Different Category"];},
    e=>{e.query="Unrelated";},
    e=>{e.points=[];}
  ],
  "015":[
    e=>{e.recordDate="2028-01-01";},
    e=>{e.left.selected.recordDate="2026-08-31";},
    e=>{e.left.selected.averageInterestRatePercent=undefined;},
    e=>{e.right.query="Wrong";},
    e=>{e.right.selected.securityDescription="Different Category";},
    e=>{e.left.ambiguous=true;e.left.selected=null;e.left.matchDescriptions=["Treasury Bills","Bills Marketable"];}
  ]
};
function completedNegative(number){
  const e=clone(EVIDENCE[number]);
  if(number==="006"||number==="013"){
    e.found=false;e.company=null;e.filings=[];
  }else if(number==="008"){
    e.found=false;e.ambiguous=false;e.matchCount=0;e.matches=[];e.selected=null;
  }else if(number==="014"){
    e.found=false;e.ambiguous=false;e.matchDescriptions=[];e.points=[];
  }else if(number==="015"){
    e.left.found=false;e.left.ambiguous=false;e.left.matchDescriptions=[];e.left.selected=null;
  }
  return e;
}
function liveStubAdapters(number,shape){
  const untouched=async()=>{throw new Error("Unrelated adapter must not be called")};
  const calls={sec:0,treasury:0};
  const data=clone(shape);
  return {
    adapters:{
      sec:{async lookup(){calls.sec++;return clone(data);}},
      treasury:{
        async lookup(){calls.treasury++;return clone(data);},
        async history(){calls.treasury++;return clone(data);},
        async compare(){calls.treasury++;return clone(data);}
      },
      registry:{lookup:untouched},address:{compare:untouched},
      rdap:{lookup:untouched},ofac:{lookup:untouched}
    },
    calls
  };
}
async function invoke(number,evidence,implementation,queryOverride=null){
  const spec=specs.find(s=>s.number===number);
  const record=registry.products.find(r=>r.id===spec.id);
  const fake=liveStubAdapters(number,evidence);
  const payments={verify:0,settle:0,unexpected:0};
  const fetchImpl=async url=>{
    if(String(url).endsWith("/verify")){
      payments.verify++;
      return {ok:true,status:200,async json(){return {isValid:true}}};
    }
    if(String(url).endsWith("/settle")){
      payments.settle++;
      return {ok:true,status:200,async json(){return {success:true,transaction:"0xsynthetic"}}};
    }
    payments.unexpected++;
    throw new Error("Unapproved payment network destination");
  };
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:fake.adapters,fetchImpl,now:()=>NOW
  });
  const input={query:queryOverride??clone(spec.api.example_query),
    event:{headers:{"payment-signature":SIGNATURE}}};
  let response;
  if(implementation==="generated"){
    response=await runtime.handle({
      method:"GET",path:record.path,...input
    });
  }else{
    const factory=chooseFactory(HAND[spec.id],{kind:"handler",productId:spec.id});
    response=await factory({
      service:runtime.services[spec.id],
      publicApiBase:"https://candidate.example",fetchImpl
    })(input);
  }
  return {response,body:JSON.parse(response.body),payments,sourceCalls:fake.calls,price:record.price_usdc};
}
test("exact scope is five registered SEC/Treasury factory products",()=>{
  assert.deepEqual(specs.map(s=>s.number),NUMBERS);
  assert.equal(specs.length,5);
  assert.ok(specs.every(p=>registry.products.some(r=>r.id===p.id&&r.price_usdc===p.economics.price_usdc)));
});
test("strict calendar parsing rejects rollover and impossible future records",()=>{
  assert.equal(contract.canonicalDay("2026-02-31"),null);
  assert.equal(contract.canonicalDay("2026-13-01"),null);
  assert.equal(contract.validDay("2027-01-01",NOW),false);
  assert.equal(contract.validDay("2026-10-02",NOW),true);
  assert.equal(contract.finiteRate("3.5"),false);
  assert.equal(contract.finiteRate(NaN),false);
  assert.equal(contract.finiteRate(0),true);
});
for(const number of NUMBERS){
  test("Product "+number+" malformed available:true evidence is nonchargeable in both handlers",async()=>{
    for(const [i,mutate] of BAD[number].entries()){
      const bad=clone(EVIDENCE[number]);mutate(bad);
      for(const implementation of ["generated","handwritten"]){
        const x=await invoke(number,bad,implementation);
        assert.equal(x.response.statusCode,502,number+" variant "+i+" "+implementation);
        assert.equal(x.body.error,"required_source_unavailable");
        assert.equal(x.body.chargeable,false);
        assert.equal(x.payments.verify,1);
        assert.equal(x.payments.settle,0);
        assert.equal(x.payments.unexpected,0);
        assert.equal(x.body.sourceFailures.length,1);
        assert.equal(x.body.sourceFailures[0].detail,"SOURCE_CONTRACT_INVALID");
        const expectedSource=["006","013"].includes(number)?"sec_edgar":"treasury_fiscal_data";
        assert.equal(x.body.sourceFailures[0].source,expectedSource);
        assert.equal(x.response.headers["PAYMENT-RESPONSE"],undefined);
        assert.equal(x.response.headers["x402-settled"],undefined);
        assert.equal(x.sourceCalls[expectedSource==="sec_edgar"?"sec":"treasury"],1);
      }
    }
  });
  test("Product "+number+" completed good and not-found evidence retain paid semantics",async()=>{
    for(const implementation of ["generated","handwritten"]){
      for(const shape of [clone(EVIDENCE[number]),completedNegative(number)]){
        const x=await invoke(number,shape,implementation);
        assert.equal(x.response.statusCode,200,number+" "+implementation);
        assert.equal(x.payments.verify,1);
        assert.equal(x.payments.settle,1);
        assert.deepEqual(x.body.sourceFailures,[]);
        assert.equal(x.body.chargeable,true);
        assert.equal(x.body.paid,true);
        assert.equal(x.body.price,"$"+x.price);
        assert.equal(x.response.headers["x402-settled"],"true");
      }
    }
  });
}
test("SEC source identity requested by CIK cannot be silently swapped",async()=>{
  const e=clone(EVIDENCE["013"]);
  e.company.cik="0000000001";
  for(const implementation of ["generated","handwritten"]){
    const response=await invoke("013",e,implementation,{company:"Apple",cik:"320193"});
    assert.equal(response.response.statusCode,502);
    assert.equal(response.payments.settle,0);
  }
});
test("one authentic Treasury monthly history point remains a paid insufficient-history review",async()=>{
  const e=clone(EVIDENCE["014"]);
  e.points=e.points.slice(0,1);
  for(const implementation of ["generated","handwritten"]){
    const x=await invoke("014",e,implementation);
    assert.equal(x.response.statusCode,200);
    assert.equal(x.body.decision,"human_review");
    assert.equal(x.body.reasonCodes[0],"TREASURY_HISTORY_INSUFFICIENT");
    assert.equal(x.payments.settle,1);
  }
});
