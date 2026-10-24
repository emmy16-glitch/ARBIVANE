import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {attestWasmBytes,fetchFinalizedWasm,inspectStage24DeployedWasm} from '../src/rhea/deployed-wasm-witness.ts';

const W=Buffer.from('0061736d0100000001040160000003020100070b01076578656375746500000a040102000b','hex');
const E=Buffer.from('0061736d01000000','hex');
const BASE='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(d){
 let zero=0;while(zero<d.length&&d[zero]===0)zero++;
 let n=0n;for(const v of d)n=n*256n+BigInt(v);
 let out='';while(n){out=BASE[Number(n%58n)]+out;n/=58n;}
 return '1'.repeat(zero)+out;
}
const hash=x=>b58(createHash('sha256').update(x).digest());
const LH=hash(W),OH=hash(E),L='contract.main.burrow.near',O='aggregate-oracle.near',H='221500000';
function fixture({config={enable_pyth_oracle:true},badCodeHash=false,badBlock=false}={}){
 const calls=[];
 const rpc={
  async viewAccount(id,height){
   calls.push(['viewAccount',id,height]);
   return {blockHeight:H,codeHash:id===L?LH:OH};
  },
  async view(id,method,args,height){
   calls.push(['view',method,height]);
   return {blockHeight:H,value:
     method==='get_assets_paged'?[['usn',{supplied:{shares:'12',balance:'12'},borrowed:{shares:'4',balance:'4'}}]]:
     method==='get_num_accounts'?42:config};
  }
 };
 const fetcher=async(_url,opts)=>{
  const query=JSON.parse(opts.body);calls.push(['rpc',query.method,query.params]);
  const isLending=query.params.account_id===L;
  const bytes=isLending?W:E;
  return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify({jsonrpc:'2.0',result:{
    block_height:badBlock?Number(H)+1:Number(H),
    code_base64:bytes.toString('base64'),
    hash:badCodeHash&&isLending?OH:hash(bytes)
   }})};
 };
 return {rpc,fetcher,calls};
}
test('byte hash attestation observes execute but refuses source parity and transaction claims',async()=>{
 const result=await attestWasmBytes(L,H,LH,W.toString('base64'),LH);
 assert.equal(result.byteLength,W.length);
 assert.equal(result.executeExportPresent,true);
 assert.deepEqual(result.publicFunctionExports,['execute']);
 assert.equal(result.computedCodeHash,LH);
 assert.equal(result.sourceWasmReproduciblyMatched,false);
 assert.equal(result.liquidationRulesVerified,false);
 assert.equal(result.mayBroadcast,false);
});
test('wrong hash, false reported hash, invalid code, invalid base64 and overlong code are blocked',async()=>{
 const check=(bytes,expect=LH,reported=LH)=>attestWasmBytes(L,H,expect,bytes,reported);
 await assert.rejects(check(W.toString('base64'),OH),/WASM_HASH_MISMATCH/);
 await assert.rejects(check(W.toString('base64'),LH,OH),/WASM_HASH_MISMATCH/);
 await assert.rejects(check(Buffer.from('notwasm!').toString('base64')),/INVALID_WASM_MAGIC/);
 await assert.rejects(check('%%%invalid'),/INVALID_WASM_BASE64/);
 await assert.rejects(check('A'.repeat(17_000_000)),/INVALID_WASM_BASE64/);
 await assert.rejects(check(Buffer.from('0061736d010000000101ff','hex').toString('base64'),
   hash(Buffer.from('0061736d010000000101ff','hex')),
   hash(Buffer.from('0061736d010000000101ff','hex'))),/INVALID_DEPLOYED_WASM_MODULE/);
});
test('fresh same-block mainnet witness is always research only',async()=>{
 const {rpc,fetcher,calls}=fixture();
 const report=await inspectStage24DeployedWasm(rpc,'https://rpc.mainnet.fastnear.com',{
  lendingContract:L,oracleContract:O
 },fetcher);
 assert.equal(report.status,'DEPLOYED_CODE_BYTES_ATTESTED_SOURCE_UNVERIFIED');
 assert.equal(report.lending.codeBytesHashMatched,true);
 assert.equal(report.oracle.codeBytesHashMatched,true);
 assert.equal(report.pythOracleEnabled,true);
 assert.equal(report.oracleAccountPointerStatus,'NOT_EXPOSED_IN_CONFIG');
 assert.equal(report.liquidationMethodSurfaceObserved,true);
 assert.equal(report.executionEnabled,false);
 assert.equal(report.deployedLiquidationRulesVerified,false);
 assert.ok(calls.filter(x=>x[0]==='rpc').every(x=>x[2].block_id===Number(H)&&x[2].request_type==='view_code'));
});
test('oracle config mismatch, code mismatch and cross-block code are fail closed',async()=>{
 const a=fixture({config:{oracle_account_id:'unknown-oracle.near'}});
 await assert.rejects(inspectStage24DeployedWasm(a.rpc,'https://rpc.mainnet.fastnear.com',{lendingContract:L,oracleContract:O},a.fetcher),/CONFIG_ORACLE_MISMATCH/);
 const b=fixture({badCodeHash:true});
 await assert.rejects(inspectStage24DeployedWasm(b.rpc,'https://rpc.mainnet.fastnear.com',{lendingContract:L,oracleContract:O},b.fetcher),/WASM_HASH_MISMATCH/);
 const c=fixture({badBlock:true});
 await assert.rejects(inspectStage24DeployedWasm(c.rpc,'https://rpc.mainnet.fastnear.com',{lendingContract:L,oracleContract:O},c.fetcher),/CROSS_BLOCK/);
});
test('explicit oracle match records pointer without source-parity claims',async()=>{
 const f=fixture({config:{oracle_account_id:O,enable_pyth_oracle:false}});
 const report=await inspectStage24DeployedWasm(f.rpc,'https://rpc.mainnet.fastnear.com',{lendingContract:L,oracleContract:O},f.fetcher);
 assert.equal(report.oracleAccountPointerStatus,'EXPLICIT_MATCH');
 assert.equal(report.pythOracleEnabled,false);
 assert.equal(report.sourceWasmReproduciblyMatched,false);
});
test('malformed RPC response, unsafe transport and huge envelope fail closed',async()=>{
 await assert.rejects(fetchFinalizedWasm('http://rpc.mainnet.fastnear.com',L,H),/RPC_HTTPS_REQUIRED/);
 const fake=async()=>({ok:true,status:200,headers:{get:()=>null},
  text:async()=>JSON.stringify({result:{block_height:Number(H),code_base64:W.toString('base64')}})});
 await assert.rejects(fetchFinalizedWasm('https://test.invalid',L,H,fake),/CROSS_BLOCK_OR_INVALID_CODE_RESPONSE/);
 const huge=async()=>({ok:true,status:200,headers:{get:()=>String(25000000)},text:async()=>{throw Error('should not read');}});
 await assert.rejects(fetchFinalizedWasm('https://test.invalid',L,H,huge),/RESPONSE_TOO_LARGE/);
});
test('workflow is mainnet read only and prohibits runtime authorization',async()=>{
 const {readFile}=await import('node:fs/promises');
 const wf=await readFile(new URL('../.github/workflows/rhea-stage24-deployed-wasm-witness.yml',import.meta.url),'utf8');
 assert.ok(wf.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(wf.includes('.lending.codeBytesHashMatched == true'));
 assert.ok(wf.includes('.sourceWasmReproduciblyMatched == false'));
 assert.ok(wf.includes('.mayBroadcast == false'));
 assert.ok(!wf.includes('near transaction sign'));
 assert.ok(!wf.includes('broadcast_tx'));
});
