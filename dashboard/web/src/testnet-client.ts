import type {DashboardState,EnvironmentReadiness,OperationEvent} from './types';

const STORAGE_KEY='arbivane-testnet-live-v1';
const PAGE_SIZE=20;
const DELAY_MS=2600;
const MONITOR_INTERVAL_MS=25000;
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
interface AccountObservation{
 accountId:string;sourceIndex:number;hasDebt:boolean;indexHasDebt:boolean;
 borrowed:{tokenId:string;atomic:string}[];
 collateral:{tokenId:string;atomic:string}[];
 status:'BLOCKED'|'UNVERIFIED'|'NO_CURRENT_DEBT';
 reason:string;missingPrices:string[];
 freshBlock:number|null;eligibilityVerified:false;
}
interface MarketHealth{
 status:string;chainId:string;contract:string;codeHash:string;
 blockHeight:number;oracleId:string;checkedAt:string;executionEnabled:boolean;
}
interface AccountPage{
 network:string;contract:string;codeHash:string;blockHeight:number;
 from:number;limit:number;returned:number;accounts:AccountObservation[];
 hasMore:boolean;eligibilityVerified:false;executionEnabled:false;
 indexedDebt:number;freshDebt:number;blocked:number;pending:number;staleIndexedDebt:number;
 eligibleVerified:0;transactionsExecuted:0;
 oracle:{fresh:boolean;requiredTokens:number;pricedTokens:number;error:string|null;ageMs:number|null};
}
type TestnetSession=NonNullable<DashboardState['session']>&{
 cursor?:number;scanned?:number;debtPositions?:number;observedBlocks?:number;
 blocked?:number;pending?:number;staleIndexedDebt?:number;cycles?:number;
 missingPrices?:string[];lastCheckedAt?:string;
 sourceContract?:string;codeHash?:string;
};
type LiveState=Omit<DashboardState,'session'>&{session:TestnetSession|null;nextEventSequence:number};
type Saved={state:LiveState;events:OperationEvent[]};
const emptyAccounting={
 currency:'USD',available:null,pending:null,grossProceeds:null,
 financingFees:null,swapCosts:null,gasFees:null,realizedProfit:null,
 realizedLoss:null,cumulativeNetPnl:null,reconciledAt:null,evidence:null,
};
const blank=():Saved=>({state:{
 environment:'testnet',revision:0,nextEventSequence:1,session:null,
 settings:{maxFinancingUsd:'',minimumNetProfitUsd:'0.00'},
 accounting:emptyAccounting,wallet:{status:'not_configured',accountId:null,
  balances:[],verifiedAt:null},transactions:[],opportunities:[],
},events:[]});
const unready=():EnvironmentReadiness=>({
 environment:'testnet',status:'connecting',chainId:'testnet',
 blockHeight:null,checkedAt:new Date().toISOString(),
 capabilities:{read:false,automate:false,execution:false,mainnetSpending:false,
  deposit:false,withdraw:false},
 requirements:{source:'live chain RPC',executionAdapterConfigured:false,
  walletConfigured:false,mode:'read-only borrower scanning'},
});
function readiness(health:MarketHealth):EnvironmentReadiness{
 const live=health.chainId==='testnet'&&health.status==='connected'&&
  health.executionEnabled===false;
 return {environment:'testnet',status:live?'connected':'unavailable',
  chainId:'testnet',blockHeight:health.blockHeight,checkedAt:health.checkedAt,
  capabilities:{read:live,automate:live,execution:false,mainnetSpending:false,
   deposit:false,withdraw:false,transfer:false},
  requirements:{contract:health.contract,codeHash:health.codeHash,
   oracle:health.oracleId,walletConfigured:false,
   executionAdapterConfigured:false,scanMode:'real-chain-observations-only'}};
}
function readStorage(storage:Pick<Storage,'getItem'>):Saved{
 try{
  const raw=storage.getItem(STORAGE_KEY);
  if(raw){
   const result=JSON.parse(raw) as Saved;
   if(result?.state?.environment==='testnet'&&Array.isArray(result.events)&&
    Array.isArray(result.state.opportunities)&&
    Number.isSafeInteger(result.state.nextEventSequence)&&
    result.state.nextEventSequence>=1)return result;
  }
 }catch{}
 return blank();
}
async function readJson<T>(path:string,timeoutMs=16000):Promise<T>{
 const response=await fetch(path,{credentials:'omit',signal:AbortSignal.timeout(timeoutMs),
  headers:{'accept':'application/json'}});
 const result=await response.json() as {error?:string};
 if(!response.ok)throw Error(typeof result.error==='string'?result.error:'TESTNET_READ_FAILED');
 return result as T;
}
export class LiveTestnet{
 private data:Saved;
 private health:MarketHealth|null=null;
 private checked=0;
 private listeners=new Set<(event:OperationEvent)=>void>();
 private connections=new Set<(connection:'connected'|'reconnecting')=>void>();
 private job:number|null=null;
 private readonly monitorIntervalMs:number;
 private readonly storage:Pick<Storage,'setItem'|'getItem'>|null;
 constructor(storage:Pick<Storage,'setItem'|'getItem'>|null=null,
  {monitorIntervalMs=MONITOR_INTERVAL_MS}:{monitorIntervalMs?:number}={}){
  this.storage=storage;this.data=storage?readStorage(storage):blank();
  this.monitorIntervalMs=monitorIntervalMs;
 }
 private persist(){
  try{this.storage?.setItem(STORAGE_KEY,JSON.stringify(this.data))}catch{}
 }
 private status(status:'connected'|'reconnecting'){
  for(const callback of this.connections)callback(status);
 }
 private notify(stage:string,status:string,message:string,evidence:Record<string,unknown>={}){
  const seq=this.data.state.nextEventSequence++;
  const event:OperationEvent={id:'testnet:'+seq,sequence:seq,environment:'testnet',
   timestamp:new Date().toISOString(),sessionId:this.data.state.session?.id??null,
   stage,status,message,evidence,detail:null};
  this.data.events.push(event);
  if(this.data.events.length>500)this.data.events=this.data.events.slice(-500);
  this.data.state.revision++;this.persist();
  for(const callback of this.listeners)callback(event);
 }
 async healthCheck(force=false):Promise<MarketHealth>{
  if(!force&&this.health&&Date.now()-this.checked<15000)return this.health;
  const health=await readJson<MarketHealth>('/api/public/testnet/health');
  if(health.chainId!=='testnet'||health.executionEnabled!==false||
   !Number.isSafeInteger(health.blockHeight)||!health.codeHash)
   throw Error('TESTNET_CHAIN_PROOF_INVALID');
  this.health=health;this.checked=Date.now();return health;
 }
 async load(){
  let check:EnvironmentReadiness;
  try{
   const health=await this.healthCheck();
   check=readiness(health);
   this.status('connected');
  }catch(error){
   check={...unready(),status:'unavailable',
    requirements:{...unready().requirements,
     error:String(error instanceof Error?error.message:'RPC_UNAVAILABLE')}};
   this.status('reconnecting');
  }
  const session=this.data.state.session;
  if(session?.status==='running'&&this.job===null&&check.capabilities.read)
   this.loop(session.id);
  return {state:structuredClone(this.data.state) as DashboardState,
   events:structuredClone(this.data.events),readiness:check};
 }
 subscribe(onEvent:(event:OperationEvent)=>void,
  onConnection?:(status:'connected'|'reconnecting')=>void){
  this.listeners.add(onEvent);
  if(onConnection)this.connections.add(onConnection);
  queueMicrotask(()=>{if(onConnection&&this.connections.has(onConnection))
   onConnection(this.health?'connected':'reconnecting')});
  return {close:()=>{this.listeners.delete(onEvent);
   if(onConnection)this.connections.delete(onConnection)}};
 }
 async command(action:string){
  if(action==='start'){
   if(this.data.state.session&&['starting','running','paused'].includes(this.data.state.session.status))
    throw Error('TESTNET_SCAN_ALREADY_ACTIVE');
   const health=await this.healthCheck(true);
   if(!readiness(health).capabilities.read)throw Error('TESTNET_MARKET_UNAVAILABLE');
   const now=new Date().toISOString();
   this.data=blank();
   const session:TestnetSession={
    id:crypto.randomUUID(),status:'running',createdAt:now,startedAt:now,endedAt:null,
    failure:null,cursor:0,scanned:0,debtPositions:0,blocked:0,pending:0,
    staleIndexedDebt:0,cycles:0,missingPrices:[],
    observedBlocks:health.blockHeight,
    sourceContract:health.contract,codeHash:health.codeHash};
   this.data.state.session=session;this.persist();
   this.notify('network','success','Connected to NEAR Testnet.',{
    chainId:'testnet',contract:health.contract,blockHeight:health.blockHeight,
    oracle:health.oracleId,executionEnabled:false});
   this.loop(session.id);
   return {session:structuredClone(session)};
  }
  const session=this.data.state.session;
  if(!session)throw Error('TESTNET_SCAN_NOT_STARTED');
  if(action==='pause'){
   if(session.status!=='running')throw Error('TESTNET_SCAN_NOT_RUNNING');
   session.status='paused';
   this.notify('control','info','Testnet scan paused · cursor preserved.',{cursor:session.cursor??0});
  }else if(action==='resume'){
   if(session.status!=='paused')throw Error('TESTNET_SCAN_NOT_PAUSED');
   session.status='running';
   this.notify('control','running','Testnet scan resumed · querying the next accounts.',{
    cursor:session.cursor??0});
   this.loop(session.id);
  }else if(action==='stop'){
   if(!['running','paused'].includes(session.status))throw Error('TESTNET_SCAN_NOT_ACTIVE');
   session.status='stopped';session.endedAt=new Date().toISOString();
   this.notify('control','info','Testnet scan stopped · observed positions preserved.',{
    scanned:session.scanned??0});
  }else throw Error('INVALID_TESTNET_COMMAND');
  this.persist();
  return {session:structuredClone(session)};
 }
 private async loop(id:string){
  if(this.job!==null)return;
  this.job=Date.now();
  let failures=0;
  try{
   while(this.data.state.session?.id===id&&this.data.state.session.status==='running'){
    const session=this.data.state.session;
    const from=session.cursor??0;
    if(from>=1500000){session.status='failed';
      session.failure={code:'TESTNET_SCAN_CURSOR_LIMIT'};break}
    try{
     const page=await readJson<AccountPage>(
      '/api/public/testnet/assessment?from='+from+'&limit='+PAGE_SIZE,55000);
     if(page.network!=='testnet'||page.contract!==session.sourceContract||
      page.codeHash!==session.codeHash||page.from!==from||
      !Number.isSafeInteger(page.blockHeight)||page.blockHeight<0||
      page.eligibilityVerified!==false||page.executionEnabled!==false||
      page.eligibleVerified!==0||page.transactionsExecuted!==0||
      !Array.isArray(page.accounts)||page.accounts.length>PAGE_SIZE||
      !Number.isSafeInteger(page.freshDebt)||!Number.isSafeInteger(page.blocked)||
      !Number.isSafeInteger(page.pending)||
      page.freshDebt<0||page.freshDebt>page.accounts.length||
      page.blocked<0||page.blocked>page.accounts.length||
      !page.oracle||typeof page.oracle.fresh!=='boolean')
      throw Error('TESTNET_ASSESSMENT_PROOF_INVALID');
     if(this.data.state.session?.id!==id||this.data.state.session.status!=='running')break;
     failures=0;
     // New snapshot replaces old borrower states; indexed debt is not
     // counted unless confirmed with a fresh get_account call.
     if(from===0){
      session.scanned=0;session.debtPositions=0;session.blocked=0;
      session.pending=0;session.staleIndexedDebt=0;session.missingPrices=[];
      this.data.state.opportunities=[];
     }
     session.cursor=from+page.returned;
     session.scanned=(session.scanned??0)+page.returned;
     session.debtPositions=(session.debtPositions??0)+page.freshDebt;
     session.blocked=(session.blocked??0)+page.blocked;
     session.pending=(session.pending??0)+page.pending;
     session.staleIndexedDebt=(session.staleIndexedDebt??0)+page.staleIndexedDebt;
     session.lastCheckedAt=new Date().toISOString();
     session.observedBlocks=page.blockHeight;
     const missing=new Set(session.missingPrices??[]);
     for(const row of page.accounts)for(const token of row.missingPrices??[])missing.add(token);
     session.missingPrices=[...missing].slice(0,60);
     const observations=page.accounts.filter(a=>a.indexHasDebt||a.hasDebt)
       .map(row=>({
        id:'testnet-position-'+row.sourceIndex,borrowerAccountId:row.accountId,
        status:row.status==='BLOCKED'?'Blocked':row.status==='UNVERIFIED'?'Under review':'No current debt',
        assessmentReason:row.reason,missingOracleTokens:row.missingPrices,
        indexHasDebt:row.indexHasDebt,hasDebt:row.hasDebt,
        debtAssets:row.borrowed,collateralAssets:row.collateral,
        sourceBlock:row.freshBlock??page.blockHeight,
        sourceIndex:row.sourceIndex,eligibilityVerified:false,
        sourceContract:page.contract,sourceNetwork:'testnet',
       }));
     this.data.state.opportunities=[...this.data.state.opportunities,...observations].slice(-500);
     this.notify('scan','info',
      'Checked '+page.returned+' accounts · '+page.freshDebt+' have current debt.',{
      sourceBlock:page.blockHeight,accountsScanned:session.scanned,
      currentDebt:session.debtPositions,blocked:session.blocked,
      pending:session.pending,staleIndexedDebt:session.staleIndexedDebt});
     if(!page.hasMore||page.returned===0){
      session.cycles=(session.cycles??0)+1;
      session.cursor=0;
      this.notify('monitoring',session.blocked?'warning':'info',
       session.blocked?
        session.blocked+' accounts blocked by price/eligibility checks · monitoring continues.':
        'No executable positions verified · monitoring continues.',{
       cycle:session.cycles,accounts:session.scanned,currentDebt:session.debtPositions,
       blocked:session.blocked,pending:session.pending,
       missingOracleTokens:session.missingPrices,transactionsExecuted:0,
       executionEnabled:false});
      await sleep(this.monitorIntervalMs);
      continue;
     }
     await sleep(DELAY_MS);
    }catch(error){
     if(this.data.state.session?.status!=='running')break;
     failures++;
     if(failures>=3){
      session.status='failed';session.endedAt=new Date().toISOString();
      session.failure={code:String(error instanceof Error?error.message:'TESTNET_SCAN_FAILED').slice(0,90)};
      this.notify('system','failure','Testnet read-only monitoring stopped after repeated RPC failures.',{
       cursor:from,attempts:failures,transactionsExecuted:0});
      break;
     }
     this.notify('network','warning','Testnet RPC unavailable · retrying this batch.',{
      cursor:from,attempt:failures});
     await sleep(1800*failures);
    }
   }
  }finally{this.job=null;this.persist();
   if(this.data.state.session?.id===id&&
      this.data.state.session.status==='running'){
      queueMicrotask(()=>{void this.loop(id)});
   }
  }
 }

}
let live:LiveTestnet|null=null;
export function liveTestnet(){
 if(!live){
  let storage:Pick<Storage,'setItem'|'getItem'>|null=null;
  try{if(typeof sessionStorage!=='undefined')storage=sessionStorage}catch{}
  live=new LiveTestnet(storage);
 }
 return live;
}

