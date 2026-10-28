import type {DashboardState,EnvironmentReadiness,OperationEvent} from './types';
// @ts-expect-error This existing pure-JS scenario module is intentionally shared
// between the protected server harness and this isolated, browser-only Demo.
import {DemoAutomation,demoReadiness} from '../../server/demo.mjs';

/** Each browser tab owns its own private demonstration. No auth, RPC, wallet
 * access, or server-side state is used. Keeping it in sessionStorage preserves
 * the live stream across route changes and refresh without mixing visitors.
 */
const KEY='arbivane-demo-v2';
type DemoState=DashboardState & {nextEventSequence:number;session:DashboardState['session']&{
 demo?:boolean;demoCheckpoint?:{cycle:number;phase:number}
}};
type DemoSnapshot={state:DemoState;events:OperationEvent[]};
type StorageShape=Pick<Storage,'getItem'|'setItem'>;
const MONEY=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/;
function blank():DemoSnapshot{
 return {state:{
  environment:'demo',revision:0,nextEventSequence:1,session:null,
  settings:{maxFinancingUsd:'1000.00',minimumNetProfitUsd:'0.00'},
  accounting:{currency:'USD',available:null,pending:null,grossProceeds:null,
   financingFees:null,gasFees:null,swapCosts:null,realizedProfit:null,
   realizedLoss:null,cumulativeNetPnl:null,reconciledAt:null,evidence:null},
  wallet:{status:'not_configured',accountId:null,balances:[],verifiedAt:null},
  opportunities:[],transactions:[],
 },events:[]};
}
class BrowserDemoStore{
 private record:DemoSnapshot;
 private writeQueue:Promise<unknown>=Promise.resolve();
 private storage:StorageShape|null;
 constructor(storage:StorageShape|null){
  this.storage=storage;
  let raw:string|null=null;
  try{raw=storage?.getItem(KEY)??null}catch{}
  try{
   const previous=raw?JSON.parse(raw) as DemoSnapshot:null;
   if(previous?.state?.environment==='demo'&&
    Array.isArray(previous.events)&&Array.isArray(previous.state.transactions)&&
    Array.isArray(previous.state.opportunities)&&
    Number.isSafeInteger(previous.state.nextEventSequence)&&
    previous.state.nextEventSequence>0){
    this.record=previous;return;
   }
  }catch{}
  this.record=blank();
 }
 private persist(){
  try{this.storage?.setItem(KEY,JSON.stringify(this.record))}catch{
   // Storage disabled/private browsing: keep running safely in memory.
  }
 }
 async state(environment:string){
  if(environment!=='demo')throw Error('DEMO_ENVIRONMENT_ONLY');
  return structuredClone(this.record.state);
 }
 async update(environment:string,change:(state:DemoState)=>DemoState|Promise<DemoState>){
  if(environment!=='demo')throw Error('DEMO_ENVIRONMENT_ONLY');
  const next=this.writeQueue.then(async()=>{
   const updated=await change(structuredClone(this.record.state));
   this.record.state={...updated,revision:updated.revision+1};
   this.persist();return structuredClone(this.record.state);
  });
  this.writeQueue=next.catch(()=>{});return next;
 }
 async event(environment:string,input:{
  stage:string;status:string;message:string;evidence?:Record<string,unknown>;detail?:unknown
 }){
  if(environment!=='demo')throw Error('DEMO_ENVIRONMENT_ONLY');
  const next=this.writeQueue.then(async()=>{
   const seq=this.record.state.nextEventSequence++;
   const event:OperationEvent={id:'demo:'+seq,sequence:seq,environment:'demo',
    timestamp:new Date().toISOString(),sessionId:this.record.state.session?.id??null,
    stage:input.stage,status:input.status,message:input.message,
    evidence:input.evidence??null,detail:input.detail??null};
   this.record.events.push(event);
   if(this.record.events.length>500)this.record.events=this.record.events.slice(-500);
   this.record.state.revision++;
   this.persist();return event;
  });
  this.writeQueue=next.catch(()=>{});return next;
 }
 async events(environment:string){
  if(environment!=='demo')throw Error('DEMO_ENVIRONMENT_ONLY');
  await this.writeQueue;
  return structuredClone(this.record.events);
 }
 newSession(environment:string,settings:DashboardState['settings']){
  if(environment!=='demo')throw Error('DEMO_ENVIRONMENT_ONLY');
  return {id:crypto.randomUUID(),environment:'demo' as const,status:'starting',
   createdAt:new Date().toISOString(),startedAt:null,endedAt:null,
   stopRequested:false,pauseRequested:false,settings,pid:null,failure:null};
 }
}
export function createBrowserDemo(storage:StorageShape|null,
 options:{intervalMs?:number;maxCycles?:number}={}){
 const store=new BrowserDemoStore(storage);
 const listeners=new Set<(event:OperationEvent)=>void>();
 const connections=new Set<(status:'connected')=>void>();
 const automation=new DemoAutomation({store,intervalMs:options.intervalMs??1000,
  maxCycles:options.maxCycles??4,publish:(e:OperationEvent)=>{
  for(const listener of listeners){try{listener(e)}catch{}}
 }});
 let boot:Promise<void>|null=null;
 const ensure=()=>boot??=(async()=>{await automation.recover()})();
 const readiness=demoReadiness() as EnvironmentReadiness;
 return {
  async load(){
   await ensure();
   return {state:await store.state('demo') as DashboardState,
    events:await store.events('demo'),readiness};
  },
  async command(action:string,settings?:DashboardState['settings']){
   await ensure();
   if(!['start','pause','resume','stop'].includes(action))
    throw Error('INVALID_DEMO_COMMAND');
   if(action==='start'){
    if(!settings||!MONEY.test(settings.maxFinancingUsd)||
     Number(settings.maxFinancingUsd)<=0||
     !MONEY.test(settings.minimumNetProfitUsd))
     throw Error('INVALID_DEMO_SETTINGS');
    const session=await automation.start({
     maxFinancingUsd:Number(settings.maxFinancingUsd).toFixed(2),
     minimumNetProfitUsd:Number(settings.minimumNetProfitUsd).toFixed(2)});
    return {session};
   }
   return {session:await automation[action]()};
  },
  subscribe(onEvent:(event:OperationEvent)=>void,onConnection?:(status:'connected')=>void){
   listeners.add(onEvent);
   if(onConnection){connections.add(onConnection);queueMicrotask(()=>{if(connections.has(onConnection))onConnection('connected')})}
   void ensure();
   return {close:()=>{listeners.delete(onEvent);if(onConnection)connections.delete(onConnection)}};
  },
 };
}
let instance:ReturnType<typeof createBrowserDemo>|null=null;
export function browserDemo(){
 if(!instance){
  let storage:StorageShape|null=null;
  try{if(typeof sessionStorage!=='undefined')storage=sessionStorage}catch{}
  instance=createBrowserDemo(storage);
 }
 return instance;
}

