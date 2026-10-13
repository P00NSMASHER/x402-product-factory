'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const program=path.resolve(__dirname,'../../../scripts/create-acquisition-kit.js');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-acquisition-cli-'));
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));const date=new Date().toISOString().slice(0,10);
  const input=path.join(dir,'candidates.json'),ledger=path.join(dir,'ledger.json'),key=path.join(dir,'private-key.hex');
  fs.writeFileSync(input,JSON.stringify({schemaVersion:1,targets:[{company:'Demo Industrial',homepage:'https://demo-industrial.example.com',recipeId:'supplier-desk',
    observations:[{url:'https://demo-industrial.example.com/about',signal:'business_category',observedOn:date,note:'Website publicly identifies its company with industrial distribution services.'}]}]}));
  fs.writeFileSync(key,crypto.randomBytes(32).toString('hex')+'\n',{mode:0o600});
  const run=(...args)=>spawnSync(process.execPath,[program,...args],{encoding:'utf8',timeout:12000});
  return {run,dir,input,ledger,key,date};
}
test('mass-produce a private two-file prospect research and draft outreach kit',t=>{
  const x=setup(t),out=path.join(x.dir,'launch');const r=x.run('plan','--input',x.input,'--output-dir',out,'--as-of',x.date);
  assert.equal(r.status,0,r.stderr);const response=JSON.parse(r.stdout);
  assert.equal(response.draftOnly,true);assert.equal(response.targets,1);assert.equal(response.transmittedMessages,0);
  const markdown=fs.readFileSync(path.join(out,'buyer-research.md'),'utf8');assert.match(markdown,/DRAFT ONLY/);assert.match(markdown,/Demo Industrial/);
  const json=JSON.parse(fs.readFileSync(path.join(out,'research-queue.json'),'utf8'));
  assert.equal(json.outreachEnabled,false);assert.equal(json.realCustomers,null);assert.ok(!markdown.includes('mailto:'));
  assert.equal(x.run('plan','--input',x.input,'--output-dir',out,'--as-of',x.date).status,1);
});
test('malicious prospect URLs, PII, and invalid source arrays fail without published files',t=>{
  const x=setup(t),item=JSON.parse(fs.readFileSync(x.input,'utf8'));item.targets[0].email='private@private.com';
  fs.writeFileSync(x.input,JSON.stringify(item));const out=path.join(x.dir,'launch');
  const r=x.run('plan','--input',x.input,'--output-dir',out,'--as-of',x.date);
  assert.equal(r.status,1);assert.equal(fs.existsSync(out),false);
});
test('initialization records only public research and never prints campaign secret',t=>{
  const x=setup(t);const r=x.run('init','--input',x.input,'--ledger',x.ledger,'--key-file',x.key);
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).targets,1);
  assert.equal(r.stdout.includes(fs.readFileSync(x.key,'utf8').trim()),false);
  if(process.platform!=='win32')assert.equal(fs.statSync(x.ledger).mode&0o777,0o600);
  const reread=x.run('report','--ledger',x.ledger,'--key-file',x.key);
  assert.equal(reread.status,0);assert.equal(JSON.parse(reread.stdout).transmittedMessages,0);
});
test('operator review, follow-up and do-not-contact affect only private recommendations',t=>{
  const x=setup(t);assert.equal(x.run('init','--input',x.input,'--ledger',x.ledger,'--key-file',x.key).status,0);
  assert.equal(x.run('event','--ledger',x.ledger,'--key-file',x.key,'--domain','demo-industrial.example.com','--kind','reviewed','--request-key','r1').status,0);
  assert.equal(x.run('event','--ledger',x.ledger,'--key-file',x.key,'--domain','demo-industrial.example.com','--kind','do_not_contact','--request-key','r2').status,0);
  const r=JSON.parse(x.run('report','--ledger',x.ledger,'--key-file',x.key).stdout);
  assert.equal(r.suppressed,1);assert.equal(r.transmittedMessages,0);assert.deepEqual(r.nextActions,[]);
});
test('there are no commands that can send, deploy, buy, bill, or activate commercial outreach',t=>{
  const x=setup(t);
  for(const cmd of ['send','dispatch','subscribe','deploy','charge','outreach'])assert.equal(x.run(cmd,'--input',x.input).status,1);
  assert.equal(fs.existsSync(x.ledger),false);
});
