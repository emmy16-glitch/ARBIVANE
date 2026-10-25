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
