"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createVendorIntakeService,
  validateVendorIntakeInput,
} = require("./service");

function adapters() {
  return {
    registry: {
      async lookup() {
        return {
          available: true,
          strongMatch: true,
          ambiguous: false,
          entity: {
            businessName: "Example Holdings, LLC",
            filingNumber: "123",
            address1: "100 Market St",
            city: "Harrisburg",
            state: "PA",
            zip: "17101",
          },
        };
      },
    },
    address: {
      async compare() {
        return {
          available: true,
          suppliedMatched: true,
          registryMatched: true,
          distanceMiles: 0.1,
        };
      },
    },
    ofac: {
      async lookup() {
        return { available: true, candidates: [] };
      },
    },
    rdap: {
      async lookup({ domain }) {
        return { available: true, registered: true, domain };
      },
    },
  };
}

const INPUT = Object.freeze({
  company: "Example Holdings",
  address: "100 Market St, Harrisburg, PA 17101",
  domain: "example.com",
});

test("service composes all four required sources into proceed", async () => {
  const calls = {};
  const sourceAdapters = adapters();
  sourceAdapters.address.compare = async (input) => {
    calls.address = input;
    return {
      available: true,
      suppliedMatched: true,
      registryMatched: true,
      distanceMiles: 0.25,
    };
  };
  sourceAdapters.ofac.lookup = async (input) => {
    calls.ofac = input;
    return { available: true, candidates: [] };
  };

  const service = createVendorIntakeService({
    ...sourceAdapters,
    now: () => "2026-10-02T12:00:00.000Z",
  });
  const result = await service.check(INPUT);

  assert.equal(result.decision, "proceed");
  assert.equal(result.chargeable, true);
  assert.equal(result.resolvedLegalName, "Example Holdings, LLC");
  assert.equal(result.checkedAt, "2026-10-02T12:00:00.000Z");
  assert.equal(calls.address.registryAddress, "100 Market St, Harrisburg, PA, 17101");
  assert.deepEqual(calls.ofac, {
    name: "Example Holdings, LLC",
    minScore: 90,
    limit: 3,
  });
});

test("completed OFAC candidate produces a chargeable human review", async () => {
  const sourceAdapters = adapters();
  sourceAdapters.ofac.lookup = async () => ({
    available: true,
    candidates: [{ uid: "42", primaryName: "Example Holdings", score: 90 }],
  });

  const result = await createVendorIntakeService(sourceAdapters).check(INPUT);

  assert.equal(result.decision, "human_review");
  assert.equal(result.chargeable, true);
  assert.equal(result.checks.ofac.candidates[0].name, "Example Holdings");
  assert.equal(result.checks.ofac.candidates[0].sourceId, "42");
});

test("required-source transport failure is non-chargeable", async () => {
  const sourceAdapters = adapters();
  sourceAdapters.rdap.lookup = async () => {
    const error = new Error("timeout");
    error.code = "SOURCE_TIMEOUT";
    throw error;
  };

  const result = await createVendorIntakeService(sourceAdapters).check(INPUT);

  assert.equal(result.decision, "human_review");
  assert.equal(result.chargeable, false);
  assert.deepEqual(result.sourceFailures, [
    { source: "rdap", detail: "SOURCE_TIMEOUT" },
  ]);
  assert.ok(result.reviewTriggers.includes("RDAP_EVIDENCE_UNAVAILABLE"));
});

test("uncertain registry identity skips dependent checks deterministically", async () => {
  const sourceAdapters = adapters();
  let dependentCalls = 0;
  sourceAdapters.registry.lookup = async () => ({
    available: true,
    strongMatch: false,
    ambiguous: true,
    entity: null,
  });
  sourceAdapters.address.compare = async () => {
    dependentCalls += 1;
    return {};
  };
  sourceAdapters.ofac.lookup = async () => {
    dependentCalls += 1;
    return {};
  };

  const result = await createVendorIntakeService(sourceAdapters).check(INPUT);

  assert.equal(dependentCalls, 0);
  assert.equal(result.decision, "human_review");
  assert.equal(result.chargeable, true);
  assert.deepEqual(result.reviewTriggers.slice(0, 3), [
    "PA_REGISTRY_MATCH_UNCERTAIN",
    "ADDRESS_EVIDENCE_UNAVAILABLE",
    "OFAC_EVIDENCE_UNAVAILABLE",
  ]);
});

test("invalid input fails before any source work", async () => {
  const sourceAdapters = adapters();
  let calls = 0;
  sourceAdapters.registry.lookup = async () => {
    calls += 1;
    return {};
  };
  const service = createVendorIntakeService(sourceAdapters);

  await assert.rejects(
    () => service.check({ ...INPUT, domain: "not a domain" }),
    (error) => error.code === "INVALID_INPUT"
  );
  assert.equal(calls, 0);
});

test("input validation normalizes whitespace and a trailing DNS dot", () => {
  assert.deepEqual(
    validateVendorIntakeInput({
      company: "  Example   Holdings  ",
      address: " 100   Market St ",
      domain: "EXAMPLE.COM.",
    }),
    {
      company: "Example Holdings",
      address: "100 Market St",
      domain: "example.com",
    }
  );
});
