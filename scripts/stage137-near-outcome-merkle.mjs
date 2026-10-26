import {createHash} from 'node:crypto';
/** Stage137 read-only NEAR light-client outcome Merkle verification.
 * Source: NEAR Nomicon LightClient: outcome leaf is SHA256(Borsh(hash list
 * [execution_id, hash(PartialExecutionOutcome), ...hash(logs)])).
 * A header/root returned by one RPC provider is NOT an authenticated
 * validator-approved light-client head. Never infer mainnet permission.
 */
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fail=(s)=>{throw Error('STAGE137_'+s);};
const sha=(value)=>createHash('sha256').update(value).digest();
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const u=(value,bits)=>{
 if(!(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)||
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0))
  fail('INVALID_UNSIGNED_INTEGER');
 const n=BigInt(value);
 if(n>=1n<<BigInt(bits))fail('UNSIGNED_INTEGER_OVERFLOW');
 const b=Buffer.alloc(bits/8);
 for(let i=0;i<b.length;i++)b[i]=Number(n>>BigInt(i*8)&255n);
 return b;
};
const vec=arr=>Buffer.concat([u(arr.length,32),...arr]);
const str=s=>{
 if(typeof s!=='string'||s.length>4096||Buffer.from(s,'utf8').toString('utf8')!==s)
  fail('INVALID_STRING');
 const data=Buffer.from(s,'utf8');
 return Buffer.concat([u(data.length,32),data]);
};
export function stage137DecodeHash(s){
 if(typeof s!=='string'||s.length<32||s.length>44)fail('INVALID_HASH_BASE58');
 let n=0n,zeros=0;
 for(const c of s){const i=alphabet.indexOf(c);if(i<0)fail('INVALID_HASH_BASE58');
  n=n*58n+BigInt(i);}
 for(const c of s){if(c!=='1')break;zeros++;}
 const body=[];
 while(n>0n){body.unshift(Number(n&255n));n>>=8n;}
 const result=Buffer.concat([Buffer.alloc(zeros),Buffer.from(body)]);
 if(result.length!==32)fail('INVALID_HASH_SIZE');
 return result;
}
export function stage137MerkleRoot(leaf,path){
 if(!Buffer.isBuffer(leaf)||leaf.length!==32||!Array.isArray(path)||
  path.length>64)fail('INVALID_MERKLE_PATH');
 let root=leaf;
 for(const item of path){
  if(!obj(item)||!['Left','Right'].includes(item.direction))
   fail('INVALID_MERKLE_DIRECTION');
  const other=stage137DecodeHash(item.hash);
  root=item.direction==='Left'?sha(Buffer.concat([other,root])):
   sha(Buffer.concat([root,other]));
 }
 return root;
}
export function stage137OutcomeLeaf(proof){
 if(!obj(proof)||!obj(proof.outcome)||!Array.isArray(proof.outcome.receipt_ids)||
  proof.outcome.receipt_ids.length>512||
  !Array.isArray(proof.outcome.logs)||proof.outcome.logs.length>1024)
  fail('INVALID_OUTCOME');
 const o=proof.outcome,st=o.status;
 let status;
 if(st==='Unknown')status=Buffer.from([0]);
 else if(obj(st)&&Object.keys(st).length===1&&Object.hasOwn(st,'SuccessValue')){
  const value=st.SuccessValue;
  if(typeof value!=='string'||value.length>262144||
   !/^[A-Za-z0-9+/]*={0,2}$/.test(value))fail('INVALID_SUCCESS_VALUE');
  const b=Buffer.from(value,'base64');
  if(b.toString('base64')!==value)fail('NONCANONICAL_SUCCESS_VALUE');
  status=Buffer.concat([Buffer.from([2]),u(b.length,32),b]);
 }else if(obj(st)&&Object.keys(st).length===1&&Object.hasOwn(st,'SuccessReceiptId'))
  status=Buffer.concat([Buffer.from([3]),stage137DecodeHash(st.SuccessReceiptId)]);
 else if(obj(st)&&Object.keys(st).length===1&&Object.hasOwn(st,'Failure'))
  status=Buffer.from([1]); // NEAR partial failure encoding has no debug data
 else fail('INVALID_OUTCOME_STATUS');
 if(typeof o.executor_id!=='string'||!/^[-a-z0-9._]{2,64}$/.test(o.executor_id))
  fail('INVALID_EXECUTOR_ID');
 const partial=Buffer.concat([
  vec(o.receipt_ids.map(stage137DecodeHash)),
  u(o.gas_burnt,64),u(o.tokens_burnt,128),str(o.executor_id),status,
 ]);
 const parts=[
  stage137DecodeHash(proof.id),sha(partial),
  ...o.logs.map(log=>{
   if(typeof log!=='string'||Buffer.byteLength(log)>16384)fail('INVALID_LOG');
   return sha(Buffer.from(log,'utf8'));
  }),
 ];
 return sha(vec(parts));
}
export function stage137LiteBlockHash(header){
 if(!obj(header)||!obj(header.inner_lite))fail('INVALID_LITE_BLOCK_HEADER');
 const x=header.inner_lite;
 const lite=Buffer.concat([
  u(x.height,64),
  stage137DecodeHash(x.epoch_id),
  stage137DecodeHash(x.next_epoch_id),
  stage137DecodeHash(x.prev_state_root),
  stage137DecodeHash(x.outcome_root),
  u(x.timestamp_nanosec,64),
  stage137DecodeHash(x.next_bp_hash),
  stage137DecodeHash(x.block_merkle_root),
 ]);
 const inner=sha(Buffer.concat([sha(lite),stage137DecodeHash(header.inner_rest_hash)]));
 return sha(Buffer.concat([inner,stage137DecodeHash(header.prev_block_hash)]));
}
export function stage137CheckOutcomeProof({
 proof,expectedId,expectedExecutorId,lightClientHeadBlockMerkleRoot
}){
 if(!obj(proof)||!obj(proof.outcome_proof)||!obj(proof.block_header_lite)||
  typeof expectedId!=='string'||typeof expectedExecutorId!=='string')
  fail('INVALID_PROOF_ENVELOPE');
 const p=proof.outcome_proof;
 if(p.id!==expectedId||p.outcome?.executor_id!==expectedExecutorId)
  fail('OUTCOME_IDENTITY_MISMATCH');
 const leaf=stage137OutcomeLeaf(p);
 const shardRoot=stage137MerkleRoot(leaf,p.proof);
 // Each shard-root is itself SHA256'd before being placed in block tree.
 const outcomeRoot=stage137MerkleRoot(sha(shardRoot),proof.outcome_root_proof);
 if(!outcomeRoot.equals(stage137DecodeHash(proof.block_header_lite.inner_lite?.outcome_root)))
  fail('OUTCOME_ROOT_MISMATCH');
 const blockHash=stage137LiteBlockHash(proof.block_header_lite);
 if(!blockHash.equals(stage137DecodeHash(p.block_hash)))
  fail('LITE_BLOCK_HASH_MISMATCH');
 const blockPathRoot=stage137MerkleRoot(blockHash,proof.block_proof);
 if(!blockPathRoot.equals(stage137DecodeHash(lightClientHeadBlockMerkleRoot)))
  fail('BLOCK_PROOF_HEAD_ROOT_MISMATCH');
 return {
  mode:'STAGE137_NEAR_OUTCOME_MERKLE_PATH_CROSSCHECK',
  chain:'NEAR_MAINNET_READ_ONLY_PROOF',
  executionId:expectedId,executorId:expectedExecutorId,
  outcomeRootMatchesSuppliedHeader:true,
  blockHashMatchesSuppliedLiteHeader:true,
  blockPathMatchesSuppliedHeadRoot:true,
  // The supplied head root has NOT been authenticated with validator
  // approvals and epoch transitions; RPC response by itself is not trust.
  independentlyAuthenticatedLightClientHead:false,
  verifiedCanonicalMainnetInclusion:false,
  importedStateRootParityVerified:false,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 };
}
