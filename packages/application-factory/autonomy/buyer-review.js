'use strict';
// Human review packets across all three already-tested app families.
// This never interviews buyers, sends messages, deploys apps or records revenue.
const {loadScoutedLeads}=require('./scout');
const {loadOpportunities}=require('./cross-family');

function reviewFactoryOpportunities({scout={},crossFamily={}}={}){
 const documents=loadScoutedLeads(scout)
  .filter(row=>row.status==='admitted-unverified').map(row=>({
   id:row.recipe.id,
   family:'document-workflow',
   sourceKind:'source-backed-document-scout',
   sourceDigest:row.digest,
   sourceUrls:row.sources.map(x=>x.url),
   proposedBuyer:row.recipe.buyer,
   proposedJob:row.hypothesis.customerProblem,
   proposedTrigger:row.hypothesis.buyerTrigger,
   interviewQuestion:row.hypothesis.discoveryQuestion,
   differentiationHypothesis:row.hypothesis.differentiator,
   mechanicalFitScore:row.readinessScore,
   sourceMeaning:'public-process-context-not-buyer-demand',
 }));
 const cross=loadOpportunities(crossFamily).map(row=>{
  const p=row.recipe;
  const question='When '+row.proposalTrigger+
   ', how does your team handle '+row.proposedProblem+' today?';
  return {
   id:row.key,
   family:row.family,
   sourceKind:'source-backed-cross-family-proposal',
   sourceDigest:row.proposalDigest,
   sourceUrls:row.references.map(x=>x.url),
   proposedBuyer:p.buyer,
   proposedJob:row.proposedProblem,
   proposedTrigger:row.proposalTrigger,
   interviewQuestion:question,
   differentiationHypothesis:'Unverified application workflow fit, not buyer preference.',
   mechanicalFitScore:row.technicalFitScore,
   sourceMeaning:'public-process-context-not-buyer-demand',
  };
 });
 const all=[...documents,...cross];
 if(!all.length||all.length>50||new Set(all.map(x=>x.id)).size!==all.length)
  throw Error('BUYER_REVIEW_IDENTITY_INVALID');
 const packets=all.map((row,index)=>({
  ...row,
  reviewOrder:index+1,
  issueToDisconfirm:'Can the buyer name an actual recurring problem, a costly consequence and the existing alternative?',
  disconfirmationRule:'Reject or revise if real workflow pain, consequence and consented evaluation are not independently established.',
  minimumInitialConversations:3,
  minimumMeaning:'early-qualitative-falsification-not-representative-survey',
  existingBuyerEvidence:'NOT_COLLECTED',
  confirmedConversations:null,
  verifiedWorkflowCompletions:null,
  verifiedRevenue:null,
  buyerDemandValidated:false,
  deploymentApproved:false,
  consentRequiredForAnyRealEvaluation:true,
  externalContactPermitted:false,
 }));
 return {
  kind:'unified-operator-buyer-evidence-review',
  provenance:'source-bound-unverified-hypotheses',
  totalReviewPackets:packets.length,
  familyCounts:Object.fromEntries(['document-workflow','quote-to-order','inventory-control'].map(
   family=>[family,packets.filter(p=>p.family===family).length])),
  packets,
  measuredRealBuyerPain:null,
  independentExternalBuyerEvidence:false,
  realCustomers:null,
  collectedRevenue:null,
  externalMessagesSent:0,
  paymentsSent:0,
  publicDeploymentEnabled:false,
  autoApprove:false,
  releaseApproved:false,
 };
}
module.exports={reviewFactoryOpportunities};
