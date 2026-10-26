.mode == "STAGE157_GENUINE_LARGER_LIQUIDATION_DISCOVERY"
and .mainnetExecutionEnabled == false
and .maySignMainnet == false
and .mayBroadcastMainnet == false
and .realizedEconomicProfitVerified == false
and (.reviewed | type == "number" and . >= 0 and . <= 12)
and .minimumRepayLendingInternalAtomic == "0"
and .arbitraryTransactionSizeFloorEnabled == false
