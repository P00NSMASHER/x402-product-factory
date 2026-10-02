"use strict";

const { assessVendorIdentity } = require("./decision");
const { sourceUnavailable, requireAdapter, normalizedEvidence } = require("../../packages/sources/contracts");

function cleanRequired(value, field, minLength, maxLength) {
  if (typeof value !== "string") {
    const error = new TypeError(`${field} must be a string`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  const cleaned = value.trim();
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    const error = new RangeError(`${field} length must be ${minLength}-${maxLength}`);
    error.code = "INVALID_INPUT";
    throw error;
  }
  return cleaned;
}

function validateVendorIdentityInput(input) {
  return {
    company: cleanRequired(input?.company, "company", 2, 120),
    address: cleanRequired(input?.address, "address", 5, 240),
    domain: cleanRequired(input?.domain, "domain", 3, 253).toLowerCase(),
  };
}

function entityAddress(entity) {
  if (!entity || typeof entity !== "object") return null;
  const parts = [entity.address1, entity.address2, entity.city, entity.state, entity.zip]
    .filter((value) => typeof value === "string" && value.trim());
  return parts.length ? parts.join(", ") : null;
}

function canonicalBusinessName(value) {
  let text = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const suffix = /\s+(?:L\s+L\s+C|LLC|INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LIMITED|LTD|L\s+P|LP|L\s+L\s+P|LLP|P\s+C|PC)$/;
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(suffix, "").trim();
  }
  return text;
}

function domainNameAligned(domain, vendorName) {
  const vendorCanonical = canonicalBusinessName(vendorName);
  const vendorCompact = vendorCanonical.replace(/[^A-Z0-9]/g, "").toLowerCase();
  const vendorTokens = vendorCanonical.toLowerCase().split(" ")
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3);
  const ignored = new Set(["www","api","app","portal","secure","vendor","vendors"]);
  const hostTokens = domain.toLowerCase().split(".").slice(0,-1)
    .map((label) => label.replace(/[^a-z0-9]/g, ""))
    .filter((label) => label.length >= 3 && !ignored.has(label));
  return hostTokens.some((host) => {
    if (host === vendorCompact) return true;
    if (host.length >= 4 && vendorCompact.length >= 4 && (host.includes(vendorCompact) || vendorCompact.includes(host))) return true;
    return vendorTokens.some((token) => host === token || (host.length >= 4 && token.length >= 4 && (host.includes(token) || token.includes(host))));
  });
}

function createVendorIdentityService({ registry, address, rdap, now = () => new Date().toISOString() }) {
  requireAdapter("registry", registry, "lookup");
  requireAdapter("address", address, "compare");
  requireAdapter("rdap", rdap, "lookup");

  async function check(input) {
    const normalized = validateVendorIdentityInput(input);
    const company = normalized.company;
    const suppliedAddress = normalized.address;
    const domain = normalized.domain;

    const sourceFailures = [];

    let registryEvidence;
    try {
      registryEvidence = normalizedEvidence("pa_registry", await registry.lookup({ company }));
    } catch (error) {
      const detail = error?.code || error?.message || "lookup failed";
      sourceFailures.push({ source: "pa_registry", detail });
      registryEvidence = sourceUnavailable("pa_registry", detail);
    }

    const matchedEntity = registryEvidence?.entity ?? null;
    const registeredAddress = entityAddress(matchedEntity);
    let addressEvidence;
    if (registryEvidence.available !== true || registryEvidence.strongMatch !== true || !registeredAddress) {
      addressEvidence = sourceUnavailable("census_address", "registry identity/address unavailable for comparison");
    } else {
      try {
        addressEvidence = normalizedEvidence("census_address", await address.compare({ suppliedAddress, registryAddress: registeredAddress }));
      } catch (error) {
        const detail = error?.code || error?.message || "comparison failed";
        sourceFailures.push({ source: "census_address", detail });
        addressEvidence = sourceUnavailable("census_address", detail);
      }
    }

    let rdapEvidence;
    try {
      rdapEvidence = normalizedEvidence("rdap", await rdap.lookup({ domain }));
      rdapEvidence.nameAligned =
        rdapEvidence.available === true &&
        rdapEvidence.registered === true &&
        domainNameAligned(domain, company);
    } catch (error) {
      const detail = error?.code || error?.message || "lookup failed";
      sourceFailures.push({ source: "rdap", detail });
      rdapEvidence = sourceUnavailable("rdap", detail);
    }

    const checkedAt = now();
    const decision = assessVendorIdentity({ registry: registryEvidence, address: addressEvidence, rdap: rdapEvidence }, checkedAt);
    return {
      ...decision,
      input: { company, address: suppliedAddress, domain },
      sourceFailures,
      chargeable: sourceFailures.length === 0,
      evidence: { registry: registryEvidence, address: addressEvidence, rdap: rdapEvidence }
    };
  }

  return { check };
}

module.exports = {
  createVendorIdentityService,
  validateVendorIdentityInput,
  entityAddress,
  canonicalBusinessName,
  domainNameAligned,
};
