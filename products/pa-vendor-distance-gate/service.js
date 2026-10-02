"use strict";
const {requireAdapter,sourceUnavailable,normalizedEvidence}=require("../../packages/sources/contracts");
const {entityAddress}=require("../pa-vendor-identity-match/service");
const {assessVendorDistance}=require("./decision");
function validateCompany(value){const company=String(value??"").trim().replace(/\s+/g," ");if(company.length<2||company.length>120){const e=new Error("company length must be 2-120");e.code="INVALID_INPUT";throw e;}return company;}
function validateOrigin(value){const address=String(value??"").trim().replace(/\s+/g," ");if(address.length<6||address.length>240){const e=new Error("originAddress length must be 6-240");e.code="INVALID_INPUT";throw e;}return address;}
function parseDistance(value){const raw=String(value??"").trim();if(!raw){const e=new Error("maxDistanceMiles is required");e.code="INVALID_INPUT";throw e;}const n=Number(raw);if(!Number.isFinite(n)||n<0.1||n>1000){const e=new Error("maxDistanceMiles must be between 0.1 and 1000");e.code="INVALID_INPUT";throw e;}return Number(n.toFixed(3));}
function validateVendorDistanceInput(input){return{company:validateCompany(input?.company),originAddress:validateOrigin(input?.originAddress),maxDistanceMiles:parseDistance(input?.maxDistanceMiles)};}
function createVendorDistanceService({registry,address,now=()=>new Date().toISOString()}){
 requireAdapter("registry",registry,"lookup");requireAdapter("address",address,"compare");
 return{async check(input){
  const normalized=validateVendorDistanceInput(input),sourceFailures=[];
  let registryEvidence;
  try{registryEvidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));}
  catch(error){const detail=error?.code||error?.message||"lookup failed";sourceFailures.push({source:"pa_registry",detail});registryEvidence=sourceUnavailable("pa_registry",detail);}
  const registeredAddress=entityAddress(registryEvidence?.entity??null);
  let addressEvidence;
  if(registryEvidence.available!==true||registryEvidence.strongMatch!==true||!registeredAddress){
    addressEvidence=sourceUnavailable("census_address","registry identity/address unavailable for distance comparison");
  }else{
    try{addressEvidence=normalizedEvidence("census_address",await address.compare({suppliedAddress:normalized.originAddress,registryAddress:registeredAddress}));}
    catch(error){const detail=error?.code||error?.message||"comparison failed";sourceFailures.push({source:"census_address",detail});addressEvidence=sourceUnavailable("census_address",detail);}
  }
  const result=assessVendorDistance({registry:registryEvidence,address:addressEvidence},normalized.maxDistanceMiles,now());
  return{...result,input:normalized,sourceFailures,chargeable:sourceFailures.length===0,evidence:{registry:registryEvidence,address:addressEvidence}};
 }};
}
module.exports={parseDistance,validateVendorDistanceInput,createVendorDistanceService};
