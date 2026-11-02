"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_PATH = path.resolve(
  __dirname,
  "../deploy/floot-pa-vendor-gate/rollback-manifest.json"
);
const EXPECTED_TARGETS = [
  "endpoints/vendor-intake-gate_GET.ts",
  "endpoints/vendor-intake-gate_GET.schema.ts",
];

function loadManifest(file = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validateManifest(manifest) {
  if (manifest?.schema_version !== 1) throw new Error("schema_version");
  if (manifest.product_id !== "pa-vendor-intake-gate") {
    throw new Error("product_id");
  }
  if (manifest.scope !== "product-002-endpoint-only") {
    throw new Error("scope");
  }
  if (manifest.production_origin !== "https://pa-entity-x402.floot.app") {
    throw new Error("production_origin");
  }
  if (manifest.production_route !== "/_api/vendor-intake-gate") {
    throw new Error("production_route");
  }
  if (manifest.source_repository !== "P00NSMASHER/permitplate-nyc") {
    throw new Error("source_repository");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.source_commit || "")) {
    throw new Error("source_commit");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== 2) {
    throw new Error("files");
  }

  const targets = manifest.files.map((file) => file.target_path).sort();
  if (JSON.stringify(targets) !== JSON.stringify([...EXPECTED_TARGETS].sort())) {
    throw new Error("target_paths");
  }

  for (const file of manifest.files) {
    if (!/^docs\/pa-entity-floot-release\/[A-Za-z0-9_.-]+$/.test(file.source_path)) {
      throw new Error("source_path:" + file.source_path);
    }
    if (file.target_path.includes("_OPTIONS.")) {
      throw new Error("unsupported_options_target");
    }
    if (!Number.isInteger(file.bytes) || file.bytes < 1) {
      throw new Error("bytes:" + file.target_path);
    }
    if (!/^[0-9a-f]{64}$/.test(file.sha256 || "")) {
      throw new Error("sha256:" + file.target_path);
    }
    if (!/^[0-9a-f]{40}$/.test(file.git_blob || "")) {
      throw new Error("git_blob:" + file.target_path);
    }
    if (!Array.isArray(file.required_strings) || file.required_strings.length < 1) {
      throw new Error("required_strings:" + file.target_path);
    }
    if (!Array.isArray(file.forbidden_strings)) {
      throw new Error("forbidden_strings:" + file.target_path);
    }
  }
  return manifest;
}

function rawUrl(manifest, file) {
  return (
    "https://raw.githubusercontent.com/" +
    manifest.source_repository +
    "/" +
    manifest.source_commit +
    "/" +
    file.source_path
  );
}

async function verifyRemoteRollback({ manifest = loadManifest(), fetchImpl = fetch } = {}) {
  validateManifest(manifest);
  const observations = [];
  const problems = [];

  for (const file of manifest.files) {
    const url = rawUrl(manifest, file);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: "text/plain",
          "user-agent": "x402-product-factory-rollback-audit/1.0",
        },
      });
    } catch {
      problems.push(file.target_path + ":transport");
      continue;
    }
    if (response.status !== 200) {
      problems.push(file.target_path + ":status:" + response.status);
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const source = bytes.toString("utf8");
    if (bytes.length !== file.bytes) problems.push(file.target_path + ":bytes");
    if (sha256 !== file.sha256) problems.push(file.target_path + ":sha256");
    for (const required of file.required_strings) {
      if (!source.includes(required)) {
        problems.push(file.target_path + ":required_string");
      }
    }
    for (const forbidden of file.forbidden_strings) {
      if (source.includes(forbidden)) {
        problems.push(file.target_path + ":forbidden_string");
      }
    }
    observations.push({
      targetPath: file.target_path,
      sourceUrl: url,
      status: response.status,
      bytes: bytes.length,
      sha256,
    });
  }

  return {
    ok: problems.length === 0,
    product: manifest.product_id,
    sourceCommit: manifest.source_commit,
    fileCount: manifest.files.length,
    paymentSent: false,
    observations,
    problems,
  };
}

async function main() {
  const manifest = validateManifest(loadManifest());
  if (!process.argv.includes("--verify-remote")) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          product: manifest.product_id,
          sourceCommit: manifest.source_commit,
          fileCount: manifest.files.length,
          remoteVerified: false,
        },
        null,
        2
      )
    );
    return;
  }
  const result = await verifyRemoteRollback({ manifest });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  MANIFEST_PATH,
  EXPECTED_TARGETS,
  loadManifest,
  validateManifest,
  rawUrl,
  verifyRemoteRollback,
};
