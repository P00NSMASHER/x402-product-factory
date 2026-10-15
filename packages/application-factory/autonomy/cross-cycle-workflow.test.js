'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const filename=path.resolve(__dirname,'../../../.github/workflows/factory-autonomy-ci.yml');
test('existing six-hour workflow restores verified quote/inventory state before selecting new work',()=>{
 const s=fs.readFileSync(filename,'utf8');
 const restore=s.indexOf('restore-cross-family-checkpoint.js --source');
 const advance=s.indexOf('run-cross-family-director.js --run');
 const deploy=s.indexOf('upload-artifact@v4');
 assert.ok(restore>0&&advance>restore&&deploy>advance);
 assert.match(s,/--output "\$RUNNER_TEMP\/autonomous-apps\/cross-family"/);
 assert.match(s,/name: autonomous-apps-\$\{\{ github.run_id \}\}/);
 assert.match(s,/--max-slots 24/);
 assert.match(s,/if: success\(\)/);
 assert.match(s,/cron: '23 \*\/6 \* \* \*'/);
 assert.match(s,/permissions:\n  contents: read\n  actions: read/);
 assert.doesNotMatch(s,/contents: write|id-token: write|gh pr merge|wrangler deploy|--send-email|--charge|tailscale serve/);
});
test('source-pinned director creates no new scheduled task or outbound communication route',()=>{
 const root=path.resolve(__dirname,'../../..');
 for(const name of ['packages/application-factory/autonomy/cross-cycle.js',
  'packages/application-factory/autonomy/cross-checkpoint.js',
  'scripts/run-cross-family-director.js','scripts/restore-cross-family-checkpoint.js']){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  assert.doesNotMatch(text,/https\.request|http\.request|fetch\(|sendEmail|sendMessage|createAutomation|scheduleTask|child_process/);
 }
});
