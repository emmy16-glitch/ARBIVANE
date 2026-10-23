/** All financial values are fixed-point integers encoded as decimal strings. */
export type IntegerString = string;
export type Protocol = "rhea" | "morpho";
export type Network = "mainnet" | "testnet";

export interface TokenAmount {
  tokenId: string;
  atomicUnits: IntegerString;
  decimals: number;
}

/** One micro-USD = 10^-6 USD. No floating point financial arithmetic. */
export interface FinancialEstimate {
  proceedsUsdE6: IntegerString;
  repayUsdE6: IntegerString;
  networkFeesUsdE6: IntegerString;
  routeCostsUsdE6: IntegerString;
  financingCostsUsdE6: IntegerString;
  storageCostsUsdE6: IntegerString;
  raceRiskReserveUsdE6: IntegerString;
  inventoryRiskReserveUsdE6: IntegerString;
}

export interface MarketSnapshot {
  protocol: Protocol;
  network: Network;
  chainId: string;
  lendingContract: string;
  targetAccount: string;
  blockHeight: string;
  observedAtMs: number;
  oracleObservedAtMs: number | null;
  /** True only after protocol-equivalent mathematics were validated. */
  liquidationEligibilityVerified: boolean;
  source: "rpc" | "fixture";
}

export interface CompetitionEvidence {
  /** 0 means no observed pressure, NOT an assurance of no competitors. */
  pressureBps: number | null;
  confidenceBps: number;
  observations: string[];
}

export interface Candidate {
  id: string;
  snapshot: MarketSnapshot;
  repayUsdE6: IntegerString;
  estimate: FinancialEstimate;
  competition: CompetitionEvidence;
  expiresAtMs: number;
  /** Execution is only eligible once a specific call is validated and simulated. */
  exactCallVerified: boolean;
}

export interface RiskPolicy {
  enabled: boolean;
  network: Network;
  allowedProtocols: Protocol[];
  allowedLendingContracts: string[];
  maxSnapshotAgeMs: number;
  maxOracleAgeMs: number;
  maxRepayUsdE6: IntegerString;
  minNetProfitUsdE6: IntegerString;
  maxCompetitionPressureBps: number;
  minCompetitionConfidenceBps: number;
}

export interface ExecutionPrerequisites {
  liquidatorFundingVerified: boolean;
  policyActuallyControlsFunds: boolean;
  preflightPassed: boolean;
  idempotencyKeyUnused: boolean;
  rpcAtFinalBlock: boolean;
}

export interface RiskDecision {
  candidateId: string;
  allow: boolean;
  reasons: string[];
  computedNetUsdE6: IntegerString | null;
  evaluatedAtMs: number;
  mode: "DETECTION_ONLY" | "EXECUTION_ALLOWED";
}
