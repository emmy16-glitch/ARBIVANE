import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneStage82BorrowerLending} from '../scripts/stage82-targeted-lending-clone.mjs';

const HEIGHT=221433162,HASH='7'.repeat(43);
const CODE='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const BORROWER='borrower.near',ASSET='wrap.near';
const b64=x=>Buffer.from(x).toString('base64');
const join=(...v)=>Buffer.concat(v.map(x=>Buffer.from(x)));
const borsh=s=>{const x=Buffer.from(s),n=Buffer.alloc(4);n.writeUInt32LE(x.length);return join(n,x);};
const u64=n=>{const x=Buffer.alloc(8);x.writeBigUInt64LE(BigInt(n));return x;};
const record=(k,v)=>({key:b64(k),value:b64(v)});
const keyAccount=join([0,105],borsh(BORROWER));
const rows=[
 record('STATE','pinned-contract-state'),
 record(keyAccount,u64(17)),
 record(join([0,107],u64(17)),borsh(BORROWER)),
 record(join([0,118],u64(17)),[2,7,8]),
 record(join([3],borsh(BORROWER)),[0,1,2]),
 record(join([4],borsh(ASSET)),[0,7,7]),
 record(join([7,101],u64(0)),borsh(ASSET)),
 record(join([5,105],borsh('farm-near')),u64(1)),
 record(join([6,102],borsh('farm-near')),u64(1)),
 record([8],[10,20,30]),
];
function scenario({missing=null,invalidIndex=false,drift=false}={}){
 const calls=[],patches=[],imports=[];
 const root={importContract:async x=>{
  imports.push(x);
  return {accountView:async()=>({code_hash:CODE}),
   patchStateRecords:async x=>patches.push(...x.records)};
 }};
 const rpc={viewAccount:async()=>({blockHeight:String(HEIGHT),codeHash:CODE})};
 const fetcher=async(url,req)=>{
  const p=JSON.parse(req.body).params,prefix=Buffer.from(p.prefix_base64,'base64');
  calls.push({url,prefix,limit:p.limit});
  let hit=rows.filter(r=>Buffer.from(r.key,'base64').subarray(0,prefix.length).equals(prefix));
  if(missing)hit=hit.filter(r=>!Buffer.from(r.key,'base64').equals(missing));
  if(invalidIndex&&prefix.equals(keyAccount))
   hit=[record(keyAccount,[1,2,3])];
  hit.sort((a,b)=>Buffer.compare(Buffer.from(a.key,'base64'),Buffer.from(b.key,'base64')));
  if(p.after_key_base64)
   hit=hit.filter(r=>Buffer.compare(Buffer.from(r.key,'base64'),Buffer.from(p.after_key_base64,'base64'))>0);
  const selected=hit.slice(0,p.limit??hit.length);
  return new Response(JSON.stringify({result:{
   block_height:HEIGHT,
   block_hash:drift&&prefix.equals(Buffer.from([8]))?'8'.repeat(43):HASH,
   values:selected,...(hit.length>selected.length?{last_key:selected.at(-1).key}:{})
  }}),{status:200});
 };
 return {args:{root,rpc,endpoint:'https://archival-rpc.mainnet.fastnear.com',
  blockHeight:HEIGHT,expectedCodeHash:CODE,borrowerAccountId:BORROWER,
  assetIds:[ASSET],fetcher,budgets:{paceMs:0}},calls,patches,imports};
}
test('Stage82 imports source-pinned indexed borrower only, not full lending market',async()=>{
 const a=scenario(),x=await cloneStage82BorrowerLending(a.args);
 assert.equal(x.evidence.mode,'STAGE82_PINNED_ONE_BORROWER_MARKET_CLOSURE');
 assert.equal(x.evidence.borrowerIndex,'17');
 assert.equal(x.evidence.sourceBlockHash,HASH);
 assert.equal(x.evidence.recordsRead,rows.length);
 assert.equal(x.evidence.recordsPatched,rows.length);
 assert.equal(a.patches.length,rows.length);
 assert.deepEqual(a.imports,[{
  mainnetContract:'contract.main.burrow.near',blockId:HEIGHT,withData:false
 }]);
 assert.ok(a.calls.some(x=>x.prefix.equals(keyAccount)));
 assert.ok(!a.calls.some(x=>x.prefix.length===0));
 assert.equal(x.evidence.fullMarketImported,false);
 assert.equal(x.evidence.verifiedLiquidationReceipts,false);
 assert.equal(x.evidence.mainnetMutated,false);
});
test('Stage82 blocks source key deletion, invalid index and cross-block drift before creating Sandbox import',async()=>{
 for(const o of [
  {missing:join([0,118],u64(17))},{invalidIndex:true},{drift:true}
 ]){
  const a=scenario(o);
  await assert.rejects(()=>cloneStage82BorrowerLending(a.args),/STAGE82_/);
  assert.equal(a.patches.length,0);
  assert.equal(a.imports.length,0);
 }
});
test('Stage82 rejects forged account, duplicated assets, bad code hash and missing source',async()=>{
 for(const patch of [
  {assetIds:[ASSET,ASSET]},{borrowerAccountId:'evil near'},
  {expectedCodeHash:'fake'},{blockHeight:0}
 ]){
  const a=scenario();
  await assert.rejects(()=>cloneStage82BorrowerLending({...a.args,...patch}),
   /STAGE82_/);
  assert.equal(a.imports.length,0);
 }
 const x=scenario({missing:keyAccount});
 await assert.rejects(()=>cloneStage82BorrowerLending(x.args),
  /STAGE82_REQUIRED_SOURCE_KEY_MISSING/);
});
test('Stage82 authentic fastlane invokes same real liquidation and settlement gate after borrower parity',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage69-fastlane.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes("STAGE82_SINGLE_BORROWER: 'true'"));
 assert.ok(workflow.includes("scripts/stage82-targeted-lending-clone.mjs"));
 assert.ok(workflow.includes('stage82-one-borrower-parity.json'));
 assert.ok(runner.includes('cloneStage82BorrowerLending({'));
 assert.ok(runner.includes('sourceCodeHash:plan.sourceCodeHash')===false);
 assert.ok(runner.indexOf('SANDBOX_REQUIRED_VIEWS_DISAGREE_WITH_MAINNET')<
  runner.indexOf("actor.callRaw(lending,plan.method"));
 assert.ok(runner.includes('summarizeStage37SandboxOutcome(raw'));
 assert.ok(runner.includes('attestStage41SandboxSettlement({'));
 assert.ok(runner.includes('attestStage48FinalizedSandboxReplay({'));
 assert.ok(runner.includes('mayBroadcastMainnet:false'));
});

test('Stage83 never silently skips a single oversized record when the alternate archive returns no data',async()=>{
 const a=scenario(),original=a.args.fetcher;
 a.args.fetcher=async(url,req)=>{
  const p=JSON.parse(req.body).params;
  if(p.prefix_base64===b64([7])){
   if(url===a.args.endpoint)
    return new Response('Response too large',{status:413});
   return new Response(JSON.stringify({result:{
    block_height:HEIGHT,block_hash:HASH,values:[]
   }}),{status:200});
  }
  return original(url,req);
 };
 await assert.rejects(()=>cloneStage82BorrowerLending(a.args),
  /STAGE83_ALTERNATE_OVERSIZED_RECORD_NOT_RETURNED/);
 assert.equal(a.imports.length,0);
 assert.equal(a.patches.length,0);
});

test('Stage83 resumes normal page size after an independently verified one-entry recovery',async()=>{
 const a=scenario(),original=a.args.fetcher;
 const prefix=b64([7]);
 const first=rows.find(x=>Buffer.from(x.key,'base64')[0]===7);
 const next=record(join([7,118],u64(1)),borsh(ASSET));
 const observed=[];
 a.args.fetcher=async(url,req)=>{
  const p=JSON.parse(req.body).params;
  if(p.prefix_base64!==prefix)return original(url,req);
  observed.push({url,limit:p.limit,cursor:p.after_key_base64??null});
  if(url===a.args.endpoint&&!p.after_key_base64)
   return new Response('Response too large',{status:413});
  if(url!==a.args.endpoint)
   return new Response(JSON.stringify({result:{
    block_height:HEIGHT,block_hash:HASH,
    values:[first],last_key:first.key
   }}),{status:200});
  if(p.after_key_base64===first.key)
   return new Response(JSON.stringify({result:{
    block_height:HEIGHT,block_hash:HASH,values:[next]
   }}),{status:200});
  throw Error('Unexpected archival cursor');
 };
 const data=await cloneStage82BorrowerLending(a.args);
 assert.equal(data.evidence.alternateSingleRecordReads,1);
 assert.equal(data.evidence.recordsRead,rows.length+1);
 assert.equal(data.evidence.recordsPatched,rows.length+1);
 assert.ok(observed.some(x=>x.cursor===first.key&&x.limit===64));
 assert.equal(data.evidence.mainnetMutated,false);
});

test('Stage83 parity artifact is valid JSON and never claims market completeness',async()=>{
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const excerpt=script.slice(script.indexOf("await writeFile('stage82-one-borrower-parity.json'"));
 assert.ok(excerpt.startsWith("await writeFile('stage82-one-borrower-parity.json'"));
 assert.ok(excerpt.includes("JSON.stringify(witness,null,2)+'\\n'"));
 assert.ok(!excerpt.includes("JSON.stringify(witness,null,2)+'\\\\n'"));
 assert.ok(script.includes('fullMarketImported:false,fullTrieRootParityVerified:false'));
});

test('Stage84 targeted borrower clone retains complete large source record in one atomic Sandbox patch',async()=>{
 const giant=Buffer.alloc(135000,0x42);
 const largeKey=join([5,102],borsh('heavy-farm.near'));
 const largeRecord=record(largeKey,giant);
 rows.push(largeRecord);
 try{
  const a=scenario();
  const result=await cloneStage82BorrowerLending(a.args);
  assert.equal(result.evidence.recordsRead,rows.length);
  assert.equal(result.evidence.recordsPatched,rows.length);
  assert.equal(result.evidence.largeSingleRecordPatchCalls,1);
  assert.ok(result.evidence.largestPatchRecordBytes>48000);
  const matching=a.patches.filter(x=>x.Data.data_key===largeRecord.key);
  assert.equal(matching.length,1);
  assert.equal(matching[0].Data.value,largeRecord.value);
  assert.deepEqual(Buffer.from(matching[0].Data.value,'base64'),giant);
  assert.equal(result.evidence.fullMarketImported,false);
  assert.equal(result.evidence.verifiedLiquidationReceipts,false);
  assert.equal(result.evidence.mainnetMutated,false);
 }finally{rows.pop();}
});

test('Stage84 targeted import rejects a record bigger than its explicit single-patch budget',async()=>{
 rows.push(record(join([5,102],borsh('too-large-farm.near')),
  Buffer.alloc(95000,0x44)));
 try{
  const a=scenario();
  a.args.budgets={paceMs:0,maxSinglePatchBytes:85000};
  await assert.rejects(()=>cloneStage82BorrowerLending(a.args),
   /STAGE82_SOURCE_RECORD_EXCEEDS_LOCAL_PATCH_LIMIT/);
  assert.equal(a.imports.length,1);
  assert.equal(a.patches.filter(x=>x.Data.data_key===rows.at(-1).key).length,0);
 }finally{rows.pop();}
});


test('Stage97 copies byte-exact borrower legacy nested supplied and farm namespaces, not other users',async()=>{
 const ownAsset=join([1],borsh(BORROWER));
 const ownFarms=join([2],borsh(BORROWER));
 const unrelated=join([1],borsh('unrelated.near'),[105]);
 const nested=[
  record(join(ownAsset,[105],borsh(ASSET)),u64(3)),
  record(join(ownAsset,[107],u64(3)),borsh(ASSET)),
  record(join(ownAsset,[118],u64(3)),[0,11,22,33]),
  record(join(ownFarms,[105],borsh('farm.near')),u64(1)),
  record(join(ownFarms,[107],u64(1)),borsh('farm.near')),
  record(join(ownFarms,[118],u64(1)),[0,44,55]),
  record(unrelated,u64(9)),
 ];
 rows.push(...nested);
 try{
  const a=scenario(),x=await cloneStage82BorrowerLending(a.args);
  assert.equal(x.evidence.recordsRead,rows.length-1);
  assert.equal(x.evidence.recordsPatched,rows.length-1);
  assert.equal(x.evidence.borrowerAccountVersion,2);
  assert.equal(x.evidence.borrowerNestedPrefixesScanned,true);
  assert.equal(x.evidence.borrowerSuppliedNestedRecords,3);
  assert.equal(x.evidence.borrowerFarmNestedRecords,3);
  assert.ok(a.calls.some(c=>c.prefix.equals(ownAsset)));
  assert.ok(a.calls.some(c=>c.prefix.equals(ownFarms)));
  assert.ok(!a.calls.some(c=>c.prefix.equals(join([1],borsh('unrelated.near')))));
  const patched=new Map(a.patches.map(v=>[v.Data.data_key,v.Data.value]));
  for(const expected of nested.slice(0,6))
   assert.equal(patched.get(expected.key),expected.value);
  assert.equal(patched.has(nested[6].key),false);
  assert.equal(x.evidence.fullMarketImported,false);
  assert.equal(x.evidence.verifiedLiquidationReceipts,false);
  assert.equal(x.evidence.mainnetMutated,false);
 }finally{rows.splice(rows.length-nested.length,nested.length);}
});

test('Stage97 rejects cross-block borrower-supplied nested data before importing local state',async()=>{
 const ownPrefix=join([1],borsh(BORROWER));
 const extra=record(join(ownPrefix,[105],borsh(ASSET)),u64(1));
 rows.push(extra);
 try{
  const a=scenario(),orig=a.args.fetcher;
  a.args.fetcher=async(url,req)=>{
   const p=JSON.parse(req.body).params;
   if(p.prefix_base64===b64(ownPrefix)){
    const response=await orig(url,req),body=await response.json();
    body.result.block_hash='8'.repeat(43);
    return new Response(JSON.stringify(body),{status:200});
   }
   return orig(url,req);
  };
  await assert.rejects(()=>cloneStage82BorrowerLending(a.args),
   /STAGE82_PINNED_BLOCK_OR_RPC_PAGE_MISMATCH/);
  assert.equal(a.imports.length,0);
  assert.equal(a.patches.length,0);
 }finally{rows.pop();}
});

test('Stage97 rejects unknown VAccount layout instead of assuming nested account storage encoding',async()=>{
 const target=rows.find(v=>v.key===b64(join([0,118],u64(17))));
 const old=target.value;
 target.value=b64([10,7,8]);
 try{
  const a=scenario();
  await assert.rejects(()=>cloneStage82BorrowerLending(a.args),
   /STAGE97_UNKNOWN_VERSIONED_BORROWER_ACCOUNT_LAYOUT/);
  assert.equal(a.imports.length,0);
  assert.equal(a.patches.length,0);
 }finally{target.value=old;}
});
