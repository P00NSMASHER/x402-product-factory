"use strict";

const PA_SOURCE = "https://data.pa.gov/resource/xvd7-5r2c.json";
const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const IANA_RDAP_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const SOURCE_TIMEOUT_MS = 10000;

function canonicalBusinessName(value) {
  let text = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = /\s+(?:L\s+L\s+C|LLC|INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LIMITED|LTD|L\s+P|LP|L\s+L\s+P|LLP|P\s+C|PC)$/;
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(suffix, "").trim();
  }
  return text;
}

function matchScore(name, query) {
  const candidate = canonicalBusinessName(name);
  const wanted = canonicalBusinessName(query);
  if (candidate === wanted) return 0;
  if (candidate.startsWith(wanted + " ")) return 1;
  if ((" " + candidate + " ").includes(" " + wanted + " ")) return 2;
  if (candidate.replaceAll(" ", "").includes(wanted.replaceAll(" ", ""))) return 3;
  return 4;
}

function normalizeCompany(raw) {
  const value = String(raw || "")
    .trim()
    .replace(/[%_]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if ([...value].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length < 2) {
    const error = new Error("company_too_short");
    error.code = "INVALID_INPUT";
    throw error;
  }
  if (value.length > 120) {
    const error = new Error("company_too_long");
    error.code = "INVALID_INPUT";
    throw error;
  }
  return value;
}

async function fetchResponse(fetchImpl, url, init = {}, timeoutMs = SOURCE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || error?.code === 20) {
      const timeout = new Error("source_timeout");
      timeout.code = "SOURCE_TIMEOUT";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(fetchImpl, url, init = {}, timeoutMs = SOURCE_TIMEOUT_MS) {
  const response = await fetchResponse(fetchImpl, url, init, timeoutMs);
  if (!response || response.ok !== true) {
    const error = new Error("source_http_" + (response?.status ?? "unknown"));
    error.code = "SOURCE_HTTP_ERROR";
    throw error;
  }
  return await response.json();
}

function entityProjection() {
  return [
    "business_name",
    "filing_number",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip",
    "typeofbusinessregistration",
    "creationdate",
    "shortcountyname",
    "county_code",
  ].join(",");
}

function mapEntity(row) {
  return {
    businessName: row.business_name == null ? null : String(row.business_name),
    filingNumber: row.filing_number == null ? null : String(row.filing_number),
    registrationType: row.typeofbusinessregistration == null ? null : String(row.typeofbusinessregistration),
    creationDate:
      row.creationdate == null || String(row.creationdate).startsWith("1753-01-01")
        ? null
        : String(row.creationdate).slice(0, 10),
    address1: row.address_line1 == null ? null : String(row.address_line1),
    address2: row.address_line2 == null ? null : String(row.address_line2),
    city: row.city == null ? null : String(row.city),
    state: row.state == null ? null : String(row.state),
    zip: row.zip == null ? null : String(row.zip),
    county: row.shortcountyname == null ? null : String(row.shortcountyname),
    countyCode: row.county_code == null ? null : String(row.county_code),
  };
}

function entityAddress(entity) {
  const parts = [entity?.address1, entity?.address2, entity?.city, entity?.state, entity?.zip]
    .filter((value) => typeof value === "string" && value.trim().length > 0);
  return parts.length ? parts.join(", ") : null;
}

function dedupeAndRank(rows, query, limit) {
  const unique = new Map();
  for (const row of rows) {
    const key =
      row.filingNumber ||
      [row.businessName || "", row.address1 || "", row.city || ""].join("|");
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()]
    .sort((a, b) => {
      const an = a.businessName || "";
      const bn = b.businessName || "";
      const score = matchScore(an, query) - matchScore(bn, query);
      if (score !== 0) return score;
      if (an.length !== bn.length) return an.length - bn.length;
      return an.localeCompare(bn);
    })
    .slice(0, limit);
}

function isRetryablePaSourceError(error) {
  if (error?.code === "SOURCE_TIMEOUT") return true;
  if (error?.code !== "SOURCE_HTTP_ERROR") return false;
  const match = String(error?.message || "").match(/source_http_(\d+)/);
  const status = match ? Number(match[1]) : null;
  return status === 429 || (Number.isInteger(status) && status >= 500);
}

function createPaRegistryAdapter({
  fetchImpl = fetch,
  timeoutMs = SOURCE_TIMEOUT_MS,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryDelayMs = 150,
} = {}) {
  async function candidates(query, mode) {
    const escaped = query.toUpperCase().replaceAll("'", "''");
    const pattern = mode === "starts" ? escaped + "%" : "%" + escaped + "%";
    const url = new URL(PA_SOURCE);
    url.searchParams.set("$select", "distinct " + entityProjection());
    url.searchParams.set("$where", "upper(business_name) like '" + pattern + "'");
    url.searchParams.set("$limit", "100");
    let rows;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        rows = await fetchJson(
          fetchImpl,
          url.toString(),
          { headers: { "user-agent": "x402-product-0.1" } },
          timeoutMs
        );
        break;
      } catch (error) {
        if (attempt === 1 || !isRetryablePaSourceError(error)) throw error;
        if (retryDelayMs > 0) await sleepImpl(retryDelayMs);
      }
    }
    if (!Array.isArray(rows)) {
      const error = new Error("pa_registry_invalid_json");
      error.code = "SOURCE_CONTRACT_INVALID";
      throw error;
    }
    return rows.map(mapEntity);
  }

  return {
    async lookup({ company }) {
      const query = normalizeCompany(company);
      const starts = await candidates(query, "starts");
      const rows =
        starts.length >= 3
          ? starts
          : [...starts, ...(await candidates(query, "contains"))];
      const ranked = dedupeAndRank(rows, query, 3);
      const entity = ranked[0] || null;
      const score = entity?.businessName
        ? matchScore(entity.businessName, query)
        : null;
      const strongCandidates = ranked.filter((candidate) =>
        candidate.businessName
          ? matchScore(candidate.businessName, query) <= 1
          : false
      );
      const ambiguous = strongCandidates.length > 1;
      const complete = Boolean(
        entity?.businessName &&
          entity?.filingNumber &&
          entity?.registrationType &&
          entityAddress(entity)
      );
      return {
        available: true,
        strongMatch: score != null && score <= 1 && !ambiguous && complete,
        entity,
        candidateCount: ranked.length,
        strongCandidateCount: strongCandidates.length,
        ambiguous,
        matchScore: score,
        identityComplete: complete,
        provenance: {
          source: "Pennsylvania Department of State via data.pa.gov",
          url: PA_SOURCE,
        },
      };
    },
  };
}

function normalizeAddress(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function addressIdentity(value) {
  if (typeof value !== "string") return { streetNumber: null, zip: null };
  const text = value.toUpperCase().trim();
  return {
    streetNumber: text.match(/^\s*(\d+[A-Z-]?)/)?.[1] ?? null,
    zip: text.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? null,
  };
}

function distanceMiles(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const radius = 3958.7613;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function censusResultFromRaw(address, raw) {
  const match = raw?.result?.addressMatches?.[0];
  if (!match) {
    return {
      input: address,
      matched: false,
      matchedAddress: null,
      coordinates: null,
      source: "U.S. Census Bureau Geocoding Services",
    };
  }
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);
  return {
    input: address,
    matched: true,
    matchedAddress:
      typeof match.matchedAddress === "string" ? match.matchedAddress : null,
    coordinates:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null,
    source: "U.S. Census Bureau Geocoding Services",
  };
}

function censusPayloadComplete(payload, requestedAddress) {
  if (!payload || typeof payload !== "object") return false;
  if (normalizeAddress(payload.input) !== normalizeAddress(requestedAddress))
    return false;
  if (
    typeof payload.source !== "string" ||
    !/Census Bureau/i.test(payload.source)
  )
    return false;
  if (typeof payload.matched !== "boolean") return false;
  if (payload.matched === true) {
    if (
      typeof payload.matchedAddress !== "string" ||
      !payload.matchedAddress.trim()
    )
      return false;
    if (
      !payload.coordinates ||
      !Number.isFinite(Number(payload.coordinates.latitude)) ||
      !Number.isFinite(Number(payload.coordinates.longitude))
    )
      return false;
  }
  return true;
}

function createCensusAddressAdapter({
  fetchImpl = fetch,
  timeoutMs = SOURCE_TIMEOUT_MS,
} = {}) {
  async function geocode(address) {
    const url = new URL(CENSUS_GEOCODER);
    url.searchParams.set("address", address);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("vintage", "Current_Current");
    url.searchParams.set("format", "json");
    const raw = await fetchJson(
      fetchImpl,
      url.toString(),
      { headers: { accept: "application/json" } },
      timeoutMs
    );
    return censusResultFromRaw(address, raw);
  }

  return {
    async compare({ suppliedAddress, registryAddress }) {
      const [supplied, registered] = await Promise.all([
        geocode(suppliedAddress),
        geocode(registryAddress),
      ]);
      if (
        !censusPayloadComplete(supplied, suppliedAddress) ||
        !censusPayloadComplete(registered, registryAddress)
      ) {
        const error = new Error("census_contract_incomplete");
        error.code = "SOURCE_CONTRACT_INVALID";
        throw error;
      }
      const suppliedId = addressIdentity(supplied.matchedAddress);
      const registryId = addressIdentity(registered.matchedAddress);
      const bothMatched =
        supplied.matched === true && registered.matched === true;
      const distance =
        supplied.coordinates && registered.coordinates
          ? Number(
              distanceMiles(
                supplied.coordinates,
                registered.coordinates
              ).toFixed(3)
            )
          : null;
      return {
        available: true,
        suppliedMatched: supplied.matched === true,
        registryMatched: registered.matched === true,
        sameStreetNumber:
          bothMatched &&
          suppliedId.streetNumber != null &&
          suppliedId.streetNumber === registryId.streetNumber,
        sameZip:
          bothMatched &&
          suppliedId.zip != null &&
          suppliedId.zip === registryId.zip,
        distanceMiles: distance,
        suppliedMatchedAddress: supplied.matchedAddress ?? null,
        registryMatchedAddress: registered.matchedAddress ?? null,
        provenance: {
          source: "U.S. Census Bureau Geocoding Services",
          url: CENSUS_GEOCODER,
        },
      };
    },
  };
}

function normalizeDomain(raw) {
  let value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value.endsWith(".")) value = value.slice(0, -1);
  if (value.length < 3 || value.length > 253 || !/^[a-z0-9.-]+$/.test(value)) {
    const error = new Error("invalid_domain");
    error.code = "INVALID_INPUT";
    throw error;
  }
  const labels = value.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-")
    )
  ) {
    const error = new Error("invalid_domain");
    error.code = "INVALID_INPUT";
    throw error;
  }
  return value;
}

function findRdapBase(bootstrap, tld) {
  for (const service of bootstrap?.services || []) {
    const tlds = service?.[0] || [];
    const urls = service?.[1] || [];
    if (
      tlds.some((value) => String(value).toLowerCase() === tld.toLowerCase()) &&
      urls.length
    ) {
      return String(urls[0]);
    }
  }
  return null;
}

function vcardName(entity) {
  const card = entity?.vcardArray;
  if (!Array.isArray(card) || !Array.isArray(card[1])) return null;
  for (const item of card[1]) {
    if (Array.isArray(item) && item[0] === "fn") {
      const value = String(item[3] ?? "");
      return value || null;
    }
  }
  return null;
}

function eventMap(events) {
  const out = {};
  if (!Array.isArray(events)) return out;
  for (const item of events) {
    const action = String(item?.eventAction ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_m, c) => c.toUpperCase());
    const date = String(item?.eventDate ?? "");
    if (action && date && !out[action]) out[action] = date;
  }
  return out;
}

function createRdapAdapter({
  fetchImpl = fetch,
  timeoutMs = SOURCE_TIMEOUT_MS,
} = {}) {
  let bootstrapCache = null;

  async function bootstrap() {
    if (bootstrapCache) return bootstrapCache;
    const data = await fetchJson(
      fetchImpl,
      IANA_RDAP_BOOTSTRAP,
      {
        headers: {
          accept: "application/json",
          "user-agent": "x402-product-0.1",
        },
      },
      timeoutMs
    );
    bootstrapCache = data;
    return data;
  }

  return {
    async lookup({ domain }) {
      const requested = normalizeDomain(domain);
      const tld = requested.split(".").pop();
      const rdapBase = findRdapBase(await bootstrap(), tld);
      if (!rdapBase) {
        return {
          available: false,
          detail: "rdap_bootstrap_service_missing",
        };
      }

      const url =
        rdapBase.replace(/\/+$/, "") +
        "/domain/" +
        encodeURIComponent(requested);
      const response = await fetchResponse(
        fetchImpl,
        url,
        {
          headers: {
            accept: "application/rdap+json, application/json",
            "user-agent": "x402-product-0.1",
          },
          redirect: "follow",
        },
        timeoutMs
      );

      if (response.status === 404) {
        return {
          available: true,
          registered: false,
          domain: requested,
          authoritativeRdap: rdapBase,
          registrar: null,
          events: {},
          provenance: {
            source:
              "Authoritative RDAP server discovered via IANA bootstrap",
            url,
          },
        };
      }
      if (!response.ok) {
        const error = new Error("rdap_http_" + response.status);
        error.code = "SOURCE_HTTP_ERROR";
        throw error;
      }

      const data = await response.json();
      const registrarEntity = Array.isArray(data?.entities)
        ? data.entities.find(
            (entity) =>
              Array.isArray(entity?.roles) &&
              entity.roles
                .map((role) => String(role).toLowerCase())
                .includes("registrar")
          )
        : undefined;

      return {
        available: true,
        registered: true,
        domain: requested,
        authoritativeRdap: rdapBase,
        registrar: registrarEntity
          ? {
              name: vcardName(registrarEntity),
              handle: registrarEntity.handle ?? null,
            }
          : null,
        events: eventMap(data?.events),
        provenance: {
          source: "Authoritative RDAP server discovered via IANA bootstrap",
          url,
        },
      };
    },
  };
}

module.exports = {
  PA_SOURCE,
  CENSUS_GEOCODER,
  IANA_RDAP_BOOTSTRAP,
  canonicalBusinessName,
  matchScore,
  addressIdentity,
  distanceMiles,
  isRetryablePaSourceError,
  createPaRegistryAdapter,
  createCensusAddressAdapter,
  createRdapAdapter,
};
