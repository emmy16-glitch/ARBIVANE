import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloneFailure} from '../scripts/stage119-clone-failure.mjs';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';
test('clone evidence names transient HTTP failures without persisting provider credentials',()=>{
 assert.equal(cloneFailure(new NearRpcHttpError(429,null),{}).code,'STAGE119_CLONE_SOURCE_HTTP_429');
 const e=new TypeError('SDK failed at https://rpc.example/private?q=secret-value token secret-value');
 e.cause=new Error('authorization secret-value');
 const f=cloneFailure(e,{API_TOKEN:'secret-value'}),s=JSON.stringify(f);
 assert.equal(f.code,'STAGE119_CLONE_RUNTIME_TYPE_ERROR');
 assert.ok(!s.includes('secret-value'));assert.ok(!s.includes('https://'));
 assert.match(f.message,/SDK failed/);
 const envelope=Error('{"jsonrpc":"2.0","error":{"code":-429,"message":"Rate limits exceeded"}}');
 assert.equal(cloneFailure(envelope,{}).code,'STAGE119_CLONE_SOURCE_SDK_RPC_RATE_LIMIT');
});
test('contract and state verification errors retain exact fail-closed taxonomy',()=>{
 assert.equal(cloneFailure(Error('STAGE89_SOURCE_AND_SANDBOX_WNEAR_VIEW_MISMATCH'),{}).code,
  'STAGE89_SOURCE_AND_SANDBOX_WNEAR_VIEW_MISMATCH');
 assert.equal(cloneFailure(Error('fetch failed'),{}).code,'STAGE119_CLONE_SOURCE_NETWORK_FAILED');
});
