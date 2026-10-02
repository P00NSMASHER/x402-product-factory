"use strict";

const POLICY = Object.freeze({
  censusMaxDistanceMiles: 0.25,
  ofacReviewScoreGte: 90,
});

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCandidates(candidates) {
  return Array.isArray(candidates) ? candidates : [];
}

function assessVendorIntake(evidence, checkedAt = new Date().toISOString()) {
  const registry = evidence?.registry || {};
  const address = evidence?.address || {};
  const ofac = evidence?.ofac || {};
  const rdap = evidence?.rdap || {};

  const checks = {};
  const reviewTriggers = [];

  if (registry.available !== true) {
    checks.registry = { status: "review", reason: "PA_REGISTRY_UNAVAILABLE" };
    reviewTriggers.push("PA_REGISTRY_UNAVAILABLE");
  } else if (registry.strongMatch !== true) {
    checks.registry = { status: "review", reason: "PA_REGISTRY_MATCH_UNCERTAIN" };
    reviewTriggers.push("PA_REGISTRY_MATCH_UNCERTAIN");
  } else {
    checks.registry = { status: "pass", reason: "PA_REGISTRY_STRONG_MATCH" };
  }

  const distance = address.distanceMiles;
  if (address.available !== true) {
    checks.address = { status: "review", reason: "ADDRESS_EVIDENCE_UNAVAILABLE" };
    reviewTriggers.push("ADDRESS_EVIDENCE_UNAVAILABLE");
  } else if (address.suppliedMatched !== true || address.registryMatched !== true) {
    checks.address = { status: "review", reason: "ADDRESS_NOT_BOTH_GEOCODED" };
    reviewTriggers.push("ADDRESS_NOT_BOTH_GEOCODED");
  } else if (!finiteNumber(distance)) {
    checks.address = { status: "review", reason: "ADDRESS_DISTANCE_UNAVAILABLE" };
    reviewTriggers.push("ADDRESS_DISTANCE_UNAVAILABLE");
  } else if (distance > POLICY.censusMaxDistanceMiles) {
    checks.address = {
      status: "review",
      reason: "ADDRESS_DISTANCE_EXCEEDS_THRESHOLD",
      distanceMiles: distance,
    };
    reviewTriggers.push("ADDRESS_DISTANCE_EXCEEDS_THRESHOLD");
  } else {
    checks.address = {
      status: "pass",
      reason: "ADDRESS_WITHIN_THRESHOLD",
      distanceMiles: distance,
    };
  }

  const candidates = normalizeCandidates(ofac.candidates);
  const reviewCandidates = candidates
    .filter((candidate) => finiteNumber(candidate?.score) && candidate.score >= POLICY.ofacReviewScoreGte)
    .map((candidate) => ({
      score: candidate.score,
      name: candidate.name ?? null,
      sourceId: candidate.sourceId ?? null,
    }));

  if (ofac.available !== true) {
    checks.ofac = { status: "review", reason: "OFAC_EVIDENCE_UNAVAILABLE" };
    reviewTriggers.push("OFAC_EVIDENCE_UNAVAILABLE");
  } else if (reviewCandidates.length > 0) {
    checks.ofac = {
      status: "review",
      reason: "OFAC_CANDIDATE_REQUIRES_REVIEW",
      candidates: reviewCandidates,
    };
    reviewTriggers.push("OFAC_CANDIDATE_REQUIRES_REVIEW");
  } else {
    checks.ofac = {
      status: "pass",
      reason: "NO_REVIEW_THRESHOLD_OFAC_CANDIDATE",
      candidateCount: candidates.length,
    };
  }

  if (rdap.available !== true) {
    checks.rdap = { status: "review", reason: "RDAP_EVIDENCE_UNAVAILABLE" };
    reviewTriggers.push("RDAP_EVIDENCE_UNAVAILABLE");
  } else if (rdap.registered !== true) {
    checks.rdap = { status: "review", reason: "DOMAIN_NOT_CONFIRMED_REGISTERED" };
    reviewTriggers.push("DOMAIN_NOT_CONFIRMED_REGISTERED");
  } else {
    checks.rdap = { status: "pass", reason: "DOMAIN_REGISTERED" };
  }

  const decision = reviewTriggers.length === 0 ? "proceed" : "human_review";

  return {
    decision,
    agentAction:
      decision === "proceed"
        ? "continue_vendor_intake"
        : "pause_and_request_human_review",
    reviewTriggers,
    checks,
    policy: {
      censusMaxDistanceMiles: POLICY.censusMaxDistanceMiles,
      ofacReviewScoreGte: POLICY.ofacReviewScoreGte,
      registryStrongMatchRequired: true,
      rdapRegisteredRequired: true,
      automaticReject: false,
    },
    entity: registry.entity ?? null,
    checkedAt,
  };
}

module.exports = { POLICY, assessVendorIntake };
