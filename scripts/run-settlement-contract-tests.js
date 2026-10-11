"use strict";

// Reuse the factory's ONE canonical recursive test discovery mechanism.
// Scope it to Supabase settlement contracts and fail closed when essential
// suites disappear, a test is unreadable, or a symlink enters the test tree.
// Offline CI only: never touches live payments, RPC, or production sellers.
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {discoverTests} = require("./run-all-tests");

const FACTORY_ROOT = path.resolve(__dirname, "..");
const SETTLEMENT_ROOT = path.join(FACTORY_ROOT, "deploy", "supabase-x402-data-tools");
const REQUIRED_SUITES = Object.freeze([
  "buyer-provenance-preflight.test.js",
  "buyer-review-queue.test.js",
  "client-receipt-audit.test.js",
  "cross-journal-audit.test.js",
  "reconcile-settlements.test.js",
  "response-body-audit.test.js",
  "settlement-ledger.test.js",
  "settlement-telemetry.test.js",
  "settlement-test-discovery.test.js",
  "signed-delivery-audit.test.js",
  "verify-production-baseline.test.js"
]);
const MAX_TEST_FILES = 128;
const MAX_TEST_FILE_BYTES = 1024 * 1024;
const MAX_DEPTH = 8;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(reason) {
  const error = new Error("SETTLEMENT_TEST_GATE_" + reason);
  error.code = "SETTLEMENT_TEST_GATE_" + reason;
  throw error;
}
function inspectTree(directory, depth = 0) {
  if (depth > MAX_DEPTH) fail("DIRECTORY_DEPTH_EXCEEDED");
  const entries = fs.readdirSync(directory, {withFileTypes: true});
  for (const entry of entries) {
    if (!SAFE_SEGMENT.test(entry.name) || entry.name === "." ||
        entry.name === "..") {
      fail("UNSAFE_PATH_COMPONENT");
    }
    if (entry.isSymbolicLink()) fail("SYMLINK_IN_TEST_TREE");
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspectTree(name, depth + 1);
    } else if (!entry.isFile()) {
      fail("UNSUPPORTED_TEST_TREE_ENTRY");
    }
  }
}
function inspectRequired(required) {
  if (!Array.isArray(required) || required.length === 0 ||
      required.length > MAX_TEST_FILES) {
    fail("REQUIRED_MANIFEST_INVALID");
  }
  const seen = new Set();
  for (const item of required) {
    if (typeof item !== "string" || !item.endsWith(".test.js") ||
        item.split("/").some(segment => !SAFE_SEGMENT.test(segment)) ||
        item.includes("\\") || path.isAbsolute(item)) {
      fail("REQUIRED_SUITE_PATH_INVALID");
    }
    if (seen.has(item)) fail("DUPLICATE_REQUIRED_SUITE");
    seen.add(item);
  }
  return required;
}
function discoverSettlementTests(directory = SETTLEMENT_ROOT, {
  required = REQUIRED_SUITES
} = {}) {
  inspectRequired(required);
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    fail("ROOT_MUST_BE_ABSOLUTE");
  }
  const root = path.resolve(directory);
  if (root !== directory || !fs.existsSync(root)) {
    fail("TEST_ROOT_MISSING_OR_NONCANONICAL");
  }
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      fs.realpathSync(root) !== root) {
    fail("UNSAFE_TEST_ROOT");
  }
  inspectTree(root);
  const tests = discoverTests(root).map(file => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (!relative || relative.startsWith("../") || path.isAbsolute(relative) ||
        !relative.endsWith(".test.js") ||
        relative.split("/").some(segment => !SAFE_SEGMENT.test(segment))) {
      fail("UNSAFE_DISCOVERED_TEST_PATH");
    }
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
        info.size < 1 || info.size > MAX_TEST_FILE_BYTES ||
        (info.mode & 0o444) === 0) {
      fail("TEST_FILE_INVALID_OR_UNREADABLE");
    }
    try { fs.accessSync(file, fs.constants.R_OK); }
    catch { fail("TEST_FILE_UNREADABLE"); }
    return {file, relative};
  });
  if (tests.length === 0 || tests.length > MAX_TEST_FILES) {
    fail("TEST_SUITE_COUNT_INVALID");
  }
  tests.sort((a, b) => a.relative.localeCompare(b.relative, "en"));
  const names = new Set(tests.map(item => item.relative));
  if (names.size !== tests.length) fail("DUPLICATE_DISCOVERED_TEST");
  for (const name of required) {
    if (!names.has(name)) fail("REQUIRED_SUITE_MISSING");
  }
  return tests.map(item => item.file);
}
function runSettlementTests({
  directory = SETTLEMENT_ROOT,
  required = REQUIRED_SUITES,
  spawn = spawnSync
} = {}) {
  const files = discoverSettlementTests(directory, {required});
  if (typeof spawn !== "function") fail("INVALID_EXECUTOR");
  const child = spawn(process.execPath, ["--test", ...files], {
    cwd: FACTORY_ROOT,
    shell: false,
    stdio: "inherit",
    env: process.env
  });
  if (!child || child.error || child.status !== 0) {
    fail("TEST_EXECUTION_FAILED");
  }
  return {test_files: files.length, ok: true};
}
function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--list") {
    const tests = discoverSettlementTests();
    process.stdout.write(tests.map(file =>
      path.relative(FACTORY_ROOT, file).split(path.sep).join("/")
    ).join("\n") + "\n");
    return;
  }
  if (args.length !== 0) fail("UNSUPPORTED_CLI_ARGUMENT");
  runSettlementTests();
}
if (require.main === module) {
  try { main(); }
  catch {
    // Keep the workflow failure message generic. The full node:test output
    // provides failures without echoing private paths or input evidence.
    process.stderr.write("Settlement contract test gate failed.\n");
    process.exitCode = 1;
  }
}
module.exports = {
  FACTORY_ROOT, SETTLEMENT_ROOT, REQUIRED_SUITES,
  MAX_TEST_FILES, MAX_TEST_FILE_BYTES,
  inspectTree, inspectRequired, discoverSettlementTests, runSettlementTests, main
};
