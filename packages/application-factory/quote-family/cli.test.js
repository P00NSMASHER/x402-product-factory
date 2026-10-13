'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),generator=path.join(root,'scripts','manufacture-quote-apps.js');
const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-quote-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
test('noninteractive factory command produces and accepts three real applications',t=>{
 const dir=tmp(t),target=path.join(dir,'out');const row=spawnSync(process.execPath,[generator,'--output',target],{encoding:'utf8',timeout:25000});
 assert.equal(row.status,0,row.stderr);const report=JSON.parse(row.stdout);
 assert.equal(report.accepted,3);assert.equal(report.verification,'executed-packaged-quote-lifecycle');
 assert.equal(report.paymentsSent,0);assert.equal(report.realCustomers,null);
 assert.equal(report.releaseApproved,false);
 const rerun=spawnSync(process.execPath,[generator,'--output',target],{encoding:'utf8',timeout:25000});
 assert.equal(rerun.status,0,rerun.stderr);assert.equal(JSON.parse(rerun.stdout).reused,3);
});
test('factory CLI does not accept send, paid billing, deployment or arbitrary input recipes',()=>{
 for(const argv of [['--send'],['--output','relative'],['--output','/tmp/example','--enable-billing'],
  ['--output','/tmp/example','--send','yes'],['--recipes','/tmp/somefile']]){
  const r=spawnSync(process.execPath,[generator,...argv],{encoding:'utf8',timeout:3000});
  assert.notEqual(r.status,0,'unexpected success: '+argv.join(' '));
 }
});
test('assembled app provisions separate private operator/reviewer secrets without printing them',t=>{
 const dir=tmp(t),result=spawnSync(process.execPath,[generator,'--output',path.join(dir,'built')],{encoding:'utf8',timeout:25000});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);const row=report.apps[0];
 const folder=path.join(dir,'built',row.id+'-'+row.digest),state=path.join(dir,'private-state');
 const launched=spawnSync(process.execPath,[path.join(folder,'run.js'),'provision','--state-dir',state,'--tenant','synthetic-team'],{encoding:'utf8',timeout:6000});
 assert.equal(launched.status,0,launched.stderr);assert.match(launched.stdout,/rolesProvisioned/);
 for(const role of ['operator','reviewer']){
  const location=path.join(state,'synthetic-team-'+role+'.json');const raw=JSON.parse(fs.readFileSync(location,'utf8'));
  assert.equal(raw.token.length,43);assert.equal(launched.stdout.includes(raw.token),false);
  if(process.platform!=='win32')assert.equal(fs.statSync(location).mode&0o777,0o600);
 }
 const rerun=spawnSync(process.execPath,[path.join(folder,'run.js'),'provision','--state-dir',state,'--tenant','synthetic-team'],{encoding:'utf8'});
 assert.notEqual(rerun.status,0);
});
