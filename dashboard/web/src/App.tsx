import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Navigate, NavLink, Route, Routes, useLocation} from 'react-router-dom';
import {
  Pulse as Activity, ArrowDown, ArrowUpRight, ChartLineUp, CheckCircle, CirclesThree,
  ClockCounterClockwise, Cube, Flask, Gauge, Gear, Globe, House, ListMagnifyingGlass,
  Pause, Play, ShieldCheck, SlidersHorizontal, Stop, Wallet,
  WarningCircle, X,
} from '@phosphor-icons/react';
import {authenticate, command, loadEnvironment, subscribe, UI_PREVIEW} from './api';
import type {StreamConnection} from './api';
import {mergeOperationEvents} from './events';
import {useResearchRuns} from './research';
import {hasFinancialEvidence} from './workspace';
import type {DashboardState, Environment, EnvironmentReadiness, OperationEvent} from './types';

const envInfo = {
  sandbox: {title:'Sandbox', icon:Flask},
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
          className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{label}</span></NavLink>)}
      </nav>
    </aside>
    <header className="topbar">
      <span className="topbar-page">{current}</span>
      <div className="topbar-actions">
        <EnvironmentPicker/>
        <NavLink className="topbar-settings" to="/settings" title="Settings" aria-label="Settings"><Gear size={19}/></NavLink>
      </div>
    </header>
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
      return <button type="button" key={key} aria-pressed={environment===key}
        className={environment===key?'environment selected':'environment'}
        onClick={()=>setEnvironment(key)}>{entry.title}</button>;
    })}
  </div>;
}

function Automation({environment,state,readiness,onCommand,busy}:{environment:Environment;state:DashboardState|null;readiness?:EnvironmentReadiness;onCommand:(a:string,s?:DashboardState['settings'])=>void;busy:string|null}) {
  const [amount,setAmount]=useState(state?.settings.maxFinancingUsd??'');
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
      <label className="money-label">
        <span>Maximum financing per liquidation</span>
        <div className="money-input">
          <span>USD</span>
          <input value={amount} inputMode="decimal" placeholder="Enter amount" onChange={e=>setAmount(e.target.value)} aria-label="Maximum financing per liquidation in US dollars"/>
        </div>
      </label>
      <details className="advanced-controls">
        <summary><SlidersHorizontal size={16}/> Advanced settings</summary>
        <label className="advanced-field"><span>Minimum reference gross (USD)</span>
          <input value={minimum} inputMode="decimal" onChange={e=>setMinimum(e.target.value)}
            aria-label="Minimum reference gross screening amount" title="Source screening threshold, not realized profit"/>
        </label>
      </details>
    </div>
      <div className="automation-actions">
        <div className="controls">
      <button className="primary" disabled={running||busy!==null||!canAutomate||!validAmount}
        onClick={()=>onCommand(status==='paused'?'resume':'start',{maxFinancingUsd:amount,minimumNetProfitUsd:minimum})}>
        <Play weight="fill"/>{status==='paused'?'Resume':'Start Automation'}
      </button>
      {hasSession&&<>
        <button disabled={!['running','starting'].includes(status)||busy!==null} onClick={()=>onCommand('pause')}><Pause weight="fill"/>Pause</button>
        <button className="stop" disabled={status==='stopping'||busy!==null} onClick={()=>onCommand('stop')}><Stop weight="fill"/>Stop</button>
      </>}
    </div>
        {!canAutomate&&<div className="automation-availability"><span>Automation unavailable</span><NavLink to="/settings">Details <ArrowUpRight size={13}/></NavLink></div>}
      </div>
    </div>
  </section>;
}

function Operations({events,onOpen,active,connection}:{events:OperationEvent[];onOpen:(e:OperationEvent)=>void;active:boolean;connection:StreamConnection|'connecting'}) {
  const [filter,setFilter]=useState('all');
  const filtered=filter==='all'?events:events.filter(e=>e.stage===filter);
  const stages=['all',...new Set(events.map(e=>e.stage))];
  return <section className="panel operations">
    <div className="panel-title">
      <span><Activity/>Live Operations</span>
      {active&&<StatusPill tone={connection==='connected'?'success':'neutral'}>{connection==='connected'?'Live':connection==='reconnecting'?'Reconnecting':'Connecting'}</StatusPill>}
      {!active&&events.length>0&&<NavLink className="panel-link" to="/live">History <ArrowUpRight size={14}/></NavLink>}
    </div>
    {events.length>0&&<div className="filters">{stages.map(stage=><button className={filter===stage?'active':''} onClick={()=>setFilter(stage)} key={stage}>{stage}<small>{stage==='all'?events.length:events.filter(e=>e.stage===stage).length}</small></button>)}</div>}
    {filtered.length===0?<div className="stream-empty">{active?'Waiting for events':'No activity yet'}</div>:
      <div className="event-list" role="log">{filtered.slice().reverse().map(event=><button className="event-row" key={event.id} onClick={()=>onOpen(event)}><time>{new Date(event.timestamp).toLocaleTimeString([], {hour12:false})}</time><span className={'event-dot '+event.status}/><b>{event.stage}</b><span className="event-message">{event.message}</span><StatusPill tone={event.status==='failure'?'danger':event.status==='success'?'success':'neutral'}>{event.status}</StatusPill><ArrowUpRight/></button>)}</div>}
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
    <div className="panel-title"><span>Balance</span><NavLink className="panel-link" to="/wallet">Wallet <ArrowUpRight size={14}/></NavLink></div>
    <div className="account-balance-grid">
      {assets.map((asset,i)=><div className="asset-balance" key={asset.tokenId??i}>
        <small>{asset.tokenId??'Token'} · atomic units</small>
        <strong>{asset.atomic??'—'}</strong>
      </div>)}
      {accounting.available!==null&&accounting.available!==undefined&&
        <div className="asset-balance"><small>Reconciled available · USD</small><strong>{String(accounting.available)}</strong></div>}
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
      <span><b>{String(row.type)}</b><small>{String(row.borrowerAccountId)}</small></span>
      <span><b>{String(row.assetIncreaseAtomic)} atomic</b><small>{String(row.seizeTokenId)}</small></span>
      <span><StatusPill tone="success">Verified</StatusPill><small>Unsold inventory</small></span>
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
  const [detail,setDetail]=useState<OperationEvent|null>(null);
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
    let source:EventSource|undefined;let active=true;
    let refreshTimer:ReturnType<typeof setTimeout>|undefined;
    setState(null);setEvents([]);setDetail(null);setConnection('connecting');
    void refresh().then(()=>{
      if(!active)return;
      source=subscribe(environment,event=>{
        if(!active)return;
        setEvents(previous=>mergeOperationEvents(environment,previous,[event]));
        if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=undefined;if(active)void refresh()},900);
      },status=>{if(active)setConnection(status)});
    });
    return()=>{active=false;if(refreshTimer)clearTimeout(refreshTimer);source?.close()};
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
  return <div className={`workspace ${isWorking?'workspace-running':hasAside?'workspace-history':'workspace-idle'}`}>
    <div className="workspace-primary">
      <Automation key={environment} environment={environment} state={state} readiness={readiness[environment]} onCommand={run} busy={busy}/>
      {error&&<ApiError error={error} onRetry={()=>void refresh()}/>}
      <Operations key={environment} events={events} onOpen={setDetail} connection={connection} active={isWorking}/>
      {environment==='sandbox'&&<ResearchActivity/>}
    </div>
    {hasAside&&<aside className="workspace-aside" aria-label="Session and financial details">
      <SessionSummary state={state} events={events}/>
      <Accounting state={state}/>
      <Recent state={state}/>
    </aside>}
    {detail&&<div className="drawer-backdrop" onClick={()=>setDetail(null)}>
      <aside className="drawer" onClick={event=>event.stopPropagation()} aria-label="Operation details">
        <button className="drawer-close" onClick={()=>setDetail(null)} aria-label="Close event details"><X/></button>
        <small>EVENT {detail.id}</small><h2>{detail.stage}</h2>
        <StatusPill tone={detail.status==='failure'?'danger':'neutral'}>{detail.status}</StatusPill>
        <p>{detail.message}</p>
        <dl><dt>Timestamp</dt><dd>{detail.timestamp}</dd><dt>Session</dt><dd>{detail.sessionId??'None'}</dd></dl>
        <h3>Technical evidence</h3>
        <pre>{detail.evidence?JSON.stringify(detail.evidence,null,2):'No additional evidence attached.'}</pre>
      </aside>
    </div>}
  </div>;
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
  const [filter,setFilter]=useState('all');
  const stages=useMemo(()=>['all',...new Set(events.map(e=>e.stage))],[events]);
  const rows=useMemo(()=>events.filter(e=>(filter==='all'||e.stage===filter)&&
    (!query.trim()||[e.message,e.stage,e.status,e.id,e.sessionId].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())))
    .slice().reverse(),[events,filter,query]);
  return <div className="operations-workspace">
    <div className="table-toolbar">
      <label className="table-search"><span className="visually-hidden">Search operations</span>
        <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search events, stages, transactions"/>
      </label>
      <select aria-label="Filter by operation stage" value={filter} onChange={event=>setFilter(event.target.value)}>
        {stages.map(stage=><option value={stage} key={stage}>{stage==='all'?'All stages':stage}</option>)}
      </select>
      <NavLink to="/transactions" className="table-text-link">Transactions <ArrowUpRight size={15}/></NavLink>
    </div>
    {rows.length===0?<div className="data-empty">No matching activity</div>:
      <div className="operations-table">
        <div className="operations-table-head"><span>Time</span><span>Stage</span><span>Activity</span><span>Result</span></div>
        {rows.map(event=><details key={event.id} className="operation-entry">
          <summary>
            <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
            <span className="operation-stage">{event.stage}</span>
            <span className="operation-message">{event.message}</span>
            <StatusPill tone={event.status==='failure'?'danger':event.status==='success'?'success':'neutral'}>{event.status}</StatusPill>
          </summary>
          <div className="operation-evidence">
            <dl><dt>Event ID</dt><dd>{event.id}</dd><dt>Session</dt><dd>{event.sessionId??'—'}</dd>
            <dt>Timestamp</dt><dd>{event.timestamp}</dd></dl>
            {event.evidence&&<pre>{JSON.stringify(event.evidence,null,2)}</pre>}
          </div>
        </details>)}
      </div>}
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
          <span>{row.blockHeight==null?'Block —':`Block ${row.blockHeight}`}</span>
          <StatusPill>{String(row.status??'Under review')}</StatusPill>
        </summary>
        <div className="operation-evidence"><pre>{JSON.stringify(row,null,2)}</pre></div>
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
      <span>Reconciled financial results</span>
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
          <StatusPill tone="success">Verified inventory</StatusPill>
        </summary>
        <div className="operation-evidence"><pre>{JSON.stringify(row,null,2)}</pre></div>
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
          <small>{asset.transferableOutsideEnvironment===false?'Sandbox asset':'Transfer status unverified'}</small>
        </div><div className="asset-value"><strong>{asset.atomic??'—'}</strong><small>Atomic units</small></div>
      </article>)}</div>
    </>:<div className="compact-blank"><Wallet size={23}/><span>No assets available</span></div>}
    <div className="wallet-footer"><span>Deposit and withdrawal are unavailable until authorized custody is configured.</span></div>
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
    void load().then(ok=>{
      if(!active||!ok)return;
      if(kind==='live'){
        source=subscribe(environment,event=>{
          if(active)setData(current=>current?{
            ...current,events:mergeOperationEvents(environment,current.events,[event])
          }:current);
        },status=>{
          if(active&&status==='reconnecting')setError('STREAM_RECONNECTING');
          if(active&&status==='connected')setError(previous=>previous==='STREAM_RECONNECTING'?'':previous);
        });
        // Reconcile original persisted records even when the stream is quiet.
        poll=setInterval(()=>{if(active)void load()},30000);
      }
    });
    return()=>{active=false;source?.close();if(poll)clearInterval(poll)};
  },[environment,kind,retry]);
  const transactions=data?.state.transactions??[];
  const opportunities=data?.state.opportunities??[];
  let content:React.ReactNode;
  if(!data&&error)content=<ApiError error={error} onRetry={()=>setRetry(current=>current+1)}/>;
  else if(!data)content=<div className="page-loading" role="status">Loading</div>;
  else if(kind==='transactions')content=transactions.length?
    <TransactionWorkspace rows={transactions}/>:<Empty icon={Icon} title="No transactions yet"/>;
  else if(kind==='wallet')content=<WalletWorkspace state={data.state}/>;
  else if(kind==='performance'||kind==='analytics')content=data.state.accounting.reconciledAt?
    <PerformanceWorkspace accounting={data.state.accounting}/>:<Empty icon={Icon} title="No performance data"/>;
  else if(kind==='opportunities')content=opportunities.length?
    <OpportunityTable rows={opportunities}/>:<Empty icon={Icon} title="No opportunities yet"/>;
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

export function App(){const [environment,setEnvironment]=useState<Environment>('sandbox');return <EnvironmentContext.Provider value={{environment,setEnvironment}}><Shell><Routes><Route path="/" element={<Dashboard/>}/><Route path="/live" element={<OperationalPage kind="live"/>}/><Route path="/opportunities" element={<OperationalPage kind="opportunities"/>}/><Route path="/performance" element={<OperationalPage kind="performance"/>}/><Route path="/wallet" element={<OperationalPage kind="wallet"/>}/><Route path="/transactions" element={<OperationalPage kind="transactions"/>}/><Route path="/analytics" element={<Navigate to="/performance" replace/>}/><Route path="/settings" element={<OperationalPage kind="settings"/>}/></Routes></Shell></EnvironmentContext.Provider>}
