'use strict';
// Offline tests of the canonical Supabase Edge Function source. No network, wallet or charge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
const originalSettlement = 'if (result.body?.success === true) return { ok: true, receipt: result.body };';
const hardenedSettlement = [
  'if (',
  '        result.status >= 200 &&',
  '        result.status < 300 &&',
  '        result.body?.success === true',
  '      ) return { ok: true, receipt: result.body };',
].join('\n');
const originalVerify = [
  'if (',
  '      verification.body?.isValid !== true &&',
  '      verification.body?.success !== true',
  '    ) {',
].join('\n');
const hardenedVerify = [
  'if (',
  '      verification.status === 429 ||',
  '      verification.status >= 500',
  '    ) throw new Error("facilitator_unavailable");',
  '    if (',
  '      verification.status < 200 ||',
  '      verification.status >= 300 ||',
  '      verification.body?.isValid !== true',
  '    ) {',
].join('\n');

assert.equal(source.split(hardenedSettlement).length, 2, 'pinned settlement guard missing or duplicated');
assert.equal(source.split(hardenedVerify).length, 2, 'pinned verification guard missing or duplicated');
const unsafe = source.replace(hardenedSettlement, originalSettlement).replace(hardenedVerify, originalVerify);

function makeSettlement(src, response) {
  const match = src.match(/async function settleSamePayment\(paymentPayload: unknown\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'canonical settlement source missing');
  const js = match[0].replace('(paymentPayload: unknown)', '(paymentPayload)');
  let calls = 0;
  const fn = new Function('facilitator', 'setTimeout', js + '; return settleSamePayment;')(
    async (endpoint) => {
      assert.equal(endpoint, 'settle');
      calls++;
      return response;
    },
    (cb) => { cb(); return 0; },
  );
  return async () => ({ receipt: await fn({ x402Version: 2 }), calls });
}

function makeVerify(src, response) {
  const match = src.match(/try \{\s*const verification = await facilitator\("verify", paymentPayload\);[\s\S]*?\n  \} catch \{\s*return json\([\s\S]*?\n  \}/);
  assert.ok(match, 'canonical verification source missing');
  let calls = 0;
  const fn = new Function(
    'facilitator', 'paymentRequired', 'json',
    'return async function (paymentPayload, route, base) { ' + match[0] +
    '; return { status: 200, executed: true }; }',
  )(
    async (endpoint) => {
      assert.equal(endpoint, 'verify');
      calls++;
      return response;
    },
    (_route, _base, reason) => ({ status: 402, executed: false, reason }),
    (_body, status) => ({ status, executed: false }),
  );
  return async () => ({ result: await fn({}, null, 'https://invalid.test'), calls });
}

const settlements = [
  ['HTTP 200 successful', { status: 200, body: { success: true } }, true],
  ['HTTP 201 successful', { status: 201, body: { success: true } }, true],
  ['HTTP 500 claiming success', { status: 500, body: { success: true } }, false],
  ['HTTP 429 claiming success', { status: 429, body: { success: true } }, false],
  ['HTTP 400 claiming success', { status: 400, body: { success: true } }, false],
  ['HTTP 200 explicit failure', { status: 200, body: { success: false } }, false],
  ['HTTP 200 absent success', { status: 200, body: {} }, false],
  ['HTTP 503 empty body', { status: 503, body: null }, false],
];
const verifications = [
  ['HTTP 200 isValid true', { status: 200, body: { isValid: true } }, 200],
  ['HTTP 201 isValid true', { status: 201, body: { isValid: true } }, 200],
  ['HTTP 200 isValid true success false', { status: 200, body: { isValid: true, success: false } }, 200],
  ['HTTP 200 isValid false success true', { status: 200, body: { isValid: false, success: true } }, 402],
  ['HTTP 200 missing isValid success true', { status: 200, body: { success: true } }, 402],
  ['HTTP 200 string isValid true', { status: 200, body: { isValid: 'true', success: true } }, 402],
  ['HTTP 500 claiming isValid true', { status: 500, body: { isValid: true } }, 503],
  ['HTTP 429 claiming isValid true', { status: 429, body: { isValid: true } }, 503],
  ['HTTP 400 claiming isValid true', { status: 400, body: { isValid: true } }, 402],
  ['HTTP 503 empty body', { status: 503, body: null }, 503],
];

for (const [name, response, expected] of settlements) {
  test('settlement: ' + name, async () => {
    const { receipt, calls } = await makeSettlement(source, response)();
    assert.equal(receipt.ok, expected);
    assert.equal(calls >= 1 && calls <= 3, true);
  });
}
for (const [name, response, expected] of verifications) {
  test('verification: ' + name, async () => {
    const { result, calls } = await makeVerify(source, response)();
    assert.equal(result.status, expected);
    assert.equal(calls, 1);
    if (expected !== 200) assert.equal(result.executed, false, 'no downstream sources');
  });
}

test('negative control: upstream accepted invalid facilitator verdicts', async () => {
  const badVerify = await makeVerify(unsafe, { status: 200, body: { isValid: false, success: true } })();
  const badStatus = await makeVerify(unsafe, { status: 503, body: { isValid: true } })();
  const badSettle = await makeSettlement(unsafe, { status: 503, body: { success: true } })();
  assert.equal(badVerify.result.status, 200);
  assert.equal(badStatus.result.status, 200);
  assert.equal(badSettle.receipt.ok, true);
  assert.equal(badVerify.calls, 1);
  assert.equal(badStatus.calls, 1);
  assert.equal(badSettle.calls, 1);
});
