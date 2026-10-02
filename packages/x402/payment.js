"use strict";

const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x708f7b52b56eafd7fc1de65fc7752ed732914021";
const FACILITATOR = "https://facilitator.payai.network";
const MAX_PAYMENT_HEADER_LENGTH = 16384;
const FACILITATOR_TIMEOUT_MS = 6000;

function encodeHeader(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodePayment(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("invalid_payment_header");
  }
  if (value.length > MAX_PAYMENT_HEADER_LENGTH) {
    throw new Error("payment_header_too_large");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const parsed = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    parsed.x402Version !== 2
  ) {
    throw new Error("invalid_payment_payload");
  }
  return parsed;
}

function requirements(amountAtomic) {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: String(amountAtomic),
    asset: USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: "USD Coin", version: "2" },
  };
}

function paymentDocument({
  resourceUrl,
  amountAtomic,
  description,
  serviceName,
  tags = [],
  inputExample = null,
  outputExample = null,
}) {
  const doc = {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description,
      mimeType: "application/json",
      serviceName,
      tags,
    },
    accepts: [requirements(amountAtomic)],
  };
  if (inputExample || outputExample) {
    doc.extensions = {
      bazaar: {
        info: {
          input: inputExample || { type: "http", method: "GET" },
          output: outputExample || { type: "json", example: {} },
        },
      },
    };
  }
  return doc;
}

function paymentRequiredResponse({
  reason = "payment_required",
  document,
  price,
}) {
  return {
    statusCode: 402,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "PAYMENT-REQUIRED": encodeHeader(document),
      "x402-price": price,
      "x402-asset": "USDC",
      "x402-network": NETWORK,
      "x402-pay-to": PAY_TO,
    },
    body: JSON.stringify({
      error: reason,
      ...document,
      price,
      currency: "USDC",
      network: NETWORK,
      payTo: PAY_TO,
    }),
  };
}

async function fetchWithTimeout(
  fetchImpl,
  url,
  init,
  timeoutMs = FACILITATOR_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function facilitatorPost({
  path,
  paymentPayload,
  paymentRequirements,
  fetchImpl = fetch,
  timeoutMs = FACILITATOR_TIMEOUT_MS,
}) {
  const response = await fetchWithTimeout(
    fetchImpl,
    FACILITATOR + "/" + path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload,
        paymentRequirements,
      }),
    },
    timeoutMs
  );

  let body = null;
  try {
    const value = await response.json();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      body = value;
    }
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function verifyPayment({
  paymentPayload,
  paymentRequirements,
  fetchImpl = fetch,
}) {
  let result;
  try {
    result = await facilitatorPost({
      path: "verify",
      paymentPayload,
      paymentRequirements,
      fetchImpl,
    });
  } catch {
    return { kind: "unresolved", reason: "payment_verifier_unavailable" };
  }

  if (result.body?.isValid === true) {
    return { kind: "valid", detail: result.body };
  }
  if (result.body?.isValid === false) {
    return {
      kind: "terminal",
      reason: String(
        result.body.invalidReason ||
          result.body.errorReason ||
          "payment_verification_failed"
      ),
    };
  }
  return { kind: "unresolved", reason: "payment_verifier_unavailable" };
}

async function settleSamePayment({
  paymentPayload,
  paymentRequirements,
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const waits = [0, 250, 750];

  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt] > 0) await sleepImpl(waits[attempt]);

    let result;
    try {
      result = await facilitatorPost({
        path: "settle",
        paymentPayload,
        paymentRequirements,
        fetchImpl,
      });
    } catch {
      if (attempt === waits.length - 1) {
        return { kind: "unresolved", reason: "settlement_transport_unknown" };
      }
      continue;
    }

    if (result.body?.success === true) {
      return { kind: "settled", receipt: result.body };
    }

    const reason =
      typeof result.body?.errorReason === "string"
        ? result.body.errorReason
        : result.status === 429
          ? "rate_limited"
          : result.status >= 500
            ? "facilitator_unavailable"
            : "payment_settlement_failed";

    if (
      [
        "settlement_pending",
        "duplicate_settlement",
        "rate_limited",
        "facilitator_unavailable",
      ].includes(reason)
    ) {
      if (attempt === waits.length - 1) {
        return { kind: "unresolved", reason };
      }
      continue;
    }

    return { kind: "terminal", reason };
  }

  return { kind: "unresolved", reason: "settlement_unknown" };
}

module.exports = {
  NETWORK,
  USDC,
  PAY_TO,
  FACILITATOR,
  MAX_PAYMENT_HEADER_LENGTH,
  encodeHeader,
  decodePayment,
  requirements,
  paymentDocument,
  paymentRequiredResponse,
  facilitatorPost,
  verifyPayment,
  settleSamePayment,
};
