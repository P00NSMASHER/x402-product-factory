'use strict';
const {reviewFactoryOpportunities}=require('../packages/application-factory/autonomy/buyer-review');
function main(args=process.argv.slice(2)){
 if(args.length!==0&&!(args.length===1&&args[0]==='--check'))
  throw Error('USAGE_INVALID');
 return reviewFactoryOpportunities();
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Buyer review preparation rejected invalid inputs. No outside action was taken.');process.exitCode=1;}
}
module.exports={main};
