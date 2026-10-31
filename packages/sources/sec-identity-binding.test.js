"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TICKERS_URL,
  SUBMISSIONS_BASE,
  createSecFilingsAdapter,
} = require("./sec-filings");
const { createSecFilingFreshnessService } = require("../../products/sec-filing-freshness/service");
const { createSecCompanyIdentityService } = require("../../products/sec-company-identity-match/service");

const CONTACT = "Source QA source-qa@example.com";
const recent = {
  form: [],
  filingDate: [],
  accessionNumber: [],
  primaryDocument: [],
};
const response = (body) => ({ ok: true, status: 200, async json() { return body; } });

function mockedSec({ mappedCik = 320193, tickers = ["AAPL"], submittedCik = 320193 } = {}) {
  const calls = [];
  const adapter = createSecFilingsAdapter({
    userAgent: CONTACT,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === TICKERS_URL) {
        return response({ "0": { ticker: "AAPL", cik_str: mappedCik } });
      }
      assert.match(url, /^https:\/\/data\.sec\.gov\/submissions\/CIK\d{10}\.json$/);
      return response({ name: "Example Incorporated", cik: submittedCik, tickers, filings: { recent } });
    },
  });
  return { adapter, calls };
}

function isSourceContractError(error) {
  return error?.code === "SOURCE_CONTRACT_INVALID";
}

test("SEC ticker mapping and returned company tickers must agree", async () => {
  const { adapter } = mockedSec({ tickers: ["MSFT"] });
  await assert.rejects(() => adapter.lookup({ ticker: "AAPL" }), isSourceContractError);
});

test("SEC response must not contradict requested CIK", async () => {
  const { adapter } = mockedSec({ submittedCik: 789019 });
  await assert.rejects(() => adapter.lookup({ cik: "320193" }), isSourceContractError);
});

test("corrupt SEC ticker-map CIK is unavailable, never a completed not-found", async () => {
  const { adapter, calls } = mockedSec({ mappedCik: "not-a-cik" });
  await assert.rejects(() => adapter.lookup({ ticker: "AAPL" }), isSourceContractError);
  assert.equal(calls.length, 1);
});

test("caller-supplied ticker and CIK are not silently allowed to conflict", async () => {
  const { adapter } = mockedSec({ tickers: ["MSFT"] });
  await assert.rejects(() => adapter.lookup({ ticker: "AAPL", cik: "320193" }), isSourceContractError);
});

test("missing ticker list is not acceptable evidence for a ticker-based lookup", async () => {
  const { adapter } = mockedSec({ tickers: null });
  await assert.rejects(() => adapter.lookup({ ticker: "AAPL" }), isSourceContractError);
});

test("matching SEC source CIK and dotted ticker remain supported", async () => {
  const calls = [];
  const adapter = createSecFilingsAdapter({
    userAgent: CONTACT,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === TICKERS_URL) {
        return response({ "0": { ticker: "BRK-B", cik_str: 1067983 } });
      }
      return response({
        name: "Berkshire Hathaway Inc.",
        cik: 1067983,
        tickers: ["BRK-B"],
        filings: { recent },
      });
    },
  });
  const result = await adapter.lookup({ ticker: "BRK.B" });
  assert.equal(result.found, true);
  assert.equal(result.company.cik, "0001067983");
  assert.equal(calls.length, 2);
});

test("historical CIK-only queries remain compatible with absent tickers", async () => {
  const adapter = createSecFilingsAdapter({
    userAgent: CONTACT,
    fetchImpl: async () => response({ name: "Legacy Filer", cik: 320193, filings: { recent } }),
  });
  const result = await adapter.lookup({ cik: "320193" });
  assert.equal(result.found, true);
  assert.equal(result.company.cik, "0000320193");
});

test("a contradictory SEC source cannot produce billable filing-freshness evidence", async () => {
  const { adapter } = mockedSec({ tickers: ["MSFT"] });
  const result = await createSecFilingFreshnessService({
    sec: adapter,
    now: () => "2026-10-31T00:00:00.000Z",
  }).check({ ticker: "AAPL", maxAgeDays: 30 });
  assert.equal(result.chargeable, false);
  assert.equal(result.sourceFailures[0].source, "sec_edgar");
  assert.equal(result.evidence.available, false);
});

test("a contradictory SEC CIK cannot produce billable identity evidence", async () => {
  const { adapter } = mockedSec({ submittedCik: 789019 });
  const result = await createSecCompanyIdentityService({
    sec: adapter,
    now: () => "2026-10-31T00:00:00.000Z",
  }).check({ company: "Example Incorporated", cik: "320193" });
  assert.equal(result.chargeable, false);
  assert.equal(result.sourceFailures[0].source, "sec_edgar");
  assert.equal(result.evidence.available, false);
});
