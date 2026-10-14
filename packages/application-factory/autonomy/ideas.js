'use strict';
// Source-controlled, additive workflow hypotheses. Never proof of purchases or executable instructions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateRecipe}=require('../kernel');
const START=Date.parse('2026-10-13T00:00:00Z'),SLOT=6*60*60*1000;
const fail=code=>{throw new Error(code);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const safeText=(s,min=23,max=260)=>typeof s==='string'&&s.length>=min&&s.length<=max&&
 !/[<>\x00-\x1f\x7f]/.test(s)&&!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(s)&&
 !/\b(?:\+?1[ -.])?\(?\d{3}\)?[ -.]*\d{3}[ -.]*\d{4}\b/.test(s);
function date(s){
 if(typeof s!=='string'||!/^20\d\d-\d\d-\d\d$/.test(s))return null;
 const d=Date.parse(s+'T00:00:00Z');return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===s?d:null;
}
function url(raw){
 if(typeof raw!=='string'||raw.length>450||raw.trim()!==raw)return false;
 let u;try{u=new URL(raw);}catch{return false;}
 const host=u.hostname.toLowerCase();
 return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&
 host.includes('.')&&host.length<=253&&/^[a-z0-9.-]+$/.test(host)&&
 !host.startsWith('.')&&!host.endsWith('.')&&!host.includes('..')&&
 !/^(?:\d+\.){3}\d+$/.test(host)&&!host.startsWith('xn--')&&
 !/(?:^|\.)(?:localhost|local|test|invalid|internal|onion)$/.test(host)&&
 host.split('.').every(part=>part&&part.length<=63&&!part.startsWith('-')&&!part.endsWith('-'));
}
function fingerprint(r){return JSON.stringify([r.defaultDueDays,r.reminderEveryDays,r.renewalWindowDays,
  r.requirements.map(d=>[d.id,d.renewable]).sort(([a],[b])=>a.localeCompare(b))]);}
function validateIdea(raw,filename,baseline,accepted){
 if(!exact(raw,['schemaVersion','cycle','hypothesis','sources','recipe'])||raw.schemaVersion!==1||
   !Number.isSafeInteger(raw.cycle)||raw.cycle<72||raw.cycle>100000||filename!=='cycle-'+raw.cycle+'.json'||
   !exact(raw.hypothesis,['customerProblem','buyerTrigger','expensiveFailure','discoveryQuestion','differentiator','status'])||
   raw.hypothesis.status!=='unverified'||
   !Object.entries(raw.hypothesis).filter(([k])=>k!=='status').every(([,v])=>safeText(v))||
   !Array.isArray(raw.sources)||raw.sources.length!==2)fail('IDEA_INVALID');
 const slot=START+raw.cycle*SLOT,usedSources=new Set();
 for(const source of raw.sources){
   if(!exact(source,['url','observedOn'])||!url(source.url)||usedSources.has(source.url))fail('IDEA_INVALID');
   usedSources.add(source.url);
   const observed=date(source.observedOn);
   if(observed===null||observed>slot||slot-observed>180*86400000)fail('IDEA_INVALID');
 }
 let recipe;try{recipe=validateRecipe(raw.recipe);}catch{fail('IDEA_INVALID');}
 if(recipe.requirements.some(r=>/[<>\x00-\x1f]/.test(r.label)))fail('IDEA_INVALID');
 if(recipe.requirements.length<4||!recipe.requirements.some(r=>r.renewable)||
  baseline.some(prior=>prior.id===recipe.id)||accepted.some(prior=>prior.recipe.id===recipe.id)||
  accepted.some(prior=>prior.cycle===raw.cycle))fail('IDEA_DUPLICATE');
 const previous=[...baseline,...accepted.map(row=>row.recipe)],currentIds=new Set(recipe.requirements.map(r=>r.id));
 for(const prior of previous){
  if(fingerprint(prior)===fingerprint(recipe))fail('IDEA_DUPLICATE');
  const overlap=prior.requirements.filter(req=>currentIds.has(req.id)).length;
  if(currentIds.size-overlap<2)fail('IDEA_DUPLICATE');
 }
 const digest=crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 return {cycle:raw.cycle,recipe:JSON.parse(JSON.stringify(recipe)),hypothesis:{...raw.hypothesis},
  sources:raw.sources.map(v=>({...v})),digest,sourceVerification:'operator_provided_unverified',
  marketValidated:false,realCustomers:null,collectedRevenue:null,releaseApproved:false};
}
function loadIdeaBacklog({directory=path.join(__dirname,'ideas'),existingRecipes}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!Array.isArray(existingRecipes)||existingRecipes.length<1)fail('IDEA_INVALID');
 const baseline=existingRecipes.map(r=>{try{return validateRecipe(r);}catch{fail('IDEA_INVALID');}});
 if(!fs.existsSync(directory))return [];
 const dirInfo=fs.lstatSync(directory);
 if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink()||fs.realpathSync(directory)!==path.resolve(directory))fail('IDEA_PATH_UNSAFE');
 const names=fs.readdirSync(directory).sort();if(names.length>1600)fail('IDEA_CAPACITY');
 const accepted=[];
 for(const name of names){
  if(name==='README.md'||name==='.gitkeep')continue;
  if(!/^cycle-[1-9]\d*\.json$/.test(name))fail('IDEA_INVALID');
  const filename=path.join(directory,name),stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink())fail('IDEA_PATH_UNSAFE');
  if(stat.size<1||stat.size>8192)fail('IDEA_INVALID');
  let value;try{value=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail('IDEA_INVALID');}
  accepted.push(validateIdea(value,name,baseline,accepted));
 }
 return accepted.sort((a,b)=>a.cycle-b.cycle).map(row=>JSON.parse(JSON.stringify(row)));
}
module.exports={loadIdeaBacklog,fingerprint};
