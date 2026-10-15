"use strict";

const assert = require("node:assert/strict");
const { createVendorIntakeService } = require("./service");
const {
  createPaRegistryAdapter,
  createCensusAddressAdapter,
  createRdapAdapter,
} = require("../../packages/sources/live-pa-identity");
const {
  createOfacNameAdapter,
} = require("../../packages/sources/ofac-name-screen");

async function main() {
  const service = createVendorIntakeService({
    registry: createPaRegistryAdapter(),
    address: createCensusAddressAdapter(),
    ofac: createOfacNameAdapter(),
    rdap: createRdapAdapter(),
  });

  const result = await service.check({
    company: "OpenAI OpCo",
    address: "600 North Second Street, Suite 401, Harrisburg, PA 17101",
    domain: "openai.com",
  });

  console.log(
    JSON.stringify(
      {
        decision: result.decision,
        chargeable: result.chargeable,
        resolvedLegalName: result.resolvedLegalName,
        reviewTriggers: result.reviewTriggers,
        sourceFailures: result.sourceFailures,
        checks: result.checks,
      },
      null,
      2
    )
  );

  if (result.sourceFailures.length > 0) {
    console.log("TRANSIENT_SOURCE_BLOCKED", JSON.stringify(result.sourceFailures));
    return;
  }

  assert.equal(result.decision, "proceed");
  assert.equal(result.chargeable, true);
  assert.equal(result.resolvedLegalName, "Openai Opco, Llc");
  assert.deepEqual(result.reviewTriggers, []);
  assert.deepEqual(
    Object.values(result.checks).map((check) => check.status),
    ["pass", "pass", "pass", "pass"]
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
