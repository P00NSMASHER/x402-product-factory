"use strict";

const {
  encodeHeader,
  decodePayment,
  requirements,
  paymentDocument,
  paymentRequiredResponse,
  verifyPayment,
  settleSamePayment,
} = require("../../packages/x402/payment");
const { validateVendorIntakeInput } = require("./service");

const AMOUNT_ATOMIC = "20000";
const PRICE = "$0.020";
const RESOURCE_PATH = "/api/vendor-intake-gate";

function header(event, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(event?.headers || {})) {
    if (key.toLowerCase() === wanted && value != null) return String(value);
  }
  return undefined;
}

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-expose-headers":
        "PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function temporaryPaymentFailure(reason) {
  return json(
    503,
    {
      error: reason,
      paymentState: "unresolved",
      retrySamePayment: true,
    },
    { "Retry-After": "2" }
  );
}

function productPaymentDocument(publicApiBase) {
  return paymentDocument({
    resourceUrl: publicApiBase.replace(/\/$/, "") + RESOURCE_PATH,
    amountAtomic: AMOUNT_ATOMIC,
    description:
      "Decide whether a Pennsylvania vendor-intake workflow may proceed or requires human review using registry identity, Census address consistency, OFAC candidate screening, and authoritative RDAP registration evidence. Proceed is not legal or compliance approval.",
    serviceName: "PA Vendor Intake Gate",
    tags: [
      "vendor-intake",
      "pennsylvania-business",
      "address-check",
      "ofac",
      "rdap",
    ],
    inputExample: {
      type: "http",
      method: "GET",
      queryParams: {
        company: "OpenAI OpCo",
        address:
          "600 North Second Street, Suite 401, Harrisburg, PA 17101",
        domain: "openai.com",
      },
    },
    outputExample: {
      type: "json",
      example: {
        decision: "proceed",
        agentAction: "continue_vendor_intake",
        reviewTriggers: [],
        paid: true,
      },
    },
  });
}

function createPaidVendorIntakeHandler({
  service,
  publicApiBase,
  fetchImpl = fetch,
}) {
  if (!service || typeof service.check !== "function") {
    throw new TypeError("service.check() is required");
  }
  if (typeof publicApiBase !== "string" || !/^https:\/\//.test(publicApiBase)) {
    throw new TypeError("https publicApiBase is required");
  }

  const paymentRequirements = requirements(AMOUNT_ATOMIC);
  const document = productPaymentDocument(publicApiBase);

  return async function handle({ query = {}, event = {} } = {}) {
    const signature =
      header(event, "payment-signature") ?? header(event, "x-payment");

    if (!signature) {
      return paymentRequiredResponse({ document, price: PRICE });
    }

    let paymentPayload;
    try {
      paymentPayload = decodePayment(signature);
    } catch (error) {
      const reason =
        error?.message === "payment_header_too_large"
          ? "payment_header_too_large"
          : error?.message === "invalid_payment_payload"
            ? "invalid_payment_payload"
            : "invalid_payment_header";
      return paymentRequiredResponse({ reason, document, price: PRICE });
    }

    let normalized;
    try {
      normalized = validateVendorIntakeInput({
        company: query.company ?? query.name ?? "",
        address: query.address ?? "",
        domain: query.domain ?? "",
      });
    } catch (error) {
      return json(400, {
        error: "invalid_request",
        detail: error?.message || "invalid_input",
      });
    }

    const verification = await verifyPayment({
      paymentPayload,
      paymentRequirements,
      fetchImpl,
    });
    if (verification.kind === "unresolved") {
      return temporaryPaymentFailure(verification.reason);
    }
    if (verification.kind === "terminal") {
      return paymentRequiredResponse({
        reason: verification.reason,
        document,
        price: PRICE,
      });
    }

    let result;
    try {
      result = await service.check(normalized);
    } catch {
      return json(502, {
        error: "required_source_unavailable",
        chargeable: false,
      });
    }

    if (
      result?.chargeable !== true ||
      (Array.isArray(result?.sourceFailures) &&
        result.sourceFailures.length > 0)
    ) {
      return json(502, {
        error: "required_source_unavailable",
        sourceFailures: result?.sourceFailures || [],
        checkedAt: result?.checkedAt ?? null,
        chargeable: false,
      });
    }

    const settlement = await settleSamePayment({
      paymentPayload,
      paymentRequirements,
      fetchImpl,
    });
    if (settlement.kind === "unresolved") {
      return temporaryPaymentFailure(settlement.reason);
    }
    if (settlement.kind === "terminal") {
      return paymentRequiredResponse({
        reason: settlement.reason,
        document,
        price: PRICE,
      });
    }

    return json(
      200,
      { ...result, paid: true, price: PRICE },
      {
        "PAYMENT-RESPONSE": encodeHeader(settlement.receipt),
        "x402-settled": "true",
      }
    );
  };
}

module.exports = {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
  createPaidVendorIntakeHandler,
};
