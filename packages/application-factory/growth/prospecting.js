'use strict';
// Public-organization desk research, not buyer verification, contact discovery, or a messaging service.
const {validateRecipe}=require('../kernel');
const SIGNALS=new Set(['business_category','document_collection','renewal_process','client_onboarding','supplier_intake','multi_location']);
const fail=code=>{throw new Error(code);};
const DAY=86400000;
const distinctNames=/^[A-Za-z0-9][A-Za-z0-9 &.',()/-]{1,89}$/;
const PII=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/i;
const safeNote=v=>typeof v==='string'&&v.length>=15&&v.length<=240&&/^[\x20-\x7e]+$/.test(v)&&!PII.test(v)&&!/[<>`{}\[\]]/.test(v);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function day(value){
  if(typeof value!=='string'||!/^(?:20\d\d)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value))return null;
  const stamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?stamp:null;
}
function safeHttps(raw,{homepage=false}={}){
  if(typeof raw!=='string'||raw.length>450||raw.trim()!==raw||PII.test(raw))fail('TARGET_INVALID');
  let url;try{url=new URL(raw);}catch{fail('TARGET_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||
     !/^[a-z0-9.-]+$/.test(url.hostname)||url.hostname.length>253||
     !url.hostname.includes('.')||url.hostname.startsWith('.')||url.hostname.endsWith('.')||
     url.hostname.includes('..')||/^(?:\d+\.){3}\d+$/.test(url.hostname)||
     /(?:^|\.)(?:localhost|local|internal|invalid|test|onion)$/.test(url.hostname)||
     url.hostname.startsWith('xn--')||url.hostname.split('.').some(x=>!x||x.length>63||x.startsWith('-')||x.endsWith('-')))
    fail('TARGET_INVALID');
  const host=url.hostname.replace(/^www\./,'');
  if(homepage && url.pathname!=='/')fail('TARGET_INVALID');
  return {host,url:'https://'+host+(homepage?'/':url.pathname)};
}
function validateCandidate(input,recipes,asOf){
  if(!Array.isArray(recipes)||!recipes.length||day(asOf)===null||
     !exact(input,['company','homepage','recipeId','observations'])||
     typeof input.company!=='string'||!distinctNames.test(input.company)||PII.test(input.company)||
     typeof input.recipeId!=='string'||!recipes.some(r=>validateRecipe(r).id===input.recipeId)||
     !Array.isArray(input.observations)||input.observations.length<1||input.observations.length>5)fail('TARGET_INVALID');
  const page=safeHttps(input.homepage,{homepage:true});
  const sources=new Set();
  const observations=input.observations.map(o=>{
    if(!exact(o,['url','observedOn','signal','note'])||!SIGNALS.has(o.signal)||!safeNote(o.note))fail('TARGET_INVALID');
    const source=safeHttps(o.url),d=day(o.observedOn),t=day(asOf);
    if(d===null||d>t||t-d>180*DAY||sources.has(source.url))fail('TARGET_INVALID');
    sources.add(source.url);
    return Object.freeze({url:source.url,observedOn:o.observedOn,signal:o.signal,note:o.note,
      sourceVerification:'operator_provided_unverified'});
  }).sort((a,b)=>a.url.localeCompare(b.url));
  return Object.freeze({company:input.company,domain:page.host,homepage:page.url,recipeId:input.recipeId,
    observations,evidenceStatus:'operator_provided_unverified',customerVerified:false,demandVerified:false});
}
const SIGNAL_WEIGHTS=Object.freeze({
  'supplier-desk':{supplier_intake:3,document_collection:2,renewal_process:2,multi_location:1,business_category:1},
  'contractor-renewals':{renewal_process:3,document_collection:2,multi_location:1,business_category:1},
  'agency-intake':{client_onboarding:3,document_collection:2,business_category:1}
});
function buildDiscoveryKit(raw){
  const r=validateRecipe(raw),what=r.recordLabel.toLowerCase()+' records';
  const questions=[
    `How does your team currently request and track ${what}?`,
    `What happens when a required ${r.requirements[0].label.toLowerCase()} is missing?`,
    `How often do you follow up to complete a ${r.recordLabel.toLowerCase()} checklist?`,
    `What existing tool or spreadsheet would a new workflow have to replace?`,
    `What is the actual time and cost of a delayed ${r.recordLabel.toLowerCase()} intake?`,
    `Who can approve and fund a time-limited pilot, if the problem is worth solving?`,
    `What completed outcome would demonstrate success before considering recurring payment?`
  ];
  return Object.freeze({schemaVersion:1,recipeId:r.id,title:r.title,buyer:r.buyer,
    proposedOutcome:r.outcome,questions,
    productScope:r.requirements.map(q=>q.label),
    releaseChecklist:['Confirm independent buyer problem evidence','Verify product legal identity and claims',
      'Operator-approved sender identification and unsubscribe handling',
      'Independent security and privacy release review','Explicit commercial release and spend authorization'],
    pilotPriceCents:null,priceCents:null,realCustomers:null,collectedRevenue:null,
    outreachEnabled:false,contactCollectionEnabled:false,checkoutEnabled:false,releaseApproved:false,
    qualificationStatus:'unknown',mode:'draft-only'});
}
function messaging(target,recipe){
  const title=recipe.title,role=recipe.recordLabel.toLowerCase();
  const subject=`Question about ${role} coordination at ${target.company}`;
  return [
    {sequence:1,reviewAfterDays:0,subject,body:`I'm exploring a focused ${role} intake workspace for teams that sometimes collect documents, track missing inputs and manage renewals. I'm researching whether this is a problem worth solving for organizations like ${target.company}; I am not assuming it is a problem for yours. Would you be open to answering one question about how you handle ${role} records today? The concept is not available for purchase.`},
    {sequence:2,reviewAfterDays:7,subject:`Follow-up question about ${role} intake`,body:`Following up on my research question about ${role} document intake. If the topic isn't relevant, no response is needed. If it is, I'd appreciate learning what your current process is, not assuming a new tool would be better.`},
    {sequence:3,reviewAfterDays:14,subject:`Closing my ${role} research question`,body:`One final follow-up on my ${role} process research. I'm exploring whether a compact checklist and reminder workspace would remove work for teams like yours. If there's no need, I won't follow up further.`}
  ].map(row=>Object.freeze({...row,approvedToSend:false,sent:false}));
}
function planTargets(targets,recipes,asOf){
  if(!Array.isArray(targets)||targets.length<1||targets.length>300)fail('TARGET_CAPACITY');
  if(!Array.isArray(recipes)||recipes.length<1||day(asOf)===null)fail('TARGET_INVALID');
  const catalog=new Map(recipes.map(raw=>{const recipe=validateRecipe(raw);return [recipe.id,recipe];}));
  const used=new Set();
  const rows=targets.map(raw=>{
    const target=validateCandidate(raw,recipes,asOf);
    if(used.has(target.domain))fail('TARGET_DUPLICATE');used.add(target.domain);
    const weights=SIGNAL_WEIGHTS[target.recipeId]||{};
    const researchPriority=Math.min(6,target.observations.reduce((sum,o)=>sum+(weights[o.signal]||0),0));
    const kit=buildDiscoveryKit(catalog.get(target.recipeId));
    return Object.freeze({...target,researchPriority,priorityMeaning:'research_triage_only_not_purchase_probability',
      outreachDrafts:messaging(target,catalog.get(target.recipeId)),nextAction:'owner_source_review',
      demandVerified:false,qualifiedBuyer:false,releaseApproved:false,sendEnabled:false,
      discoveryQuestions:kit.questions});
  }).sort((a,b)=>b.researchPriority-a.researchPriority||a.domain.localeCompare(b.domain));
  return Object.freeze({schemaVersion:1,asOf,targets:rows,sourceEvidence:'operator_provided_unverified',
    releaseChecklist:buildDiscoveryKit(recipes[0]).releaseChecklist,
    transmittedMessages:0,operatorReportedOutreach:0,realCustomers:null,collectedRevenue:null,
    checkoutEnabled:false,outreachEnabled:false,contactCollectionEnabled:false,releaseApproved:false});
}
function renderResearchMarkdown(plan){
  if(!plan||plan.releaseApproved!==false||plan.outreachEnabled!==false||!Array.isArray(plan.targets))fail('TARGET_INVALID');
  const header=['# DRAFT ONLY — buyer discovery research, not permission to contact','',
    'No email addresses or person-level contacts are collected. These draft messages are NOT approved for sending. Confirm public evidence, sender identity, lawful practices, unsubscribe handling and owner authorization before any real outreach.',
    'Research rankings are not purchase probabilities. Company problems and purchasing intent are unknown. There are no verified customers, payments or conversion results.',''];
  for(const target of plan.targets){
    header.push(`## ${target.company} (${target.recipeId})`,'',
      `Company homepage: ${target.homepage}`,`Research priority only: ${target.researchPriority}`,
      'Source references (unverified operator observations):',
      ...target.observations.map(o=>`- ${o.observedOn} — ${o.url} (${o.signal}): ${o.note}`),'',
      'Research questions:',...target.discoveryQuestions.slice(0,3).map(q=>`- ${q}`),'');
    for(const draft of target.outreachDrafts){header.push(`### Draft ${draft.sequence} — review after ${draft.reviewAfterDays} days`,
      `Subject: ${draft.subject}`,'',draft.body,'','**Not sent; legal/compliance approval required.**','');}
  }
  return header.join('\n');
}
module.exports={validateCandidate,buildDiscoveryKit,planTargets,renderResearchMarkdown};
