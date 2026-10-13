'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),recipes=require('../recipes.json');
const script=path.resolve(__dirname,'../../../scripts/manufacture-applications.js');
test('manufacturing command runs an actual packaged workflow and resumes an accepted edition',t=>{
  assert.ok(fs.existsSync(script),'manufacturing command must exist');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'factory-manufacture-cli-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const input=path.join(temp,'recipes.json'),output=path.join(temp,'output');fs.writeFileSync(input,JSON.stringify([recipes[0]]));
  const args=[script,'--recipes',input,'--output',output];
  const run=()=>spawnSync(process.execPath,args,{encoding:'utf8',timeout:40000,killSignal:'SIGKILL',maxBuffer:65536});
  const first=run();assert.equal(first.status,0,first.stderr);const a=JSON.parse(first.stdout);assert.equal(a.accepted,1);assert.equal(a.verification,'executed-packaged-workflow');
  const next=run();assert.equal(next.status,0,next.stderr);assert.equal(JSON.parse(next.stdout).reused,1);
});
test('CLI rejects unknown flags, missing paths and non-array recipe input without output',t=>{
  assert.ok(fs.existsSync(script),'manufacturing command must exist');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'factory-manufacture-args-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const input=path.join(temp,'invalid.json'),output=path.join(temp,'output');fs.writeFileSync(input,'{}');
  for(const args of [[],['--launch','true'],['--recipes',input,'--output',output]]){
    const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:5000});assert.notEqual(r.status,0);assert.equal(fs.existsSync(output),false);
  }
});
