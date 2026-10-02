"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TICKERS_URL,
  SUBMISSIONS_BASE,
  normalizeCik,
  normalizeTicker,
  createSecFilingsAdapter,
  hasContactEmail,
} = require("./sec-filings");

function response(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

test("declared SEC user agent requires a contact email", () => {
  assert.equal(hasContactEmail("Example Co bot@example.com"), true);
  assert.equal(hasContactEmail("x402-sec-filings/1.0 https://example.com"), false);
});

test("normalizes CIK and ticker", () => {
  assert.equal(normalizeCik("320193"), "0000320193");
  assert.equal(normalizeCik("CIK 320193"), "0000320193");
  assert.equal(normalizeCik(""), null);
  assert.equal(normalizeTicker(" aapl "), "AAPL");
  assert.equal(normalizeTicker("brk.b"), "BRK-B");
});

test("ticker resolves through SEC map and returns filings", async () => {
  const calls = [];
  const headers = [];
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async (url, init) => {
      calls.push(url);
      headers.push(init?.headers || {});
      if (url === TICKERS_URL) {
        return response({
          "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
        });
      }
      assert.equal(url, SUBMISSIONS_BASE + "0000320193.json");
      return response({
        name: "Apple Inc.",
        tickers: ["AAPL"],
        exchanges: ["Nasdaq"],
        sic: "3571",
        sicDescription: "Electronic Computers",
        filings: {
          recent: {
            form: ["8-K", "10-Q"],
            filingDate: ["2026-10-01", "2026-08-01"],
            reportDate: ["2026-09-30", "2026-06-30"],
            acceptanceDateTime: ["20261001120000", "20260801120000"],
            accessionNumber: ["0000320193-26-000001", "0000320193-26-000002"],
            primaryDocument: ["a8k.htm", "a10q.htm"],
            primaryDocDescription: ["8-K", "10-Q"],
          },
        },
      });
    },
  });

  const result = await adapter.lookup({ ticker: "AAPL", limit: 25 });
  assert.equal(calls.length, 2);
  assert.equal(String(headers[0]["user-agent"]), "Example Co bot@example.com");
  assert.equal(String(headers[1]["user-agent"]), "Example Co bot@example.com");
  assert.equal(result.available, true);
  assert.equal(result.found, true);
  assert.equal(result.company.cik, "0000320193");
  assert.equal(result.filings.length, 2);
  assert.match(result.filings[0].filingUrl, /Archives\/edgar\/data\/320193/);
});

test("form filter is exact and case-insensitive", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async () => response({
      name: "Apple Inc.",
      tickers: ["AAPL"],
      exchanges: ["Nasdaq"],
      filings: {
        recent: {
          form: ["8-K", "10-Q"],
          filingDate: ["2026-10-01", "2026-08-01"],
          accessionNumber: ["1", "2"],
          primaryDocument: ["a.htm", "b.htm"],
        },
      },
    }),
  });
  const result = await adapter.lookup({ cik: "320193", form: "8-k" });
  assert.deepEqual(result.filings.map((f) => f.form), ["8-K"]);
});

test("unknown ticker is a completed not-found result", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async () => response({
      "0": { cik_str: 320193, ticker: "AAPL" },
    }),
  });
  const result = await adapter.lookup({ ticker: "ZZZZ" });
  assert.equal(result.available, true);
  assert.equal(result.found, false);
  assert.deepEqual(result.filings, []);
});

test("SEC transport error throws source error", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async () => response({}, 503),
  });
  await assert.rejects(
    () => adapter.lookup({ cik: "320193" }),
    (error) => error.code === "SOURCE_HTTP_ERROR"
  );
});

test("invalid SEC recent-filings shape throws contract error", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async () => response({ name: "Apple Inc.", filings: {} }),
  });
  await assert.rejects(
    () => adapter.lookup({ cik: "320193" }),
    (error) => error.code === "SOURCE_CONTRACT_INVALID"
  );
});

test("dotted ticker alias resolves against SEC hyphen form", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async (url) => {
      if (url === TICKERS_URL) {
        return response({
          "0": { cik_str: 1067983, ticker: "BRK-B", title: "Berkshire Hathaway Inc." },
        });
      }
      return response({
        name: "Berkshire Hathaway Inc.",
        tickers: ["BRK-B"],
        exchanges: ["NYSE"],
        filings: { recent: { form: [], filingDate: [], accessionNumber: [], primaryDocument: [] } },
      });
    },
  });
  const result = await adapter.lookup({ ticker: "BRK.B" });
  assert.equal(result.found, true);
  assert.equal(result.company.cik, "0001067983");
});

test("missing required SEC recent-filings arrays fails closed", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async () => response({
      name: "Apple Inc.",
      filings: {
        recent: {
          form: ["8-K"],
          accessionNumber: ["1"],
          primaryDocument: ["a.htm"]
        }
      }
    }),
  });
  await assert.rejects(
    () => adapter.lookup({ cik: "320193" }),
    (error) => error.code === "SOURCE_CONTRACT_INVALID"
  );
});

test("misaligned SEC recent-filings arrays fail closed", async () => {
  const adapter = createSecFilingsAdapter({ userAgent: "Example Co bot@example.com",
    fetchImpl: async () => response({
      name: "Apple Inc.",
      filings: {
        recent: {
          form: ["8-K", "10-Q"],
          filingDate: ["2026-10-01"],
          accessionNumber: ["1", "2"],
          primaryDocument: ["a.htm", "b.htm"]
        }
      }
    }),
  });
  await assert.rejects(
    () => adapter.lookup({ cik: "320193" }),
    (error) =>
      error.code === "SOURCE_CONTRACT_INVALID" &&
      /misaligned/.test(error.message)
  );
});
