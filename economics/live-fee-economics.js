"use strict";

// Read-only, fee-only economics. Do not confuse a fee-only margin ceiling
// with measured profit, free-credit availability, demand, or authorization to
// change pricing, purchase credits, deploy, or create another numbered product.
const registry = require("../product-registry.json");
const saved = require("./payai-base-rate-2026-10-10.json");

const PRICING_URL = "https://facilitator.payai.network/pricing";
const NETWORK = "eip155:8453";
const SCHEME = "exact";
const METHOD = "eip3009";
const MARGIN_TARGET_PERCENT = 70;
const MAX_RATE_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_HTTP_BYTES = 262144;

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function micros(amount, {allowZero=true}={}) {
  if (typeof amount !== "string" || !/^(0|[1-9]\d{0,10})(?:\.\d{1,6})?$/.test(amount)) {
    reject("ECONOMICS_INVALID_USD_AMOUNT");
  }
  const [whole, fraction=""] = amount.split(".");
  const result = BigInt(whole)*1000000n + BigInt((fraction+"000000").slice(0,6));
  if (!allowZero && result <= 0n) reject("ECONOMICS_NONPOSITIVE_AMOUNT");
  return result;
}
function formatMicros(amount) {
  if (typeof amount !== "bigint") reject("ECONOMICS_INVALID_BIGINT");
  const sign = amount < 0n ? "-" : "";
  const positive = amount < 0n ? -amount : amount;
  return sign + (positive / 1000000n).toString() + "." +
    (positive % 1000000n).toString().padStart(6, "0");
}
function centiCredits(text) {
  if (typeof text !== "string" || !/^(0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(text)) {
    reject("ECONOMICS_INVALID_CREDIT_RATE");
  }
  const [whole, fraction=""] = text.split(".");
  return BigInt(whole)*100n + BigInt((fraction+"00").slice(0,2));
}
function checkedTimestamp(value, label) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value))) reject(label);
  return Date.parse(value);
}
function validatePricing(payload, {requireFresh=false, nowMs=Date.now()}={}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !Array.isArray(payload.rates) || payload.rates.length > 100 ||
      !Array.isArray(payload.upcoming) || payload.upcoming.length > 100 ||
      !Number.isSafeInteger(payload.marginBps) ||
      payload.marginBps < 0 || payload.marginBps > 10000 ||
      !Number.isFinite(nowMs)) reject("ECONOMICS_INVALID_PROVIDER_PAYLOAD");
  const asOfMs = checkedTimestamp(payload.asOf,"ECONOMICS_INVALID_PROVIDER_TIMESTAMP");
  if (asOfMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) reject("ECONOMICS_FUTURE_PROVIDER_TIMESTAMP");
  if (requireFresh && (asOfMs > nowMs || nowMs - asOfMs > MAX_RATE_AGE_MS)) {
    reject("ECONOMICS_PROVIDER_SNAPSHOT_STALE");
  }
  const matches = payload.rates.filter(rate => rate &&
    rate.network === NETWORK && rate.scheme === SCHEME &&
    rate.transferMethod === METHOD);
  if (matches.length !== 1 || matches[0].published !== true) {
    reject("ECONOMICS_BASE_RATE_MISSING_DUPLICATE_OR_UNPUBLISHED");
  }
  const rate = matches[0];
  const publishedAt = checkedTimestamp(rate.effectiveAt,"ECONOMICS_INVALID_RATE_EFFECTIVE_AT");
  if (publishedAt > asOfMs) reject("ECONOMICS_RATE_NOT_YET_EFFECTIVE");
  if (typeof rate.rateId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rate.rateId)) {
    reject("ECONOMICS_INVALID_PROVIDER_RATE_ID");
  }
  const creditUsdMicros = micros(payload.creditUsd,{allowZero:false});
  const feeMicros = micros(rate.usd,{allowZero:false});
  const creditsInHundredths = centiCredits(rate.credits);
  if (creditsInHundredths <= 0n ||
      creditUsdMicros * creditsInHundredths % 100n !== 0n ||
      (creditUsdMicros * creditsInHundredths / 100n) !== feeMicros) {
    reject("ECONOMICS_RATE_CREDITS_USD_DISAGREE");
  }
  for (const upcoming of payload.upcoming) {
    if (!upcoming || typeof upcoming !== "object") {
      reject("ECONOMICS_INVALID_UPCOMING_RATE");
    }
    if (upcoming.network === NETWORK && upcoming.scheme === SCHEME &&
        upcoming.transferMethod === METHOD) {
      const effective = checkedTimestamp(upcoming.effectiveAt,
        "ECONOMICS_INVALID_UPCOMING_RATE");
      if (effective <= nowMs) reject("ECONOMICS_UNAPPLIED_EFFECTIVE_UPCOMING_RATE");
    }
  }
  return {
    provider_as_of:payload.asOf,
    rate_effective_at:rate.effectiveAt,
    rate_id:rate.rateId,
    network:NETWORK,
    scheme:SCHEME,
    transfer_method:METHOD,
    credits_per_settlement:rate.credits,
    credit_usd:payload.creditUsd,
    fee_usd:formatMicros(feeMicros),
    fee_micros:feeMicros,
    credits_centis:creditsInHundredths
  };
}
function validateRegistry(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.products) ||
      data.products.length !== 24) reject("ECONOMICS_REGISTRY_SCOPE_CHANGED");
  const ids = new Set(), numbers = new Set(), routes = new Set();
  for (const item of data.products) {
    if (!item || !/^\d{3}$/.test(item.number || "") ||
        Number(item.number) < 1 || Number(item.number) > 24 ||
        typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id) ||
        typeof item.status !== "string" || typeof item.path !== "string" ||
        item.method !== "GET" ||
        micros(item.price_usdc,{allowZero:false}) > 100000000n ||
        ids.has(item.id) || numbers.has(item.number) || routes.has(item.path)) {
      reject("ECONOMICS_INVALID_OR_DUPLICATE_REGISTRY_ENTRY");
    }
    ids.add(item.id); numbers.add(item.number); routes.add(item.path);
  }
  for (let i=1;i<=24;i++) {
    if (!numbers.has(String(i).padStart(3,"0"))) reject("ECONOMICS_REGISTRY_NUMBER_GAP");
  }
  return data.products.slice().sort((a,b)=>a.number.localeCompare(b.number));
}
function buildReport(pricing, {
  products=registry, freeAllowanceCredits=1000, requireFresh=false,
  nowMs=Date.now(), rateObservation="historical_pinned_snapshot"
}={}) {
  if (!Number.isSafeInteger(freeAllowanceCredits) ||
      freeAllowanceCredits < 0 || freeAllowanceCredits > 10000000) {
    reject("ECONOMICS_INVALID_FREE_ALLOWANCE");
  }
  const rate = validatePricing(pricing,{requireFresh,nowMs});
  const all = validateRegistry(products);
  const fee = rate.fee_micros;
  // Exact integer ceil(fee / 0.30), not a proposed price or price update.
  const minimumPriceForFeeOnly70Pct = (fee*100n + 29n)/30n;
  const entries = all.map(item => {
    const price = micros(item.price_usdc,{allowZero:false});
    const ceiling = price-fee;
    const targetPossibleBeforeOtherCosts = ceiling*100n >= price*BigInt(MARGIN_TARGET_PERCENT);
    const basisPointsCeiling = ceiling*10000n/price;
    return {
      number:item.number,
      id:item.id,
      registry_status:item.status,
      registered_price_usdc:item.price_usdc,
      paid_facilitator_fee_usd:rate.fee_usd,
      fee_only_contribution_ceiling_usd:formatMicros(ceiling),
      fee_only_margin_ceiling_basis_points:Number(basisPointsCeiling),
      price_below_paid_facilitator_fee:price < fee,
      target_margin_possible_before_other_costs:targetPossibleBeforeOtherCosts,
      complete_unit_economics:false,
      actual_profitability_verified:false,
      live_product_availability_verified:false
    };
  });
  const fullyUntouchedCreditsInHundredths = BigInt(freeAllowanceCredits)*100n;
  const maximumUntouchedDefaultAllowanceSettlements =
    fullyUntouchedCreditsInHundredths / rate.credits_centis;
  const below = entries.filter(x=>x.price_below_paid_facilitator_fee);
  const possible = entries.filter(x=>x.target_margin_possible_before_other_costs);
  return {
    schema_version:1,
    report_type:"fee_only_ceiling_not_actual_profit_or_revenue",
    source_url:PRICING_URL,
    rate_observation:rateObservation,
    provider_as_of:rate.provider_as_of,
    network:NETWORK, scheme:SCHEME,transfer_method:METHOD,
    selected_rate_id:rate.rate_id,
    selected_rate_effective_at:rate.rate_effective_at,
    paid_facilitator_fee_usd:rate.fee_usd,
    target_margin_percent:MARGIN_TARGET_PERCENT,
    minimum_price_to_reach_fee_only_target_usdc:formatMicros(minimumPriceForFeeOnly70Pct),
    free_allowance_model:{
      default_lifetime_credits:freeAllowanceCredits,
      maximum_settlements_if_entire_default_allowance_unspent:
        Number(maximumUntouchedDefaultAllowanceSettlements),
      shared_allowance_can_exhaust_earlier:true,
      legacy_wallet_allowance_can_differ:true,
      specific_seller_wallet_entitlement_verified:false,
      specific_seller_wallet_remaining_credits:null,
      zero_facilitator_fee_scenario_only_when_allowance_verified:true
    },
    cost_coverage:{
      facilitator_paid_fee:true,
      hosting:false,
      source_provider_variable_costs:false,
      failed_requests_retries_refunds:false,
      development_distribution_support:false
    },
    summary:{
      registered_products:entries.length,
      prices_below_paid_fee:below.length,
      below_fee_product_numbers:below.map(x=>x.number),
      fee_only_target_possible_count:possible.length,
      fee_only_target_possible_numbers:possible.map(x=>x.number),
      fee_only_target_impossible_count:entries.length-possible.length,
      actual_profitable_products_verified:0,
      independent_external_buyers_verified:0
    },
    price_changes_applied:false,
    product_025_unlocked:false,
    entries
  };
}
function savedSnapshot() {
  if (saved.schema_version !== 1 ||
      saved.source_url !== PRICING_URL ||
      saved.snapshot_is_historical !== true ||
      saved.seller_wallet_entitlement_verified !== false ||
      saved.seller_wallet_specific_remaining_credits !== null ||
      saved.published_free_credit_terms?.default_lifetime_credits_per_receiving_wallet !== 1000) {
    reject("ECONOMICS_SAVED_RATE_PROVENANCE_INVALID");
  }
  return saved.provider_response_subset;
}
async function fetchPricing({fetchImpl=fetch,timeoutMs=8000}={}) {
  if (typeof fetchImpl !== "function" ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    reject("ECONOMICS_INVALID_HTTP_CONFIGURATION");
  }
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetchImpl(PRICING_URL,{
      method:"GET",headers:{accept:"application/json"},
      redirect:"error",signal:controller.signal
    });
    if (!response || !response.ok ||
        typeof response.text !== "function") reject("ECONOMICS_PRICING_HTTP_FAILED");
    const body = await response.text();
    if (typeof body !== "string" ||
        Buffer.byteLength(body,"utf8") > MAX_HTTP_BYTES) {
      reject("ECONOMICS_PRICING_BODY_TOO_LARGE");
    }
    let json;
    try {json=JSON.parse(body);}catch{reject("ECONOMICS_PRICING_NOT_JSON");}
    return json;
  } finally {clearTimeout(timer);}
}
async function main(args=process.argv.slice(2)) {
  if (args.length !== 1 ||
      !["--check","--snapshot","--live"].includes(args[0])) {
    reject("ECONOMICS_USAGE_CHECK_SNAPSHOT_OR_LIVE");
  }
  const mode = args[0];
  const live = mode === "--live";
  const payload = live ? await fetchPricing() : savedSnapshot();
  const report = buildReport(payload,{
    requireFresh:live,
    rateObservation:live ? "fresh_public_read_only_get" : "historical_pinned_snapshot"
  });
  if (mode === "--check") {
    const {summary,provider_as_of,selected_rate_id,paid_facilitator_fee_usd} = report;
    process.stdout.write(JSON.stringify({
      ok:true,snapshot_historical:true,provider_as_of,selected_rate_id,
      paid_facilitator_fee_usd,summary,automatic_price_changes:false
    },null,2)+"\n");
  } else {
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
  }
}
if(require.main===module) {
  main().catch(error=>{
    const code = typeof error?.code === "string" && /^ECONOMICS_[A-Z0-9_]+$/.test(error.code)
      ? error.code : "ECONOMICS_UNVERIFIED";
    process.stderr.write(code+"\n");
    process.exitCode=1;
  });
}
module.exports={
  PRICING_URL,NETWORK,SCHEME,METHOD,MAX_RATE_AGE_MS,
  micros,formatMicros,centiCredits,validatePricing,validateRegistry,
  savedSnapshot,buildReport,fetchPricing,main
};
