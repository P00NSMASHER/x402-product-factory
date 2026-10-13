/* Shared browser request state. No credential persistence and no autonomous mutation retries. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FactoryConnection=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const error=(code,status)=>Object.assign(new Error(code),{status});
  function createConnection({fetchImpl=fetch,uuid=()=>crypto.randomUUID(),onUnauthorized=()=>{}}={}){
    let csrf=null,epoch=0,pending=null,sending=false;
    function disconnect(){epoch++;csrf=null;pending=null;}
    async function request(url,{method='GET',body,headers={},generation=epoch}={}){
      if(typeof url!=='string'||!/^\/app\/api\/[a-z0-9/-]+$/.test(url))throw error('PATH_INVALID');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      let res,data;
      try{
        res=await fetchImpl(url,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,
          headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...headers},...(body!==undefined?{body}: {})});
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
      try{const answer=await request(job.url,{method:'POST',body:job.body,headers:{'Idempotency-Key':job.key},generation});if(epoch===generation)pending=null;return answer;}
      catch(err){if(epoch===generation&&err.status&&err.status<500)pending=null;throw err;}
      finally{sending=false;}
    }
    return Object.freeze({
      disconnect,
      isAuthenticated(){return csrf!==null;},hasPending(){return pending!==null;},
      async login(credential){disconnect();const generation=epoch;const result=await request('/app/api/session',{method:'POST',body:JSON.stringify({credential}),generation});csrf=result.csrfToken;return result;},
      async restore(){const result=await request('/app/api/session');csrf=result.csrfToken;return result;},
      async logout(){const generation=epoch;try{await request('/app/api/logout',{method:'POST',body:'{}',generation});}finally{if(generation===epoch)disconnect();}},
      read(url){return request(url);},
      async command(id,command,expectedVersion){
        if(!csrf)throw error('UNAUTHORIZED',401);if(pending||sending)throw error('WRITE_PENDING');
        if(typeof id!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id))throw error('PATH_INVALID');
        pending={url:'/app/api/workspaces/'+id+'/commands',body:JSON.stringify({command,...(expectedVersion===undefined?{}:{expectedVersion})}),key:uuid()};return deliver();
      },retry(){return deliver();}
    });
  }
  return {createConnection};
});
