"use strict";

const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadManifest,
  rawUrl,
  validateManifest,
  verifyRemoteRollback,
} = require("./verify-floot-product-002-rollback");

function fixtureManifest() {
  const manifest = structuredClone(loadManifest());
  for (const file of manifest.files) {
    const source = Buffer.from(file.required_strings.join("\n") + "\n", "utf8");
    file.bytes = source.length;
    file.sha256 = crypto.createHash("sha256").update(source).digest("hex");
    file.fixture = source;
  }
  return manifest;
}

function response(bytes, status = 200) {
  return {
    status,
    async arrayBuffer() {
      return bytes;
    },
  };
}

test("rollback manifest pins only the immutable Product 002 endpoint files", () => {
  const manifest = validateManifest(loadManifest());
  assert.equal(manifest.files.length, 2);
  assert.match(manifest.source_commit, /^[0-9a-f]{40}$/);
  assert.ok(manifest.files.every((file) => !file.target_path.includes("_OPTIONS.")));
  assert.ok(
    manifest.files.every((file) =>
      rawUrl(manifest, file).includes("/" + manifest.source_commit + "/")
    )
  );
});

test("remote verifier accepts exact source bytes without payment headers", async () => {
  const manifest = fixtureManifest();
  let paymentHeaders = 0;
  const result = await verifyRemoteRollback({
    manifest,
    fetchImpl: async (url, init) => {
      for (const [name, value] of Object.entries(init.headers || {})) {
        if (/^(payment-signature|x-payment)$/i.test(name) && value) {
          paymentHeaders += 1;
        }
      }
      const file = manifest.files.find((item) => rawUrl(manifest, item) === url);
      assert.ok(file);
      return response(file.fixture);
    },
  });

  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.equal(result.paymentSent, false);
  assert.equal(result.observations.length, 2);
  assert.equal(paymentHeaders, 0);
});

test("remote verifier rejects byte drift", async () => {
  const manifest = fixtureManifest();
  const result = await verifyRemoteRollback({
    manifest,
    fetchImpl: async (url) => {
      const file = manifest.files.find((item) => rawUrl(manifest, item) === url);
      return response(Buffer.concat([file.fixture, Buffer.from("drift")]));
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.endsWith(":bytes")));
  assert.ok(result.problems.some((problem) => problem.endsWith(":sha256")));
});
