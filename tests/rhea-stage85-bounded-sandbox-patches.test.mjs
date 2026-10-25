import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchStage85AuthenticatedData} from '../scripts/stage85-bounded-sandbox-patches.mjs';

const row=(key,value)=>({
 key:Buffer.from(key).toString('base64'),
 value:Buffer.from(value).toString('base64'),
});
const stream=async function*(rows){for(const x of rows)yield x;};
const accountId='contract.main.burrow.near';
function sandbox(){
 const calls=[];
 return {calls,contract:{patchStateRecords:async({records})=>{
  calls.push(structuredClone(records));
 }}};
}

test('Stage85 authentic 130 KB storage value remains byte-identical as a bounded singleton patch',async()=>{
 const sb=sandbox(),huge=Buffer.alloc(130000,17);
 const rows=[row('first','one'),row('oversized',huge),row('last','two')];
 const progress=[];
 const actual=await patchStage85AuthenticatedData({
  contract:sb.contract,accountId,rows:stream(rows),
  onProgress:value=>progress.push(value),
 });
 assert.equal(actual.recordsPatched,3);
 assert.equal(actual.patchWriteCalls,3);
 assert.equal(actual.largeSingleRecordPatchCalls,1);
 assert.ok(actual.largestPatchRecordBytes>48000);
 assert.deepEqual(sb.calls.map(c=>c.length),[1,1,1]);
 assert.deepEqual(sb.calls.flat().map(x=>x.Data.data_key),rows.map(x=>x.key));
 assert.deepEqual(Buffer.from(sb.calls[1][0].Data.value,'base64'),huge);
 assert.equal(sb.calls[1][0].Data.account_id,accountId);
 assert.equal(actual.mainnetMutated,false);
 assert.equal(progress.at(-1).recordsPatched,3);
});

test('Stage85 small records retain bounded cross-page multi-record batching',async()=>{
 const sb=sandbox(),rows=Array.from({length:25},(_,i)=>
  row('item'+String(i).padStart(3,'0'),Buffer.alloc(40,i)));
 const got=await patchStage85AuthenticatedData({
  contract:sb.contract,accountId,rows:stream(rows),
  maxPatchBytes:4096,maxPatchRecords:10,
 });
 assert.equal(got.recordsPatched,25);
 assert.equal(got.largeSingleRecordPatchCalls,0);
 assert.deepEqual(sb.calls.map(c=>c.length),[10,10,5]);
 assert.deepEqual(sb.calls.flat().map(x=>x.Data.value),rows.map(x=>x.value));
});

test('Stage85 blocks enormous records before applying or fabricating complete cloned state',async()=>{
 const sb=sandbox(),rows=[row('small','one'),row('large',Buffer.alloc(90000,4))];
 await assert.rejects(()=>patchStage85AuthenticatedData({
  contract:sb.contract,accountId,rows:stream(rows),
  maxSinglePatchBytes:70000,
 }),/STAGE85_INDIVIDUAL_SOURCE_RECORD_EXCEEDS_SINGLETON_LIMIT/);
 assert.equal(sb.calls.length,0);
});

test('Stage85 rejects invalid base64 and unsafe limits prior to local mutation',async()=>{
 for(const rows of [[{key:'Z@',value:'YWJj'}],[{key:'YQ==',value:'Y'}]]){
  const sb=sandbox();
  await assert.rejects(()=>patchStage85AuthenticatedData({
   contract:sb.contract,accountId,rows:stream(rows),
  }),/STAGE85_INVALID_AUTHENTICATED_SOURCE_RECORD/);
  assert.equal(sb.calls.length,0);
 }
 const sb=sandbox();
 await assert.rejects(()=>patchStage85AuthenticatedData({
  contract:sb.contract,accountId,rows:stream([]),maxSinglePatchBytes:64000,
  maxPatchBytes:64001,
 }),/STAGE85_INVALID_SANDBOX_PATCH_CONFIGURATION/);
});

test('Stage85 standalone workflow retains mainnet read-only and clear observed large record evidence',async()=>{
 const root=new URL('../scripts/stage45-rhea-paged-sandbox-import.mjs',import.meta.url);
 const flow=new URL('../.github/workflows/rhea-stage45-bounded-state-import.yml',import.meta.url);
 const script=await readFile(root,'utf8'),yaml=await readFile(flow,'utf8');
 assert.ok(script.includes('patchStage85AuthenticatedData({'));
 assert.ok(script.includes('report.largeSingleRecordPatchCalls=metric.largeSingleRecordPatchCalls'));
 assert.ok(script.includes('report.dataRecordsPatched=metric.recordsPatched'));
 assert.ok(script.includes('dataRecordsPatched!==report.dataRecordsRead'));
 assert.ok(yaml.includes('STAGE45_PATCH_MAX_SINGLE_JSON_BYTES'));
 assert.ok(yaml.includes('scripts/stage85-bounded-sandbox-patches.mjs'));
 assert.ok(yaml.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(!script.includes('broadcast_tx'));
 assert.ok(!script.includes('callRaw('));
});
