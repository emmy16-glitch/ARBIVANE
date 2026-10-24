# Stage 40 — paced continuation after no valid liquidation opportunities

## Ground truth

The completed Stage38 pipeline screened borrower indices 332–651 inclusive, finding four paper-at-risk accounts and no executable reference plan. All four initially failed fresh reads due to RPC limits. Stage39 rechecked each one successfully without rate limits and concluded **zero safe positive-spread source scenarios**. None was authorized for a transaction.

## Implementation

A shared `PacedNearReadOnlyRpc` spaces read-only RPC calls across concurrently processed borrowers, including pinned lending metadata, live position, Pyth quote and derivative ratio requests. `ResilientNearReadOnlyRpc` continues to handle bounded 429/5xx retries and per-block memoization; the pacing wrapper sits underneath so each retry is also paced. The Stage32 and Stage38 CLIs use this wrapper.

The new workflow `rhea-stage40-paced-borrower-continuation.yml` resumes on original verified Stage30 borrower source run 40128285853 at debt cursor 652 by default. It processes four nonoverlapping 80-account shards, accounting for debt indices 652–971. It limits global concurrency to two runners and request pacing to 700ms **per runner**, not per repository: other concurrently scheduled workflows may still hit public RPC limits. Each shard uploads detailed progress and failed classifications without treating RPC failures as healthy accounts. The workflow launches automatically on merge to main and accepts another cursor on manual dispatch.

Any fresh reference source-valid positive-spread candidate is submitted to the existing Stage37 **isolated Sandbox only**, with mainnet signing and broadcasting disabled. The existing Stage37 runner may still fail on incomplete imported state and successful Sandbox execution alone would not prove profits.

## Missing mainnet release gates

Even after discovering positive candidate: current deployed contract liquidation permission and borrowing constraints, token-unit and share conversion, complete persisted contract state import, finalized successful callback and on-chain balances, executable swap/funding costs, network gas and slippage, defensible net profit, explicit user-controlled wallet spending approval and caps. No PDF or mainnet money execution is part of Stage40.
