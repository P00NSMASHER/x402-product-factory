'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../../../scripts/resume-autonomous-factory.js');
const time='2026-10-13T06:00:00Z';
const call=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
test('read-only CLI plans oldest missed slot without requiring browser',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-recovery-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const p=call('--plan-only','--output',dir,'--at',time,'--window-cycles','2');
 assert.equal(p.status,0,p.stderr);const data=JSON.parse(p.stdout);
 assert.equal(data.kind,'autonomous-recovery-plan');assert.equal(data.selectedCycle,0);
 assert.equal(data.releaseApproved,false);assert.equal(data.transmittedMessages,0);
 assert.equal(fs.existsSync(path.join(dir,'autonomy')),false);
});
test('unrecognized spending, messages or unsafe options cannot reach the build',()=>{
 for(const args of [['--send'],['--charge'],['--deploy'],['--output','relative'],
 ['--plan-only','--output','relative'],['--at','2000-01-01T00:00:00Z'],['--window-cycles','99'],
 ['--plan-only','--plan-only']]){
  const row=call(...args);assert.notEqual(row.status,0,args.join(' '));
 }
});
test('CLI refuses a build without an explicit private persistent output',()=>{
 const row=call('--at',time);assert.notEqual(row.status,0);
 assert.match(row.stderr,/private|blocked|invalid/i);
});
