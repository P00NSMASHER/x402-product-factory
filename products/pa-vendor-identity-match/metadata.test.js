"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OPERATION_ID,
  catalogResource,
  openApiPath,
  llmsText,
} = require("./metadata");

const BASE="https://example.test";

test("catalog resource uses resource-level accepts compatible with Bazaar validators", () => {
  const r=catalogResource(BASE);
  assert.equal(r.resource,BASE+"/api/pa-vendor-identity-match");
  assert.equal(r.method,"GET");
  assert.equal(r.price,"$0.005");
  assert.ok(Array.isArray(r.accepts));
  assert.equal(r.accepts.length,1);
  assert.equal(r.accepts[0].scheme,"exact");
  assert.equal(r.accepts[0].network,"eip155:8453");
  assert.equal(r.accepts[0].amount,"5000");
  assert.match(r.accepts[0].payTo,/^0x[0-9a-f]{40}$/);
  assert.ok(r.extensions?.bazaar?.info);
});

test("OpenAPI fragment exposes required inputs and payment metadata", () => {
  const path=openApiPath();
  assert.equal(path.get.operationId,OPERATION_ID);
  assert.deepEqual(path.get.parameters.map(p=>p.name),["company","address","domain"]);
  assert.equal(path.get["x-payment-info"].price.amount,"0.005000");
  assert.ok(path.get.responses[502]);
  assert.ok(path.get.responses[503]);
});

test("llms text states price, sources, and claim boundary", () => {
  const text=llmsText(BASE);
  assert.match(text,/\$0\.005 USDC/);
  assert.match(text,/Pennsylvania Department of State/);
  assert.match(text,/Census Bureau/);
  assert.match(text,/authoritative registry RDAP/);
  assert.match(text,/not legal\/compliance approval/);
});
