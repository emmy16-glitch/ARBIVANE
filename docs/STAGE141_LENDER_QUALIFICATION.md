# Stage141 — deployed NEAR lender qualification

**26 October 2026.** Implementation is **read-only research and evidence validation**, not a financing adapter or live flash loan. ARBIVANE owner has no initial capital. The previously proven Stage93 local Rhea liquidation deposited 1 NEAR of disposable Sandbox wrapped-NEAR collateral to get ordinary Rhea borrowing capacity; that is not a loan free of collateral.

## Authenticated LIVE six-contract inspection — 26 October 2026

**Original GitHub Actions run:** [40334510592](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40334510592). Both isolated unit tests and `authenticated_six_contract_mainnet_readonly_survey` **succeeded**. The resulting artifact [12655597651](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40334510592/artifacts/12655597651), `stage141-native-loan-qualification.json`, was downloaded and independently inspected; the table is transcribed from those actual provider responses, **not simulated test data**.

| Authenticated account | Finalized block | Verified deployed Wasm SHA256 as NEAR base58 code hash | Recognized flash exports |
| --- | ---: | --- | --- |
| `contract.main.burrow.near` | 221697242 | `6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa` | **None** |
| `v2.ref-finance.near` | 221697260 | `25eNFdfK76NUEZn4cDgq1xQYKjxKCuzgXmPB3SHBRW4Y` | **None** |
| `dclv2.ref-labs.near` | 221697277 | `8FYiayAinMQr5aTLmYuPYNReqeLeLmrz3ceUXgdsuHgE` | **None** |
| `linear-protocol.near` | 221697289 | `5LiDVDd1gh7ofVNbiA9VXrWwkv2m8tw46jZqYeuoC3SG` | **None** |
| `intents.near` | 221697300 | `BtA1BEFNS619KkvXFsgcpQ21Tb5yMm32aaUkn7xNothk` | **None** |
| `dex.intear.near` | 221697320 | `5JUhDgnrWbBDcSqJtfivQX4XPXEjzm5reVMjs8A1GJvk` | **None** |

All six source-documented NEAR accounts had authentic deployed Wasm matching their finalized-block account code hash; all returned `NO_FLASH_LOAN_ENTRYPOINT_EXPORTED` for the scanner's exact standard flash-name patterns. **This excludes the methods searched on those deployed versions; it does not prove the absence of other, differently named/custom or separate contract-based uncollateralized lending facilities anywhere on NEAR.**

The genuine `linear-protocol.near` token `ft_metadata` view at block **221697289** reported `spec: ft-1.0.0`, `symbol: LINEAR`, `name: LiNEAR`, and **24 decimals**. Because none of the six accounts exposed a candidate native flash method, Stage141 correctly **did not** attempt an FT balance query for a hypothetical loan provider and reported no loanable liquidity or fake borrowing capacity.

**Verified outcome:** `fundingStatus=NO_VERIFIED_UNCOLLATERALIZED_NATIVE_LINEAR_LOAN_SOURCE`, `qualifyingUncollateralizedProviders=[]`, `lenderConnectedForBorrowing=false`, and `maySignMainnet=mayBroadcastMainnet=false`. There is **no compatible lender connected, no actual loan issued and no owner profit**.

---

## What was built

The Stage140 deployed-WASM inspector examined two on-chain accounts. Stage141 independently extends it to **six accounts whose identities are attested by published protocol documentation**:

| Account ID | Documented purpose | Source |
| --- | --- | --- |
| `contract.main.burrow.near` | Rhea lending / ordinary collateralized debt | [Rhea contracts](https://guide.rhea.finance/developers/contracts) |
| `v2.ref-finance.near` | Rhea/Ref AMM | [Rhea contract directory](https://github.com/ref-finance/guide/blob/main/developers/contracts.md) |
| `dclv2.ref-labs.near` | Concentrated swap liquidity / limit orders | [Ref SDK mainnet config](https://github.com/ref-finance/ref-sdk) |
| `linear-protocol.near` | LiNEAR token issuer and NEP-141 FT contract | [LiNEAR contract documentation](https://docs.linearprotocol.org/developer-guide/contract-overview) |
| `intents.near` | Intents signer verification and settlement | [NEAR Intents verifier docs](https://docs.near-intents.org/integration/verifier-contract/account-abstraction) |
| `dex.intear.near` | Intear/Plach AMM | [Intear DEX aggregation directory](https://docs.intear.tech/dex-aggregator/reference/dexs/) |

**None of these accounts is presumed to be a lender.** This is source-grounded candidate discovery; neither an exchange, a staking token nor a settlement verifier automatically provides credit. The published Ref contracts and SDK describe swap functionality, not an uncollateralized LiNEAR loan guarantee.

The new module `scripts/stage141-near-lender-qualification.mjs` uses Stage140's **read-only** `view_account` + `view_code` queries at the same finalized block to compute a SHA-256 hash of the *actual deployed Wasm* and compare it with the account's on-chain `code_hash`. For any attested code, it searches only for documented general flash-loan export naming patterns. A method named `flash_loan` is at most a reason to inspect an ABI; it never becomes execution authority.

Independently, when LiNEAR's code is itself attested, Stage141 calls the genuine LiNEAR `ft_metadata` view at its own pinned block. If a native account has a possible flash-loan export, it also calls `ft_balance_of` for that account at the **candidate's pinned block**. The observed FT balance, even if nonzero, **is NOT borrowing liquidity**, ownership permission, collateral eligibility or evidence of a public credit interface.

## Manual read-only run

Requires Node 22 or newer, no keys and no wallet access:

```bash
node --test tests/rhea-stage141-lender-qualification.test.mjs
node scripts/stage141-near-lender-cli.mjs stage141-native-loan-qualification.json
```

The CLI requires at least **two independently matching deployed account code hashes** before it writes an audit report; a broken RPC or empty successful HTTP response cannot create a convincing green artifact. The JSON includes all six results, token metadata status and precise unreadable/unverified failures.

[Stage141 GitHub Actions](../.github/workflows/rhea-stage141-lender-qualification.yml) runs deterministic spoofing/cross-block/asset tests on PRs, and performs an actual **six-contract mainnet read-only query** on push to `main` or manual dispatch. It uploads `stage141-live-extended-near-provider-qualification`. An uploaded artifact proves only the contained observations, not that any lender offered capital.

### Explicit limits and preconditions

Stage141 sets `qualifyingUncollateralizedProviders: []`, `lenderConnectedForBorrowing: false`, `maySignMainnet: false`, `mayBroadcastMainnet: false` and `actualFundsBorrowed: false` **unconditionally**. These are intentional safety properties; Stage141 cannot certify a loan from input flags.

A *future* qualified lender needs **all** of:

1. Authentic deployed native NEAR code, audited/source-understood ABI, public access to uncollateralized funds and the correct LiNEAR repay asset or proven funding/swap route.
2. Authentic available/lendable token reserve and meaningful loan limits, accounting for real fees, storage and gas sponsorship.
3. Lender-enforced principal+fee repayment, actual token settlement evidence and safe compensation for NEAR's asynchronous promise failures without assuming EVM-wide rollback.
4. Real Sandbox integration funded by that provider, with no owner collateral; failed paths must not strand irrecoverable unaccounted debt.
5. A canonical transaction and post-settlement balance/liability proof with positive *realized* net token proceeds; no imaginary unsold-asset profit.
6. Owner-approved narrowly authorized mainnet deployment and payment policy; `okunlola_labs.near` stays private owner/payout and `sillywiki4201.near` remains an unconnected restricted executor proposal.

**Next milestone** after the real Stage141 artifact: build the adapter's strict **offline financing lifecycle** with separate `EXTERNAL_FLASH_LOAN` and `AUTHORIZED_PARTNER_ESCROW` types; then a local funded-by-partner Workspaces replay that proves funds, Rhea execution, repayment, stranded-fund recovery and profit conversion. No key or mainnet spending is part of this stage.
