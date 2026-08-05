# Phase 0 Research: Facet Transform Engine

Ten decisions grounded in the current engine/studio/contracts code, plus one resolved cross-feature
NEEDS CLARIFICATION. Each: **Decision / Rationale / Alternatives considered**, with file:line evidence.
Findings were gathered by the KM crew (km-programmer, km-keyman, km-strategy, km-validator).

---

## D1 — Module placement

**Decision**: New engine module `packages/engine/src/facet-transform/` with a curated `index.ts` barrel
(named exports, not `export *`), re-exported from `packages/engine/src/index.ts` immediately after the
`pattern-apply` block (`packages/engine/src/index.ts:140-142`).

**Rationale**: `pattern-apply` is the established precedent for working-copy-mutation orchestration —
its barrel exports named functions + result/option types only (`pattern-apply/index.ts:1-77`), and the
package root re-exports each module's barrel with an explanatory provenance comment. `stub-mutator` is
explicitly a Sprint-1 stub marked for deletion (`stub-mutator/index.ts:1-2`) — not a pattern to imitate.

**Alternatives considered**: putting the engine inside `validator/` (rejected — blurs "validity checks"
with "commit decision", per D8/km-validator); a standalone `utilities/` tool (rejected — it mutates
KeyboardIR and runs in the SPA, so it is engine package code, not an offline tsx tool).

## D2 — Working-copy mutation discipline (copy-return, not in-place)

**Decision**: Migrations are pure `KeyboardIR → KeyboardIR` functions returning a **new** IR (shallow copy
with rewritten arrays), analogous to `carveFilterIr.ts`; a thin projection wrapper (analogous to
`applyCarveToVfs.ts:15-53`) writes the result into the working copy via the studio store's
`setWorkingIR` incremental mutate-seam (`workingCopyStore.ts:293-312`).

**Rationale**: `applyCarveToVfs` documents the invariant "`baseIr` is never mutated; a shallow copy with
filtered arrays is constructed" — the object-reference-replacement discipline downstream memoization relies
on. `setWorkingIR` is the documented incremental patch seam (carve deletions, touch re-propagation), the
right write path for a new transform stage; a full `setIR` replacement would drop carve-deletion overlays.

**Alternatives considered**: in-place mutation of the store IR (rejected — breaks the object-reference
memoization contract, D11/FR-013); a brand-new store slot (rejected — violates Article III's single
working copy).

## D3 — Touch mechanisms operate on `TouchLayoutIR`, not `.kmn`

**Decision**: The longpress→flick migration reads/writes `KeyboardIR.touchLayout` (`TouchLayoutIR`,
`keyboard-ir.ts:318-332`) through the consolidated `parseTouchLayout`/`emitTouchLayout` contract
(`codec/parse-touch.ts` → contracts `parseTouchLayoutString`, canonical post-#354). It rewrites the
sibling optional fields `TouchKeyIR.{sk, flick, multitap}` (`keyboard-ir.ts:101-139`) and sets
`TouchKeyProvenance` (`keyboard-ir.ts:96-99`) explicitly on every rewritten key.

**Rationale**: Design brief §2 — touch mechanisms live in the touch-layout JSON, invisible to the
KMN recognizer. Post-#354, `sk`/`flick`/`multitap` are structurally separate (multitap no longer folded
into `sk`, regression-guarded). Setting provenance explicitly prevents silently clobbering author
hand-set keys, the same discipline `propagateDesktopLayersToTouch.ts` follows.

**Alternatives considered**: reading touch mechanisms from the recognizer output (rejected — design brief
§2 states this does not hold for touch mechanisms); editing the raw wire JSON blindly (only for constructs
the typed `TouchKeyIR` can't represent, via the `applyTouchAssignmentsToRawJson` sibling pattern).

## D4 — Measurement input is injected (resolves NEEDS CLARIFICATION)

**Decision**: The engine receives the 037/036 `source.*` measurement (dominant value + consistency +
enumerated exception sites + cause tags) as an **injected parameter**, not by reading
`docs/keyboard-facet-index.json` itself. The studio (or caller) is responsible for loading the index and
handing the relevant record to `proposeFacetTransform`.

**Rationale**: There is **no engine-side loader** for the index today, and `utilities/facet-index/reader.ts`
is a non-package tsx tool that CLAUDE.md forbids treating as a workspace dependency. The glottolog bridge
(`@keyboard-studio/glottolog/bridge`) is the established contracts-only precedent: take injected deps, no
engine/studio import. Injection keeps the transform engine testable with fixture measurements and free of
the utilities path.

**NEEDS CLARIFICATION resolved (cross-feature dependency, flagged for planning/tasks)**: The `source.*`
facets (encoding / mechanism / normalization + cause-tagged exception sites) are **spec 037's output and
are not yet present** in `docs/keyboard-facet-index.json` (which today carries only the `script` facet).
Both 037 and 039 are Draft. **039 must not be *implemented* against live measurements until 037 lands the
cause-tagged exception-site schema** — but 039's engine can be *built and fully tested against fixture
measurements* in the meantime (the injection boundary is exactly what makes this possible). The measurement
shape 039 consumes is pinned in [data-model.md](data-model.md) (the `SourceFacetMeasurement` input contract)
so 037 and 039 agree on it.

**Alternatives considered**: an engine-side index reader (rejected — pulls the non-package utilities path
into the engine); duplicating the reader shape into `packages/contracts` (deferred — only needed if a
non-studio caller must load the index; the injection boundary defers that decision cheaply).

## D5 — The transition matrix does NOT reuse §7 strategy types

**Decision**: The value-transition matrix and its `houseTargetPolicy` ordered decision-table are an
**independent** framework. They are *modeled on* the spec §7.2 ordered/first-match-wins **pattern** but
do **not** import or extend `StrategyId` / `PrimaryRuleNumber` / the locked §7.2 tree
(`packages/contracts/src/strategy.ts`). data-model.md carries a one-line explicit disclaimer.

**Rationale**: The design brief §6 is explicit on this, and the vocabulary overlap is a trap:
`source.desktop-combo-mechanism` has `deadkey`/`context-match` values that *look* like §7 strategy
shapes. Cross-referencing which S-XX card a transition target resembles is a documentation cross-link
only, never a type dependency — this keeps Article I green (no locked-contract edit).

**Alternatives considered**: reusing `StrategyId` as the mechanism vocabulary (rejected — couples an
extensible content model to a locked contract; would trigger Article I escalation).

## D6 — Behavior-preserving parity oracle: compile + simulate over the bounded corpus

**Decision**: Parity ("output and typing behaviour unchanged", FR-007/SC-001) is asserted by:
(1) `buildProducedSet(irBefore) === buildProducedSet(irAfter)` as a fast necessary-condition pre-check
(`producedSet.ts:210`); (2) `compile()` before and after; (3) `simulate(compiled, chord)`
(`simulator/index.ts:166`) for every chord in `generateCorpus(irBefore)` (`validator/corpus.ts`),
asserting identical `finalOutput` (and deadkey trace). **Not** byte-identical `.kmx` comparison.

**Rationale**: The headless `JSKeyboardProcessor` simulator already runs real Keyman keystroke processing
in Node/vitest — it *is* the "keystroke runtime" the deferred I2 stub (`layer-a-prime.ts:224-260`) says is
unavailable. `generateCorpus` is the ready-made deterministic IR-derived input set. `.kmx` binaries are
not byte-stable across source-spelling changes (exactly US1's case), so byte-identity is the wrong oracle;
produced-set equality alone is silent on deadkey/context sequencing (which US2/US3 touch), so it is only a
pre-check.

**Alternatives considered**: byte-identical artifact comparison (rejected — not stable, and Article VII
disclaims byte-identical round-trip); produced-set equality alone (insufficient); implementing I2 for real
(deferred — a cross-cutting import-fidelity change; if pursued it gets its own task, not folded into 039).

## D7 — Invertibility via `assertSemanticEquivalence`

**Decision**: For a behavior-preserving transform `T` with declared inverse `T⁻¹`, test
`assertSemanticEquivalence(irBefore, T⁻¹(T(irBefore))).equivalent === true`
(`keyboardIRRoundTrip.ts:86`).

**Rationale**: `assertSemanticEquivalence` is the existing structural/semantic diff oracle (ignores
`nodeId`/comments/`ownedByPattern`, compares stores/groups/rules/raw/touch/visual with documented
normalization). It matches Acceptance Scenario 1.3's "equivalent prior state", not deep-equality.
`compareRaw` (`keyboardIRRoundTrip.ts:394-420`) already asserts raw-fragment `reason`/`sourceText`
equality — doubling as an opaque-integrity check (D12).

**Alternatives considered**: a new deep-equality comparator (rejected — "equivalent" not "identical" is
what the spec requires, and one already exists).

## D8 — Compile-regression gate is a one-shot undebounced call on a transient candidate

**Decision**: Before commit, the engine validates a **transient candidate IR** (built by the migration,
discarded if rejected) by calling `validateWithOracle(mutatedSource)` (`oracle.ts:238`) or `compile()`
(`compiler/index.ts:210`) exactly once, `await`ed inline in the Apply handler. On failure the transform is
**not committed**, the working copy is unchanged, and the failure is attributed to the proposal (FR-010).

**Rationale**: `validateWithOracle`/`compile`/`runAllChecks` are plain (a)sync functions with no timer;
`oracle.ts:17-18` states "No 300 ms debounce here — debounce lives in the consumer." The candidate IR is
transient and never serialized, so it is not a second persistent working copy (Article III intact).

**Alternatives considered**: committing then validating and rolling back (rejected — leaves a window where
the working copy is invalid); routing the gate through the studio's debounced validator (rejected — D9).

## D9 — The single 300 ms debounce is untouched

**Decision**: The pre-commit gate is **outside** the debounce cycle by construction — it is one-shot and
user-triggered, not keystroke-driven, so there is nothing to coalesce. It reuses the one validation
*implementation* from a second *call site*; it introduces no second timer and no parallel validation path.

**Rationale**: `useDebounce.ts:4` (`DEBOUNCE_MS = 300`) is consumed once at `useValidator.ts:22`;
`useValidator.ts:12-17` states the D3 invariant. Article IV bars a second *implementation*/timer, not a
second *call site* of the existing one. **Caution folded into the plan**: if the transform preview
re-validates on every keystroke of a parameter field (e.g. a flick-direction override), that field must
reuse `useDebounce`/`useValidator`, never a bespoke `setTimeout`.

**Alternatives considered**: a transform-specific debounce (rejected — category error; nothing to
coalesce on a single Apply click).

## D10 — Honestly-bounded starter transition set

**Decision**: v1 supports four transitions across all three impact classes, and registers the riskier
pairs as **declined-with-reason** (FR-004) from day one:

| # | Transition | Class | US |
|---|---|---|---|
| 1 | `source.encoding` base/combining spelling `quoted-literal ↔ u-notation` (+ `mixed → house-style`) | behavior-preserving | US1 |
| 2 | `source.encoding` input within-kind spelling (`bare-vk`/`named-modifier`/`split-modifier`; char-ref `quoted-literal ↔ u-notation`) | behavior-preserving | US1 |
| 3 | `source.touch-combo-mechanism` `longpress → flick` (bounded to keys with subkey count ≤ flick-direction budget; direction derived + confirmed) | ux-changing | US2 |
| 4 | `source.normalization-posture` `nfd → nfc` (with coordinated backspace-rule rewrite) | output-changing | US3 |

**Declined-with-reason (permanent)**: `source.encoding` input **match-kind** `key-ref ↔ char-ref`
(semantic, char-ref may be unreachable — design brief §5); any pair touching `os-compose` (no KMN
construct, no kmcmplib check surface); gate facets `source.mnemonic-vs-positional` and `source.casing`.
**Declined-with-reason (deferred to v2)**: `nfc → nfd` (needs Unicode decomposition data + new backspace
rules + keyboard-wide offset re-audit); `source.fallback-posture` both directions (needs a full base-layout
key-map data dependency; FR-011/FR-013 blast radius); `source.desktop-combo-mechanism` `deadkey ↔ context-match`
(distinct KMN-rule evidence + fixtures); `layer ↔ {longpress,flick,multitap}` and `modifier-key → deadkey`
(underdetermined decompositions); `source.reordering-rules` (convention-read, no fixture basis).

**Rationale**: this maximizes exercise of all three `transformImpactClass` code paths and the cause-tag
preservation machinery with the smallest fixture surface, while declining exactly the transitions the brief
itself flags as riskier-than-their-nominal-class or that touch not-yet-built cross-cutting concerns.

**Alternatives considered**: covering every enumerated pair (rejected — spec Assumption says starter
coverage is a decided subset; unsupported pairs are declined, not silently missing); covering only US1
(rejected — the spec wants all three impact classes proven, and US2 is the user's named case).

## D11 — FR-013 cache invalidation is satisfied by construction

**Decision**: A transform that changes the produced-character set (e.g. fall-through (un)blocking) needs no
new cache-busting mechanism: writing the new IR into the store slot with a **new object reference** via
`setWorkingIR`, plus re-running axis derivation (`seedIrAxesFromBaseIr` → `setIrAxes`,
`workingCopyStore.ts:524-539`) when the produced set changed, causes `session.axes` and downstream
`selectStrategy()`/gallery reads to re-derive automatically.

**Rationale**: `irAxes`/`session`/strategy recommendation are **derived reactively** (`useMemo` /
Zustand selectors), not cached blobs. `useInventoryDiff.ts:52-55` is the precedent: `buildProducedSet` is
memoized strictly on `baseIr`'s object reference because the store replaces the slot rather than mutating
in place. So FR-013 reduces to "replace the reference + re-seed axes when the produced set changes."

**Alternatives considered**: a manual cache-invalidation event/bus (rejected — no cache object exists to
bust; would be dead machinery).

## D12 — Opaque-fragment integrity reporting

**Decision**: A migration diffs `ir.raw` before/after. Any `RawKmnFragment` that disappeared or whose
`sourceText` changed without an explicit, user-confirmed rewrite is an FR-009 violation. The "what I could
not touch" report reuses I4's `{feature, count}` inventory shape
(`checkOpaqueFeatureInventory`, `layer-a-prime.ts:198-221`; `OPAQUE_REASONS`, `codec/opaque-reasons.ts:9-18`).

**Rationale**: I4 already summarizes opaque coverage (the only Layer-A′ info-level check) and is exposed
via `ImportReport.opaqueFeatureInventory`. Reusing its shape keeps one code path for "here's the opaque
inventory" across import-fidelity and transform-proposal UIs.

**NEEDS CLARIFICATION (bounded, deferred to tasks)**: I4 is category-level (`{feature, count}`), while
FR-009 + US2's per-site "name the principled-split / offer the gap-omission" implies **per-site** opaque
reporting. **Decision for v1**: the starter subset (D10) touches encoding spelling, touch layout, and
NFD→NFC output/backspace rules — none of which overlaps the opaque-reason categories in a way that needs
per-site granularity, so v1 uses the category-level I4 summary; a per-site opaque reporter (a `pattern-apply`-
adjacent sibling to I4, **not** a new Layer-A check) is scheduled only if a later transition needs it.

---

## Summary of resolved unknowns

| Technical Context unknown | Resolution |
|---|---|
| Where the transform engine lives | New `packages/engine/src/facet-transform/` module (D1) |
| How it mutates the working copy | Copy-return IR migrations + `setWorkingIR` projection (D2) |
| How touch mechanisms are edited | `TouchLayoutIR` via `parseTouchLayout`/`emitTouchLayout`, provenance-aware (D3) |
| How it reads 037/036 measurements | Injected parameter, not an engine-side index reader (D4) |
| Whether it touches §7 locked types | No — independent framework, disclaimer in data-model (D5) |
| Behavior-preserving parity oracle | `buildProducedSet` pre-check + compile+`simulate` over `generateCorpus` (D6) |
| Invertibility check | `assertSemanticEquivalence` round-trip (D7) |
| Compile-regression gate without a 2nd debounce | One-shot undebounced `validateWithOracle`/`compile` on a transient candidate (D8/D9) |
| Starter coverage vs. honest decline | 4 supported + declined-with-reason registry (D10) |
| FR-013 cache invalidation surface | Satisfied by object-reference replacement + axis re-seed (D11) |
| Opaque-fragment reporting | Before/after `ir.raw` diff, reuse I4 shape; per-site deferred (D12) |
