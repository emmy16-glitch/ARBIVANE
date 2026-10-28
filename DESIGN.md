---
version: alpha
colors:
  background: "#08131f"
  surface: "#0e1c2a"
  surfaceRaised: "#112232"
  border: "#26394c"
  text: "#eaf1f9"
  muted: "#a1b0c2"
  primary: "#7362d8"
  success: "#35c99d"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
rounded:
  panel: "10px"
  control: "7px"
components:
  panel:
    background: "#0e1c2a"
    borderRadius: "10px"
---
# ARBIVANE interface design

## Overview
An evidence-first operations terminal based on the operator-approved dark desktop dashboard, **not** a speculative neon trading mockup. The primary action is configuring and starting a bounded Sandbox session; the secondary focus is inspecting actual receipts. Progressive disclosure hides verbose log payloads in the existing event drawer and detailed routes. Do not manufacture engine activity or financial indicators.

## Colors
Dark navy/graphite backgrounds and a restrained violet primary action are brand accents. Green is reserved for confirmed successful states; amber is for pending or blocked; red is for actual failures and risk. No fake glowing connection rings, decorative price movements or saturated borders on every card. The runtime canonical palette is defined in `dashboard/web/src/styles.css`.

## Typography
Inter with system fallback. 11px is the minimum for dense operational metadata, 12–14px for labels and event rows, 14px for panel titles and 23–26px for actual key figures. Avoid microtype in critical controls.

## Layout
On desktops, navigation at approximately 194px; two dashboard columns for control/activity and actual accounting/operations. Collapse to one column and compact scrollable environment selectors on phones. No empty analytics chart is rendered as an invented curve.

## Elevation & Depth
Flat bordered surfaces and restrained contrasts. Do not stack gradients, blur, drop shadows and glow effects. A single subdued primary action provides hierarchy.

## Shapes
10px panel corners, 7–9px controls, 6px event/status dots. Native interactive controls with visible keyboard focus.

## Components
Environment selector switches isolated Sandbox/Testnet/Mainnet contexts without mixing balances or live events. Start, Pause, Resume and Stop show only supported actions. Live Operations renders persisted, ordered evidence, not scripted progress. Wallet controls remain disabled without a compatible, authorized adapter.

## Do's and Don'ts
Use concise empty states such as “No session started”, “No verified transactions” and “Wallet not configured”. Show timestamps and traceable original receipts. Put lengthy diagnostic JSON in expandable details. Never label source gross as realized net P&L. Never imply Mainnet spending is enabled when it is not.
