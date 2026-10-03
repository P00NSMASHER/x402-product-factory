"use strict";

const BASE="https://bvjtimsalbzkmulyinpg.supabase.co/functions/v1/x402-data-tools";
const NETWORK="eip155:8453";
const USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO="0x708f7b52b56eafd7fc7752ed732914021";
const AMOUNT="5000";
const EXPECTED=[
  ["/api/sec-filings","ticker=AAPL&limit=1"],
  ["/api/ofac-sdn-screen","name=VLADIMIR%20PUTIN&limit=1&minScore=85"],
  ["/api/us-address-geocode","address=4600%20Silver%20Hill%20Rd%2C%20Washington%2C%20DC%2020233"],
  ["/api/domain-rdap","domain=example.com"],
  ["/api/treasury-average-rates","security=Total%20Marketable"],
];

function decodeBase64Json(value){
  if(typeof value!=="string"||!value.trim())return null;
  try{
    let normalized=value.replace(/-/g,"+").replace(/_/g,"/");
    while(normalized.length%4)normalized+="=";
    return JSON.parse(Buffer.from(normalized,"base64").toString("utf8"));
  }catch{return null;}
}

function assert(condition,message){
  if(!condition)throw new Error(message);
}

async function jsonGet(path){
  const response=await fetch(BASE+path,{headers:{accept:"application/json"}});
  const text=await response.text();
  let body=null;
  try{body=JSON.parse(text);}catch{}
  return {response,body,text};
}

async function main(){
  const summary={base:BASE,verifiedAt:new Date().toISOString(),routes:[]};

  const root=await jsonGet("");
  assert(root.response.status===200,"root must return 200");
  assert(root.body?.service==="Agent Data Tools x402","root service mismatch");
  assert(root.body?.network===NETWORK,"root network mismatch");

  const health=await jsonGet("/health");
  assert(health.response.status===200,"health must return 200");
  assert(health.body?.ok===true,"health ok must be true");
  assert(health.body?.routeCount===EXPECTED.length,"health route count mismatch");

  const catalogResult=await jsonGet("/.well-known/x402");
  assert(catalogResult.response.status===200,"catalog must return 200");
  const catalog=catalogResult.body;
  assert(catalog?.x402Version===2,"catalog x402Version mismatch");
  assert(Array.isArray(catalog?.resources),"catalog resources missing");
  assert(catalog.resources.length===EXPECTED.length,"catalog route count mismatch");

  const openapiResult=await jsonGet("/openapi.json");
  assert(openapiResult.response.status===200,"openapi must return 200");
  const openapi=openapiResult.body;
  assert(openapi?.openapi==="3.1.0","openapi version mismatch");
  assert(openapi?.servers?.[0]?.url===BASE,"openapi server mismatch");

  for(const [path,query] of EXPECTED){
    const resource=catalog.resources.find(item=>new URL(item.resource).pathname.endsWith(path));
    assert(resource,"catalog missing "+path);
    assert(resource.resource===BASE+path,"resource URL drift for "+path);
    assert(resource.price==="$0.005","catalog price drift for "+path);
    const accept=resource.accepts?.[0];
    assert(accept?.scheme==="exact","scheme drift for "+path);
    assert(accept?.network===NETWORK,"network drift for "+path);
    assert(accept?.amount===AMOUNT,"amount drift for "+path);
    assert(String(accept?.asset).toLowerCase()===USDC.toLowerCase(),"asset drift for "+path);
    assert(String(accept?.payTo).toLowerCase()===PAY_TO.toLowerCase(),"payTo drift for "+path);
    assert(accept?.extra?.name==="USD Coin","EIP-712 name drift for "+path);
    assert(accept?.extra?.version==="2","EIP-712 version drift for "+path);

    const operation=openapi?.paths?.[path]?.get;
    assert(operation,"openapi missing "+path);
    assert(operation?.["x-payment-info"]?.price?.amount==="0.005000","openapi price drift for "+path);
    assert(Array.isArray(operation?.["x-payment-info"]?.protocols)&&operation["x-payment-info"].protocols.some(item=>item?.x402),"openapi x402 protocol missing for "+path);

    const response=await fetch(BASE+path+"?"+query,{headers:{accept:"application/json"}});
    const bodyText=await response.text();
    let body=null;
    try{body=JSON.parse(bodyText);}catch{}
    assert(response.status===402,"unpaid status drift for "+path+": "+response.status);
    assert(body?.x402Version===2,"unpaid x402Version drift for "+path);
    const bodyAccept=body?.accepts?.[0];
    assert(bodyAccept?.network===NETWORK,"unpaid network drift for "+path);
    assert(bodyAccept?.amount===AMOUNT,"unpaid amount drift for "+path);
    assert(String(bodyAccept?.asset).toLowerCase()===USDC.toLowerCase(),"unpaid asset drift for "+path);
    assert(String(bodyAccept?.payTo).toLowerCase()===PAY_TO.toLowerCase(),"unpaid payTo drift for "+path);
    assert(bodyAccept?.extra?.name==="USD Coin","unpaid EIP-712 name drift for "+path);
    assert(bodyAccept?.extra?.version==="2","unpaid EIP-712 version drift for "+path);

    const headerDoc=decodeBase64Json(response.headers.get("payment-required"));
    assert(headerDoc?.x402Version===2,"PAYMENT-REQUIRED decode failed for "+path);
    assert(headerDoc?.resource?.url===BASE+path,"PAYMENT-REQUIRED resource drift for "+path);
    assert(headerDoc?.extensions?.bazaar,"Bazaar extension missing for "+path);

    const options=await fetch(BASE+path,{
      method:"OPTIONS",
      headers:{
        origin:"https://agent.example",
        "access-control-request-method":"GET",
        "access-control-request-headers":"PAYMENT-SIGNATURE"
      }
    });
    assert(options.status===204,"OPTIONS status drift for "+path);
    assert(/GET/i.test(options.headers.get("access-control-allow-methods")||""),"OPTIONS GET missing for "+path);
    assert(/PAYMENT-SIGNATURE/i.test(options.headers.get("access-control-allow-headers")||""),"OPTIONS payment header missing for "+path);

    summary.routes.push({path,status:response.status,price:resource.price,network:accept.network,bazaar:true});
  }

  console.log(JSON.stringify(summary,null,2));
}

main().catch(error=>{
  console.error(error?.stack||error);
  process.exitCode=1;
});
