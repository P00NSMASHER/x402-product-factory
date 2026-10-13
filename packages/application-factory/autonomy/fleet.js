'use strict';
// Evidence-first, read-only portfolio of local packaged candidates. Never a sales report.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {planCycle}=require('./loop');
const {planRecovery}=require('./supervisor');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const fail=code=>{throw Error(code);};
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function buildFleet({outputRoot,at=new Date().toISOString(),lookbackCycles=24,blueprintDirectory}={}){
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot)||!Number.isSafeInteger(lookbackCycles)||
    lookbackCycles<1||lookbackCycles>64)fail('FLEET_CONFIG_INVALID');
 let current;try{current=planCycle({at,blueprintDirectory});}catch{fail('FLEET_CONFIG_INVALID');}
 const start=Math.max(0,current.cycle-lookbackCycles+1),apps=[];
 for(let cycle=start;cycle<=current.cycle;cycle++){
  const timestamp=new Date(EPOCH+cycle*SLOT).toISOString();
  let plan,review;
  try{
   plan=planCycle({at:timestamp,blueprintDirectory});
   review=planRecovery({at:timestamp,outputRoot,windowCycles:1,blueprintDirectory});
  }catch{fail('FLEET_INTEGRITY_INVALID');}
  if(plan.recipes.length>1)fail('FLEET_INTEGRITY_INVALID');
  const status=review.skippedCompleted===1?'verified':
   review.skippedQuarantined===1?'quarantined':
   review.nextAction==='requires_real_acceptance'?'needs-real-acceptance':
   plan.recipes.length===0?'research-required':'pending';
  const recipe=plan.recipes[0];
  apps.push({cycle,editionId:recipe?.id||null,title:recipe?.title||null,
   state:status,verifiedAcceptance:status==='verified',commercialValidation:'unverified'});
 }
 const count=state=>apps.filter(r=>r.state===state).length;
 return {kind:'autonomous-factory-fleet',version:1,asOf:at,windowCycles:lookbackCycles,
  apps,summary:{verifiedApps:count('verified'),pendingApps:count('pending'),
   quarantinedApps:count('quarantined'),unverifiedFixtures:count('needs-real-acceptance'),
   missingIdeas:count('research-required'),totalInspected:apps.length},
  proofType:'local-source-and-packaged-test-only',transmittedMessages:0,paymentsSent:0,
  outreachEnabled:false,checkoutEnabled:false,marketValidated:false,
  realCustomers:null,collectedRevenue:null,releaseApproved:false};
}
const STYLE=':root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#142d36;background:#f5f8f7}*{box-sizing:border-box}body{margin:0}header{padding:52px max(20px,calc((100vw - 1140px)/2));background:#12313c;color:#fff}main{max-width:1140px;margin:0 auto;padding:32px 20px 55px}h1{font-size:clamp(32px,5vw,54px);letter-spacing:-.05em;margin:10px 0}h2{font-size:24px}.tag{color:#6cdfae;font-size:12px;letter-spacing:.15em;text-transform:uppercase;font-weight:800}.intro{color:#d3e5e3;max-width:780px;line-height:1.6}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.card{border:1px solid #dee8e5;border-radius:16px;background:white;padding:20px}.card strong{font-size:34px;letter-spacing:-.05em;display:block}.card span{font-size:13px;color:#637883}.panel{background:white;border:1px solid #dee8e5;border-radius:16px;padding:22px;margin:23px 0}.table-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:690px}th,td{padding:13px 9px;text-align:left;border-bottom:1px solid #edf0ee;font-size:13px}th{color:#5e7379;text-transform:uppercase;font-size:11px;letter-spacing:.1em}.state{padding:5px 9px;border-radius:20px;background:#e2f1eb;color:#215342;white-space:nowrap;font-weight:700}.muted{color:#637883}.alert{background:#eff5f2;padding:18px;border-radius:12px;line-height:1.6}.footer{font-size:12px;color:#60747c}@media(max-width:680px){header{padding:34px 18px}.panel{padding:15px}main{padding:18px 12px}}';
function renderFleetHtml(model){
 if(!model||model.kind!=='autonomous-factory-fleet'||model.releaseApproved!==false||
    model.marketValidated!==false||model.collectedRevenue!==null||
    model.realCustomers!==null||model.transmittedMessages!==0||model.outreachEnabled!==false||
    !Array.isArray(model.apps))fail('FLEET_INVALID');
 const cssHash=crypto.createHash('sha256').update(STYLE).digest('base64');
 const csp="default-src 'none'; style-src 'sha256-"+cssHash+
   "'; script-src 'none'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'";
 const metrics=[['Verified packages',model.summary.verifiedApps],['Pending builds',model.summary.pendingApps],
  ['Quarantined',model.summary.quarantinedApps],['Research gaps',model.summary.missingIdeas],
  ['Unverified fixtures',model.summary.unverifiedFixtures]];
 const cards=metrics.map(([title,value])=>'<div class="card"><strong>'+escape(value)+'</strong><span>'+escape(title)+'</span></div>').join('');
 const rows=model.apps.map(r=>'<tr><td>'+escape(r.cycle)+'</td><td><b>'+escape(r.title||'No researched edition')+
  '</b><div class="muted">'+escape(r.editionId||'No verified idea')+'</div></td><td><span class="state">'+
  escape(r.state.replaceAll('-',' '))+'</span></td><td>'+escape(r.verifiedAcceptance?'Packaged checks passed':'Not verified')+'</td></tr>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="'+
  escape(csp)+'"><title>Autonomous Factory Fleet</title><style>'+STYLE+'</style></head><body><header>'+
  '<div class="tag">Private engineering operations</div><h1>Autonomous Factory Fleet</h1>'+
  '<p class="intro">Verified candidate builds, missed jobs and research gaps. Implementation checks are not market proof. No customer data, contact, checkout or deployment.</p></header><main>'+
  '<div class="cards">'+cards+'</div><div class="panel"><h2>Build ledger</h2>'+
  '<p class="muted">Source-checked local build artifacts; no paid-buyer or revenue inference.</p>'+
  '<div class="table-scroll"><table><thead><tr><th>Cycle</th><th>App</th><th>State</th><th>Acceptance</th></tr></thead><tbody>'+
  rows+'</tbody></table></div></div><div class="alert">Unverified market demand and security/commercial release remain on hold. A verified build is not a sale, regulatory certification or production deployment.</div>'+
  '<p class="footer">Read-only fleet snapshot · '+escape(model.asOf)+' · All external outreach and billing disabled.</p></main></body></html>';
}
module.exports={buildFleet,renderFleetHtml};
