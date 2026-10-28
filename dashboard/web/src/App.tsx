import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Navigate, NavLink, Route, Routes, useLocation} from 'react-router-dom';
import {
  Pulse as Activity, ArrowDown, ArrowUpRight, ChartLineUp, CheckCircle, CirclesThree,
  ClockCounterClockwise, Cube, Flask, Gauge, Gear, Globe, House, ListMagnifyingGlass,
  Pause, Play, ShieldCheck, SlidersHorizontal, Stop, Wallet,
  WarningCircle, X, Copy, CaretDown, ArrowClockwise,
} from '@phosphor-icons/react';
import {authenticate, command, loadEnvironment, subscribe, UI_PREVIEW} from './api';
import type {StreamConnection} from './api';
import {mergeOperationEvents} from './events';
import {useResearchRuns} from './research';
import {hasFinancialEvidence} from './workspace';
import type {DashboardState, Environment, EnvironmentReadiness, OperationEvent} from './types';

const envInfo = {
  demo: {title:'Demo', icon:Flask},
  testnet: {title:'Testnet', icon:CirclesThree},
  mainnet: {title:'Mainnet', icon:Globe},
} as const;
const nav = [
  ['/', 'Dashboard', House], ['/live', 'Live Operations', Activity],
  ['/opportunities', 'Opportunities', Cube], ['/performance', 'Performance', ChartLineUp],
  ['/wallet', 'Wallet', Wallet], ['/settings', 'Settings', Gear],
] as const;
const EnvironmentContext=createContext<{environment:Environment;setEnvironment:(value:Environment)=>void}|null>(null);
function useEnvironment(){
  const state=useContext(EnvironmentContext);
  if(!state)throw Error('ENVIRONMENT_CONTEXT_MISSING');
  return state;
}
const ongoing = new Set(['starting','running','pause_requested','stopping']);
function Empty({icon:Icon = Activity, title, text}:{icon?:typeof Activity;title:string;text?:string}) {
  return <div className="empty"><span className="empty-icon"><Icon size={19}/></span><strong>{title}</strong>{text&&<p>{text}</p>}</div>;
}
function StatusPill({children, tone='neutral'}:{children:React.ReactNode;tone?:string}) {
  return <span className={`status-pill ${tone}`}><i/>{children}</span>;
}
function ApiError({error,onRetry}:{error:string;onRetry:()=>void}) {
  const [token,setToken]=useState(''); const [busy,setBusy]=useState(false); const [authError,setAuthError]=useState('');
  const auth=['INVALID_TOKEN','AUTH_REQUIRED','AUTH_NOT_CONFIGURED','AUTH_FAILED'].includes(error);
  if(!auth)return <div className="error-banner"><WarningCircle/>{error.replaceAll('_',' ')}<button onClick={onRetry}>Retry</button></div>;
  return <form className="auth-inline" onSubmit={async event=>{event.preventDefault();setBusy(true);setAuthError('');try{await authenticate(token);onRetry()}catch(reason){setAuthError(reason instanceof Error?reason.message:'AUTH_FAILED')}finally{setBusy(false)}}}><ShieldCheck/><label><span>{authError?authError.replaceAll('_',' '):'Operator authentication required'}</span><input type="password" autoComplete="current-password" value={token} onChange={event=>setToken(event.target.value)} placeholder="Dashboard access token"/></label><button disabled={!token||busy}>{busy?'Authenticating…':'Authenticate'}</button></form>;
}
function Shell({children}:{children:React.ReactNode}) {
  const {environment}=useEnvironment();
  const location=useLocation();
  const current=nav.find(([route])=>route===location.pathname)?.[1] ??
    (location.pathname==='/transactions'?'Transactions':location.pathname==='/analytics'?'Analytics':'Dashboard');
  return <div className={UI_PREVIEW?'shell ui-preview':'shell'}>
    <aside className="sidebar">
      <NavLink className="brand" to="/" aria-label="ARBIVANE home">
        <span className="brand-mark"><CirclesThree weight="fill" size={26}/></span>
        <span className="brand-copy"><b>ARBIVANE</b><small>Autonomous Liquidation Terminal</small></span>
      </NavLink>
      <nav aria-label="Primary navigation">
        {nav.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/'}
          className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{environment==='testnet'&&to==='/opportunities'?'Debt positions':label}</span></NavLink>)}
      </nav>
    </aside>
    <header className="topbar">
      <span className="topbar-page">{current}</span>
      <div className="topbar-actions">
        <EnvironmentPicker/>
        <NavLink className="topbar-settings" to="/settings" title="Settings" aria-label="Settings"><Gear size={19}/></NavLink>
      </div>
    </header>
    {(environment==='demo'||environment==='testnet')&&<div className="demo-mode-strip" role="note">
      <span className="demo-mode-dot"/><strong>{environment==='demo'?'DEMO':'TESTNET'}</strong>
      <span className="demo-mode-divider"/>
      <span>{environment==='demo'?'Interactive simulation':'Live NEAR chain · read-only discovery'}</span>
      <span className="demo-mode-spacer"/>
      <span className="demo-mode-caption">{environment==='demo'?'No real funds or blockchain transactions':'No liquidation transactions enabled'}</span>
    </div>}
    <main className="main" data-route={location.pathname}>{children}</main>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {nav.slice(0,5).map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/'}>
        <Icon/><span>{label}</span></NavLink>)}
    </nav>
  </div>;
}

function EnvironmentPicker(){
  const {environment,setEnvironment}=useEnvironment();
  return <div className="environment-picker" role="group" aria-label="Network environment">
    {(Object.keys(envInfo) as Environment[]).map(key=>{
      const entry=envInfo[key];
      const Icon=entry.icon;
      return <button type="button" key={key} aria-pressed={environment===key}
        className={environment===key?'environment selected':'environment'}
        onClick={()=>setEnvironment(key)}><Icon size={15} aria-hidden="true"/>{entry.title}</button>;
    })}
  </div>;
}

function Automation({environment,state,readiness,onCommand,busy}:{environment:Environment;state:DashboardState|null;readiness?:EnvironmentReadiness;onCommand:(a:string,s?:DashboardState['settings'])=>void;busy:string|null}) {
  const [amount,setAmount]=useState(state?.settings.maxFinancingUsd??'1000.00');
  const [minimum,setMinimum]=useState(state?.settings.minimumNetProfitUsd??'0.00');
  useEffect(()=>{if(state){setAmount(state.settings.maxFinancingUsd);setMinimum(state.settings.minimumNetProfitUsd)}},[environment,state?.environment]);
  const status=state?.session?.status??'idle';
  const running=['starting','running','pause_requested','stopping'].includes(status);
  const hasSession=running||status==='paused';
  const canAutomate=readiness?.capabilities?.automate===true;
  const validAmount=/^\d+(?:\.\d{1,2})?$/.test(amount.trim())&&Number(amount)>0;
  return <section className="panel automation">
    <div className="panel-title"><span><Gear/>Automation</span>{hasSession&&<StatusPill tone={running?'success':'neutral'}>{status.replaceAll('_',' ')}</StatusPill>}</div>
    <div className="automation-layout">
      <div className="automation-body">
      {environment!=='testnet'?<label className="money-label">
        <span>{environment==='demo'?'Financing limit per liquidation':'Maximum financing per liquidation'}</span>
        <div className="money-input">
          <span>USD</span>
          <input value={amount} inputMode="decimal" placeholder="Enter amount" onChange={e=>setAmount(e.target.value)} aria-label="Maximum financing per liquidation in US dollars"/>
        </div>
      </label>:<div className="testnet-start-summary">
        <strong>Market monitor ready</strong><span>Scanning starts automatically.</span>
      </div>}
      {environment==='mainnet'&&<details className="advanced-controls">
        <summary><SlidersHorizontal size={16}/> Advanced settings</summary>
        <label className="advanced-field"><span>Minimum reference gross (USD)</span>
          <input value={minimum} inputMode="decimal" onChange={e=>setMinimum(e.target.value)}
            aria-label="Minimum reference gross screening amount" title="Source screening threshold, not realized profit"/>
        </label>
      </details>}
    </div>
      <div className="automation-actions">
        <div className="controls">
      <button className="primary" disabled={running||busy!==null||!canAutomate||(environment!=='testnet'&&!validAmount)}
        onClick={()=>onCommand(status==='paused'?'resume':'start',
          environment==='testnet'?undefined:{maxFinancingUsd:amount,minimumNetProfitUsd:minimum})}>
        <Play weight="fill"/>{status==='paused'?'Resume':'Start Automation'}
      </button>
      {hasSession&&<>
        <button disabled={!['running','starting'].includes(status)||busy!==null} onClick={()=>onCommand('pause')}><Pause weight="fill"/>Pause</button>
        <button className="stop" disabled={status==='stopping'||busy!==null} onClick={()=>onCommand('stop')}><Stop weight="fill"/>Stop</button>
      </>}
    </div>
        {!canAutomate&&<div className="automation-availability"><span>{environment==='demo'?'Demo is initializing':environment==='testnet'?'Verifying live Testnet RPC and contract':'Mainnet execution disabled'}</span><NavLink to="/settings">Details <ArrowUpRight size={13}/></NavLink></div>}
      </div>
    </div>
  </section>;
}

/** Summary-first event list. The raw technical evidence is still accessible,
 * but never forces a full-screen drawer or a wall of repetitive JSON. */
function operationHighlights(events:OperationEvent[],important:boolean){
  if(!important)return events;
  return events.filter((event,index)=>{
    if(event.status==='failure'||event.status==='warning')return true;
    if(event.environment==='testnet'){
      if(event.stage==='discovery'&&events.some(other=>
        other.stage==='scan'&&other.sessionId===event.sessionId&&
        other.evidence?.blockHeight===event.evidence?.sourceBlock))return false;
      return event.stage==='monitoring'||event.stage==='system'||event.stage==='network'||
        event.stage==='control';
    }
    return event.stage==='system'||event.stage==='discovery'||
      event.stage==='accounting'||event.stage==='confirmation'||
      event.stage==='control'||(event.stage==='execution'&&event.message.includes('submitted'));
  });
}
function EventDisclosure({event,compact=false}:{event:OperationEvent;compact?:boolean}){
  const details=Object.entries(event.evidence??{}).filter(([key])=>
    !['scenario','realizedPnlVerified','mainnetExecutionEnabled'].includes(key));
  const name=(key:string)=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')
    .replace(/^./,letter=>letter.toUpperCase());
  return <details className={'operation-entry event-disclosure'+(compact?' compact':'')}>
    <summary>
      <time>{new Date(event.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>
      <span className={'operation-stage '+event.stage}>{event.stage}</span>
      <span className="operation-message">{event.message}</span>
      {['success','failure','warning'].includes(event.status)?
        <StatusPill tone={event.status==='failure'?'danger':
          event.status==='success'?'success':'neutral'}>{event.status}</StatusPill>:
        <span className="operation-quiet">Recorded</span>}
      <CaretDown className="operation-expand-icon" size={14}/>
    </summary>
    <div className="operation-evidence">
      <div className="event-detail-heading"><strong>Event details</strong>
        <span>{event.id}</span></div>
      <dl><dt>Time</dt><dd>{new Date(event.timestamp).toLocaleString()}</dd>
        <dt>Stage</dt><dd>{name(event.stage)}</dd>
        {details.slice(0,7).map(([key,value])=><ReactFragmentRow key={key}
          name={name(key)} value={typeof value==='object'?JSON.stringify(value):String(value)}/>)}
      </dl>
      <details className="event-raw-disclosure"><summary>Technical record <CaretDown size={12}/></summary>
        <pre>{JSON.stringify({session:event.sessionId,evidence:event.evidence},null,2)}</pre>
      </details>
    </div>
  </details>;
}
function ReactFragmentRow({name,value}:{name:string;value:string}){
  return <><dt>{name}</dt><dd>{value}</dd></>;
}
function Operations({events,active,connection}:{events:OperationEvent[];
  active:boolean;connection:StreamConnection|'connecting'}){
  const [stage,setStage]=useState('all');
  const [highlights,setHighlights]=useState(true);
  const stages=useMemo(()=>['all',...new Set(events.map(e=>e.stage))],[events]);
  useEffect(()=>{if(stage!=='all'&&!stages.includes(stage))setStage('all')},[stage,stages]);
  const rows=useMemo(()=>operationHighlights(events,highlights)
    .filter(e=>stage==='all'||e.stage===stage).slice(-14).reverse(),
    [events,highlights,stage]);
  return <section className="panel operations">
    <div className="panel-title">
      <span><Activity/>Live operations</span>
      {active&&<StatusPill tone={connection==='connected'?'success':'neutral'}>
        {connection==='connected'?'Live':'Connecting'}</StatusPill>}
      <NavLink className="panel-link" to="/live">History <ArrowUpRight size={14}/></NavLink>
    </div>
    {events.length>0&&<div className="event-toolbar">
      <div className="event-view-switch">
        <button className={highlights?'active':''} onClick={()=>setHighlights(true)}>Highlights</button>
        <button className={!highlights?'active':''} onClick={()=>setHighlights(false)}>All</button>
      </div>
      <select aria-label="Filter operations by stage" value={stage} onChange={e=>setStage(e.target.value)}>
        {stages.map(v=><option key={v} value={v}>{v==='all'?'All stages':v}</option>)}
      </select>
      <span className="event-toolbar-count">{rows.length} shown</span>
    </div>}
    {rows.length===0?<div className="stream-empty">{active?'Monitoring activity…':'No activity yet'}</div>:
      <div className="inline-event-list" role="log">
        {rows.map(event=><EventDisclosure key={event.id} event={event} compact/>)}
      </div>}
  </section>;
}

function DemoOverview({state,events}:{state:DashboardState|null;events:OperationEvent[]}){
  const count=state?.transactions.length??0;
  const active=!!state?.session&&ongoing.has(state.session.status);
  const progress=state?.session?.status==='completed'?100:
    Math.min(95,Math.round((events.length/56)*100));
  const metrics=[
    {label:'Portfolio value',value:state?.accounting.available==null?'—':'$'+String(state.accounting.available),icon:Wallet},
    {label:'Net result',value:state?.accounting.cumulativeNetPnl==null?'—':'$'+String(state.accounting.cumulativeNetPnl),icon:ChartLineUp},
    {label:'Completed liquidations',value:String(count).padStart(2,'0'),icon:CheckCircle},
    {label:'Events streamed',value:String(events.length),icon:Activity},
  ];
  return <section className="demo-overview" aria-label="Demo session overview">
    <div className="demo-overview-top">
      <div><span className="demo-eyebrow">MARKET MONITOR</span><h2>Liquidation engine</h2>
        <p>{active?'Scanning positions, screening risk and processing opportunities in real time.':
          state?.session?'Review the session or start another run.':
          'Set a financing limit and start to see the full liquidation workflow unfold.'}</p></div>
      <span className={'demo-overview-activity '+(active?'is-active':'')}>
        <span className="demo-overview-led"/>{active?'Engine running':state?.session?.status==='completed'?'Run completed':
          state?.session?.status==='paused'?'Paused':state?.session?.status==='stopped'?'Stopped':'Ready'}
      </span>
    </div>
    <div className="demo-metric-grid">
      {metrics.map(({label,value,icon:Icon})=><div className="demo-metric" key={label}>
        <div className="demo-metric-top"><span>{label}</span><Icon size={17}/></div>
        <strong>{value}</strong>
      </div>)}
    </div>
    <div className="demo-progress"><div className="demo-progress-caption"><span>
      {active?'Session activity':'Workflow progress'}</span><span>{progress}%</span></div>
      <div className="demo-progress-track"><div style={{width:progress+'%'}}/></div></div>
  </section>;
}

const TESTNET_ACCOUNT_KEY='arbivane-testnet-account-v1';
const TESTNET_ADDRESS=/^(?:[a-z0-9][a-z0-9_.-]{0,56}\.testnet|[a-f0-9]{64})$/;
type AccountProof={accountId:string;network:string;balanceNear:string;balanceYocto:string;
  sourceBlock:number;checkedAt:string;canSign:boolean;signerConnected:boolean};
function TestnetWallet({compact=false}:{compact?:boolean}){
  const [address,setAddress]=useState(()=>{
    try{return sessionStorage.getItem(TESTNET_ACCOUNT_KEY)??''}catch{return ''}
  });
  const [proof,setProof]=useState<AccountProof|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState(false);
  const valid=TESTNET_ADDRESS.test(address.trim());
  const verify=useCallback(async(value:string)=>{
    if(!TESTNET_ADDRESS.test(value.trim())){setProof(null);setError('Enter a valid NEAR Testnet account.');return}
    setBusy(true);setError('');setProof(null);
    try{
      const response=await fetch('/api/public/testnet/account?accountId='+encodeURIComponent(value.trim()),{
        credentials:'omit',signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error==='TESTNET_RPC_RESPONSE_ERROR'?
        'Account not found on NEAR Testnet.':String(result.error??'Balance unavailable'));
      if(result.network!=='testnet'||result.accountId!==value.trim()||
        result.signerConnected!==false||result.canSign!==false||
        !/^\d+(?:\.\d+)?$/.test(result.balanceNear))
        throw Error('Could not verify the account response');
      setProof(result as AccountProof);
      try{sessionStorage.setItem(TESTNET_ACCOUNT_KEY,value.trim())}catch{}
    }catch(reason){setError(reason instanceof Error?reason.message:'Account lookup failed')}
    finally{setBusy(false)}
  },[]);
  useEffect(()=>{
    if(valid)void verify(address);
    // Refresh verified balance at a modest rate; never collect secrets.
    const timer=setInterval(()=>{
      if(document.visibilityState==='visible'&&TESTNET_ADDRESS.test(address.trim()))
        void verify(address);
    },60000);
    return()=>clearInterval(timer);
  },[]);
  const copy=async()=>{
    if(!proof)return;
    try{await navigator.clipboard.writeText(proof.accountId);setCopied(true)}
    catch{setError('Clipboard unavailable. Select the address above to copy it.')}
  };
  return <section className={'testnet-wallet-card '+(compact?'compact':'')} aria-label="Testnet wallet funding">
    <div className="testnet-wallet-heading">
      <div><span className="testnet-wallet-overline">WALLET & FUNDING</span>
        <h3>Testnet account</h3></div>
      <span className="testnet-wallet-state"><i/>{proof?'Balance verified':'Public address only'}</span>
    </div>
    <div className="testnet-wallet-input">
      <input aria-label="NEAR Testnet public wallet address" spellCheck={false}
        value={address} placeholder="yourname.testnet"
        onChange={e=>{setAddress(e.target.value);setProof(null);setCopied(false);setError('')}}/>
      <button type="button" disabled={!valid||busy} onClick={()=>void verify(address)}>
        <ArrowClockwise size={14}/>{busy?'Checking':'Verify'}</button>
    </div>
    {proof&&<div className="testnet-wallet-balance">
      <div><small>Testnet NEAR balance</small><strong>{Number(proof.balanceNear).toLocaleString(undefined,{maximumFractionDigits:6})}
        <span> TNEAR</span></strong></div>
      <button type="button" onClick={()=>void copy()} aria-label="Copy verified Testnet deposit address">
        <Copy size={15}/>{copied?'Copied':'Copy address'}</button>
    </div>}
    {error&&<div className="testnet-wallet-error" role="status">{error}</div>}
    <div className="testnet-wallet-foot">
      <a href="https://wallet.testnet.near.org/" target="_blank" rel="noreferrer">Create wallet <ArrowUpRight size={13}/></a>
      <a href="https://near-faucet.io/" target="_blank" rel="noreferrer">Get test tokens <ArrowUpRight size={13}/></a>
      <span className="testnet-wallet-note">Signing not connected</span>
    </div>
  </section>;
}

interface VerifiedTestnetLab{
 network:'testnet';status:string;initialized:boolean;sourceBlock:number;
 signerConnected:false;executionEnabled:false;verifiedTransactions:0;
 contracts:Array<{accountId:string;codeVerified:boolean;deploymentTx:string}>;
 reason:string;
}
function TestnetLab(){
 const [lab,setLab]=useState<VerifiedTestnetLab|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  let active=true;
  async function update(){
   try{
    const response=await fetch('/api/public/testnet/lab',{
     credentials:'omit',headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error('LAB_STATUS_UNAVAILABLE');
    const next=await response.json() as VerifiedTestnetLab;
    if(next.network!=='testnet'||next.executionEnabled!==false||
       !Array.isArray(next.contracts)||next.contracts.length!==2)
      throw Error('LAB_PROOF_INVALID');
    if(active){setLab(next);setError(false)}
   }catch{if(active)setError(true)}
  }
  void update();const timer=setInterval(()=>void update(),60000);
  return()=>{active=false;clearInterval(timer)};
 },[]);
 const deployed=lab?.contracts.every(c=>c.codeVerified)===true;
 return <section className="testnet-lab-card" aria-label="Controlled Testnet laboratory">
  <div className="testnet-lab-head">
   <span className="testnet-lab-icon"><Cube size={18}/></span>
   <div><span className="demo-eyebrow">CONTROLLED TESTNET LAB</span>
    <h3>Independent liquidation environment</h3></div>
   <StatusPill tone={deployed?'warning':'neutral'}>
    {deployed?'Setup incomplete':error?'Unavailable':'Verifying'}</StatusPill>
  </div>
  <p>Separate from Rhea's shared Testnet market. Deployed WASM is not proof of an executable liquidation.</p>
  <div className="testnet-lab-steps">
   <span className={deployed?'complete':''}><CheckCircle size={14}/> Contracts deployed</span>
   <span className={lab?.initialized?'complete':''}><ShieldCheck size={14}/> Initialize lending</span>
   <span><ListMagnifyingGlass size={14}/> Fund test positions</span>
   <span><Activity size={14}/> Verify receipt</span>
  </div>
  {lab&&<div className="testnet-lab-detail">
   {lab.contracts.map(c=><div key={c.accountId}>
    <span>{c.accountId.startsWith('lend.')?'Lending':'Oracle'}</span>
    <a href={'https://testnet.nearblocks.io/txns/'+encodeURIComponent(c.deploymentTx)}
      target="_blank" rel="noreferrer">{c.accountId}<ArrowUpRight size={13}/></a>
   </div>)}
   <div><span>Readiness</span><strong>{lab.status.replaceAll('_',' ').toLowerCase()}</strong></div>
   <div><span>Verified liquidations</span><strong>{lab.verifiedTransactions}</strong></div>
  </div>}
  {error&&<span className="testnet-lab-warning">Live contract verification unavailable; no execution is authorized.</span>}
  <span className="testnet-lab-note">No private keys connected · Mainnet spending disabled</span>
 </section>;
}

function TestnetOverview({state,readiness}:{state:DashboardState|null;readiness?:EnvironmentReadiness}){
  const active=state?.session?.status==='running';
  const session=state?.session as (DashboardState['session']&{
    scanned?:number;debtPositions?:number;observedBlocks?:number;cursor?:number;
    blocked?:number;pending?:number;cycles?:number;missingPrices?:string[];
    staleIndexedDebt?:number;marketStatus?:string;
    oracleOwner?:string|null;pythOracleEnabled?:boolean})|null;
  const connected=readiness?.capabilities?.read===true;
  return <section className="demo-overview testnet-overview" aria-label="Live Testnet monitor">
    <div className="demo-overview-top"><div>
      <span className="demo-eyebrow">NETWORK MONITOR</span>
      <h2>Testnet automation</h2>
      <p>Checking fresh debt positions, oracle prices and liquidation readiness.</p>
    </div><span className={'demo-overview-activity '+(active?'is-active':'')}>
      <span className="demo-overview-led"/>{active?'Scanning live chain':connected?'RPC connected':'RPC unavailable'}
    </span></div>
    <div className="demo-metric-grid">
      <div className="demo-metric"><div className="demo-metric-top"><span>Accounts scanned</span><Activity size={17}/></div>
        <strong>{session?.scanned?.toLocaleString()??'0'}</strong></div>
      <div className="demo-metric"><div className="demo-metric-top"><span>Fresh debt accounts</span><ListMagnifyingGlass size={17}/></div>
        <strong>{session?.debtPositions?.toLocaleString()??'0'}</strong></div>
      <div className="demo-metric"><div className="demo-metric-top"><span>Blocked / unverified</span><ShieldCheck size={17}/></div>
        <strong>{(session?.blocked??0)+(session?.pending??0)}</strong></div>
      <div className="demo-metric"><div className="demo-metric-top"><span>Execution</span><ShieldCheck size={17}/></div>
        <strong>{session?.marketStatus==='UPSTREAM_ORACLE_UNPRICED'?'Oracle blocked':'Not ready'}</strong></div>
    </div>
    <div className="testnet-observer-footer">Block {(session?.observedBlocks??readiness?.blockHeight)?.toLocaleString()??'—'}
      <span>·</span> {(session?.cycles??0)} monitoring cycles
      <span>·</span> {(session?.staleIndexedDebt??0)} stale debt records excluded
      <span>·</span> No transactions submitted</div>
    {session?.marketStatus==='UPSTREAM_ORACLE_UNPRICED'&&
      <div className="testnet-blocker-summary">
        <WarningCircle size={17}/>
        <div className="testnet-market-alert">
          <strong>Rhea Testnet oracle is not pricing required assets</strong>
          <p>The lending contract cannot verify liquidations in this market.
             Your funded Testnet wallet does not fix an oracle feed.</p>
          <details>
            <summary>Technical evidence <CaretDown size={13}/></summary>
            <div className="testnet-market-proof">
              <span>Oracle</span><code>mock-priceoracle.testnet</code>
              <span>Lending owner</span><code>{session.oracleOwner??'Not reported'}</code>
              <span>Alternative Pyth oracle</span><code>{session.pythOracleEnabled?'Enabled':'Disabled'}</code>
              <span>Unpriced assets</span><code>{session.missingPrices?.join(', ')||'Unavailable'}</code>
            </div>
          </details>
        </div>
      </div>}
  </section>;
}

function Accounting({state}:{state:DashboardState|null}) {
  if(!hasFinancialEvidence(state))return null;
  const accounting=state!.accounting;
  const assets=state!.wallet.balances as Array<{atomic?:string;tokenId?:string}>;
  const values:Array<[string,unknown]>=[
    ['Gross proceeds',accounting.grossProceeds],
    ['Financing fees',accounting.financingFees],
    ['Swap costs',accounting.swapCosts],
    ['Gas fees',accounting.gasFees],
    ['Net P&L',accounting.cumulativeNetPnl]
  ].filter((entry)=>entry[1]!==null&&entry[1]!==undefined);
  return <section className="panel balance" aria-label="Financial summary">
    <div className="panel-title"><span>{state?.environment==='demo'?'Portfolio':'Balance'}</span><NavLink className="panel-link" to="/wallet">Wallet <ArrowUpRight size={14}/></NavLink></div>
    <div className="account-balance-grid">
      {assets.map((asset,i)=><div className="asset-balance" key={asset.tokenId??i}>
        <small>{asset.tokenId??'Token'}{state?.environment==='demo'?'':' · atomic units'}</small>
        <strong>{asset.atomic??'—'}</strong>
      </div>)}
      {accounting.available!==null&&accounting.available!==undefined&&
        <div className="asset-balance"><small>{state?.environment==='demo'?'Available · USD':'Reconciled available · USD'}</small><strong>{String(accounting.available)}</strong></div>}
    </div>
    {values.length>0&&<div className="financial-metrics">{values.map(([label,value])=>
      <div key={String(label)}><small>{label}</small><b>{String(value)}</b></div>
    )}</div>}
  </section>;
}

function SessionSummary({state,events}:{state:DashboardState|null;events:OperationEvent[]}){
  const session=state?.session;
  if(!session)return null;
  const last=events.filter(event=>event.sessionId===session.id).at(-1);
  const active=ongoing.has(session.status)||session.status==='paused';
  return <section className="panel session-summary" aria-label="Session summary">
    <div className="panel-title"><span>{active?'Current session':'Last session'}</span>
      <StatusPill tone={session.status==='completed'?'success':session.status==='failed'?'danger':'neutral'}>{session.status.replaceAll('_',' ')}</StatusPill>
    </div>
    <div className="session-summary-content">
      <div><small>Started</small><strong>{session.startedAt?new Date(session.startedAt).toLocaleString():'Not started'}</strong></div>
      {session.endedAt&&<div><small>Ended</small><strong>{new Date(session.endedAt).toLocaleString()}</strong></div>}
      {last&&<div className="session-last-event"><small>Latest event</small><strong>{last.message}</strong></div>}
      {session.failure!=null&&<NavLink to="/live" className="panel-link">Inspect failure <ArrowUpRight size={14}/></NavLink>}
    </div>
  </section>;
}

function ResearchActivity(){
  const runs=useResearchRuns(UI_PREVIEW);
  if(!runs.length)return null;
  const latest=runs[0];
  const status=(run:typeof latest)=>run.status==='completed'?
    (run.conclusion==='success'?'Checks passed':run.conclusion==='failure'?'Checks failed':'Completed'):
    run.status==='in_progress'?'Running':'Queued';
  const tone=(run:typeof latest)=>run.status!=='completed'?'neutral':
    run.conclusion==='success'?'success':run.conclusion==='failure'?'danger':'neutral';
  return <section className="panel research-runs" aria-label="Sandbox research checks">
    <details className="research-disclosure">
      <summary>
        <span className="research-disclosure-title">Sandbox research</span>
        <span className="research-current" title={latest.name}>{latest.name}</span>
        <StatusPill tone={tone(latest)}>{status(latest)}</StatusPill>
      </summary>
      <div className="research-rows">
        {runs.map(run=><a href={run.html_url} key={run.id} target="_blank" rel="noreferrer" className="research-row">
          <span className="research-run-title">{run.name}</span><StatusPill tone={tone(run)}>{status(run)}</StatusPill><ArrowUpRight size={15}/>
        </a>)}
        <a className="research-more" href="https://github.com/emmy16-glitch/ARBIVANE/actions"
          target="_blank" rel="noreferrer">All workflow records <ArrowUpRight size={14}/></a>
      </div>
    </details>
  </section>;
}

function Recent({state}:{state:DashboardState|null}) {
  const tx=state?.transactions??[];
  if(!tx.length)return null;
  return <section className="panel recent">
    <div className="panel-title"><span>Recent Operations</span><NavLink to="/transactions">View all <ArrowUpRight/></NavLink></div>
    <div className="transaction-list">{tx.slice(0,5).map(row=><div className="transaction-row" key={String(row.id)}>
      <span className="tx-icon"><CheckCircle weight="fill"/></span>
      <span><b>{String(row.network==='demo'?'Liquidation':row.type??'Transaction')}</b><small>{String(row.borrowerAccountId)}</small></span>
      <span><b>{row.network==='demo'?'$'+String(row.netProfitUsd):String(row.assetIncreaseAtomic)+' atomic'}</b><small>{row.network==='demo'?'Net result':String(row.seizeTokenId)}</small></span>
      <span><StatusPill tone="success">{row.network==='demo'?'Completed':'Verified'}</StatusPill><small>{row.network==='demo'?'Settled':'Unsold inventory'}</small></span>
    </div>)}</div>
  </section>;
}

function Dashboard(){
  const {environment}=useEnvironment();
  const [state,setState]=useState<DashboardState|null>(null);
  const [readiness,setReadiness]=useState<Partial<Record<Environment,EnvironmentReadiness>>>({});
  const [events,setEvents]=useState<OperationEvent[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState<string|null>(null);

  const [connection,setConnection]=useState<StreamConnection|'connecting'>('connecting');
  const selectedEnvironment=useRef(environment);
  selectedEnvironment.current=environment;
  const refresh=useCallback(async()=>{
    try{
      const data=await loadEnvironment(environment);
      if(selectedEnvironment.current!==environment)return;
      setState(data.state);
      setEvents(previous=>mergeOperationEvents(environment,previous,data.events));
      setReadiness(previous=>({...previous,[environment]:data.readiness}));
      setError('');
    }catch(e){
      if(selectedEnvironment.current===environment)setError(e instanceof Error?e.message:'LOAD_FAILED');
    }
  },[environment]);
  useEffect(()=>{
    let source:EventSource|undefined;let active=true;let loading=false;
    let refreshTimer:ReturnType<typeof setTimeout>|undefined;
    let poll:ReturnType<typeof setInterval>|undefined;
    const reconcile=async()=>{
      if(!active||loading)return;
      loading=true;
      try{await refresh()}finally{loading=false}
    };
    const onOnline=()=>{if(active)void reconcile()};
    const onVisible=()=>{if(document.visibilityState==='visible')onOnline()};
    setState(null);setEvents([]);setConnection('connecting');
    // Subscribe independently of the first snapshot: a temporary API outage
    // must not leave the dashboard frozen after network recovery.
    if(!UI_PREVIEW){
      source=subscribe(environment,event=>{
        if(!active)return;
        setEvents(previous=>mergeOperationEvents(environment,previous,[event]));
        if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=undefined;if(active)void reconcile()},900);
      },status=>{if(active){setConnection(status);if(status==='connected')void reconcile()}});
      poll=setInterval(()=>{if(document.visibilityState==='visible')void reconcile()},30000);
      window.addEventListener('online',onOnline);
      document.addEventListener('visibilitychange',onVisible);
    }
    void reconcile();
    return()=>{
      active=false;
      if(refreshTimer)clearTimeout(refreshTimer);
      if(poll)clearInterval(poll);
      window.removeEventListener('online',onOnline);
      document.removeEventListener('visibilitychange',onVisible);
      source?.close();
    };
  },[environment,refresh]);
  const run=async(action:string,settings?:DashboardState['settings'])=>{
    setBusy(action);setError('');
    try{await command(environment,action,settings);await refresh()}
    catch(e){setError(e instanceof Error?e.message:'COMMAND_FAILED')}
    finally{setBusy(null)}
  };
  const session=state?.session;
  const isWorking=!!session&&ongoing.has(session.status);
  const hasAside=hasFinancialEvidence(state)||!!session||(state?.transactions.length??0)>0;
  return <>{environment==='demo'&&<DemoOverview state={state} events={events}/>}
  {environment==='testnet'&&<TestnetOverview state={state} readiness={readiness.testnet}/>}
  {environment==='testnet'&&<TestnetWallet compact/>}
  {environment==='testnet'&&<TestnetLab/>}
  <div className={`workspace ${isWorking?'workspace-running':hasAside?'workspace-history':'workspace-idle'}`}>
    <div className="workspace-primary">
      <Automation environment={environment} state={state} readiness={readiness[environment]} onCommand={run} busy={busy}/>
      {error&&<ApiError error={error} onRetry={()=>void refresh()}/>}
      <Operations key={environment} events={events} connection={connection} active={isWorking}/>
    </div>
    {hasAside&&<aside className="workspace-aside" aria-label="Session and financial details">
      <SessionSummary state={state} events={events}/>
      <Accounting state={state}/>
      <Recent state={state}/>
    </aside>}
  </div></>;
}

type ViewKind='live'|'opportunities'|'performance'|'wallet'|'transactions'|'analytics'|'settings';
const viewCopy:Record<ViewKind,{title:string;icon:typeof Gauge}>={
  live:{title:'Live operations',icon:Activity},
  opportunities:{title:'Opportunities',icon:Cube},
  performance:{title:'Performance',icon:ChartLineUp},
  wallet:{title:'Wallet',icon:Wallet},
  transactions:{title:'Transactions',icon:ClockCounterClockwise},
  analytics:{title:'Analytics',icon:ListMagnifyingGlass},
  settings:{title:'Settings',icon:SlidersHorizontal},
};

function LiveEventTable({events}:{events:OperationEvent[]}){
  const [query,setQuery]=useState('');
  const [stage,setStage]=useState('all');
  const [highlights,setHighlights]=useState(true);
  const [limit,setLimit]=useState(35);
  const stages=useMemo(()=>['all',...new Set(events.map(e=>e.stage))],[events]);
  useEffect(()=>{if(stage!=='all'&&!stages.includes(stage))setStage('all')},[stage,stages]);
  const matching=useMemo(()=>operationHighlights(events,highlights).filter(e=>
    (stage==='all'||e.stage===stage)&&(!query.trim()||
      [e.message,e.stage,e.status,e.id,e.sessionId].filter(Boolean).join(' ')
       .toLowerCase().includes(query.trim().toLowerCase()))).slice().reverse(),
    [events,stage,query,highlights]);
  const rows=matching.slice(0,limit);
  return <div className="operations-workspace">
    <div className="table-toolbar event-history-toolbar">
      <label className="table-search"><span className="visually-hidden">Search operations</span>
        <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
          placeholder="Find an event or borrower"/>
      </label>
      <div className="event-view-switch">
        <button className={highlights?'active':''} onClick={()=>setHighlights(true)}>Highlights</button>
        <button className={!highlights?'active':''} onClick={()=>setHighlights(false)}>All events</button>
      </div>
      <select aria-label="Filter by event stage" value={stage} onChange={event=>setStage(event.target.value)}>
        {stages.map(v=><option key={v} value={v}>{v==='all'?'All stages':v}</option>)}
      </select>
    </div>
    {rows.length===0?<div className="data-empty">No matching events</div>:
      <div className="operations-table">
        <div className="operations-table-head event-table-head"><span>Time</span>
          <span>Stage</span><span>Activity</span><span>Result</span><span/></div>
        {rows.map(event=><EventDisclosure key={event.id} event={event}/>)}
      </div>}
    {matching.length>limit&&<button className="event-load-more"
      onClick={()=>setLimit(n=>n+35)}>Show older events ({matching.length-limit} remaining)</button>}
  </div>;
}

function OpportunityTable({rows}:{rows:Array<Record<string,unknown>>}){
  const [query,setQuery]=useState('');
  const [order,setOrder]=useState<'recent'|'borrower'>('recent');
  const filtered=useMemo(()=>{
    const list=rows.filter(r=>!query.trim()||
      String(r.borrowerAccountId??r.accountId??'').toLowerCase().includes(query.trim().toLowerCase()));
    return order==='borrower'?list.slice().sort((a,b)=>String(a.borrowerAccountId??a.accountId??'').localeCompare(String(b.borrowerAccountId??b.accountId??''))):list;
  },[rows,query,order]);
  return <div className="opportunity-workspace">
    <div className="table-toolbar">
      <label className="table-search"><span className="visually-hidden">Search borrowers</span>
        <input type="search" placeholder="Search borrowers" value={query} onChange={event=>setQuery(event.target.value)}/>
      </label>
      <select aria-label="Sort opportunities" value={order} onChange={event=>setOrder(event.target.value)}>
        <option value="recent">Recorded order</option><option value="borrower">Borrower A–Z</option>
      </select>
    </div>
    <div className="opportunity-list">
      {filtered.map((row,index)=><details key={String(row.id??index)} className="opportunity-row">
        <summary>
          <b>{String(row.borrowerAccountId??row.accountId??'Source observation')}</b>
          <span>{(row.blockHeight??row.sourceBlock)==null?'Block —':`Block ${row.blockHeight??row.sourceBlock}`}</span>
          <StatusPill>{String(row.status??'Under review')}</StatusPill>
        </summary>
        {row.sourceNetwork==='testnet'?<div className="testnet-position-detail">
          <div><span>Fresh status</span><strong>{String(row.assessmentReason??'Not verified').replaceAll('_',' ').toLowerCase()}</strong></div>
          <div><span>Current debt</span><strong>{row.hasDebt===true?'Confirmed':'Not confirmed'}</strong></div>
          {Array.isArray(row.missingOracleTokens)&&row.missingOracleTokens.length>0&&
            <div className="testnet-missing-prices"><span>Missing oracle prices</span>
              <strong>{row.missingOracleTokens.join(', ')}</strong></div>}
          <details className="event-raw-disclosure"><summary>Technical evidence <CaretDown size={12}/></summary>
            <pre>{JSON.stringify(row,null,2)}</pre></details>
        </div>:<div className="operation-evidence"><pre>{JSON.stringify(row,null,2)}</pre></div>}
      </details>)}
    </div>
    {filtered.length===0&&<div className="data-empty">No matching borrowers</div>}
  </div>;
}

function PerformanceWorkspace({accounting}:{accounting:DashboardState['accounting']}){
  const metrics=[
    ['Gross proceeds','grossProceeds'],['Financing fees','financingFees'],
    ['Swap costs','swapCosts'],['Gas fees','gasFees'],
    ['Realized profit','realizedProfit'],['Realized loss','realizedLoss'],
    ['Net P&L','cumulativeNetPnl']
  ] as const;
  const items=metrics.filter(([,key])=>accounting[key]!=null);
  return <div className="performance-workspace">
    <div className="performance-heading">
      <span>{accounting.evidence && typeof accounting.evidence==='object' && (accounting.evidence as Record<string,unknown>).scenario==='demo'?'Performance overview':'Reconciled financial results'}</span>
      <time>Updated {String(accounting.reconciledAt)}</time>
    </div>
    <div className="performance-metrics">{items.map(([label,key])=><div key={key}>
      <small>{label}</small><strong>{String(accounting[key])}</strong>
    </div>)}</div>
    {accounting.evidence!=null&&<details className="performance-evidence">
      <summary>Reconciliation evidence</summary><pre>{JSON.stringify(accounting.evidence,null,2)}</pre>
    </details>}
  </div>;
}

function TransactionWorkspace({rows}:{rows:Array<Record<string,unknown>>}){
  const [query,setQuery]=useState('');
  const filtered=rows.filter(row=>!query.trim()||
    JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="transaction-workspace">
    <div className="table-toolbar">
      <label className="table-search"><span className="visually-hidden">Search transactions</span>
        <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
         placeholder="Search borrower, transaction or token"/>
      </label>
    </div>
    <div className="transaction-table">
      {filtered.map((row,index)=><details key={String(row.id??index)} className="transaction-entry">
        <summary><code>{String(row.id??'Receipt')}</code>
          <span>{String(row.borrowerAccountId??'—')}</span>
          <span>{row.sourceBlock==null?'—':String(row.sourceBlock)}</span>
          <StatusPill tone="success">{row.network==='demo'?'Completed':'Verified inventory'}</StatusPill>
        </summary>
        {row.sourceNetwork==='testnet'?<div className="testnet-position-detail">
          <div><span>Fresh status</span><strong>{String(row.assessmentReason??'Not verified').replaceAll('_',' ').toLowerCase()}</strong></div>
          <div><span>Current debt</span><strong>{row.hasDebt===true?'Confirmed':'Not confirmed'}</strong></div>
          {Array.isArray(row.missingOracleTokens)&&row.missingOracleTokens.length>0&&
            <div className="testnet-missing-prices"><span>Missing oracle prices</span>
              <strong>{row.missingOracleTokens.join(', ')}</strong></div>}
          <details className="event-raw-disclosure"><summary>Technical evidence <CaretDown size={12}/></summary>
            <pre>{JSON.stringify(row,null,2)}</pre></details>
        </div>:<div className="operation-evidence"><pre>{JSON.stringify(row,null,2)}</pre></div>}
      </details>)}
    </div>
    {!filtered.length&&<div className="data-empty">No matching transactions</div>}
  </div>;
}

function HumanLabel({name}:{name:string}){
  return <>{name.replace(/[_-]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase())}</>;
}
function WalletWorkspace({state}:{state:DashboardState}){
  const assets=state.wallet.balances as Array<{tokenId?:string;atomic?:string;transferableOutsideEnvironment?:boolean}>;
  return <div className="wallet-workspace">
    <div className="wallet-summary">
      <div><small>Wallet status</small><strong>{state.wallet.status.replaceAll('_',' ')}</strong></div>
      <div><small>Account</small><strong>{state.wallet.accountId??'Not connected'}</strong></div>
    </div>
    {assets.length?<>
      <div className="section-label">Assets</div>
      <div className="wallet-assets">{assets.map((asset,index)=><article className="asset-row" key={asset.tokenId??index}>
        <div><strong>{asset.tokenId??'Token'}</strong>
          <small>{state.environment==='demo'?'Portfolio balance':asset.transferableOutsideEnvironment===false?'Sandbox asset':'Transfer status unverified'}</small>
        </div><div className="asset-value"><strong>{asset.atomic??'—'}</strong><small>{state.environment==='demo'?'USD':'Atomic units'}</small></div>
      </article>)}</div>
    </>:<div className="compact-blank"><Wallet size={23}/><span>No assets available</span></div>}
    <div className="wallet-footer"><span>{state.environment==='demo'?'Portfolio is limited to this demo session.':'Deposit and withdrawal are unavailable until authorized custody is configured.'}</span></div>
  </div>;
}
function SettingsWorkspace({readiness,environment}:{readiness:EnvironmentReadiness;environment:Environment}){
  const capabilities=Object.entries(readiness.capabilities??{});
  const requirements=Object.entries(readiness.requirements??{});
  return <div className="settings-workspace">
    <div className="settings-status">
      <div><small>Environment</small><strong>{envInfo[environment].title}</strong></div>
      <div><small>Network status</small><strong>{readiness.status==='unavailable'?'Not configured':readiness.status.replaceAll('_',' ')}</strong></div>
      <div><small>Chain</small><strong>{readiness.chainId||'—'}</strong></div>
      <div><small>Observed block</small><strong>{readiness.blockHeight??'—'}</strong></div>
    </div>
    {capabilities.length>0&&<section className="settings-section"><h2>Capabilities</h2>
      <div className="settings-rows">{capabilities.map(([name,available])=><div key={name}>
        <span><HumanLabel name={name}/></span><StatusPill tone={available?'success':'neutral'}>{available?'Ready':'Unavailable'}</StatusPill>
      </div>)}</div>
    </section>}
    {requirements.length>0&&<details className="settings-details"><summary>Requirements and diagnostics</summary>
      <div className="settings-rows">{requirements.map(([name,value])=><div key={name}>
        <span><HumanLabel name={name}/></span><span className="requirement-value">
          {typeof value==='boolean'?(value?'Ready':'Missing'):value===null?'Not configured':
           typeof value==='object'?JSON.stringify(value):String(value)}
        </span>
      </div>)}</div>
    </details>}
  </div>;
}
function OperationalPage({kind}:{kind:ViewKind}){
  const Icon=viewCopy[kind].icon;
  const {environment}=useEnvironment();
  const [data,setData]=useState<{state:DashboardState;events:OperationEvent[];readiness:EnvironmentReadiness}|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    let source:EventSource|undefined;
    let poll:ReturnType<typeof setInterval>|undefined;
    setData(null);setError('');
    const load=async()=>{
      try{
        const value=await loadEnvironment(environment);
        if(!active)return;
        setData(current=>current?{
          ...value,events:mergeOperationEvents(environment,current.events,value.events)
        }:value);
        setError(previous=>previous==='STREAM_RECONNECTING'?previous:'');
        return true;
      }catch(reason){
        if(active)setError(reason instanceof Error?reason.message:'LOAD_FAILED');
        return false;
      }
    };
    // Keep retrying independently of a failed initial request. Reconnecting
    // to the SSE stream also refreshes persisted events and metadata.
    if(!UI_PREVIEW){
      if(kind==='live'){
        source=subscribe(environment,event=>{
          if(active)setData(current=>current?{
            ...current,events:mergeOperationEvents(environment,current.events,[event])
          }:current);
        },status=>{
          if(!active)return;
          if(status==='reconnecting')setError('STREAM_RECONNECTING');
          if(status==='connected'){
            setError(previous=>previous==='STREAM_RECONNECTING'?'':previous);
            void load();
          }
        });
      }
      poll=setInterval(()=>{if(active&&document.visibilityState==='visible')void load()},30000);
    }
    const onOnline=()=>{if(active)void load()};
    const onVisible=()=>{if(document.visibilityState==='visible')onOnline()};
    window.addEventListener('online',onOnline);
    document.addEventListener('visibilitychange',onVisible);
    void load();
    return()=>{
      active=false;source?.close();if(poll)clearInterval(poll);
      window.removeEventListener('online',onOnline);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[environment,kind,retry]);
  const transactions=data?.state.transactions??[];
  const opportunities=data?.state.opportunities??[];
  let content:React.ReactNode;
  if(!data&&error)content=<ApiError error={error} onRetry={()=>setRetry(current=>current+1)}/>;
  else if(!data)content=<div className="page-loading" role="status">Loading</div>;
  else if(kind==='transactions')content=transactions.length?
    <TransactionWorkspace rows={transactions}/>:<Empty icon={Icon} title="No transactions yet"/>;
  else if(kind==='wallet')content=environment==='testnet'?
    <TestnetWallet/>:<WalletWorkspace state={data.state}/>;
  else if(kind==='performance'||kind==='analytics')content=data.state.accounting.reconciledAt?
    <PerformanceWorkspace accounting={data.state.accounting}/>:<Empty icon={Icon} title="No performance data"/>;
  else if(kind==='opportunities')content=opportunities.length?
    <OpportunityTable rows={opportunities}/>:<Empty icon={Icon}
      title={environment==='testnet'?'No borrower debt observed yet':'No opportunities yet'}
      text={environment==='testnet'?'Start a live Testnet scan to read borrower positions from the lending contract.':undefined}/>;
  else if(kind==='live')content=data.events.length?<LiveEventTable events={data.events}/>:<Empty icon={Icon} title="No activity yet"/>;
  else content=<SettingsWorkspace readiness={data.readiness} environment={environment}/>;
  return <div className="subpage operational-page">
    {(kind==='live'||kind==='transactions')&&<nav className="history-tabs" aria-label="Operations sections">
      <NavLink to="/live" end>Events</NavLink><NavLink to="/transactions">Transactions</NavLink>
    </nav>}
    {data&&error&&<div className="route-warning" role="status">
      <span>{error==='STREAM_RECONNECTING'?'Reconnecting to events':error.replaceAll('_',' ')}</span>
      <button onClick={()=>setRetry(current=>current+1)}>Retry</button>
    </div>}
    <section className="panel page-panel">{content}</section>
  </div>;
}

export function App(){const [environment,setEnvironmentState]=useState<Environment>(()=>{
  try{const mode=sessionStorage.getItem('arbivane-current-mode');
    return mode==='demo'||mode==='testnet'||mode==='mainnet'?mode:'demo'}catch{return 'demo'}
});
const setEnvironment=(next:Environment)=>{setEnvironmentState(next);
  try{sessionStorage.setItem('arbivane-current-mode',next)}catch{}
};
return <EnvironmentContext.Provider value={{environment,setEnvironment}}><Shell><Routes><Route path="/" element={<Dashboard/>}/><Route path="/live" element={<OperationalPage kind="live"/>}/><Route path="/opportunities" element={<OperationalPage kind="opportunities"/>}/><Route path="/performance" element={<OperationalPage kind="performance"/>}/><Route path="/wallet" element={<OperationalPage kind="wallet"/>}/><Route path="/transactions" element={<OperationalPage kind="transactions"/>}/><Route path="/analytics" element={<Navigate to="/performance" replace/>}/><Route path="/settings" element={<OperationalPage kind="settings"/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell></EnvironmentContext.Provider>}
