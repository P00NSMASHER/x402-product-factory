"use strict";

const { requirements } = require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
} = require("./paid-handler");

const OPERATION_ID = "matchPennsylvaniaVendorIdentity";

function catalogResource(publicApiBase) {
  const base = publicApiBase.replace(/\/$/, "");
  const doc = productPaymentDocument(base);
  return {
    resource: base + RESOURCE_PATH,
    method: "GET",
    description: doc.resource.description,
    price: PRICE,
    tags: doc.resource.tags,
    accepts: [requirements(AMOUNT_ATOMIC)],
    extensions: doc.extensions,
  };
}

function openApiPath() {
  return {
    get: {
      operationId: OPERATION_ID,
      summary: "Check Pennsylvania vendor identity consistency",
      description:
        "Compare a prospective Pennsylvania vendor company name, address, and domain against Pennsylvania Department of State registry data, U.S. Census address normalization, and authoritative RDAP. Returns consistent or human_review. This is an identity-consistency check, not legal/compliance approval, sanctions screening, fraud scoring, credit analysis, good-standing certification, proof of address control, or proof of domain ownership.",
      tags: [
        "Vendor Identity",
        "Pennsylvania Business Registry",
        "Address Consistency",
        "Domain Identity",
      ],
      parameters: [
        {
          name: "company",
          in: "query",
          required: true,
          schema: { type: "string", minLength: 2, maxLength: 120 },
          example: "OpenAI OpCo",
        },
        {
          name: "address",
          in: "query",
          required: true,
          schema: { type: "string", minLength: 5, maxLength: 240 },
          example:
            "600 North Second Street, Suite 401, Harrisburg, PA 17101",
        },
        {
          name: "domain",
          in: "query",
          required: true,
          schema: { type: "string", minLength: 3, maxLength: 253 },
          example: "openai.com",
        },
      ],
      "x-payment-info": {
        price: { mode: "fixed", currency: "USD", amount: "0.005000" },
        protocols: [{ x402: {} }],
        network: "eip155:8453",
        payTo: "0x708f7b52b56eafd7fc1de65fc7752ed732914021",
      },
      responses: {
        200: {
          description:
            "Completed paid identity-consistency check after successful x402 settlement. Decision is consistent or human_review.",
        },
        400: {
          description:
            "Invalid company, address, or domain input. Payment is not settled.",
        },
        402: {
          description:
            "Payment required or terminally invalid. Includes PAYMENT-REQUIRED.",
        },
        502: {
          description:
            "A required authoritative source was unavailable. Payment is not settled.",
        },
        503: {
          description:
            "Payment verification or settlement is unresolved. Retry the same payment authorization.",
        },
      },
    },
  };
}

function llmsText(publicApiBase) {
  const base = publicApiBase.replace(/\/$/, "");
  return [
    "# PA Vendor Identity Match x402",
    "",
    "Purpose: check whether a supplied Pennsylvania vendor company name, address, and domain are mutually consistent with public identity evidence.",
    "Paid endpoint: GET " +
      base +
      RESOURCE_PATH +
      "?company=OpenAI%20OpCo&address=600%20North%20Second%20Street%2C%20Suite%20401%2C%20Harrisburg%2C%20PA%2017101&domain=openai.com",
    "Price: $0.005 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services; IANA RDAP bootstrap plus authoritative registry RDAP.",
    "Returns: consistent or human_review with reason codes and source evidence.",
    "A consistent result is not legal/compliance approval, sanctions clearance, fraud/credit approval, good-standing certification, proof of address control, or proof of domain ownership.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE rather than creating a new payment authorization.",
  ].join("\n");
}

module.exports = {
  OPERATION_ID,
  catalogResource,
  openApiPath,
  llmsText,
};
