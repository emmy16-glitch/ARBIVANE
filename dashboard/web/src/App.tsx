import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Navigate, NavLink, Route, Routes, useLocation, useSearchParams} from 'react-router-dom';
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
const hasFinancialEvidence=(state:DashboardState|null)=>{
  if(!state)return false;
  const a=state.accounting;
  return state.wallet.balances.length>0 ||
   [a.available,a.grossProceeds,a.financingFees,a.swapCosts,a.gasFees,a.cumulativeNetPnl,a.realizedProfit,a.realizedLoss]
    .some(v=>v!==null&&v!==undefined);
};

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
  const values=[
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

function ResearchActivity() {
  const runs=useResearchRuns(UI_PREVIEW);
  if(!runs.length)return null;
  return <section className="panel research-runs">
    <div className="panel-title"><span>Sandbox runs</span><a className="panel-link" href="https://github.com/emmy16-glitch/ARBIVANE/actions" target="_blank" rel="noreferrer">All runs <ArrowUpRight size={14}/></a></div>
    <div className="research-rows">{runs.map(run=>{
      const status=run.status==='completed'?(run.conclusion==='success'?'Checks passed':run.conclusion==='failure'?'Checks failed':'Completed'):run.status==='in_progress'?'Running':'Queued';
      const tone=run.status!=='completed'?'neutral':run.conclusion==='success'?'success':run.conclusion==='failure'?'danger':'neutral';
      return <a href={run.html_url} key={run.id} target="_blank" rel="noreferrer" className="research-row">
        <span className="research-run-title">{run.name}</span><StatusPill tone={tone}>{status}</StatusPill><ArrowUpRight size={15}/>
      </a>;
    })}</div>
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
      <Automation environment={environment} state={state} readiness={readiness[environment]} onCommand={run} busy={busy}/>
      {error&&<ApiError error={error} onRetry={()=>void refresh()}/>}
      <Operations events={events} onOpen={setDetail} connection={connection} active={isWorking}/>
      <ResearchActivity/>
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

function OperationalPage({kind}:{kind:ViewKind}) {
  const copy=viewCopy[kind],Icon=copy.icon; const [params]=useSearchParams();
  const {environment}=useEnvironment();
  const [data,setData]=useState<{state:DashboardState;events:OperationEvent[];readiness:EnvironmentReadiness}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;let source:EventSource|undefined;
    setData(null);
    void loadEnvironment(environment).then(value=>{
      if(!active)return;
      setData(value);setError('');
      if(kind==='live') source=subscribe(environment,event=>{
        if(active)setData(current=>current?{
          ...current,events:mergeOperationEvents(environment,current.events,[event])
        }:current);
      });
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'LOAD_FAILED')});
    return()=>{active=false;source?.close()};
  },[environment,kind]);
  const query=(params.get('query')??'').toLowerCase();
  const transactions=(data?.state.transactions??[]).filter(row=>!query||JSON.stringify(row).toLowerCase().includes(query));
  const opportunities=data?.state.opportunities??[];
  const readiness=data?.readiness;
  let content:React.ReactNode;
  if(error) content=<ApiError error={error} onRetry={()=>{setError('');void loadEnvironment(environment).then(setData).catch(reason=>setError(reason instanceof Error?reason.message:'LOAD_FAILED'))}}/>;
  else if(!data) content=<Empty icon={Icon} title="Loading"/>;
  else if(kind==='transactions') content=transactions.length?<div className="data-table" role="table"><div className="data-head" role="row"><span>Transaction</span><span>Borrower</span><span>Source block</span><span>Result</span></div>{transactions.map(row=><div className="data-row" role="row" key={String(row.id)}><code>{String(row.id)}</code><span>{String(row.borrowerAccountId)}</span><span>{String(row.sourceBlock)}</span><span><StatusPill tone="success">Verified · unsold</StatusPill></span></div>)}</div>:<Empty icon={Icon} title={query?'No matching transactions':'No transactions yet'}/>;
  else if(kind==='wallet') content=<div className="record-grid"><div><small>Wallet status</small><strong>{data.state.wallet.status.replaceAll('_',' ')}</strong></div><div><small>Account</small><strong>{data.state.wallet.accountId??'Not configured'}</strong></div><div className="wide"><small>Verified assets</small>{data.state.wallet.balances.length?<div className="compact-records">{data.state.wallet.balances.map((balance,index)=>{
    const asset=balance as {tokenId?:string;atomic?:string;transferableOutsideEnvironment?:boolean};
    return <article className="compact-record" key={index}><b>{asset.tokenId??'Unknown token'}</b><span>{asset.atomic??'—'} atomic units</span><small>{asset.transferableOutsideEnvironment===false?'Sandbox-only inventory':'Transferability not verified'}</small></article>;
  })}</div>:<strong>No balances</strong>}</div><div className="wide record-actions"><button disabled title="Deposit adapter not configured"><ArrowDown/>Deposit</button><button disabled title="No authorized custody or verified transferable balance"><ArrowUpRight/>Withdraw</button></div></div>;
  else if(kind==='performance'||kind==='analytics') content=data.state.accounting.reconciledAt?<div className="record-grid">{Object.entries(data.state.accounting).map(([key,value])=><div key={key}><small>{key.replaceAll(/([A-Z])/g,' $1')}</small><strong>{value==null?'Not verified':typeof value==='object'?'Evidence attached':String(value)}</strong></div>)}</div>:<Empty icon={Icon} title="No performance data"/>;
  else if(kind==='opportunities') content=opportunities.length?<div className="compact-records">{opportunities.map((row,index)=><article className="compact-record" key={String(row.id??index)}>
    <div className="compact-record-heading"><b>{String(row.borrowerAccountId??row.accountId??'Source observation')}</b><StatusPill>{String(row.status??'Under review')}</StatusPill></div>
    <span>Source block: {row.blockHeight==null?'Not verified':String(row.blockHeight)}</span>
    
    <details><summary>Source evidence</summary><pre>{JSON.stringify(row,null,2)}</pre></details>
  </article>)}</div>:<Empty icon={Icon} title="No opportunities yet"/>;
  else if(kind==='live') content=data.events.length?<div className="page-events">{data.events.slice().reverse().map(event=><div key={event.id}><time>{new Date(event.timestamp).toLocaleString()}</time><b>{event.stage}</b><span>{event.message}</span><StatusPill tone={event.status==='failure'?'danger':event.status==='success'?'success':'neutral'}>{event.status}</StatusPill></div>)}</div>:<Empty icon={Icon} title="No activity yet"/>;
  else content=<div className="record-grid"><div><small>Environment</small><strong>{environment}</strong></div><div><small>Network</small><strong>{readiness?.status==='unavailable'?'Offline':readiness?.status.replaceAll('_',' ')??'Offline'}</strong></div><div><small>Chain</small><strong>{readiness?.chainId??'Unavailable'}</strong></div><div><small>Last checked block</small><strong>{readiness?.blockHeight??'—'}</strong></div><div className="wide"><small>Available capabilities</small><div className="capability-list">{Object.entries(readiness?.capabilities??{}).map(([name,available])=><div key={name}><span>{name.replaceAll(/([A-Z])/g,' $1')}</span><StatusPill tone={available?'success':'neutral'}>{available?'Ready':'Not configured'}</StatusPill></div>)}</div></div><div className="wide"><small>Requirements</small><div className="capability-list">{Object.entries(readiness?.requirements??{}).map(([name,value])=><div key={name}><span>{name.replaceAll(/([A-Z])/g,' $1')}</span><span>{typeof value==='boolean'?(value?'Ready':'Missing'):String(value??'Not configured')}</span></div>)}</div></div></div>;
  return <div className="subpage operational-page"><section className="panel page-panel">{content}</section></div>;
}

export function App(){const [environment,setEnvironment]=useState<Environment>('sandbox');return <EnvironmentContext.Provider value={{environment,setEnvironment}}><Shell><Routes><Route path="/" element={<Dashboard/>}/><Route path="/live" element={<OperationalPage kind="live"/>}/><Route path="/opportunities" element={<OperationalPage kind="opportunities"/>}/><Route path="/performance" element={<OperationalPage kind="performance"/>}/><Route path="/wallet" element={<OperationalPage kind="wallet"/>}/><Route path="/transactions" element={<OperationalPage kind="transactions"/>}/><Route path="/analytics" element={<Navigate to="/performance" replace/>}/><Route path="/settings" element={<OperationalPage kind="settings"/>}/></Routes></Shell></EnvironmentContext.Provider>}
