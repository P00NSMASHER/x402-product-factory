'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const workflow=path.resolve(__dirname,'../../.github/workflows/factory-production-integration-ci.yml');
test('integration gate is read-only, no new scheduler, no secret or write tokens',()=>{
 const text=fs.readFileSync(workflow,'utf8');
 assert.match(text,/pull-requests: read/);
 assert.match(text,/contents: read/);
 assert.match(text,/actions: read/);
 assert.match(text,/persist-credentials: false/);
 assert.match(text,/--audit-live --output/);
 assert.match(text,/github\.token/);
 assert.match(text,/private-production-integration-readonly-audit/);
 assert.match(text,/retention-days: 7/);
 assert.match(text,/productionReady!==false/);
 assert.match(text,/mergesPerformed!==0/);
 assert.doesNotMatch(text,/(?:\n|\r)\s+schedule:/);
 assert.doesNotMatch(text,/contents: write|id-token: write|pull-requests: write|actions: write|gh pr merge|gh workflow run|wrangler deploy|tailscale serve|--charge|--send-email|--publish/);
});
test('workflow reports source blocking separately from customer production authorization',()=>{
 const text=fs.readFileSync(workflow,'utf8');
 assert.match(text,/Check full draft ancestry and release holds \(not production approval\)/);
 assert.match(text,/READONLY_INTEGRATION_REPORT_UNSAFE/);
 assert.match(text,/missingIntegration/);
 assert.match(text,/mainBehind/);
 assert.match(text,/productionReady:false/);
});
