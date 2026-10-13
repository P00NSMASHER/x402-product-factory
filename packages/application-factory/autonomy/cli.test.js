'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../../../scripts/run-autonomous-factory.js');
test('planning a scheduled slot in a new CLI process needs no human input or credentials',()=>{
 const r=spawnSync(process.execPath,[script,'--plan-only','--at','2026-10-13T00:00:00Z'],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);const row=JSON.parse(r.stdout);
 assert.equal(row.recipes.length,1);assert.equal(row.scheduleHours,6);
 assert.equal(row.marketValidated,false);assert.equal(row.releaseApproved,false);
 assert.equal(row.collectedRevenue,null);
});
test('CLI refuses unsafe flags and unbounded generation',()=>{
 for(const args of [['--send','yes'],['--batch-size','100','--plan-only'],
   ['--plan-only','--at','fake'],['--enable-billing'],['--plan-only','--plan-only']]){
  const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
  assert.notEqual(r.status,0);assert.equal(r.stdout.includes('credential'),false);
 }
});
test('CLI requires an explicit private output directory for actual manufacturing',()=>{
 const r=spawnSync(process.execPath,[script,'--at','2026-10-13T00:00:00Z'],{encoding:'utf8',timeout:10000});
 assert.notEqual(r.status,0);assert.match(r.stderr,/safe private|invalid/i);
});
test('CLI exit status and output are honest when source catalog exhausted',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-autonomy-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const time=new Date(Date.parse('2026-10-13T00:00:00Z')+72*21600000).toISOString();
 const r=spawnSync(process.execPath,[script,'--output',dir,'--at',time],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);
 assert.equal(result.exhausted,true);assert.equal(result.accepted,0);assert.equal(result.nextAction,'catalog_refresh_required');
 assert.equal(result.releaseApproved,false);
 assert.equal(fs.readdirSync(path.join(dir,'autonomy')).length,1);
});
