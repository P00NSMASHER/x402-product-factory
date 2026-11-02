"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TOPOLOGY_PATH = path.resolve(__dirname, "../production-topology.json");
const EXPECTED_ORIGINS = Object.freeze({
  floot_pa: "https://pa-entity-x402.floot.app",
  supabase_data_tools:
    "https://bvjtimsalbzkmulyinpg.supabase.co/functions/v1/x402-data-tools",
});

function loadTopology(file = TOPOLOGY_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validateTopology(topology) {
  if (topology?.schema_version !== 1) throw new Error("schema_version");
  if (!Array.isArray(topology.canonical_sellers)) {
    throw new Error("canonical_sellers");
  }
  const sellers = new Map(
    topology.canonical_sellers.map((seller) => [seller.id, seller])
  );
  if (sellers.size !== Object.keys(EXPECTED_ORIGINS).length) {
    throw new Error("seller_count");
  }
  for (const [id, origin] of Object.entries(EXPECTED_ORIGINS)) {
    const seller = sellers.get(id);
    if (!seller || seller.origin !== origin) throw new Error("seller:" + id);
    if (seller.catalog_path !== "/.well-known/x402") {
      throw new Error("catalog_path:" + id);
    }
    if (!Array.isArray(seller.routes) || seller.routes.length < 1) {
      throw new Error("routes:" + id);
    }
  }

  const canonicalIds = new Set();
  for (const seller of sellers.values()) {
    for (const route of seller.routes) {
      if (canonicalIds.has(route.id)) throw new Error("duplicate_route_id:" + route.id);
      canonicalIds.add(route.id);
      if (typeof route.path !== "string" || !route.path.startsWith("/")) {
        throw new Error("route_path:" + route.id);
      }
    }
  }
  if (canonicalIds.size !== 8) throw new Error("canonical_route_count");

  if (!Array.isArray(topology.legacy_shadows)) {
    throw new Error("legacy_shadows");
  }
  for (const shadow of topology.legacy_shadows) {
    if (!sellers.has(shadow.seller_id)) throw new Error("shadow_seller");
    if (!sellers.has(shadow.canonical_seller_id)) {
      throw new Error("shadow_canonical_seller");
    }
    const canonicalSeller = sellers.get(shadow.canonical_seller_id);
    for (const route of shadow.routes || []) {
      if (!canonicalSeller.routes.some((item) => item.id === route.id)) {
        throw new Error("shadow_route_id:" + route.id);
      }
    }
  }
  return topology;
}

async function readCatalog(fetchImpl, seller) {
  try {
    const response = await fetchImpl(seller.origin + seller.catalog_path, {
      headers: {
        accept: "application/json",
        "user-agent": "x402-product-factory-topology-audit/1.0",
      },
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { response, body, error: null };
  } catch (error) {
    return { response: null, body: null, error: error?.message || String(error) };
  }
}

async function verifyProductionTopology({
  topology = loadTopology(),
  fetchImpl = fetch,
} = {}) {
  validateTopology(topology);
  const problems = [];
  const warnings = [];
  const observations = [];

  for (const seller of topology.canonical_sellers) {
    const result = await readCatalog(fetchImpl, seller);
    if (result.error) problems.push(seller.id + ":catalog_transport");
    else if (result.response.status !== 200) {
      problems.push(seller.id + ":catalog_status:" + result.response.status);
    }
    if (result.body?.x402Version !== 2 || !Array.isArray(result.body?.resources)) {
      problems.push(seller.id + ":catalog_invalid");
    }
    const resources = Array.isArray(result.body?.resources)
      ? result.body.resources
      : [];
    const canonicalUrls = new Set(
      seller.routes.map((route) => seller.origin + route.path)
    );
    const shadow = topology.legacy_shadows.find(
      (item) => item.seller_id === seller.id
    );
    const shadowUrls = new Map(
      (shadow?.routes || []).map((route) => [seller.origin + route.path, route])
    );

    for (const route of seller.routes) {
      const expectedUrl = seller.origin + route.path;
      if (!resources.some((resource) => resource?.resource === expectedUrl)) {
        problems.push(seller.id + ":canonical_route_missing:" + route.id);
      }
    }
    for (const resource of resources) {
      if (canonicalUrls.has(resource?.resource)) continue;
      const legacy = shadowUrls.get(resource?.resource);
      if (legacy) {
        warnings.push(
          seller.id + ":legacy_shadow:" + legacy.id + ":canonical=" +
            shadow.canonical_seller_id
        );
      } else {
        problems.push(seller.id + ":unowned_resource:" + String(resource?.resource));
      }
    }
    observations.push({
      sellerId: seller.id,
      origin: seller.origin,
      status: result.response?.status ?? null,
      canonicalRouteCount: seller.routes.length,
      observedResourceCount: resources.length,
    });
  }

  return {
    ok: problems.length === 0,
    canonicalRouteCount: topology.canonical_sellers.reduce(
      (total, seller) => total + seller.routes.length,
      0
    ),
    paymentSent: false,
    observations,
    problems,
    warnings,
  };
}

if (require.main === module) {
  verifyProductionTopology()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 2;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}

module.exports = {
  TOPOLOGY_PATH,
  EXPECTED_ORIGINS,
  loadTopology,
  validateTopology,
  verifyProductionTopology,
};
