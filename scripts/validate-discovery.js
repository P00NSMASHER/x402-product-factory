"use strict";

const { validateCompiled } = require("../packages/discovery/generator");
const { check: checkSpecIndex, buildIndex } = require("./generate-product-spec-index");
const {
  check: checkSpecArtifacts,
  buildDiscovery: buildSpecDiscovery,
  buildContractCases
} = require("./generate-spec-artifacts");

checkSpecIndex();
checkSpecArtifacts();

const result = validateCompiled("https://candidate.example");
const specIndex = buildIndex();
const specDiscovery = buildSpecDiscovery();
const contractCases = buildContractCases();
console.log(
  JSON.stringify(
    {
      ok: true,
      productCount: result.productCount,
      ids: result.ids,
      catalogResources: result.catalog.resources.map((resource) => ({
        resource: resource.resource,
        price: resource.price,
        amount: resource.accepts[0].amount,
        network: resource.accepts[0].network,
        payTo: resource.accepts[0].payTo,
      })),
      openApiPaths: Object.keys(result.openapi.paths),
      specProducts: specIndex.products.map((product) => product.id),
      specDiscoveryProducts: specDiscovery.products.map((product) => product.id),
      generatedContractCases: contractCases.cases.length,
    },
    null,
    2
  )
);
