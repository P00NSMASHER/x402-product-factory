"use strict";

const assert = require("node:assert/strict");
const registry = require("../product-registry.json");
const {
  NETWORK,
  USDC,
  PAY_TO,
  requirements,
} = require("../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
} = require("../products/pa-vendor-identity-match/paid-handler");
const {
  catalogResource,
  openApiPath,
  llmsText,
} = require("../products/pa-vendor-identity-match/metadata");

function main() {
  const p = registry.products.find((row) => row.id === "pa-vendor-identity-match");
  assert.ok(p, "Product 003 must be present in product registry");
  assert.equal(p.number, "003");
  assert.equal(p.method, "GET");
  assert.equal(p.path, RESOURCE_PATH);
  assert.equal(p.price_usdc, "0.005");

  assert.equal(PRICE, "$0.005");
  assert.equal(AMOUNT_ATOMIC, "5000");
  assert.equal(NETWORK, "eip155:8453");
  assert.equal(USDC.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(PAY_TO.toLowerCase(), "0x708f7b52b56eafd7fc1de65fc7752ed732914021");

  const req = requirements(AMOUNT_ATOMIC);
  assert.equal(req.scheme, "exact");
  assert.equal(req.amount, "5000");
  assert.equal(req.network, NETWORK);
  assert.equal(req.asset, USDC);
  assert.equal(req.payTo, PAY_TO);

  const base = "https://candidate.example";
  const paymentDoc = productPaymentDocument(base);
  assert.equal(paymentDoc.resource.url, base + RESOURCE_PATH);
  assert.equal(paymentDoc.accepts[0].amount, "5000");

  const catalog = catalogResource(base);
  assert.equal(catalog.resource, base + RESOURCE_PATH);
  assert.ok(Array.isArray(catalog.accepts) && catalog.accepts.length === 1);
  assert.equal(catalog.accepts[0].amount, "5000");
  assert.equal(catalog.accepts[0].payTo, PAY_TO);

  const openapi = openApiPath();
  assert.equal(openapi.get["x-payment-info"].price.amount, "0.005000");
  assert.ok(openapi.get.responses[502], "must document non-settled source failure");
  assert.ok(openapi.get.responses[503], "must document unresolved settlement retry");

  const llms = llmsText(base);
  assert.match(llms, /retry the same PAYMENT-SIGNATURE/i);
  assert.match(llms, /not legal\/compliance approval/i);

  console.log(JSON.stringify({
    ok: true,
    product: p.id,
    status: p.status,
    route: RESOURCE_PATH,
    price: PRICE,
    atomicAmount: AMOUNT_ATOMIC,
    network: NETWORK,
    payTo: PAY_TO,
    catalogResourceAccepts: true,
    claimBoundaryPresent: true
  }, null, 2));
}

main();
