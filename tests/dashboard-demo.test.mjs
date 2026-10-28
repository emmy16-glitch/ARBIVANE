import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DashboardStore} from '../dashboard/server/store.mjs';
import {DemoAutomation,demoReadiness,demoQuote} from '../dashboard/server/demo.mjs';

const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function setup(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'arbivane-stage190-demo-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new DashboardStore(dir);await store.init();
 const events=[];const demo=new DemoAutomation({store,publish:e=>events.push(e),
  intervalMs:options.intervalMs??5,maxCycles:options.maxCycles??2});
 return {store,demo,events};
}
async function until(check,limit=3000){
 const start=Date.now();
 while(Date.now()-start<limit){if(await check())return;await pause(10)}
 throw Error('DEMO_TEST_TIMEOUT');
}
test('Demo always ready, never a chain connection or real wallet',()=>{
 const state=demoReadiness();
 assert.equal(state.environment,'demo');assert.equal(state.chainId,'simulation');
 assert.equal(state.capabilities.automate,true);assert.equal(state.capabilities.mainnetSpending,false);
 assert.equal(state.capabilities.deposit,false);assert.equal(state.capabilities.withdraw,false);
 assert.ok(demoQuote(100,0).repay<100);
});
test('Demo streams complete multi-stage session with portfolio and transaction activity',async t=>{
 const {store,demo,events}=await setup(t);
 const session=await demo.start({maxFinancingUsd:'125.00',minimumNetProfitUsd:'0.00'});
 assert.equal(session.environment,'demo');assert.equal(session.status,'running');
 await until(async()=>(await store.state('demo')).session.status==='completed');
 const state=await store.state('demo');
 assert.equal(state.transactions.length,2);
 assert.equal(state.accounting.evidence.scenario,'demo');
 assert.equal(state.wallet.accountId,'demo-portfolio');
 assert.ok(Number(state.accounting.cumulativeNetPnl)>0);
 assert.equal(state.transactions[0].network,'demo');
 assert.ok(events.some(e=>e.stage==='scan'));
 assert.ok(events.some(e=>e.stage==='discovery'));
 assert.ok(events.some(e=>e.stage==='oracle'));
 assert.ok(events.some(e=>e.stage==='risk'));
 assert.ok(events.some(e=>e.stage==='competition'));
 assert.ok(events.some(e=>e.stage==='execution'));
 assert.ok(events.some(e=>e.stage==='confirmation'));
 assert.ok(events.some(e=>e.stage==='settlement'));
 assert.ok(events.some(e=>e.stage==='accounting'));
 assert.ok(events.some(e=>e.stage==='system'&&e.status==='success'));
 assert.equal(events.every(e=>e.environment==='demo'),true);
 const other=await store.state('testnet'),mainnet=await store.state('mainnet');
 assert.equal(other.transactions.length,0);
 assert.equal(mainnet.transactions.length,0);
 assert.equal(other.wallet.balances.length,0);
 assert.equal(mainnet.accounting.cumulativeNetPnl,null);
});
test('Demo pause/resume preserves position; stop ends without additional settlement',async t=>{
 const {store,demo,events}=await setup(t,{intervalMs:16,maxCycles:3});
 await demo.start({maxFinancingUsd:'999.00',minimumNetProfitUsd:'0.00'});
 await until(()=>events.some(e=>e.stage==='discovery'));
 const paused=await demo.pause();
 assert.equal(paused.status,'paused');
 const before=events.length;await pause(80);
 assert.equal(events.length,before);
 const resumed=await demo.resume();assert.equal(resumed.status,'running');
 await until(()=>events.length>before+1);
 const stopped=await demo.stop();
 assert.equal(stopped.status,'stopped');
 const frozen=events.length;await pause(80);assert.equal(events.length,frozen);
 assert.equal((await store.state('demo')).session.status,'stopped');
});
test('Demo rejects duplicate Start, malformed budget and unsupported execution controls',async t=>{
 const {demo,store}=await setup(t,{intervalMs:20});
 await assert.rejects(demo.start({maxFinancingUsd:'0',minimumNetProfitUsd:'0'}),/INVALID_MAX_FINANCING/);
 const settings={maxFinancingUsd:'100.00',minimumNetProfitUsd:'0.00'};
 await demo.start(settings);
 await assert.rejects(demo.start(settings),/SESSION_ALREADY_ACTIVE/);
 await demo.stop();
 assert.equal((await store.state('demo')).transactions.length,0);
});
test('Demo UI exposes exactly 3 modes and a single clear top simulation label',async()=>{
 const {readFile}=await import('node:fs/promises');
 const ui=await readFile(new URL('../dashboard/web/src/App.tsx',import.meta.url),'utf8');
 assert.match(ui,/demo: \{title:'Demo'/);
 assert.match(ui,/testnet: \{title:'Testnet'/);
 assert.match(ui,/mainnet: \{title:'Mainnet'/);
 assert.doesNotMatch(ui,/sandbox: \{title:'Sandbox'/);
 assert.match(ui,/Interactive simulation/);
 assert.match(ui,/demo-mode-strip/);
});

