import type {DashboardState, Environment, EnvironmentReadiness, OperationEvent} from './types';

// The operator token is used only for initial login. The API uses a signed
// HttpOnly cookie afterwards; never persist a reusable bearer in browser storage.
export async function authenticate(token: string) {
  const response = await fetch('/api/auth/session', {
    method:'POST', headers:{Authorization:`Bearer ${token}`}, credentials:'include'});
  if (!response.ok) throw new Error((await response.json()).error ?? 'AUTH_FAILED');
}
export async function loadEnvironment(environment: Environment): Promise<{state:DashboardState;events:OperationEvent[];readiness:EnvironmentReadiness}> {
  const response = await fetch(`/api/environments/${environment}`, {credentials:'include'});
  if (!response.ok) throw new Error((await response.json()).error ?? 'LOAD_FAILED');
  return response.json();
}
export async function command(environment: Environment, action:string, settings?:DashboardState['settings']) {
  const response = await fetch(`/api/environments/${environment}/${action}`, {method:'POST',
    headers:{'content-type':'application/json'}, credentials:'include', body:JSON.stringify({settings})});
  const value = await response.json(); if (!response.ok) throw new Error(value.error ?? 'COMMAND_FAILED'); return value;
}
export type StreamConnection='connected'|'reconnecting';
export function subscribe(environment:Environment, onEvent:(event:OperationEvent)=>void,
 onConnection?:(status:StreamConnection)=>void) {
 const source = new EventSource(`/api/environments/${environment}/events`, {withCredentials:true});
 source.addEventListener('operation', (raw) => {
  try { onEvent(JSON.parse((raw as MessageEvent).data) as OperationEvent); }
  catch { onConnection?.('reconnecting'); }
 });
 source.addEventListener('open', () => onConnection?.('connected'));
 source.addEventListener('error', () => onConnection?.('reconnecting'));
 return source;
}
