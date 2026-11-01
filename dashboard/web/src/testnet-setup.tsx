import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
 ArrowClockwise,ArrowSquareOut,ArrowUpRight,CheckCircle,Copy,Cube,
 CurrencyDollar,Flask,LinkSimple,LockKey,ShieldCheck,Wallet,
 WarningCircle,XCircle,
} from '@phosphor-icons/react';
import {
 connectWallet,disconnectWallet,getConnectedAccount,signLabTransactions,
 walletLinks,WALLET_IDS,
} from './near-wallet';
import type {LabTransaction,SignedTransactionResult,WalletId} from './near-wallet';

const OWNER_KEY='arbivane-lab-owner-v1';
const TESTNET_OWNER=/^[a-z0-9][a-z0-9_.-]{0,56}\.testnet$/;
const ACCOUNT_PROOF_TIMEOUT=15000;

interface AccountView{
 accountId:string;exists:boolean;codeHash:string|null;balanceYocto:string|null;
 sourceBlock:number|null;
}
interface TokenRow{
 role:string;accountId:string;symbol:string;decimals:number;marketAsset:boolean;
}
interface StorageBalance{total?:string;available?:string}
interface PositionRow{tokenId:string;atomic:string;shares?:string|null}
interface Position{
 supplied:PositionRow[];collateral:PositionRow[];borrowed:PositionRow[];
}
interface HealthModel{health:number;healthy:boolean;healthyBps:number}
interface LiquidationProof{
 verified:boolean;error?:string;txHash?:string;finalExecutionStatus?:string;
 outAsset?:{tokenId:string;atomic:string};inAsset?:{tokenId:string;atomic:string};
 event?:unknown;balanceDeltas?:unknown;
}
interface LabState{
 network:'testnet';readiness:string;ownerAccountId:string;
 accounts:Record<string,AccountView>;codeChecks:Record<string,{
  expected:string|null;observed:string|null;verified:boolean}>;
 codeVerified:boolean;initialized:boolean;
 config:{oracle_account_id?:string;owner_id?:string}|null;
 configError:string|null;configVerified:boolean;
 assetsVerified:boolean;reservesVerified:boolean;storageVerified:boolean;
 metadataVerified:boolean;
 metadata:Record<string,{symbol?:string;decimals?:number;error?:string}>;
 storage:Record<string,Record<string,StorageBalance|null|{error:string}>>;
 balances:Record<string,Record<string,string|{error:string}>>;
 positions:{borrower:Position|null;liquidator:Position|null};
 healthModels:{healthy:HealthModel;unhealthy:HealthModel}|null;
 liquidationEligibilityModeled:boolean;
 liquidation:LiquidationProof|null;liquidationTransactionVerified:boolean;
 withdraw:LiquidationProof|null;withdrawVerified:boolean;
 verifiedLiquidations:number;realizedTestNotional:number|null;
 priceSource:string;oracleType:string;sourceBlock:number;checkedAt:string;
 signerConnected:false;executionEnabled:false;mainnetExecutionAllowed:false;
}
interface AccountProof{
 accountId:string;network:string;balanceNear:string;balanceYocto:string;
 sourceBlock:number;checkedAt:string;canSign:boolean;signerConnected:boolean;
}
interface IntentResponse{
 network:'testnet';owner:string;accountId:string;readiness:string;
 requiresWalletApproval:true;transactions:LabTransaction[];next:string;
}
type BusyKind='wallet'|'proof'|'lab'|'intents'|'sign'|'receipt'|null;

function errorText(reason:unknown){
 const code=reason instanceof Error?reason.message:String(reason);
 return code.replaceAll('_',' ').toLowerCase();
}
function shortHash(value:string|null|undefined){
 if(!value)return '—';
 return value.length>18?value.slice(0,10)+'…'+value.slice(-6):value;
}
function nearBlocksTx(hash:string){
 return 'https://testnet.nearblocks.io/txns/'+encodeURIComponent(hash);
}
function atomic(value:string|null|{error:string}|undefined,decimals=0){
 if(typeof value!=='string'||!/^\d+$/.test(value))return null;
 const negative=value.startsWith('-');
 const digits=negative?value.slice(1):value;
 const padded=digits.padStart(decimals+1,'0');
 const whole=padded.slice(0,decimals?padded.length-decimals:undefined)||'0';
 const fraction=decimals?padded.slice(-decimals).replace(/0+$/,'').slice(0,6):'';
 return (negative?'-':'')+Number(whole).toLocaleString()+(fraction?'.'+fraction:'');
}
function tokenMeta(lab:LabState|null,role:string){
 return lab?.metadata?.[role];
}
function tokenBalance(lab:LabState|null,role:string,name:string){
 const row=lab?.balances?.[role]?.[name];
 return typeof row==='string'?row:null;
}
function storageRegistered(lab:LabState|null,role:string,name:string){
 const value=lab?.storage?.[role]?.[name];
 return value!==null&&value!==undefined&&typeof value==='object'&&!('error' in value);
}
function labCommand(owner:string){
 return 'npm run lab:plan -- --owner '+owner+' --out ./testnet-lab-'+owner.split('.')[0];
}
function Badge({ok,children}:{ok:boolean;children:React.ReactNode}){
 return <span className={'lab-badge '+(ok?'ok':'pending')}>
  {ok?<CheckCircle size={13}/>:<WarningCircle size={13}/>}{children}</span>;
}
function CopyLine({label,value}:{label:string;value:string}){
 const [copied,setCopied]=useState(false);
 return <div className="lab-copy-line">
  <span>{label}</span><code>{value}</code>
  <button type="button" onClick={async()=>{
   try{await navigator.clipboard.writeText(value);setCopied(true);
    setTimeout(()=>setCopied(false),1500)}catch{}
  }}><Copy size={14}/>{copied?'Copied':'Copy'}</button>
 </div>;
}

export function TestnetSetup({compact=false}:{compact?:boolean}){
 const [owner,setOwner]=useState(()=>{
  try{return localStorage.getItem(OWNER_KEY)??''}catch{return ''}
 });
 const [ownerDraft,setOwnerDraft]=useState(owner);
 const [account,setAccount]=useState<string|null>(null);
 const [proof,setProof]=useState<AccountProof|null>(null);
 const [lab,setLab]=useState<LabState|null>(null);
 const [labError,setLabError]=useState('');
 const [walletError,setWalletError]=useState('');
 const [intents,setIntents]=useState<IntentResponse|null>(null);
 const [intentError,setIntentError]=useState('');
 const [signResults,setSignResults]=useState<SignedTransactionResult[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState<BusyKind>(null);
 const [txHash,setTxHash]=useState('');
 const [withdrawHash,setWithdrawHash]=useState('');
 const [submittedTx,setSubmittedTx]=useState('');
 const [submittedWithdraw,setSubmittedWithdraw]=useState('');
 const requestId=useRef(0);

 const loadLab=useCallback(async(ownerId:string,tx='',withdraw='')=>{
  if(!TESTNET_OWNER.test(ownerId)){setLab(null);setLabError('');return}
  const id=++requestId.current;
  setBusy('lab');setLabError('');
  try{
   const query=new URLSearchParams({owner:ownerId});
   if(tx)query.set('tx',tx);
   if(withdraw)query.set('withdraw',withdraw);
   const response=await fetch('/api/public/testnet/lab/verify?'+query.toString(),{
    credentials:'omit',headers:{accept:'application/json'},
    signal:AbortSignal.timeout(45000)});
   const body=await response.json() as LabState&{error?:string};
   if(!response.ok)throw Error(body.error??'LAB_VERIFY_FAILED');
   if(body.network!=='testnet'||body.executionEnabled!==false||
    body.mainnetExecutionAllowed!==false||body.signerConnected!==false)
    throw Error('LAB_RESPONSE_NOT_READ_ONLY');
   if(id===requestId.current){setLab(body);setLabError('')}
  }catch(reason){
   if(id===requestId.current)setLabError(errorText(reason));
  }finally{if(id===requestId.current)setBusy(null)}
 },[]);

 useEffect(()=>{void getConnectedAccount().then(value=>{
  if(value){setAccount(value);setOwnerDraft(value);
   setOwner(current=>current||value)}
 }).catch(()=>{})},[]);

 useEffect(()=>{
  if(!account)return;
  let active=true;
  (async()=>{
   setBusy('proof');
   try{
    const response=await fetch('/api/public/testnet/account?accountId='+
     encodeURIComponent(account),{credentials:'omit',
     signal:AbortSignal.timeout(ACCOUNT_PROOF_TIMEOUT)});
    const body=await response.json() as AccountProof&{error?:string};
    if(!response.ok)throw Error(body.error??'ACCOUNT_LOOKUP_FAILED');
    if(body.network!=='testnet'||body.accountId!==account||
     body.canSign!==false||body.signerConnected!==false)
     throw Error('ACCOUNT_RESPONSE_INVALID');
    if(active)setProof(body);
   }catch(reason){if(active)setWalletError(errorText(reason))}
   finally{if(active)setBusy(null)}
  })();
  return()=>{active=false};
 },[account]);

 useEffect(()=>{
  if(!TESTNET_OWNER.test(owner))return;
  void loadLab(owner,submittedTx,submittedWithdraw);
  const timer=setInterval(()=>{
   if(document.visibilityState==='visible')
    void loadLab(owner,submittedTx,submittedWithdraw);
  },45000);
  return()=>clearInterval(timer);
 },[owner,submittedTx,submittedWithdraw,loadLab]);

 const connect=async(walletId:WalletId)=>{
  setBusy('wallet');setWalletError('');setMessage('');
  try{
   const value=await connectWallet(walletId);
   if(!TESTNET_OWNER.test(value))throw Error('CONNECTED_WALLET_IS_NOT_TESTNET');
   setAccount(value);setOwnerDraft(value);setOwner(value);
   try{localStorage.setItem(OWNER_KEY,value)}catch{}
   setMessage('Connected to '+value+' on NEAR Testnet.');
  }catch(reason){setWalletError(errorText(reason))}
  finally{setBusy(null)}
 };
 const disconnect=async()=>{
  setBusy('wallet');
  try{await disconnectWallet();setAccount(null);setProof(null);setIntents(null)}
  catch(reason){setWalletError(errorText(reason))}
  finally{setBusy(null)}
 };
 const applyOwner=()=>{
  const value=ownerDraft.trim();
  if(!TESTNET_OWNER.test(value)){setLabError('enter a valid testnet account');return}
  setOwner(value);setIntents(null);setSignResults([]);setLab(null);
  setSubmittedTx('');setSubmittedWithdraw('');setTxHash('');setWithdrawHash('');
  try{localStorage.setItem(OWNER_KEY,value)}catch{}
 };
 const loadIntents=async()=>{
  if(!account){setIntentError('connect a wallet first');return}
  setBusy('intents');setIntentError('');setMessage('');
  try{
   const response=await fetch('/api/public/testnet/lab/intents?owner='+
    encodeURIComponent(owner)+'&account='+encodeURIComponent(account),
    {credentials:'omit',signal:AbortSignal.timeout(45000)});
   const body=await response.json() as IntentResponse&{error?:string};
   if(!response.ok)throw Error(body.error??'INTENTS_FAILED');
   if(body.requiresWalletApproval!==true||!Array.isArray(body.transactions))
    throw Error('INTENTS_RESPONSE_INVALID');
   setIntents(body);
  }catch(reason){setIntentError(errorText(reason))}
  finally{setBusy(null)}
 };
 const approveIntents=async()=>{
  if(!account||!intents)return;
  setBusy('sign');setIntentError('');setMessage('');setSignResults([]);
  try{
   const results=await signLabTransactions(account,intents.transactions,
    (_index,result)=>setSignResults(current=>[...current,result]));
   const redirected=results.some(result=>result.status==='redirected');
   setMessage(redirected?
    'Wallet approval requested. Return here after approving and verify the lab again.':
    'Owner transactions submitted. Verifying on-chain state next.');
   await loadLab(owner,submittedTx,submittedWithdraw);
  }catch(reason){setIntentError(errorText(reason))}
  finally{setBusy(null)}
 };
 const verifyReceipt=async()=>{
  if(!txHash.trim()){setLabError('paste a liquidation transaction hash first');return}
  setSubmittedTx(txHash.trim());
  setSubmittedWithdraw(withdrawHash.trim());
  setBusy('receipt');
  await loadLab(owner,txHash.trim(),withdrawHash.trim());
  setBusy(null);
 };
 const meta=useMemo(()=>lab?.accounts?lab.accounts:{} ,[lab]);
 const command=labCommand(owner||ownerDraft||'you.testnet');

 return <section className={'lab-setup '+(compact?'compact':'')} aria-label="NEAR Testnet onboarding and liquidation lab">
  <header className="lab-setup-head">
   <div className="lab-title">
    <span className="lab-title-icon"><Flask size={20}/></span>
    <div><span className="demo-eyebrow">STAGE199 · NEAR TESTNET LAB</span>
     <h2>Onboard, fund, deploy, and verify one controlled liquidation</h2>
     <p>Browser wallet signing for owner actions. No private keys are sent to this server. Mainnet is disabled.</p></div>
   </div>
   <span className="lab-network"><i/>TESTNET ONLY</span>
  </header>

  <div className="lab-grid">
   <article className="lab-card">
    <div className="lab-card-head"><Wallet size={17}/><h3>1 · Wallet</h3>
     <Badge ok={Boolean(account)}>{account?'connected':'not connected'}</Badge></div>
    {!account?<>
     <p className="lab-muted">Create or connect a NEAR Testnet account. The wallet approves every transaction.</p>
     <div className="lab-button-row">
      <button className="primary" disabled={busy==='wallet'}
       onClick={()=>void connect(WALLET_IDS.myNearWallet)}>MyNear Wallet</button>
      <button disabled={busy==='wallet'}
       onClick={()=>void connect(WALLET_IDS.meteor)}>Meteor</button>
     </div>
     <div className="lab-links">
      <a href={walletLinks.createAccount} target="_blank" rel="noreferrer">Create Testnet wallet <ArrowUpRight size={12}/></a>
      <a href={walletLinks.faucet} target="_blank" rel="noreferrer">Official faucet <ArrowUpRight size={12}/></a>
     </div>
    </>:<>
     <div className="lab-account">
      <div><small>Connected Testnet account</small><strong>{account}</strong></div>
      <button type="button" onClick={()=>void disconnect()} disabled={busy==='wallet'}>
       <XCircle size={14}/>Disconnect</button>
     </div>
     <div className="lab-proof">
      <span><small>Verified NEAR balance</small><strong>{proof?
       Number(proof.balanceNear).toLocaleString(undefined,{maximumFractionDigits:6}):
       busy==='proof'?'checking…':'unavailable'} <em>TNEAR</em></strong></span>
      <span><small>Source block</small><strong>{proof?.sourceBlock??'—'}</strong></span>
      <span><small>Server signing</small><strong>disabled</strong></span>
     </div>
    </>}
    {walletError&&<div className="lab-error"><WarningCircle size={14}/>{walletError}</div>}
   </article>

   <article className="lab-card">
    <div className="lab-card-head"><CurrencyDollar size={17}/><h3>2 · Funding</h3>
     <Badge ok={Boolean(proof)}>{proof?'balance verified':'not funded yet'}</Badge></div>
    <p className="lab-muted">Request Testnet NEAR from the official faucet. This dashboard never invents a faucet receipt; the balance is re-read from RPC.</p>
    <div className="lab-button-row">
     <a className="lab-button primary" href={walletLinks.faucet} target="_blank" rel="noreferrer">
      Open faucet <ArrowSquareOut size={14}/></a>
     <button disabled={!account||busy==='proof'} onClick={()=>{
      if(!account)return;setBusy('proof');setWalletError('');
      fetch('/api/public/testnet/account?accountId='+encodeURIComponent(account),
       {credentials:'omit',signal:AbortSignal.timeout(ACCOUNT_PROOF_TIMEOUT)})
       .then(async response=>{
        const body=await response.json() as AccountProof&{error?:string};
        if(!response.ok)throw Error(body.error??'ACCOUNT_LOOKUP_FAILED');
        setProof(body);setMessage('Balance re-read from NEAR Testnet RPC.');
       }).catch(reason=>setWalletError(errorText(reason)))
       .finally(()=>setBusy(null));
     }}><ArrowClockwise size={14}/>Re-check balance</button>
    </div>
    <div className="lab-links">
     <a href={walletLinks.faucetDocs} target="_blank" rel="noreferrer">Faucet instructions <ArrowUpRight size={12}/></a>
    </div>
    {proof&&Number(proof.balanceNear)<14&&<div className="lab-warning">
     <WarningCircle size={14}/>The generated plan needs at least 14 TNEAR for the owner account and subaccounts.</div>}
   </article>

   <article className="lab-card lab-card-wide">
    <div className="lab-card-head"><Cube size={17}/><h3>3 · Isolated lending lab</h3>
     <Badge ok={Boolean(lab)}>{lab?lab.readiness.replaceAll('_',' ').toLowerCase():'not started'}</Badge></div>
    <div className="lab-owner-row">
     <label><span>Lab owner account</span>
      <input value={ownerDraft} spellCheck={false} placeholder="yourname.testnet"
       onChange={event=>setOwnerDraft(event.target.value)}/></label>
     <button onClick={applyOwner} disabled={!TESTNET_OWNER.test(ownerDraft.trim())}>Inspect lab</button>
     <button onClick={()=>void loadLab(owner,submittedTx,submittedWithdraw)}
      disabled={!TESTNET_OWNER.test(owner)||busy==='lab'}><ArrowClockwise size={14}/>Verify now</button>
    </div>
    <CopyLine label="Generate plan on your computer" value={command}/>
    <div className="lab-steps">
     <span className={lab?.accounts.root?.exists?'complete':''}><CheckCircle size={14}/>Owner account</span>
     <span className={lab?.codeVerified?'complete':''}><ShieldCheck size={14}/>Pinned contracts</span>
     <span className={lab?.initialized?'complete':''}><Cube size={14}/>Lending initialized</span>
     <span className={lab?.assetsVerified&&lab?.reservesVerified?'complete':''}>
      <CurrencyDollar size={14}/>Assets and reserves</span>
     <span className={lab?.storageVerified?'complete':''}><LockKey size={14}/>Storage registered</span>
    </div>
    {labError&&<div className="lab-error"><WarningCircle size={14}/>{labError}</div>}
    {lab&&<>
     <div className="lab-account-grid">
      {Object.entries(meta).map(([role,row])=><div key={role}>
       <span>{role}</span><code>{row.accountId}</code>
       <small>{row.exists?atomic(row.balanceYocto,24)+' NEAR':'missing'}</small>
      </div>)}
     </div>
     <div className="lab-proof">
      <span><small>Verified code</small><strong>{lab.codeVerified?'yes':'no'}</strong></span>
      <span><small>Config</small><strong>{lab.configVerified?'matches plan':'not verified'}</strong></span>
      <span><small>Assets / reserves</small><strong>{lab.assetsVerified?'yes':'no'} / {lab.reservesVerified?'yes':'no'}</strong></span>
      <span><small>Checked block</small><strong>{lab.sourceBlock}</strong></span>
     </div>
     {account===owner&&<div className="lab-owner-actions">
      <button disabled={busy==='intents'} onClick={()=>void loadIntents()}>
       <Wallet size={14}/>{busy==='intents'?'Preparing…':'Prepare owner transactions'}</button>
      {intents&&<button className="primary" disabled={busy==='sign'||!intents.transactions.length}
       onClick={()=>void approveIntents()}>
       {busy==='sign'?'Awaiting wallet…':'Approve '+intents.transactions.length+' transaction(s)'}</button>}
     </div>}
     {intentError&&<div className="lab-error"><WarningCircle size={14}/>{intentError}</div>}
     {intents&&<div className="lab-intents">
      {intents.transactions.length===0?<span className="lab-muted">Owner provisioning checks already pass.</span>:
       intents.transactions.map((transaction,index)=><div key={transaction.label}>
        <span>{index+1}</span><strong>{transaction.label}</strong>
        <code>{transaction.receiverId}</code>
        <small>{transaction.actions.length} action(s)</small>
       </div>)}
     </div>}
     {signResults.map((result,index)=><div key={index} className="lab-result">
      <CheckCircle size={14}/>{result.label}
      {result.txHash?<a href={nearBlocksTx(result.txHash)} target="_blank" rel="noreferrer">
       {shortHash(result.txHash)} <ArrowUpRight size={11}/></a>:<span>awaiting wallet return</span>}
     </div>)}
    </>}
   </article>

   <article className="lab-card lab-card-wide">
    <div className="lab-card-head"><ShieldCheck size={17}/><h3>4 · Test assets and modeled risk</h3>
     <Badge ok={Boolean(lab?.healthModels)}>{lab?.priceSource?.replaceAll('_',' ').toLowerCase()??'no model'}</Badge></div>
    {lab?<div className="lab-asset-table" role="table" aria-label="Test assets">
     <div role="row" className="head"><span role="columnheader">Asset</span>
      <span role="columnheader">Metadata</span><span role="columnheader">Owner</span>
      <span role="columnheader">Borrower</span><span role="columnheader">Liquidator</span>
      <span role="columnheader">Storage</span></div>
     {lab.metadata&&Object.keys(lab.metadata).map(role=>{
      const balanceRow=lab.balances?.[role]??{};
      const metaRow=tokenMeta(lab,role);
      const decimals=metaRow?.decimals??0;
      const accountId=lab.accounts?.[role]?.accountId??role;
      return <div role="row" key={role}>
       <span role="cell"><b>{metaRow?.symbol??role}</b><code>{accountId}</code></span>
       <span role="cell">{metaRow?.error?'mismatch':metaRow?.symbol+' · '+metaRow?.decimals+' decimals'}</span>
       <span role="cell">{atomic(balanceRow.owner as string|undefined,decimals)??'—'}</span>
       <span role="cell">{atomic(balanceRow.borrower as string|undefined,decimals)??'—'}</span>
       <span role="cell">{atomic(balanceRow.liquidator as string|undefined,decimals)??'—'}</span>
       <span role="cell">{storageRegistered(lab,role,'owner')?'owner ✓':'owner —'}
        {storageRegistered(lab,role,'borrower')?' · borrower ✓':''}
        {storageRegistered(lab,role,'liquidator')?' · liquidator ✓':''}</span>
      </div>;
     })}
    </div>:<p className="lab-muted">Deploy the isolated lab to see real Testnet token metadata, balances, storage and reserves.</p>}
    {lab?.healthModels&&<div className="lab-health">
     <div><small>Healthy test price</small><strong>{lab.healthModels.healthy.health.toFixed(3)}</strong>
      <span className={lab.healthModels.healthy.healthy?'ok':'bad'}>
       {lab.healthModels.healthy.healthy?'HEALTHY':'UNHEALTHY'}</span></div>
     <div><small>Unhealthy test price</small><strong>{lab.healthModels.unhealthy.health.toFixed(3)}</strong>
      <span className={lab.healthModels.unhealthy.healthy?'ok':'bad'}>
       {lab.healthModels.unhealthy.healthy?'HEALTHY':'LIQUIDATABLE'}</span></div>
     <div><small>Oracle</small><strong>{lab.oracleType.replaceAll('_',' ').toLowerCase()}</strong>
      <span className="lab-muted">prices are test inputs, not on-chain oracle storage</span></div>
    </div>}
    {lab?.positions.borrower&&<div className="lab-positions">
     <div><span>Borrower collateral</span><strong>{lab.positions.borrower.collateral.map(row=>
      row.atomic+' '+row.tokenId.split('.')[0]).join(', ')||'none'}</strong></div>
     <div><span>Borrower debt</span><strong>{lab.positions.borrower.borrowed.map(row=>
      row.atomic+' '+row.tokenId.split('.')[0]).join(', ')||'none'}</strong></div>
    </div>}
   </article>

   <article className="lab-card lab-card-wide">
    <div className="lab-card-head"><LinkSimple size={17}/><h3>5 · Liquidation receipt</h3>
     <Badge ok={lab?.liquidationTransactionVerified===true}>
      {lab?.liquidationTransactionVerified?'verified':'not verified'}</Badge></div>
    <p className="lab-muted">Run <code>./run-liquidation.sh</code> locally, then paste the transaction hash printed by the script. A hash alone is not proof; this checks finality, arguments, logs and post-state.</p>
    <div className="lab-receipt-row">
     <label><span>Liquidation tx hash</span>
      <input value={txHash} spellCheck={false} placeholder="paste 32–64 base58 hash"
       onChange={event=>setTxHash(event.target.value)}/></label>
     <label><span>Withdraw tx hash (optional)</span>
      <input value={withdrawHash} spellCheck={false} placeholder="optional"
       onChange={event=>setWithdrawHash(event.target.value)}/></label>
     <button className="primary" onClick={()=>void verifyReceipt()}
      disabled={busy==='receipt'}><ArrowClockwise size={14}/>Verify receipt</button>
    </div>
    {lab?.liquidation&&<div className={'lab-receipt '+(lab.liquidation.verified?'ok':'bad')}>
     {lab.liquidation.verified?<CheckCircle size={16}/>:<WarningCircle size={16}/>}
     <div><strong>{lab.liquidation.verified?'Liquidation verified on Testnet':'Not verified'}</strong>
      <span>{lab.liquidation.error?lab.liquidation.error.replaceAll('_',' ').toLowerCase():
       'final status '+(lab.liquidation.finalExecutionStatus??'unknown')}</span>
      {lab.liquidation.txHash&&<a href={nearBlocksTx(lab.liquidation.txHash)} target="_blank" rel="noreferrer">
       {shortHash(lab.liquidation.txHash)} <ArrowUpRight size={11}/></a>}
     </div>
    </div>}
    {lab?.liquidation?.verified&&<div className="lab-proof">
     <span><small>Repaid</small><strong>{lab.liquidation.inAsset?
      atomic(lab.liquidation.inAsset.atomic,lab.metadata?.debt?.decimals??0):'—'}</strong></span>
     <span><small>Collateral taken</small><strong>{lab.liquidation.outAsset?
      atomic(lab.liquidation.outAsset.atomic,lab.metadata?.collateral?.decimals??0):'—'}</strong></span>
     <span><small>Modeled test PnL</small><strong>{lab.realizedTestNotional===null?'—':
      '$'+lab.realizedTestNotional.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></span>
     <span><small>Withdraw</small><strong>{lab.withdrawVerified?'verified':'not verified'}</strong></span>
    </div>}
    {lab?.withdraw&&!lab.withdrawVerified&&<div className="lab-warning">
     <WarningCircle size={14}/>Withdraw receipt not verified{lab.withdraw.error?': '+
      lab.withdraw.error.replaceAll('_',' ').toLowerCase():''}.</div>}
    <div className="lab-links">
     <span className="lab-muted">Commands:</span>
     <code>./setup-testnet.sh</code><code>./setup-market.sh</code><code>./run-liquidation.sh</code>
    </div>
   </article>
  </div>
  {message&&<div className="lab-message"><CheckCircle size={14}/>{message}</div>}
  <footer className="lab-foot">
   <span><LockKey size={13}/>No server-side keys · no mainnet · no shared Rhea mutations</span>
   <span>Read-only verification via <code>rpc.testnet.near.org</code></span>
  </footer>
 </section>;
}
