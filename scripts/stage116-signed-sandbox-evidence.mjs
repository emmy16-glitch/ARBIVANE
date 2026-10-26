import {createPublicKey,verify,createHash} from 'node:crypto';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decode58(value,length) {
 if(typeof value!=='string'||value.length<1||value.length>100)
  throw Error('STAGE116_INVALID_BASE58_EVIDENCE');
 let n=0n;
 for(const ch of value){
  const digit=alphabet.indexOf(ch);
  if(digit<0)throw Error('STAGE116_INVALID_BASE58_EVIDENCE');
  n=n*58n+BigInt(digit);
 }
 const bytes=[];
 while(n){bytes.unshift(Number(n&255n));n>>=8n;}
 for(const ch of value){if(ch!=='1')break;bytes.unshift(0);}
 if(bytes.length!==length)throw Error('STAGE116_INVALID_BASE58_LENGTH');
 return Buffer.from(bytes);
}
// NEAR signs SHA256(Borsh(transaction)); its base58 encoding is the tx hash.
// Verify that signature with Node's Ed25519 implementation, not a success flag.
// This does not claim independent Merkle verification of callback outcomes.
export function signedSandboxEvidence(raw,{signerId,receiverId}) {
 const result=raw?.result??raw, tx=result?.transaction;
 if(!tx||tx.signer_id!==signerId||tx.receiver_id!==receiverId||
  result.transaction_outcome?.id!==tx.hash||
  typeof tx.public_key!=='string'||!tx.public_key.startsWith('ed25519:')||
  typeof tx.signature!=='string'||!tx.signature.startsWith('ed25519:')||
  !Array.isArray(result.receipts_outcome)||result.receipts_outcome.length<1)
  throw Error('STAGE116_SIGNED_TRANSACTION_EVIDENCE_REQUIRED');
 const key=decode58(tx.public_key.slice(8),32);
 const signature=decode58(tx.signature.slice(8),64);
 const hash=decode58(tx.hash,32);
 const publicKey=createPublicKey({key:Buffer.concat([
  Buffer.from('302a300506032b6570032100','hex'),key]),format:'der',type:'spki'});
 if(!verify(null,hash,publicKey,signature))
  throw Error('STAGE116_TRANSACTION_SIGNATURE_INVALID');
 const canonicalResult=JSON.stringify(result,null,2)+'\n';
 return {canonicalResult,manifest:{
  mode:'ARBIVANE_STAGE116_SIGNED_SANDBOX_TRANSACTION',chain:'NEAR_SANDBOX',
  transactionId:tx.hash,signerId,receiverId,publicKey:tx.public_key,
  transactionSignature:tx.signature,transactionHashSignatureVerified:true,
  outcomeMerkleProofIndependentlyVerified:false,
  receiptIds:result.receipts_outcome.map(row=>row.id),
  rawResultSha256:createHash('sha256').update(canonicalResult).digest('hex'),
  mainnetExecutionEnabled:false,settlementVerified:false,
 }};
}
