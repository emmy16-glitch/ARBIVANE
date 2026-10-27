import {useCallback, useEffect, useMemo, useState} from 'react';
import {NavLink, Route, Routes, useLocation, useNavigate, useSearchParams} from 'react-router-dom';
import {
  Pulse as Activity, ArrowDown, ArrowUpRight, Bell, ChartLineUp, CheckCircle, CirclesThree,
  ClockCounterClockwise, Cube, Flask, Gauge, Gear, Globe, House, ListMagnifyingGlass,
  MagnifyingGlass, Pause, Play, ShieldCheck, SlidersHorizontal, Stop, TrendUp, Wallet,
  WarningCircle, X,
} from '@phosphor-icons/react';
import {authenticate, command, loadEnvironment, subscribe} from './api';
import type {DashboardState, Environment, EnvironmentReadiness, OperationEvent} from './types';

const envInfo = {
  sandbox: {title:'Sandbox', description:'Isolated NEAR Workspaces', detail:'Local test assets only', icon:Flask},
  testnet: {title:'Testnet', description:'NEAR test network', detail:'Wallet not configured', icon:CirclesThree},
  mainnet: {title:'Mainnet', description:'Live read-only infrastructure', detail:'Spending disabled', icon:Globe},
} as const;
const nav = [
  ['/', 'Dashboard', House], ['/live', 'Live Ops', Activity], ['/opportunities', 'Opportunities', Cube],
  ['/performance', 'Performance', ChartLineUp], ['/wallet', 'Wallet', Wallet],
  ['/transactions', 'Transactions', ClockCounterClockwise], ['/analytics', 'Analytics', TrendUp],
  ['/settings', 'Settings', Gear],
] as const;

function Empty({icon:Icon = Activity, title, text}:{icon?:typeof Activity;title:string;text:string}) {
  return <div className="empty"><span className="empty-icon"><Icon size={19}/></span><strong>{title}</strong><p>{text}</p></div>;
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
  const location = useLocation(); const navigate=useNavigate(); const [search,setSearch]=useState('');
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><CirclesThree weight="fill" size={26}/></span><span><b>ARBIVANE</b><small>Autonomous Liquidation Terminal</small></span></div>
      <nav>{nav.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/' } className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="engine"><div className="engine-head"><span>Engine status</span><StatusPill>Standby</StatusPill></div>{['Scanner','Risk analysis','Execution','Reconciliation'].map(x=><div className="engine-line" key={x}><i/>{x}</div>)}</div>
      <div className="version"><span className="brand-mark mini"><CirclesThree weight="fill" size={18}/></span><span><b>ARBIVANE v0.1</b><small>Source-verified Rhea engine</small></span></div>
    </aside>
    <header className="topbar">
      <form className="search" onSubmit={event=>{event.preventDefault();if(search.trim())navigate(`/transactions?query=${encodeURIComponent(search.trim())}`)}}><MagnifyingGlass/><input aria-label="Search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search borrowers, transactions, markets…"/><kbd>/</kbd></form>
      <div className="top-status"><StatusPill>API connected</StatusPill><StatusPill tone="violet">Mainnet locked</StatusPill><button className="icon-button" aria-label="Notifications" onClick={()=>alert('No unread persisted alerts.')}><Bell/></button><div className="avatar">A</div><div className="account"><b>Operator</b><span>Authenticated session</span></div></div>
    </header>
    <main className="main" data-route={location.pathname}>{children}</main>
    <nav className="mobile-nav">{nav.slice(0,5).map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/' }><Icon/><span>{label}</span></NavLink>)}</nav>
  </div>;
}

function EnvironmentPicker({value,onChange,readiness}:{value:Environment;onChange:(e:Environment)=>void;readiness:Partial<Record<Environment,EnvironmentReadiness>>}) {
  return <div className="environment-picker">{(Object.keys(envInfo) as Environment[]).map((key)=>{const info=envInfo[key];const Icon=info.icon;const live=readiness[key];return <button key={key} className={`environment ${value===key?'selected':''} ${key}`} onClick={()=>onChange(key)}><span className="env-icon"><Icon size={25}/></span><span><b>{info.title}</b><small>{info.description}</small><em className={live?.status==='unavailable'?'unavailable':''}>{live?(live.status==='connected'?`RPC connected · block ${live.blockHeight}`:live.status.replaceAll('_',' ')):info.detail}</em></span>{value===key&&<CheckCircle className="selected-check" weight="fill"/>}</button>})}</div>;
}

function Automation({environment,state,readiness,onCommand,busy}:{environment:Environment;state:DashboardState|null;readiness?:EnvironmentReadiness;onCommand:(a:string,s?:DashboardState['settings'])=>void;busy:string|null}) {
  const [amount,setAmount]=useState(state?.settings.maxFinancingUsd??'1000.00');
  const [minimum,setMinimum]=useState(state?.settings.minimumNetProfitUsd??'1.00');
  useEffect(()=>{if(state){setAmount(state.settings.maxFinancingUsd);setMinimum(state.settings.minimumNetProfitUsd)}},[environment,state?.environment]);
  const status=state?.session?.status??'idle'; const running=['starting','running','pause_requested','stopping'].includes(status);
  return <section className="panel automation"><div className="panel-title"><span><Gear/>Automation Control</span><StatusPill tone={environment==='mainnet'?'danger':'neutral'}>{environment==='mainnet'?'Execution locked':status}</StatusPill></div>
    <div className="automation-body"><label className="money-label"><span>Maximum financing per liquidation <small>Verified source repayment cannot exceed this cap</small></span><div className="money-input"><span>$ USD</span><input value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)} aria-label="Maximum financing per liquidation"/></div></label>
      <div className="options"><b>Execution options</b><label><input type="checkbox" checked readOnly/> Reject below minimum net profit</label><div className="minimum"><span>Minimum net profit target</span><input value={minimum} inputMode="decimal" onChange={e=>setMinimum(e.target.value)}/><em>USD</em></div><p className="screening-note">Sandbox uses the source gross as a necessary screen; realized net profit remains unverified.</p><label className="locked"><input type="checkbox" checked readOnly/> Reconcile receipts before crediting</label></div></div>
    <div className="controls"><button className="primary" disabled={running||busy!==null||readiness?.capabilities?.automate!==true} onClick={()=>onCommand(status==='paused'?'resume':'start',{maxFinancingUsd:amount,minimumNetProfitUsd:minimum})}><Play weight="fill"/>{status==='paused'?'Resume':'Start Automation'}</button><button disabled={!['running','starting'].includes(status)||busy!==null} onClick={()=>onCommand('pause')}><Pause weight="fill"/>Pause</button><button className="stop" disabled={!running||busy!==null} onClick={()=>onCommand('stop')}><Stop weight="fill"/>Stop</button></div>
    <div className="readiness"><i className={environment==='mainnet'||readiness?.status==='unavailable'?'warning':''}/>{busy?`${busy}…`:readiness?.status==='connected'?`${readiness.chainId} RPC verified at block ${readiness.blockHeight}; execution adapter unavailable`:environment==='sandbox'&&readiness?.status==='ready'?'Sandbox evidence, RPC, and Workspaces runtime configured':environment==='sandbox'?'Sandbox runner not configured':environment==='testnet'?'Testnet wallet and execution adapter not configured':'Mainnet signing and spending are disabled server-side'}</div>
  </section>;
}

function Operations({events,onOpen,active}:{events:OperationEvent[];onOpen:(e:OperationEvent)=>void;active:boolean}) {
  const [filter,setFilter]=useState('all'); const filtered=filter==='all'?events:events.filter(e=>e.stage===filter);
  const stages=['all',...new Set(events.map(e=>e.stage))];
  return <section className="panel operations"><div className="panel-title"><span><Activity/>Live Operations Stream</span><StatusPill tone={events.length?'success':'neutral'}>{active?'Session active':'History'}</StatusPill></div>
    {events.length>0&&<div className="filters">{stages.map(stage=><button className={filter===stage?'active':''} onClick={()=>setFilter(stage)} key={stage}>{stage}<small>{stage==='all'?events.length:events.filter(e=>e.stage===stage).length}</small></button>)}</div>}
    {filtered.length===0?<Empty title="No active session" text="Start automation to monitor genuine backend operations."/>:<div className="event-list" role="log">{filtered.slice().reverse().map(event=><button className="event-row" key={event.id} onClick={()=>onOpen(event)}><time>{new Date(event.timestamp).toLocaleTimeString([], {hour12:false})}</time><span className={`event-dot ${event.status}`}/><b>{event.stage}</b><span className="event-message">{event.message}</span><StatusPill tone={event.status==='failure'?'danger':event.status==='success'?'success':'neutral'}>{event.status}</StatusPill><ArrowUpRight/></button>)}</div>}
  </section>;
}

function Accounting({state}:{state:DashboardState|null}) {
  const a=state?.accounting; const asset=state?.wallet.balances?.[0] as {atomic?:string;tokenId?:string}|undefined;
  const fields=[['Gross proceeds','grossProceeds'],['Financing fees','financingFees'],['Swap costs','swapCosts'],['Gas fees','gasFees'],['Realized P&L','cumulativeNetPnl']] as const;
  return <><section className="panel balance"><div className="panel-title"><span>ARBIVANE Balance</span><span className="network-label">{state?.environment??'—'}</span></div><div className="balance-main"><span className="balance-icon"><Flask/></span><div><small>{asset?'Verified unsold inventory':'Verified available'}</small><strong>{asset?.atomic??(a?.available==null?'—':`$${a.available}`)}</strong><p>{asset?`atomic ${asset.tokenId}`:state?.wallet.status==='not_configured'?'Wallet not configured':'Reconciled balance'}</p></div><div className="balance-actions"><button disabled title="Deposit is unavailable until an environment-specific custody adapter is configured"><ArrowDown/>Deposit</button><button className="primary" disabled title="Withdrawal is unavailable without authorized custody and verified transferable funds"><ArrowUpRight/>Withdraw</button></div></div><div className="metrics">{fields.map(([label,key])=><div key={key}><small>{label}</small><b>{a?.[key]==null?'—':`$${a[key]}`}</b></div>)}</div></section>
    <section className="panel chart"><div className="panel-title"><span>Cumulative P&amp;L</span><span className="network-label">Verified settlements only</span></div><Empty icon={ChartLineUp} title="No reconciled P&L yet" text="The chart appears after settled proceeds and every cost are independently verified."/></section></>;
}

function Recent({state}:{state:DashboardState|null}) {const tx=state?.transactions??[];return <section className="panel recent"><div className="panel-title"><span>Recent Operations</span><NavLink to="/transactions">View all <ArrowUpRight/></NavLink></div>{tx.length?<div className="transaction-list">{tx.slice(0,5).map((row)=><div className="transaction-row" key={String(row.id)}><span className="tx-icon"><CheckCircle weight="fill"/></span><span><b>{String(row.type)}</b><small>{String(row.borrowerAccountId)}</small></span><span><b>{String(row.assetIncreaseAtomic)} atomic</b><small>{String(row.seizeTokenId)}</small></span><span><StatusPill tone="success">Verified</StatusPill><small>Unsold inventory</small></span></div>)}</div>:<Empty icon={ClockCounterClockwise} title="No verified transactions" text="Only reconciled environment-specific receipts will appear here."/>}</section>}

function Dashboard() {
  const [environment,setEnvironment]=useState<Environment>('sandbox'); const [state,setState]=useState<DashboardState|null>(null);
  const [readiness,setReadiness]=useState<Partial<Record<Environment,EnvironmentReadiness>>>({});
  const [events,setEvents]=useState<OperationEvent[]>([]); const [error,setError]=useState(''); const [busy,setBusy]=useState<string|null>(null); const [detail,setDetail]=useState<OperationEvent|null>(null);
  const refresh=useCallback(async()=>{try{const data=await loadEnvironment(environment);setState(data.state);setEvents(data.events);setReadiness(old=>({...old,[environment]:data.readiness}));setError('')}catch(e){setError(e instanceof Error?e.message:'LOAD_FAILED')}},[environment]);
  useEffect(()=>{let source:EventSource|undefined;let active=true;void refresh().then(()=>{if(active)source=subscribe(environment,event=>{setEvents(old=>old.some(x=>x.id===event.id)?old:[...old,event]);void refresh()})});return()=>{active=false;source?.close()}},[environment,refresh]);
  const run=async(action:string,settings?:DashboardState['settings'])=>{setBusy(action);setError('');try{await command(environment,action,settings);await refresh()}catch(e){setError(e instanceof Error?e.message:'COMMAND_FAILED')}finally{setBusy(null)}};
  return <div className="dashboard"><EnvironmentPicker value={environment} onChange={setEnvironment} readiness={readiness}/><div className="left-column"><Automation environment={environment} state={state} readiness={readiness[environment]} onCommand={run} busy={busy}/>{error&&<ApiError error={error} onRetry={()=>void refresh()}/>}<Operations events={events} onOpen={setDetail} active={Boolean(state?.session&&['running','starting','pause_requested','stopping'].includes(state.session.status))}/></div><div className="right-column"><Accounting state={state}/><Recent state={state}/></div>{detail&&<div className="drawer-backdrop" onClick={()=>setDetail(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="drawer-close" onClick={()=>setDetail(null)}><X/></button><small>EVENT {detail.id}</small><h2>{detail.stage}</h2><StatusPill tone={detail.status==='failure'?'danger':'neutral'}>{detail.status}</StatusPill><p>{detail.message}</p><dl><dt>Timestamp</dt><dd>{detail.timestamp}</dd><dt>Session</dt><dd>{detail.sessionId??'None'}</dd></dl><h3>Technical evidence</h3><pre>{detail.evidence?JSON.stringify(detail.evidence,null,2):'No additional evidence attached.'}</pre></aside></div>}</div>;
}

function Page({title,description,icon:Icon}:{title:string;description:string;icon:typeof Gauge}) {
  return <div className="subpage"><div className="page-heading"><span><Icon/></span><div><small>ARBIVANE OPERATIONS</small><h1>{title}</h1><p>{description}</p></div></div><section className="panel"><Empty icon={Icon} title={`${title} has no verified records`} text="This view populates from environment-scoped backend evidence. No sample data is shown."/></section></div>;
}

type ViewKind='live'|'opportunities'|'performance'|'wallet'|'transactions'|'analytics'|'settings';
const viewCopy:Record<ViewKind,{title:string;description:string;icon:typeof Gauge}>={
  live:{title:'Live operations',description:'Persistent scanning, execution, and settlement events.',icon:Activity},
  opportunities:{title:'Opportunities',description:'Source-verified candidates and rejection evidence.',icon:Cube},
  performance:{title:'Performance',description:'Reconciled proceeds, costs, and realized results.',icon:ChartLineUp},
  wallet:{title:'Wallet',description:'Environment-specific balances and custody controls.',icon:Wallet},
  transactions:{title:'Transactions',description:'Original receipt identifiers and settlement evidence.',icon:ClockCounterClockwise},
  analytics:{title:'Analytics',description:'Verified operational and financial trends.',icon:ListMagnifyingGlass},
  settings:{title:'Settings',description:'Security, RPC, wallets, and automation configuration.',icon:SlidersHorizontal},
};

function OperationalPage({kind}:{kind:ViewKind}) {
  const copy=viewCopy[kind],Icon=copy.icon; const [params]=useSearchParams();
  const [environment,setEnvironment]=useState<Environment>('sandbox');
  const [data,setData]=useState<{state:DashboardState;events:OperationEvent[];readiness:EnvironmentReadiness}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;setData(null);void loadEnvironment(environment).then(value=>{if(active){setData(value);setError('')}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'LOAD_FAILED')});return()=>{active=false}},[environment]);
  const query=(params.get('query')??'').toLowerCase();
  const transactions=(data?.state.transactions??[]).filter(row=>!query||JSON.stringify(row).toLowerCase().includes(query));
  const opportunities=data?.state.opportunities??[];
  const readiness=data?.readiness;
  let content:React.ReactNode;
  if(error) content=<ApiError error={error} onRetry={()=>{setError('');void loadEnvironment(environment).then(setData).catch(reason=>setError(reason instanceof Error?reason.message:'LOAD_FAILED'))}}/>;
  else if(!data) content=<Empty icon={Icon} title="Loading verified records" text="Reading the selected environment's persisted backend state."/>;
  else if(kind==='transactions') content=transactions.length?<div className="data-table" role="table"><div className="data-head" role="row"><span>Transaction</span><span>Borrower</span><span>Source block</span><span>Result</span></div>{transactions.map(row=><div className="data-row" role="row" key={String(row.id)}><code>{String(row.id)}</code><span>{String(row.borrowerAccountId)}</span><span>{String(row.sourceBlock)}</span><span><StatusPill tone="success">Verified · unsold</StatusPill></span></div>)}</div>:<Empty icon={Icon} title={query?'No matching verified transaction':'No verified transactions'} text="Original receipt-backed Sandbox transactions appear here after reconciliation."/>;
  else if(kind==='wallet') content=<div className="record-grid"><div><small>Connection</small><strong>{data.state.wallet.status.replaceAll('_',' ')}</strong></div><div><small>Account</small><strong>{data.state.wallet.accountId??'Not configured'}</strong></div><div className="wide"><small>Verified balances</small>{data.state.wallet.balances.length?data.state.wallet.balances.map((balance,index)=><code key={index}>{JSON.stringify(balance)}</code>):<strong>None</strong>}</div><div className="wide record-actions"><button disabled title="Deposit adapter not configured"><ArrowDown/>Deposit</button><button disabled title="No authorized custody or verified transferable balance"><ArrowUpRight/>Withdraw</button></div></div>;
  else if(kind==='performance'||kind==='analytics') content=data.state.accounting.reconciledAt?<div className="record-grid">{Object.entries(data.state.accounting).map(([key,value])=><div key={key}><small>{key.replaceAll(/([A-Z])/g,' $1')}</small><strong>{value==null?'Not verified':typeof value==='object'?'Evidence attached':String(value)}</strong></div>)}</div>:<Empty icon={Icon} title="No realized performance" text="Unsold collateral and missing same-denomination costs cannot populate financial charts."/>;
  else if(kind==='opportunities') content=opportunities.length?<pre className="record-json">{JSON.stringify(opportunities,null,2)}</pre>:<Empty icon={Icon} title="No current eligible opportunities" text="Rejected or incomplete candidates remain in the Live Operations evidence stream."/>;
  else if(kind==='live') content=data.events.length?<div className="page-events">{data.events.slice().reverse().map(event=><div key={event.id}><time>{new Date(event.timestamp).toLocaleString()}</time><b>{event.stage}</b><span>{event.message}</span><StatusPill tone={event.status==='failure'?'danger':event.status==='success'?'success':'neutral'}>{event.status}</StatusPill></div>)}</div>:<Empty icon={Icon} title="No active session" text="Start automation from Dashboard to persist and stream genuine operations."/>;
  else content=<div className="record-grid"><div><small>Environment</small><strong>{environment}</strong></div><div><small>Readiness</small><strong>{readiness?.status.replaceAll('_',' ')??'Unavailable'}</strong></div><div><small>Chain</small><strong>{readiness?.chainId??'Unavailable'}</strong></div><div><small>Observed block</small><strong>{readiness?.blockHeight??'Unavailable'}</strong></div><div className="wide"><small>Capabilities</small><code>{JSON.stringify(readiness?.capabilities??{})}</code></div><div className="wide"><small>Missing requirements</small><code>{JSON.stringify(readiness?.requirements??{})}</code></div></div>;
  return <div className="subpage operational-page"><div className="page-heading"><span><Icon/></span><div><small>ARBIVANE OPERATIONS</small><h1>{copy.title}</h1><p>{copy.description}</p></div></div><EnvironmentPicker value={environment} onChange={setEnvironment} readiness={readiness?{[environment]:readiness}:{}}/><section className="panel page-panel"><div className="panel-title"><span>{copy.title}</span><span className="network-label">{environment}</span></div>{content}</section></div>;
}

export function App(){return <Shell><Routes><Route path="/" element={<Dashboard/>}/><Route path="/live" element={<OperationalPage kind="live"/>}/><Route path="/opportunities" element={<OperationalPage kind="opportunities"/>}/><Route path="/performance" element={<OperationalPage kind="performance"/>}/><Route path="/wallet" element={<OperationalPage kind="wallet"/>}/><Route path="/transactions" element={<OperationalPage kind="transactions"/>}/><Route path="/analytics" element={<OperationalPage kind="analytics"/>}/><Route path="/settings" element={<OperationalPage kind="settings"/>}/></Routes></Shell>}
