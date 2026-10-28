import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveTestnet} from '../dashboard/web/src/testnet-client.ts';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}}
const health={status:'connected',chainId:'testnet',contract:'contract.burrow.testnet',
 codeHash:'5r4GsfdDATmriAdT6ZteFpPjDNSfPn4NneETiNuckUc6',blockHeight:250000000,
 oracleId:'mock-priceoracle.testnet',executionEnabled:false,checkedAt:'2026-10-28T01:00:00Z'};
function reply(j){return {ok:true,json:async()=>j}}
async function until(condition,limit=2000){const started=Date.now();while(Date.now()-started<limit){
 if(await condition())return;await sleep(12)}throw Error('TESTNET_MONITOR_TIMEOUT')}
let fromZeroCalls=0;
function stubFetch(){
 return async url=>{
  if(url==='/api/public/testnet/health')return reply(health);
  if(String(url).startsWith('/api/public/testnet/assessment?from=0&limit=20')){
   fromZeroCalls++;
   return reply({network:'testnet',contract:health.contract,codeHash:health.codeHash,
    from:0,limit:20,returned:2,blockHeight:250000010+fromZeroCalls,
    hasMore:false,eligibilityVerified:false,executionEnabled:false,
    indexedDebt:2,freshDebt:1,blocked:1,pending:0,staleIndexedDebt:1,
    eligibleVerified:0,transactionsExecuted:0,
    oracle:{fresh:true,requiredTokens:2,pricedTokens:0,error:null,ageMs:500},
    accounts:[
     {accountId:'real.borrower.testnet',sourceIndex:0,hasDebt:true,indexHasDebt:true,
      status:'BLOCKED',reason:'MISSING_ORACLE_PRICE',freshBlock:250000010+fromZeroCalls,
      missingPrices:['wrap.testnet'],
      borrowed:[{tokenId:'wrap.testnet',atomic:'12345'}],
      collateral:[{tokenId:'usdt.fakes.testnet',atomic:'12000'}]},
     {accountId:'old.borrower.testnet',sourceIndex:1,indexHasDebt:true,hasDebt:false,
      status:'NO_CURRENT_DEBT',reason:'NO_CURRENT_DEBT',freshBlock:250000010+fromZeroCalls,
      missingPrices:[],borrowed:[],collateral:[]}
    ]});
  }
  throw Error('UNEXPECTED_RPC_REQUEST: '+url);
 };
}
test('Testnet continuous scanning displays fresh data, never fictitious PNL or receipt',async()=>{
 const original=globalThis.fetch;fromZeroCalls=0;globalThis.fetch=stubFetch();
 const client=new LiveTestnet(storage(),{monitorIntervalMs:22});
 try{
  const initial=await client.load();
  assert.equal(initial.readiness.capabilities.automate,true);
  assert.equal(initial.readiness.capabilities.execution,false);
  await client.command('start');
  await until(async()=>(await client.load()).state.session?.cycles>=2);
  const current=await client.load();
  assert.equal(current.state.session.status,'running');
  assert.equal(current.state.session.scanned,2);
  assert.equal(current.state.session.debtPositions,1);
  assert.equal(current.state.session.staleIndexedDebt,1);
  assert.equal(current.state.session.blocked,1);
  assert.equal(current.state.opportunities.length,2);
  assert.equal(current.state.opportunities[0].assessmentReason,'MISSING_ORACLE_PRICE');
  assert.equal(current.state.opportunities[0].eligibilityVerified,false);
  assert.equal(current.state.transactions.length,0);
  assert.equal(current.state.accounting.realizedProfit,null);
  assert.equal(current.state.wallet.balances.length,0);
  assert.ok(current.events.some(e=>e.stage==='monitoring'));
  assert.ok(!current.events.some(e=>e.message.includes('Automation completed')));
 }finally{await client.command('stop');globalThis.fetch=original}
});
test('Testnet monitoring state and blockers persist across pause and restore',async()=>{
 const original=globalThis.fetch;fromZeroCalls=0;globalThis.fetch=stubFetch();
 const mem=storage(),first=new LiveTestnet(mem,{monitorIntervalMs:1000});
 try{
  await first.command('start');
  await until(async()=>(await first.load()).state.session?.cycles>=1);
  await first.command('pause');
  const second=new LiveTestnet(mem,{monitorIntervalMs:22});
  const restored=await second.load();
  assert.equal(restored.state.session.status,'paused');
  assert.equal(restored.state.session.debtPositions,1);
  assert.equal(restored.state.session.blocked,1);
  assert.ok(restored.events.some(e=>e.stage==='monitoring'));
  await second.command('resume');
  await until(async()=>(await second.load()).state.session?.cycles>=2);
  await second.command('stop');
  assert.equal((await second.load()).state.session.status,'stopped');
  assert.equal((await second.load()).state.transactions.length,0);
 }finally{
  if((await first.load()).state.session?.status==='running')
   await first.command('stop');
  globalThis.fetch=original;
 }
});

