'use strict';
// Builds complete independent app families from constrained opportunity research.
const path=require('node:path');
const {loadOpportunities,reportOpportunities}=require('../packages/application-factory/autonomy/cross-family');
const {manufactureQuoteBatch}=require('../packages/application-factory/quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../packages/application-factory/inventory-family/manufacturing');
function main(argv=process.argv.slice(2)){
 if(argv.length===0||(argv.length===1&&argv[0]==='--check'))return reportOpportunities();
 if(argv.length!==5||argv[0]!=='--build'||argv[1]!=='--quote-output'||
  argv[3]!=='--inventory-output'||!path.isAbsolute(argv[2])||!path.isAbsolute(argv[4])||
  path.resolve(argv[2])===path.resolve(argv[4]))throw Error('USAGE_INVALID');
 const entries=loadOpportunities(),quotes=entries.filter(v=>v.family==='quote-to-order');
 const inventories=entries.filter(v=>v.family==='inventory-control');
 const quote=manufactureQuoteBatch({outputRoot:argv[2],recipes:quotes.map(v=>v.recipe)});
 const inventory=manufactureInventoryBatch({outputRoot:argv[4],catalog:inventories.map(v=>v.recipe)});
 if(quote.accepted!==quotes.length||quote.failed!==0||
   quote.verification!=='executed-packaged-quote-lifecycle'||
   inventory.accepted!==inventories.length||inventory.failed!==0||
   inventory.verification!=='executed-packaged-inventory-lifecycle'||
   quote.releaseApproved!==false||inventory.releaseApproved!==false)
  throw Error('CROSS_FAMILY_ACCEPTANCE_FAILED');
 return {kind:'manufactured-cross-family-opportunities',accepted:quote.accepted+inventory.accepted,
  failed:0,quote:quote.accepted,inventory:inventory.accepted,
  sourceDigests:entries.map(v=>({id:v.key,sourceDigest:v.proposalDigest,technicalFitScore:v.technicalFitScore})),
  verification:'actual-isolated-packaged-lifecycle',
  noMarketValidation:true,realCustomers:null,collectedRevenue:null,
  paymentsSent:0,transmittedMessages:0,releaseApproved:false};
}
if(require.main===module){try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Cross-family idea generation or independent application acceptance failed. No external action.');process.exitCode=1;}}
module.exports={main};
