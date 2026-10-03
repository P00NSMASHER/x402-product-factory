"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadTopology,
  validateTopology,
  verifyProductionTopology,
} = require("./verify-production-topology");

function response(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function catalog(seller, routes) {
  return {
    x402Version: 2,
    resources: routes.map((route) => ({ resource: seller.origin + route.path })),
  };
}

function transport(topology, { includeShadows = false, omitRoute = null } = {}) {
  let paymentHeaders = 0;
  const fetchImpl = async (url, init = {}) => {
    for (const [name, value] of Object.entries(init.headers || {})) {
      if (/^(payment-signature|x-payment)$/i.test(name) && value) paymentHeaders += 1;
    }
    const seller = topology.canonical_sellers.find(
      (item) => item.origin + item.catalog_path === url
    );
    assert.ok(seller, "unexpected URL " + url);
    const routes = seller.routes.filter((route) => route.id !== omitRoute);
    if (includeShadows) {
      const shadow = topology.legacy_shadows.find(
        (item) => item.seller_id === seller.id
      );
      routes.push(...(shadow?.routes || []));
    }
    return response(200, catalog(seller, routes));
  };
  return { fetchImpl, stats: () => ({ paymentHeaders }) };
}

test("topology pins three PA routes to Floot and five data tools to Supabase", () => {
  const topology = validateTopology(loadTopology());
  const floot = topology.canonical_sellers.find((seller) => seller.id === "floot_pa");
  const supabase = topology.canonical_sellers.find(
    (seller) => seller.id === "supabase_data_tools"
  );
  assert.equal(floot.routes.length, 3);
  assert.equal(supabase.routes.length, 5);
});

test("canonical catalogs pass without payment headers", async () => {
  const topology = loadTopology();
  const mock = transport(topology);
  const result = await verifyProductionTopology({
    topology,
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.canonicalRouteCount, 8);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.paymentSent, false);
  assert.equal(mock.stats().paymentHeaders, 0);
});

test("known Floot data-tool shadows are warnings, not canonical owners", async () => {
  const topology = loadTopology();
  const mock = transport(topology, { includeShadows: true });
  const result = await verifyProductionTopology({
    topology,
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.warnings.length, 5);
  assert.ok(
    result.warnings.every((warning) =>
      warning.includes(":canonical=supabase_data_tools")
    )
  );
  assert.equal(mock.stats().paymentHeaders, 0);
});

test("missing canonical Supabase route fails even if shadows are present", async () => {
  const topology = loadTopology();
  const mock = transport(topology, {
    includeShadows: true,
    omitRoute: "sec-filings",
  });
  const result = await verifyProductionTopology({
    topology,
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.includes(
      "supabase_data_tools:canonical_route_missing:sec-filings"
    )
  );
  assert.equal(mock.stats().paymentHeaders, 0);
});
