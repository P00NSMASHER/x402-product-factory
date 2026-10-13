'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {runCycle}=require('./loop');
const restored=path.resolve(__dirname,'../../../scripts/restore-autonomous-checkpoint.js'),
  exported=path.resolve(__dirname,'../../../scripts/export-autonomous-fleet.js');
const {spawnSync}=require('node:child_process');
const at='2026-10-13T00:00:00Z';
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-crossrun-cli-'));
 const source=path.join(root,'source'),output=path.join(root,'output'),report=path.join(root,'dashboard');
 fs.mkdirSync(source,{mode:0o700});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,source,output,report};
}
const cmd=(file,...args)=>spawnSync(process.execPath,[file,...args],{encoding:'utf8',timeout:120000});
test('separate runner process restores a real full-stack verified app across state directories',t=>{
 const x=setup(t),r=runCycle({at,outputRoot:x.source});assert.equal(r.accepted,1);
 const child=cmd(restored,'--source',x.source,'--output',x.output);
 assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout);
 assert.equal(result.verifiedImports,1);assert.equal(result.realCustomers,null);
 assert.equal(result.transmittedMessages,0);assert.equal(result.releaseApproved,false);
 assert.equal(fs.existsSync(path.join(x.output,'autonomy','cycle-0.json')),true);
});
test('fleet CLI writes a new private HTML and JSON with byte-verified digests',t=>{
 const x=setup(t);runCycle({at,outputRoot:x.source});
 const child=cmd(exported,'--state-dir',x.source,'--output-dir',x.report,'--at',at,'--lookback','1');
 assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout);
 assert.equal(result.verifiedApps,1);assert.equal(result.releaseApproved,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(x.report,'integrity.json'),'utf8'));
 for(const name of ['index.html','fleet.json']){
  const bytes=fs.readFileSync(path.join(x.report,name));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.files[name]);
 }
 assert.equal(fs.readFileSync(path.join(x.report,'index.html'),'utf8').includes('Autonomous Factory Fleet'),true);
});
test('report exports cannot overwrite existing destination or change verified historical files',t=>{
 const x=setup(t);runCycle({at,outputRoot:x.source});
 const args=['--state-dir',x.source,'--output-dir',x.report,'--at',at,'--lookback','1'];
 assert.equal(cmd(exported,...args).status,0);
 const before=fs.readFileSync(path.join(x.report,'fleet.json'));
 assert.notEqual(cmd(exported,...args).status,0);
 assert.deepEqual(fs.readFileSync(path.join(x.report,'fleet.json')),before);
});
test('unknown outreach, deploy, billing and excessive resource flags are denied',t=>{
 const x=setup(t);
 for(const [tool,args] of [
  [restored,['--send']], [restored,['--source',x.source,'--output',x.output,'--max-cycles','999']],
  [restored,['--source',x.source,'--output','relative']],
  [exported,['--charge']], [exported,['--state-dir',x.source,'--output-dir',x.report,'--deploy']],
  [exported,['--state-dir',x.source,'--output-dir',x.report,'--lookback','500']]
 ]){const r=cmd(tool,...args);assert.notEqual(r.status,0,args.join(' '));}
});
test('empty source can be audited without fake customer or deployment status',t=>{
 const x=setup(t),child=cmd(exported,'--state-dir',x.source,'--output-dir',x.report,'--at',at,'--lookback','1');
 assert.equal(child.status,0,child.stderr);const out=JSON.parse(fs.readFileSync(path.join(x.report,'fleet.json')));
 assert.equal(out.summary.verifiedApps,0);assert.equal(out.realCustomers,null);
 assert.equal(out.collectedRevenue,null);assert.equal(out.releaseApproved,false);
});
