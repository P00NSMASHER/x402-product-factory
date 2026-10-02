"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPaRegistryAdapter,
  createCensusAddressAdapter,
  createRdapAdapter,
  CENSUS_GEOCODER,
  IANA_RDAP_BOOTSTRAP,
} = require("./live-pa-identity");

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("PA registry adapter returns one complete exact match as strong", async () => {
  const rows = [
    {
      business_name: "Example LLC",
      filing_number: "123",
      typeofbusinessregistration: "Limited Liability Company",
      address_line1: "100 Market St",
      address_line2: null,
      city: "Pottsville",
      state: "PA",
      zip: "17901",
      creationdate: "2020-01-02T00:00:00.000",
      shortcountyname: "Schuylkill",
      county_code: "54",
    },
  ];
  const adapter = createPaRegistryAdapter({
    fetchImpl: async () => response(rows),
  });
  const result = await adapter.lookup({ company: "Example" });
  assert.equal(result.available, true);
  assert.equal(result.strongMatch, true);
  assert.equal(result.matchScore, 0);
  assert.equal(result.entity.filingNumber, "123");
});

test("PA registry adapter treats multiple strong candidates as ambiguous", async () => {
  const rows = [
    {
      business_name: "Example LLC",
      filing_number: "1",
      typeofbusinessregistration: "LLC",
      address_line1: "1 A St",
      city: "Pottsville",
      state: "PA",
      zip: "17901",
    },
    {
      business_name: "Example Inc",
      filing_number: "2",
      typeofbusinessregistration: "Corporation",
      address_line1: "2 A St",
      city: "Pottsville",
      state: "PA",
      zip: "17901",
    },
  ];
  const adapter = createPaRegistryAdapter({
    fetchImpl: async () => response(rows),
  });
  const result = await adapter.lookup({ company: "Example" });
  assert.equal(result.ambiguous, true);
  assert.equal(result.strongMatch, false);
});


test("PA registry retries one transient timeout and then succeeds", async () => {
  const rows = [
    {
      business_name: "Example LLC",
      filing_number: "123",
      typeofbusinessregistration: "Limited Liability Company",
      address_line1: "100 Market St",
      city: "Pottsville",
      state: "PA",
      zip: "17901"
    },
    {
      business_name: "Zeta Holdings LLC",
      filing_number: "456",
      typeofbusinessregistration: "Limited Liability Company",
      address_line1: "200 Market St",
      city: "Pottsville",
      state: "PA",
      zip: "17901"
    },
    {
      business_name: "Omega Corp",
      filing_number: "789",
      typeofbusinessregistration: "Corporation",
      address_line1: "300 Market St",
      city: "Pottsville",
      state: "PA",
      zip: "17901"
    }
  ];
  let calls = 0;
  let sleeps = 0;
  const adapter = createPaRegistryAdapter({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return response(rows);
    },
    sleepImpl: async () => { sleeps += 1; },
    retryDelayMs: 1
  });
  const result = await adapter.lookup({ company: "Example" });
  assert.equal(calls, 2);
  assert.equal(sleeps, 1);
  assert.equal(result.strongMatch, true);
  assert.equal(result.entity.filingNumber, "123");
});

test("PA registry does not retry non-transient HTTP 400", async () => {
  let calls = 0;
  const adapter = createPaRegistryAdapter({
    fetchImpl: async () => {
      calls += 1;
      return response({ error: "bad request" }, 400);
    },
    sleepImpl: async () => {
      throw new Error("sleep should not run");
    }
  });
  await assert.rejects(
    () => adapter.lookup({ company: "Example" }),
    (error) => error?.code === "SOURCE_HTTP_ERROR" && /source_http_400/.test(error.message)
  );
  assert.equal(calls, 1);
});

test("Census adapter uses authoritative Census geocoder and compares identity", async () => {
  const calls = [];
  const raw = (matchedAddress, x, y) => ({
    result: {
      addressMatches: [
        {
          matchedAddress,
          coordinates: { x, y },
          geographies: {},
        },
      ],
    },
  });
  const payloads = [
    raw("100 MARKET ST, POTTSVILLE, PA, 17901", -76.195, 40.684),
    raw("100 MARKET ST, POTTSVILLE, PA, 17901", -76.19501, 40.68401),
  ];
  let index = 0;
  const adapter = createCensusAddressAdapter({
    fetchImpl: async (url) => {
      calls.push(url);
      return response(payloads[index++]);
    },
  });
  const result = await adapter.compare({
    suppliedAddress: "100 Market St, Pottsville, PA 17901",
    registryAddress: "100 Market St, Pottsville, PA, 17901",
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.startsWith(CENSUS_GEOCODER)));
  assert.equal(result.available, true);
  assert.equal(result.suppliedMatched, true);
  assert.equal(result.registryMatched, true);
  assert.equal(result.sameStreetNumber, true);
  assert.equal(result.sameZip, true);
  assert.ok(result.distanceMiles <= 0.01);
});

test("Census valid no-match stays available but not matched", async () => {
  const adapter = createCensusAddressAdapter({
    fetchImpl: async () => response({ result: { addressMatches: [] } }),
  });
  const result = await adapter.compare({
    suppliedAddress: "No Match One, PA 17901",
    registryAddress: "No Match Two, PA 17901",
  });
  assert.equal(result.available, true);
  assert.equal(result.suppliedMatched, false);
  assert.equal(result.registryMatched, false);
  assert.equal(result.sameStreetNumber, false);
  assert.equal(result.sameZip, false);
  assert.equal(result.distanceMiles, null);
});

test("RDAP adapter resolves IANA bootstrap then authoritative registry", async () => {
  const calls = [];
  const adapter = createRdapAdapter({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === IANA_RDAP_BOOTSTRAP) {
        return response({
          services: [[["com"], ["https://rdap.example/"]]],
        });
      }
      assert.equal(url, "https://rdap.example/domain/example.com");
      return response({
        entities: [
          {
            roles: ["registrar"],
            handle: "REG-1",
            vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar"]]],
          },
        ],
        events: [
          {
            eventAction: "registration",
            eventDate: "1995-08-14T00:00:00Z",
          },
        ],
      });
    },
  });

  const result = await adapter.lookup({ domain: "EXAMPLE.COM" });
  assert.equal(calls.length, 2);
  assert.equal(result.available, true);
  assert.equal(result.registered, true);
  assert.equal(result.domain, "example.com");
  assert.equal(result.registrar.name, "Example Registrar");
  assert.ok(result.events.registration);
});

test("RDAP authoritative 404 is a valid unregistered result", async () => {
  const adapter = createRdapAdapter({
    fetchImpl: async (url) => {
      if (url === IANA_RDAP_BOOTSTRAP) {
        return response({
          services: [[["com"], ["https://rdap.example/"]]],
        });
      }
      return response({}, 404);
    },
  });
  const result = await adapter.lookup({ domain: "available-example.com" });
  assert.equal(result.available, true);
  assert.equal(result.registered, false);
  assert.equal(result.authoritativeRdap, "https://rdap.example/");
});

test("RDAP missing bootstrap service fails closed", async () => {
  const adapter = createRdapAdapter({
    fetchImpl: async () => response({ services: [] }),
  });
  const result = await adapter.lookup({ domain: "example.com" });
  assert.equal(result.available, false);
  assert.equal(result.detail, "rdap_bootstrap_service_missing");
});
