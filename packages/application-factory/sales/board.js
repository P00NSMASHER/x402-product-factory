'use strict';
// Read-only commercial-control view over signed organization research and independently gated local evidence.
// Never sends outreach, collects contacts, issues a paid charge, or unlocks deployment.
const crypto=require('node:crypto');
const {validateRecipe}=require('../kernel');
const fail=()=>{throw new Error('BOARD_INVALID');};
const safeId=v=>typeof v==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v)&&v.length<=60;
const safeCount=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000;
const date=v=>typeof v==='string'&&/^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(v)&&
 Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(Date.parse(v+'T00:00:00Z')).toISOString().slice(0,10)===v;
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const expectedActions=new Set(['review_sources','review_outreach_draft','review_followup','review_buyer_reply']);
function emptyEvidence(recipeId){
 return {recipeId,stage:'research',nextAction:'collect_qualified_interviews',
  interviews:0,paidPilotBuyers:0,repeatBuyers:0,deliveredBuyers:0,refundedBuyers:0,
  operatorsReportedGrossCents:0,operatorsReportedRefundCents:0,contributionCents:null,
  evidenceLabel:'No operator-attested external evidence recorded',
  realCustomers:null,collectedRevenue:null,releaseApproved:false,autoDeploy:false,
  checkoutEnabled:false,outreachEnabled:false};
}
function checkEvidence(r,id){
 if(!r||r.recipeId!==id||!['research','pilot_review','delivery_review','economics_review','scale_review'].includes(r.stage)||
   ![r.interviews,r.paidPilotBuyers,r.repeatBuyers,r.deliveredBuyers,r.refundedBuyers].every(safeCount)||
   !Number.isSafeInteger(r.operatorsReportedGrossCents)||r.operatorsReportedGrossCents<0||
   !Number.isSafeInteger(r.operatorsReportedRefundCents)||r.operatorsReportedRefundCents<0||
   !(r.contributionCents===null||Number.isSafeInteger(r.contributionCents))||
   typeof r.evidenceLabel!=='string'||r.evidenceLabel.length>160||
   r.realCustomers!==null||r.collectedRevenue!==null||r.releaseApproved!==false||
   r.autoDeploy!==false||r.checkoutEnabled!==false||r.outreachEnabled!==false||
   typeof r.nextAction!=='string'||!/^[a-z_]{4,60}$/.test(r.nextAction))fail();
 return r;
}
function buildSalesBoard({campaign,proofBook=null,recipes,asOf}={}){
 if(!date(asOf)||!Array.isArray(recipes)||recipes.length<1||recipes.length>100||
   !campaign||typeof campaign.accounts!=='function'||typeof campaign.report!=='function'||typeof campaign.nextActions!=='function')fail();
 const catalog=new Map();
 for(const entry of recipes){const recipe=validateRecipe(entry);if(catalog.has(recipe.id))fail();catalog.set(recipe.id,recipe);}
 const accounts=campaign.accounts(),campaignReport=campaign.report(),tasks=campaign.nextActions();
 if(!Array.isArray(accounts)||accounts.length>300||!Array.isArray(tasks)||tasks.length>300||
   !campaignReport||campaignReport.targets!==accounts.length||campaignReport.releaseApproved!==false||
   campaignReport.transmittedMessages!==0||campaignReport.outreachEnabled!==false||
   campaignReport.collectedRevenue!==null||campaignReport.realCustomers!==null)fail();
 const unique=new Set();
 for(const a of accounts){
   if(!a||typeof a.company!=='string'||a.company.length>100||
     typeof a.domain!=='string'||!/^[a-z0-9.-]{3,253}$/.test(a.domain)||
     unique.has(a.domain)||!catalog.has(a.recipeId)||!safeCount(a.researchPriority)||
     typeof a.homepage!=='string'||a.homepage!=='https://'+a.domain+'/'||
     a.dataSource!=='operator_provided_unverified'||a.demandVerified!==false||
     a.sendEnabled!==false||a.qualifiedBuyer!==false||
     a.priorityMeaning!=='research_triage_only_not_purchase_probability'||
     !['new','reviewed','reported_outreach','reported_reply','reported_pilot_interest','suppressed'].includes(a.stage)||
     !(a.action===null||expectedActions.has(a.action)))fail();
   unique.add(a.domain);
 }
 const actions=[];
 const byDomain=new Map(accounts.map(a=>[a.domain,a]));
 for(const t of tasks){
   const a=byDomain.get(t.domain);
   if(!a||a.recipeId!==t.recipeId||!expectedActions.has(t.action)||t.action!==a.action||
      a.stage==='suppressed'||a.stage==='reported_pilot_interest'||
      t.sendEnabled!==false||t.manualReviewRequired!==true)fail();
   actions.push({domain:a.domain,company:a.company,recipeId:a.recipeId,
     action:t.action,researchPriority:a.researchPriority,manualReviewRequired:true,sendEnabled:false});
 }
 actions.sort((a,b)=>b.researchPriority-a.researchPriority||a.domain.localeCompare(b.domain));
 let evidence=[];
 if(proofBook!==null){
   if(typeof proofBook.allReports!=='function')fail();
   evidence=proofBook.allReports();
   if(!Array.isArray(evidence)||evidence.length!==catalog.size)fail();
 }
 const proofById=new Map(evidence.map(e=>[e.recipeId,e]));
 if(proofById.size!==evidence.length||[...proofById.keys()].some(id=>!catalog.has(id)))fail();
 const productRows=[...catalog.values()].map(r=>{
   const e=checkEvidence(proofById.get(r.id)||emptyEvidence(r.id),r.id);
   const subset=accounts.filter(a=>a.recipeId===r.id);
   return {id:r.id,title:r.title,buyer:r.buyer,outcome:r.outcome,
     organizations:subset.length,operatorReportedInterest:subset.filter(a=>a.stage==='reported_pilot_interest').length,
     operatorReportedReplies:subset.filter(a=>['reported_reply','reported_pilot_interest'].includes(a.stage)).length,
     suppressed:subset.filter(a=>a.stage==='suppressed').length,
     qualifiedConversations:e.interviews,operatorAttestedPaidPilots:e.paidPilotBuyers,
     commercialStage:e.stage,commercialEvidence:'operator-attested; not independently audited',
     nextCommercialAction:e.nextAction,contributionCents:e.contributionCents,
     realCustomers:null,collectedRevenue:null,releaseApproved:false};
 });
 return {kind:'operator-sales-command-center',schemaVersion:1,asOf,stage:'precommercial',
   mode:'private-read-only',accounts:accounts.map(a=>({...a})),actions,recipes:productRows,
   stats:{publicOrganizationsResearched:accounts.length,
     operatorReportedOutreach:campaignReport.operatorReportedOutreach,
     operatorReportedReplies:campaignReport.operatorReportedReplies,
     operatorReportedPilotInterest:campaignReport.operatorReportedPilotInterest,
     suppressed:campaignReport.suppressed,
     qualifiedConversations:productRows.reduce((n,r)=>n+r.qualifiedConversations,0),verifiedBuyers:0},
   evidenceLabel:'Company sources and outreach stages are operator-reported; market claims require separately reviewed primary evidence.',
   verifiedPaidPilotBuyers:null,realCustomers:null,collectedRevenue:null,
   transmittedMessages:0,paymentsSent:0,outreachEnabled:false,checkoutEnabled:false,
   autoDeploy:false,releaseApproved:false};
}
const STYLES=':root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#142a32;background:#f5f8f7;font-synthesis:none}*{box-sizing:border-box}body{margin:0}main{max-width:1210px;margin:auto;padding:30px 22px 72px}header{background:#0c2430;color:white;padding:54px max(22px,calc((100vw - 1210px)/2))}h1{font-size:clamp(32px,5vw,58px);letter-spacing:-.05em;margin:8px 0 16px}h2{font-size:21px;letter-spacing:-.03em}.eyebrow{font-size:12px;letter-spacing:.17em;text-transform:uppercase;color:#71d8b4;font-weight:800}.intro{color:#d0e4de;line-height:1.65;max-width:740px}.pill{display:inline-block;background:#d9eee4;color:#205949;padding:7px 12px;border-radius:20px;font-size:12px;font-weight:750}.muted{color:#60737a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:13px;margin:24px 0}.metric{background:white;border:1px solid #dee8e5;border-radius:16px;padding:22px}.metric strong{display:block;font-size:32px;letter-spacing:-.05em}.metric span{font-size:12px;color:#5c7379}.section{background:white;border:1px solid #dee8e5;border-radius:18px;padding:24px;margin:18px 0;overflow:hidden}table{width:100%;border-collapse:collapse;min-width:680px}th{text-align:left;color:#60737a;font-size:11px;letter-spacing:.09em;padding:13px;border-bottom:1px solid #e0e9e7;text-transform:uppercase}td{padding:14px 13px;font-size:13px;border-bottom:1px solid #edf2ef}a{color:#146549;word-break:break-word}small{color:#687c82}.scroll{overflow:auto}ul{line-height:1.85}.warning{border:1px solid #d9e4db;padding:15px 18px;border-radius:12px;background:#f1f7f4;margin:22px 0}.footer{color:#687c82;font-size:12px;margin-top:30px}@media(max-width:700px){main{padding:18px 12px 50px}header{padding:38px 18px}.section{padding:16px}}';
const ACTIONS={review_sources:'Review research source',review_outreach_draft:'Review unsent discovery draft',
 review_followup:'Review optional follow-up',review_buyer_reply:'Review buyer reply'};
function renderSalesBoard(b){
 if(!b||b.kind!=='operator-sales-command-center'||b.releaseApproved!==false||b.transmittedMessages!==0||b.checkoutEnabled!==false)fail();
 const csp="default-src 'none'; style-src 'sha256-"+crypto.createHash('sha256').update(STYLES).digest('base64')+
 "'; script-src 'none'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'";
 const metrics=[['Organizations researched',b.stats.publicOrganizationsResearched],['Operator-reported replies',b.stats.operatorReportedReplies],
   ['Operator-reported interest',b.stats.operatorReportedPilotInterest],['Qualified discussions (attested)',b.stats.qualifiedConversations],
   ['Verified customers',0],['Messages sent',0]].map(([name,value])=>'<div class="metric"><strong>'+escape(value)+'</strong><span>'+escape(name)+'</span></div>').join('');
 const products=b.recipes.map(r=>'<tr><td><b>'+escape(r.title)+'</b></td><td>'+r.organizations+'</td><td>'+r.qualifiedConversations+
 '</td><td>'+escape(r.commercialStage)+'</td><td>'+escape(r.nextCommercialAction.replaceAll('_',' '))+'</td></tr>').join('');
 const actions=b.actions.slice(0,75).map((a,i)=>'<tr><td>'+String(i+1)+'</td><td><b>'+escape(a.company)+'</b><div><small>'+escape(a.domain)+'</small></div></td><td>'+escape(a.recipeId)+'</td><td>'+escape(ACTIONS[a.action])+
 '</td><td><span class="pill">Review only</span></td></tr>').join('');
 const accounts=b.accounts.slice(0,150).map(a=>'<tr><td>'+escape(a.company)+'</td><td><a target="_blank" rel="noreferrer noopener" href="'+escape(a.homepage)+'">'+escape(a.domain)+'</a></td><td>'+
 escape(a.recipeId)+'</td><td>'+escape(a.stage.replaceAll('_',' '))+'</td><td>'+escape(a.researchPriority)+'</td></tr>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="'+escape(csp)+'"><title>Sales Command Center - Internal Review Only</title><style>'+STYLES+'</style></head><body>'+
 '<header><div class="eyebrow">Product Factory / Sales operations</div><h1>Sales command center</h1><p class="intro">One private review board for three manufactured applications. Research, outreach reports, and operator-attested external evidence remain distinct. No live outreach, verified revenue, or deployment is authorized.</p><span class="pill">Research stage · Not approved for sending</span></header>'+
 '<main><div class="grid">'+metrics+'</div><div class="warning"><b>Noncommercial review only.</b> Source notes have not been independently confirmed. No messages have been sent through the factory. Reported interest is not a sale; paid pilots and contribution need independent reconciliation. Commercial release remains on HOLD.</div>'+
 '<section class="section"><h2>Which app earns the next buyer interview?</h2><div class="scroll"><table><thead><tr><th>Edition</th><th>Research</th><th>Discussions</th><th>Stage</th><th>Next commercial action</th></tr></thead><tbody>'+products+'</tbody></table></div></section>'+
 '<section class="section"><h2>Priority operator review queue</h2><p class="muted">No live outreach or auto-sends. Suppressed organizations never appear in this queue.</p><div class="scroll"><table><thead><tr><th>#</th><th>Organization</th><th>Edition</th><th>Operator task</th><th>Permission</th></tr></thead><tbody>'+actions+'</tbody></table></div></section>'+
 '<section class="section"><h2>Research accounts</h2><p class="muted">Public-organization website references; priorities mean research triage, not buying probability. Showing up to 150 accounts.</p><div class="scroll"><table><thead><tr><th>Public organization</th><th>Homepage</th><th>Edition</th><th>Reported stage</th><th>Research score</th></tr></thead><tbody>'+accounts+'</tbody></table></div></section>'+
 '<p class="footer">Local read-only export · '+escape(b.asOf)+' · All contact, checkout, billing, scheduling, and public access remain disabled. No live outreach. This file does not contain personal contact details.</p></main></body></html>';
}
function renderReviewBrief(b){
 if(!b||b.kind!=='operator-sales-command-center'||b.releaseApproved!==false)fail();
 const lines=['# Buyer conversion review — internal only','',
 'Not approved for sending, payment, or deployment. Research sources are operator-provided and not independently confirmed.','',
 'Date: '+b.asOf,'Public organizations researched: '+b.stats.publicOrganizationsResearched,
 'Operator-reported replies: '+b.stats.operatorReportedReplies,
 'Operator-reported pilot interest: '+b.stats.operatorReportedPilotInterest,
 'Operator-attested qualified conversations: '+b.stats.qualifiedConversations,
 'Independently verified buyers: 0','Verified collected revenue: unavailable','',
 '## Priority work for the operator',''];
 for(const a of b.actions.slice(0,50))lines.push('- '+a.company+' ['+a.recipeId+']: '+ACTIONS[a.action]+'. Manual review required; no messages sent.');
 if(!b.actions.length)lines.push('- No permissible review actions currently due.');
 lines.push('','## Release requirements','- Confirm source and organization eligibility.',
 '- Review sender identity, local contact law, and unsubscribe handling before any outreach.',
 '- Confirm a real buyer problem in a consented conversation.',
 '- Obtain actual paid commitment and completed outcomes before claiming demand.',
 '- Obtain independent security, privacy, financial and production approvals.','');
 return lines.join('\n');
}
module.exports={buildSalesBoard,renderSalesBoard,renderReviewBrief};
