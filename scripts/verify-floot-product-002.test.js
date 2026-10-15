"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RESOURCE_PATH,
  NETWORK,
  USDC,
  PAY_TO,
  AMOUNT,
  PRESERVED_PA_ROUTES,
  verifyFlootProduct002,
} = require("./verify-floot-product-002");

const BASE = "https://floot.example";

function paymentRequirement(overrides = {}) {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: "USD Coin", version: "2" },
    ...overrides,
  };
}

function paymentDocument(overrides = {}) {
  return {
    x402Version: 2,
    resource: { url: BASE + RESOURCE_PATH },
    accepts: [paymentRequirement()],
    extensions: { bazaar: { info: {} } },
    ...overrides,
  };
}

function response(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    headers: new Headers(headers),
    async text() {
      return text;
    },
  };
}

function readyTransport({
  mutateCatalog,
  mutateChallenge,
  includeCors = true,
  omitPreservedCatalog = null,
} = {}) {
  let paymentHeaders = 0;
  const fetchImpl = async (url, init = {}) => {
    for (const [key, value] of Object.entries(init.headers || {})) {
      if (/^(payment-signature|x-payment)$/i.test(key) && value) paymentHeaders += 1;
    }
    const parsed = new URL(url);
    if (parsed.pathname === "/.well-known/x402") {
      const resource = {
        resource: BASE + RESOURCE_PATH,
        price: "$0.020",
        accepts: [paymentRequirement()],
        extensions: { bazaar: { info: {} } },
      };
      const preservedResources = PRESERVED_PA_ROUTES.filter(
        (item) => item.id !== omitPreservedCatalog
      ).map((item) => ({
        resource: BASE + item.path,
        price: item.price,
        accepts: [paymentRequirement({ amount: item.amount })],
      }));
      return response(200, {
        x402Version: 2,
        resources: [
          mutateCatalog ? mutateCatalog(resource) : resource,
          ...preservedResources,
        ],
      }, { "content-type": "application/json" });
    }
    if (parsed.pathname === "/openapi.json") {
      return response(200, {
        openapi: "3.1.0",
        paths: {
          [RESOURCE_PATH]: {
            get: {
              "x-payment-info": {
                price: { amount: "0.020000" },
                network: NETWORK,
                payTo: PAY_TO,
                protocols: [{ x402: {} }],
              },
            },
          },
        },
      }, { "content-type": "application/json" });
    }
    if (parsed.pathname === RESOURCE_PATH && init.method === "OPTIONS") {
      return response(
        204,
        "",
        includeCors
          ? {
              "access-control-allow-methods": "GET, OPTIONS",
              "access-control-allow-headers": "PAYMENT-SIGNATURE, Content-Type",
            }
          : {}
      );
    }
    if (parsed.pathname === RESOURCE_PATH) {
      const document = mutateChallenge
        ? mutateChallenge(paymentDocument())
        : paymentDocument();
      return response(402, document, {
        "content-type": "application/json; charset=utf-8",
        "payment-required": Buffer.from(JSON.stringify(document)).toString("base64"),
      });
    }
    const preserved = PRESERVED_PA_ROUTES.find(
      (item) => item.path === parsed.pathname
    );
    if (preserved) {
      const document = paymentDocument({
        resource: { url: BASE + preserved.path },
        accepts: [paymentRequirement({ amount: preserved.amount })],
      });
      return response(
        402,
        { ...document, price: preserved.price },
        {
          "content-type": "application/json; charset=utf-8",
          "payment-required": Buffer.from(JSON.stringify(document)).toString(
            "base64"
          ),
        }
      );
    }
    throw new Error("unexpected URL " + url);
  };
  return { fetchImpl, stats: () => ({ paymentHeaders }) };
}

test("Floot audit recognizes a complete Product 002 cutover", async () => {
  const transport = readyTransport();
  const result = await verifyFlootProduct002({ base: BASE, fetchImpl: transport.fetchImpl });

  assert.equal(RESOURCE_PATH, "/_api/vendor-intake-gate");
  assert.equal(result.deployed, true);
  assert.equal(result.ready, true, JSON.stringify(result.problems, null, 2));
  assert.equal(result.browserPreflightReady, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.observations.catalogRoutePresent, true);
  assert.equal(result.observations.openapiRoutePresent, true);
  assert.equal(result.observations.unpaidStatus, 402);
  assert.equal(result.observations.preservedPaRoutes.length, 2);
  assert.ok(
    result.observations.preservedPaRoutes.every(
      (item) => item.catalogPresent && item.unpaidStatus === 402
    )
  );
  assert.equal(transport.stats().paymentHeaders, 0);
});

test("Floot audit reports the current SPA-shell state as not ready", async () => {
  let paymentHeaders = 0;
  const fetchImpl = async (url, init = {}) => {
    for (const [key, value] of Object.entries(init.headers || {})) {
      if (/^(payment-signature|x-payment)$/i.test(key) && value) paymentHeaders += 1;
    }
    const parsed = new URL(url);
    if (parsed.pathname === "/.well-known/x402") {
      return response(200, { x402Version: 2, resources: [] }, {
        "content-type": "application/json",
      });
    }
    if (parsed.pathname === "/openapi.json") {
      return response(200, { openapi: "3.1.0", paths: {} }, {
        "content-type": "application/json",
      });
    }
    return response(200, "<!doctype html><title>PA Entity Lookup x402</title>", {
      "content-type": "text/html",
    });
  };

  const result = await verifyFlootProduct002({ base: BASE, fetchImpl });

  assert.equal(result.deployed, false);
  assert.equal(result.ready, false);
  assert.equal(result.browserPreflightReady, false);
  assert.ok(result.problems.includes("catalog_route_missing"));
  assert.ok(result.problems.includes("openapi_route_missing"));
  assert.ok(result.problems.includes("unpaid_status:200"));
  assert.ok(result.problems.includes("unpaid_content_type"));
  assert.ok(result.problems.includes("payment_required_header_missing"));
  assert.equal(paymentHeaders, 0);
});

test("Floot audit catches payment-contract drift without sending payment", async () => {
  const transport = readyTransport({
    mutateCatalog(resource) {
      return {
        ...resource,
        accepts: [paymentRequirement({ amount: "1" })],
      };
    },
    mutateChallenge(document) {
      return {
        ...document,
        accepts: [paymentRequirement({ payTo: "0x0000000000000000000000000000000000000001" })],
      };
    },
  });

  const result = await verifyFlootProduct002({ base: BASE, fetchImpl: transport.fetchImpl });

  assert.equal(result.deployed, false);
  assert.equal(result.ready, false);
  assert.ok(result.problems.includes("catalog_accept:amount"));
  assert.ok(result.problems.includes("unpaid_accept:payto"));
  assert.ok(result.problems.includes("payment_required_accept:payto"));
  assert.equal(transport.stats().paymentHeaders, 0);
});

test("Floot audit reports browser preflight as a non-blocking Floot limitation", async () => {
  const transport = readyTransport({ includeCors: false });
  const result = await verifyFlootProduct002({
    base: BASE,
    fetchImpl: transport.fetchImpl,
  });

  assert.equal(result.deployed, true);
  assert.equal(result.ready, true);
  assert.equal(result.supportMode, "server-to-server");
  assert.equal(result.browserPreflightReady, false);
  assert.deepEqual(result.deploymentProblems, []);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.preflightProblems, [
    "options_get_missing",
    "options_payment_header_missing",
  ]);
  assert.deepEqual(result.warnings, result.preflightProblems);
  assert.equal(transport.stats().paymentHeaders, 0);
});

test("Floot audit blocks readiness when an existing PA catalog route disappears", async () => {
  const transport = readyTransport({ omitPreservedCatalog: "pa_entity_one" });
  const result = await verifyFlootProduct002({
    base: BASE,
    fetchImpl: transport.fetchImpl,
  });

  assert.equal(result.deployed, false);
  assert.equal(result.ready, false);
  assert.ok(result.problems.includes("preserved_pa:pa_entity_one:catalog_missing"));
  assert.equal(transport.stats().paymentHeaders, 0);
});
