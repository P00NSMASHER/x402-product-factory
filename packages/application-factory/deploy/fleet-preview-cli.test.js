'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const path=require('node:path');
const {parse}=require('../../../scripts/run-private-fleet-preview');
const command=path.resolve(__dirname,'../../../scripts/run-private-fleet-preview.js');
test('private fleet launcher only accepts explicit local sources, fresh absolute state, no spending flags',()=>{
 const roots=['--document','/tmp/apps-document','--quote','/tmp/apps-quote','--inventory','/tmp/apps-inventory','--state-root','/tmp/new-session'];
 const normal=parse(['--exercise',...roots]);
 assert.equal(normal.mode,'--exercise');assert.equal(normal.portalPort,0);
 for(const args of [['--publish'],['--charge'],['--send-email'],['--serve',...roots,'--port','65536'],
  ['--exercise',...roots,'--port','80'],['--serve',...roots.slice(0,-1),'relative'],
  ['--exercise',...roots,'--token','private-secret'],['--serve',...roots,'--public-host','0.0.0.0']]){
  assert.throws(()=>parse(args),/USAGE_INVALID/);
  const run=spawnSync(process.execPath,[command,...args],{encoding:'utf8',timeout:10000});
  assert.notEqual(run.status,0);
 }
});
