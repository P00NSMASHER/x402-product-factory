(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let active=false,viewEpoch=0,selected='',workspace=null,recordId=null,detailKey='',busy=false,refreshing=false;
  const connection=FactoryConnection.createConnection({onUnauthorized:()=>{clearPrivate();message('Session ended. Sign in again to view saved work.');}});
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const label=value=>String(value).replaceAll('_',' ');
  function message(text='',error=false){$(error?'error':'notice').textContent=text;if(error)$('error').hidden=!text;}
  function clearPrivate(){
    active=false;viewEpoch++;selected='';workspace=null;recordId=null;detailKey='';busy=false;refreshing=false;
    $('workspace-panel').hidden=true;$('login-panel').hidden=false;$('credential').value='';
    for(const id of ['records','messages','events','documents','workspace-select'])$(id).replaceChildren();
    for(const id of ['workspace-title','outcome','detail-title','saved-status','last-run','automation-status'])$(id).textContent='';
    for(const id of ['record-count','complete-count','notice-count'])$(id).textContent='0';
    $('record-name').value='';$('due-on').value='';$('search').value='';$('export').href='#';
    for(const id of ['new-dialog','detail-dialog'])if($(id).open)$(id).close();
    $('retry-command').hidden=true;
  }
  function writeControls(){
    const disabled=busy||connection.hasPending()||!active||!workspace;
    document.querySelectorAll('[data-write]').forEach(el=>{el.disabled=disabled;});
    $('workspace-select').disabled=busy||connection.hasPending();
    $('retry-command').hidden=!connection.hasPending();$('retry-command').disabled=busy;
  }
  function problem(error){
    if(error.message==='STALE_RESPONSE'||error.message==='UNAUTHORIZED')return;
    const text=error.message==='NETWORK_UNCERTAIN'?(connection.hasPending()?'Action outcome is unknown. Retry pending action to reconcile it without creating a duplicate.':'Connection interrupted. Showing last confirmed state; no changes have been saved locally.'):
      error.message==='VERSION_CONFLICT'?'The workspace changed. Refreshing its saved state; review and try your action again.':
      error.message==='RATE_LIMIT'?'Too many access attempts. Wait one minute and try again.':
      error.message==='WRITE_PENDING'?'Resolve the pending action before starting another.':
      'The action could not be completed. Check the input and connection, then try again.';
    message(text,true);if(active)$('connection-status').textContent=error.message==='NETWORK_UNCERTAIN'?'Connection interrupted':'Action needs attention';
  }
  function showRecords(){
    if(!workspace)return;const query=$('search').value.toLowerCase(),filter=$('record-filter').value;
    const rows=workspace.records.filter(r=>(filter==='all'||(filter==='archived'?r.archived:!r.archived))&&r.name.toLowerCase().includes(query));
    const fragment=document.createDocumentFragment();
    for(const row of rows){
      const tr=node('tr'),name=node('td'),button=node('button',row.name,'record-link');button.type='button';button.setAttribute('aria-label','Open '+row.name);
      button.addEventListener('click',()=>{recordId=row.id;detailKey='';showDetail();$('detail-dialog').showModal();});name.append(button);
      const status=node('td');status.append(node('span',label(row.status),'badge '+row.status));
      tr.append(name,status,node('td',row.received+'/'+row.total),node('td',row.dueOn));fragment.append(tr);
    }
    $('records').replaceChildren(fragment);$('empty-queue').hidden=rows.length>0;
  }
  function showDetail(){
    if(!workspace||!recordId)return;const row=workspace.records.find(r=>r.id===recordId);if(!row)return;
    const key=[row.id,row.revision,row.status].join(':');if(key===detailKey)return;detailKey=key;
    $('detail-title').textContent=row.name;const fragment=document.createDocumentFragment();
    for(const requirement of workspace.recipe.requirements){
      const doc=row.documents[requirement.id],form=node('form');form.append(node('h3',requirement.label));
      form.append(node('p',doc.receivedOn?'Received '+doc.receivedOn+(doc.expiresOn?' · expires '+doc.expiresOn:''):'Not received','muted'));
      let expiry;
      if(requirement.renewable){
        const id='expiry-'+requirement.id,l=node('label','Expiration date');l.htmlFor=id;expiry=node('input');expiry.type='date';expiry.id=id;expiry.required=true;expiry.max='2100-12-31';expiry.min=workspace.snapshot.today;
        if(doc.expiresOn)expiry.value=doc.expiresOn;form.append(l,expiry);
      }
      const button=node('button',doc.receivedOn?'Update receipt':'Mark received');button.type='submit';button.dataset.write='';button.disabled=row.archived;
      if(!row.archived)form.append(button);
      form.addEventListener('submit',async event=>{event.preventDefault();if(busy||connection.hasPending())return;
        await mutate({type:'receive',recordId:row.id,requirementId:requirement.id,...(requirement.renewable?{expiresOn:expiry.value}:{})});
      });fragment.append(form);
    }
    $('documents').replaceChildren(fragment);$('archive-record').hidden=row.archived;writeControls();
  }
  function showState(inbox){
    $('workspace-title').textContent=workspace.recipe.title;const option=[...$('workspace-select').options].find(o=>o.value===selected);if(option)option.textContent=workspace.recipe.title;$('edition').textContent='DOCUMENT WORKFLOWS / '+workspace.recipe.recordLabel.toUpperCase();
    $('outcome').textContent=workspace.recipe.outcome;$('record-count').textContent=workspace.records.filter(r=>!r.archived).length;
    $('complete-count').textContent=workspace.records.filter(r=>r.status==='complete').length;$('notice-count').textContent=inbox.filter(r=>r.status==='open').length;
    $('automation-status').textContent=workspace.quarantined?'Attention required: automation quarantined after repeated failures.':workspace.enabled?'Enabled · browser-independent worker':'Paused for this workspace';
    $('last-run').textContent=workspace.lastSuccessAt?'Last successful check: '+new Date(workspace.lastSuccessAt).toLocaleString():'Waiting for the first successful server check.';
    $('toggle-automation').textContent=workspace.enabled&&!workspace.quarantined?'Pause automation':'Resume automation';
    $('connection-status').textContent='Connected · server-backed';$('saved-status').textContent='Saved on local server · workflow date '+workspace.snapshot.today;
    $('export').href='/app/api/workspaces/'+selected+'/export';
    const messages=document.createDocumentFragment();
    for(const item of [...inbox].reverse().slice(0,50)){
      const el=node('div',undefined,'event '+item.status);el.append(node('span',item.recordName+' · '+label(item.kind)),node('small',item.day+' · '+item.status));messages.append(el);
    }
    if(!inbox.length)messages.append(node('p','No internal notifications yet. The server checks due work automatically.','empty'));
    $('messages').replaceChildren(messages);const events=document.createDocumentFragment();
    for(const item of [...workspace.snapshot.audit].reverse().slice(0,20)){const el=node('div',undefined,'event');el.append(node('span',label(item.action)),node('small',item.day));events.append(el);}
    if(!workspace.snapshot.audit.length)events.append(node('p','No activity yet.','empty'));$('events').replaceChildren(events);
    showRecords();showDetail();writeControls();
  }
  async function refresh(){
    if(!active||refreshing)return;refreshing=true;const generation=viewEpoch;
    try{
      const list=await connection.read('/app/api/workspaces');if(generation!==viewEpoch||!active)return;
      if(!list.some(w=>w.id===selected)){selected=list[0]?.id||'';recordId=null;detailKey='';}
      if(!list.length){workspace=null;$('workspace-title').textContent='No provisioned workspaces';$('outcome').textContent='Ask the local operator to provision an existing recipe edition.';writeControls();return;}
      if([...$('workspace-select').options].map(o=>o.value).join(',')!==list.map(w=>w.id).join(',')){
        $('workspace-select').replaceChildren(...list.map(w=>{const o=node('option',w.id.replaceAll('-',' '));o.value=w.id;return o;}));
      }
      $('workspace-select').value=selected;const id=selected;
      const [data,inbox]=await Promise.all([connection.read('/app/api/workspaces/'+id),connection.read('/app/api/workspaces/'+id+'/inbox')]);
      if(generation!==viewEpoch||!active||selected!==id)return;workspace=data;showState(inbox);
    }catch(error){problem(error);}finally{if(generation===viewEpoch)refreshing=false;}
  }
  async function activate(){active=true;viewEpoch++;$('login-panel').hidden=true;$('workspace-panel').hidden=false;message('');message('',true);await refresh();}
  async function mutate(command){
    if(busy||!workspace||connection.hasPending())return false;busy=true;const generation=viewEpoch;writeControls();
    try{
      const id=selected,prior=workspace,latest=await connection.read('/app/api/workspaces/'+id);
      if(generation!==viewEpoch||!active)return false;
      if(command.recordId&&latest.records.find(r=>r.id===command.recordId)?.revision!==prior.records.find(r=>r.id===command.recordId)?.revision)throw new Error('VERSION_CONFLICT');
      if(command.type==='automation'&&latest.enabled!==prior.enabled)throw new Error('VERSION_CONFLICT');
      await connection.command(id,command,latest.version);if(generation!==viewEpoch)return false;message('Saved to the server.');message('',true);return true;}
    catch(error){problem(error);return false;}
    finally{if(generation===viewEpoch){busy=false;writeControls();await refresh();}}
  }
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('sign-in').disabled=true;message('',true);
    try{await connection.login($('credential').value.trim());$('credential').value='';await activate();}catch(error){problem(error);}finally{$('sign-in').disabled=false;}
  });
  $('sign-out').addEventListener('click',async()=>{
    const logout=connection.logout();clearPrivate();$('sign-in').disabled=true;message('Signing out…');
    try{await logout;message('Signed out. Background processing continues while the local service runs.');}
    catch(error){message('Screen cleared. The server could not confirm logout; close this browser session until access expires.',true);}finally{$('sign-in').disabled=false;}
  });
  $('workspace-select').addEventListener('change',async()=>{viewEpoch++;refreshing=false;selected=$('workspace-select').value;workspace=null;recordId=null;detailKey='';$('records').replaceChildren();$('messages').replaceChildren();$('events').replaceChildren();await refresh();});
  $('search').addEventListener('input',showRecords);$('record-filter').addEventListener('change',showRecords);
  $('new-record').addEventListener('click',()=>{
    if(!workspace)return;$('record-name').value='';const time=Date.parse(workspace.snapshot.today+'T00:00:00Z');
    $('due-on').value=new Date(time+workspace.recipe.defaultDueDays*86400000).toISOString().slice(0,10);$('new-dialog').showModal();$('record-name').focus();
  });
  $('new-form').addEventListener('submit',async event=>{event.preventDefault();const ok=await mutate({type:'add',name:$('record-name').value.trim(),dueOn:$('due-on').value});if(ok&&$('new-dialog').open){$('new-dialog').close();$('record-name').value='';}});
  $('close-new').addEventListener('click',()=>$('new-dialog').close());$('close-detail').addEventListener('click',()=>$('detail-dialog').close());
  $('archive-record').addEventListener('click',async()=>{if(recordId&&window.confirm('Archive this record and cancel its obsolete internal notices?')){const ok=await mutate({type:'archive',recordId});if(ok)$('detail-dialog').close();}});
  $('toggle-automation').addEventListener('click',()=>{if(workspace)mutate({type:'automation',enabled:!workspace.enabled||workspace.quarantined});});
  $('retry-command').addEventListener('click',async()=>{if(busy)return;busy=true;const generation=viewEpoch;writeControls();try{await connection.retry();if(generation===viewEpoch){message('Pending action reconciled with the server.');message('',true);if($('new-dialog').open)$('new-dialog').close();}}catch(error){problem(error);}finally{if(generation===viewEpoch){busy=false;writeControls();await refresh();}}});
  window.addEventListener('online',()=>{if(active)refresh();});
  async function poll(){if(active&&!busy)await refresh();setTimeout(poll,4000);}setTimeout(poll,4000);
  connection.restore().then(activate).catch(error=>{if(error.message!=='UNAUTHORIZED')problem(error);});
})();
