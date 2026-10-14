'use strict';
// Inventory decisions and approval tracking. No supplier ordering, banking, payments or customer data.
const fail=code=>{throw Error(code);},clone=x=>JSON.parse(JSON.stringify(x));
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,fields)=>obj(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v)&&v.length<=60;
const safe=(v,cap=150)=>typeof v==='string'&&v.length>0&&v.length<=cap&&v.trim()===v&&!/[<>\x00-\x1f\x7f]/.test(v);
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function day(v){if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v))return null;
 const ms=Date.parse(v+'T00:00:00Z');return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===v?ms:null;}
function validateRecipe(r){
 if(!exact(r,['version','family','id','title','buyer','outcome','currency','reviewWindowDays','maxProposalCents','items'])||
 r.version!==1||r.family!=='inventory-control'||!id(r.id)||!safe(r.title,100)||!safe(r.buyer,180)||
 !safe(r.outcome,240)||r.currency!=='USD'||!int(r.reviewWindowDays,1,30)||
 !int(r.maxProposalCents,1000,100000000)||!Array.isArray(r.items)||r.items.length<3||r.items.length>12)fail('RECIPE_INVALID');
 const seen=new Set();for(const x of r.items){
  if(!exact(x,['id','label','unit','reorderPoint','targetLevel','sampleUnitCostCents'])||!id(x.id)||
   seen.has(x.id)||!safe(x.label,120)||!['kit','piece','pack','case','unit','box'].includes(x.unit)||
   !int(x.reorderPoint,0,100000)||!int(x.targetLevel,x.reorderPoint+1,1000000)||
   !int(x.sampleUnitCostCents,1,10000000)||x.targetLevel*x.sampleUnitCostCents>r.maxProposalCents)fail('RECIPE_INVALID');
  seen.add(x.id);
 }
 return clone(r);
}
function definition(r,sku){const item=r.items.find(i=>i.id===sku);if(!item)fail('ITEM_UNKNOWN');return item;}
function openItem(raw,sku,createdOn){
 const recipe=validateRecipe(raw);
 if(day(createdOn)===null)fail('CLOCK_INVALID');
 definition(recipe,sku);
 return {version:1,recipeId:recipe.id,sku,createdOn,onHand:0,reserved:0,onOrder:0,
   revision:1,proposals:[],audit:[]};
}
const stateKeys=['version','recipeId','sku','createdOn','onHand','reserved','onOrder','revision','proposals','audit'];
function validateItem(recipe,s){
 if(!exact(s,stateKeys)||s.version!==1||s.recipeId!==recipe.id||
    !recipe.items.some(r=>r.id===s.sku)||day(s.createdOn)===null||
    !int(s.onHand,0,1000000)||!int(s.reserved,0,s.onHand)||
    !int(s.onOrder,0,1000000)||!int(s.revision,1,1000000)||
    !Array.isArray(s.proposals)||s.proposals.length>100||!Array.isArray(s.audit)||s.audit.length>500)fail('ITEM_INVALID');
 const statuses=['pending_review','approved_internal','received_internal','rejected'];
 const expected=['id','quantity','costCents','createdOn','approvedOn','closedOn','status','orderPlaced','spendCommitted'];
 let ordering=0;
 for(const [i,p] of s.proposals.entries()){
  if(!exact(p,expected)||p.id!=='p'+(i+1)||!int(p.quantity,1,1000000)||
      !int(p.costCents,1,recipe.maxProposalCents)||day(p.createdOn)===null||
      !statuses.includes(p.status)||p.orderPlaced!==false||p.spendCommitted!==false||
      !(p.approvedOn===null||day(p.approvedOn)!==null)||
      !(p.closedOn===null||day(p.closedOn)!==null))fail('ITEM_INVALID');
  if(p.status==='approved_internal')ordering+=p.quantity;
 }
 if(ordering!==s.onOrder)fail('ITEM_INVALID');
 for(const e of s.audit){if(!exact(e,['kind','day','role'])||typeof e.kind!=='string'||
  day(e.day)===null||!['operator','reviewer'].includes(e.role))fail('ITEM_INVALID');}
}
function recommendation(recipe,s){
 const spec=definition(recipe,s.sku),available=s.onHand-s.reserved,stockPosition=available+s.onOrder,
  quantity=stockPosition<=spec.reorderPoint?Math.max(0,spec.targetLevel-stockPosition):0,
  costCents=quantity*spec.sampleUnitCostCents;
 if(!Number.isSafeInteger(costCents)||costCents>recipe.maxProposalCents)fail('BUDGET_CAP');
 return {quantity,costCents,currency:'USD',estimatedOnly:true,orderPlaced:false,
   sampleUnitCostCents:spec.sampleUnitCostCents,supplierVerified:false};
}
function projectItem(raw,s,asOf){
 const recipe=validateRecipe(raw);validateItem(recipe,s);
 if(day(asOf)===null||asOf<s.createdOn)fail('CLOCK_INVALID');
 const d=definition(recipe,s.sku),available=s.onHand-s.reserved;
 return {...clone(s),label:d.label,unit:d.unit,reorderPoint:d.reorderPoint,targetLevel:d.targetLevel,
  available,recommendation:recommendation(recipe,s),reviewRequired:s.proposals.some(p=>p.status==='pending_review'),
  supplierPurchaseEnabled:false,paymentEnabled:false,marketValidated:false,realCustomers:null,
  collectedRevenue:null,releaseApproved:false};
}
function applyCommand(raw,state,command,role,today){
 const recipe=validateRecipe(raw);validateItem(recipe,state);const s=clone(state);
 if(day(today)===null||today<s.createdOn)fail('CLOCK_INVALID');
 if(!['operator','reviewer'].includes(role)||!obj(command)||typeof command.type!=='string')fail('COMMAND_INVALID');
 const requireRole=x=>{if(role!==x)fail('FORBIDDEN');};
 const last=()=>s.proposals.at(-1);
 const recent=()=>{const p=last();if(!p||!['pending_review','approved_internal'].includes(p.status))fail('ORDER_STATE');return p;};
 const commandOnly=(fields)=>{if(!exact(command,fields))fail('COMMAND_INVALID');};
 let action;
 switch(command.type){
  case 'receive':case 'reserve':case 'consume':case 'release':{
   requireRole('operator');commandOnly(['type','quantity']);
   if(!int(command.quantity,1,100000))fail('QUANTITY_INVALID');
   const quantity=command.quantity;
   if(command.type==='receive'){if(s.onHand+quantity>1000000)fail('STOCK_LIMIT');s.onHand+=quantity;}
   if(command.type==='reserve'){if(quantity>s.onHand-s.reserved)fail('STOCK_SHORT');s.reserved+=quantity;}
   if(command.type==='release'){if(quantity>s.reserved)fail('STOCK_SHORT');s.reserved-=quantity;}
   if(command.type==='consume'){if(quantity>s.reserved)fail('STOCK_SHORT');s.onHand-=quantity;s.reserved-=quantity;}
   action=command.type;break;
  }
  case 'request_reorder':{
   requireRole('operator');commandOnly(['type']);
   if(last()&&['pending_review','approved_internal'].includes(last().status))fail('ORDER_STATE');
   const r=recommendation(recipe,s);
   if(!r.quantity)fail('REORDER_UNNEEDED');
   if(s.proposals.length>=100)fail('ORDER_LIMIT');
   s.proposals.push({id:'p'+(s.proposals.length+1),quantity:r.quantity,costCents:r.costCents,
    createdOn:today,approvedOn:null,closedOn:null,status:'pending_review',
    orderPlaced:false,spendCommitted:false});
   action='reorder_requested';break;
  }
  case 'approve':case 'reject':{
   requireRole('reviewer');commandOnly(['type']);const p=recent();
   if(p.status!=='pending_review')fail('ORDER_STATE');
   if((day(today)-day(p.createdOn))/86400000>recipe.reviewWindowDays)fail('ORDER_EXPIRED');
   if(command.type==='approve'){p.status='approved_internal';p.approvedOn=today;
    if(s.onOrder+p.quantity>1000000)fail('STOCK_LIMIT');s.onOrder+=p.quantity;}
   else{p.status='rejected';p.closedOn=today;}
   action=command.type;break;
  }
  case 'fulfill':{
   requireRole('operator');commandOnly(['type']);const p=recent();
   if(p.status!=='approved_internal')fail('ORDER_STATE');
   if(s.onHand+p.quantity>1000000)fail('STOCK_LIMIT');
   s.onOrder-=p.quantity;s.onHand+=p.quantity;
   p.status='received_internal';p.closedOn=today;action='internal_receipt_recorded';break;
  }
  default:fail('COMMAND_INVALID');
 }
 if(s.audit.length>=500)fail('HISTORY_LIMIT');
 s.audit.push({kind:action,day:today,role});s.revision++;
 validateItem(recipe,s);return s;
}
module.exports={validateRecipe,openItem,projectItem,applyCommand,day};
