'use strict';
// Operator-observed background sources seed durable, append-only synthetic workflow hypotheses.
// NO untrusted page text is executable or proof of buyer demand.
const fs=require('node:fs'),path=require('node:path');
const {buildCandidateCatalog}=require('./catalog');
const {loadIdeaBacklog,validateIdea}=require('./ideas');
const FIRST_CYCLE=75,MAX_LEADS=24;
const SOURCE=path.join(__dirname,'scout','leads.json');
const fail=code=>{throw Error(code);};
const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===names.length&&names.every(k=>Object.hasOwn(value,k));
function loadScoutedLeads({sourceFile=SOURCE,blueprintDirectory=path.join(__dirname,'ideas'),existingRecipes}={}){
 const baseline=existingRecipes||buildCandidateCatalog();
 const pinned=loadIdeaBacklog({directory:blueprintDirectory,existingRecipes:baseline});
 if(typeof sourceFile!=='string'||!path.isAbsolute(sourceFile))fail('SCOUT_PATH_UNSAFE');
 if(!fs.existsSync(sourceFile))return [];
 const state=fs.lstatSync(sourceFile);
 if(!state.isFile()||state.isSymbolicLink()||state.size<64||state.size>80000)fail('SCOUT_PATH_UNSAFE');
 let corpus;try{corpus=JSON.parse(fs.readFileSync(sourceFile,'utf8'));}catch{fail('SCOUT_INVALID');}
 if(!exact(corpus,['schemaVersion','kind','observedOn','policy','leads'])||corpus.schemaVersion!==1||
   corpus.kind!=='unverified-research-lead-queue'||corpus.policy!=='append-only-fixed-slot-candidates'||
   !/^20\d\d-\d\d-\d\d$/.test(corpus.observedOn)||!Array.isArray(corpus.leads)||
   corpus.leads.length<1||corpus.leads.length>MAX_LEADS)fail('SCOUT_INVALID');
 const selected=[],accepted=pinned.slice();
 for(let i=0;i<corpus.leads.length;i++){
  const lead=corpus.leads[i],cycle=FIRST_CYCLE+i;
  if(!exact(lead,['hypothesis','sources','recipe']))fail('SCOUT_INVALID');
  if(!Array.isArray(lead.sources)||lead.sources.length!==2||
     !lead.sources.every(s=>s&&typeof s.url==='string'&&
       (()=>{try{return new URL(s.url).hostname.endsWith('.gov');}catch{return false;}})()))fail('SCOUT_SOURCE_INVALID');
  if(pinned.some(p=>p.cycle===cycle)){
    // Existing reviewed exact-cycle blueprints take precedence. Never silently reorder later leads.
    selected.push({cycle,status:'overridden-by-exact-blueprint',recipe:null,digest:null,
      readinessScore:null,sourceVerification:'operator_provided_unverified'});
    continue;
  }
  const input={schemaVersion:1,cycle,hypothesis:lead.hypothesis,sources:lead.sources,recipe:lead.recipe};
  let row;
  try{row=validateIdea(input,'cycle-'+cycle+'.json',baseline,accepted);}
  catch{fail('SCOUT_IDEA_INVALID');}
  if(!/(\bnot\b|\bno\b|\bwithout\b)/i.test(row.recipe.outcome))fail('SCOUT_RISK_DISCLOSURE_MISSING');
  const hosts=new Set(row.sources.map(s=>new URL(s.url).hostname));
  const score=20+Math.min(row.recipe.requirements.length,6)*8+
    (hosts.size===2?12:0)+10+10;
  selected.push({...row,status:'admitted-unverified',readinessScore:score,
    readinessMeaning:'mechanical_document_workflow_fit_only'});
  accepted.push(row);
 }
 return selected;
}
function inspectScout(args={}){
 const rows=loadScoutedLeads(args);
 return {kind:'autonomous-research-scout',reservedCycles:rows.map(x=>x.cycle),
  eligible:rows.filter(x=>x.status==='admitted-unverified').length,
  overridden:rows.filter(x=>x.status==='overridden-by-exact-blueprint').length,
  candidates:rows.map(x=>({cycle:x.cycle,id:x.recipe?.id||null,
   readinessScore:x.readinessScore,status:x.status,sourceVerification:x.sourceVerification})),
  independentMarketEvidence:false,marketValidated:false,
  realCustomers:null,collectedRevenue:null,transmittedMessages:0,paymentsSent:0,
  publicDeploymentEnabled:false,releaseApproved:false};
}
module.exports={loadScoutedLeads,inspectScout,FIRST_CYCLE};
