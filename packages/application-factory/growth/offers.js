'use strict';
// Draft buyer-facing assets. Do not publish or activate checkout from this module.
const crypto=require('node:crypto');
const {validateRecipe}=require('../kernel');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validId=v=>typeof v==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v)&&v.length<=60;
function buildOffer(input){
  const r=validateRecipe(input);
  return Object.freeze({schemaVersion:1,id:r.id,title:r.title,buyer:r.buyer,outcome:r.outcome,
    family:r.family,recordLabel:r.recordLabel,
    requirements:r.requirements.map(({label,renewable})=>({label,renewable})),
    proposedWorkflow:['Organize required inputs','Track what has been received','Find missing and expiring records','Review a saved history'],
    proofRequired:['Confirm a recurring buyer problem','Obtain explicit paid pilot commitment','Measure a completed customer outcome','Measure delivery cost and repeat purchasing'],
    metrics:{qualifiedInterviews:null,paidPilotBuyers:null,repeatBuyers:null,measuredUnitContributionCents:null},
    pilotPriceCents:null,realCustomers:null,collectedRevenue:null,mode:'draft-only',releaseApproved:false,
    checkoutEnabled:false,outreachEnabled:false,contactCollectionEnabled:false,
    sourceDigest:hash(JSON.stringify(r))});
}
const STYLE=`:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172822;background:#f7f9f6}*{box-sizing:border-box}body{margin:0}a{color:inherit}header{border-bottom:1px solid #dde8df;background:#fff;padding:18px max(22px,calc((100vw - 1060px)/2))}header strong{letter-spacing:.04em;font-size:13px}header em{float:right;font-size:12px;font-style:normal;color:#50715e}.hero{background:linear-gradient(145deg,#e7f3e9,#fbfbf6);padding:90px 24px 70px}.wrap{width:min(1060px,100%);margin:auto}.eyebrow{text-transform:uppercase;letter-spacing:.17em;color:#46735e;font-weight:800;font-size:12px}.hero h1{font-size:clamp(38px,6vw,70px);line-height:1.05;max-width:840px;letter-spacing:-.055em;margin:20px 0}.lead{font-size:clamp(17px,2vw,22px);max-width:710px;line-height:1.6;color:#385244}.action{display:inline-block;text-decoration:none;padding:14px 24px;background:#174a33;color:white;border-radius:8px;margin-top:20px;font-weight:700}main{padding:64px 24px}h2{font-size:clamp(27px,4vw,40px);letter-spacing:-.04em}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.card{border:1px solid #e1eae4;background:white;border-radius:16px;padding:24px}.card h3{margin:0 0 12px;font-size:18px}.card p{color:#556a5e;line-height:1.6}.muted{color:#4f6559}.note{padding:24px;background:#f0f4ee;border:1px solid #d4e5d8;border-radius:13px;margin-top:34px}footer{border-top:1px solid #dde8df;padding:28px 24px;color:#526a5d;font-size:13px}ul{padding-left:21px;line-height:1.8}@media(max-width:600px){header{padding:15px 22px}header em{float:none;display:block;margin-top:4px}.hero{padding:52px 22px}.card{padding:19px}main{padding:43px 22px}}`;
function renderOffer(offer){
  if(!offer||!validId(offer.id)||offer.schemaVersion!==1||offer.mode!=='draft-only'||
     offer.releaseApproved!==false||offer.checkoutEnabled!==false||offer.outreachEnabled!==false||
     offer.contactCollectionEnabled!==false||offer.realCustomers!==null||offer.collectedRevenue!==null||
     !Array.isArray(offer.requirements)||!offer.requirements.length||typeof offer.title!=='string'||
     typeof offer.buyer!=='string'||typeof offer.outcome!=='string')throw new Error('OFFER_INVALID');
  const policy=`default-src 'none'; style-src 'sha256-${crypto.createHash('sha256').update(STYLE).digest('base64')}'; base-uri 'none'; form-action 'none'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'`;
  const cards=offer.requirements.map(req=>`<article class="card"><h3>${escape(req.label)}</h3><p>${req.renewable?'Track receipt status and renewal timing in the workspace.':'Keep track of what has been received and what is still outstanding.'}</p></article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><title>${escape(offer.title)} — Pilot concept</title><style>${STYLE}</style></head><body><header><strong>${escape(offer.title)}</strong><em>PRIVATE CONCEPT PREVIEW · NOT A PUBLIC OFFER</em></header><section class="hero"><div class="wrap"><div class="eyebrow">Built for ${escape(offer.buyer)}</div><h1>${escape(offer.title)}</h1><p class="lead">${escape(offer.outcome)}</p><a class="action" href="#pilot-process">Explore a pilot outline</a></div></section><main><div class="wrap"><section id="workflow"><div class="eyebrow">What the application tracks</div><h2>A clear workflow for the documents that matter.</h2><div class="grid">${cards}</div></section><section class="note" id="pilot-process"><div class="eyebrow">Validation stage</div><h2>Not available for purchase</h2><p class="muted">This is an unvalidated concept for buyer interviews. No public signup, booking, checkout, outbound reminders, or customer document collection is enabled.</p><p class="muted">Before any sales claim, independently confirm the problem, complete a paid pilot, record actual results, and obtain release approval.</p></section></div></main><footer><div class="wrap">Concept-only preview · No testimonials, customer counts, revenue, or effectiveness claims have been verified.</div></footer></body></html>`;
}
module.exports={buildOffer,renderOffer};
