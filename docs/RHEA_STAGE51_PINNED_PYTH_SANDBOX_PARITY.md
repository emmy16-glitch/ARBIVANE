# Stage 51 — source-pinned active-Pyth parity before real Rhea Sandbox replay

## Concrete blocker

Rhea mainnet uses **`execute_with_pyth`**. Earlier Rhea Sandbox code imported the Pyth oracle's Wasm/storage and checked its code hash, but **never verified that the imported oracle returned the same token prices as the pinned source block**. The borrower's price-dependent liquidation and `Borrow` permission callback could therefore run against mismatched data without producing a specific source-to-Sandbox price-parity failure.

Stage51 adds `attestStage51PythParity` to the actual Stage37 runner after state-clone comparisons, but **before** any temporary actor funding, token registration or `execute_with_pyth` call.

## Independent public-source-to-Sandbox checks

1. Re-read the real Rhea lender's `get_config` at the exact verified Stage35 block, require `enable_pyth_oracle=true`, `enable_price_oracle=false`, `pyth_oracle_account_id='aggregate-oracle.near'` and a bounded configured Pyth age.
2. Re-read lender `get_all_token_pyth_infos` at that block. Compare the actual imported lender view, including the selected borrow and collateral token pricing metadata, to the source in its entirety. A missing/mismatched source or clone fails closed.
3. For both selected token assets with live Pyth price identifiers, use the **same feed ID and validity-seconds argument** on the public pinned `aggregate-oracle.near.get_price_no_older_than` and local imported aggregate oracle. Reject any cross-block source read, missing/malformed quote, or different returned raw quote.
4. For the supported additional price-ratio methods `get_nearx_price`, `ft_price`, `get_st_near_price` and `get_high_precision_virtual_price`, compare each pinned public token-contract view with its *actual imported Sandbox token contract* view, refusing altered token ratios.
5. Permit only independently validated explicit default token prices. Cap inspected feeds and ratios, and write `stage51-active-pyth-sandbox-parity.json` only when every selected source view is reproduced locally. Include durable evidence in existing Stage37/40/42/44 Sandbox workflows.

Stage51 also rejects non-Sandbox execution flags and cannot sign, send or broadcast mainnet transactions.

## What this does **not** establish

The parity test verifies exposed Pyth views at one **historical finalized block**. It is **not** cryptographic trie proof, an independent guarantee the oracle remains fresh at later real execution time, exact deployed liquidation arithmetic parity, proof of funds, an executing trade, proceeds sold to the repayment token, or positive net P&L. It will reject reads whose imported quote has already become stale, rather than silently proceeding.

A passing CI suite verifies this gate's behavior with controlled fixtures. A genuine current Stage35 source-positive borrower and actual local `execute_with_pyth` callback/balance settlement evidence are still required before reporting a completed Rhea liquidation. Mainnet signing remains disabled.

CI: `npm run check`, workflow `.github/workflows/rhea-stage37-sandbox-execution.yml`. Do not substitute a small standalone test contract for Rhea liquidation evidence.
