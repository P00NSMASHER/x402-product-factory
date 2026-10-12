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


// A source adapter's successful HTTP response may still be unavailable or
// malformed. In that case no paid result may be settled for that required
// lookup. This wrapper is called ONLY after an actual adapter invocation;
// derived/skipped optional source placeholders must not be counted as failures.
function trackRequiredEvidence(source, result, sourceFailures) {
  if (!Array.isArray(sourceFailures)) {
    throw new TypeError("sourceFailures must be an array");
  }
  const evidence=normalizedEvidence(source,result);
  if (evidence.available!==true &&
      !sourceFailures.some(failure=>failure?.source===source)) {
    sourceFailures.push({source,detail:"SOURCE_UNAVAILABLE"});
  }
  return evidence;
}

const SAFE_SOURCE_ERROR_CODES=new Set([
  "SOURCE_TIMEOUT","SOURCE_HTTP_ERROR","SOURCE_CONTRACT_INVALID",
  "SOURCE_UNAVAILABLE","INVALID_INPUT","SEC_USER_AGENT_REQUIRED"
]);
function safeSourceErrorCode(error) {
  const code=error?.code;
  return typeof code==="string"&&SAFE_SOURCE_ERROR_CODES.has(code)
    ?code:"SOURCE_ADAPTER_FAILURE";
}

module.exports = {
  sourceUnavailable,
  requireAdapter,
  normalizedEvidence,
  trackRequiredEvidence,
  safeSourceErrorCode,
};
