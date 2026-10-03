"use strict";

const assert = require("node:assert/strict");
const registry = require("../product-registry.json");
const spec = require("../products/pa-vendor-gate/spec.json");
const modules = require("../generated/product-modules");
const {
  NETWORK,
  USDC,
  PAY_TO,
  requirements,
} = require("../packages/x402/payment");
const { buildCatalog } = require("../packages/discovery/generator");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
} = require("../products/pa-vendor-gate/paid-handler");
const {
  catalogResource,
  openApiPath,
  llmsText,
} = require("../products/pa-vendor-gate/metadata");

function main() {
  const product = registry.products.find(
    (row) => row.id === "pa-vendor-intake-gate"
  );
  assert.ok(product, "Product 002 must be present in product registry");
  assert.equal(product.number, "002");
  assert.equal(product.status, "production-reference");
  assert.equal(product.module_directory, "pa-vendor-gate");
  assert.equal(product.method, "GET");
  assert.equal(product.path, RESOURCE_PATH);
  assert.equal(product.price_usdc, "0.020");
  assert.equal(product.release_gate, "scripts/validate-product-002.js");
  assert.deepEqual(product.decision_values, ["proceed", "human_review"]);

  assert.equal(spec.id, product.id);
  assert.deepEqual(spec.output.decision, product.decision_values);
  assert.equal(spec.decision_policy.automatic_reject, false);
  assert.deepEqual(spec.checks, [
    "pa_registry_identity",
    "census_address_consistency",
    "ofac_sdn_candidate_screen",
    "domain_rdap",
  ]);

  assert.ok(modules.SERVICE_MODULES[product.id]);
  assert.ok(modules.PAID_HANDLER_MODULES[product.id]);
  assert.ok(modules.METADATA_MODULES[product.id]);

  assert.equal(PRICE, "$0.020");
  assert.equal(AMOUNT_ATOMIC, "20000");
  assert.equal(NETWORK, "eip155:8453");
  assert.equal(
    USDC.toLowerCase(),
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  );
  assert.equal(
    PAY_TO.toLowerCase(),
    "0x708f7b52b56eafd7fc1de65fc7752ed732914021"
  );

  const paymentRequirements = requirements(AMOUNT_ATOMIC);
  assert.equal(paymentRequirements.scheme, "exact");
  assert.equal(paymentRequirements.amount, AMOUNT_ATOMIC);
  assert.equal(paymentRequirements.asset, USDC);
  assert.equal(paymentRequirements.payTo, PAY_TO);

  const base = "https://candidate.example";
  const document = productPaymentDocument(base);
  assert.equal(document.resource.url, base + RESOURCE_PATH);
  assert.equal(document.accepts[0].amount, AMOUNT_ATOMIC);
  assert.match(document.resource.serviceName, /^[\x20-\x7E]{1,32}$/);
  assert.ok(document.resource.tags.length <= 5);

  const catalog = catalogResource(base);
  assert.equal(catalog.resource, base + RESOURCE_PATH);
  assert.equal(catalog.price, PRICE);
  assert.equal(catalog.accepts.length, 1);
  assert.equal(catalog.accepts[0].amount, AMOUNT_ATOMIC);
  assert.equal(catalog.accepts[0].payTo, PAY_TO);
  assert.ok(catalog.extensions?.bazaar?.info);

  const operation = openApiPath().get;
  assert.equal(operation.operationId, "gatePennsylvaniaVendorIntake");
  assert.deepEqual(
    operation.parameters.map((parameter) => parameter.name),
    ["company", "address", "domain"]
  );
  assert.equal(operation["x-payment-info"].price.amount, "0.020000");
  assert.ok(operation.responses[502]);
  assert.ok(operation.responses[503]);
  assert.match(operation.description, /never an automatic rejection/i);

  const agentText = llmsText(base);
  assert.match(agentText, /historical name query/i);
  assert.match(agentText, /no automatic rejection/i);
  assert.match(agentText, /same PAYMENT-SIGNATURE/i);

  const stagedCatalog = buildCatalog(base);
  assert.equal(
    stagedCatalog.resources.some(
      (resource) => resource.resource === base + RESOURCE_PATH
    ),
    false,
    "Product 002 must not enter staged discovery before Floot cutover"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        product: product.id,
        status: product.status,
        route: RESOURCE_PATH,
        price: PRICE,
        atomicAmount: AMOUNT_ATOMIC,
        network: NETWORK,
        payTo: PAY_TO,
        directSourceChecks: spec.checks,
        catalogResourceAccepts: true,
        publishedInStagingCatalog: false,
        flootCutoverRequired: true,
      },
      null,
      2
    )
  );
}

main();
