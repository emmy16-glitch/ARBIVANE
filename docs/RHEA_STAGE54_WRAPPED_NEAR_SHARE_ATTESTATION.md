# Stage 54 — isolated Rhea collateral shares and wrapped-NEAR mint integrity

Stage53 (#83) already verified that the disposable Sandbox actor wrapped one local NEAR, transferred exactly that amount of `wrap.near` to the cloned Rhea FT vault, and observed a nontrivial `wrap.near` collateral *balance* in Rhea.

Two narrower proof gaps remained:

1. Rhea lending collateral positions contain **both** an internal balance and interest-bearing **shares**. The existing Stage53 parser checked the balance, and parsed the share amount, but could still treat a zero-share wrapped token leg as a valid funding position. Stage54 demands a positive, bounded wrapped-NEAR share quantity and rejects malformed/duplicate collateral leg records.
2. Stage53 verified the vault balance before wrapping and after the FT transfer, but did not independently check that the vault **stayed unchanged** during the actor's native `near_deposit` operation. Stage54 adds an actual intermediate token-vault view check. This catches unexpected state changes that could otherwise be hidden inside an apparently correct net transfer.

These checks run inside the existing Stage49E local funding function, *before* the real `execute_with_pyth` Sandbox call. They strengthen evidence already uploaded in `stage49-sandbox-funding.json` with the exact observed wrapped-NEAR collateral shares and `vaultBalanceUnchangedDuringNativeWrapVerified` flag.

Tests cover valid wrapped token shares, zero shares, duplicate or malformed legs, U128 overflow and unauthorized vault mutations. They never fabricate a successful Rhea liquidation.

**Limits:** More complete proof of Sandbox collateral alone cannot establish actual borrower liquidation eligibility, the `execute_with_pyth` callback, Stage41 debt decrease/collateral transfer, token swap costs or realized positive P&L. No mainnet keys, signing, broadcasting or user-money collateral are introduced.
