'use strict';
const path=require('node:path');
const {manufactureInventoryBatch}=require('../packages/application-factory/inventory-family/manufacturing');
function main(args=process.argv.slice(2)){
 if(args.length!==2||args[0]!=='--output'||!path.isAbsolute(args[1]))throw Error('USAGE_INVALID');
 return manufactureInventoryBatch({outputRoot:args[1]});
}
if(require.main===module){
 try{const result=main();console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;}
 catch{console.error('Inventory app manufacturing rejected unsafe or unverifiable source. No purchase was made.');process.exitCode=1;}
}
module.exports={main};
