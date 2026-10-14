'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadOpportunities,reportOpportunities}=require('./cross-family');
const {compileQuoteApp}=require('../quote-family/manufacturing');
const {compileInventoryPackage}=require('../inventory-family/manufacturing');
const SRC=path.join(__dirname,'cross-family','proposals.json');
const scratch=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cross-family-ideas-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const mutate=(t,fn)=>{const d=scratch(t),file=path.join(d,'source.json');
 const row=JSON.parse(fs.readFileSync(SRC,'utf8'));
 fn(row);fs.writeFileSync(file,JSON.stringify(row));return file;};
test('constrained source corpus generates eight independently distinct runnable application specifications',()=>{
 const rows=loadOpportunities();assert.equal(rows.length,8);
 assert.equal(rows.filter(v=>v.family==='quote-to-order').length,4);
 assert.equal(rows.filter(v=>v.family==='inventory-control').length,4);
 assert.equal(new Set(rows.map(v=>v.key)).size,8);
 for(const row of rows){
  const pkg=row.family==='quote-to-order'?compileQuoteApp(row.recipe):compileInventoryPackage(row.recipe);
  assert.equal(pkg.digest.length,64);assert.equal(pkg.manifest.releaseApproved,false);
  assert.equal(row.buyerDemandValidated,false);assert.ok(row.technicalFitScore>=65);
 }
 const report=reportOpportunities();
 assert.equal(report.total,8);assert.equal(report.independentBuyerEvidence,false);
 assert.equal(report.publicDeploymentEnabled,false);assert.equal(report.collectedRevenue,null);
 assert.equal(report.releaseApproved,false);
});
test('ideas cannot be metadata-only copies of an existing application',t=>{
 const p=mutate(t,v=>{
  v.proposals[0].key='copy-estimate';
  v.proposals[0].inputs=[{id:'print-pages',label:'Printed pages',unit:'page'},
   {id:'finishing',label:'Finishing labor',unit:'hour'},
   {id:'proof-setup',label:'Proof setup',unit:'job'}];
 });
 assert.throws(()=>loadOpportunities({sourceFile:p}),/OPPORTUNITY_DUPLICATE/);
});
test('unsafe sources, unverified commercial assertions, future dates and executable input fail closed',t=>{
 for(const edit of [
   x=>x.proposals[0].sources[0].url='https://localhost/private',
   x=>x.proposals[0].sourceStatus='externally_paid',
   x=>x.proposals[0].sources[1].observedOn='2026-12-01',
   x=>x.proposals[0].inputs[0].label='<script>alert(1)</script>',
   x=>x.proposals[0].buyer='someone@private.example',
   x=>x.proposals[0].inputs[1].id=x.proposals[0].inputs[0].id]){
  const p=mutate(t,edit);
  assert.throws(()=>loadOpportunities({sourceFile:p}),/OPPORTUNITY_/);
 }
});
test('corrupt sources, extra revenue fields and symlinks are rejected',t=>{
 const d=scratch(t),file=path.join(d,'broken.json');
 fs.writeFileSync(file,'{broken JSON'.padEnd(120,' '));
 assert.throws(()=>loadOpportunities({sourceFile:file}),/OPPORTUNITY_INVALID/);
 const copy=JSON.parse(fs.readFileSync(SRC,'utf8'));copy.proposals[0].revenue=100;
 fs.writeFileSync(file,JSON.stringify(copy));
 assert.throws(()=>loadOpportunities({sourceFile:file}),/OPPORTUNITY_INVALID/);
 if(process.platform!=='win32'){
  const link=path.join(d,'link.json');fs.symlinkSync(SRC,link);
  assert.throws(()=>loadOpportunities({sourceFile:link}),/OPPORTUNITY_SOURCE_INVALID/);
 }
});
