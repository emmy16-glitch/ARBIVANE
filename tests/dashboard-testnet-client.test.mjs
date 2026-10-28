import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveTestnet} from '../dashboard/web/src/testnet-client.ts';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}}
const health={status:'connected',chainId:'testnet',contract:'contract.burrow.testnet',
 codeHash:'5r4GsfdDATmriAdT6ZteFpPjDNSfPn4NneETiNuckUc6',blockHeight:250000000,
 oracleId:'mock-priceoracle.testnet',executionEnabled:false,checkedAt:'2026-10-28T01:00:00Z'};
function reply(j){return {ok:true,json:async()=>j}}
test('Testnet client streams real source responses and never manufactures PNL, receipt, eligibility',async()=>{
 const original=globalThis.fetch;
 let calls=0;globalThis.fetch=async url=>{
  calls++;
  if(url==='/api/public/testnet/health')return reply(health);
  if(String(url).includes('from=0')){
   return reply({network:'testnet',contract:health.contract,codeHash:health.codeHash,
    from:0,limit:20,returned:1,blockHeight:250000010,hasMore:false,eligibilityVerified:false,
    accounts:[{accountId:'real.borrower.testnet',sourceIndex:0,hasDebt:true,
     borrowed:[{tokenId:'wrap.testnet',atomic:'123456789',position:'REGULAR'}],
     collateral:[{tokenId:'usdt.fakes.testnet',atomic:'120000000',position:'REGULAR'}]}]});
  }
  throw Error('UNEXPECTED_RPC_REQUEST');
 };
 try{
  const client=new LiveTestnet(storage());
  const initial=await client.load();
  assert.equal(initial.readiness.capabilities.automate,true);
  assert.equal(initial.readiness.capabilities.execution,false);
  assert.equal(initial.state.accounting.cumulativeNetPnl,null);
  const events=[];client.subscribe(e=>events.push(e));
  const started=await client.command('start');
  assert.equal(started.session.status,'running');
  for(let i=0;i<40;i++){
   if((await client.load()).state.session?.status==='completed')break;
   await sleep(12);
  }
  const final=await client.load();
  assert.equal(final.state.session?.status,'completed');
  assert.equal(final.state.session?.scanned,1);
  assert.equal(final.state.opportunities.length,1);
  assert.equal(final.state.opportunities[0].eligibilityVerified,false);
  assert.equal(final.state.transactions.length,0);
  assert.equal(final.state.accounting.realizedProfit,null);
  assert.equal(final.state.wallet.balances.length,0);
  assert.ok(events.some(e=>e.stage==='scan'));
  assert.ok(calls>=3);
 }finally{globalThis.fetch=original}
});
test('Testnet browser separates mode data and preserves cursor after refresh',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(url==='/api/public/testnet/health')return reply(health);
  return reply({network:'testnet',contract:health.contract,codeHash:health.codeHash,
   from:0,limit:20,returned:0,blockHeight:250000011,hasMore:false,
   eligibilityVerified:false,accounts:[]});
 };
 try{
  const mem=storage(),first=new LiveTestnet(mem);
  await first.command('start');
  for(let i=0;i<40;i++){
   if((await first.load()).state.session?.status==='completed')break;
   await sleep(12);
  }
  const second=new LiveTestnet(mem);
  const snapshot=await second.load();
  assert.equal(snapshot.state.session?.status,'completed');
  assert.ok(snapshot.events.length>=2);
  assert.equal(snapshot.state.transactions.length,0);
 }finally{globalThis.fetch=original}
});

