"use strict";

const OFAC_BASE="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports";
const DEFAULT_USER_AGENT="x402-ofac-screen/1.0 https://ofac-sdn-name-screen-x402-m9ko96.v2.appdeploy.ai";

function parseCsv(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
  else if(ch==='"')quoted=true;
  else if(ch===","){row.push(field);field="";}
  else if(ch==="\n"){row.push(field.replace(/\r$/,""));if(row.some(v=>v.length))rows.push(row);row=[];field="";}
  else field+=ch;
 }
 if(field.length||row.length){row.push(field.replace(/\r$/,""));if(row.some(v=>v.length))rows.push(row);}
 return rows;
}
function clean(v){if(!v||v==="-0-")return null;return String(v).trim()||null;}
function normalizeName(v){return String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 ]+/g," ").replace(/\s+/g," ").trim();}
function sortedTokens(v){return normalizeName(v).split(" ").filter(Boolean).sort().join(" ");}
function levenshtein(a,b){if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;const prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++){const cost=a[i-1]===b[j-1]?0:1;next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+cost);}for(let j=0;j<next.length;j++)prev[j]=next[j];}return prev[b.length];}
function jaccardTokens(a,b){const aa=new Set(normalizeName(a).split(" ").filter(Boolean)),bb=new Set(normalizeName(b).split(" ").filter(Boolean));if(!aa.size||!bb.size)return 0;let shared=0;for(const t of aa)if(bb.has(t))shared++;return shared/new Set([...aa,...bb]).size;}
function scoreName(query,candidate){const q=normalizeName(query),c=normalizeName(candidate);if(!q||!c)return 0;if(q===c)return 100;if(sortedTokens(q)===sortedTokens(c))return 99;const contains=q.length>=5&&c.length>=5&&(q.includes(c)||c.includes(q))?94:0;const maxLen=Math.max(q.length,c.length);const edit=maxLen?(1-levenshtein(q,c)/maxLen)*100:0;const qs=sortedTokens(q),cs=sortedTokens(c);const editSorted=maxLen?(1-levenshtein(qs,cs)/Math.max(qs.length,cs.length,1))*100:0;return Math.max(contains,edit,editSorted,jaccardTokens(q,c)*100);}

async function fetchText(fetchImpl,url,userAgent,timeoutMs){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const r=await fetchImpl(url,{headers:{"user-agent":userAgent,accept:"text/csv,*/*"},redirect:"follow",signal:controller.signal});if(!r||r.ok!==true){const e=new Error("ofac_http_"+(r?.status??"unknown"));e.code="SOURCE_HTTP_ERROR";throw e;}return await r.text();}
 finally{clearTimeout(timer);}
}

function createOfacNameAdapter({fetchImpl=fetch,timeoutMs=15000,userAgent=DEFAULT_USER_AGENT}={}){
 let cache=null;
 async function load(){if(cache)return cache;const [sdn,alt]=await Promise.all([fetchText(fetchImpl,OFAC_BASE+"/SDN.CSV",userAgent,timeoutMs),fetchText(fetchImpl,OFAC_BASE+"/ALT.CSV",userAgent,timeoutMs)]);const map=new Map();
  for(const cols of parseCsv(sdn)){const uid=String(cols[0]??"").trim(),name=String(cols[1]??"").trim();if(uid&&name)map.set(uid,{uid,name,type:clean(cols[2]),program:clean(cols[3]),title:clean(cols[4]),remarks:clean(cols[11]),aliases:[]});}
  for(const cols of parseCsv(alt)){const uid=String(cols[0]??"").trim(),name=String(cols[3]??"").trim(),entry=map.get(uid);if(entry&&name)entry.aliases.push({type:clean(cols[2]),name,remarks:clean(cols[4])});}
  cache=[...map.values()];if(!cache.length){const e=new Error("ofac_empty_dataset");e.code="SOURCE_CONTRACT_INVALID";throw e;}return cache;}
 return {async lookup({name,minScore=90,limit=3}){const query=String(name||"").trim().replace(/\s+/g," ");if(query.length<2||query.length>160){const e=new Error("invalid_name");e.code="INVALID_INPUT";throw e;}if(!Number.isInteger(minScore)||minScore<70||minScore>100){const e=new Error("invalid_min_score");e.code="INVALID_INPUT";throw e;}const bounded=Math.max(1,Math.min(Number(limit)||3,10)),candidates=[];
  for(const entry of await load()){let best=scoreName(query,entry.name),matchedOn="primary",matchedName=entry.name;for(const alias of entry.aliases){const s=scoreName(query,alias.name);if(s>best){best=s;matchedOn="alias";matchedName=alias.name;}}if(best>=minScore)candidates.push({uid:entry.uid,primaryName:entry.name,type:entry.type,program:entry.program,title:entry.title,remarks:entry.remarks,matchedOn,matchedName,score:Math.round(best)});}
  candidates.sort((a,b)=>b.score-a.score||a.primaryName.localeCompare(b.primaryName));
  return {available:true,query,minScore,totalCandidatesAboveThreshold:candidates.length,candidates:candidates.slice(0,bounded),provenance:{source:"U.S. Treasury OFAC Specially Designated Nationals (SDN) List",files:["SDN.CSV","ALT.CSV"],base:OFAC_BASE}};
 }};
}
module.exports={OFAC_BASE,DEFAULT_USER_AGENT,parseCsv,normalizeName,scoreName,createOfacNameAdapter};
