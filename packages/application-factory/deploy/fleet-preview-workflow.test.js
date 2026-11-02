'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../.github/workflows/factory-manufacturing-ci.yml');
test('CI boots source-verified 9- and 17-app private fleets before native portal UI checks',()=>{
 const file=fs.readFileSync(root,'utf8');
 assert.match(file,/Run real private localhost portals for all baseline and research applications/);
 assert.match(file,/run-private-fleet-preview\.js --exercise/);
 assert.match(file,/--state-root "\$RUNNER_TEMP\/private-baseline-fleet"/);
 assert.match(file,/--state-root "\$RUNNER_TEMP\/private-research-fleet"/);
 assert.match(file,/--quote "\$RUNNER_TEMP\/research-quote-apps"/);
 assert.match(file,/--inventory "\$RUNNER_TEMP\/research-inventory-apps"/);
 assert.match(file,/\[\["baseline",9\],\["research",17\]\]/);
 assert.match(file,/quality\/browser\/private-fleet-preview\.cjs/);
 assert.match(file,/name: private-runnable-fleet-acceptance/);
 assert.match(file,/name: private-fleet-phone-desktop-screenshots/);
});
test('private application credentials cannot be included in CI uploads or external permissions',()=>{
 const file=fs.readFileSync(root,'utf8');
 assert.match(file,/permissions:\n  contents: read/);
 assert.match(file,/persist-credentials: false/);
 assert.match(file,/retention-days: 7/);
 assert.match(file,/path: \$\{\{ runner.temp \}\}\/private-fleet-evidence/);
 assert.doesNotMatch(file,/path: \$\{\{ runner.temp \}\}\/(?:private-baseline-fleet|private-research-fleet|native-fleet-synthetic)/);
 assert.doesNotMatch(file,/contents: write|id-token: write|gh pr merge|wrangler deploy|--send-email|--charge/);
});
