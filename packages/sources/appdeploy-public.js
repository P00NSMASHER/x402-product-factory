"use strict";

const {
  canonicalBusinessName,
  matchScore,
  addressIdentity,
  distanceMiles,
  createPaRegistryAdapter,
  createCensusAddressAdapter,
  createRdapAdapter,
} = require("./live-pa-identity");

/**
 * Backward-compatible adapter factory retained for older factory callers.
 *
 * Despite the historical filename, this no longer calls AppDeploy component
 * demo/paid routes. It delegates exclusively to the same direct authoritative
 * public-source adapters used by the portable factory runtime:
 * - Pennsylvania Department of State via data.pa.gov
 * - U.S. Census Bureau Geocoding Services
 * - IANA RDAP bootstrap + authoritative registry RDAP
 */
function createAppDeployPublicAdapters({ fetchImpl = fetch } = {}) {
  return {
    registry: createPaRegistryAdapter({ fetchImpl }),
    address: createCensusAddressAdapter({ fetchImpl }),
    rdap: createRdapAdapter({ fetchImpl }),
  };
}

module.exports = {
  createAppDeployPublicAdapters,
  matchScore,
  canonicalBusinessName,
  addressIdentity,
  distanceMiles,
};
