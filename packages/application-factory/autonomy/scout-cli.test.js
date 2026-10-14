'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const path=require('node:path'),script=path.resolve(__dirname,'../../../scripts/scout-app-ideas.js');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
test('automatic source-backed research inventory is read-only and admits three unverified ideas',()=>{
 const r=run('--check');assert.equal(r.status,0,r.stderr);
 const report=JSON.parse(r.stdout);assert.equal(report.eligible,3);
 assert.deepEqual(report.reservedCycles,[75,76,77]);
 assert.equal(report.independentMarketEvidence,false);assert.equal(report.releaseApproved,false);
});
test('scout has no network, spending, outreach, public deploy or repository-write flags',()=>{
 for(const args of [['--deploy'],['--publish'],['--charge'],['--email'],
  ['--build','--output','relative'],['--build'],['--check','--check']])
  assert.notEqual(run(...args).status,0,args.join(' '));
});
