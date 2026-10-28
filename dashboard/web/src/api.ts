import type {DashboardState, Environment, EnvironmentReadiness, OperationEvent} from './types';

// Deliberately isolated Vercel UI-review build. No fake on-chain data,
// backend commands, signing, or financial results are available.
export const UI_PREVIEW = import.meta.env.VITE_ARBIVANE_PREVIEW === 'true';
function previewResponse(environment:Environment):{
 state:DashboardState; events:OperationEvent[]; readiness:EnvironmentReadiness
} {
 return {
  state:{
   environment,revision:0,session:null,
   settings:{maxFinancingUsd:'',minimumNetProfitUsd:'0.00'},
   accounting:{
    currency:'USD',available:null,pending:null,grossProceeds:null,
    financingFees:null,gasFees:null,swapCosts:null,realizedProfit:null,
    realizedLoss:null,cumulativeNetPnl:null,reconciledAt:null,evidence:null
   },
   wallet:{status:'not_configured',accountId:null,balances:[],verifiedAt:null},
   transactions:[],opportunities:[]
  },
  events:[],
  readiness:{
   environment,status:'unavailable',chainId:environment==='demo'?'SIMULATION':
    environment==='testnet'?'NEAR_TESTNET':'NEAR_MAINNET',
   blockHeight:null,checkedAt:'',capabilities:{automate:false,deposit:false,withdraw:false},
   requirements:{backend:'Not connected in view-only preview'}
  }
 };
}

// The operator token is used only for initial login. The API uses a signed
// HttpOnly cookie afterwards; never persist a reusable bearer in browser storage.
export async function authenticate(token: string) {
  const response = await fetch('/api/auth/session', {
    method:'POST', headers:{Authorization:`Bearer ${token}`}, credentials:'include'});
  if (!response.ok) throw new Error((await response.json()).error ?? 'AUTH_FAILED');
}
export async function loadEnvironment(environment: Environment): Promise<{state:DashboardState;events:OperationEvent[];readiness:EnvironmentReadiness}> {
  if (UI_PREVIEW) return previewResponse(environment);
  const response = await fetch(`/api/environments/${environment}`, {credentials:'include'});
  if (!response.ok) throw new Error((await response.json()).error ?? 'LOAD_FAILED');
  return response.json();
}
export async function command(environment: Environment, action:string, settings?:DashboardState['settings']) {
  if (UI_PREVIEW) throw new Error('VIEW_ONLY_PREVIEW_NO_EXECUTION');
  const response = await fetch(`/api/environments/${environment}/${action}`, {method:'POST',
    headers:{'content-type':'application/json'}, credentials:'include', body:JSON.stringify({settings})});
  const value = await response.json(); if (!response.ok) throw new Error(value.error ?? 'COMMAND_FAILED'); return value;
}
export type StreamConnection='connected'|'reconnecting';
export function subscribe(environment:Environment, onEvent:(event:OperationEvent)=>void,
 onConnection?:(status:StreamConnection)=>void) {
 if (UI_PREVIEW) return {close:()=>{}} as EventSource;
 const source = new EventSource(`/api/environments/${environment}/events`, {withCredentials:true});
 source.addEventListener('operation', (raw) => {
  try { onEvent(JSON.parse((raw as MessageEvent).data) as OperationEvent); }
  catch { onConnection?.('reconnecting'); }
 });
 source.addEventListener('open', () => onConnection?.('connected'));
 source.addEventListener('error', () => onConnection?.('reconnecting'));
 return source;
}
