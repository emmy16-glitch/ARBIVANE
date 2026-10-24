import test from 'node:test';
import assert from 'node:assert/strict';
import { NearReadOnlyRpc, NearRpcHttpError } from '../src/rhea/rpc.ts';

test('read-only RPC preserves bounded Retry-After without leaking response bodies',async()=>{
 const fetcher=async()=>({ok:false,status:429,headers:{get(name){return name==='retry-after'?'60':null;}}});
 const rpc=new NearReadOnlyRpc('https://example.org',fetcher);
 await assert.rejects(()=>rpc.viewAccount('contract.main.burrow.near'),err=>{
   assert.ok(err instanceof NearRpcHttpError);
   assert.equal(err.message,'NEAR RPC HTTP 429');assert.equal(err.retryAfterMs,60000);return true;
 });
});
test('invalid Retry-After remains an ordinary bounded HTTP failure',()=>{
 const x=new NearRpcHttpError(429,'not a date');assert.equal(x.retryAfterMs,undefined);
 const y=new NearRpcHttpError(503,'999999');assert.equal(y.retryAfterMs,undefined);
 const z=new NearRpcHttpError(429,'99999');assert.equal(z.retryAfterMs,120000);
});
