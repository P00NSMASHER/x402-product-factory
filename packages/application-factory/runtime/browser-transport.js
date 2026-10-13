/* Shared browser request state. No credential persistence and no autonomous mutation retries. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FactoryConnection=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const error=(code,status)=>Object.assign(new Error(code),{status});
  function createConnection({fetchImpl=fetch,uuid=()=>crypto.randomUUID(),onUnauthorized=()=>{}}={}){
    let csrf=null,epoch=0,pending=null,sending=false;
    function disconnect(){epoch++;csrf=null;if(pending?.body instanceof Uint8Array)pending.body.fill(0);pending=null;}
    async function request(url,{method='GET',body,headers={},generation=epoch,mediaType='application/json'}={}){
      if(typeof url!=='string'||!/^\/app\/api\/[a-z0-9/-]+$/.test(url))throw error('PATH_INVALID');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      let res,data;
      try{
        res=await fetchImpl(url,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
          headers:{...(body!==undefined?{'Content-Type':mediaType}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...headers},...(body!==undefined?{body}: {})});
        data=await res.json();
      }catch{if(generation!==epoch)throw error('STALE_RESPONSE');throw error('NETWORK_UNCERTAIN');}
      finally{clearTimeout(timer);}
      if(generation!==epoch)throw error('STALE_RESPONSE');
      if(res.status===401){disconnect();onUnauthorized();throw error('UNAUTHORIZED',401);}
      if(!res.ok)throw error(typeof data?.error==='string'?data.error:'REQUEST_FAILED',res.status);
      return data;
    }
    async function deliver(){
      if(!pending)throw error('NO_PENDING_COMMAND');if(sending)throw error('WRITE_PENDING');
      const job=pending,generation=epoch;sending=true;
      try{const answer=await request(job.url,{method:'POST',body:job.body,headers:{'Idempotency-Key':job.key,...job.headers},mediaType:job.mediaType||'application/json',generation});if(epoch===generation)pending=null;return answer;}
      catch(err){if(epoch===generation&&err.status&&err.status<500)pending=null;throw err;}
      finally{sending=false;}
    }
    return Object.freeze({
      disconnect,
      isAuthenticated(){return csrf!==null;},hasPending(){return pending!==null;},
      async login(credential){disconnect();const generation=epoch;const result=await request('/app/api/session',{method:'POST',body:JSON.stringify({credential}),generation});csrf=result.csrfToken;return result;},
      async loginPilot(inviteCode,consent){disconnect();const generation=epoch;const result=await request('/app/api/pilot',{method:'POST',body:JSON.stringify({inviteCode,consent}),generation});csrf=result.csrfToken;return result;},
      async restore(){const result=await request('/app/api/session');csrf=result.csrfToken;return result;},
      async logout(){const generation=epoch;try{await request('/app/api/logout',{method:'POST',body:'{}',generation});}finally{if(generation===epoch)disconnect();}},
      read(url){return request(url);},
      async command(id,command,expectedVersion){
        if(!csrf)throw error('UNAUTHORIZED',401);if(pending||sending)throw error('WRITE_PENDING');
        if(typeof id!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id))throw error('PATH_INVALID');
        pending={url:'/app/api/workspaces/'+id+'/commands',body:JSON.stringify({command,...(expectedVersion===undefined?{}:{expectedVersion})}),key:uuid()};return deliver();
      },
      async upload(id,recordId,requirementId,{name,mediaType,bytes}={}){
        if(!csrf)throw error('UNAUTHORIZED',401);if(pending||sending)throw error('WRITE_PENDING');
        const idOk=value=>typeof value==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
        if(!idOk(id)||!/^r[1-9]\d*$/.test(recordId)||!idOk(requirementId))throw error('PATH_INVALID');
        if(typeof name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 _().-]{0,119}$/.test(name)||
           !['application/pdf','image/png','image/jpeg'].includes(mediaType)||
           !(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>262144)throw error('DOCUMENT_INVALID');
        pending={url:'/app/api/workspaces/'+id+'/documents',body:new Uint8Array(bytes),key:uuid(),mediaType:'application/octet-stream',headers:{
          'X-Record-Id':recordId,'X-Requirement-Id':requirementId,
          'X-Document-Name':name,'X-Document-Type':mediaType}};
        return deliver();
      },retry(){return deliver();}
    });
  }
  return {createConnection};
});
