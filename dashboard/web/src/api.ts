import type {DashboardState, Environment, EnvironmentReadiness, OperationEvent} from './types';

let authToken = sessionStorage.getItem('arbivane.token') ?? '';
let authenticated = false;
const headers = (): Record<string,string> => authToken ? {Authorization: `Bearer ${authToken}`} : {};

export async function authenticate(token = '') {
  authToken = token; if (token) sessionStorage.setItem('arbivane.token', token);
  const response = await fetch('/api/auth/session', {method:'POST', headers: headers(), credentials:'include'});
  if (!response.ok) throw new Error((await response.json()).error ?? 'AUTH_FAILED');
  authenticated = true;
}
export async function loadEnvironment(environment: Environment): Promise<{state:DashboardState;events:OperationEvent[];readiness:EnvironmentReadiness}> {
  if (!authenticated) await authenticate(authToken);
  const response = await fetch(`/api/environments/${environment}`, {headers:headers(), credentials:'include'});
  if (!response.ok) throw new Error((await response.json()).error ?? 'LOAD_FAILED');
  return response.json();
}
export async function command(environment: Environment, action:string, settings?:DashboardState['settings']) {
  const response = await fetch(`/api/environments/${environment}/${action}`, {method:'POST',
    headers:{'content-type':'application/json', ...headers()}, credentials:'include', body:JSON.stringify({settings})});
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
