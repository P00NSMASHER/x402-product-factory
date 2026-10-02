"use strict";

function sourceUnavailable(source, detail = null) {
  return Object.freeze({
    source,
    available: false,
    detail,
  });
}

function requireAdapter(name, adapter, method) {
  if (!adapter || typeof adapter[method] !== "function") {
    const error = new TypeError(`${name} adapter must implement ${method}()`);
    error.code = "ADAPTER_CONTRACT_INVALID";
    throw error;
  }
}

function normalizedEvidence(source, result) {
  if (!result || typeof result !== "object") {
    return sourceUnavailable(source, "adapter returned no object");
  }
  return {
    source,
    ...result,
    available: result.available === true,
  };
}

module.exports = {
  sourceUnavailable,
  requireAdapter,
  normalizedEvidence,
};
