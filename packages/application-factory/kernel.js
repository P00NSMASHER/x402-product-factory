/* Shared deterministic workflow core. This is not an authentication boundary. */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.FactoryKernel=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const DAY=86400000,MAX_RECORDS=500,MAX_HISTORY=5000;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=code=>{throw new Error(code);};
  const record=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
  const text=(value,max)=>typeof value==="string"&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
  const id=value=>typeof value==="string"&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)&&value.length<=60;
  const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
  function keys(value,allowed){return record(value)&&Object.keys(value).length===allowed.length&&Object.keys(value).every(k=>allowed.includes(k));}
  function day(value){
    if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<"2000-01-01"||value>"2100-12-31")return null;
    const ms=Date.parse(value+"T00:00:00Z");
    return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?ms:null;
  }
  function addDays(value,amount){
    const ms=day(value);if(ms===null||!integer(amount,-36500,36500))fail("DATE_INVALID");
    const result=new Date(ms+amount*DAY).toISOString().slice(0,10);
    if(day(result)===null)fail("DATE_INVALID");return result;
  }
  function validateRecipe(raw){
    const fields=["version","family","id","title","buyer","outcome","recordLabel","defaultDueDays","reminderEveryDays","renewalWindowDays","requirements"];
    if(!keys(raw,fields)||raw.version!==1||raw.family!=="document-workflow"||!id(raw.id)||
       !text(raw.title,80)||!text(raw.buyer,160)||!text(raw.outcome,240)||!text(raw.recordLabel,40)||
       !integer(raw.defaultDueDays,1,90)||!integer(raw.reminderEveryDays,1,30)||!integer(raw.renewalWindowDays,0,90)||
       !Array.isArray(raw.requirements)||raw.requirements.length<1||raw.requirements.length>12)fail("RECIPE_INVALID");
    const seen=new Set();
    const requirements=raw.requirements.map(req=>{
      if(!keys(req,["id","label","renewable"])||!id(req.id)||!text(req.label,100)||typeof req.renewable!=="boolean"||seen.has(req.id))fail("RECIPE_INVALID");
      seen.add(req.id);return Object.freeze({id:req.id,label:req.label,renewable:req.renewable});
    });
    return Object.freeze({version:1,family:"document-workflow",id:raw.id,title:raw.title,buyer:raw.buyer,
      outcome:raw.outcome,recordLabel:raw.recordLabel,defaultDueDays:raw.defaultDueDays,
      reminderEveryDays:raw.reminderEveryDays,renewalWindowDays:raw.renewalWindowDays,
      requirements:Object.freeze(requirements)});
  }
  function validateSnapshot(raw,recipe,workspaceId){
    const fields=["version","recipeId","recipeKey","workspaceId","today","nextId","nextMessageId","nextAuditId","records","outbox","audit"];
    if(!keys(raw,fields)||raw.version!==1||raw.recipeId!==recipe.id||raw.recipeKey!==JSON.stringify(recipe)||
       raw.workspaceId!==workspaceId||day(raw.today)===null||
       !integer(raw.nextId,1,1000000)||!integer(raw.nextMessageId,1,1000000)||!integer(raw.nextAuditId,1,1000000)||
       !Array.isArray(raw.records)||raw.records.length>MAX_RECORDS||!Array.isArray(raw.outbox)||raw.outbox.length>MAX_HISTORY||
       !Array.isArray(raw.audit)||raw.audit.length>MAX_HISTORY)fail("SNAPSHOT_INVALID");
    const ids=new Set();
    for(const row of raw.records){
      if(!keys(row,["id","name","dueOn","createdOn","archived","revision","lastRemindedOn","documents"])||
         !/^r[1-9]\d*$/.test(row.id)||Number(row.id.slice(1))>=raw.nextId||ids.has(row.id)||!text(row.name,100)||
         day(row.dueOn)===null||day(row.createdOn)===null||row.createdOn>raw.today||typeof row.archived!=="boolean"||
         !integer(row.revision,1,1000000)||!(row.lastRemindedOn===null||(day(row.lastRemindedOn)!==null&&row.lastRemindedOn<=raw.today))||
         !keys(row.documents,recipe.requirements.map(req=>req.id)))fail("SNAPSHOT_INVALID");
      ids.add(row.id);
      for(const req of recipe.requirements){
        const doc=row.documents[req.id];
        if(!keys(doc,["receivedOn","expiresOn"])||
           !(doc.receivedOn===null||(day(doc.receivedOn)!==null&&doc.receivedOn<=raw.today&&doc.receivedOn>=row.createdOn))||
           (doc.receivedOn===null&&doc.expiresOn!==null)||
           (doc.receivedOn!==null&&req.renewable&&(day(doc.expiresOn)===null||doc.expiresOn<doc.receivedOn))||
           (!req.renewable&&doc.expiresOn!==null))fail("SNAPSHOT_INVALID");
      }
    }
    const messages=new Set();
    for(const item of raw.outbox){
      if(!keys(item,["id","recordId","recordName","kind","day","status","revision"])||
         !/^m[1-9]\d*$/.test(item.id)||Number(item.id.slice(1))>=raw.nextMessageId||messages.has(item.id)||
         !ids.has(item.recordId)||!text(item.recordName,100)||!["collection","renewal"].includes(item.kind)||
         day(item.day)===null||item.day>raw.today||!["simulated","cancelled"].includes(item.status)||
         !integer(item.revision,1,1000000))fail("SNAPSHOT_INVALID");
      messages.add(item.id);
    }
    const audits=new Set();
    for(const event of raw.audit){
      if(!keys(event,["id","day","recordId","action"])||!/^a[1-9]\d*$/.test(event.id)||
         Number(event.id.slice(1))>=raw.nextAuditId||audits.has(event.id)||day(event.day)===null||event.day>raw.today||
         (event.recordId!==null&&!ids.has(event.recordId))||
         !["record_added","document_received","record_archived","reminder_simulated","day_advanced"].includes(event.action))fail("SNAPSHOT_INVALID");
      audits.add(event.id);
    }
    return clone(raw);
  }
  function createWorkspace(rawRecipe,options){
    const recipe=validateRecipe(rawRecipe);
    if(!record(options)||!id(options.workspaceId)||day(options.today)===null)fail("WORKSPACE_INVALID");
    const state=options.snapshot===undefined?{
      version:1,recipeId:recipe.id,recipeKey:JSON.stringify(recipe),workspaceId:options.workspaceId,today:options.today,
      nextId:1,nextMessageId:1,nextAuditId:1,records:[],outbox:[],audit:[]
    }:validateSnapshot(options.snapshot,recipe,options.workspaceId);
    function lookup(rowId){const row=state.records.find(item=>item.id===rowId);if(!row)fail("RECORD_UNKNOWN");return row;}
    function capacity(count=1){if(state.audit.length+count>MAX_HISTORY)fail("HISTORY_LIMIT");}
    function log(action,recordId){state.audit.push({id:"a"+state.nextAuditId++,day:state.today,recordId,action});}
    function cancel(row){for(const msg of state.outbox)if(msg.recordId===row.id&&msg.status==="simulated")msg.status="cancelled";}
    function summary(rowId){
      const row=lookup(rowId);let missing=0,renewal=0,expired=0;
      for(const req of recipe.requirements){
        const doc=row.documents[req.id];
        if(doc.receivedOn===null)missing++;
        else if(req.renewable){
          const remaining=(day(doc.expiresOn)-day(state.today))/DAY;
          if(remaining<0)expired++;else if(remaining<=recipe.renewalWindowDays)renewal++;
        }
      }
      return {...clone(row),missing,renewal,expired,total:recipe.requirements.length,
        received:recipe.requirements.length-missing,
        status:row.archived?"archived":expired?"expired":missing?"collecting":renewal?"renewal_due":"complete"};
    }
    return Object.freeze({
      snapshot(){return clone(state);},
      summary,
      list(){return state.records.map(row=>summary(row.id));},
      addRecord(input){
        if(!keys(input,["name","dueOn"])||!text(input.name,100)||day(input.dueOn)===null)fail("RECORD_INVALID");
        if(state.records.length>=MAX_RECORDS)fail("RECORD_LIMIT");capacity();
        const documents=Object.fromEntries(recipe.requirements.map(req=>[req.id,{receivedOn:null,expiresOn:null}]));
        const row={id:"r"+state.nextId++,name:input.name.trim(),dueOn:input.dueOn,createdOn:state.today,
          archived:false,revision:1,lastRemindedOn:null,documents};
        state.records.push(row);log("record_added",row.id);return summary(row.id);
      },
      receive(rowId,requirementId,input){
        const row=lookup(rowId);if(row.archived)fail("RECORD_ARCHIVED");
        const requirement=recipe.requirements.find(req=>req.id===requirementId);if(!requirement)fail("DOCUMENT_UNKNOWN");
        if(!record(input)||Object.keys(input).some(key=>key!=="expiresOn"))fail("DOCUMENT_INVALID");
        const expiresOn=input.expiresOn===undefined?null:input.expiresOn;
        if(!requirement.renewable&&expiresOn!==null)fail("EXPIRY_NOT_ALLOWED");
        if(requirement.renewable&&(day(expiresOn)===null||expiresOn<state.today))fail("EXPIRY_INVALID");
        const doc=row.documents[requirementId];
        if(doc.receivedOn!==null&&doc.expiresOn===expiresOn)return summary(rowId);
        capacity();row.documents[requirementId]={receivedOn:state.today,expiresOn};row.revision++;
        cancel(row);log("document_received",row.id);return summary(rowId);
      },
      archive(rowId){
        const row=lookup(rowId);if(row.archived)return summary(rowId);capacity();
        row.archived=true;row.revision++;cancel(row);log("record_archived",row.id);return summary(rowId);
      },
      advanceDay(today){
        if(day(today)===null||today<state.today)fail("CLOCK_INVALID");
        if(today===state.today)return;capacity();state.today=today;log("day_advanced",null);
      },
      runAutomation(){
        const pending=[];
        for(const row of state.records){
          const value=summary(row.id);if(row.archived||value.status==="complete")continue;
          const needsCollection=value.missing>0&&row.dueOn<=state.today;
          const needsRenewal=value.renewal>0||value.expired>0;
          if(!needsCollection&&!needsRenewal)continue;
          if(row.lastRemindedOn!==null&&(day(state.today)-day(row.lastRemindedOn))/DAY<recipe.reminderEveryDays)continue;
          pending.push({row,kind:needsCollection?"collection":"renewal"});
        }
        capacity(pending.length);if(state.outbox.length+pending.length>MAX_HISTORY)fail("HISTORY_LIMIT");
        const result=[];
        for(const {row,kind} of pending){
          cancel(row);
          const msg={id:"m"+state.nextMessageId++,recordId:row.id,recordName:row.name,kind,day:state.today,status:"simulated",revision:row.revision};
          state.outbox.push(msg);row.lastRemindedOn=state.today;log("reminder_simulated",row.id);result.push(clone(msg));
        }
        return result;
      }
    });
  }
  return Object.freeze({validateRecipe,createWorkspace,addDays,day});
});
