'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../../../scripts/application-pilots.js');
function run(args){return spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});}
test('one CLI command issues a bounded private invitation batch and report exposes no raw codes',t=>{
 assert.ok(fs.existsSync(script),'pilot CLI must exist');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-pilot-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const output=path.join(dir,'invitations.json');
 const result=run(['issue','--state-dir',dir,'--recipe-id','supplier-desk','--count','3','--output',output]);assert.equal(result.status,0,result.stderr);
 const codes=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(codes.length,3);assert.equal(new Set(codes.map(c=>c.inviteCode)).size,3);
 for(const c of codes)assert.equal(result.stdout.includes(c.inviteCode),false);
 if(process.platform!=='win32')assert.equal(fs.statSync(output).mode&0o777,0o600);
 const report=run(['report','--state-dir',dir]);assert.equal(report.status,0);const r=JSON.parse(report.stdout);assert.equal(r.issuedInvitations,3);assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
 assert.notEqual(run(['issue','--state-dir',dir,'--recipe-id','supplier-desk','--output',output]).status,0);assert.equal(JSON.parse(fs.readFileSync(output)).length,3);
 const revoke=run(['revoke','--state-dir',dir,'--invite-id',codes[0].inviteId]);assert.equal(revoke.status,0);assert.equal(JSON.parse(revoke.stdout).revoked,true);
});
test('pilot CLI rejects unknown flags, relative paths and unbounded batches without creating a code file',t=>{
 assert.ok(fs.existsSync(script));const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-pilot-cli-invalid-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const out=path.join(dir,'codes.json');
 for(const args of [['issue','--state-dir','relative','--output',out],['issue','--state-dir',dir,'--recipe-id','supplier-desk','--count','101','--output',out],['issue','--state-dir',dir,'--recipe-id','supplier-desk','--email','someone@example.com','--output',out]])assert.notEqual(run(args).status,0);
 assert.equal(fs.existsSync(out),false);
});
