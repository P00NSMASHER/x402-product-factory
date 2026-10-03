"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OPERATION_ID,
  catalogResource,
  openApiPath,
  llmsText,
} = require("./metadata");

const BASE = "https://example.test";

test("catalog resource advertises the Product 002 Base-USDC contract", () => {
  const resource = catalogResource(BASE);
  assert.equal(resource.resource, BASE + "/_api/vendor-intake-gate");
  assert.equal(resource.method, "GET");
  assert.equal(resource.price, "$0.020");
  assert.equal(resource.accepts.length, 1);
  assert.equal(resource.accepts[0].scheme, "exact");
  assert.equal(resource.accepts[0].network, "eip155:8453");
  assert.equal(resource.accepts[0].amount, "20000");
  assert.match(resource.accepts[0].payTo, /^0x[0-9a-f]{40}$/);
  assert.ok(resource.extensions?.bazaar?.info);
});

test("OpenAPI fragment exposes inputs, payment metadata, and no-charge failures", () => {
  const path = openApiPath();
  assert.equal(path.get.operationId, OPERATION_ID);
  assert.deepEqual(
    path.get.parameters.map((parameter) => parameter.name),
    ["name", "address", "domain"]
  );
  assert.equal(path.get["x-payment-info"].price.amount, "0.020000");
  assert.ok(path.get.responses[502]);
  assert.ok(path.get.responses[503]);
  assert.match(path.get.description, /never an automatic rejection/i);
});

test("llms text states sources, price, and claim boundaries", () => {
  const text = llmsText(BASE);
  assert.match(text, /\$0\.020 USDC/);
  assert.match(text, /Census Bureau/);
  assert.match(text, /OFAC SDN\/ALT/);
  assert.match(text, /authoritative registry RDAP/);
  assert.match(text, /no automatic rejection/i);
  assert.match(text, /not legal\/compliance approval/i);
});
