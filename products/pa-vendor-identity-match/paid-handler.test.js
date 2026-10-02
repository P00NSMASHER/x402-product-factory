"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeHeader } = require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
  createPaidVendorIdentityHandler,
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

test("payment document advertises Product 003 at $0.005", () => {
  const doc = productPaymentDocument("https://example.test");
  assert.equal(doc.resource.url, "https://example.test" + RESOURCE_PATH);
  assert.equal(doc.accepts[0].amount, AMOUNT_ATOMIC);
  assert.equal(PRICE, "$0.005");
});

test("missing payment returns 402 before service or facilitator work", async () => {
  let serviceCalls = 0;
  let networkCalls = 0;
  const handler = createPaidVendorIdentityHandler({
    publicApiBase: "https://example.test",
    service: {
      async check() {
        serviceCalls++;
        return {};
      },
    },
    fetchImpl: async () => {
      networkCalls++;
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
  const handler = createPaidVendorIdentityHandler({
    publicApiBase: "https://example.test",
    service: { async check() { throw new Error("should not run"); } },
    fetchImpl: async () => {
      networkCalls++;
      return response({});
    },
  });
  const result = await handler({
    query: { company: "", address: "x", domain: "x" },
    event: { headers: { "payment-signature": paymentSignature() } },
  });
  assert.equal(result.statusCode, 400);
  assert.equal(networkCalls, 0);
});

test("valid payment verifies, computes, settles, then returns paid result", async () => {
  const urls = [];
  let serviceCalls = 0;
  const handler = createPaidVendorIdentityHandler({
    publicApiBase: "https://example.test",
    service: {
      async check(input) {
        serviceCalls++;
        assert.equal(input.domain, "openai.com");
        return {
          decision: "consistent",
          reasonCodes: [],
          sourceFailures: [],
          chargeable: true,
          checkedAt: "2026-10-02T09:00:00.000Z",
        };
      },
    },
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.endsWith("/verify")) return response({ isValid: true });
      if (url.endsWith("/settle"))
        return response({ success: true, transaction: "0xabc" });
      throw new Error("unexpected URL");
    },
  });

  const result = await handler({
    query: goodQuery(),
    event: { headers: { "PAYMENT-SIGNATURE": paymentSignature() } },
  });
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(serviceCalls, 1);
  assert.equal(urls.length, 2);
  assert.ok(urls[0].endsWith("/verify"));
  assert.ok(urls[1].endsWith("/settle"));
  assert.equal(body.paid, true);
  assert.equal(body.price, "$0.005");
  assert.equal(result.headers["x402-settled"], "true");
  assert.ok(result.headers["PAYMENT-RESPONSE"]);
});

test("source transport failure after verification returns 502 and never settles", async () => {
  const urls = [];
  const handler = createPaidVendorIdentityHandler({
    publicApiBase: "https://example.test",
    service: {
      async check() {
        return {
          decision: "human_review",
          sourceFailures: [{ source: "rdap", detail: "SOURCE_HTTP_ERROR" }],
          chargeable: false,
          checkedAt: "2026-10-02T09:00:00.000Z",
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

test("terminal payment verification never calls service", async () => {
  let serviceCalls = 0;
  const handler = createPaidVendorIdentityHandler({
    publicApiBase: "https://example.test",
    service: {
      async check() {
        serviceCalls++;
        return {};
      },
    },
    fetchImpl: async () =>
      response({ isValid: false, invalidReason: "bad_signature" }, 400),
  });
  const result = await handler({
    query: goodQuery(),
    event: { headers: { "x-payment": paymentSignature() } },
  });
  assert.equal(result.statusCode, 402);
  assert.equal(JSON.parse(result.body).error, "bad_signature");
  assert.equal(serviceCalls, 0);
});
