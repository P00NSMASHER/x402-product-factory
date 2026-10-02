"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assessVendorIntake } = require("./decision");

const PASSING = Object.freeze({
  registry: {
    available: true,
    strongMatch: true,
    entity: { businessName: "Example LLC", filingNumber: "123" },
  },
  address: {
    available: true,
    suppliedMatched: true,
    registryMatched: true,
    distanceMiles: 0.1,
  },
  ofac: {
    available: true,
    candidates: [],
  },
  rdap: {
    available: true,
    registered: true,
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("all required evidence passing returns proceed", () => {
  const result = assessVendorIntake(clone(PASSING), "2026-10-02T08:00:00.000Z");
  assert.equal(result.decision, "proceed");
  assert.equal(result.agentAction, "continue_vendor_intake");
  assert.deepEqual(result.reviewTriggers, []);
});

test("weak PA registry match requires human review", () => {
  const evidence = clone(PASSING);
  evidence.registry.strongMatch = false;
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "human_review");
  assert.ok(result.reviewTriggers.includes("PA_REGISTRY_MATCH_UNCERTAIN"));
});

test("address over 0.25 miles requires human review", () => {
  const evidence = clone(PASSING);
  evidence.address.distanceMiles = 0.251;
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "human_review");
  assert.ok(result.reviewTriggers.includes("ADDRESS_DISTANCE_EXCEEDS_THRESHOLD"));
});

test("address exactly at 0.25 miles passes", () => {
  const evidence = clone(PASSING);
  evidence.address.distanceMiles = 0.25;
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "proceed");
});

test("OFAC candidate score 90 requires human review", () => {
  const evidence = clone(PASSING);
  evidence.ofac.candidates = [{ score: 90, name: "Possible Match" }];
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "human_review");
  assert.ok(result.reviewTriggers.includes("OFAC_CANDIDATE_REQUIRES_REVIEW"));
});

test("OFAC candidate below 90 does not independently trigger review", () => {
  const evidence = clone(PASSING);
  evidence.ofac.candidates = [{ score: 89.99, name: "Below Threshold" }];
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "proceed");
});

test("unregistered domain requires human review", () => {
  const evidence = clone(PASSING);
  evidence.rdap.registered = false;
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "human_review");
  assert.ok(result.reviewTriggers.includes("DOMAIN_NOT_CONFIRMED_REGISTERED"));
});

test("unavailable required source never becomes an automatic rejection", () => {
  const evidence = clone(PASSING);
  evidence.ofac.available = false;
  const result = assessVendorIntake(evidence);
  assert.equal(result.decision, "human_review");
  assert.equal(result.policy.automaticReject, false);
  assert.equal(result.agentAction, "pause_and_request_human_review");
});

test("multiple uncertain checks return deterministic trigger order", () => {
  const evidence = clone(PASSING);
  evidence.registry.available = false;
  evidence.address.available = false;
  evidence.ofac.available = false;
  evidence.rdap.available = false;
  const result = assessVendorIntake(evidence);
  assert.deepEqual(result.reviewTriggers, [
    "PA_REGISTRY_UNAVAILABLE",
    "ADDRESS_EVIDENCE_UNAVAILABLE",
    "OFAC_EVIDENCE_UNAVAILABLE",
    "RDAP_EVIDENCE_UNAVAILABLE",
  ]);
});
