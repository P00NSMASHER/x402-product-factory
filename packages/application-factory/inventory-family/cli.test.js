'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipes=require('./recipes.json');
const {compileInventoryPackage}=require('./manufacturing');
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-cli-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('self-contained package can provision two private credentials without printing either key',async t=>{
 const tmp=dir(t),app=path.join(tmp,'candidate'),state=path.join(tmp,'state');
 fs.mkdirSync(app,{mode:0o700});
 const files=compileInventoryPackage(recipes[0]).files;
 for(const [name,body]of Object.entries(files))fs.writeFileSync(path.join(app,name),body);
 const {main}=require(path.join(app,'run.js'));
 const result=await main(['provision','--state-dir',state,'--tenant','synthetic-local']);
 assert.equal(result.credentialsPrinted,false);assert.equal(result.credentialFilesCreated,2);
 const operator=JSON.parse(fs.readFileSync(path.join(state,'synthetic-local-operator.json'),'utf8'));
 const reviewer=JSON.parse(fs.readFileSync(path.join(state,'synthetic-local-reviewer.json'),'utf8'));
 assert.equal(operator.accessKey.length,43);assert.equal(reviewer.accessKey.length,43);
 assert.notEqual(operator.accessKey,reviewer.accessKey);
 assert.equal(JSON.stringify(result).includes(operator.accessKey),false);
 assert.equal(JSON.stringify(result).includes(reviewer.accessKey),false);
 if(process.platform!=='win32'){
  assert.equal(fs.statSync(path.join(state,'synthetic-local-operator.json')).mode&0o077,0);
  assert.equal(fs.statSync(path.join(state,'synthetic-local-reviewer.json')).mode&0o077,0);
 }
});
test('operator-only work cannot be accidentally exposed as a public server',async t=>{
 const tmp=dir(t),app=path.join(tmp,'candidate'),state=path.join(tmp,'state');fs.mkdirSync(app,{mode:0o700});
 for(const [name,body]of Object.entries(compileInventoryPackage(recipes[1]).files))fs.writeFileSync(path.join(app,name),body);
 const {main}=require(path.join(app,'run.js'));
 await assert.rejects(()=>main(['serve','--state-dir',state,'--port','-1']),/PORT_INVALID/);
 await assert.rejects(()=>main(['serve','--state-dir',state,'--port','99999']),/PORT_INVALID/);
 await assert.rejects(()=>main(['provision','--state-dir',state]),/USAGE_INVALID/);
 await assert.rejects(()=>main(['provision','--state-dir',state,'--tenant','synthetic','--public','yes']),/USAGE_INVALID/);
});
test('background internal replenishment is a local worker with zero outbound financial authority',async t=>{
 const tmp=dir(t),app=path.join(tmp,'candidate'),state=path.join(tmp,'state');fs.mkdirSync(app,{mode:0o700});
 for(const [name,body]of Object.entries(compileInventoryPackage(recipes[2]).files))fs.writeFileSync(path.join(app,name),body);
 const {main}=require(path.join(app,'run.js'));
 await main(['provision','--state-dir',state,'--tenant','synthetic-local']);
 const result=await main(['sweep','--state-dir',state]);
 assert.equal(result.proposed,3);assert.equal(result.externalOrdersPlaced,0);
 assert.equal(result.paymentsSent,0);assert.equal(result.emailsSent,0);
 assert.equal((await main(['sweep','--state-dir',state])).proposed,0);
});
