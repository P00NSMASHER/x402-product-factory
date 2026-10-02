# Normalized source contracts

Factory products consume source adapters through small explicit interfaces.

## Registry adapter

```js
registry.lookup({ company })
```

Normalized successful result:

```json
{
  "available": true,
  "strongMatch": true,
  "entity": {
    "businessName": "Example LLC",
    "filingNumber": "123",
    "address1": "100 Market St",
    "address2": null,
    "city": "Pottsville",
    "state": "PA",
    "zip": "17901"
  },
  "provenance": {}
}
```

## Address adapter

```js
address.compare({ suppliedAddress, registryAddress })
```

Result exposes `suppliedMatched`, `registryMatched`, and `distanceMiles`.

## RDAP adapter

```js
rdap.lookup({ domain })
```

Result exposes `registered` plus provenance.

## Failure rule

Adapters may throw for transport/source failures. The product composition layer converts those failures into `available:false`. Required unavailable evidence therefore becomes `human_review`, not an unsupported negative claim or automatic rejection.
