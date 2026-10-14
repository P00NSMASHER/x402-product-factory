(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,text,className)=>{const node=document.createElement(tag);
  if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node;};
 let token=null,context=null,selected='',busy=false,pending=null;
 const money=cents=>(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
 const error=msg=>{$('error').textContent=msg;$('error').hidden=false;};
 const notice=msg=>{$('notice').textContent=msg;$('error').hidden=true;};
 const hideError=()=>{$('error').hidden=true;$('error').textContent='';};
 function logout(){
  token=null;context=null;selected='';busy=false;pending=null;
  $('access-key').value='';$('item-rows').replaceChildren();$('activity').replaceChildren();
  $('app-shell').hidden=true;$('login-panel').hidden=false;$('item-panel').hidden=true;
  $('notice').textContent='';hideError();
 }
 async function request(url,{method='GET',body,headers={}}={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);
  try{
   const res=await fetch(url,{method,cache:'no-store',credentials:'omit',redirect:'error',signal:ctrl.signal,
    headers:{...(token?{'Authorization':'Bearer '+token}:{}),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   const data=await res.json();
   if(res.status===401){logout();throw Error('SESSION_EXPIRED');}
   if(!res.ok)throw Error(typeof data.error==='string'?data.error:'REQUEST_FAILED');
   return data;
  }catch(e){if(e.name==='AbortError'||e.name==='TypeError')throw Error('NETWORK_UNCERTAIN');throw e;}
  finally{clearTimeout(timer);}
 }
 const latest=()=>context?.items.find(x=>x.sku===selected);
 function draw(){
  if(!context)return;
  $('title').textContent=context.recipe.title;$('outcome').textContent=context.recipe.outcome;
  $('tenant-label').textContent=context.tenantId;$('role').textContent=context.role.toUpperCase();
  const items=context.items;
  $('metric-items').textContent=items.length;
  $('metric-low').textContent=items.filter(x=>x.recommendation.quantity>0).length;
  $('metric-review').textContent=items.filter(x=>x.proposals.some(p=>p.status==='pending_review')).length;
  $('metric-approved').textContent=items.filter(x=>x.proposals.some(p=>p.status==='approved_internal')).length;
  const rows=document.createDocumentFragment();
  for(const item of items){
   const tr=el('tr'),label=el('td'),bold=el('div',item.label,'item-label');
   label.append(bold,el('div',item.sku,'item-sub'));
   const status=item.proposals.some(p=>p.status==='pending_review')?'REVIEW REQUIRED':
    item.recommendation.quantity>0?'LOW STOCK':'READY';
   const badge=el('span',status,'badge '+(status==='LOW STOCK'?'low':status==='REVIEW REQUIRED'?'pending':''));
   const action=el('button','Review');action.type='button';action.className='secondary';
   action.addEventListener('click',()=>{selected=item.sku;drawDetail();});
   const statusCell=el('td');statusCell.append(badge);
   const cell=el('td');cell.append(action);
   tr.append(label,el('td',item.onHand),el('td',item.reserved),el('td',item.available),statusCell,cell);
   rows.append(tr);
  }
  $('item-rows').replaceChildren(rows);
  if(!selected&&items.length)selected=items[0].sku;
  drawDetail();
  $('saved-at').textContent='As of '+context.date;
 }
 function drawDetail(){
  const item=latest();if(!item){$('item-panel').hidden=true;return;}
  $('item-panel').hidden=false;$('selected-title').textContent=item.label;
  $('selected-subtitle').textContent=item.sku+' · '+item.unit+' · Stock counts are operator-entered.';
  $('detail-onhand').textContent=item.onHand;$('detail-reserved').textContent=item.reserved;
  $('detail-onorder').textContent=item.onOrder;$('detail-available').textContent=item.available;
  $('recommended-quantity').textContent=item.recommendation.quantity+' '+item.unit+(item.recommendation.quantity===1?'':'s');
  $('recommended-cost').textContent='Sample estimated cost: '+money(item.recommendation.costCents);
  const proposal=item.proposals.at(-1);
  $('proposal-note').textContent=proposal?'Most recent plan: '+proposal.status.replaceAll('_',' ')+' · '+proposal.quantity+' units · '+money(proposal.costCents):
   'No internal replenishment proposal yet.';
  $('selected-status').textContent=item.proposals.some(p=>p.status==='pending_review')?'REVIEW REQUIRED':
   item.recommendation.quantity>0?'LOW STOCK':'READY';
  $('operator-actions').hidden=context.role!=='operator';$('reviewer-actions').hidden=context.role!=='reviewer';
  const active=['pending_review','approved_internal'].includes(proposal?.status);
  $('request-reorder').disabled=busy||Boolean(active)||item.recommendation.quantity===0;
  $('mark-arrival').disabled=busy||proposal?.status!=='approved_internal';
  $('approve-reorder').disabled=busy||proposal?.status!=='pending_review';
  $('reject-reorder').disabled=busy||proposal?.status!=='pending_review';
  for(const b of document.querySelectorAll('[data-action]'))if(!['request_reorder','fulfill','approve','reject'].includes(b.dataset.action))b.disabled=busy;
  const entries=document.createDocumentFragment();
  for(const event of [...item.audit].reverse().slice(0,15)){
   entries.append(el('p',event.day+' · '+event.kind.replaceAll('_',' ')+' ('+event.role+')'));
  }
  if(!item.audit.length)entries.append(el('p','No recorded stock activity yet.'));
  $('activity').replaceChildren(entries);
 }
 async function refresh(){
  if(!token)return;
  const data=await request('/v1/context');context=data;
  if(!data.items.some(x=>x.sku===selected))selected=data.items[0]?.sku||'';
  draw();
 }
 async function perform(command){
  if(!token||busy||!latest())return;
  if(pending&&pending.sku!==selected){error('Resolve the previous uncertain write before another action.');return;}
  busy=true;hideError();drawDetail();
  const item=latest(),job=pending||{sku:selected,command,expectedRevision:item.revision,key:crypto.randomUUID()};
  pending=job;
  try{
   await request('/v1/command',{method:'POST',
    body:{sku:job.sku,command:job.command,expectedRevision:job.expectedRevision},
    headers:{'Idempotency-Key':job.key}});
   pending=null;await refresh();notice('Saved internally. No supplier contact or payment was made.');
  }catch(e){
   if(e.message!=='NETWORK_UNCERTAIN')pending=null;
   error(e.message==='NETWORK_UNCERTAIN'?'Connection uncertain. Retry the same pending action using the Retry button.':
    e.message==='VERSION_CONFLICT'?'Stock changed; refresh before acting again.':
     e.message==='SESSION_EXPIRED'?'Session expired. Sign in again.':'Action not saved: '+e.message);
  }finally{busy=false;if(context)drawDetail();$('retry-action').hidden=!pending;}
 }
 $('login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;
  try{
   token=$('access-key').value.trim();await refresh();
   $('access-key').value='';$('login-panel').hidden=true;$('app-shell').hidden=false;hideError();
  }catch(e){token=null;error('Could not authenticate. Verify the private operator/reviewer key.');}
  finally{busy=false;if(context)drawDetail();}
 });
 $('sign-out').addEventListener('click',logout);
 $('refresh').addEventListener('click',()=>refresh().catch(e=>error('Refresh failed: '+e.message)));
 for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>{
  if(pending){error('Resolve uncertain saved action before another write.');return;}
  const type=button.dataset.action;
  let command={type};
  if(['receive','reserve','release','consume'].includes(type)){
   const quantity=Number($('quantity').value);
   if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000){error('Enter a whole positive quantity.');return;}
   command={type,quantity};
  }
  perform(command);
 });
 // Button exists to explicitly reconcile uncertain outcomes with the ORIGINAL command and key.
 $('retry-action').addEventListener('click',()=>{if(pending)perform(pending.command);});
 logout();
})();
