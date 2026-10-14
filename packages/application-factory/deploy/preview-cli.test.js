'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const path=require('node:path'),script=path.resolve(__dirname,'../../../scripts/rehearse-private-deployments.js');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:12000});
test('deployment launcher does not allow public, charge, send or permission-bypass flags',()=>{
 for(const args of [['--publish'],['--cloudflare'],['--charge'],['--send-email'],
 ['--document','https://example.com','--quote','/tmp/a','--inventory','/tmp/b','--output','/tmp/out'],
 ['--document','/tmp/a','--quote','/tmp/b','--inventory','/tmp/c','--output','relative']])
  assert.notEqual(run(...args).status,0,args.join(' '));
});
