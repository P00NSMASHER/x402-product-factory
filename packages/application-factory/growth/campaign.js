'use strict';
// Private review log for PUBLIC ORGANIZATION research only. No contact collection, sender or real sales.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateRecipe}=require('../kernel');
const {planTargets}=require('./prospecting');
const fail=code=>{throw new Error(code);};
const exact=(v,fields)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
const isDomain=v=>typeof v==='string'&&v.length<=253&&/^[a-z0-9.-]+$/.test(v)&&v.includes('.')&&
  !v.startsWith('.')&&!v.endsWith('.')&&!v.includes('..');
const isKey=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const KINDS=new Set(['reviewed','reported_outreach','reported_reply','reported_pilot_interest','not_interested','do_not_contact']);
function privatePath(filename){
  if(typeof filename!=='string'||!path.isAbsolute(filename))fail('CAMPAIGN_CONFIG_INVALID');
  const directory=path.dirname(filename);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(directory)!==path.resolve(directory)||
     (process.platform!=='win32'&&((stat.mode&0o077)!==0||(typeof process.getuid==='function'&&stat.uid!==process.getuid()))))fail('CAMPAIGN_PATH_UNSAFE');
  if(fs.existsSync(filename)){const f=fs.lstatSync(filename);
    if(!f.isFile()||f.isSymbolicLink()||(process.platform!=='win32'&&(f.mode&0o077)!==0))fail('CAMPAIGN_PATH_UNSAFE');}
}
function writePrivate(filename,body,exclusive=false){
  privatePath(filename);
  if(exclusive){const fd=fs.openSync(filename,'wx',0o600);try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return;}
  const temp=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,filename);
    if(process.platform!=='win32'){const dirfd=fs.openSync(path.dirname(filename),'r');try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}}
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function openCampaign({filename,key,recipes,clock=Date.now}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||!Array.isArray(recipes)||!recipes.length||typeof clock!=='function')fail('CAMPAIGN_CONFIG_INVALID');
  const ids=new Set(recipes.map(r=>validateRecipe(r).id));if(ids.size!==recipes.length)fail('CAMPAIGN_CONFIG_INVALID');
  const secret=Buffer.from(key);let closed=false;
  const seal=data=>JSON.stringify({...data,tag:crypto.createHmac('sha256',secret).update(JSON.stringify(data)).digest('hex')},null,2)+'\n';
  const today=()=>{const d=new Date(clock());if(!Number.isFinite(d.getTime()))fail('CAMPAIGN_CONFIG_INVALID');return d.toISOString().slice(0,10);};
  function load(){
    if(closed)fail('CAMPAIGN_CLOSED');privatePath(filename);let row;
    try{if(fs.statSync(filename).size>2500000)fail('CAMPAIGN_TAMPERED');row=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail('CAMPAIGN_TAMPERED');}
    if(!exact(row,['schemaVersion','createdAt','targets','events','tag'])||row.schemaVersion!==1||
      typeof row.createdAt!=='string'||!Array.isArray(row.targets)||row.targets.length>300||
      !Array.isArray(row.events)||row.events.length>5000||typeof row.tag!=='string'||!/^[0-9a-f]{64}$/.test(row.tag))fail('CAMPAIGN_TAMPERED');
    const {tag,...data}=row,got=crypto.createHmac('sha256',secret).update(JSON.stringify(data)).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(tag,'hex'),Buffer.from(got,'hex')))fail('CAMPAIGN_TAMPERED');
    const domains=new Set(),keys=new Set();
    for(const t of row.targets){
      if(!isDomain(t.domain)||domains.has(t.domain)||!ids.has(t.recipeId)||t.customerVerified!==false||t.demandVerified!==false)fail('CAMPAIGN_TAMPERED');
      domains.add(t.domain);
    }
    for(const e of row.events){if(!isDomain(e.domain)||!domains.has(e.domain)||!KINDS.has(e.kind)||!isKey(e.key)||keys.has(e.key)||
      typeof e.occurredOn!=='string'||!/^(?:20\d\d)-\d\d-\d\d$/.test(e.occurredOn))fail('CAMPAIGN_TAMPERED');keys.add(e.key);}
    return data;
  }
  function mutate(fn){
    const lock=filename+'.lock';let fd;
    try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('CAMPAIGN_LOCKED');throw error;}
    try{const data=load(),result=fn(data);writePrivate(filename,seal(data));return result;}
    finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
  try{privatePath(filename);if(!fs.existsSync(filename))writePrivate(filename,seal({schemaVersion:1,createdAt:today(),targets:[],events:[]}),true);load();}
  catch(error){secret.fill(0);throw error;}
  const status=(data,domain)=>{
    const events=data.events.filter(e=>e.domain===domain);
    if(events.some(e=>['do_not_contact','not_interested'].includes(e.kind)))return 'suppressed';
    for(const kind of ['reported_pilot_interest','reported_reply','reported_outreach','reviewed']){
      if(events.some(e=>e.kind===kind))return kind;
    }
    return 'new';
  };
  return Object.freeze({
    importTargets(raw){
      const planned=planTargets(raw,recipes,today());
      return mutate(data=>{let added=0;
        for(const t of planned.targets){
          if(data.targets.some(x=>x.domain===t.domain))continue;
          if(data.targets.length>=300)fail('TARGET_CAPACITY');
          data.targets.push(t);added++;
        }
        data.targets.sort((a,b)=>a.domain.localeCompare(b.domain));return {added,existing:data.targets.length-added,total:data.targets.length};
      });
    },
    record(event){
      if(!exact(event,['domain','kind','key'])||!isDomain(event.domain)||!KINDS.has(event.kind)||!isKey(event.key))fail('CAMPAIGN_EVENT_INVALID');
      return mutate(data=>{
        const prior=data.events.find(e=>e.key===event.key);
        if(prior){if(prior.domain===event.domain&&prior.kind===event.kind)return {...prior};fail('CAMPAIGN_CONFLICT');}
        if(data.events.length>=5000)fail('CAMPAIGN_CAPACITY');
        if(!data.targets.some(t=>t.domain===event.domain))fail('CAMPAIGN_UNKNOWN');
        const current=status(data,event.domain);
        if(current==='suppressed')fail('CAMPAIGN_SUPPRESSED');
        if(event.kind==='reported_outreach'&&!['reviewed','reported_outreach'].includes(current))fail('CAMPAIGN_SEQUENCE');
        if(event.kind==='reported_reply'&&!['reported_outreach','reported_reply'].includes(current))fail('CAMPAIGN_SEQUENCE');
        if(event.kind==='reported_pilot_interest'&&!['reported_reply','reported_pilot_interest'].includes(current))fail('CAMPAIGN_SEQUENCE');
        if(event.kind==='reviewed'&&current!=='new')fail('CAMPAIGN_SEQUENCE');
        const row={domain:event.domain,kind:event.kind,key:event.key,occurredOn:today(),operatorReported:true};
        data.events.push(row);return {...row};
      });
    },
    report(){const data=load(),statuses=data.targets.map(t=>status(data,t.domain));
      const count=k=>statuses.filter(s=>s===k).length;
      return {kind:'research-campaign',targets:data.targets.length,unreviewed:count('new'),
        reviewed:statuses.filter(s=>s!=='new'&&s!=='suppressed').length,
        operatorReportedOutreach:statuses.filter(s=>['reported_outreach','reported_reply','reported_pilot_interest'].includes(s)).length,
        operatorReportedReplies:statuses.filter(s=>['reported_reply','reported_pilot_interest'].includes(s)).length,
        operatorReportedPilotInterest:count('reported_pilot_interest'),suppressed:count('suppressed'),
        evidenceLabel:'operator-entered public company research, not independently audited',
        independentlyVerifiedBuyerDemand:null,realCustomers:null,collectedRevenue:null,releaseApproved:false,
        checkoutEnabled:false,outreachEnabled:false,transmittedMessages:0};
    },
    // Read-only public organization summaries. Buyer contacts and message delivery are deliberately absent.
    accounts(){
      const data=load(),date=today();
      return data.targets.map(t=>{
        const events=data.events.filter(e=>e.domain===t.domain),stage=status(data,t.domain);
        let action=stage==='new'?'review_sources':stage==='reviewed'?'review_outreach_draft':
          stage==='reported_reply'?'review_buyer_reply':stage==='reported_outreach'?'review_followup':null;
        if(action==='review_followup'){
          const last=events.filter(e=>e.kind==='reported_outreach').at(-1);
          if(!last||Date.parse(date+'T00:00:00Z')-Date.parse(last.occurredOn+'T00:00:00Z')<7*86400000)action=null;
        }
        return {domain:t.domain,company:t.company,recipeId:t.recipeId,homepage:t.homepage,
          researchPriority:t.researchPriority,priorityMeaning:t.priorityMeaning,stage,action,
          lastReportedOn:events.at(-1)?.occurredOn||null,
          dataSource:'operator_provided_unverified',demandVerified:false,
          qualifiedBuyer:false,sendEnabled:false,manualReviewRequired:Boolean(action)};
      }).sort((a,b)=>a.domain.localeCompare(b.domain));
    },
    nextActions(){const data=load(),date=today();return data.targets.flatMap(t=>{
      const state=status(data,t.domain),entries=data.events.filter(e=>e.domain===t.domain);
      if(state==='suppressed'||state==='reported_pilot_interest')return [];
      const action=state==='new'?'review_sources':state==='reviewed'?'review_outreach_draft':
        state==='reported_reply'?'review_buyer_reply':'review_followup';
      if(action==='review_followup'){
        const last=entries.filter(e=>e.kind==='reported_outreach').at(-1);
        if(Date.parse(date+'T00:00:00Z')-Date.parse(last.occurredOn+'T00:00:00Z')<7*86400000)return [];
      }
      return [{domain:t.domain,recipeId:t.recipeId,action,sendEnabled:false,
        qualification:'unverified',manualReviewRequired:true}];
    }).slice(0,300);},
    close(){if(!closed){secret.fill(0);closed=true;}}
  });
}
module.exports={createCampaign:openCampaign};
