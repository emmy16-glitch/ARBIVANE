# Proposed NEAR policy treasury — deliberately not deployed

A Rust `near-sdk-rs` policy contract is planned but is not included as untested code in Stage 1.

Required state includes: owner account; explicitly registered Shade-attested agent identity; pause; allowlisted lending targets and methods; repayment cap; daily budget; expiry; monotonically increasing nonce; in-flight lock; callback status; and a restricted treasury withdrawal path.

Before implementing, establish whether the live Rhea oracle/`Execute` call path can actually originate from an account whose assets and borrowing permissions are controlled by this contract. An off-chain agent's separate full-access key makes an advisory `approved: true` decision meaningless as a hard custody limit.

Testnet validation should prove **unauthorized callers cannot spend**, **duplicate nonces cannot replay**, **paused contracts reject**, **over-limit calls reject**, and **failed asynchronous promise chains reconcile accurately**. Mainnet deployment is explicitly forbidden at this stage.
