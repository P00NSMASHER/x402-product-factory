'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateRecipe,createQuote,changeQuote,projectQuote,quoteTotals}=require('./kernel');
const recipes=require('./recipes.json');
const day='2026-10-13';
function draft(){return createQuote(recipes[0],{id:'q1',clientLabel:'Synthetic retail client',validUntil:'2026-10-20'},day);}
const line={id:'l1',itemId:recipes[0].items[0].id,quantity:250,unitPriceCents:12};

test('three genuinely distinct quote product editions are kernel-valid',()=>{
 assert.equal(recipes.length,3);assert.equal(new Set(recipes.map(r=>r.id)).size,3);
 assert.equal(new Set(recipes.map(r=>r.items.map(i=>i.id).join('|'))).size,3);
 for(const r of recipes){assert.deepEqual(validateRecipe(r),r);assert.equal(r.family,'quote-to-order');assert.ok(r.items.length>=3);}
});
test('quote input requires explicit bounded client label and validity date',()=>{
 assert.equal(draft().status,'draft');
 for(const bad of [{id:'q1',clientLabel:'',validUntil:'2026-10-20'},
  {id:'q1',clientLabel:'x',validUntil:'2026-10-12'},
  {id:'q1',clientLabel:'x',validUntil:'2026-10-20',paid:true},
  {id:'../../bad',clientLabel:'x',validUntil:'2026-10-20'}])assert.throws(()=>createQuote(recipes[0],bad,day));
});
test('line item quantities, prices and totals are exact safe integer cents',()=>{
 let q=draft();q=changeQuote(recipes[0],q,{type:'line_upsert',line},'operator',day);
 assert.equal(quoteTotals(q).subtotalCents,3000);assert.equal(projectQuote(recipes[0],q,day).totalCents,3000);
 for(const invalid of [{...line,quantity:0},{...line,quantity:1.2},{...line,unitPriceCents:-1},
  {...line,itemId:'unknown'},{...line,unitPriceCents:1e12},{...line,discount:100}])
  assert.throws(()=>changeQuote(recipes[0],draft(),{type:'line_upsert',line:invalid},'operator',day));
});
test('two-role approval gate prevents operator self approval and reviewer pricing edits',()=>{
 let q=changeQuote(recipes[0],draft(),{type:'line_upsert',line},'operator',day);
 q=changeQuote(recipes[0],q,{type:'submit'},'operator',day);assert.equal(q.status,'pending_review');
 assert.throws(()=>changeQuote(recipes[0],q,{type:'approve'},'operator',day),/FORBIDDEN/);
 assert.throws(()=>changeQuote(recipes[0],q,{type:'line_remove',lineId:'l1'},'reviewer',day),/FORBIDDEN/);
 q=changeQuote(recipes[0],q,{type:'approve'},'reviewer',day);
 assert.equal(q.status,'approved');assert.equal(projectQuote(recipes[0],q,day).status,'approved');
 q=changeQuote(recipes[0],q,{type:'convert'},'operator',day);
 assert.equal(q.status,'converted');assert.equal(q.order.quoteId,'q1');assert.equal(q.order.totalCents,3000);
 assert.equal(q.order.paymentStatus,'not_configured');
 assert.throws(()=>changeQuote(recipes[0],q,{type:'convert'},'operator',day));
});
test('draft revision required after rejection, no unauthorized reviewer order conversion',()=>{
 let q=changeQuote(recipes[0],draft(),{type:'line_upsert',line},'operator',day);
 q=changeQuote(recipes[0],q,{type:'submit'},'operator',day);
 q=changeQuote(recipes[0],q,{type:'reject'},'reviewer',day);
 assert.equal(q.status,'rejected');assert.throws(()=>changeQuote(recipes[0],q,{type:'approve'},'reviewer',day));
 q=changeQuote(recipes[0],q,{type:'reopen'},'operator',day);
 assert.equal(q.status,'draft');assert.throws(()=>changeQuote(recipes[0],q,{type:'convert'},'reviewer',day));
});
test('expired quotes cannot be approved or converted even if stored status is stale',()=>{
 let q=changeQuote(recipes[0],draft(),{type:'line_upsert',line},'operator',day);
 q=changeQuote(recipes[0],q,{type:'submit'},'operator',day);
 assert.equal(projectQuote(recipes[0],q,'2026-10-21').status,'expired');
 assert.throws(()=>changeQuote(recipes[0],q,{type:'approve'},'reviewer','2026-10-21'),/QUOTE_EXPIRED/);
});
test('history is bounded; caller mutation cannot edit the live quote state',()=>{
 const q=draft(),updated=changeQuote(recipes[0],q,{type:'line_upsert',line},'operator',day);
 assert.equal(q.lines.length,0);assert.equal(updated.lines.length,1);
 updated.lines[0].unitPriceCents=999;
 assert.equal(q.lines.length,0);
});
test('unsupported commands, fields, roles and markup are rejected',()=>{
 for(const x of [{type:'mark_paid'},{type:'approve',paid:true}, {type:'add',source:'http://evil'}])
  assert.throws(()=>changeQuote(recipes[0],draft(),x,'operator',day));
 assert.throws(()=>changeQuote(recipes[0],draft(),{type:'line_upsert',line},'admin',day));
 const bad={...recipes[0],items:[{...recipes[0].items[0],label:'<img>'},...recipes[0].items.slice(1)]};
 assert.throws(()=>validateRecipe(bad));
});
