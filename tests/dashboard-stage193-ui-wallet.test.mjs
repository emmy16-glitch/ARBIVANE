import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTestnetAccount} from '../dashboard/server/testnet-readonly.mjs';
function mockRpc(record=[]){
 return async(url,options)=>{
  const payload=JSON.parse(options.body);record.push(payload);
  if(payload.method==='status')return {ok:true,json:async()=>({result:{
   chain_id:'testnet',sync_info:{syncing:false,latest_block_height:275164000}}})};
  if(payload.method==='query'&&payload.params.request_type==='view_account')
   return {ok:true,json:async()=>({result:{amount:'123456789123456789123456789',
    locked:'0',block_height:275164004,storage_usage:182}})};
  throw Error('Unexpected RPC method');
 };
}
test('Stage193 public wallet lookup validates network and reports read-only balance',async()=>{
 const calls=[];
 const data=await getTestnetAccount('juaner.testnet',{fetchImpl:mockRpc(calls)});
 assert.equal(data.accountId,'juaner.testnet');
 assert.equal(data.network,'testnet');
 assert.equal(data.balanceNear,'123.456789');
 assert.equal(data.balanceYocto,'123456789123456789123456789');
 assert.equal(data.canSign,false);assert.equal(data.signerConnected,false);
 assert.equal(data.executionEnabled,false);assert.equal(data.sourceBlock,275164004);
 assert.deepEqual(calls.map(c=>c.method),['status','query']);
 assert.equal(calls[1].params.account_id,'juaner.testnet');
});
test('Stage193 invalid address fails before any external call',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not fetch')};
 for(const input of ['', 'alice.near', 'http://evil.testnet','../foo.testnet',
  'Alice.testnet','evil.testnet?method=send',' '.repeat(70)])
  await assert.rejects(getTestnetAccount(input,{fetchImpl}),/INVALID_TESTNET_ACCOUNT_ID/);
 assert.equal(calls,0);
});
test('Stage193 wrong chain never appears to be a valid Testnet wallet',async()=>{
 const fetchImpl=async()=>({ok:true,json:async()=>({result:{
  chain_id:'mainnet',sync_info:{syncing:false,latest_block_height:1000}}})});
 await assert.rejects(getTestnetAccount('juaner.testnet',{fetchImpl}),/WRONG_TESTNET_CHAIN/);
});
test('Stage193 all event details open inline and Testnet uses Start Automation',async()=>{
 const code=await readFile(new URL('../dashboard/web/src/App.tsx',import.meta.url),'utf8');
 assert.match(code,/function EventDisclosure/);
 assert.match(code,/<EventDisclosure key=\{event.id\}/);
 assert.doesNotMatch(code,/drawer-backdrop/);
 assert.match(code,/Highlights/);
 assert.match(code,/All events/);
 assert.match(code,/event-raw-disclosure/);
 assert.match(code,/function TestnetWallet/);
 assert.match(code,/Copy address/);
 assert.match(code,/Start Automation/);
 assert.doesNotMatch(code,/Start Testnet Scan/);
 assert.doesNotMatch(code,/Verified lending market/);
});
test('Stage193 mainnet remains separate and protected',async()=>{
 const server=await readFile(new URL('../dashboard/server/index.mjs',import.meta.url),'utf8');
 assert.match(server,/url\.pathname==='\/api\/public\/testnet\/account'/);
 assert.match(server,/getTestnetAccount\(accountId\)/);
 assert.match(server,/!authorized\(request\)/);
 assert.match(server,/request\.method!=='GET'/);
});
