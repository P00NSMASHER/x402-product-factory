"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeHeader } = require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
  createPaidVendorIntakeHandler,
} = require("./paid-handler");

function response(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
  };
}

function paymentSignature() {
  return encodeHeader({ x402Version: 2, payload: { signed: true } });
}

function goodQuery() {
  return {
    company: "OpenAI OpCo",
    address:
      "600 North Second Street, Suite 401, Harrisburg, PA 17101",
    domain: "openai.com",
  };
}

test("payment document advertises Product 002 at $0.020", () => {
  const document = productPaymentDocument("https://example.test/");
  assert.equal(document.resource.url, "https://example.test" + RESOURCE_PATH);
  assert.equal(document.accepts[0].amount, AMOUNT_ATOMIC);
  assert.equal(PRICE, "$0.020");
  assert.equal(document.resource.tags.length, 5);
});

test("missing payment returns 402 before service or facilitator work", async () => {
  let serviceCalls = 0;
  let networkCalls = 0;
  const handler = createPaidVendorIntakeHandler({
    publicApiBase: "https://example.test",
    service: {
      async check() {
        serviceCalls += 1;
        return {};
      },
    },
    fetchImpl: async () => {
      networkCalls += 1;
      return response({});
    },
  });

  const result = await handler({ query: goodQuery(), event: { headers: {} } });
  assert.equal(result.statusCode, 402);
  assert.equal(serviceCalls, 0);
  assert.equal(networkCalls, 0);
});

test("invalid input is rejected before facilitator verification", async () => {
  let networkCalls = 0;
  const handler = createPaidVendorIntakeHandler({
    publicApiBase: "https://example.test",
    service: { async check() { throw new Error("should not run"); } },
    fetchImpl: async () => {
      networkCalls += 1;
      return response({});
    },
  });

  const result = await handler({
    query: { company: "OpenAI", address: "short", domain: "not a domain" },
    event: { headers: { "payment-signature": paymentSignature() } },
  });
  assert.equal(result.statusCode, 400);
  assert.equal(networkCalls, 0);
});

test("valid payment verifies, computes, settles, then returns paid result", async () => {
  const urls = [];
  const handler = createPaidVendorIntakeHandler({
    publicApiBase: "https://example.test",
    service: {
      async check(input) {
        assert.equal(input.company, "OpenAI OpCo");
        return {
          decision: "proceed",
          agentAction: "continue_vendor_intake",
          sourceFailures: [],
          chargeable: true,
          checkedAt: "2026-10-02T12:00:00.000Z",
        };
      },
    },
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.endsWith("/verify")) return response({ isValid: true });
      if (url.endsWith("/settle")) {
        return response({ success: true, transaction: "0xabc" });
      }
      throw new Error("unexpected URL");
    },
  });

  const result = await handler({
    query: goodQuery(),
    event: { headers: { "PAYMENT-SIGNATURE": paymentSignature() } },
  });
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(urls.map((url) => url.split("/").pop()), ["verify", "settle"]);
  assert.equal(body.decision, "proceed");
  assert.equal(body.paid, true);
  assert.equal(body.price, "$0.020");
  assert.equal(result.headers["x402-settled"], "true");
  assert.ok(result.headers["PAYMENT-RESPONSE"]);
});

test("historical name query remains compatible with the canonical company input", async () => {
  let observedCompany = null;
  const handler = createPaidVendorIntakeHandler({
    publicApiBase: "https://example.test",
    service: {
      async check(input) {
        observedCompany = input.company;
        return { decision: "human_review", sourceFailures: [], chargeable: true };
      },
    },
    fetchImpl: async (url) =>
      url.endsWith("/verify")
        ? response({ isValid: true })
        : response({ success: true }),
  });
  const query = goodQuery();
  query.name = query.company;
  delete query.company;

  const result = await handler({
    query,
    event: { headers: { "x-payment": paymentSignature() } },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(observedCompany, "OpenAI OpCo");
});

test("required-source failure after verification returns 502 without settlement", async () => {
  const urls = [];
  const handler = createPaidVendorIntakeHandler({
    publicApiBase: "https://example.test",
    service: {
      async check() {
        return {
          decision: "human_review",
          sourceFailures: [{ source: "ofac_sdn", detail: "SOURCE_TIMEOUT" }],
          chargeable: false,
          checkedAt: "2026-10-02T12:00:00.000Z",
        };
      },
    },
    fetchImpl: async (url) => {
      urls.push(url);
      return response({ isValid: true });
    },
  });

  const result = await handler({
    query: goodQuery(),
    event: { headers: { "payment-signature": paymentSignature() } },
  });
  assert.equal(result.statusCode, 502);
  assert.equal(JSON.parse(result.body).chargeable, false);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].endsWith("/verify"));
});
