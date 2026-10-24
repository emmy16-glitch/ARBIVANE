# Stage 30 — bulk detailed borrower index

The deployed lending contract exports
`get_accounts_all_positions_paged({from_index, limit})`. A live ABI probe at
finalized block `221433256` returned complete SDK-shaped account position rows;
integer `from_index` and `limit` are required. Pages of 50 accounts were accepted
and remained below the tested RPC response bound.

`probe:rhea:paged-position-index` uses this view instead of making one
`get_account_all_positions` call for every registry entry. A 72,782-account
market therefore needs about 1,456 bulk calls rather than more than 72,000
detail calls. It provides:

- exact finalized-block and lending code-hash pins;
- configurable 1–50 account pages and bounded concurrency;
- bounded retries with `Retry-After` handling and request timeouts inherited
  from the read-only RPC adapter;
- batch-atomic commits, duplicate account rejection, and position schema checks;
- atomic on-disk checkpoints and same-block resume;
- configurable checkpoint cadence so large JSON serialization does not dominate
  network work;
- findings based on detailed isolated positions, never the incomplete legacy
  paged-account debt fields.

The index intentionally remains a same-block baseline. A future-block monitor
must refresh known debt accounts, scan appended registry entries, and rotate
through old pages; it must invalidate the cache if an account ID moves at a
previously observed index. Without action/event indexing, a cached old
debt-free account cannot be assumed debt-free forever.

Debt findings are not liquidation opportunities. Active Pyth repricing, current
eligibility, repayment/seizure sizing, liquidity, financing, swaps, competition,
Sandbox execution, and realized proceeds remain separate gates. The scanner has
no wallet, signer, or transaction method.
