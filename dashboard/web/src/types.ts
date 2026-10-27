export type Environment = 'sandbox' | 'testnet' | 'mainnet';
export type SessionStatus = 'starting' | 'running' | 'pause_requested' | 'paused' | 'stopping' | 'completed' | 'failed';
export interface OperationEvent {
  id: string; sequence: number; environment: Environment; timestamp: string;
  sessionId: string | null; stage: string; status: string; message: string;
  evidence: Record<string, unknown> | null; detail: unknown;
}
export interface DashboardState {
  environment: Environment; revision: number;
  session: null | {id:string; status:SessionStatus; createdAt:string; startedAt:string|null; endedAt:string|null; failure:unknown};
  settings: {maxFinancingUsd:string; minimumNetProfitUsd:string};
  accounting: Record<string, string | null | unknown>;
  wallet: {status:string; accountId:string|null; balances:unknown[]; verifiedAt:string|null};
  transactions: Array<Record<string, unknown>>; opportunities: Array<Record<string, unknown>>;
}
export interface EnvironmentReadiness {
  environment:Environment; status:string; chainId:string; blockHeight:number|null; checkedAt:string;
  capabilities:Record<string,boolean>; requirements:Record<string,unknown>; error?:string;
}
