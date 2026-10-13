'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const filename=path.resolve(__dirname,'../../../.github/workflows/factory-autonomy-ci.yml');
const read=()=>fs.readFileSync(filename,'utf8');
test('autonomous factory reuses only same-branch GitHub artifact and no external credentials',()=>{
 const s=read();
 assert.match(s,/TARGET_BRANCH: \$\{\{ github\.head_ref \|\| github\.ref_name \}\}/);
 assert.match(s,/gh run list --repo "\$GITHUB_REPOSITORY"/);
 assert.match(s,/--workflow factory-autonomy-ci\.yml --branch "\$TARGET_BRANCH"/);
 assert.match(s,/select\(\.conclusion=="success"\)/);
 assert.match(s,/gh run download "\$previous"/);
 assert.match(s,/restore-autonomous-checkpoint\.js/);
 assert.match(s,/find "\$source" -type d -exec chmod 700/);
 assert.match(s,/find "\$source" -type f -exec chmod 600/);
});
test('workflow remains read-only and never has repository writer, checkout session or live deploy',()=>{
 const s=read();
 assert.match(s,/permissions:\n  contents: read\n  actions: read/);
 assert.match(s,/persist-credentials: false/);
 assert.doesNotMatch(s,/contents: write|actions: write|pull-requests: write|id-token: write/);
 assert.doesNotMatch(s,/gh pr merge|git push|stripe|sendgrid|--charge|--send-email/);
 assert.match(s,/timeout-minutes: 9/);
});
test('workflow produces source-aware manufacturing, verified fleet and short-lived artifacts',()=>{
 const s=read();
 assert.match(s,/run-autonomous-factory\.js/);
 assert.match(s,/validate-autonomy-ideas\.js --build-pending/);
 assert.match(s,/export-autonomous-fleet\.js/);
 assert.match(s,/retention-days: 7/);
 assert.match(s,/include-hidden-files: false/);
 assert.match(s,/cron: '23 \*\/6 \* \* \*'/);
});
