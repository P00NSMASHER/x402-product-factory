"use strict";
const { errorCode }=require('./runtime');
// Each sweep is bounded and synchronous. setTimeout avoids overlapping ticks.
function startWorker(runtime,{pollMs=1000,batchSize=25}={}) {
  if(!runtime||typeof runtime.sweep!=='function'||!Number.isSafeInteger(pollMs)||pollMs<10||pollMs>60000||
     !Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100)throw new Error('WORKER_CONFIG_INVALID');
  let running=true,timer=null,completedSweeps=0,lastReport=null,lastError=null;
  function tick(){
    if(!running)return;
    try{lastReport=runtime.sweep({limit:batchSize});lastError=null;completedSweeps++;}
    catch(error){lastError=errorCode(error);}
    if(running)timer=setTimeout(tick,pollMs);
  }
  timer=setTimeout(tick,0);
  return Object.freeze({
    stop(){running=false;if(timer)clearTimeout(timer);},
    status(){return {running,completedSweeps,lastError,lastReport:lastReport?{...lastReport}:null};}
  });
}
module.exports={startWorker};
