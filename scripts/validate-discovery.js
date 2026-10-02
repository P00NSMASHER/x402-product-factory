"use strict";

const { validateCompiled } = require("../packages/discovery/generator");

const result = validateCompiled("https://candidate.example");
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
    },
    null,
    2
  )
);
