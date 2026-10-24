# Stage 7: borrower positions, missing-price exposure, offline reference comparisons

**Mode: READ ONLY. Trading, signing, liquidation and treasury transfers are disabled.**

## Research basis

The original Burrow liquidation bot scans `get_accounts_paged` and expects each
account to expose `account_id`, `borrowed`, `collateral` and `supplied` share maps.
Rhea's current Go SDK still provides `GetAccountTyped` and `GetAccountAllPositionsTyped`,
but current deployment equivalence must be tested rather than assumed.

- Source: https://github.com/burrowHQ/burrowland-liquidation-bot/blob/main/src/libs/burrow.js
- Source: https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/account.go
- Source: https://guide.rhea.finance/near-chain-guides/lending-and-borrowing/borrowing

## What the borrower diagnostic does

1. Calls Stage 6 market coverage verification and pins the finalized block and
   observed lending/oracle code hashes.
2. Reads `get_num_accounts` on that **same block**.
3. Reads bounded pages of `get_accounts_paged({from_index, limit})` on that block.
4. Validates each account ID and strictly parses the position share maps.
   Rejects duplicates, unknown assets, bad numbers, incomplete pages and block
   mismatches instead of silently assuming zero exposure.
5. Outputs *counts and shares*, never implied USD prices or profitability.
6. Flags any missing-metadata assets encountered as debt or collateral; the
   unresolved Stage 5 list contains `meta-token.near`, `shadow_ref_v1-4179`,
   `token.burrow.near`, and `usn` at its observed block. These values must be
   checked afresh on subsequent blocks.

Sample limitations: FIRST_N_INDEX_ORDER only, default 25 borrowers and maximum
200. An observation of zero USN borrower positions in a sample **does not**
mean there are none in the rest of the protocol. Pool-level debt balances are
not borrower-level identities and cannot establish liquidation eligibility.

## Local repeatable test suite

`npm run check` tests positive and adversarial cases including missing price
metadata, unknown token IDs, duplicate borrowers, bad amounts, truncated pages,
RPC block mismatch and inconsistent contract-hash reference fixtures.

The `src/rhea/reference-suite.ts` compare-only module accepts an explicit
reference for each account in a **legacy-format synthetic market snapshot**.
It compares adjusted collateral, adjusted debt and health factor computed by
the Stage 2 off-chain math. It refuses inconsistent block IDs, duplicate
references, unpinned deployed-contract references and missing accounts. A
matching reference NEVER establishes current on-chain contract parity. The
current mainnet aggregate oracle uses a different price interface, and some
assets need token-specific ratios or other valuation paths.

## Still blocked before any money moves

- Pin and independently audit the exact deployed lending code and full asset set.
- Identify the real valuation logic for USN and every missing metadata asset,
  including disabled pools with legacy positions.
- Acquire trustworthy same-block contract-derived financial reference values,
  rather than self-generated expected test data; prove rounding and liquidation
  invariants against audited deployed source.
- Verify liquidator financing, collateral disposition, NEAR asynchronous
  call outcomes, contract custody enforcement and transaction finality.

The scheduled GitHub Action is an **advisory** read-only experiment. A green
workflow is not evidence of profitable or safe transactions. Inspect its
`rhea-borrower-evidence.json` artifact and status explicitly.
