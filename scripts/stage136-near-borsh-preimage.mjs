import {createHash,createPublicKey,verify} from 'node:crypto';

/** Stage136: independently construct legacy NEAR TransactionV0 Borsh bytes.
 * The Sandbox final-status JSON omits transaction.block_hash. The authentic
 * pre-execution Sandbox block header provides that missing signed field.
 * Versioned V1, delegated, alternate keys/actions fail CLOSED, not guessed.
 */
const abc='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const check=(ok,code)=>{if(!ok)throw Error('STAGE136_'+code);};
const integer=(v,limit,label)=>{
 check((typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v))||
  (typeof v==='number'&&Number.isSafeInteger(v)&&v>=0),label);
 const n=BigInt(v);check(n>=0n&&n<(1n<<BigInt(limit)),label);
 return n;
};
export function decodeStage136Base58(value,bytes){
 check(typeof value==='string'&&value.length>0&&value.length<=100,'BAD_BASE58');
 let n=0n;
 for(const c of value){const k=abc.indexOf(c);check(k>=0,'BAD_BASE58');
  n=n*58n+BigInt(k);}
 let z=0;for(const c of value){if(c!=='1')break;z++;}
 const result=[];
 while(n>0n){result.unshift(Number(n&255n));n>>=8n;}
 const out=Buffer.concat([Buffer.alloc(z),Buffer.from(result)]);
 check(out.length===bytes,'BAD_BASE58_LENGTH');
 return out;
}
const le=(v,bits,label)=>{
 const n=integer(v,bits,label),b=Buffer.alloc(bits/8);
 for(let i=0;i<b.length;i++)b[i]=Number((n>>BigInt(8*i))&255n);
 return b;
};
const utf=s=>{
 check(typeof s==='string'&&s.length>0&&s.length<=1024,'BAD_TEXT');
 const b=Buffer.from(s,'utf8');
 check(b.toString('utf8')===s&&b.length<65536,'BAD_UTF8');
 return Buffer.concat([le(b.length,32,'TEXT_LENGTH'),b]);
};
export function encodeStage136NearTransactionV0(tx,referenceBlockHash){
 check(tx&&typeof tx==='object'&&!Array.isArray(tx),'MISSING_TRANSACTION');
 // V0 has NO priority fee field, even though JSON-RPC renders a 0.
 check((tx.priority_fee===0||tx.priority_fee==='0'||tx.priority_fee===undefined)&&
  tx.nonce_mode===undefined&&tx.version===undefined,'UNSUPPORTED_TX_VERSION');
 check(typeof tx.signer_id==='string'&&
  typeof tx.receiver_id==='string'&&
  /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/.test(tx.public_key??''),
  'UNTRUSTED_SIGNER');
 const key=decodeStage136Base58(tx.public_key.slice(8),32);
 const blockHash=decodeStage136Base58(referenceBlockHash,32);
 check(Array.isArray(tx.actions)&&tx.actions.length===1,'UNSUPPORTED_ACTIONS');
 const a=tx.actions[0];
 check(a&&typeof a==='object'&&Object.keys(a).length===1&&
  a.FunctionCall&&typeof a.FunctionCall==='object'&&
  Object.keys(a.FunctionCall).sort().join(',')==='args,deposit,gas,method_name',
  'UNSUPPORTED_ACTION');
 const f=a.FunctionCall;
 check(typeof f.args==='string'&&f.args.length<=2000000&&
  /^[A-Za-z0-9+/]*={0,2}$/.test(f.args),'INVALID_ACTION_ARGS');
 const args=Buffer.from(f.args,'base64');
 check(args.toString('base64')===f.args,'NONCANONICAL_ACTION_ARGS');
 return Buffer.concat([
  utf(tx.signer_id),Buffer.from([0]),key,
  le(tx.nonce,64,'NONCE'),utf(tx.receiver_id),blockHash,
  le(1,32,'ACTIONS_COUNT'),Buffer.from([2]),
  utf(f.method_name),le(args.length,32,'ARGS_LENGTH'),args,
  le(f.gas,64,'GAS'),le(f.deposit,128,'DEPOSIT'),
 ]);
}
export function verifyStage136NearTransactionPreimage(raw,preState){
 const tx=raw?.transaction??raw?.result?.transaction;
 check(tx&&typeof tx==='object'&&typeof tx.hash==='string'&&
  typeof tx.signature==='string'&&tx.signature.startsWith('ed25519:')&&
  tx.signer_id!=='','UNTRUSTED_TRANSACTION');
 const block=preState?.block;
 check(block?.header&&Number.isSafeInteger(block.header.height)&&
  block.header.height>=1&&typeof block.header.hash==='string',
  'MISSING_AUTHENTIC_REFERENCE_BLOCK');
 const bytes=encodeStage136NearTransactionV0(tx,block.header.hash);
 const digest=createHash('sha256').update(bytes).digest();
 const signedHash=decodeStage136Base58(tx.hash,32);
 check(digest.equals(signedHash),'BORSH_SHA256_TRANSACTION_HASH_MISMATCH');
 const keyBytes=decodeStage136Base58(tx.public_key.slice(8),32);
 const signature=decodeStage136Base58(tx.signature.slice(8),64);
 const key=createPublicKey({key:Buffer.concat([
  Buffer.from('302a300506032b6570032100','hex'),keyBytes]),
  format:'der',type:'spki'});
 check(verify(null,digest,key,signature),'ED25519_PREIMAGE_SIGNATURE_INVALID');
 check(raw?.transaction_outcome?.id===tx.hash||
  raw?.result?.transaction_outcome?.id===tx.hash,
  'ORIGINAL_TRANSACTION_OUTCOME_DRIFT');
 return {
  mode:'STAGE136_INDEPENDENT_NEAR_V0_BORSH_TRANSACTION_PREIMAGE',
  chain:'NEAR_SANDBOX',transactionVersion:'V0_LEGACY',
  transactionId:tx.hash,signerId:tx.signer_id,
  referenceBlockHeight:block.header.height,
  referenceBlockHash:block.header.hash,
  borshBytesBase64:bytes.toString('base64'),
  borshByteCount:bytes.length,computedTransactionSha256Hex:digest.toString('hex'),
  reconstructedBorshHashMatchesSignedTransaction:true,
  ed25519SignatureOverComputedHashVerified:true,
  // These require different, independently authenticated witnesses.
  receiptOutcomeMerkleInclusionVerified:false,
  importedMainnetStateTrieRootVerified:false,
  mainnetExecutionEnabled:false,realizedNetProfitVerified:false,
 };
}
