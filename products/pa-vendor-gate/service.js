"use strict";

const {
  normalizedEvidence,
  requireAdapter,
  sourceUnavailable,
} = require("../../packages/sources/contracts");
const { assessVendorIntake } = require("./decision");

function cleanRequired(value, field, minLength, maxLength) {
  if (typeof value !== "string") {
    const error = new TypeError(`${field} must be a string`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    const error = new RangeError(
      `${field} length must be ${minLength}-${maxLength}`
    );
    error.code = "INVALID_INPUT";
    throw error;
  }
  return cleaned;
}

function normalizeDomain(value) {
  let domain = cleanRequired(value, "domain", 3, 253).toLowerCase();
  if (domain.endsWith(".")) domain = domain.slice(0, -1);
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-")
    )
  ) {
    const error = new Error("domain must be a valid DNS name");
    error.code = "INVALID_INPUT";
    throw error;
  }
  return domain;
}

function validateVendorIntakeInput(input) {
  return {
    company: cleanRequired(input?.company, "company", 2, 120),
    address: cleanRequired(input?.address, "address", 5, 240),
    domain: normalizeDomain(input?.domain),
  };
}

function entityAddress(entity) {
  if (!entity || typeof entity !== "object") return null;
  const parts = [
    entity.address1,
    entity.address2,
    entity.city,
    entity.state,
    entity.zip,
  ].filter((value) => typeof value === "string" && value.trim());
  return parts.length ? parts.join(", ") : null;
}

function failureDetail(error) {
  return error?.code || error?.message || "lookup failed";
}

function createVendorIntakeService({
  registry,
  address,
  ofac,
  rdap,
  now = () => new Date().toISOString(),
}) {
  requireAdapter("registry", registry, "lookup");
  requireAdapter("address", address, "compare");
  requireAdapter("ofac", ofac, "lookup");
  requireAdapter("rdap", rdap, "lookup");

  return {
    async check(input) {
      const normalized = validateVendorIntakeInput(input);
      const sourceFailures = [];

      let registryEvidence;
      try {
        registryEvidence = normalizedEvidence(
          "pa_registry",
          await registry.lookup({ company: normalized.company })
        );
      } catch (error) {
        const detail = failureDetail(error);
        sourceFailures.push({ source: "pa_registry", detail });
        registryEvidence = sourceUnavailable("pa_registry", detail);
      }

      const legalName =
        registryEvidence.available === true &&
        registryEvidence.strongMatch === true &&
        registryEvidence.ambiguous !== true &&
        typeof registryEvidence.entity?.businessName === "string"
          ? registryEvidence.entity.businessName.trim()
          : "";
      const registeredAddress = entityAddress(registryEvidence.entity);

      const addressWork =
        legalName && registeredAddress
          ? address.compare({
              suppliedAddress: normalized.address,
              registryAddress: registeredAddress,
            })
          : Promise.resolve(
              sourceUnavailable(
                "census_address",
                "strong registry identity/address required"
              )
            );
      const ofacWork = legalName
        ? ofac.lookup({
            name: legalName,
            minScore: 90,
            limit: 3,
          })
        : Promise.resolve(
            sourceUnavailable(
              "ofac_sdn",
              "strong registry legal name required"
            )
          );
      const rdapWork = rdap.lookup({ domain: normalized.domain });

      const [addressResult, ofacResult, rdapResult] =
        await Promise.allSettled([addressWork, ofacWork, rdapWork]);

      function evidenceFrom(result, source) {
        if (result.status === "fulfilled") {
          return normalizedEvidence(source, result.value);
        }
        const detail = failureDetail(result.reason);
        sourceFailures.push({ source, detail });
        return sourceUnavailable(source, detail);
      }

      const addressEvidence = evidenceFrom(addressResult, "census_address");
      const rawOfacEvidence = evidenceFrom(ofacResult, "ofac_sdn");
      const ofacEvidence = {
        ...rawOfacEvidence,
        candidates: Array.isArray(rawOfacEvidence.candidates)
          ? rawOfacEvidence.candidates.map((candidate) => ({
              ...candidate,
              name: candidate?.name ?? candidate?.primaryName ?? null,
              sourceId: candidate?.sourceId ?? candidate?.uid ?? null,
            }))
          : [],
      };
      const rdapEvidence = evidenceFrom(rdapResult, "rdap");

      const checkedAt = now();
      const decision = assessVendorIntake(
        {
          registry: registryEvidence,
          address: addressEvidence,
          ofac: ofacEvidence,
          rdap: rdapEvidence,
        },
        checkedAt
      );

      return {
        ...decision,
        input: normalized,
        resolvedLegalName: legalName || null,
        sourceFailures,
        chargeable: sourceFailures.length === 0,
        evidence: {
          registry: registryEvidence,
          address: addressEvidence,
          ofac: ofacEvidence,
          rdap: rdapEvidence,
        },
        limitations: [
          "Proceed is a workflow signal, not legal or compliance approval.",
          "OFAC evidence is candidate-name screening only; a no-candidate result is not sanctions clearance.",
          "OFAC 50 Percent Rule ownership analysis is not included.",
          "Registry matching does not prove good standing, ownership, or authority to contract.",
          "Census matching does not prove control of an address.",
          "RDAP registration does not prove domain ownership or control.",
        ],
      };
    },
  };
}

module.exports = {
  createVendorIntakeService,
  entityAddress,
  normalizeDomain,
  validateVendorIntakeInput,
};
