'use strict';
// Pure quote-to-order domain core; user-entered amounts are synthetic estimates, NOT invoicing.
const fail=code=>{throw new Error(code);};
const clone=v=>JSON.parse(JSON.stringify(v));
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v)&&v.length<=60;
const safe=(v,max=120)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&
 !/[<>\x00-\x1f\x7f]/.test(v);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
function validDay(v){if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v))return null;
 const m=Date.parse(v+'T00:00:00Z');return Number.isFinite(m)&&new Date(m).toISOString().slice(0,10)===v?m:null;
}
function validateRecipe(input){
 if(!exact(input,['version','family','id','title','buyer','outcome','currency','validDays','items'])||
   input.version!==1||input.family!=='quote-to-order'||!id(input.id)||!safe(input.title,100)||
   !safe(input.buyer,160)||!safe(input.outcome,250)||input.currency!=='USD'||
   !integer(input.validDays,1,90)||!Array.isArray(input.items)||input.items.length<3||input.items.length>12)
   fail('RECIPE_INVALID');
 const seen=new Set();for(const item of input.items){
   if(!exact(item,['id','label','unit'])||!id(item.id)||seen.has(item.id)||!safe(item.label,100)||
     !['page','day','hour','item','trip','visit','job','unit','meter','kg'].includes(item.unit))fail('RECIPE_INVALID');
   seen.add(item.id);
 }
 return clone(input);
}
function quoteTotals(quote){
 if(!plain(quote)||!Array.isArray(quote.lines))fail('QUOTE_INVALID');
 let subtotal=0;for(const row of quote.lines){
   if(!integer(row.quantity,1,100000)||!integer(row.unitPriceCents,0,10000000))fail('LINE_INVALID');
   const amount=row.quantity*row.unitPriceCents;
   if(!Number.isSafeInteger(amount)||amount>100000000)fail('TOTAL_LIMIT');
   subtotal+=amount;if(!Number.isSafeInteger(subtotal)||subtotal>100000000)fail('TOTAL_LIMIT');
 }
 return {subtotalCents:subtotal,currency:'USD'};
}
function createQuote(input,values,today){
 const recipe=validateRecipe(input),now=validDay(today);
 if(now===null||!exact(values,['id','clientLabel','validUntil'])||!/^q[1-9][0-9]{0,8}$/.test(values.id)||
   !safe(values.clientLabel,100)||validDay(values.validUntil)===null||
   validDay(values.validUntil)<now||validDay(values.validUntil)>now+recipe.validDays*86400000)fail('QUOTE_INVALID');
 return {version:1,id:values.id,recipeId:recipe.id,clientLabel:values.clientLabel,
   createdOn:today,validUntil:values.validUntil,status:'draft',revision:1,lines:[],
   order:null,history:[{kind:'draft_created',day:today,role:'operator'}],
   realCustomerVerified:false,releaseApproved:false,collectedRevenue:null};
}
function actualStatus(q,asOf){
 const day=validDay(asOf);if(day===null||day<validDay(q.createdOn))fail('CLOCK_INVALID');
 return day>validDay(q.validUntil)&&['draft','pending_review','approved'].includes(q.status)?'expired':q.status;
}
function projectQuote(rawRecipe,rawQuote,asOf){
 const recipe=validateRecipe(rawRecipe),q=clone(rawQuote);
 if(q.recipeId!==recipe.id)fail('QUOTE_INVALID');
 return {...q,status:actualStatus(q,asOf),...quoteTotals(q),totalCents:quoteTotals(q).subtotalCents,
   reviewRequired:q.status==='pending_review',realCustomerVerified:false,releaseApproved:false,
   collectedRevenue:null,paymentEnabled:false};
}
function changeQuote(rawRecipe,rawQuote,command,role,today){
 const recipe=validateRecipe(rawRecipe),q=clone(rawQuote),now=validDay(today);
 if(q.recipeId!==recipe.id||!integer(q.revision,1,1000000)||now===null||
   !['operator','reviewer'].includes(role)||!plain(command)||typeof command.type!=='string')fail('COMMAND_INVALID');
 if(actualStatus(q,today)==='expired')fail('QUOTE_EXPIRED');
 const requireRole=r=>{if(role!==r)fail('FORBIDDEN');};
 const requireStatus=s=>{if(q.status!==s)fail('QUOTE_STATE');};
 let event;
 switch(command.type){
  case 'line_upsert':{
   requireRole('operator');requireStatus('draft');
   if(!exact(command,['type','line']))fail('COMMAND_INVALID');
   const row=command.line;
   if(!exact(row,['id','itemId','quantity','unitPriceCents'])||!/^l[1-9]\d{0,7}$/.test(row.id)||
      !recipe.items.some(item=>item.id===row.itemId)||!integer(row.quantity,1,100000)||
      !integer(row.unitPriceCents,0,10000000))fail('LINE_INVALID');
   const i=q.lines.findIndex(x=>x.id===row.id);
   if(i<0){if(q.lines.length>=50)fail('LINE_LIMIT');q.lines.push(clone(row));}
   else q.lines[i]=clone(row);
   quoteTotals(q);event='line_updated';break;
  }
  case 'line_remove':{
   requireRole('operator');requireStatus('draft');
   if(!exact(command,['type','lineId'])||!q.lines.some(x=>x.id===command.lineId))fail('LINE_INVALID');
   q.lines=q.lines.filter(x=>x.id!==command.lineId);event='line_removed';break;
  }
  case 'submit':{
   requireRole('operator');requireStatus('draft');
   if(!exact(command,['type'])||q.lines.length===0||quoteTotals(q).subtotalCents===0)fail('QUOTE_EMPTY');
   q.status='pending_review';event='review_requested';break;
  }
  case 'approve':case 'reject':{
   requireRole('reviewer');requireStatus('pending_review');if(!exact(command,['type']))fail('COMMAND_INVALID');
   q.status=command.type==='approve'?'approved':'rejected';event=command.type==='approve'?'quote_approved':'quote_rejected';break;
  }
  case 'reopen':{
   requireRole('operator');requireStatus('rejected');if(!exact(command,['type']))fail('COMMAND_INVALID');
   q.status='draft';event='quote_reopened';break;
  }
  case 'convert':{
   requireRole('operator');requireStatus('approved');if(!exact(command,['type']))fail('COMMAND_INVALID');
   q.order={quoteId:q.id,orderId:'o-'+q.id,totalCents:quoteTotals(q).subtotalCents,
      currency:'USD',lines:clone(q.lines),createdOn:today,fulfillmentStatus:'not_started',paymentStatus:'not_configured'};
   q.status='converted';event='order_created';break;
  }
  default:fail('COMMAND_INVALID');
 }
 if(q.history.length>=100)fail('HISTORY_LIMIT');
 q.history.push({kind:event,day:today,role});q.revision++;
 return q;
}
module.exports={validateRecipe,createQuote,changeQuote,projectQuote,quoteTotals,validDay};
