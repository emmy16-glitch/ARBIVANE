import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneStage89WrappedNear} from '../scripts/stage89-targeted-wnear-clone.mjs';

const HEIGHT=221433162,HASH='7'.repeat(43),CODE='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const LENDER='contract.main.burrow.near',BORROWER='borrower.near';
const b64=b=>Buffer.from(b).toString('base64');
function u128(n){const x=Buffer.alloc(16);x.writeBigUInt64LE(BigInt(n)&((1n<<64n)-1n),0);x.writeBigUInt64LE(BigInt(n)>>64n,8);return x;}
function acctKey(s){const name=Buffer.from(s),size=Buffer.alloc(4);size.writeUInt32LE(name.length);return Buffer.concat([Buffer.from('a'),size,name]);}
const min='1250000000000000000000';
const storage={total:min,available:'0'};
const metadata={spec:'ft-1.0.0',name:'Wrapped NEAR fungible token',symbol:'wNEAR',icon:null,reference:null,reference_hash:null,decimals:24};
const state=()=>{const x=Buffer.alloc(29);x[0]=1;x[4]=97;u128(1000n).copy(x,5);x.writeBigUInt64LE(125n,21);return x;};
function fixture({corruptState=false,wrongLocalBalance=false,wrongSourceBalance=false,missingVault=false,drift=false}={}){
 const source=new Map([[b64('STATE'),b64(corruptState?Buffer.alloc(29,1):state())]]);
 if(!missingVault)source.set(b64(acctKey(LENDER)),b64(u128(500n)));
 const rawPatches=[],queries=[],imports=[];
 const rpc={
  viewAccount:async()=>({blockHeight:String(HEIGHT),codeHash:CODE}),
  view:async(_contract,method,args,block)=>{
   assert.equal(block,HEIGHT);
   let v;
   if(method==='ft_total_supply')v='1000';
   else if(method==='ft_metadata')v=metadata;
   else if(method==='storage_balance_bounds')v={min,max:min};
   else if(method==='ft_balance_of')v=args.account_id===LENDER?
    (wrongSourceBalance?'501':'500'):'0';
   else if(method==='storage_balance_of')v=args.account_id===LENDER?storage:null;
   else throw Error('Unexpected pinned view');
   return {blockHeight:String(HEIGHT),value:v};
  },
 };
 const root={importContract:async options=>{
  imports.push(options);
  const patched=new Map();
  return {
   accountId:'wrap.near',
   accountView:async()=>({code_hash:CODE}),
   patchStateRecords:async({records})=>{
    rawPatches.push(...records);for(const item of records)patched.set(item.Data.data_key,item.Data.value);
   },
   view:async(method,args)=>{
    if(method==='ft_total_supply'){
     const data=Buffer.from(patched.get(b64('STATE'))||'','base64');
     return data.length===29?data.readBigUInt64LE(5).toString():'0';
    }
    if(method==='ft_metadata')return metadata;
    if(method==='storage_balance_bounds')return {min,max:min};
    const balance=Buffer.from(patched.get(b64(acctKey(args.account_id)))||'','base64');
    if(method==='ft_balance_of')return balance.length===16?
     (wrongLocalBalance?'999':balance.readBigUInt64LE().toString()):'0';
    if(method==='storage_balance_of')return balance.length===16?storage:null;
    throw Error('Unknown local view');
   }
  };
 }};
 const fetcher=async(_url,opts)=>{
  const p=JSON.parse(opts.body).params;
  const key=p.prefix_base64;
  queries.push(key);
  const result={block_height:HEIGHT,block_hash:drift&&key===b64(acctKey(LENDER))?'8'.repeat(43):HASH,
   values:source.has(key)?[{key,value:source.get(key)}]:[]};
  return new Response(JSON.stringify({jsonrpc:'2.0',result}),{status:200});
 };
 return {args:{root,rpc,endpoint:'https://archival-rpc.mainnet.fastnear.com',
  blockHeight:HEIGHT,lendingAccountId:LENDER,borrowerAccountId:BORROWER,
  fetcher,paceMs:0},queries,rawPatches,imports};
}
test('Stage89 copies only actual pinned wNEAR state and Rhea vault, and verifies exact FT views',async()=>{
 const f=fixture(),out=await cloneStage89WrappedNear(f.args);
 assert.equal(out.evidence.contractId,'wrap.near');
 assert.equal(out.evidence.recordsRead,2);
 assert.equal(out.evidence.recordsPatched,2);
 assert.equal(out.evidence.sourceQueryCount,3);
 assert.equal(out.evidence.sourceBlockHash,HASH);
 assert.equal(out.evidence.relevantAccountViewParityVerified,true);
 assert.equal(out.evidence.providerPaginationExhausted,false);
 assert.equal(out.evidence.fullMarketImported,false);
 assert.equal(out.evidence.verifiedLiquidationReceipts,false);
 assert.equal(out.evidence.mainnetMutated,false);
 assert.ok(!f.queries.includes(''));
 assert.deepEqual(f.imports,[{mainnetContract:'wrap.near',blockId:HEIGHT,withData:false}]);
 assert.deepEqual(f.rawPatches.map(x=>x.Data.data_key),[b64('STATE'),b64(acctKey(LENDER))]);
 assert.equal(f.rawPatches[1].Data.value,b64(u128(500n)));
});
test('Stage89 rejects missing vault, altered values, unverified prefix, block drift, and local view mismatch',async()=>{
 for(const kind of ['missingVault','wrongSourceBalance','corruptState','drift','wrongLocalBalance']){
  const f=fixture({[kind]:true});
  await assert.rejects(()=>cloneStage89WrappedNear(f.args),/STAGE89_/);
  if(['missingVault','wrongSourceBalance','corruptState','drift'].includes(kind))
   assert.equal(f.imports.length,0);
 }
});
test('Stage89 never assumes historical borrower has a registered FT account',async()=>{
 const f=fixture(),out=await cloneStage89WrappedNear(f.args);
 assert.equal(out.evidence.recordsRead,2);
 assert.deepEqual(f.queries,[b64('STATE'),b64(acctKey(LENDER)),b64(acctKey(BORROWER))]);
});
test('Stage89 one-borrower route keeps original real liquidation method, source parity, and safety gates',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const queue=await readFile(new URL('../scripts/stage76-bounded-clone-queue.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('cloneStage89WrappedNear({'));
 assert.ok(runner.includes('stage89-wnear-parity.json'));
 assert.ok(runner.includes("contracts.set('wrap.near',wrapped.contract)"));
 assert.ok(runner.includes('attestStage51PythParity({rpc,contracts'));
 assert.ok(runner.includes('actor.callRaw(lending,plan.method'));
 assert.ok(runner.includes('attestStage41SandboxSettlement({'));
 assert.ok(runner.includes('attestStage48FinalizedSandboxReplay({'));
 assert.ok(runner.indexOf("await cloneMonitor.finish()")<runner.indexOf('actor.callRaw(lending,plan.method'));
 assert.ok(queue.includes('ids.length<1||ids.length>6'));
 assert.ok(!runner.includes('broadcast_tx'));
});
