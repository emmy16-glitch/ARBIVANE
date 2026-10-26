import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {encodeStage136NearTransactionV0,verifyStage136NearTransactionPreimage} from '../scripts/stage136-near-borsh-preimage.mjs';

const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58=bytes=>{
 let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='';
 while(n){const r=Number(n%58n);s=alphabet[r]+s;n/=58n;}
 for(const v of bytes){if(v!==0)break;s='1'+s;}
 return s||'1';
};
const material=()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const publicDer=publicKey.export({type:'spki',format:'der'});
 const pub='ed25519:'+b58(publicDer.subarray(-32));
 const blockHash=b58(Buffer.alloc(32,17));
 const tx={signer_id:'arbivane-replay.test.near',receiver_id:'contract.main.burrow.near',
  public_key:pub,nonce:67000006,priority_fee:0,
  actions:[{FunctionCall:{method_name:'execute_with_pyth',
   args:Buffer.from('{"actions":[{"Borrow":{}}]}').toString('base64'),
   gas:300000000000000,deposit:'1'}}]};
 const serialized=encodeStage136NearTransactionV0(tx,blockHash);
 const hash=createHash('sha256').update(serialized).digest();
 tx.hash=b58(hash);tx.signature='ed25519:'+b58(sign(null,hash,privateKey));
 return {raw:{transaction:tx,transaction_outcome:{id:tx.hash}},
  before:{block:{header:{height:86,hash:blockHash}}},
  encoded:serialized};
};
test('Stage136 reconstructs all legacy NEAR Borsh fields and verifies signed hash',()=>{
 const {raw,before,encoded}=material();
 const result=verifyStage136NearTransactionPreimage(raw,before);
 assert.equal(result.reconstructedBorshHashMatchesSignedTransaction,true);
 assert.equal(result.ed25519SignatureOverComputedHashVerified,true);
 assert.equal(result.borshBytesBase64,encoded.toString('base64'));
 assert.equal(result.referenceBlockHeight,86);
 assert.equal(result.receiptOutcomeMerkleInclusionVerified,false);
 assert.equal(result.mainnetExecutionEnabled,false);
});
test('Stage136 rejects any changed signed field, reference header, public key, signature or hash',()=>{
 const original=material();
 const changes=[
  [r=>{r.raw.transaction.nonce+=1;},'BORSH_SHA256_TRANSACTION_HASH_MISMATCH'],
  [r=>{r.raw.transaction.actions[0].FunctionCall.deposit='2';},'BORSH_SHA256_TRANSACTION_HASH_MISMATCH'],
  [r=>{r.raw.transaction.actions[0].FunctionCall.gas-=1;},'BORSH_SHA256_TRANSACTION_HASH_MISMATCH'],
  [r=>{r.before.block.header.hash=b58(Buffer.alloc(32,18));},'BORSH_SHA256_TRANSACTION_HASH_MISMATCH'],
  [r=>{r.raw.transaction.priority_fee=1;},'UNSUPPORTED_TX_VERSION'],
  [r=>{r.raw.transaction.hash=b58(Buffer.alloc(32,19));},'BORSH_SHA256_TRANSACTION_HASH_MISMATCH'],
  [r=>{r.raw.transaction.signature='ed25519:'+b58(Buffer.alloc(64,7));},'ED25519_PREIMAGE_SIGNATURE_INVALID'],
  [r=>{r.raw.transaction.public_key='secp256k1:xxx';},'UNTRUSTED_SIGNER'],
  [r=>{r.raw.transaction_outcome.id=b58(Buffer.alloc(32,20));},'ORIGINAL_TRANSACTION_OUTCOME_DRIFT'],
 ];
 for(const [mutate,code] of changes){
  const input={raw:structuredClone(original.raw),before:structuredClone(original.before)};
  mutate(input);
  assert.throws(()=>verifyStage136NearTransactionPreimage(input.raw,input.before),new RegExp('STAGE136_'+code));
 }
});
test('Stage136 refuses unsupported ambiguous action layouts and absent authentic block',()=>{
 const x=material();
 x.raw.transaction.actions.push({Transfer:{deposit:'1'}});
 assert.throws(()=>verifyStage136NearTransactionPreimage(x.raw,x.before),/STAGE136_UNSUPPORTED_ACTIONS/);
 const y=material();
 delete y.before.block.header.hash;
 assert.throws(()=>verifyStage136NearTransactionPreimage(y.raw,y.before),/STAGE136_MISSING_AUTHENTIC_REFERENCE_BLOCK/);
});
