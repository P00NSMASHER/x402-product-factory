"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createVendorIdentityService, entityAddress, domainNameAligned } = require("./service");

function adapters(overrides = {}) {
  return {
    registry: overrides.registry || {
      async lookup({ company }) {
        return {
          available: true,
          strongMatch: true,
          entity: { businessName: company, filingNumber: "123", address1: "100 Market St", address2: null, city: "Pottsville", state: "PA", zip: "17901" }
        };
      }
    },
    address: overrides.address || {
      async compare() {
        return { available: true, suppliedMatched: true, registryMatched: true, sameStreetNumber: true, sameZip: true, distanceMiles: 0.01 };
      }
    },
    rdap: overrides.rdap || {
      async lookup({ domain }) {
        return { available: true, registered: true, domain };
      }
    }
  };
}

test("entityAddress builds comparison string", () => {
  assert.equal(entityAddress({address1:"100 Market St",address2:"Suite 2",city:"Pottsville",state:"PA",zip:"17901"}),"100 Market St, Suite 2, Pottsville, PA, 17901");
});

test("domainNameAligned accepts plausible company domain and rejects unrelated domain", () => {
  assert.equal(domainNameAligned("example.com","Example LLC"),true);
  assert.equal(domainNameAligned("totallydifferent.com","Example LLC"),false);
});

test("service composes passing evidence into consistent", async () => {
  const service=createVendorIdentityService({...adapters(),now:()=> "2026-10-02T09:00:00.000Z"});
  const result=await service.check({company:"Example LLC",address:"100 Market St, Pottsville, PA 17901",domain:"example.com"});
  assert.equal(result.decision,"consistent");
  assert.equal(result.evidence.rdap.nameAligned,true);
});

test("unrelated but registered domain requires human review", async () => {
  const service=createVendorIdentityService({...adapters(),now:()=> "2026-10-02T09:00:00.000Z"});
  const result=await service.check({company:"Example LLC",address:"100 Market St, Pottsville, PA 17901",domain:"totallydifferent.com"});
  assert.equal(result.decision,"human_review");
  assert.ok(result.reasonCodes.includes("DOMAIN_VENDOR_NAME_MISMATCH"));
});

test("registry adapter failure becomes human review without throwing", async () => {
  const service=createVendorIdentityService({...adapters({registry:{async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}}})});
  const result=await service.check({company:"Example LLC",address:"100 Market St, Pottsville, PA 17901",domain:"example.com"});
  assert.equal(result.decision,"human_review");
  assert.ok(result.reasonCodes.includes("PA_REGISTRY_UNAVAILABLE"));
  assert.ok(result.reasonCodes.includes("ADDRESS_EVIDENCE_UNAVAILABLE"));
});

test("invalid input is rejected before adapter work", async () => {
  let called=0;
  const base=adapters();
  const service=createVendorIdentityService({registry:{async lookup(){called++;return base.registry.lookup({company:"x"});}},address:base.address,rdap:base.rdap});
  await assert.rejects(()=>service.check({company:" ",address:"x",domain:"x"}),(e)=>e.code==="INVALID_INPUT");
  assert.equal(called,0);
});
