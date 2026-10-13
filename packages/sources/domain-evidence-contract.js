"use strict";
const {sourceUnavailable}=require("./contracts");

const EVENT_KEYS=Object.freeze({
  registration:Object.freeze(["registration","registered"]),
  expiration:Object.freeze(["expiration","expiry"]),
  lastChanged:Object.freeze(["lastChanged"])
});
function plainRecord(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype||prototype===null;
}

// The existing products accept date-only evidence as well as timestamps.
// Preserve that compatibility, but never let Date.parse silently roll an
// impossible calendar date forward or let a timestamp suffix go unchecked.
// RFC 3339 offset timestamps are converted to UTC before day-based decisions.
// Leap seconds and >9 fractional digits are unsupported: fail closed rather
// than claim this operational parser implements every RFC 3339 edge case.
function domainEventTime(value){
  if(typeof value!=="string"||value.length>40)return null;
  const date=value.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const midnight=Date.parse(date+"T00:00:00Z");
  if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)return null;
  if(value===date)return midnight;
  const timestamp=/^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?([Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if(!timestamp||Number(timestamp[2])>23||Number(timestamp[3])>59||
     Number(timestamp[4])>59||Number(timestamp[6]||0)>23||Number(timestamp[7]||0)>59)return null;
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||!/^\d{4}-/.test(new Date(ms).toISOString()))return null;
  return ms;
}

// Used only after an actual required RDAP lookup. A completed missing-event
// human review is distinct from a present but malformed/contradictory event.
function guardDomainEvidence({evidence,profile,domain,now,sourceFailures}){
  const keys=Object.hasOwn(EVENT_KEYS,profile)?EVENT_KEYS[profile]:null;
  if(!keys)throw new TypeError("unsupported domain evidence profile");
  if(!Array.isArray(sourceFailures))throw new TypeError("sourceFailures must be an array");
  if(evidence?.available!==true)return evidence;
  function invalid(){
    if(!sourceFailures.some(failure=>failure?.source==="rdap")){
      sourceFailures.push({source:"rdap",detail:"SOURCE_CONTRACT_INVALID"});
    }
    return sourceUnavailable("rdap","SOURCE_CONTRACT_INVALID");
  }
  if(!plainRecord(evidence)||typeof evidence.domain!=="string"||
     evidence.domain.toLowerCase().replace(/\.$/,"")!==domain||
     (evidence.source!==undefined&&evidence.source!=="rdap")||
     typeof evidence.registered!=="boolean"||!plainRecord(evidence.events))return invalid();
  if(evidence.registered===false){
    return Object.values(evidence.events).some(value=>value!==null&&value!==undefined)
      ?invalid():evidence;
  }
  const normalizedEvents={...evidence.events};
  let selectedTime=null;
  for(const key of keys){
    const raw=evidence.events[key];
    if(raw===null||raw===undefined)continue;
    const ms=domainEventTime(raw);
    if(ms===null)return invalid();
    if(selectedTime!==null&&selectedTime!==ms)return invalid();
    if(profile!=="expiration"){
      const observedTime=domainEventTime(now);
      if(observedTime===null||ms>observedTime)return invalid();
    }
    selectedTime=ms;
    normalizedEvents[key]=raw.length===10?raw:new Date(ms).toISOString();
  }
  return {...evidence,events:normalizedEvents};
}
module.exports={domainEventTime,guardDomainEvidence};
