import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomBytes,createHash} from 'node:crypto';
import {signedSandboxEvidence} from '../scripts/stage116-signed-sandbox-evidence.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode58(bytes){
 let n=BigInt('0x'+bytes.toString('hex')),out='';
 while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}
 for(const b of bytes){if(b!==0)break;out='1'+out;}
 return out;
}
function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const hash=randomBytes(32),id=encode58(hash);
 return {transaction:{hash:id,signer_id:'actor.test.near',receiver_id:'lender.near',
  public_key:'ed25519:'+encode58(publicKey.export({format:'der',type:'spki'}).subarray(-32)),
  signature:'ed25519:'+encode58(sign(null,hash,privateKey))},
  transaction_outcome:{id},receipts_outcome:[{id:'receipt-1',proof:[],outcome:{status:{SuccessValue:''}}}]};
}
const expected={signerId:'actor.test.near',receiverId:'lender.near'};
test('signed evidence verifies a real Ed25519 signature and preserves raw outcome proof paths',()=>{
 const raw=fixture(),e=signedSandboxEvidence({result:raw,config:{private_key:'must never serialize'}},expected);
 assert.equal(e.manifest.transactionId,raw.transaction.hash);
 assert.equal(e.manifest.transactionHashSignatureVerified,true);
 assert.equal(e.manifest.outcomeMerkleProofIndependentlyVerified,false);
 assert.equal(e.manifest.rawResultSha256,createHash('sha256').update(e.canonicalResult).digest('hex'));
 assert.deepEqual(JSON.parse(e.canonicalResult),raw);
 assert.ok(!e.canonicalResult.includes('private_key'));
});
test('tampered hash, wrong signer or mismatched transaction outcome must fail',()=>{
 const raw=fixture();
 assert.throws(()=>signedSandboxEvidence(raw,{...expected,signerId:'other.near'}),/EVIDENCE_REQUIRED/);
 const tampered=structuredClone(raw);
 tampered.transaction.hash=encode58(randomBytes(32));tampered.transaction_outcome.id=tampered.transaction.hash;
 assert.throws(()=>signedSandboxEvidence(tampered,expected),/SIGNATURE_INVALID/);
 raw.transaction_outcome.id='different';
 assert.throws(()=>signedSandboxEvidence(raw,expected),/EVIDENCE_REQUIRED/);
});
