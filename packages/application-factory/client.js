(function(){
  "use strict";
  const {recipe,digest}=JSON.parse(document.getElementById("factory-config").textContent);
  const K=globalThis.FactoryKernel;
  const storageKey="application-family-v1:"+recipe.id+":"+digest;
  const initialDay="2026-10-13";
  const escape=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let engine,view="overview",query="",filter="active",selected=null,storageOK=true,restoreError=false;
  let stored=null;
  try{stored=localStorage.getItem(storageKey);}catch(_){storageOK=false;}
  if(stored){
    try{
      if(stored.length>3000000)throw new Error("SNAPSHOT_TOO_LARGE");
      engine=K.createWorkspace(recipe,{workspaceId:"demo-space",today:initialDay,snapshot:JSON.parse(stored)});
    }catch(_){restoreError=true;storageOK=false;}
  }
  if(!engine){
    engine=K.createWorkspace(recipe,{workspaceId:"demo-space",today:initialDay});
    seed();
  }
  function seed(){
    const names=recipe.id==="agency-intake"?["Sample · Arc Studio","Sample · Fern Creative","Sample · Northline","Sample · Oak & Form"]:
      recipe.id==="contractor-renewals"?["Sample · Alder Electric","Sample · Cedar Works","Sample · Northline Services","Sample · Oak Mechanical"]:
      ["Sample · Alder Components","Sample · Cedar Supply","Sample · Northline Parts","Sample · Oak Packaging"];
    names.forEach((name,i)=>{
      const row=engine.addRecord({name,dueOn:K.addDays(initialDay,i===3?6:-2)});
      for(const req of recipe.requirements){
        if(i===0||i===2||(i===1&&req===recipe.requirements[0])){
          engine.receive(row.id,req.id,{expiresOn:req.renewable?K.addDays(initialDay,i===2?12:180):null});
        }
      }
    });
    engine.runAutomation();save();
  }
  function save(){if(storageOK)try{localStorage.setItem(storageKey,JSON.stringify(engine.snapshot()));}catch(_){storageOK=false;}}
  function toast(message){
    let el=document.getElementById("toast");if(el)el.remove();
    el=document.createElement("div");el.id="toast";el.className="toast";el.setAttribute("role","status");el.textContent=message;document.body.appendChild(el);
    setTimeout(()=>el.remove(),4200);
  }
  const statuses={collecting:"Collecting",complete:"Checklist complete",renewal_due:"Renewal due",expired:"Expired",archived:"Archived"};
  const statusBadge=status=>'<span class="badge '+status+'">'+statuses[status]+'</span>';
  function rows(){return engine.list().filter(row=>(filter==="all"||filter==="active"&&!row.archived||row.status===filter)&&row.name.toLowerCase().includes(query.toLowerCase()));}
  function queue(){
    const data=rows();
    return '<section class="panel"><div class="panel-head"><div><h2>'+escape(recipe.recordLabel)+' work queue</h2><p class="panel-sub">Synthetic records · receipts are not verification</p></div><span class="pill">'+data.length+' records</span></div><div class="tools"><input class="search" id="search" type="search" placeholder="Search records…" aria-label="Search records" value="'+escape(query)+'"><select id="filter" class="filter" aria-label="Filter records">'+[["active","Active"],["all","All records"],["collecting","Collecting"],["renewal_due","Renewal due"],["complete","Complete"],["archived","Archived"]].map(([value,label])=>'<option value="'+value+'"'+(value===filter?' selected':'')+'>'+label+'</option>').join("")+'</select></div>'+table(data)+'</section>';
  }
  function table(data){
    if(!data.length)return '<div class="empty"><strong>No matching records</strong>Change your filter or add a synthetic intake record.</div>';
    return '<div class="table-scroll"><table class="work-table"><thead><tr><th>'+escape(recipe.recordLabel)+'</th><th>Status</th><th>Received</th><th>Due</th></tr></thead><tbody>'+data.map(row=>'<tr><td><button class="row-name" data-action="open" data-id="'+row.id+'">'+escape(row.name)+'</button><span class="row-meta">'+escape(recipe.recordLabel)+' record · '+row.id.toUpperCase()+'</span></td><td>'+statusBadge(row.status)+'</td><td><span class="tiny-progress"><progress value="'+row.received+'" max="'+row.total+'"></progress>'+row.received+'/'+row.total+'</span></td><td>'+escape(row.dueOn.slice(5))+'</td></tr>').join("")+'</tbody></table></div>';
  }
  function aside(){
    return '<aside class="aside"><section class="automations"><div class="eyebrow">LOCAL AUTOMATION</div><h2>Less chasing.<br>Clearer next steps.</h2><p>The engine prepares collection and renewal reminders from your workflow rules.</p><div class="automation-steps"><div class="step"><span class="step-num">1</span><span>Find missing or expiring records</span></div><div class="step"><span class="step-num">2</span><span>Apply '+recipe.reminderEveryDays+'-day reminder intervals</span></div><div class="step"><span class="step-num">3</span><span>Queue a deduplicated simulation</span></div></div><button class="primary" data-action="run">Run reminder cycle</button><div class="cycle"><button class="quiet" data-action="advance">Advance scenario 7 days →</button></div><small>Simulation only. No messages are sent.</small></section><section class="panel aside-note"><h3>One reusable family</h3><p>This workspace is generated from a recipe, not a separate application codebase. Its checklist and renewal rules are specific to this edition.</p><div class="tag-list"><span class="pill">'+recipe.requirements.length+' requirements</span><span class="pill">'+recipe.defaultDueDays+'-day intake</span></div></section></aside>';
  }
  function reminders(){
    const outbox=engine.snapshot().outbox.slice().reverse();
    return '<section class="panel full-panel"><div class="panel-head"><div><h2>Reminder simulation</h2><p class="panel-sub">Prepared locally. Completed or changed records cancel stale reminders.</p></div><button class="secondary" data-action="run">Run cycle</button></div>'+(outbox.length?'<div class="table-scroll"><table><thead><tr><th>Record</th><th>Rule</th><th>Scenario date</th><th>State</th></tr></thead><tbody>'+outbox.map(item=>'<tr><td>'+escape(item.recordName)+'</td><td>'+item.kind+'</td><td>'+item.day+'</td><td><span class="badge">'+(item.status==="simulated"?'Simulated · not sent':'Cancelled')+'</span></td></tr>').join("")+'</tbody></table></div>':'<div class="empty"><strong>No reminders due</strong>The next cycle will check your deadlines and renewal rules.</div>')+'</section>';
  }
  function activity(){
    const log=engine.snapshot().audit.slice().reverse();const names=Object.fromEntries(engine.list().map(row=>[row.id,row.name]));
    const labels={record_added:"Intake record created",document_received:"Document receipt recorded",record_archived:"Record archived",reminder_simulated:"Reminder simulated",day_advanced:"Scenario clock advanced"};
    return '<section class="panel full-panel"><div class="panel-head"><div><h2>Activity history</h2><p class="panel-sub">Local workflow history, not a tamper-proof audit service</p></div></div><div class="activity">'+log.slice(0,100).map(event=>'<div class="activity-item">'+labels[event.action]+'<small>'+escape(event.recordId?names[event.recordId]:"Workspace")+' · '+event.day+'</small></div>').join("")+'</div></section>';
  }
  function capabilities(){
    return '<section class="panel full-panel"><div class="panel-head"><div><h2>Factory details</h2><p class="panel-sub">Generation proof is separate from commercial proof.</p></div><span class="badge collecting">Local prototype</span></div><div class="capability-grid"><div><h3>Working in this build</h3><p>Configurable intake forms and required-document checklists.</p><p>Receipt metadata, expiry detection, interval-limited reminder simulations.</p><p>Local activity history, optional browser persistence, JSON snapshot export.</p><p>One shared engine and deterministic application generation.</p></div><div><h3>Not activated or implemented</h3><p>No production authentication, secure file uploads, tenant-isolated server storage, or hosted worker.</p><p>No live email, billing, customer acquisition, or multi-user collaboration.</p><p>Customers, revenue, retention and customer time savings: <strong>not measured.</strong></p><p>Existing product catalog, payment rails and launch restrictions are unchanged.</p></div></div></section>';
  }
  function render(){
    const all=engine.list(),active=all.filter(row=>!row.archived),complete=active.filter(row=>row.status==="complete").length;
    const renewal=active.filter(row=>row.renewal||row.expired).length;
    const waiting=active.filter(row=>row.missing>0).length;
    const state=engine.snapshot();
    const title={overview:"Every record. One clear view.",queue:"Your intake, organized.",reminders:"Follow-up without duplicate work.",activity:"A clear record of what changed.",factory:"Built once. Configured many ways."}[view];
    document.getElementById("app").innerHTML='<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">↗</span>'+escape(recipe.title)+'</div><div><p class="side-heading">WORKSPACE</p><nav class="nav" aria-label="Workspace navigation">'+[["overview","Overview"],["queue","Intake queue"],["reminders","Reminders"],["activity","Activity"],["factory","Factory details"]].map(([id,label])=>'<button data-action="nav" data-view="'+id+'" class="'+(view===id?'active':'')+'"'+(view===id?' aria-current="page"':'')+'>'+label+'</button>').join("")+'</nav></div><div class="side-footer"><strong>Prototype edition</strong>Local-only · synthetic data<br>No payments or messages</div></aside><main class="main"><div class="topbar"><span class="eyebrow">DOCUMENT WORKFLOWS / '+escape(recipe.recordLabel.toUpperCase())+' EDITION</span><span class="pill local">Synthetic demo</span></div><div class="intro"><div><h1>'+title+'</h1><p>'+escape(recipe.outcome)+'</p></div><button class="primary" data-action="new">+ New intake</button></div><div class="stats"><div class="stat"><div class="label">ACTIVE DEMO RECORDS</div><div class="value">'+active.length+'</div><div class="caption">Synthetic workspace data</div></div><div class="stat highlight"><div class="label">CHECKLISTS COMPLETE</div><div class="value">'+complete+'</div><div class="caption">Receipt only, not verification</div></div><div class="stat"><div class="label">WAITING ON DOCUMENTS</div><div class="value">'+waiting+'</div><div class="caption">Collection in progress</div></div><div class="stat"><div class="label">RENEWAL ATTENTION</div><div class="value">'+renewal+'</div><div class="caption">Expiring or expired records</div></div></div>'+(view==="overview"?'<div class="workspace-grid">'+queue()+aside()+'</div>':view==="queue"?queue():view==="reminders"?reminders():view==="activity"?activity():capabilities())+'<div class="notice"><strong>Local prototype — synthetic data only.</strong> No file uploads, authentication, live delivery, or payments. Reminder automation runs every minute while this page is open; scenario dates do not advance on their own.</div>'+(restoreError?'<div class="error" role="alert">Stored demo data could not be restored. A fresh in-memory demo is shown; the original stored value has not been overwritten.</div>':'')+'<footer class="footer"><span>Scenario date: '+state.today+' · '+(storageOK?'Saved in this browser':'Memory only — browser storage unavailable')+'</span><div class="toolbar"><button class="quiet" data-action="export">Export snapshot</button><button class="quiet" data-action="reset">Reset synthetic demo</button></div></footer></main></div><dialog id="detail" aria-label="Intake record details"></dialog><dialog id="new-record" aria-labelledby="new-title"><div class="dialog-head"><div><h2 id="new-title">New '+escape(recipe.recordLabel.toLowerCase())+' intake</h2><small>Use a fictional name. No real documents are stored.</small></div><button class="quiet" data-action="close-new" aria-label="Close new intake">✕</button></div><form id="intake-form"><div class="dialog-body"><div class="field"><label for="record-name">Synthetic '+escape(recipe.recordLabel.toLowerCase())+' name</label><input id="record-name" name="recordName" required maxlength="100" placeholder="Sample · Example Company"></div><div class="field"><label for="due-date">Checklist due date</label><input id="due-date" name="dueOn" type="date" required value="'+K.addDays(state.today,recipe.defaultDueDays)+'"></div><p class="helper">'+recipe.requirements.length+' requirements will be created from this edition’s recipe.</p><div id="form-error" role="alert"></div></div><div class="dialog-footer"><span class="helper">Local demo only</span><button class="primary" type="submit">Create intake</button></div></form></dialog>';
    const search=document.getElementById("search");if(search)search.addEventListener("input",event=>{query=event.target.value;render();const next=document.getElementById("search");next.focus();});
    const select=document.getElementById("filter");if(select)select.addEventListener("change",event=>{filter=event.target.value;render();});
    document.getElementById("intake-form").addEventListener("submit",event=>{
      event.preventDefault();
      try{engine.addRecord({name:document.getElementById("record-name").value,dueOn:document.getElementById("due-date").value});save();render();toast("Synthetic intake created with the configured checklist.");}
      catch(_){const el=document.getElementById("form-error");el.className="error";el.textContent="Enter a name and a valid date between 2000 and 2100.";}
    });
  }
  function openRecord(id){
    selected=id;const row=engine.summary(id);const state=engine.snapshot();const dialog=document.getElementById("detail");
    dialog.innerHTML='<div class="dialog-head"><div><h2>'+escape(row.name)+'</h2><small>Due '+row.dueOn+' · '+row.received+' of '+row.total+' receipts recorded</small></div><button class="quiet" data-action="close-detail" aria-label="Close record">✕</button></div><div class="dialog-body">'+statusBadge(row.status)+'<p class="helper">Document metadata only. Recording a receipt does not verify its contents or authenticity.</p>'+recipe.requirements.map(req=>{
      const doc=row.documents[req.id];
      return '<div class="detail-row"><div class="doc-info"><h3>'+escape(req.label)+'</h3><small>'+(doc.receivedOn?'Receipt: '+doc.receivedOn+(doc.expiresOn?' · Expires '+doc.expiresOn:''):'Not yet received')+'</small></div><div class="detail-actions">'+(req.renewable?'<label>Expiry date<input type="date" id="expiry-'+req.id+'" aria-label="'+escape(req.label)+' expiry" min="'+state.today+'" value="'+(doc.expiresOn&&doc.expiresOn>=state.today?doc.expiresOn:K.addDays(state.today,180))+'"></label>':'')+'<button class="secondary" data-action="receive" data-requirement="'+req.id+'"'+(row.archived?' disabled':'')+'>'+(doc.receivedOn?'Update receipt':'Record receipt')+'</button></div></div>';
    }).join("")+'<div id="receipt-error" role="alert"></div></div><div class="dialog-footer"><button class="quiet" data-action="archive"'+(row.archived?' disabled':'')+'>Archive record</button><button class="primary" data-action="close-detail">Done</button></div>';
    dialog.showModal();
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest("button[data-action]");if(!button)return;
    const action=button.dataset.action;
    try{
      if(action==="nav"){view=button.dataset.view;render();}
      else if(action==="new")document.getElementById("new-record").showModal();
      else if(action==="close-new")document.getElementById("new-record").close();
      else if(action==="open")openRecord(button.dataset.id);
      else if(action==="close-detail")document.getElementById("detail").close();
      else if(action==="receive"){
        const req=button.dataset.requirement;const input=document.getElementById("expiry-"+req);
        engine.receive(selected,req,{expiresOn:input?input.value:null});save();render();openRecord(selected);toast("Receipt metadata recorded. No file was uploaded.");
      }else if(action==="archive"){engine.archive(selected);save();render();toast("Record archived; its reminder simulations were cancelled.");}
      else if(action==="run"){const messages=engine.runAutomation();save();render();toast(messages.length+" reminder simulations prepared. Nothing was sent.");}
      else if(action==="advance"){engine.advanceDay(K.addDays(engine.snapshot().today,7));const messages=engine.runAutomation();save();render();toast("Scenario advanced 7 days; "+messages.length+" reminder simulations prepared.");}
      else if(action==="export"){
        const blob=new Blob([JSON.stringify(engine.snapshot(),null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=recipe.id+"-synthetic-snapshot.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }else if(action==="reset"){
        if(!window.confirm("Reset this edition’s synthetic demo? Current local records will be replaced."))return;
        engine=K.createWorkspace(recipe,{workspaceId:"demo-space",today:initialDay});seed();query="";filter="active";render();toast("Synthetic demo reset.");
      }
    }catch(error){
      const message=error.message==="EXPIRY_INVALID"?"Choose a valid expiration date on or after the scenario date.":"The action could not be completed. No external service was contacted.";
      const errorBox=document.getElementById("receipt-error");if(errorBox){errorBox.className="error";errorBox.textContent=message;}else toast(message);
    }
  });
  render();
  setInterval(()=>{
    if(document.querySelector("dialog[open]")||document.activeElement?.tagName==="INPUT")return;
    try{const messages=engine.runAutomation();if(messages.length){save();render();toast(messages.length+" reminder simulations prepared automatically.");}}catch(_){/* History bounds stop automation without network or further mutation. */}
  },60000);
})();
