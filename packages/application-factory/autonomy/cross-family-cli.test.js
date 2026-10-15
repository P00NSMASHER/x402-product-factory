'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),path=require('node:path');
const script=path.resolve(__dirname,'../../../scripts/manufacture-cross-family-ideas.js');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
test('scorer is read-only and acknowledges absence of independent demand',()=>{
 const x=run('--check');assert.equal(x.status,0,x.stderr);
 const r=JSON.parse(x.stdout);assert.equal(r.total,14);assert.equal(r.releaseApproved,false);
 assert.equal(r.scoreMeaning,'deterministic-structural-fit-not-demand-or-profitability');
});
test('scout has no public deploy, payment, outreach or unspecified output flags',()=>{
 for(const args of [['--deploy'],['--charge'],['--email'],
  ['--build','--quote-output','relative','--inventory-output','/tmp/ok'],
  ['--build','--quote-output','/tmp/a','--inventory-output','/tmp/a'],['--check','--check']])
  assert.notEqual(run(...args).status,0,args.join(' '));
});
