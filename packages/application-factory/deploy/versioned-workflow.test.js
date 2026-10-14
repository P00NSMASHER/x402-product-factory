'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../../.github/workflows/factory-manufacturing-ci.yml');
test('versioned private deployment rehearsal executes after source-verified manufacturing',()=>{
 const s=fs.readFileSync(file,'utf8');
 const assembled=s.indexOf('Assemble and independently exercise every default edition');
 const version=s.indexOf('rehearse-versioned-rollout.js --document');
 const native=s.indexOf('Native browser acceptance against manufactured packages');
 assert.ok(assembled>0&&version>assembled&&native>version);
 assert.match(s,/name: versioned-rollback-rehearsal/);
 assert.match(s,/path: \$\{\{ runner.temp \}\}\/versioned-rollback-rehearsal/);
 assert.match(s,/permissions:\n  contents: read/);
 assert.match(s,/retention-days: 7/);
 assert.doesNotMatch(s,/contents: write|actions: write|id-token: write|gh pr merge|wrangler deploy|--send-email|--charge/);
});
