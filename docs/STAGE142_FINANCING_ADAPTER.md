# Stage142 — Strict offline financing adapter boundary

Stage142 creates signed-hash-*identifiable*, **not cryptographically signed**, deterministic intent documents separating `EXTERNAL_FLASH_LOAN` from `AUTHORIZED_PARTNER_ESCROW`. This is an offline adapter input model, **not a contract, confirmed lender, loan or execution**. It uses a SHA-256 integrity fingerprint over the canonical internal fields (not an authorization signature).

- Funding source, borrower, proposed executor (`sillywiki4201.near`) and token asset `linear-protocol.near` are explicit; public owner payout wallet `okunlola_labs.near` is never accepted as provider.
- All prices are integer NEP-141 LiNEAR atomic units, not Rhea internal share amounts; expires within five minutes; new principal and quoted costs are bounded to U128.
- `EXTERNAL_FLASH_LOAN` forbids any fictitious already-funded escrow, and `AUTHORIZED_PARTNER_ESCROW` requires the *quoted* escrow reserve to cover principal+premium. This does **not** prove escrow was deposited.
- Owner contribution must equal 0. Paper proceeds minus principal, premium, gas/storage and worst slippage are an **indicative** result, never money distributed to the owner.
- All outcomes have `allowLoanExecution:false`, `maySignMainnet:false`, `mayBroadcastMainnet:false`, `fundingSourceVerified:false`, `allowProfitPayout:false` and true remaining dependency blockers.
- `stage142VerifyIntentIntegrity` detects tampering with that input/output. A hash alone must never be treated as wallet approval or an actual token balance observation.

```bash
node --test tests/rhea-stage142-financing-intent.test.mjs
```

The next stage must persist each real async receipt and escrow state transition to prevent double submission, late callback errors, false profit and lost loan liabilities. Only after a real independently funded Sandbox transaction could the release gate even consider subsequent authorization.

See [Stage141 real lender search](STAGE141_LENDER_QUALIFICATION.md).
