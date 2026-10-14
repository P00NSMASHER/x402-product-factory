'use strict';
// Auto-derive safe complete app recipes from source-referenced workflow hypotheses.
// These are structural matches, not independent demand, customer, price or compliance evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateRecipe:validateQuote}=require('../quote-family/kernel');
const {validateRecipe:validateInventory}=require('../inventory-family/engine');
const baselineQuotes=require('../quote-family/recipes.json');
const baselineInventory=require('../inventory-family/recipes.json');
const SOURCE=path.join(__dirname,'cross-family','proposals.json');
const fail=code=>{throw Error(code);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const safe=(v,min=1,max=260)=>typeof v==='string'&&v.trim()===v&&v.length>=min&&v.length<=max&&
 !/[<>\x00-\x1f\x7f]/.test(v)&&!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(v)&&
 !/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(v);
function day(v){
 if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v))fail('OPPORTUNITY_DATE_INVALID');
 const n=Date.parse(v+'T00:00:00Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)fail('OPPORTUNITY_DATE_INVALID');
 return n;
}
function publicReference(raw,asOf){
 if(!exact(raw,['url','observedOn'])||typeof raw.url!=='string'||raw.url.length>450)
  fail('OPPORTUNITY_REFERENCE_INVALID');
 let u;try{u=new URL(raw.url);}catch{fail('OPPORTUNITY_REFERENCE_INVALID');}
 const host=u.hostname;
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||
    !host.endsWith('.gov')||!/^[a-z0-9.-]+$/.test(host)||host.includes('..')||host.startsWith('.')||
    !host.split('.').every(x=>x.length>0&&x.length<=63&&!x.startsWith('-')&&!x.endsWith('-'))||
    !u.pathname.startsWith('/')||raw.url!==u.href)fail('OPPORTUNITY_REFERENCE_INVALID');
 const stamp=day(raw.observedOn);
 if(stamp>asOf||asOf-stamp>180*86400000)fail('OPPORTUNITY_REFERENCE_INVALID');
 return {url:raw.url,observedOn:raw.observedOn,verification:'public-context-reference-not-independent-buyer-evidence'};
}
function fingerprint(recipe){return JSON.stringify(recipe.items.map(v=>v.id).sort());}
function loadOpportunities({sourceFile=SOURCE}={}){
 if(typeof sourceFile!=='string'||!path.isAbsolute(sourceFile))fail('OPPORTUNITY_SOURCE_INVALID');
 let st;try{st=fs.lstatSync(sourceFile);}catch{fail('OPPORTUNITY_SOURCE_INVALID');}
 if(!st.isFile()||st.isSymbolicLink()||st.size<64||st.size>90000||
    fs.realpathSync(sourceFile)!==path.resolve(sourceFile))fail('OPPORTUNITY_SOURCE_INVALID');
 let root;try{root=JSON.parse(fs.readFileSync(sourceFile,'utf8'));}catch{fail('OPPORTUNITY_INVALID');}
 if(!exact(root,['schemaVersion','kind','observedOn','license','proposals'])||root.schemaVersion!==1||
  root.kind!=='cross-family-hypothesis-queue'||root.license!=='background-context-not-demand-proof'||
  !Array.isArray(root.proposals)||root.proposals.length<2||root.proposals.length>24)fail('OPPORTUNITY_INVALID');
 const asOf=day(root.observedOn),seen=new Set(),recipes=[];
 const controls=[...baselineQuotes.map(v=>({family:v.family,id:v.id,recipe:v})),
  ...baselineInventory.map(v=>({family:v.family,id:v.id,recipe:v}))];
 for(const proposal of root.proposals){
  if(!exact(proposal,['key','family','title','buyer','problem','trigger','sourceStatus','sources','inputs'])||
   !safe(proposal.key,3,55)||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(proposal.key)||
   !['quote-to-order','inventory-control'].includes(proposal.family)||
   !safe(proposal.title,10,80)||!safe(proposal.buyer,20,160)||
   !safe(proposal.problem,35,260)||!safe(proposal.trigger,35,260)||
   proposal.sourceStatus!=='background_only_unverified'||!Array.isArray(proposal.sources)||
   proposal.sources.length!==2||!Array.isArray(proposal.inputs)||
   proposal.inputs.length<3||proposal.inputs.length>6||seen.has(proposal.key))fail('OPPORTUNITY_INVALID');
  seen.add(proposal.key);
  const references=proposal.sources.map(s=>publicReference(s,asOf));
  if(references[0].url===references[1].url)fail('OPPORTUNITY_REFERENCE_INVALID');
  const inputs=proposal.inputs.map(v=>{
   if(!exact(v,['id','label','unit'])||!safe(v.id,2,55)||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v.id)||!safe(v.label,5,100)||
    !safe(v.unit,2,12))fail('OPPORTUNITY_INVALID');
   return {...v};
  });
  if(new Set(inputs.map(v=>v.id)).size!==inputs.length)fail('OPPORTUNITY_DUPLICATE');
  const name=proposal.key,quote=proposal.family==='quote-to-order';
  const recipe=quote?
   {version:1,family:'quote-to-order',id:name,title:proposal.title,buyer:proposal.buyer,
    outcome:'Prepare synthetic internal estimate handoffs for '+name.replaceAll('-',' ')+'. No customer billing or invoices.',
    currency:'USD',validDays:14,items:inputs}:
   {version:1,family:'inventory-control',id:name,title:proposal.title,buyer:proposal.buyer,
    outcome:'Track internal stock and approval readiness for '+name.replaceAll('-',' ')+'. No supplier purchases or payments.',
    currency:'USD',reviewWindowDays:14,maxProposalCents:1000000,
    items:inputs.map((v,i)=>({...v,reorderPoint:4+i,targetLevel:16+4*i,sampleUnitCostCents:100+50*i}))};
  try{(quote?validateQuote:validateInventory)(recipe);}catch{fail('OPPORTUNITY_RECIPE_INVALID');}
  for(const old of controls.filter(v=>v.family===proposal.family)){
   if(old.id===recipe.id||fingerprint(old.recipe)===fingerprint(recipe))fail('OPPORTUNITY_DUPLICATE');
   const oldKeys=new Set(old.recipe.items.map(v=>v.id)),newKeys=new Set(recipe.items.map(v=>v.id));
   if([...newKeys].filter(v=>!oldKeys.has(v)).length<2)fail('OPPORTUNITY_DUPLICATE');
  }
  controls.push({family:proposal.family,id:name,recipe});
  const diversity=new Set(inputs.map(v=>v.unit)).size;
  const sourceDiversity=new Set(references.map(v=>new URL(v.url).hostname)).size;
  const technicalFitScore=Math.min(100,25+inputs.length*7+diversity*8+sourceDiversity*5+6);
  const digest=crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
  recipes.push({key:name,family:proposal.family,recipe,technicalFitScore,proposalDigest:digest,
   references,sourceVerification:'operator_provided_unverified',buyerDemandValidated:false,
   realCustomers:null,collectedRevenue:null,releaseApproved:false});
 }
 if(!recipes.some(v=>v.family==='quote-to-order')||!recipes.some(v=>v.family==='inventory-control'))
  fail('OPPORTUNITY_INVALID');
 return recipes;
}
function reportOpportunities(args={}){
 const entries=loadOpportunities(args);
 return {kind:'cross-family-engineering-opportunity-queue',total:entries.length,
  quoteCandidates:entries.filter(v=>v.family==='quote-to-order').length,
  inventoryCandidates:entries.filter(v=>v.family==='inventory-control').length,
  ranked:entries.map(v=>({key:v.key,family:v.family,technicalFitScore:v.technicalFitScore,
   digest:v.proposalDigest,sourceVerification:v.sourceVerification}))
   .sort((a,b)=>b.technicalFitScore-a.technicalFitScore||a.key.localeCompare(b.key)),
  scoreMeaning:'deterministic-structural-fit-not-demand-or-profitability',
  independentBuyerEvidence:false,realCustomers:null,collectedRevenue:null,
  publicDeploymentEnabled:false,paymentsSent:0,transmittedMessages:0,releaseApproved:false};
}
module.exports={loadOpportunities,reportOpportunities};
