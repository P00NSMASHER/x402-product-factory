'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../../../scripts/growth-lab.js');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-growth-cli-')),
 ledger=path.join(dir,'proof.json'),chain=path.join(dir,'chain.key'),review=path.join(dir,'review.key'),eventFile=path.join(dir,'event.json');
 const chainKey=crypto.randomBytes(32),reviewKey=crypto.randomBytes(32);
 fs.writeFileSync(chain,chainKey.toString('hex'),{mode:0o600});fs.writeFileSync(review,reviewKey.toString('hex'),{mode:0o600});
 const common=['--ledger',ledger,'--chain-key-file',chain,'--reviewer-key-hash',sha(reviewKey)];
 const run=(cmd,...args)=>spawnSync(process.execPath,[script,cmd,...common,...args],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH||''}});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,ledger,chain,review,eventFile,run,common};}
test('operator CLI can create, record, attest and score without returning personal data or keys',t=>{
  const x=setup(t),init=x.run('init');assert.equal(init.status,0,init.stderr);assert.equal(init.stdout.includes(fs.readFileSync(x.chain,'utf8')),false);
  const before=JSON.parse(x.run('report').stdout);assert.equal(before.length,3);assert.ok(before.every(x=>x.stage==='research'));
  const data={recipeId:'supplier-desk',kind:'qualified_conversation',origin:'external',buyerHash:sha('synthetic customer'),referenceHash:sha('synthetic notes'),source:'interview_record',cents:null};
  fs.writeFileSync(x.eventFile,JSON.stringify(data),{mode:0o600});
  const created=x.run('record','--event-file',x.eventFile);assert.equal(created.status,0,created.stderr);
  const row=JSON.parse(created.stdout);assert.equal(row.attested,false);
  assert.equal(JSON.parse(x.run('report','--recipe','supplier-desk').stdout).interviews,0);
  const attested=x.run('attest','--seq',String(row.seq),'--reviewer-key-file',x.review);
  assert.equal(attested.status,0,attested.stderr);assert.equal(JSON.parse(attested.stdout).attested,true);
  const report=JSON.parse(x.run('report','--recipe','supplier-desk').stdout);
  assert.equal(report.interviews,1);assert.equal(report.releaseApproved,false);assert.equal(report.collectedRevenue,null);
  assert.equal(fs.readFileSync(x.ledger,'utf8').includes('synthetic customer'),false);
});
test('CLI fails closed on missing private keys, unknown args, and repository ledger paths',t=>{
  const x=setup(t);assert.notEqual(x.run('unknown').status,0);
  assert.notEqual(x.run('record').status,0);assert.notEqual(x.run('attest','--seq','none').status,0);
  assert.notEqual(x.run('report','--unexpected','value').status,0);
  assert.notEqual(x.run('report','--recipe','../bad').status,0);
  assert.notEqual(x.run('report','--chain-key-file','/does-not-exist-factory.key').status,0);
});
test('CLI prevents synthetic events from becoming reviewed demand',t=>{
  const x=setup(t);x.run('init');fs.writeFileSync(x.eventFile,JSON.stringify({recipeId:'supplier-desk',kind:'pilot_paid',origin:'synthetic',buyerHash:sha('demo'),referenceHash:sha('demo-paid'),source:'payment_record',cents:24900}),{mode:0o600});
  assert.equal(x.run('record','--event-file',x.eventFile).status,0);
  assert.notEqual(x.run('attest','--seq','1','--reviewer-key-file',x.review).status,0);
  const r=JSON.parse(x.run('report','--recipe','supplier-desk').stdout);assert.equal(r.paidPilotBuyers,0);assert.equal(r.stage,'research');
});
