'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../.github/workflows/factory-manufacturing-ci.yml');
test('all three artifact families must be assembled before a true local deployment rehearsal',()=>{
 const s=fs.readFileSync(root,'utf8');
 assert.match(s,/rehearse-private-deployments\.js/);
 assert.match(s,/--document "\$RUNNER_TEMP\/manufactured-applications"/);
 assert.match(s,/--quote "\$RUNNER_TEMP\/quote-to-order-apps"/);
 assert.match(s,/--inventory "\$RUNNER_TEMP\/inventory-apps"/);
 assert.match(s,/name: private-deployment-rehearsal/);
 assert.match(s,/retention-days: 7/);
 assert.match(s,/permissions:\n  contents: read/);
 assert.doesNotMatch(s,/contents: write|id-token: write|gh pr merge|cloudflare pages deploy|wrangler deploy/);
});
