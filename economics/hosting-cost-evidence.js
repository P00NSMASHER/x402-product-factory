"use strict";

// Exact-micro-USD, read-only bridge between observed Supabase function logs
// and OPTIONAL operator-supplied billing evidence. Neither an invoice
// transcription nor a prorated model proves actual per-sale hosting cost.
const fs = require("node:fs");
const path = require("node:path");
const {micros, formatMicros} = require("./live-fee-economics");
const {analyzeUsage, validateAggregates, readPrivateAggregates} =
  require("./supabase-usage-readiness");

const PROJECT = "bvjtimsalbzkmulyinpg";
const FUNCTION = "x402-data-tools";
const INVOICE_SOURCE = "operator_private_supabase_invoice_transcription";
const MAX_INVOICE_BYTES = 65536;
const MAX_INVOICE_PERIOD_MS = 32 * 86400000;
const ROOT = path.resolve(__dirname, "..");
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const PLAN_VALUES = new Set(["free","pro","team","enterprise","unknown"]);

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}
function isObject(value, keys) {
  return !!value && typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.slice().sort().join(",");
}
function parseTime(value) {
  if (typeof value !== "string" || !TIMESTAMP.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0,19) !== value.slice(0,19)) {
    fail("HOSTING_INVALID_UTC_TIMESTAMP");
  }
  return Date.parse(value);
}
function validateInvoice(invoice, usage) {
  if (!isObject(invoice, [
    "schema_version", "source", "project_ref", "function_slug",
    "billing_period_start", "billing_period_end", "invoice_reference",
    "organization_invocations_reported", "organization_function_invocation_charge_usd",
    "invoice_authenticity"
  ]) || invoice.schema_version !== 1 ||
      invoice.source !== INVOICE_SOURCE ||
      invoice.project_ref !== PROJECT ||
      invoice.function_slug !== FUNCTION ||
      invoice.invoice_authenticity !== "operator_supplied_not_verified" ||
      typeof invoice.invoice_reference !== "string" ||
      !REF.test(invoice.invoice_reference) ||
      !Number.isSafeInteger(invoice.organization_invocations_reported) ||
      invoice.organization_invocations_reported < 1 ||
      invoice.organization_invocations_reported > 10000000000) {
    fail("HOSTING_INVALID_INVOICE_CONTRACT");
  }
  const begin = parseTime(invoice.billing_period_start);
  const end = parseTime(invoice.billing_period_end);
  if (end <= begin || end - begin > MAX_INVOICE_PERIOD_MS) {
    fail("HOSTING_INVOICE_PERIOD_INVALID");
  }
  const usageStart = parseTime(usage.window_start);
  const usageEnd = parseTime(usage.window_end);
  if (usageStart < begin || usageEnd > end) {
    fail("HOSTING_LOG_WINDOW_OUTSIDE_INVOICE_PERIOD");
  }
  if (invoice.organization_invocations_reported <
      analyzeUsage(usage).totals.non_options_potentially_billable) {
    fail("HOSTING_INVOICE_DENOMINATOR_INCONSISTENT");
  }
  let amount;
  try {
    amount = micros(invoice.organization_function_invocation_charge_usd);
  } catch {
    fail("HOSTING_INVOICE_AMOUNT_INVALID");
  }
  // A zero line item may be possible within quota, but an asserted zero
  // must never be treated as authenticated evidence of free marginal cost.
  return {
    amountMicros: amount,
    invoiceReference: invoice.invoice_reference,
    organizationInvocations: invoice.organization_invocations_reported
  };
}
function validateContext(context) {
  if (!isObject(context, ["schema_version", "project_ref", "function_slug",
    "organization_plan", "plan_observation"]) ||
      context.schema_version !== 1 ||
      context.project_ref !== PROJECT ||
      context.function_slug !== FUNCTION ||
      !PLAN_VALUES.has(context.organization_plan) ||
      context.plan_observation !== "operator_observed_connected_supabase_metadata") {
    fail("HOSTING_CONTEXT_INVALID");
  }
  return context;
}
function allocateFloor(amountMicros, usageCount, organizationCount) {
  if (typeof amountMicros !== "bigint" ||
      amountMicros < 0n ||
      !Number.isSafeInteger(usageCount) || usageCount < 0 ||
      !Number.isSafeInteger(organizationCount) ||
      organizationCount < 1 ||
      usageCount > organizationCount) {
    fail("HOSTING_ALLOCATION_INPUT_INVALID");
  }
  // This is merely a deterministic PRO-RATA WHAT-IF model. Supabase's
  // organization-wide quota, packages and shared project billing make
  // this unsuitable for actual incremental per-request accounting.
  return amountMicros * BigInt(usageCount) / BigInt(organizationCount);
}
function analyzeHostingEvidence(usageSnapshot, {
  context = {
    schema_version: 1,
    project_ref: PROJECT,
    function_slug: FUNCTION,
    organization_plan: "unknown",
    plan_observation: "operator_observed_connected_supabase_metadata"
  },
  invoice = null
} = {}) {
  const usage = validateAggregates(usageSnapshot);
  const scope = validateContext(context);
  const analysis = analyzeUsage(usage);
  if (analysis.function_slug !== FUNCTION) fail("HOSTING_FUNCTION_SCOPE_MISMATCH");
  const statement = invoice === null ? null : validateInvoice(invoice, usage);
  const hypotheticalShare = statement === null ? null :
    allocateFloor(statement.amountMicros,
      analysis.totals.non_options_potentially_billable,
      statement.organizationInvocations);
  const routes = analysis.canonical_paid_routes.map(route => {
    const count = route.invocations - route.options;
    if (count < 0 || !Number.isSafeInteger(count)) {
      fail("HOSTING_INVALID_ROUTE_INVOCATIONS");
    }
    return {
      route: route.route,
      tool_id: route.id,
      observed_non_options_invocations_not_sales: count,
      observed_unpaid_402_challenges: route.unpaid_402_challenges,
      observed_http_200_unverified: route.paid_200_unverified,
      hypothetical_pro_rata_invoice_share_usd: statement === null ? null :
        formatMicros(allocateFloor(statement.amountMicros,
          count, statement.organizationInvocations)),
      actual_billed_function_cost_usd: null,
      actual_hosting_cost_per_confirmed_sale_usd: null,
      independently_verified_sales: null
    };
  });
  const counted = routes.reduce((sum,row) =>
    sum + row.observed_non_options_invocations_not_sales, 0);
  if (counted !== analysis.paid_routes_total_invocations -
      analysis.canonical_paid_routes.reduce((sum,row)=>sum+row.options,0)) {
    fail("HOSTING_ROUTE_TOTALS_DISAGREEMENT");
  }
  const blockers = [
    ...(!statement ? ["actual_supabase_invoice_absent"] :
      ["supabase_invoice_transcription_not_independently_authenticated"]),
    "complete_organization_and_billing_period_usage_not_verified",
    "monthly_included_quota_and_package_charges_not_reconciled",
    "shared_project_function_specific_charge_not_attributable",
    "upstream_source_provider_costs_and_retry_refunds_unverified",
    "confirmed_paid_settlements_and_external_sales_unverified",
    "numbered_factory_products_have_separate_deployment_economics"
  ];
  return {
    schema_version: 1,
    report_type: "bounded_hosting_observation_and_invoice_hypothesis_not_unit_profit",
    project_ref: PROJECT,
    function_slug: FUNCTION,
    organization_plan_reported: scope.organization_plan,
    organization_plan_independently_reverified_by_this_program: false,
    observation_window: analysis.observation_window,
    observation_coverage: "partial_observed_function_logs_not_billing_ledger",
    observed: {
      function_invocations: analysis.totals.observed_invocations,
      potentially_billable_non_options_invocations:
        analysis.totals.non_options_potentially_billable,
      paid_402_challenges: analysis.totals.paid_402_challenges,
      paid_http_200_unverified: analysis.totals.paid_200_unverified,
      public_discovery_http_200: analysis.totals.discovery_200,
      other_responses: analysis.totals.other,
      options_not_billed_under_published_rules: analysis.totals.options
    },
    invoice: {
      supplied: !!statement,
      source: statement ? INVOICE_SOURCE : null,
      provider_authenticity_verified: false,
      organization_invocations_reported: statement ?
        statement.organizationInvocations : null,
      organization_charge_usd_reported: statement ?
        formatMicros(statement.amountMicros) : null,
      hypothetical_pro_rata_observed_function_share_usd:
        statement ? formatMicros(hypotheticalShare) : null,
      allocation_basis: statement ?
        "illustrative_equal_average_across_reported_org_invocations_not_actual_marginal_cost" :
        "not_computed_without_invoice",
      actual_x402_function_charge_usd: null,
      actual_invoice_charges_verified: false
    },
    canonical_supabase_routes: routes,
    evidence_status: "blocked_for_real_unit_economics",
    blockers,
    actual_invoice_cost_per_confirmed_sale_usd: null,
    actual_source_api_cost_per_confirmed_sale_usd: null,
    actual_retry_refund_cost_per_confirmed_sale_usd: null,
    actual_net_margin_percent: null,
    catalog_products_001_024_costs_inferred_from_this_function: false,
    independent_external_buyers_verified: 0,
    proven_sales_count: null,
    product_025_unlock_evidence: false,
    automatic_price_changes: false,
    unattended_product_launch_authorized: false
  };
}
function readPrivateInvoice(filename) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) {
    fail("HOSTING_INVOICE_ABSOLUTE_PATH_REQUIRED");
  }
  const absolute = path.resolve(filename);
  if (absolute === ROOT || absolute.startsWith(ROOT + path.sep)) {
    fail("HOSTING_INVOICE_IN_REPOSITORY");
  }
  const parent = path.dirname(absolute);
  if (!fs.existsSync(parent)) fail("HOSTING_INVOICE_DIRECTORY_MISSING");
  const dir = fs.lstatSync(parent);
  if (!dir.isDirectory() || dir.isSymbolicLink() ||
      (dir.mode & 0o077) !== 0 || fs.realpathSync(parent) !== parent) {
    fail("HOSTING_INVOICE_DIRECTORY_UNSAFE");
  }
  let fd;
  try {
    fd = fs.openSync(absolute,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  } catch {
    fail("HOSTING_INVOICE_FILE_UNAVAILABLE");
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 ||
        (stat.mode & 0o077) !== 0 ||
        stat.size < 1 || stat.size > MAX_INVOICE_BYTES) {
      fail("HOSTING_INVOICE_FILE_UNSAFE");
    }
    let data;
    try { data = JSON.parse(fs.readFileSync(fd, "utf8")); }
    catch { fail("HOSTING_INVOICE_INVALID_JSON"); }
    return data;
  } finally { fs.closeSync(fd); }
}
function main(args = process.argv.slice(2)) {
  if (args.length !== 1 && args.length !== 2) {
    fail("HOSTING_USAGE_PRIVATE_AGGREGATE_OPTIONAL_PRIVATE_INVOICE");
  }
  const usage = readPrivateAggregates(args[0]);
  const invoice = args.length === 2 ? readPrivateInvoice(args[1]) : null;
  const report = analyzeHostingEvidence(usage, {invoice});
  process.stdout.write(JSON.stringify(report,null,2) + "\n");
}
if (require.main === module) {
  try { main(); }
  catch {
    // No raw invoice IDs, private paths, request identifiers or customer
    // information in error messages.
    process.stderr.write("Hosting-cost evidence gate rejected the private inputs.\n");
    process.exitCode = 1;
  }
}
module.exports = {
  PROJECT, FUNCTION, INVOICE_SOURCE, MAX_INVOICE_BYTES,
  validateInvoice, validateContext, allocateFloor, analyzeHostingEvidence,
  readPrivateInvoice, main
};
