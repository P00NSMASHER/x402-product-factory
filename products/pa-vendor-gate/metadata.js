"use strict";

const { requirements } = require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument,
} = require("./paid-handler");

const OPERATION_ID = "gatePennsylvaniaVendorIntake";

function catalogResource(publicApiBase) {
  const base = publicApiBase.replace(/\/$/, "");
  const document = productPaymentDocument(base);
  return {
    resource: base + RESOURCE_PATH,
    method: "GET",
    description: document.resource.description,
    price: PRICE,
    tags: document.resource.tags,
    accepts: [requirements(AMOUNT_ATOMIC)],
    extensions: document.extensions,
  };
}

function openApiPath() {
  return {
    get: {
      operationId: OPERATION_ID,
      summary: "Gate a Pennsylvania vendor-intake workflow",
      description:
        "Resolve a prospective vendor to one strong Pennsylvania Department of State entity, compare its registered address with the supplied address through the U.S. Census geocoder, screen the resolved legal name against current OFAC SDN primary names and aliases, and verify domain registration through authoritative RDAP. Returns proceed or human_review, never an automatic rejection. Proceed is not legal/compliance approval, sanctions clearance, fraud scoring, credit approval, good-standing certification, or proof of address/domain control.",
      tags: [
        "Vendor Intake",
        "Pennsylvania Business Registry",
        "Address Consistency",
        "OFAC",
        "RDAP",
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
        price: { mode: "fixed", currency: "USD", amount: "0.020000" },
        protocols: [{ x402: {} }],
        network: "eip155:8453",
        payTo: "0x708f7b52b56eafd7fc1de65fc7752ed732914021",
      },
      responses: {
        200: {
          description:
            "Completed paid vendor-intake decision after successful x402 settlement.",
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
    "# PA Vendor Intake Gate x402",
    "",
    "Purpose: decide whether a Pennsylvania vendor-intake workflow may proceed or must pause for human review.",
    "Paid endpoint: GET " +
      base +
      RESOURCE_PATH +
      "?company=OpenAI%20OpCo&address=600%20North%20Second%20Street%2C%20Suite%20401%2C%20Harrisburg%2C%20PA%2017101&domain=openai.com",
    "Price: $0.020 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; U.S. Census Bureau Geocoding Services; current U.S. Treasury OFAC SDN/ALT files; IANA RDAP bootstrap plus authoritative registry RDAP.",
    "Returns: proceed or human_review with ordered review triggers and source evidence. There is no automatic rejection.",
    "Proceed is not legal/compliance approval, sanctions clearance, fraud/credit approval, good-standing certification, proof of address control, or proof of domain ownership.",
    "The historical name query is accepted as a compatibility alias for company.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE rather than creating a new payment authorization.",
  ].join("\n");
}

module.exports = {
  OPERATION_ID,
  catalogResource,
  openApiPath,
  llmsText,
};
