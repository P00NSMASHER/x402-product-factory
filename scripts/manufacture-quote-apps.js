'use strict';
// Assemble + independently exercise the second complete SaaS application family.
const path=require('node:path');
const {manufactureQuoteBatch}=require('../packages/application-factory/quote-family/manufacturing');
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==2||args[0]!=='--output'||typeof args[1]!=='string'||!path.isAbsolute(args[1]))throw Error('USAGE_INVALID');
 return manufactureQuoteBatch({outputRoot:args[1]});
}
if(require.main===module){try{const report=main();console.log(JSON.stringify(report,null,2));
 if(report.failed>0)process.exitCode=1;}
 catch{console.error('Quote family manufacturing blocked unsafe input or failed independent package acceptance.');process.exitCode=1;}}
module.exports={main};
