import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stage137OutcomeLeaf,stage137MerkleRoot,stage137LiteBlockHash,stage137CheckOutcomeProof} from '../scripts/stage137-near-outcome-merkle.mjs';
import {stage138MainnetSpendingAdmission} from '../scripts/stage138-mainnet-spending-admission.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58=bytes=>{
 let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='';
 while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}
 for(const x of bytes){if(x!==0)break;s='1'+s;}
 return s||'1';
};
const bytes=n=>Buffer.alloc(32,n);
const sha=b=>createHash('sha256').update(b).digest();
const fixture=()=>{
 const id=b58(bytes(1)),hash=b58(bytes(2));
 const o={
  id,block_hash:null,
  outcome:{executor_id:'contract.main.burrow.near',
   logs:['EVENT_JSON:{"event":"liquidate"}'],
   receipt_ids:[b58(bytes(3))],gas_burnt:'30000000000000',
   tokens_burnt:'9000000000000000000',status:{SuccessValue:''}},
  proof:[{direction:'Left',hash:b58(bytes(4))}]
 };
 const leaf=stage137OutcomeLeaf(o);
 const shard=stage137MerkleRoot(leaf,o.proof);
 const outcomeRoot=stage137MerkleRoot(sha(shard),[{direction:'Right',hash:b58(bytes(5))}]);
 const header={
  prev_block_hash:b58(bytes(6)),inner_rest_hash:b58(bytes(7)),
  inner_lite:{height:225000000,epoch_id:b58(bytes(8)),
   next_epoch_id:b58(bytes(9)),prev_state_root:b58(bytes(10)),
   outcome_root:b58(outcomeRoot),timestamp_nanosec:'1710000000000000000',
   next_bp_hash:b58(bytes(11)),block_merkle_root:b58(bytes(12))}
 };
 const block=stage137LiteBlockHash(header);
 o.block_hash=b58(block);
 const blockProof=[{direction:'Left',hash:b58(bytes(13))}];
 const root=stage137MerkleRoot(block,blockProof);
 return {proof:{outcome_proof:o,block_header_lite:header,
  outcome_root_proof:[{direction:'Right',hash:b58(bytes(5))}],block_proof:blockProof},
  expectedId:id,expectedExecutorId:o.outcome.executor_id,
  lightClientHeadBlockMerkleRoot:b58(root)};
};
test('Stage137 independently reconstructs NEAR outcome leaf, shard tree, lite block and block-path root',()=>{
 const r=stage137CheckOutcomeProof(fixture());
 assert.equal(r.outcomeRootMatchesSuppliedHeader,true);
 assert.equal(r.blockHashMatchesSuppliedLiteHeader,true);
 assert.equal(r.blockPathMatchesSuppliedHeadRoot,true);
 assert.equal(r.independentlyAuthenticatedLightClientHead,false);
 assert.equal(r.verifiedCanonicalMainnetInclusion,false);
 assert.equal(r.maySignMainnet,false);
});
test('Stage137 fails closed on altered outcome, logs, Merkle path, header, block or external head',()=>{
 const mutations=[
  [x=>x.proof.outcome_proof.outcome.gas_burnt='30000000000001','OUTCOME_ROOT_MISMATCH'],
  [x=>x.proof.outcome_proof.outcome.logs[0]='FORGED','OUTCOME_ROOT_MISMATCH'],
  [x=>x.proof.outcome_proof.proof[0].direction='Right','OUTCOME_ROOT_MISMATCH'],
  [x=>x.proof.outcome_proof.proof[0].hash=b58(bytes(15)),'OUTCOME_ROOT_MISMATCH'],
  [x=>x.proof.outcome_root_proof[0].hash=b58(bytes(16)),'OUTCOME_ROOT_MISMATCH'],
  [x=>x.proof.block_header_lite.inner_lite.height+=1,'LITE_BLOCK_HASH_MISMATCH'],
  [x=>x.lightClientHeadBlockMerkleRoot=b58(bytes(17)),'BLOCK_PROOF_HEAD_ROOT_MISMATCH'],
  [x=>x.proof.outcome_proof.id=b58(bytes(18)),'OUTCOME_IDENTITY_MISMATCH'],
 ];
 for(const [mutate,code] of mutations){
  const x=fixture();mutate(x);
  assert.throws(()=>stage137CheckOutcomeProof(x),new RegExp('STAGE137_'+code));
 }
});
test('Stage137 requires canonical Merkle directions and bounded no-fake proof',()=>{
 const x=fixture();x.proof.block_proof[0].direction='Above';
 assert.throws(()=>stage137CheckOutcomeProof(x),/STAGE137_INVALID_MERKLE_DIRECTION/);
 const y=fixture();y.proof.outcome_proof.outcome.status={SuccessValue:'!!!'};
 assert.throws(()=>stage137CheckOutcomeProof(y),/STAGE137_INVALID_SUCCESS_VALUE/);
});
const safe={
 network:'NEAR_MAINNET',
 wallet:{accountId:'operator.near',authorizedOwnerPublicKey:'ed25519:abc'},
 policy:{maxPerTradeYocto:'1000',maxDailySpendYocto:'10000',
  maxLossYocto:'400',minRealizedNetProfitYocto:'20'},
 candidate:{borrowerAccountId:'debtor.near',lendingContractId:'contract.main.burrow.near',
  requiredCapitalYocto:'600',alreadySpentTodayYocto:'100',worstCaseLossYocto:'300',
  currentMainnetEligibilityVerified:true,currentMainnetOracleVerified:true,
  mainnetVaultCapacityVerified:true,currentSourceWasmCodeHashMatches:true,
  finalizedSandboxAccountingMatchesCurrentWasm:true},
 quote:{unit:'NEAR_YOCTO_EQUIVALENT_USING_VERIFIED_LIVE_QUOTES',
  observedAtMs:9990,expiresAtMs:11000,
  expectedSettlementProceedsYocto:'900',fundingCostYocto:'600',
  swapAndSlippageCostYocto:'80',gasCostYocto:'50',storageCostYocto:'20',
  externalSwapFillGuaranteed:true,gasAndStorageIncluded:true,
  competingLiquidatorsRiskBounded:true}
};
test('Stage138 refuses to convert user request or attractive paper profit into wallet signing',()=>{
 const r=stage138MainnetSpendingAdmission(safe,{nowMs:10000});
 assert.equal(r.reviewInputsPassExceptUnimplementedGates,true);
 assert.equal(r.projectedNetYoctoEquivalent,'150');
 assert.equal(r.admissibleForActualMainnetBroadcast,false);
 assert.deepEqual(r.issues,[
  'CHAIN_ACCESS_KEY_AND_SIGNED_OWNER_APPROVAL_UNVERIFIED',
  'MAINNET_SIGNER_BROADCASTER_NOT_IMPLEMENTED_OR_AUDITED'
 ]);
 assert.equal(r.maySignMainnet,false);
});
test('Stage138 rejects omitted limits, expired quotes, losses, low profits and oversized spend',()=>{
 for(const mutate of [
  x=>delete x.policy.maxPerTradeYocto,
  x=>x.policy.maxPerTradeYocto='20',
  x=>x.policy.maxDailySpendYocto='500',
  x=>x.policy.maxLossYocto='200',
  x=>x.quote.expiresAtMs=9999,
  x=>x.quote.gasCostYocto='9000',
  x=>x.candidate.currentMainnetOracleVerified=false,
  x=>x.quote.unit='LIDO_TOKEN_WITHOUT_NEAR_CONVERSION',
  x=>x.wallet.accountId='arbivane-replay.test.near',
 ]){
  const x=structuredClone(safe);mutate(x);
  const r=stage138MainnetSpendingAdmission(x,{nowMs:10000});
  assert.equal(r.reviewInputsPassExceptUnimplementedGates,false);
  assert.equal(r.mayBroadcastMainnet,false);
 }
});
