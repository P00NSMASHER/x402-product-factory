'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const recipes=require('../recipes.json'),{createCampaign}=require('../growth/campaign'),{openProofBook}=require('../growth/book');
let main;try{({main}=require('../../../scripts/build-sales-command-center'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const ASOF='2026-10-13',CAMPAIGN_KEY=Buffer.alloc(32,19),PROOF_KEY=Buffer.alloc(32,29),REVIEW=Buffer.alloc(32,39);
function input(name,domain,recipeId='supplier-desk'){return {company:name,homepage:'https://'+domain,recipeId,observations:[
 {url:'https://'+domain+'/about',observedOn:ASOF,signal:'business_category',note:'Public website describes the company products and its services.'}]};}
function env(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-sales-cli-'));
 const key=path.join(root,'campaign-key.txt'),proofKey=path.join(root,'proof-key.txt'),state=path.join(root,'campaign.json');
 fs.writeFileSync(key,CAMPAIGN_KEY.toString('hex')+'\n',{mode:0o600});
 fs.writeFileSync(proofKey,PROOF_KEY.toString('hex')+'\n',{mode:0o600});
 const campaign=createCampaign({filename:state,key:CAMPAIGN_KEY,recipes,clock:()=>Date.parse(ASOF+'T12:00:00Z')});
 const candidates=[input("Northstar Supply","northstar.example.org"),input('Ridgeview Maintenance','ridgeview.example.org','contractor-renewals'),input('Cedar Agency','cedar.example.org','agency-intake')];
 campaign.importTargets(candidates);
 t.after(()=>{campaign.close();fs.rmSync(root,{recursive:true,force:true});});
 const args=(output=path.join(root,'sales-board'))=>['build','--campaign',state,'--campaign-key-file',key,
 '--output-dir',output,'--as-of',ASOF];
 return {root,campaign,key,proofKey,state,args};
}
test('command exports a readable actionable signed-source board without sending anything',t=>{
 const x=env(t);assert.equal(typeof main,'function','sales desk CLI missing');const result=main(x.args());
 assert.equal(result.kind,'sales-board-export');assert.equal(result.researched,3);
 assert.equal(result.actions,3);assert.equal(result.transmittedMessages,0);assert.equal(result.collectedRevenue,null);
 assert.equal(result.releaseApproved,false);
 const out=x.args().at(-3),files=['index.html','board.json','review-brief.md','integrity.json'];
 for(const name of files)assert.equal(fs.existsSync(path.join(out,name)),true);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'integrity.json'),'utf8'));
 for(const name of files.slice(0,3))assert.equal(manifest.artifacts[name],
  crypto.createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex'));
 const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 assert.match(html,/Sales command center/);assert.doesNotMatch(html,/mailto:|person@company\.org|localStorage|<script\b/i);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'board.json'),'utf8')).stats.publicOrganizationsResearched,3);
 assert.equal(fs.readFileSync(path.join(out,'board.json')).includes(CAMPAIGN_KEY),false);
});
test('suppression persists and generates zero tasks for suppressed public organizations',t=>{
 const x=env(t);x.campaign.record({domain:'northstar.example.org',kind:'do_not_contact',key:'suppress'});
 const result=main(x.args());assert.equal(result.actions,2);
 const board=JSON.parse(fs.readFileSync(path.join(x.root,'sales-board','board.json'),'utf8'));
 assert.equal(board.stats.suppressed,1);
 assert.equal(board.actions.some(a=>a.domain==='northstar.example.org'),false);
});
test('existing output directories cannot be overwritten and invalid argument shapes fail closed',t=>{
 const x=env(t),args=x.args();assert.equal(typeof main,'function');
 main(args);const old=fs.readFileSync(path.join(x.root,'sales-board','board.json'));
 assert.throws(()=>main(args),/OUTPUT_EXISTS/);
 assert.deepEqual(fs.readFileSync(path.join(x.root,'sales-board','board.json')),old);
 assert.throws(()=>main(['build','--campaign',x.state]),/USAGE_INVALID/);
 assert.throws(()=>main([...args,'--send','yes']),/USAGE_INVALID/);
 assert.throws(()=>main([...args,'--as-of','2026-10-13']),/USAGE_INVALID/);
});
test('fake, missing or symlinked campaign keys and source files fail before creating the output',t=>{
 const x=env(t),args=x.args();const wrong=path.join(x.root,'wrong-key');
 fs.writeFileSync(wrong,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 assert.throws(()=>main(args.map(v=>v===x.key?wrong:v)),/CAMPAIGN_TAMPERED/);
 assert.equal(fs.existsSync(path.join(x.root,'sales-board')),false);
 assert.throws(()=>main(args.map(v=>v===x.state?path.join(x.root,'unknown.json'):v)),/INPUT_PATH_INVALID/);
 assert.throws(()=>main(args.map(v=>v===x.key?path.join(x.root,'missing-key'):v)),/INPUT_PATH_INVALID/);
 if(process.platform!=='win32'){
  const sym=path.join(x.root,'symlink-key');fs.symlinkSync(x.key,sym);
  assert.throws(()=>main(args.map(v=>v===x.key?sym:v)),/INPUT_PATH_INVALID/);
 }
});
test('separate operator-attested growth book is read-only and not independent payment proof',t=>{
 const x=env(t),p=path.join(x.root,'proof.json');
 const reviewHash=crypto.createHash('sha256').update(REVIEW).digest('hex');
 const book=openProofBook({filename:p,chainKey:PROOF_KEY,reviewKeyHash:reviewHash,recipes});
 book.record({recipeId:'supplier-desk',kind:'qualified_conversation',origin:'external',buyerHash:'a'.repeat(64),
  referenceHash:'b'.repeat(64),source:'interview_record',cents:null});book.attest(1,REVIEW);
 const result=main([...x.args(),'--proof-ledger',p,'--proof-key-file',x.proofKey,'--reviewer-key-hash',reviewHash]);
 assert.equal(result.qualifiedConversations,1);
 const report=JSON.parse(fs.readFileSync(path.join(x.root,'sales-board','board.json'),'utf8'));
 assert.equal(report.realCustomers,null);assert.equal(report.collectedRevenue,null);
 assert.equal(report.recipes.find(r=>r.id==='supplier-desk').qualifiedConversations,1);
});
test('actual separate process can export a snapshot without outward messages or credentials on stdout',t=>{
 const x=env(t);const cli=path.resolve(__dirname,'../../../scripts/build-sales-command-center.js');
 const child=spawnSync(process.execPath,[cli,...x.args()],{encoding:'utf8',timeout:12000});
 assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout);
 assert.equal(result.transmittedMessages,0);assert.equal(result.realCustomers,null);
 assert.equal(child.stdout.includes(CAMPAIGN_KEY.toString('hex')),false);
});
