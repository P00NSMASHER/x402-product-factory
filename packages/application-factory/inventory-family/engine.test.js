'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const recipes=require('./recipes.json');
let engine={};try{engine=require('./engine');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const at='2026-10-13';
const ready=()=>{assert.equal(typeof engine.openItem,'function');return engine.openItem(recipes[0],recipes[0].items[0].id,at);};
test('three differentiated inventory domains have real sku templates',()=>{
 assert.equal(typeof engine.validateRecipe,'function');
 assert.equal(recipes.length,3);
 assert.equal(new Set(recipes.map(x=>x.id)).size,3);
 for(const r of recipes){assert.deepEqual(engine.validateRecipe(r),JSON.parse(JSON.stringify(r)));
  assert.ok(r.items.length>=3);assert.ok(new Set(r.items.map(x=>x.id)).size===r.items.length);}
 assert.notDeepEqual(recipes[0].items.map(x=>x.id),recipes[1].items.map(x=>x.id));
});
test('stock is received, reserved, consumed, and released with exact quantities',()=>{
 const r=recipes[0],id=r.items[0].id;let s=ready();
 s=engine.applyCommand(r,s,{type:'receive',quantity:30},'operator',at);
 assert.equal(s.onHand,30);assert.equal(s.reserved,0);
 s=engine.applyCommand(r,s,{type:'reserve',quantity:12},'operator',at);
 assert.equal(s.onHand,30);assert.equal(s.reserved,12);
 s=engine.applyCommand(r,s,{type:'consume',quantity:5},'operator',at);
 assert.equal(s.onHand,25);assert.equal(s.reserved,7);
 s=engine.applyCommand(r,s,{type:'release',quantity:7},'operator',at);
 assert.equal(s.reserved,0);assert.equal(s.onHand,25);
 assert.equal(engine.projectItem(r,s,at).available,25);
});
test('unavailable stock cannot be reserved or consumed into a negative number',()=>{
 const r=recipes[0];let s=ready();
 assert.throws(()=>engine.applyCommand(r,s,{type:'reserve',quantity:1},'operator',at),/STOCK_SHORT/);
 assert.throws(()=>engine.applyCommand(r,s,{type:'consume',quantity:1},'operator',at),/STOCK_SHORT/);
 s=engine.applyCommand(r,s,{type:'receive',quantity:3},'operator',at);
 s=engine.applyCommand(r,s,{type:'reserve',quantity:3},'operator',at);
 assert.throws(()=>engine.applyCommand(r,s,{type:'reserve',quantity:1},'operator',at),/STOCK_SHORT/);
 assert.throws(()=>engine.applyCommand(r,s,{type:'consume',quantity:4},'operator',at),/STOCK_SHORT/);
});
test('replenishment is a nonbinding calculation with no supplier purchase',()=>{
 const r=recipes[0];let s=ready();const before=engine.projectItem(r,s,at);
 assert.ok(before.recommendation.quantity>0);
 assert.equal(before.recommendation.costCents,before.recommendation.quantity*r.items[0].sampleUnitCostCents);
 assert.equal(before.recommendation.orderPlaced,false);
 assert.equal(before.recommendation.estimatedOnly,true);
 s=engine.applyCommand(r,s,{type:'request_reorder'},'operator',at);
 assert.equal(s.proposals[0].status,'pending_review');assert.equal(s.onOrder,0);
 assert.equal(s.proposals[0].orderPlaced,false);
 assert.equal(s.proposals[0].spendCommitted,false);
 assert.equal(s.proposals[0].costCents,before.recommendation.costCents);
});
test('approvals are role-separated and do not create a purchase',()=>{
 const r=recipes[0];let s=ready();
 s=engine.applyCommand(r,s,{type:'request_reorder'},'operator',at);
 assert.throws(()=>engine.applyCommand(r,s,{type:'approve'},'operator',at),/FORBIDDEN/);
 assert.throws(()=>engine.applyCommand(r,s,{type:'fulfill'},'operator',at),/ORDER_STATE/);
 s=engine.applyCommand(r,s,{type:'approve'},'reviewer',at);
 assert.equal(s.proposals[0].status,'approved_internal');
 assert.equal(s.proposals[0].orderPlaced,false);assert.equal(s.proposals[0].spendCommitted,false);
 assert.equal(s.onOrder,s.proposals[0].quantity);
 assert.throws(()=>engine.applyCommand(r,s,{type:'fulfill'},'reviewer',at),/FORBIDDEN/);
 s=engine.applyCommand(r,s,{type:'fulfill'},'operator',at);
 assert.equal(s.proposals[0].status,'received_internal');
 assert.equal(s.onOrder,0);assert.equal(s.onHand,s.proposals[0].quantity);
});
test('review rejection permits a new nonbinding proposal',()=>{
 const r=recipes[0];let s=ready();
 s=engine.applyCommand(r,s,{type:'request_reorder'},'operator',at);
 s=engine.applyCommand(r,s,{type:'reject'},'reviewer',at);
 assert.equal(s.proposals[0].status,'rejected');
 s=engine.applyCommand(r,s,{type:'request_reorder'},'operator',at);
 assert.equal(s.proposals.length,2);
});
test('simultaneous unclosed internal proposals are rejected',()=>{
 const r=recipes[0];let s=ready();s=engine.applyCommand(r,s,{type:'request_reorder'},'operator',at);
 assert.throws(()=>engine.applyCommand(r,s,{type:'request_reorder'},'operator',at),/ORDER_STATE/);
});
test('sample costs, quantities, and recipe caps are bounded exact integers',()=>{
 const r=recipes[0],s=ready();
 for(const qty of [-1,0,1.5,1e9,'4',null])
  assert.throws(()=>engine.applyCommand(r,s,{type:'receive',quantity:qty},'operator',at),/QUANTITY_INVALID/);
 const forged={...r,items:r.items.map((v,i)=>i===0?{...v,sampleUnitCostCents:9e15}:v)};
 assert.throws(()=>engine.validateRecipe(forged),/RECIPE_INVALID/);
});
test('invalid clock and role escalation cannot modify a state',()=>{
 const r=recipes[0],s=ready();
 assert.throws(()=>engine.applyCommand(r,s,{type:'receive',quantity:1},'reviewer',at),/FORBIDDEN/);
 assert.throws(()=>engine.applyCommand(r,s,{type:'receive',quantity:1},'operator','2026-10-12'),/CLOCK_INVALID/);
 assert.throws(()=>engine.applyCommand(r,s,{type:'approve'},'superadmin',at),/COMMAND_INVALID/);
 assert.equal(s.onHand,0);assert.equal(s.proposals.length,0);
});
test('archived or forged state cannot masquerade as accepted procurement',()=>{
 const r=recipes[0],s=ready();
 assert.throws(()=>engine.projectItem(r,{...s,orderPlaced:true},at),/ITEM_INVALID/);
 assert.throws(()=>engine.projectItem(r,{...s,onOrder:-1},at),/ITEM_INVALID/);
});
test('commercial release and payment authority are always explicitly disabled',()=>{
 const r=recipes[0],s=ready();const p=engine.projectItem(r,s,at);
 assert.equal(p.releaseApproved,false);assert.equal(p.realCustomers,null);
 assert.equal(p.collectedRevenue,null);assert.equal(p.supplierPurchaseEnabled,false);
 assert.equal(p.paymentEnabled,false);assert.equal(p.marketValidated,false);
});
