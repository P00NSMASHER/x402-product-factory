"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  FACTORY_ROOT, SETTLEMENT_ROOT, REQUIRED_SUITES,
  inspectRequired, discoverSettlementTests, runSettlementTests, main
} = require("../../scripts/run-settlement-contract-tests");

function withTree(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-settlement-ci-"));
  try { return callback(root); }
  finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function write(dir, relative, content = "const test = require('node:test');\ntest('fixture', () => {});\n") {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content, {mode: 0o600});
  return file;
}
const minimum = ["alpha.test.js"];

test("the required suite manifest covers every critical existing settlement contract", () => {
  assert.equal(path.isAbsolute(SETTLEMENT_ROOT), true);
  assert.equal(path.isAbsolute(FACTORY_ROOT), true);
  assert.ok(REQUIRED_SUITES.length >= 10);
  assert.ok(REQUIRED_SUITES.includes("settlement-test-discovery.test.js"));
  assert.ok(REQUIRED_SUITES.includes("response-body-audit.test.js"));
  assert.ok(REQUIRED_SUITES.includes("settlement-telemetry.test.js"));
  assert.ok(REQUIRED_SUITES.includes("verify-production-baseline.test.js"));
  assert.deepEqual(new Set(REQUIRED_SUITES).size, REQUIRED_SUITES.length);
  const files = discoverSettlementTests();
  const names = files.map(f => path.relative(SETTLEMENT_ROOT, f).replaceAll("\\", "/"));
  assert.equal(names.length, new Set(names).size);
  assert.deepEqual(names, [...names].sort());
  for (const required of REQUIRED_SUITES) assert.ok(names.includes(required));
});

test("existing factory discovery includes newly added nested tests automatically", () =>
  withTree(root => {
    const alpha = write(root, "alpha.test.js");
    const beta = write(root, "nested/beta.test.js");
    const zeta = write(root, "zeta.test.js");
    write(root, "nested/helper.js", "module.exports = {};\n");
    const found = discoverSettlementTests(root, {required: minimum});
    assert.deepEqual(found, [alpha, beta, zeta]);
  }));

test("test execution passes the entire discovered set to node --test without a shell", () =>
  withTree(root => {
    const alpha = write(root, "alpha.test.js");
    const beta = write(root, "beta.test.js");
    const observed = [];
    const report = runSettlementTests({
      directory: root,
      required: minimum,
      spawn: (binary, args, options) => {
        observed.push({binary, args, options});
        return {status: 0};
      }
    });
    assert.deepEqual(report, {test_files: 2, ok: true});
    assert.equal(observed.length, 1);
    assert.equal(observed[0].binary, process.execPath);
    assert.deepEqual(observed[0].args, ["--test", alpha, beta]);
    assert.equal(observed[0].options.shell, false);
    assert.equal(observed[0].options.cwd, FACTORY_ROOT);
    assert.equal(observed[0].options.stdio, "inherit");
  }));

test("execution failure and unknown runner arguments fail closed", () =>
  withTree(root => {
    write(root, "alpha.test.js");
    assert.throws(() => runSettlementTests({
      directory: root, required: minimum, spawn: () => ({status: 1})
    }), /SETTLEMENT_TEST_GATE_TEST_EXECUTION_FAILED/);
    assert.throws(() => runSettlementTests({
      directory: root, required: minimum, spawn: () => ({status: null})
    }), /SETTLEMENT_TEST_GATE_TEST_EXECUTION_FAILED/);
    assert.throws(() => main(["--ignore-failing-tests"]),
      /SETTLEMENT_TEST_GATE_UNSUPPORTED_CLI_ARGUMENT/);
  }));

test("required suites cannot silently disappear or be redefined with traversal", () =>
  withTree(root => {
    write(root, "alpha.test.js");
    assert.throws(() => discoverSettlementTests(root, {
      required: ["alpha.test.js", "missing.test.js"]
    }), /SETTLEMENT_TEST_GATE_REQUIRED_SUITE_MISSING/);
    for (const required of [
      [], ["alpha.test.js", "alpha.test.js"],
      ["../alpha.test.js"], ["/tmp/x.test.js"],
      ["nested\\evil.test.js"], ["alpha.js"], [17]
    ]) {
      assert.throws(() => discoverSettlementTests(root, {required}),
        /SETTLEMENT_TEST_GATE_(REQUIRED_MANIFEST_INVALID|DUPLICATE_REQUIRED_SUITE|REQUIRED_SUITE_PATH_INVALID)/);
    }
  }));

test("empty, zero-byte, oversized, or unreadable test files cannot pass discovery", () =>
  withTree(root => {
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_TEST_SUITE_COUNT_INVALID/);
    const file = write(root, "alpha.test.js", "");
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_TEST_FILE_INVALID_OR_UNREADABLE/);
    fs.writeFileSync(file, "x".repeat(1024 * 1024 + 1));
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_TEST_FILE_INVALID_OR_UNREADABLE/);
    fs.writeFileSync(file, "test('fixture', () => {});\n");
    fs.chmodSync(file, 0o000);
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_TEST_FILE_INVALID_OR_UNREADABLE/);
  }));

test("symlinked test file, directory, or scope root cannot be silently trusted", () =>
  withTree(root => {
    write(root, "alpha.test.js");
    const target = write(root, "beta.test.js");
    fs.symlinkSync(target, path.join(root, "alias.test.js"));
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_SYMLINK_IN_TEST_TREE/);
    fs.unlinkSync(path.join(root, "alias.test.js"));
    const folder = path.join(root, "real");
    fs.mkdirSync(folder);
    fs.symlinkSync(folder, path.join(root, "aliasdir"), "dir");
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_SYMLINK_IN_TEST_TREE/);
    fs.unlinkSync(path.join(root, "aliasdir"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "factory-ci-alias-"));
    try {
      const aliasedRoot = path.join(outside, "scope");
      fs.symlinkSync(root, aliasedRoot, "dir");
      assert.throws(() => discoverSettlementTests(aliasedRoot, {required: minimum}),
        /SETTLEMENT_TEST_GATE_UNSAFE_TEST_ROOT/);
    } finally { fs.rmSync(outside, {recursive: true, force: true}); }
  }));

test("untrusted or invalid filename components fail before executing anything", () =>
  withTree(root => {
    write(root, "alpha.test.js");
    write(root, "bad name.test.js");
    assert.throws(() => discoverSettlementTests(root, {required: minimum}),
      /SETTLEMENT_TEST_GATE_UNSAFE_PATH_COMPONENT/);
  }));

test("relative or nonexistent test roots fail before execution", () => {
  assert.throws(() => discoverSettlementTests("relative", {required: minimum}),
    /SETTLEMENT_TEST_GATE_ROOT_MUST_BE_ABSOLUTE/);
  assert.throws(() => discoverSettlementTests(
    path.join(os.tmpdir(), "does-not-exist-contract-tests"), {required: minimum}
  ), /SETTLEMENT_TEST_GATE_TEST_ROOT_MISSING_OR_NONCANONICAL/);
});

test("the existing factory runner, not another hard-coded shell file list, remains the discovery source", () => {
  const {discoverTests} = require("../../scripts/run-all-tests");
  const globalDiscovery = discoverTests(SETTLEMENT_ROOT);
  const scopedDiscovery = discoverSettlementTests();
  assert.deepEqual(scopedDiscovery, globalDiscovery.sort());
  assert.ok(scopedDiscovery.length >= REQUIRED_SUITES.length);
});
test("workflow cannot silently fall back to manually enumerated settlement tests", () => {
  const workflow = fs.readFileSync(
    path.join(FACTORY_ROOT, ".github/workflows/supabase-x402-settlement-contract.yml"),
    "utf8"
  );
  assert.match(workflow, /node scripts\/run-settlement-contract-tests\.js/);
  assert.match(workflow, /verify-production-baseline\.js --check/);
  assert.match(workflow, /permissions:\s*\n  contents: read/);
  assert.match(workflow, /packages\/x402\/\*\*/);
  assert.match(workflow, /packages\/sources\/\*\*/);
  assert.match(workflow, /production-topology\.json/);
  assert.match(workflow, /scripts\/run-all-tests\.js/);
  assert.match(workflow, /deploy\/supabase-x402-data-tools\/\*\*/);
  assert.doesNotMatch(workflow, /node --test\s*\\/);
});

