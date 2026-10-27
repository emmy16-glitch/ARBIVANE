import type {Environment,OperationEvent} from './types';

// Keep the recent in-memory window stable during SSE replay, refresh and
// reconnect. Full original history stays in the server's append-only store.
export function mergeOperationEvents(
 environment:Environment,current:OperationEvent[],incoming:OperationEvent[],
 limit=500,
):OperationEvent[]{
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('INVALID_EVENT_WINDOW');
 const byId=new Map<string,OperationEvent>();
 for(const event of [...current,...incoming]){
  if(event?.environment!==environment||!Number.isSafeInteger(event.sequence)||
   event.sequence<1||typeof event.id!=='string'||!event.id.startsWith(environment+':'))
   continue;
  byId.set(event.id,event);
 }
 return [...byId.values()].sort((a,b)=>a.sequence-b.sequence).slice(-limit);
}
