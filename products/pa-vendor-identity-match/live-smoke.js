"use strict";

const assert = require("node:assert/strict");
const { createVendorIdentityService } = require("./service");
const {
  createPaRegistryAdapter,
  createCensusAddressAdapter,
  createRdapAdapter,
} = require("../../packages/sources/live-pa-identity");

async function main() {
  const service = createVendorIdentityService({
    registry: createPaRegistryAdapter(),
    address: createCensusAddressAdapter(),
    rdap: createRdapAdapter(),
  });

  const result = await service.check({
    company: "OpenAI OpCo",
    address: "600 North Second Street, Suite 401, Harrisburg, PA 17101",
    domain: "openai.com",
  });

  console.log(JSON.stringify({
    decision: result.decision,
    reasonCodes: result.reasonCodes,
    matchedEntity: result.matchedEntity,
    checks: result.checks,
    evidenceSummary: {
      registry: {
        available: result.evidence.registry.available,
        strongMatch: result.evidence.registry.strongMatch,
        candidateCount: result.evidence.registry.candidateCount,
        strongCandidateCount: result.evidence.registry.strongCandidateCount,
        matchScore: result.evidence.registry.matchScore,
      },
      address: {
        available: result.evidence.address.available,
        suppliedMatched: result.evidence.address.suppliedMatched,
        registryMatched: result.evidence.address.registryMatched,
        sameStreetNumber: result.evidence.address.sameStreetNumber,
        sameZip: result.evidence.address.sameZip,
        distanceMiles: result.evidence.address.distanceMiles,
      },
      rdap: {
        available: result.evidence.rdap.available,
        registered: result.evidence.rdap.registered,
        nameAligned: result.evidence.rdap.nameAligned,
        domain: result.evidence.rdap.domain,
      },
    },
  }, null, 2));

  if (Array.isArray(result.sourceFailures) && result.sourceFailures.length > 0) {
    console.log("TRANSIENT_SOURCE_BLOCKED", JSON.stringify(result.sourceFailures));
    return;
  }
  assert.equal(result.decision, "consistent");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.evidence.registry.strongMatch, true);
  assert.equal(result.evidence.address.sameStreetNumber, true);
  assert.equal(result.evidence.address.sameZip, true);
  assert.equal(result.evidence.rdap.registered, true);
  assert.equal(result.evidence.rdap.nameAligned, true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
