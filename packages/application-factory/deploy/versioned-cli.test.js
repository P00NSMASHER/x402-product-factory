'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),path=require('node:path');
const script=path.resolve(__dirname,'../../../scripts/rehearse-versioned-rollout.js');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:12000});
test('rehearsal does not accept publishing, credentials, sending, money or remote URLs',()=>{
 for(const opts of [
 ['--publish'],['--charge'],['--email'],['--deploy','https://host.example'],
 ['--document','https://example.com','--quote','/tmp/b','--inventory','/tmp/c','--output','/tmp/d'],
 ['--document','/tmp/a','--quote','/tmp/b','--inventory','/tmp/c','--output','relative'],
 ['--document','/tmp/a','--quote','/tmp/b','--inventory','/tmp/c','--output','/tmp/d','--override-safety']
 ])assert.notEqual(run(...opts).status,0,opts.join(' '));
});
