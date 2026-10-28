import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBrowserDemo} from '../dashboard/web/src/demo-client.ts';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const settings={maxFinancingUsd:'250.00',minimumNetProfitUsd:'0.00'};
function memory(){
 let text=null;
 return {getItem(key){assert.equal(key,'arbivane-demo-v2');return text},
  setItem(key,value){assert.equal(key,'arbivane-demo-v2');text=value}};
}
async function until(callback,limit=1200){
 const start=Date.now();
 while(Date.now()-start<limit){if(await callback())return;await wait(8)}
 throw Error('DEMO_BROWSER_TIMEOUT');
}
test('public Demo starts and streams without operator login, fetch, or blockchain access',async()=>{
 const prevFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('NO_NETWORK_CALLS_ALLOWED_IN_DEMO')};
 try{
  const demo=createBrowserDemo(memory(),{intervalMs:5,maxCycles:2});
  let streams=0,connected=false;
  const sub=demo.subscribe(()=>streams++,(status)=>{connected=status==='connected'});
  const first=await demo.load();
  assert.equal(first.readiness.environment,'demo');
  assert.equal(first.readiness.capabilities.automate,true);
  assert.equal(first.state.wallet.accountId,null);
  const result=await demo.command('start',settings);
  assert.equal(result.session.status,'running');
  await until(async()=>(await demo.load()).state.session?.status==='completed');
  const last=await demo.load();
  assert.equal(last.state.transactions.length,2);
  assert.equal(last.state.accounting.evidence.scenario,'demo');
  assert.ok(streams>18);
  assert.equal(connected,true);
  sub.close();
 }finally{globalThis.fetch=prevFetch}
});
test('Demo controls Pause, Resume, Stop and retains separate state across tab refresh',async()=>{
 const storage=memory();
 const demo=createBrowserDemo(storage,{intervalMs:25,maxCycles:4});
 await demo.command('start',settings);
 await until(async()=>(await demo.load()).events.some(e=>e.stage==='discovery'));
 const paused=await demo.command('pause');
 assert.equal(paused.session.status,'paused');
 const first=(await demo.load()).events.length;
 await wait(80);
 assert.equal((await demo.load()).events.length,first);
 const rehydrated=createBrowserDemo(storage,{intervalMs:5,maxCycles:4});
 const snapshot=await rehydrated.load();
 assert.equal(snapshot.state.session?.status,'paused');
 assert.equal(snapshot.events.length,first);
 await rehydrated.command('resume');
 await until(async()=>(await rehydrated.load()).events.length>first+3);
 await rehydrated.command('stop');
 const ended=(await rehydrated.load()).events.length;
 await wait(45);
 assert.equal((await rehydrated.load()).events.length,ended);
 assert.equal((await rehydrated.load()).state.session?.status,'stopped');
});
test('different browser sessions never share their Demo balance, state, or events',async()=>{
 const one=createBrowserDemo(memory(),{intervalMs:8,maxCycles:1});
 const two=createBrowserDemo(memory(),{intervalMs:8,maxCycles:1});
 await one.command('start',settings);
 assert.equal((await two.load()).events.length,0);
 assert.equal((await two.load()).state.accounting.available,null);
 await until(async()=>(await one.load()).state.session?.status==='completed');
 assert.equal((await one.load()).state.transactions.length,1);
 assert.equal((await two.load()).state.transactions.length,0);
});
test('Demo starts with a single simulation strip and never bypasses Testnet/Mainnet API authentication',async()=>{
 const api=await readFile(new URL('../dashboard/web/src/api.ts',import.meta.url),'utf8');
 const index=await readFile(new URL('../dashboard/server/index.mjs',import.meta.url),'utf8');
 assert.match(api,/if \(environment==='demo'\) return browserDemo\(\)\.load\(\)/);
 assert.match(api,/if \(environment==='demo'\) return browserDemo\(\)\.command/);
 assert.match(api,/browserDemo\(\)\.subscribe/);
 assert.match(index,/!authorized\(request\)/);
 assert.match(index,/testnet\|mainnet/);
 const ui=await readFile(new URL('../dashboard/web/src/App.tsx',import.meta.url),'utf8');
 assert.match(ui,/Interactive simulation/);
});

