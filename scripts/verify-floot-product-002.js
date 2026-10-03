"use strict";

const BASE = "https://pa-entity-x402.floot.app";
const RESOURCE_PATH = "/_api/vendor-intake-gate";
const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x708f7b52b56eafd7fc1de65fc7752ed732914021";
const AMOUNT = "20000";
const PRICE = "$0.020";
const QUERY =
  "name=OpenAI%20OpCo&address=600%20North%20Second%20Street%2C%20Suite%20401%2C%20Harrisburg%2C%20PA%2017101&domain=openai.com";

function decodeBase64Json(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function request(fetchImpl, url, init = {}) {
  try {
    const response = await fetchImpl(url, init);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { response, text, json, error: null };
  } catch (error) {
    return {
      response: null,
      text: "",
      json: null,
      error: error?.message || String(error),
    };
  }
}

function requirementProblems(prefix, accept) {
  const problems = [];
  if (!accept) return [prefix + ":missing"];
  if (accept.scheme !== "exact") problems.push(prefix + ":scheme");
  if (accept.network !== NETWORK) problems.push(prefix + ":network");
  if (accept.amount !== AMOUNT) problems.push(prefix + ":amount");
  if (String(accept.asset).toLowerCase() !== USDC.toLowerCase()) {
    problems.push(prefix + ":asset");
  }
  if (String(accept.payTo).toLowerCase() !== PAY_TO.toLowerCase()) {
    problems.push(prefix + ":payto");
  }
  if (accept.extra?.name !== "USD Coin") problems.push(prefix + ":eip712_name");
  if (accept.extra?.version !== "2") problems.push(prefix + ":eip712_version");
  return problems;
}

async function verifyFlootProduct002({ base = BASE, fetchImpl = fetch } = {}) {
  const normalizedBase = base.replace(/\/$/, "");
  const routeUrl = normalizedBase + RESOURCE_PATH;
  const deploymentProblems = [];
  const preflightProblems = [];

  const catalogResult = await request(
    fetchImpl,
    normalizedBase + "/.well-known/x402",
    { headers: { accept: "application/json" } }
  );
  if (catalogResult.error) deploymentProblems.push("catalog_transport");
  else if (catalogResult.response.status !== 200) {
    deploymentProblems.push("catalog_status:" + catalogResult.response.status);
  }

  const resources = Array.isArray(catalogResult.json?.resources)
    ? catalogResult.json.resources
    : [];
  const resource = resources.find((item) => item?.resource === routeUrl) || null;
  if (!resource) {
    deploymentProblems.push("catalog_route_missing");
  } else {
    if (resource.price !== PRICE) deploymentProblems.push("catalog_price");
    deploymentProblems.push(
      ...requirementProblems("catalog_accept", resource.accepts?.[0])
    );
    if (!resource.extensions?.bazaar) {
      deploymentProblems.push("catalog_bazaar_missing");
    }
  }

  const openapiResult = await request(
    fetchImpl,
    normalizedBase + "/openapi.json",
    { headers: { accept: "application/json" } }
  );
  if (openapiResult.error) deploymentProblems.push("openapi_transport");
  else if (openapiResult.response.status !== 200) {
    deploymentProblems.push("openapi_status:" + openapiResult.response.status);
  }
  const operation = openapiResult.json?.paths?.[RESOURCE_PATH]?.get;
  if (!operation) {
    deploymentProblems.push("openapi_route_missing");
  } else {
    if (operation["x-payment-info"]?.price?.amount !== "0.020000") {
      deploymentProblems.push("openapi_price");
    }
    if (operation["x-payment-info"]?.network !== NETWORK) {
      deploymentProblems.push("openapi_network");
    }
    if (
      !Array.isArray(operation["x-payment-info"]?.protocols) ||
      !operation["x-payment-info"].protocols.some((item) => item?.x402)
    ) {
      deploymentProblems.push("openapi_x402_protocol_missing");
    }
    if (
      String(operation["x-payment-info"]?.payTo).toLowerCase() !==
      PAY_TO.toLowerCase()
    ) {
      deploymentProblems.push("openapi_payto");
    }
  }

  const unpaidResult = await request(fetchImpl, routeUrl + "?" + QUERY, {
    headers: { accept: "application/json" },
  });
  if (unpaidResult.error) deploymentProblems.push("unpaid_transport");
  else {
    if (unpaidResult.response.status !== 402) {
      deploymentProblems.push("unpaid_status:" + unpaidResult.response.status);
    }
    const contentType = unpaidResult.response.headers.get("content-type") || "";
    if (!/application\/json/i.test(contentType)) {
      deploymentProblems.push("unpaid_content_type");
    }
    if (unpaidResult.json?.x402Version !== 2) {
      deploymentProblems.push("unpaid_x402_version");
    }
    deploymentProblems.push(
      ...requirementProblems("unpaid_accept", unpaidResult.json?.accepts?.[0])
    );
    const headerDocument = decodeBase64Json(
      unpaidResult.response.headers.get("payment-required")
    );
    if (!headerDocument) {
      deploymentProblems.push("payment_required_header_missing");
    } else {
      if (headerDocument.resource?.url !== routeUrl) {
        deploymentProblems.push("payment_required_resource");
      }
      deploymentProblems.push(
        ...requirementProblems(
          "payment_required_accept",
          headerDocument.accepts?.[0]
        )
      );
      if (!headerDocument.extensions?.bazaar) {
        deploymentProblems.push("payment_required_bazaar_missing");
      }
    }
  }

  const optionsResult = await request(fetchImpl, routeUrl, {
    method: "OPTIONS",
    headers: {
      origin: "https://agent.example",
      "access-control-request-method": "GET",
      "access-control-request-headers": "PAYMENT-SIGNATURE",
    },
  });
  if (optionsResult.error) preflightProblems.push("options_transport");
  else {
    if (![200, 204].includes(optionsResult.response.status)) {
      preflightProblems.push("options_status:" + optionsResult.response.status);
    }
    if (
      !/GET/i.test(
        optionsResult.response.headers.get("access-control-allow-methods") || ""
      )
    ) {
      preflightProblems.push("options_get_missing");
    }
    if (
      !/PAYMENT-SIGNATURE/i.test(
        optionsResult.response.headers.get("access-control-allow-headers") || ""
      )
    ) {
      preflightProblems.push("options_payment_header_missing");
    }
  }

  const problems = [...deploymentProblems, ...preflightProblems];
  return {
    auditCompleted: true,
    deployed: deploymentProblems.length === 0,
    ready: problems.length === 0,
    checkedAt: new Date().toISOString(),
    base: normalizedBase,
    route: RESOURCE_PATH,
    expected: {
      price: PRICE,
      amount: AMOUNT,
      network: NETWORK,
      asset: USDC,
      payTo: PAY_TO,
    },
    observations: {
      catalogStatus: catalogResult.response?.status ?? null,
      catalogRoutePresent: Boolean(resource),
      openapiStatus: openapiResult.response?.status ?? null,
      openapiRoutePresent: Boolean(operation),
      unpaidStatus: unpaidResult.response?.status ?? null,
      unpaidContentType:
        unpaidResult.response?.headers.get("content-type") ?? null,
      optionsStatus: optionsResult.response?.status ?? null,
    },
    deploymentProblems,
    preflightProblems,
    problems,
  };
}

if (require.main === module) {
  const requireReady = process.argv.includes("--require-ready");
  verifyFlootProduct002()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (requireReady && !result.ready) process.exitCode = 2;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}

module.exports = {
  BASE,
  RESOURCE_PATH,
  NETWORK,
  USDC,
  PAY_TO,
  AMOUNT,
  PRICE,
  decodeBase64Json,
  requirementProblems,
  verifyFlootProduct002,
};
