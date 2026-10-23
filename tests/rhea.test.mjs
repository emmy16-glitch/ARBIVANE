import test from 'node:test';
import assert from 'node:assert/strict';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {readRheaSnapshot} from '../src/rhea/scanner.ts';
function mockResponse(value,block=123){const bytes=[...new TextEncoder().encode(JSON.stringify(value))];return {ok:true,json:async()=>({jsonrpc:'2.0',result:{block_height:block,result:bytes}})};}
test('view calls use finality final, encode arguments and decode JSON',async()=>{
 let called;
 const fetcher=async (_url,opts)=>{called=JSON.parse(opts.body);return mockResponse('42');};
 const rpc=new NearReadOnlyRpc('https://rpc.example.org',fetcher);
 const result=await rpc.view('lending.near','get_num_accounts');
 assert.equal(result.value,'42');assert.equal(result.blockHeight,'123');
 assert.equal(called.params.finality,'final');assert.equal(called.method,'query');
});
test('pinned block rejects inconsistent RPC responses',async()=>{
 const rpc=new NearReadOnlyRpc('https://rpc.example.org',async()=>mockResponse('3',124));
 await assert.rejects(()=>rpc.view('lending.near','get_account',{},123),/inconsistent/);
});
test('RPC refuses unencrypted nonlocal URLs',()=>assert.throws(()=>new NearReadOnlyRpc('http://public-rpc.example.org')));
test('RPC error responses fail closed',async()=>{const rpc=new NearReadOnlyRpc('https://rpc.example.org',async()=>({ok:true,json:async()=>({error:{code:-1,message:'failure'}})}));await assert.rejects(()=>rpc.view('lending.near','get_account'),/RPC returned an error/);});
test('Rhea snapshot pins oracle and account pages to initial block',async()=>{
 let calls=[];
 const fetcher=async(_url,opts)=>{
  const q=JSON.parse(opts.body).params; calls.push(q);const m=q.method_name;
  if(m==='get_assets_paged') return mockResponse([['near',{anything:'fixture'}]],101);
  if(m==='get_num_accounts') return mockResponse('3',101);
  if(m==='get_price_data') return mockResponse({prices:{}},101);
  if(m==='get_accounts_paged'){const args=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(q.args_base64),c=>c.charCodeAt(0))));return mockResponse(Array.from({length:args.limit},(_,i)=>({account_id:`account-${args.from_index+i}`})),101);}
  throw Error('unexpected method');
 };
 const rpc=new NearReadOnlyRpc('https://rpc.example.org',fetcher);
 const s=await readRheaSnapshot(rpc,{lendingContract:'lending.near',oracleContract:'oracle.near',maxAccounts:3,pageSize:2});
 assert.equal(s.mode,'DISCOVERY_ONLY');assert.equal(s.accounts.length,3);assert.equal(s.blockHeight,'101');
 assert.equal(calls.length,5);assert.equal(calls[0].finality,'final');for(const q of calls.slice(1)) assert.equal(q.block_id,101);
});
test('Rhea scan is capped even when contract reports many accounts',async()=>{
 const fetcher=async(_url,opts)=>{const m=JSON.parse(opts.body).params.method_name;
 if(m==='get_assets_paged')return mockResponse([]);
 if(m==='get_num_accounts')return mockResponse('900000');
 if(m==='get_price_data')return mockResponse({});
 if(m==='get_accounts_paged')return mockResponse([{}]);
 throw Error('unexpected');};
 const s=await readRheaSnapshot(new NearReadOnlyRpc('https://rpc.example.org',fetcher),{lendingContract:'lending.near',oracleContract:'oracle.near',maxAccounts:1,pageSize:1});assert.equal(s.accounts.length,1);
});
