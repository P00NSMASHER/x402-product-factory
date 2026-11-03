"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRdapAdapter, IANA_RDAP_BOOTSTRAP } = require("./live-pa-identity");
const { createDomainAgeService } = require("../../products/domain-registration-age/service");
const { createDomainExpirationService } = require("../../products/domain-expiration-horizon/service");

function response(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, async json() { return body; } };
}

function adapterFor(body, status = 200) {
  const calls = [];
  const adapter = createRdapAdapter({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === IANA_RDAP_BOOTSTRAP) {
        return response({ services: [[["com"], ["https://rdap.example/"]]] });
      }
      assert.equal(url, "https://rdap.example/domain/example.com");
      return response(body, status);
    },
  });
  return { adapter, calls };
}

test("RDAP must reject mismatched domain despite plausible registration metadata", async () => {
  const { adapter } = adapterFor({
    objectClassName: "domain",
    ldhName: "different.com",
    events: [{ eventAction: "registration", eventDate: "2018-01-01T00:00:00Z" }],
  });
  await assert.rejects(
    () => adapter.lookup({ domain: "example.com" }),
    (err) => err.code === "SOURCE_CONTRACT_INVALID"
  );
});

test("RDAP must reject missing, wrong-type, and wrong-class identity fields", async (t) => {
  const invalid = [
    { objectClassName: "domain", events: [] },
    { objectClassName: "domain", ldhName: 12, events: [] },
    { objectClassName: "entity", ldhName: "example.com", events: [] },
    { objectClassName: "domain", ldhName: "example.com.evil", events: [] },
    null,
    [],
  ];
  for (const body of invalid) {
    await t.test(JSON.stringify(body), async () => {
      await assert.rejects(
        () => adapterFor(body).adapter.lookup({ domain: "example.com" }),
        (err) => err.code === "SOURCE_CONTRACT_INVALID"
      );
    });
  }
});

test("RDAP matching identity remains valid case-insensitively", async () => {
  const { adapter, calls } = adapterFor({
    objectClassName: "domain",
    ldhName: "EXAMPLE.COM",
    events: [{ eventAction: "registration", eventDate: "2018-01-01T00:00:00Z" }],
  });
  const r = await adapter.lookup({ domain: "EXAMPLE.COM" });
  assert.equal(r.available, true);
  assert.equal(r.registered, true);
  assert.equal(r.domain, "example.com");
  assert.equal(r.events.registration, "2018-01-01T00:00:00Z");
  assert.equal(calls.length, 2);
});

test("Authoritative 404 stays a valid negative control, not a source error", async () => {
  const r = await adapterFor({}, 404).adapter.lookup({ domain: "example.com" });
  assert.equal(r.available, true);
  assert.equal(r.registered, false);
});

test("Wrong-domain RDAP records must never generate chargeable domain-age or expiry evidence", async () => {
  const { adapter } = adapterFor({
    objectClassName: "domain",
    ldhName: "attacker.com",
    events: [
      { eventAction: "registration", eventDate: "2018-01-01T00:00:00Z" },
      { eventAction: "expiration", eventDate: "2027-01-01T00:00:00Z" },
    ],
  });
  const now = () => "2026-10-31T12:00:00Z";
  for (const service of [
    createDomainAgeService({ rdap: adapter, now }),
    createDomainExpirationService({ rdap: adapter, now }),
  ]) {
    const r = await service.check({ domain: "example.com" });
    assert.equal(r.chargeable, false);
    assert.equal(r.decision, "human_review");
    assert.equal(r.sourceFailures[0]?.detail, "SOURCE_CONTRACT_INVALID");
  }
});
