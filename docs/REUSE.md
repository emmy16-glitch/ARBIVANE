# Upstream research, original code and license obligations

The implementation in this milestone is new code inspired by architecture patterns. It does **not** incorporate verbatim source files from the upstream repositories listed here.

| Upstream source | Primary URL | Intended adoption | License noted in research | Decision |
| --- | --- | --- | --- | --- |
| Rhea / Burrow liquidation bot | https://github.com/burrowHQ/burrowland-liquidation-bot | Account read flow and contract-interface research; financial maths require revalidation | Unlicense (verify at pinned commit) | Do not copy old runtime/legacy addresses |
| Morpho Bots | https://github.com/morpho-org/morpho-bots | Independent fresh-state validation, pluggable modules, preflight and lifecycle | Apache-2.0 (verify at pinned commit) | Port architectural patterns, not EVM math or bytecode |
| Shade Agent Framework | https://github.com/NearDeFi/shade-agent-framework | Future TEE-backed restricted worker | Apache-2.0 (verify at pinned commit) | Use official SDK once controls are enforceable |
| Shade Agent Template | https://github.com/NearDeFi/shade-agent-template | Future attested testnet agent example | Apache-2.0 (verify at pinned commit) | Integration later |
| NEAR Intents examples | https://github.com/near-examples/near-intents-examples | Quote/status/deposit semantics | Review each file; don't assume license | Reference only for now |
| NEAR AI Inference SDK | https://github.com/nearai/inference-sdk | Optional verified explanation layer | Verify current package/license | Integrate only with response checks |
| Old Morpho Blue liquidation bot | https://github.com/morpho-org/morpho-blue-liquidation-bot | Historical provider selection lessons | MIT (verify at pinned commit) | Archived; don't adopt runtime |

Before *any* code is copied, record the pinned upstream commit, relative file path, exact license, copyright/NOTICE, changes made, and copy the necessary legal notices into this repository. A link in this file is not itself a valid replacement for an upstream copyright notice where one is required.
