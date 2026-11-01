import {
 setupWalletSelector,actionCreators,
} from '@near-wallet-selector/core';
import type {WalletSelector} from '@near-wallet-selector/core';
import {setupMyNearWallet} from '@near-wallet-selector/my-near-wallet';
import {setupMeteorWallet} from '@near-wallet-selector/meteor-wallet';

export const TESTNET_NETWORK='testnet';
export const WALLET_IDS={myNearWallet:'my-near-wallet',meteor:'meteor-wallet'} as const;
export type WalletId=typeof WALLET_IDS[keyof typeof WALLET_IDS];
export interface LabAction{
 methodName:string;args:Record<string,unknown>;gas:string;deposit:string;
}
export interface LabTransaction{
 label:string;receiverId:string;actions:LabAction[];
}
export interface SignedTransactionResult{
 status:'sent'|'redirected';txHash:string|null;label:string;
}

let selectorPromise:Promise<WalletSelector>|null=null;
function selector(){
 selectorPromise??=setupWalletSelector({
  network:TESTNET_NETWORK,
  modules:[setupMyNearWallet(),setupMeteorWallet()],
 });
 return selectorPromise;
}
function walletError(reason:unknown,fallback:string){
 const raw=reason instanceof Error?reason.message:String(reason);
 if(/reject|denied|cancel|closed|dismiss/i.test(raw))
  return Error('WALLET_APPROVAL_REJECTED');
 if(/not installed|not available|not found/i.test(raw))return Error('WALLET_UNAVAILABLE');
 return Error(raw||fallback);
}
export async function getConnectedAccount():Promise<string|null>{
 const sel=await selector();
 const account=sel.store.getState().accounts.find(item=>item.active)??
  sel.store.getState().accounts[0];
 return account?.accountId??null;
}
export async function connectWallet(walletId:WalletId):Promise<string>{
 const sel=await selector();
 const wallet=await sel.wallet(walletId);
 try{
  const existing=await wallet.getAccounts();
  if(existing.length)return existing[0]!.accountId;
  let accounts;
  if(wallet.type==='browser'){
   accounts=await wallet.signIn({successUrl:window.location.href,
    failureUrl:window.location.href});
  }else if(wallet.type==='injected'){
   accounts=await wallet.signIn({});
  }else throw Error('WALLET_TYPE_UNSUPPORTED');
  if(!accounts.length)throw Error('WALLET_CONNECTION_REJECTED');
  return accounts[0]!.accountId;
 }catch(reason){throw walletError(reason,'WALLET_CONNECTION_FAILED')}
}
export async function disconnectWallet():Promise<void>{
 const sel=await selector();
 const id=sel.store.getState().selectedWalletId;
 if(!id)return;
 try{await (await sel.wallet(id)).signOut()}catch(reason){
  throw walletError(reason,'WALLET_DISCONNECT_FAILED');
 }
}
function toAction(action:LabAction){
 return actionCreators.functionCall(action.methodName,action.args,
  BigInt(action.gas),BigInt(action.deposit));
}
/**
 * Sign and send one owner transaction at a time. Browser wallets redirect to
 * their approval page and return no outcome; injected wallets return a receipt.
 */
export async function signLabTransaction(accountId:string,
 transaction:LabTransaction):Promise<SignedTransactionResult>{
 if(!accountId.endsWith('.testnet'))throw Error('CONNECTED_WALLET_IS_NOT_TESTNET');
 const sel=await selector();
 const id=sel.store.getState().selectedWalletId;
 if(!id)throw Error('WALLET_NOT_CONNECTED');
 const wallet=await sel.wallet(id);
 const outcome=await wallet.signAndSendTransaction({signerId:accountId,
  receiverId:transaction.receiverId,
  actions:transaction.actions.map(toAction)});
 const txHash=outcome&&typeof outcome==='object'?
  outcome.transaction_outcome?.id??null:null;
 return {status:txHash?'sent':'redirected',txHash,label:transaction.label};
}
export async function signLabTransactions(accountId:string,
 transactions:LabTransaction[],onProgress:(index:number,result:SignedTransactionResult)=>void){
 const results:SignedTransactionResult[]=[];
 for(const [index,transaction] of transactions.entries()){
  const result=await signLabTransaction(accountId,transaction);
  results.push(result);
  onProgress(index,result);
  if(result.status==='redirected')break;
 }
 return results;
}
export const walletLinks={
 myNearWallet:'https://testnet.mynearwallet.com/',
 meteor:'https://meteorwallet.app/',
 createAccount:'https://testnet.mynearwallet.com/create',
 faucet:'https://near-faucet.io/',
 faucetDocs:'https://docs.near.org/getting-started/faucet',
};
