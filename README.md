# capability-cell-fabrication-run-monitor-service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Validates and folds one append-only Capability Cell fabrication event trajectory into its current observable state.

## Paid observation receipt continuity

The existing `src/paid-observation-ledger.mjs` binds a signed x402 invocation to a
retained request and one terminal receipt or refusal. Its returned readings are
detached values: callers and observation callbacks cannot mutate durable intent,
settlement evidence, pricing or results through those returned objects. The
underlying journal remains `src/paid-observation-journal.mjs`; this is not a
second settlement ledger or an authorization grant.

An intent is only pending until its original append completes. A terminal result
is visible only after the terminal append succeeds. After an interrupted or
uncertain append, **do not blindly retry a payment or reconstruct success from an
HTTP response**: stop the affected seller, inspect the original journal with
`receiptState`, and reconcile the signed invocation and existing terminal
before restarting the owner. Conflicting entries must refuse rather than
overwrite. The existing OCapN pre-payment admission and x402 settlement checks
remain separately mandatory.

Run `node --test test/paid-observation-ledger.test.mjs test/paid-observation-receipt-isolation.test.mjs`
for the focused source-level checks and `npm run verify` in a dependency-equipped,
source-pinned owner installation for all CLI/A2A/x402 tests. Neither command
by itself proves an installed recipient received the corrected release.
