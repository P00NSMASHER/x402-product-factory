'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../../../scripts/backfill-autonomous-factory.js');
const call=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:18000});
test('operator can plan missed cycles without creating artifacts',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-backfill-cli-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const p=call('--plan-only','--output',root,'--at','2026-10-13T12:00:00Z','--max-builds','2');
 assert.equal(p.status,0,p.stderr);
 const data=JSON.parse(p.stdout);
 assert.equal(data.selectedCycle,0);assert.equal(data.currentCycle,2);
 assert.equal(data.releaseApproved,false);assert.equal(data.transmittedMessages,0);
 assert.equal(fs.existsSync(path.join(root,'autonomy')),false);
});
test('CLI does not accept paid, public, messaging, relative or unbounded actions',()=>{
 for(const args of [['--send'],['--charge'],['--deploy'],['--output','relative'],
   ['--output','/tmp/path','--max-builds','999'],['--plan-only','--plan-only'],
   ['--output','/tmp/path','--window-cycles','99'],['--output','/tmp/path','--at','yesterday']]){
  const report=call(...args);assert.notEqual(report.status,0,args.join(' '));
 }
});
