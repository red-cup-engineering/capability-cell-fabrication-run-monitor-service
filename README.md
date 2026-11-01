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

## Domain names, typed contracts and standards-based interchange

The implementation now distinguishes **source journal events**, **observations**,
**payment receipts**, and **HTTP representations**. Internal names identify
those concepts directly. These are not interchangeable records:

- `FabricationJournalEntry`: a signed/native append-only event with
  `id` (original SHA-256 NI), `previous` (predecessor NI), `sequence`
  (zero-based position), `at` (RFC 3339 source occurrence time), and
  `type` (domain transition). **Do not rename these existing signed wire
  members** without a source-qualified versioned migration.
- `FabricationRunObservation`: the original typed state projection with
  `eventHead`, `lastEventAt`, `eventCount`, `completed`,
  `currentStage` and `status`. An observer state of `completed` is not
  installed service, customer acceptance or payment settlement.
- `PaidObservationIntent` / `PaidObservationOutcome`: the original signed
  x402 invocation's durable JSON Lines request and terminal receipt/refusal.
  `recordSignedRequest`, `recordPaymentSettlement`, and
  `getReceiptResponse` are the descriptive ledger method names.
  Original `retain`, `settle`, and `read` remain exact aliases.
- `appendJournalEntry` and `recoverJournalState` name the existing
  newline-delimited JSON (JSON Lines) filesystem operations; original
  `appendReceipt` and `receiptState` remain exact aliases. Partial,
  duplicate and conflicting original journal bytes continue to refuse
  according to the original recovery contract.

Source-owned **JSON Schema Draft 2020-12** identifies the native observation
schemas separately from Organizing v1 and now provides
`content/schemas/cloud-event-observation.schema.json` for an opt-in
**CloudEvents 1.0 structured JSON** representation. TypeScript clients can
use the `types/*.d.mts` contracts selected by the package's typed subpath
exports. `npm run check:types` checks the example consumer when TypeScript
is available. The native `npm run verify` remains the original package
qualification entrypoint.

For process consumers, the original CLI defaults to unchanged native JSON.
`observe-capability-cell-fabrication-run --format=cloudevents-json` instead
outputs a CloudEvents JSON event **only for a successful native observation**;
typed refusals remain refusals with a nonzero process exit. On the existing
x402 result **GET** endpoint (not the paid POST), an explicit HTTP
`Accept: application/cloudevents+json` selects CloudEvents 1.0.
Default/wildcard/zero-quality Accept keeps the original JSON response,
including unknown, pending and refusal outcomes. This is ordinary HTTP
content negotiation, not a second transport, journal or payment operation.

The CloudEvents `source` can be selected through the optional
`CAPABILITY_MONITOR_EVENT_SOURCE` absolute URI setting; absent that, it
identifies the owning service by an explicit URN. `subject` is the run ID,
`time` is the original **source event time** (not HTTP delivery time), and
`data` retains the complete original native observation. The CloudEvents
`id` is a SHA-256 digest of the emitted JSON projection/source pair; it is
**not** the canonical Sign/WitnessJournal NI stored in
`data.state.eventHead`, nor proof that a real instance signed the event.
Historical signed records must never be rewritten merely to change format.

Standards: [CloudEvents 1.0 JSON](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/formats/json-format.md),
[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/),
[RFC 3339](https://www.rfc-editor.org/rfc/rfc3339),
[RFC 9110 HTTP content negotiation](https://www.rfc-editor.org/rfc/rfc9110).
Existing A2A/RMN and x402 payment/authentication protocols remain in their
incumbent owners. Full dependency-installed Node tests, installed endpoint,
canonical AOE stage-law identity, registry publication and independently
received Group Work remain separate original receiving gates under Monitor #2.
