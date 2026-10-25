# Stage 57 — choose Rhea liquidation routes that pass pinned source asset permissions

## Execution blocker

The existing source-sized Stage35 candidate enumerated all debt/collateral pairs by reference paper spread, then selected the largest gross figure *without checking whether the deployed Rhea asset configurations permitted the actual Borrow or collateral Withdraw actions*. Subsequent Stage49 and Stage50 checks could correctly reject that proposal, but a smaller positive source-reference pair that was actually permitted might never be offered for real isolated Sandbox replay.

## Changes

- Build a single strict asset configuration map from the authentic finalized same-block `get_assets_paged` response already retrieved by Stage35/Stage38.
- For each candidate debt leg require `config.can_borrow === true`. For a candidate collateral seizure require `config.can_withdraw === true`.
- Check the actual pinned source pool balances as U128 strings. Limit the internal Rhea repay amount to the smaller of its existing Stage35 **1%-of-debt budget** and `supplied.balance - borrowed.balance`. A missing or zero headroom blocks that route.
- Preserve the reference USD pricing, share parity, four Rhea liquidation-source rules, positive paper spread threshold and strict failure flags. Scan other source-reference asset pairs when the largest gross pair is disabled.
- Add tests for disabled tokens, missing withdraw permissions, insufficient pool headroom, malformed balances, alternative permitted collateral and absence of mainnet transaction authorization.
- Trigger existing Stage42 authentic **four-shard, 320-borrower** qualification on this change. The preexisting Stage56 flow attempts a **real imported-state local Rhea Sandbox transaction** only if the re-priced borrower qualifies under Stage35, Stage37, Stage49, Stage50, Stage51 and Stage52 gates. Failed attempted calls are captured as evidence, not fabricated successes. No unconditional transaction can be executed without an actual eligible borrower.

## Honest evidence boundary

Pinned accounting headroom does not guarantee that the Rhea lending vault has transferable NEP-141 inventory. Stage50 independently reads the actual vault balance and token precision at the same source block. Nor does the screening prove collateral borrow capacity, oracle callback success, exact deployed liquidation math or swap profitability; these remain later gates.

This implementation intentionally does **not** send a mainnet transaction or claim realized profit. A passing CI suite establishes candidate-selection behavior, not evidence that a real eligible borrower was found.

The known old Stage35 artifact `40131111995` did **not** qualify. Existing automatic Stage42 borrower scanning and Stage56 isolated execution admission must find genuinely new positive evidence, and should report zero attempts if none exists.
