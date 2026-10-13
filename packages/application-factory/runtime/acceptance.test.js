"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const target=path.join(__dirname,'acceptance.js');
const acceptance=fs.existsSync(target)?require(target):{};
test('durable acceptance executes 100 workspaces through separate worker processes',()=>{
  assert.equal(typeof acceptance.runAcceptance,'function');
  const r=acceptance.runAcceptance();assert.equal(r.passed,true);assert.equal(r.workspacesCreated,100);
  assert.equal(r.workspaceRunsCompleted,100);assert.equal(r.notificationsPersisted,100);assert.equal(r.duplicateNotifications,0);
  assert.equal(r.workerProcesses,4);assert.equal(r.editions,3);assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
  assert.equal(r.externalMessagesSent,0);assert.equal(r.releaseApproved,false);
});
