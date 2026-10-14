'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('./run-private-remote-demo');
const base=['--serve','--document','/tmp/private-docs','--quote','/tmp/private-quotes',
 '--inventory','/tmp/private-stock','--state-root','/tmp/new-session',
 '--family','quote','--id','print-estimate-desk','--external-origin','https://demo.tailnet.ts.net',
 '--port','18788','--minutes','30'];
test('remote CLI requires one exact synthetic application and bounded duration',()=>{
 const args=parse(base);assert.equal(args.port,18788);assert.equal(args.minutes,30);
 assert.equal(args.family,'quote');assert.equal(args.id,'print-estimate-desk');
 for (const [index,value,pattern] of [[14,'http://demo.tailnet.ts.net',/REMOTE_ORIGIN_INVALID/],
   [16,'0',/USAGE_INVALID/],[18,'61',/USAGE_INVALID/],[10,'notfamily',/USAGE_INVALID/]]){
  const changed=[...base];changed[index]=value;assert.throws(()=>parse(changed),pattern);
 }
 assert.throws(()=>parse([...base,'--port','3333']),/USAGE_INVALID/);
 assert.throws(()=>parse(base.slice(0,-2)),/USAGE_INVALID/);
});
