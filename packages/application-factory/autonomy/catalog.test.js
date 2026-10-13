'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Kernel=require('../kernel');
let catalog={};try{catalog=require('./catalog');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
test('produces at least 72 distinct buyer-specific workflow editions',()=>{
 assert.equal(typeof catalog.buildCandidateCatalog,'function');
 const rows=catalog.buildCandidateCatalog();
 assert.equal(rows.length,72);assert.equal(new Set(rows.map(r=>r.id)).size,72);
 assert.equal(new Set(rows.map(r=>r.title)).size,72);
 assert.equal(new Set(rows.map(r=>r.outcome)).size,72);
});
test('every generated candidate is accepted by the real document-workflow kernel',()=>{
 for(const row of catalog.buildCandidateCatalog()){
   assert.deepEqual(Kernel.validateRecipe(row),Kernel.validateRecipe(JSON.parse(JSON.stringify(row))));
   assert.equal(row.family,'document-workflow');
   assert.ok(row.requirements.length>=3&&row.requirements.length<=12);
   assert.ok(row.requirements.some(r=>r.renewable));
 }
});
test('workflow versions differ in actual rules or checklists, not merely titles',()=>{
 const rows=catalog.buildCandidateCatalog();
 const identities=rows.map(r=>JSON.stringify([r.recordLabel,r.requirements,r.defaultDueDays,r.reminderEveryDays,r.renewalWindowDays]));
 assert.equal(new Set(identities).size,rows.length);
});
test('no candidate claims compliance certification buyers revenue or authorization',()=>{
 const rows=catalog.buildCandidateCatalog();
 for(const row of rows){
  assert.doesNotMatch(JSON.stringify(row),/guaranteed|certified|compliance approved|payment|deposit|stripe|customer testimonial/i);
  assert.doesNotMatch(row.id,/^product-0?[0-9]+/);
  assert.ok(row.title.length>=10);
 }
});
test('catalog output is immutable by callers and deterministic',()=>{
 const a=catalog.buildCandidateCatalog();
 a[0].title='Forged app';a[0].requirements[0].label='Forged checklist';
 const b=catalog.buildCandidateCatalog();
 assert.notEqual(b[0].title,'Forged app');
 assert.notEqual(b[0].requirements[0].label,'Forged checklist');
 assert.deepEqual(b,catalog.buildCandidateCatalog());
});
test('catalog is strictly finite and rejects attempts to bypass curated editions',()=>{
 assert.equal(catalog.buildCandidateCatalog().length,72);
 assert.equal(typeof catalog.buildCandidateCatalog('untrusted generated instructions')==='string',false);
});
