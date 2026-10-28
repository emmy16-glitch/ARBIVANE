import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DashboardStore} from '../dashboard/server/store.mjs';
import {AutomationManager} from '../dashboard/server/automation.mjs';

test('Stage188 interrupted Sandbox recovery keeps session failed and never fabricates receipts',async t=>{
 const root=await mkdtemp(join(tmpdir(),'arbivane-stage188-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const first=new DashboardStore(root);await first.init();
 const previous=first.newSession('sandbox',{maxFinancingUsd:'10.00',minimumNetProfitUsd:'0.00'});
 await first.update('sandbox',state=>{
  state.session={...previous,status:'running',pid:424242,
   workDir:join(root,'sandbox','sessions',previous.id)};
  return state;
 });
 const recoveredStore=new DashboardStore(root);await recoveredStore.init();
 const interrupted=await recoveredStore.state('sandbox');
 assert.equal(interrupted.session.status,'failed');
 assert.equal(interrupted.session.pid,null);
 assert.equal(interrupted.session.interruptedPid,424242);
 const events=[];
 const manager=new AutomationManager({store:recoveredStore,
  repoRoot:join(root,'nonexistent'),publish:e=>events.push(e)});
 await manager.recoverInterruptedSandbox();
 const checked=await recoveredStore.state('sandbox');
 assert.equal(checked.session.status,'failed');
 assert.equal(checked.session.recovery.sessionStillFailed,true);
 assert.equal(checked.session.recovery.verifiedReceiptBundles,0);
 assert.equal(checked.transactions.length,0);
 assert.equal(checked.accounting.cumulativeNetPnl,null);
 assert.equal(events.length,1);
 assert.equal(events[0].stage,'recovery');
 await manager.recoverInterruptedSandbox();
 assert.equal(events.length,1);
});

