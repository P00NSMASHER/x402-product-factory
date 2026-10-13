'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const recipes=require('../recipes.json'),{createCampaign}=require('../growth/campaign'),{openProofBook}=require('../growth/book');
let board;try{board=require('./board');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;board={};}
const asOf='2026-10-13',KEY=Buffer.alloc(32,33),REVIEW=Buffer.alloc(32,47),CHAIN=Buffer.alloc(32,53);
const candidate=(name,domain,recipeId='supplier-desk')=>({company:name,homepage:'https://'+domain,recipeId,
 observations:[{url:'https://'+domain+'/about',observedOn:asOf,signal:'business_category',note:'Public company page describes its products and services.'}]});
function env(t){assert.equal(typeof board.buildSalesBoard,'function','sales board missing');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-sales-board-')),opened=[];let current=asOf;
 const open=()=>{const c=createCampaign({filename:path.join(dir,'campaign.json'),key:KEY,recipes,
   clock:()=>Date.parse(current+'T12:00:00Z')});opened.push(c);return c;};
 const c=open();t.after(()=>{opened.forEach(v=>v.close());fs.rmSync(dir,{force:true,recursive:true});});
 const proof=()=>openProofBook({filename:path.join(dir,'proof.json'),chainKey:CHAIN,
  reviewKeyHash:crypto.createHash('sha256').update(REVIEW).digest('hex'),recipes});
 return {c,dir,open,proof,date:v=>current=v};}
const record=(c,domain,kind,key)=>c.record({domain,kind,key});
test('research accounts become an operator-only sales board with honest unknown demand',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org'),candidate('Riverbend Maintenance','maintenance.example.org','contractor-renewals'),candidate('Cedar Creative','creative.example.org','agency-intake')]);
 const b=board.buildSalesBoard({campaign:x.c,recipes,asOf});
 assert.equal(b.accounts.length,3);assert.equal(b.stats.publicOrganizationsResearched,3);
 assert.equal(b.stats.qualifiedConversations,0);assert.equal(b.stats.operatorReportedOutreach,0);
 assert.equal(b.realCustomers,null);assert.equal(b.collectedRevenue,null);assert.equal(b.releaseApproved,false);
 assert.equal(b.transmittedMessages,0);assert.equal(b.checkoutEnabled,false);assert.equal(b.outreachEnabled,false);
 assert.equal(b.verifiedPaidPilotBuyers,null);assert.equal(b.actions.length,3);
 assert.ok(b.actions.every(a=>a.action==='review_sources'&&a.manualReviewRequired===true));
 assert.ok(b.accounts.every(a=>a.demandVerified===false&&a.dataSource==='operator_provided_unverified'));
});
test('reported interest is not independently verified demand or revenue',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 for(const [k,n] of ['reviewed','reported_outreach','reported_reply','reported_pilot_interest'].entries())record(x.c,'supply.example.org',n,'e'+k);
 const b=board.buildSalesBoard({campaign:x.c,recipes,asOf});
 assert.equal(b.stats.operatorReportedPilotInterest,1);assert.equal(b.stats.verifiedBuyers,0);
 assert.equal(b.recipes.find(r=>r.id==='supplier-desk').commercialStage,'research');
 assert.equal(b.accounts[0].stage,'reported_pilot_interest');assert.equal(b.actions.length,0);
});
test('suppressed research cannot produce followup review actions after import',t=>{
 const x=env(t);x.c.importTargets([candidate('Suppressed','stopped.example.org'),candidate('Declined','declined.example.org')]);
 record(x.c,'stopped.example.org','do_not_contact','stop-a');record(x.c,'declined.example.org','not_interested','stop-b');
 x.c.importTargets([candidate('Suppressed','stopped.example.org')]);
 const b=board.buildSalesBoard({campaign:x.c,recipes,asOf});
 assert.equal(b.stats.suppressed,2);assert.equal(b.actions.length,0);
 assert.ok(b.accounts.every(a=>a.stage==='suppressed'&&a.action===null));
});
test('seven-day followup is a manual task and not automatic delivery',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 record(x.c,'supply.example.org','reviewed','a');record(x.c,'supply.example.org','reported_outreach','b');
 assert.equal(board.buildSalesBoard({campaign:x.c,recipes,asOf}).actions.length,0);
 x.date('2026-10-20');const b=board.buildSalesBoard({campaign:x.c,recipes,asOf:'2026-10-20'});
 assert.equal(b.actions[0].action,'review_followup');assert.equal(b.actions[0].sendEnabled,false);
 assert.equal(b.transmittedMessages,0);
});
test('attested real-world conversations remain operator claims, not independent sales',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 const p=x.proof();p.record({recipeId:'supplier-desk',kind:'qualified_conversation',origin:'external',
  buyerHash:'a'.repeat(64),referenceHash:'b'.repeat(64),source:'interview_record',cents:null});
 p.attest(1,REVIEW);
 const b=board.buildSalesBoard({campaign:x.c,recipes,asOf,proofBook:p}),r=b.recipes.find(v=>v.id==='supplier-desk');
 assert.equal(r.qualifiedConversations,1);assert.equal(r.commercialStage,'research');
 assert.equal(b.stats.verifiedBuyers,0);assert.equal(b.collectedRevenue,null);
});
test('synthetic buyer activity does not contribute to demand evidence',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 const p=x.proof();p.record({recipeId:'supplier-desk',kind:'qualified_conversation',origin:'synthetic',
  buyerHash:'a'.repeat(64),referenceHash:'b'.repeat(64),source:'interview_record',cents:null});
 assert.equal(board.buildSalesBoard({campaign:x.c,recipes,asOf,proofBook:p}).stats.qualifiedConversations,0);
});
test('tampered signed campaign must be rejected before producing the board',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 const filename=path.join(x.dir,'campaign.json');fs.writeFileSync(filename,fs.readFileSync(filename,'utf8').replace('Northstar Supply','Forged Supply'));
 assert.throws(()=>board.buildSalesBoard({campaign:x.c,recipes,asOf}),/CAMPAIGN_TAMPERED/);
});
test('invalid recipe catalogue and forged commercial approval fail closed',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 assert.throws(()=>board.buildSalesBoard({campaign:x.c,recipes:[...recipes,recipes[0]],asOf}),/BOARD_INVALID/);
 assert.throws(()=>board.buildSalesBoard({campaign:x.c,recipes,asOf:'tomorrow'}),/BOARD_INVALID/);
 assert.throws(()=>board.buildSalesBoard({campaign:x.c,recipes,asOf,proofBook:{allReports(){return [{recipeId:'supplier-desk',releaseApproved:true}];}}}),/BOARD_INVALID/);
});
test('300 orgs are bounded research prospects, not estimated sales',t=>{
 const x=env(t);x.c.importTargets(Array.from({length:300},(_,i)=>candidate('Org '+i,'org'+i+'.example.org',recipes[i%3].id)));
 const b=board.buildSalesBoard({campaign:x.c,recipes,asOf});
 assert.equal(b.accounts.length,300);assert.equal(b.actions.length,300);
 assert.equal(b.stats.verifiedBuyers,0);assert.equal(b.stage,'precommercial');
 assert.ok(b.accounts.every(a=>a.priorityMeaning==='research_triage_only_not_purchase_probability'));
});
test('HTML and reviewer brief are static, escaped and not outbound workflows',t=>{
 const x=env(t);x.c.importTargets([candidate("Acme's Supply",'supply.example.org')]);
 const b=board.buildSalesBoard({campaign:x.c,recipes,asOf});
 const html=board.renderSalesBoard(b);assert.match(html,/<h1>Sales command center<\/h1>/);
 assert.match(html,/Acme&#39;s Supply/);assert.match(html,/Content-Security-Policy/);
 assert.doesNotMatch(html,/<script\b|<form\b|fetch\(|XMLHttpRequest|mailto:|onerror=|onload=/i);
 assert.match(html,/Not approved for sending|No live outreach/i);
 assert.match(board.renderReviewBrief(b),/Review research source/);
 assert.equal(b.actions[0].sendEnabled,false);assert.equal(board.renderSalesBoard(b),html);
});
test('read-only accounts snapshot is not a campaign mutation channel',t=>{
 const x=env(t);x.c.importTargets([candidate('Northstar Supply','supply.example.org')]);
 const a=x.c.accounts();a[0].company='Forged';a[0].stage='reported_pilot_interest';
 const b=x.c.accounts();assert.equal(b[0].company,'Northstar Supply');assert.equal(b[0].stage,'new');
 assert.equal(b[0].sendEnabled,false);assert.equal(Object.hasOwn(b[0],'email'),false);
});
