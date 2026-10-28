import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appPath=new URL('../dashboard/web/src/App.tsx',import.meta.url);
const cssPath=new URL('../dashboard/web/src/styles.css',import.meta.url);
test('Stage184 all routed views use one responsive page panel and no duplicated headings',async()=>{
 const source=await readFile(appPath,'utf8');
 assert.match(source,/function OperationalPage\(\{kind\}/);
 for(const name of ['live','opportunities','performance','wallet','transactions','settings']){
  assert.ok(source.includes(`<Route path="/${name}"`),`Missing route: ${name}`);
 }
 assert.ok(source.includes('<WalletWorkspace state={data.state}/>'));
 assert.ok(source.includes('<SettingsWorkspace readiness={data.readiness} environment={environment}/>'));
 assert.ok(source.includes('<LiveEventTable events={data.events}/>'));
 assert.ok(source.includes('<OpportunityTable rows={opportunities}/>'));
 assert.ok(source.includes('<TransactionWorkspace rows={transactions}/>'));
 assert.ok(!source.includes('page-heading'));
});
test('Stage184 detail data subscriptions cancel on mode change and retry safely',async()=>{
 const source=await readFile(appPath,'utf8');
 assert.ok(source.includes('let active=true;'));
 assert.ok(source.includes('if(!active)return;'));
 assert.ok(source.includes('source?.close();if(poll)clearInterval(poll)'));
 assert.ok(source.includes('setRetry(current=>current+1)'));
 assert.ok(source.includes('mergeOperationEvents(environment,current.events,[event])'));
 assert.ok(source.includes("previous==='STREAM_RECONNECTING'?previous:''"));
 assert.ok(source.includes('<Automation key={environment}'));
 assert.ok(source.includes('<Operations key={environment}'));
});
test('Stage184 accessible controls and compact details on desktop and mobile',async()=>{
 const styles=await readFile(cssPath,'utf8');
 assert.ok(styles.includes('.wallet-summary,.settings-status'));
 assert.ok(styles.includes('.settings-details'));
 assert.ok(styles.includes('.route-warning'));
 assert.ok(styles.includes('@media(max-width:620px)'));
 assert.ok(styles.includes('@media(max-width:380px)'));
 assert.ok(styles.includes('.operation-entry summary:focus-visible'));
 assert.ok(styles.includes('.transaction-entry summary:focus-visible'));
});
