'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../../.github/workflows/factory-autonomy-ci.yml');
test('cross-family late builds share current UTC timestamp and immutable private artifact',()=>{
 const s=fs.readFileSync(file,'utf8');
 const current=s.indexOf('run-cross-family-director.js --run');
 const recovery=s.indexOf('backfill-cross-family.js --run');
 const saved=s.indexOf('name: autonomous-apps-'+'$'+'{{ github.run_id }}');
 assert.ok(current>0&&recovery>current&&saved>recovery);
 assert.match(s,/--window-cycles 8 --max-builds 2/);
 assert.match(s,/--output "\$RUNNER_TEMP\/autonomous-apps\/cross-family"/);
 assert.match(s,/--at "\$at"/);
 assert.match(s,/historyOutsideWindowUnverified/);
 assert.match(s,/originalScheduledRunProof!==false/);
 assert.match(s,/cron: '23 \*\/6 \* \* \*'/);
 assert.match(s,/permissions:\n  contents: read\n  actions: read/);
 assert.match(s,/persist-credentials: false/);
 assert.doesNotMatch(s,/contents: write|id-token: write|gh pr merge|wrangler deploy|send-email|twilio|customer-outreach/);
});
test('local historical reconstruction has no external transport or scheduling functionality',()=>{
 for(const name of ['packages/application-factory/autonomy/cross-backfill.js',
   'scripts/backfill-cross-family.js']){
  const s=fs.readFileSync(path.resolve(__dirname,'../../..',name),'utf8');
  assert.doesNotMatch(s,/https\.request|http\.request|fetch\(|sendEmail|sendMessage|child_process|createAutomation/);
 }
});
