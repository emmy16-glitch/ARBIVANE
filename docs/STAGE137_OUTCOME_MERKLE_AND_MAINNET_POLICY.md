# Stage137–138 — Outcome Merkle paths and mainnet admission policy

## What is actually implemented

Stage137 reconstructs a NEAR execution-outcome leaf from the authentic JSON-RPC
outcome data, using Borsh-encoded partial outcome, execution ID, and SHA-256 of
each log. It checks the outcome's shard Merkle path, the shard-root-to-block
outcome Merkle path, the Borsh lite-header block hash, and the block-to-supplied
light-client-head Merkle path. An invalid hash, altered outcome, altered log,
changed header, changed execution identifier, unexpected direction or mismatched
root causes a deterministic failure.

The supported proof envelope corresponds to NEAR's
`EXPERIMENTAL_light_client_proof` endpoint for transactions and receipts.

**Critical trust boundary:** A Merkle path that agrees with a block header and
light-client-head root SUPPLIED BY THE SAME RPC is self-consistent, not proof
that those roots are authentic on canonical mainnet. Until an independent
light-client implementation validates validator approvals, epoch transitions,
and an externally trusted checkpoint, the stage reports:

- `outcomeRootMatchesSuppliedHeader: true` for a fully matching proof
- `blockHashMatchesSuppliedLiteHeader: true`
- `blockPathMatchesSuppliedHeadRoot: true`
- `independentlyAuthenticatedLightClientHead: false`
- `verifiedCanonicalMainnetInclusion: false`

It does **not** rewrite previous Stage136 Sandbox receipts into mainnet proofs.
The recent verified Rhea Sandbox liquidations remain local-only.

To review an externally collected proof, create a JSON file with:
`proof` (the RPC result containing `outcome_proof`, `outcome_root_proof`,
`block_header_lite`, `block_proof`), `expectedId`,
`expectedExecutorId`, and `lightClientHeadBlockMerkleRoot`.

```sh
node scripts/stage137-proof-and-policy-cli.mjs proof proof-input.json stage137-output.json
```

This operates offline, never sends a transaction and does not fetch any
private key. Synthetic adversarial tests are provided; they are **not** an
authentic current-mainnet receipt-inclusion demonstration.

## Mainnet enablement — NOT ACTIVATED

The owner requested preparation for actual mainnet liquidation. Stage138 adds
an **operator-defined spending policy preview** (no default spending cap).
The policy requires a named wallet/public key, explicit maximum capital per
transaction and maximum cumulative daily spend, maximum loss, minimum positive
net profit, bounded worst-case loss, current liquidation eligibility,
source-contract/Oracle/Wasm checks, a live executable quote, and gas,
storage, competition and slippage accounting in a common verified value unit.

```sh
node scripts/stage137-proof-and-policy-cli.mjs mainnet-policy-preview mainnet-policy.json review.json
```

Even apparently favorable input produces **no mainnet transaction**.
JSON flags alone do not prove identity or liquidity. Stage138 reports
`admissibleForActualMainnetBroadcast: false`,
`maySignMainnet: false` and `mayBroadcastMainnet: false`.

Actual live trading needs a separately audited execution adapter, independent
on-chain wallet/access-key authorization, bounded per-transaction and daily
exposure enforcement, fresh chain state, escrow/flash-loan settlement if
applicable, executable price and gas/slippage quotes, explicit owner's
signed approval and secure key custody. No key or spending limit is invented,
uploaded or enabled in GitHub Actions. No live NEAR is transferred.

## Next tests and milestones

1. Run safety/type CI and the Stage137 Merkle/money-policy adversarial tests.
2. Validate the Merkle verifier against an authentic **read-only** proof from
   NEAR mainnet; reject old unsupported RPC proof formats rather than bypass.
3. Independently authenticate a light-client head with validator approvals and
   epoch transitions. Only then may canonical receipt inclusion be claimed.
4. Independently prove current economic profitability and operator wallet
   authorization before proposing a separate reviewed live-signing implementation.

Technical references:
- https://docs.near.org/api-reference/light-client-proof
- https://nomicon.io/ChainSpec/LightClient.html
- https://docs.fastnear.com/rpc/protocol/light-client-proof
