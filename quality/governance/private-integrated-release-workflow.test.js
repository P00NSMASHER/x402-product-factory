'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../.github/workflows/factory-private-integrated-release-ci.yml');
test('integrated candidate CI requires current main ancestry, complete history and no ref mutation',()=>{
 const w=fs.readFileSync(file,'utf8');
 assert.match(w,/fetch-depth: 0/);
 assert.match(w,/persist-credentials: false/);
 assert.match(w,/merge-base --is-ancestor refs\/remotes\/origin\/main HEAD/);
 assert.match(w,/git rev-list --count HEAD\.\.refs\/remotes\/origin\/main/);
 assert.match(w,/test "\$missing" = 0/);
 assert.match(w,/candidateBehindBy!==0/);
 assert.match(w,/cleanMergePossible!==true/);
 assert.match(w,/mainRefModified!==false/);
 assert.match(w,/gitRefsUpdated!==0/);
 assert.match(w,/productionReady!==false/);
 assert.match(w,/releaseApproved!==false/);
});
test('integrated candidate tests full family ABI and never enables public release',()=>{
 const w=fs.readFileSync(file,'utf8');
 assert.match(w,/node --test packages\/application-factory\/manufacturing\/\*\.test\.js/);
 assert.match(w,/node --test packages\/application-factory\/quote-family\/\*\.test\.js/);
 assert.match(w,/node --test packages\/application-factory\/inventory-family\/\*\.test\.js/);
 assert.match(w,/node --test quality\/governance\/application-production-audit\.test\.js/);
 assert.match(w,/private-main-synchronized-source-evidence/);
 assert.match(w,/retention-days: 7/);
 assert.match(w,/permissions:\n  contents: read/);
 assert.doesNotMatch(w,/(?:\r|\n)\s+schedule:|contents: write|pull-requests: write|id-token: write|gh pr merge|git push|wrangler deploy|tailscale serve|--publish|--charge|--contact/);
});
