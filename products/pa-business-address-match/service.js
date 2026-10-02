"use strict";

const {assessBusinessAddress}=require("./decision");
const {sourceUnavailable,requireAdapter,normalizedEvidence}=require("../../packages/sources/contracts");
const {validateVendorIdentityInput,entityAddress}=require("../pa-vendor-identity-match/service");

function validateBusinessAddressInput(input){
  const normalized=validateVendorIdentityInput({
    company:input?.company,
    address:input?.address,
    domain:"placeholder.example"
  });
  return {company:normalized.company,address:normalized.address};
}

function createBusinessAddressService({registry,address,now=()=>new Date().toISOString()}){
  requireAdapter("registry",registry,"lookup");
  requireAdapter("address",address,"compare");

  async function check(input){
    const normalized=validateBusinessAddressInput(input);
    const sourceFailures=[];

    let registryEvidence;
    try{
      registryEvidence=normalizedEvidence("pa_registry",await registry.lookup({company:normalized.company}));
    }catch(error){
      const detail=error?.code||error?.message||"lookup failed";
      sourceFailures.push({source:"pa_registry",detail});
      registryEvidence=sourceUnavailable("pa_registry",detail);
    }

    let addressEvidence;
    const registeredAddress=entityAddress(registryEvidence?.entity??null);
    if(registryEvidence.available!==true||registryEvidence.strongMatch!==true||!registeredAddress){
      addressEvidence=sourceUnavailable("census_address","registry identity/address unavailable for comparison");
    }else{
      try{
        addressEvidence=normalizedEvidence("census_address",await address.compare({
          suppliedAddress:normalized.address,
          registryAddress:registeredAddress
        }));
      }catch(error){
        const detail=error?.code||error?.message||"comparison failed";
        sourceFailures.push({source:"census_address",detail});
        addressEvidence=sourceUnavailable("census_address",detail);
      }
    }

    const decision=assessBusinessAddress({registry:registryEvidence,address:addressEvidence},now());
    return {
      ...decision,
      input:normalized,
      sourceFailures,
      chargeable:sourceFailures.length===0,
      evidence:{registry:registryEvidence,address:addressEvidence}
    };
  }

  return {check};
}

module.exports={validateBusinessAddressInput,createBusinessAddressService};
