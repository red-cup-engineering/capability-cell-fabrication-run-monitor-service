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

## Observation schema identities and independent consumers

The original Monitor and the separate Organizing observer previously published
three **different schema documents under the same three v1 URNs**. That made a
JSON Schema registry's resource choice ambiguous, especially for the Monitor's
timestamp requirements and `state.lastEventAt`. The Monitor's input, output,
and observed-state schemas now have distinct `monitor-*:v2` URNs; the output
has an **absolute** reference to the actual Monitor state schema. The original
shared refusal schema is byte-identical to Organizing and retains its v1 URN.

This changes **schema-resource identities**, not the existing CLI, A2A/RMN or
x402 wire `type` strings, payment identity, event IDs, or journal framing.
The Monitor v2 state schema requires `lastEventAt`, which its original current
observer already emits. A consumer must explicitly register and select the
actual source schemas exposed by `./schemas`; it must not infer that an older
AOE v1 reading or a historical Monitor source is now v2 from a matching
`type` name alone. Keep the original v1 records available through their
source/version custody. Do not silently rewrite signed input or reissue a
settled payment to migrate it.

Source regression: `node --test test/schema-namespaces.test.mjs`. Actual
installed admission requires its original JSON Schema Draft 2020-12 loader
to register both producers' distinct schema resources, resolve the absolute
`state.$ref`, exercise the positive/negative `lastEventAt` and event-time
formats, and receive the selected release and its real CLI/A2A/x402 clients.
**The separate stage-law and event-NI provider convergence is not resolved
by changing schema identifiers**; it remains with Organizing #227 and this
Monitor's original receiving issue #2.
