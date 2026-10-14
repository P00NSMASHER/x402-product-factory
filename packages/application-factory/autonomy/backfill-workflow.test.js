'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../../.github/workflows/factory-autonomy-ci.yml');
test('scheduled factory authenticates current slot then catches up old slots with a hard limit',()=>{
 const s=fs.readFileSync(file,'utf8');
 const current=s.indexOf('run-autonomous-factory.js --output');
 const receipt=s.indexOf('CYCLE_RECEIPT_INVALID');
 const recover=s.indexOf('backfill-autonomous-factory.js --output');
 const ideas=s.indexOf('validate-autonomy-ideas.js --build-pending');
 assert.ok(current>=0&&receipt>current&&recover>receipt&&ideas>recover);
 assert.match(s,/--at "\$at" --max-builds 2 --window-cycles 8/);
 assert.match(s,/r\.recoveredCycles\.length>2/);
 assert.match(s,/r\.recoveredCycles\.some\(cycle=>cycle>=r\.currentCycle\)/);
 assert.match(s,/scripts\/backfill-autonomous-factory\.js/);
});
test('automatic backfill cannot change tasks, cron, GitHub credentials or production state',()=>{
 const s=fs.readFileSync(file,'utf8');
 assert.match(s,/cron: '23 \*\/6 \* \* \*'/);
 assert.match(s,/permissions:\n  contents: read\n  actions: read/);
 assert.match(s,/persist-credentials: false/);
 assert.doesNotMatch(s,/contents: write|actions: write|pull-requests: write|id-token: write|gh pr merge|git push/);
 assert.match(s,/retention-days: 7/);
});
