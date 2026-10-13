/* Browser-only private operational UI. Access keys are NEVER stored in browser storage or URLs. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),text=(tag,value,className)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;if(className)el.className=className;return el;};
 const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
 let auth='',role='',recipe=null,quotes=[],current='',rev=0,events=[],busy=false,pending=null,epoch=0;
 function notice(value='',problem=false){$(problem?'error':'notice').textContent=value;$(problem?'error':'notice').hidden=!value;}
 function disconnect(){epoch++;auth='';role='';recipe=null;quotes=[];current='';rev=0;pending=null;busy=false;
  $('workspace').hidden=true;$('login-panel').hidden=false;$('token').value='';$('quote-rows').replaceChildren();
  $('lines').replaceChildren();$('activity').replaceChildren();$('detail-content').hidden=true;$('detail-empty').hidden=false;
 }
 async function request(url,{method='GET',body,key}={}){
  if(!/^\/v1\/[a-z0-9/-]+$/.test(url))throw Error('INVALID_PATH');
  const generation=epoch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
   const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
    headers:{Authorization:'Bearer '+auth,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
   const data=await response.json();
   if(generation!==epoch)throw Error('STALE_RESPONSE');
   if(response.status===401){disconnect();throw Error('ACCESS_DENIED');}
   if(!response.ok)throw Error(data.error||'SERVER_REJECTED');
   return data;
  }catch(error){
   if(error.name==='AbortError'||error instanceof TypeError)throw Error('NETWORK_UNCERTAIN');throw error;
  }finally{clearTimeout(timer);}
 }
 const newKey=()=>crypto.randomUUID().replaceAll('-','')+'_'+crypto.randomUUID().replaceAll('-','');
 async function write(url,body){
  if(pending)throw Error('PENDING_WRITE');
  const job={url,body:JSON.stringify(body),key:newKey()};pending=job;
  try{const value=await request(url,{method:'POST',body,key:job.key});pending=null;return value;}
  catch(error){if(error.message!=='NETWORK_UNCERTAIN')pending=null;throw error;}
 }
 async function mutate(command){
  if(!current||busy)return;busy=true;
  try{await write('/v1/quotes/'+current+'/commands',{command,expectedRevision:rev});
   notice('Action saved to the local server.');await refresh();}
  catch(error){notice(error.message==='NETWORK_UNCERTAIN'?'Network interrupted. Retry the pending action before creating another.':
    'Action blocked: '+error.message,true);}finally{busy=false;controls();}
 }
 function controls(){const locked=busy||Boolean(pending);$('new-quote').disabled=locked;
  for(const id of ['submit-review','approve','reject','reopen','convert'])$(id).disabled=locked;
  $('line-form').querySelectorAll('button,input,select').forEach(el=>el.disabled=locked);
 }
 function quoteStatus(q){return q.status.replaceAll('_',' ');}
 function metrics(){const m={totalQuotes:quotes.length,pendingReview:quotes.filter(q=>q.status==='pending_review').length,
  approved:quotes.filter(q=>q.status==='approved').length,orders:quotes.filter(q=>q.status==='converted').length};
  for(const [key,id] of [['totalQuotes','metric-total'],['pendingReview','metric-review'],['approved','metric-approved'],['orders','metric-orders']])$(id).textContent=m[key];
 }
 function table(){const filter=$('filter').value,q=$('search').value.toLowerCase(),frag=document.createDocumentFragment();let visible=0;
  for(const row of quotes){if(filter!=='all'&&row.status!==filter)continue;
   if(!row.clientLabel.toLowerCase().includes(q)&&!row.id.includes(q))continue;
   const tr=text('tr'),first=text('td'),button=text('button',row.clientLabel);button.type='button';button.addEventListener('click',()=>{current=row.id;rev=row.revision;detail();});
   first.append(button);tr.append(first);
   const st=text('td');st.append(text('span',quoteStatus(row),'tag '+row.status));
   tr.append(st,text('td',money(row.totalCents)),text('td',row.validUntil));frag.append(tr);visible++;
  }
  $('quote-rows').replaceChildren(frag);$('empty').hidden=visible>0;
 }
 function detail(){const q=quotes.find(row=>row.id===current);
  if(!q){$('detail-empty').hidden=false;$('detail-content').hidden=true;$('current-status').textContent='Select a quote';return;}
  rev=q.revision;$('detail-empty').hidden=true;$('detail-content').hidden=false;
  $('current-status').textContent=quoteStatus(q);$('current-status').className='tag '+q.status;
  $('detail-name').textContent=q.clientLabel;$('detail-number').textContent=q.id;
  $('detail-description').textContent='Valid until '+q.validUntil+' · revision '+q.revision;
  $('detail-total').textContent=money(q.totalCents);
  const items=document.createDocumentFragment();for(const line of q.lines){const row=text('div',undefined,'line-item'),item=recipe.items.find(r=>r.id===line.itemId);
   const block=text('div',undefined,'line-text');block.append(text('strong',item?.label||line.itemId),
    text('small',line.quantity+' '+(item?.unit||'units')+' × '+money(line.unitPriceCents)));
   row.append(block,text('span',money(line.quantity*line.unitPriceCents),'line-price'));
   if(role==='operator'&&q.status==='draft'){
    const button=text('button','✕','line-remove');button.type='button';button.setAttribute('aria-label','Remove '+(item?.label||line.id));
    button.addEventListener('click',()=>mutate({type:'line_remove',lineId:line.id}));row.append(button);
   }items.append(row);
  }
  $('lines').replaceChildren(items);$('line-form').hidden=role!=='operator'||q.status!=='draft';
  const show={ 'submit-review':role==='operator'&&q.status==='draft'&&q.totalCents>0,
   approve:role==='reviewer'&&q.status==='pending_review',reject:role==='reviewer'&&q.status==='pending_review',
   reopen:role==='operator'&&q.status==='rejected',convert:role==='operator'&&q.status==='approved'};
  for(const id of ['submit-review','approve','reject','reopen','convert'])$(id).hidden=!show[id];
  $('order-info').hidden=q.status!=='converted';
  if(q.order)$('order-info').textContent='Order handoff '+q.order.orderId+' · '+money(q.order.totalCents)+' · NOT PAID / no billing configured';
  controls();
 }
 function activity(){const frag=document.createDocumentFragment();
  for(const entry of events.slice(0,18)){const row=text('div',undefined,'event');row.append(text('span',entry.quoteId+' · '+entry.kind.replaceAll('_',' ')),text('time',entry.day));frag.append(row);}
  if(!events.length)frag.append(text('p','No internal changes yet.','empty'));
  $('activity').replaceChildren(frag);
 }
 async function refresh(){if(!auth)return;const generation=epoch;
  const [rows,log]=await Promise.all([request('/v1/quotes'),request('/v1/events')]);
  if(generation!==epoch)return;quotes=rows;events=log;metrics();table();detail();activity();
 }
 $('login-form').addEventListener('submit',async e=>{e.preventDefault();const token=$('token').value;
  if(token.length!==43)return;auth=token;
  try{const data=await request('/v1/recipe');recipe=data.recipe;role=data.role;
   $('title').textContent=recipe.title;$('outcome').textContent=recipe.outcome;
   $('role').textContent=role==='reviewer'?'Independent reviewer':'Estimate operator';
   $('new-quote').hidden=role!=='operator';$('item-type').replaceChildren(...recipe.items.map(item=>{const el=text('option',item.label+' / '+item.unit);el.value=item.id;return el;}));
   $('login-panel').hidden=true;$('workspace').hidden=false;$('token').value='';
   await refresh();notice('Connected to private local workspace.');
  }catch(error){disconnect();notice('Access denied or service unavailable.',true);}
 });
 $('logout').addEventListener('click',()=>{disconnect();notice('Signed out. Access key cleared from memory.');});
 $('search').addEventListener('input',table);$('filter').addEventListener('change',table);
 $('new-quote').addEventListener('click',()=>{$('create-dialog').showModal();
  const today=new Date(),end=new Date(today.getTime()+Math.min(recipe.validDays,7)*86400000);
  $('valid-until').min=today.toISOString().slice(0,10);$('valid-until').max=new Date(today.getTime()+recipe.validDays*86400000).toISOString().slice(0,10);
  $('valid-until').value=end.toISOString().slice(0,10);
 });
 $('cancel-new').addEventListener('click',()=>$('create-dialog').close());
 $('create-form').addEventListener('submit',async e=>{e.preventDefault();if(busy||pending)return;busy=true;
  try{const result=await write('/v1/quotes',{clientLabel:$('client-name').value.trim(),validUntil:$('valid-until').value});
   current=result.id;$('create-dialog').close();$('client-name').value='';await refresh();notice('Draft estimate created.');
  }catch(error){notice('Unable to save draft: '+error.message,true);}finally{busy=false;controls();}
 });
 $('line-form').addEventListener('submit',async e=>{e.preventDefault();const p=Number($('price').value),qty=Number($('quantity').value);
  if(!Number.isFinite(p)||!Number.isSafeInteger(qty)||!Number.isSafeInteger(Math.round(p*100))||
      Math.abs(p*100-Math.round(p*100))>1e-6){notice('Enter an exact USD price and whole quantity.',true);return;}
  const row=quotes.find(q=>q.id===current),num=row?.lines.reduce((n,line)=>Math.max(n,Number(line.id.slice(1))),0)||0;
  await mutate({type:'line_upsert',line:{id:'l'+(num+1),itemId:$('item-type').value,quantity:qty,unitPriceCents:Math.round(p*100)}});
 });
 for(const [name,type] of [['submit-review','submit'],['approve','approve'],['reject','reject'],['reopen','reopen'],['convert','convert']])
  $(name).addEventListener('click',()=>mutate({type}));
 $('download').addEventListener('click',async()=>{try{const data=await request('/v1/export');const bytes=JSON.stringify(data,null,2),url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='quote-desk-synthetic.json';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 }catch(error){notice('Export unavailable: '+error.message,true);}});
 const timer=setInterval(()=>{if(auth&&!busy&&!pending)refresh().catch(()=>{});},25000);
 window.addEventListener('pagehide',()=>{clearInterval(timer);disconnect();});
})();
