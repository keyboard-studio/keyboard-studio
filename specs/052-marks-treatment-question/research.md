# Phase 0 Research: Marks treatment question

Decisions taken before design, with the evidence from the codebase that drove each. Every `NEEDS CLARIFICATION` and every plan-time open question the spec left is resolved here.

## Codebase findings that constrain the design

These were established by reading the code, not assumed, and several of them shrink the work the spec's surface implies.

| Finding | Evidence | Consequence |
|---|---|---|
| `SurveyPhaseResult.computedAxes` already exists as an additive optional `Partial<DiscoveryAxisVector>`, merged across phases by `mergePhaseResults` into `session.axes` — which is exactly what `selectStrategy` consumes | [packages/contracts/src/surveyPhaseResult.ts:51](../../packages/contracts/src/surveyPhaseResult.ts), [packages/contracts/src/surveySession.ts](../../packages/contracts/src/surveySession.ts) (`axes` reduce at ~line 182) | US4 needs **no contract change**. The marks series today emits `{phase:"C", answers:[], marksWorklist, marksOutputForm}` and simply omits `computedAxes`; that omission *is* issue #1433. |
| Axis A7 `spareKeyAvailability` has **no producer anywhere** outside tests, fixtures and mocks | Exhaustive grep across `packages/`, `content/`, `utilities/` (excluding `dist/`, `*.test.*`, `fixtures/`, `mocks/`) returns only the type declaration, decision rule 10, and MechanismGallery's completeness check | The live pipeline never assembles a complete axis vector, so `filterFor(base, undefined)` is what actually runs. FR-016's "same result for every keyboard it produces today" is trivially satisfiable — and the *risk* is in what we newly seed, not in what we preserve. See D2. |
| Decision rule 10 (`A7 = "fully booked"` → append S-08) is the **only** consumer of A7 | [packages/engine/src/strategy-selector/rules.ts:239](../../packages/engine/src/strategy-selector/rules.ts) | The boundary FR-016 must preserve is a single one: the `fully booked` predicate. Rule 8 keys on A7a `remapPosture` (full-remap detection), which the spec correctly puts out of scope. |
| The touch scaffolder already resolves recognized deadkey patterns into long-press `sk[]` subkey menus | [packages/engine/src/scaffolder/scaffoldTouchLayout.ts](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts) (deadkey-successor map, `sk[]` build) | FR-014's load-bearing half — "MUST NOT be producible there by any answer the author can give" — **already holds structurally**. Only the option-set presentation is new work. |
| Every project traverses both the `mechanisms` (desktop) and `touch` spine steps; there is no touch-only target | [packages/studio/src/steps/advance.ts](../../packages/studio/src/steps/advance.ts) (`SPINE` order and the `mechanisms` → `touch_seed_source`/`touch` routing) | A platform-forked option set has nothing to key on. This is the evidence behind D5. |
| `computeMentalModelPrefills` accepts `spareKeys` but the studio never passes it — so `ownLetterAffordable` is `spareKeys === null || …`, i.e. always `true` | [packages/engine/src/marks/mental-model-prefill.ts:98](../../packages/engine/src/marks/mental-model-prefill.ts) vs. the call site at [MarksSeriesStep.tsx:192](../../packages/studio/src/survey/marks/MarksSeriesStep.tsx) which passes `{ baseIr }` only | Confirms the spec's "actively reports the wrong answer" claim precisely: a fully-booked base is reported as affordable. The parameter exists and has no producer. |
| `verifyWorklistCoverage` asserts a mark classified as a mark unit is *not* also inside an own-letter unit | [packages/engine/src/marks/worklist.ts:112](../../packages/engine/src/marks/worklist.ts) (`classified twice`) | This is the assertion FR-006 makes wrong. It must be **deleted**, and SC-007 in spec 046 amended from "exactly once" to "at least once / nothing unclassified" — not worked around. |
| Case derivation for attachments already exists and is additive-only | [packages/engine/src/marks/case-fold.ts](../../packages/engine/src/marks/case-fold.ts) (`expandCaseCounterpartAttachments`), applied just before `buildPlacementWorklist` | FR-023 (derive the promoted character's uppercase counterpart, never withdraw a promotion) reuses this primitive's shape rather than inventing a second casing rule. |
| A jargon-assertion precedent already exists for the sibling station | [MarksSeriesStep.test.tsx:334](../../packages/studio/src/survey/marks/MarksSeriesStep.test.tsx) (`SC-005: the station never renders the words Unicode or normalization`) | SC-004's "verified by assertion, not review" has a working pattern to copy: render the station over a fixture matrix and assert over `textContent`. |

---

## D1 — The canonical key-budget determination

**Decision.** Promote the facet-index measurement to `packages/contracts/src/keyBudget.ts` as the single authoritative determination, emitting the three-band value `"many" | "ralt-only" | "fully-booked"` plus a derived numeric spare capacity. Axis A7 becomes a documented **projection** of it via a boundary-preserving mapping, and `utilities/facet-index/spare-key-budget-classifier.ts` becomes a thin delegate. The pinned stock-key table `base-layouts.json` moves to `packages/contracts/data/`.

**Rationale.** The spec left this open among three competing determinations, and only one of them actually computes anything:

- The numeric `spareKeys` parameter on `computeMentalModelPrefills` — **has no producer**. It is a hole, not a determination.
- Axis A7 `spareKeyAvailability` — **has no producer either** (see findings), and its literal values are pinned §7.1 prose *display* strings (`"RAlt only"`, `"fully booked"`) explicitly documented as unsafe for use as programmatic keys.
- `utilities/facet-index/spare-key-budget-classifier.ts` — the only one with a real, deterministic, tested measurement: over the pinned `kbdus` stock key set it counts distinct keys the base binds in the SHIFT and AltGr planes, excludes the always-occupied base plane and reserved Ctrl/Alt chords, and bands at half-of-N.

Contracts is the right home rather than engine because `utilities/facet-index` must keep reading it and a utility may not be depended upon by a package; contracts is the shared floor both already import, and it already hosts comparable IR-analysis helpers (`buildProducedSet`, which this very classifier imports).

The two naming systems the spec flagged reconcile at the projection boundary, not by renaming either: the programmatic form stays `many | ralt-only | fully-booked`, A7's display strings stay verbatim §7.1 prose, and the mapping is a total function pinned by a test — `many → "many"`, `ralt-only → "RAlt only"`, `fully-booked → "fully booked"`. Because the mapping is bijective on the three bands, rule 10's `fully booked` predicate fires on exactly the same set of inputs it does today.

**Alternatives considered.**
- *Make A7 canonical and derive the rest.* Rejected: A7 has no producer, so "canonical" would mean canonicalising an absence — and its display-string values would have to become map keys, which its own contract documentation forbids.
- *Make the numeric `spareKeys` canonical.* Rejected: a raw count cannot express `ralt-only` (which is a statement about *which plane* has room, not how much), so rule 10's boundary could not be derived from it without re-deriving the plane analysis anyway.
- *Leave the classifier in the utility and inject the key set.* Rejected in the plan's Complexity Tracking: it makes the function single but leaves the data tool-local, so a studio caller supplies its own table and the divergence returns.

## D2 — FR-016's scope: derive A7's definition, do not newly seed A7

**Decision.** FR-016 is satisfied by making A7 a *defined projection* of the canonical determination (documented in [contracts/key-budget.md](contracts/key-budget.md), enforced by the mapping function and its test), and by wiring the canonical determination into the marks station's affordability signal. It does **not** newly seed `spareKeyAvailability` into the live `session.axes`.

**Rationale.** Because A7 has no live producer, seeding it would be a first-time activation, not a preservation. Two things would switch on at once: `MechanismGallery`'s `fullAxes` completeness check would start passing, turning on axis-based pattern ranking for the first time (`filterFor(base, fullAxes)` instead of `filterFor(base, undefined)`); and rule 10 would start appending S-08 to real selections. Neither is in this feature's scope, and both carry a regression surface — the whole gallery ranking path — far wider than the marks station. FR-026 is about the §7.5 table, which supplies A7 explicitly and is therefore untouched either way.

SC-008 ("all reports of key availability agree") still holds, and holds *more* strongly: after this change there is exactly one measurement, read by the marks station and by the facet index, with A7 defined as its projection. There is no live A7 report to disagree with anything.

**Alternatives considered.**
- *Seed A7 live in this feature.* Rejected as scope: it is a strategy-selection and gallery-ranking change wearing a key-budget costume. Recorded as the natural follow-up, and the projection this feature lands is exactly what that follow-up needs.
- *Skip the A7 projection entirely and only fix the marks station.* Rejected: that leaves FR-016 unmet and SC-008 unverifiable — two representations with no stated relationship is the defect, even when one of them is currently dormant.

## D3 — Shape of the replacement answer

**Decision.** Replace `MentalModelAnswer = "own-letter" | "letter-plus-mark"` with a record: per-mark `MarkTreatment` (`"own-key" | "composed"`), a separate `promotedCharacters: string[]`, and one keyboard-level `inputOrder: "prefix" | "postfix"`. Treatment is seeded per mark-class and overridable per mark, exactly as today's class-then-override path works. See [data-model.md](data-model.md).

**Rationale.** FR-003's independence requirement is structural: no single enum can carry two independently-settable facts. Splitting them also removes the misleading vocabulary — the answer names the *mechanism* ("this mark gets its own key") rather than a linguistic claim about unithood, which is the framing error FR-007 forbids. The per-mark override map already exists in `WorklistInputs.markOverrides`, so the class-seeded/mark-overridable shape is preserved rather than invented.

Promotion is a set of **composed characters**, not a set of marks: FR-002 says "which specific composed characters", and the motivating case is two particular composed vowels, not a whole mark's worth of combinations.

**Alternatives considered.**
- *A three-valued enum `own-key | composed | mixed`.* Rejected: `mixed` cannot say *which* characters are promoted, so it defers the real answer to a second question — reproducing the S3 split this feature is retiring.
- *Keep the enum and add a parallel promotion field.* Rejected in Complexity Tracking: the misleading name survives as the primary answer.

## D4 — Dual reachability and the coverage invariant

**Decision.** `buildPlacementWorklist` emits both a mark unit and the promoted composed units when both are chosen. `verifyWorklistCoverage`'s "classified twice" problem is **deleted**; the invariant becomes "every base and every mark is accounted for by **at least one** placement unit, with nothing unclassified" (SC-009), and spec 046's SC-007 is amended to match.

**Rationale.** FR-006 makes dual reachability an intended outcome of FR-003, so the existing assertion does not merely become inconvenient — it becomes false. The spec is explicit that it must be deleted rather than worked around, and the amended wording is the honest invariant: totality (nothing unclassified) is what downstream placement actually needs; uniqueness never was.

`PlacementWorklist`'s **shape does not change** — a promoted composed character occupies the same `ownLetterUnits` slot a composed unit occupies today (the field name is now a misnomer, and is left alone deliberately; renaming it would touch every downstream consumer for no behavioural gain, and the worklist shape's stability is an explicit spec assumption). Drafts therefore load unmigrated (FR-021/SC-010), which the spec's own assumption already establishes on the grounds that station answers are transient and only the derived worklist and output form persist.

**Alternatives considered.** Renaming `ownLetterUnits` → `keyedUnits` for honesty. Rejected: it breaks the worklist-shape-unchanged assumption, touches the reducer, carve's needed-set derivation, and the mechanism gallery, and buys nothing this feature needs. Worth a separate `maint(contracts)` change.

## D5 — Confirming the platform-collapse judgement (owner-flagged)

**Decision.** **Confirmed.** The option set is not platform-forked. One `(treatment, order)` answer plus promotions covers both platforms; touch's "layer then single key" is a placement variant of `own-key`, desktop's "deadkey then letter" is the `prefix` order variant, and deadkey-on-touch is unrepresentable rather than warned.

**Rationale.** The spec asked for this to be confirmed at plan review, and the codebase settles it. There is no touch-only target to fork on: the spine routes every project through both `mechanisms` and `touch`. And the "unrepresentable" claim is already true in the code — the touch scaffolder resolves deadkey patterns into long-press `sk[]` subkey menus, so no answer the author can give produces a deadkey on touch.

This makes acceptance scenario US2/4 ("Given a touch target … the mark-before-letter option is not offered") satisfiable only vacuously today, since no touch-only target exists. The plan therefore reads FR-014's second clause as the load-bearing one and pins it with a derivation test (no `sk[]`-free deadkey reaches a touch layout for any `(treatment, order)` combination), rather than adding a platform selector the product does not have.

**Alternatives considered.**
- *Add a target-platform question so the option set can fork.* Rejected: it adds a screen to a series whose FR-018 forbids gaining one, to serve a distinction the product does not otherwise make.
- *Warn on deadkey-on-touch instead.* Rejected by the spec's own assumption, and it would be a warning about a state the derivation cannot produce.

## D6 — US4 reconciliation: derive A4 from the recorded treatment, with stated precedence

**Decision.** The marks series emits `computedAxes: { diacriticBehavior, markInputOrder }` on its phase result, derived from the recorded treatment. The recorded answer **takes precedence** over a default-filled or prior-derived A4, and that precedence is stated in [specs/007-strategy-selection/spec.md](../007-strategy-selection/spec.md) §7.2 as an amendment (FR-025). Where the two disagree and the competing value was *elicited or base-derived* rather than default-filled, the disagreement is surfaced to the author rather than resolved silently (FR-024).

**Rationale.** `computedAxes` already flows into `session.axes` through `mergePhaseResults`, and `defaultFillAxes` structurally never overwrites an axis already present — so an emitted A4 wins over the prior automatically, without new precedence machinery. That gives FR-024's "derive one from the other" half for free in the common case. The residual case that genuinely needs surfacing is narrow: a base-derived A4 (the only non-prior producer today) contradicting the author's explicit choice. Per the spec's own edge case, a base whose behaviour the author knowingly overrides is a legitimate override and **not** a FR-024 disagreement — only a contradiction between the recorded answer and the *selected strategy* counts. So the check runs after `selectStrategy`, on the selection, not on the raw axis.

A mixed class (per-mark overrides splitting one class) is reconciled by taking the class's dominant treatment for the class-level axis and surfacing the mix, per the spec's edge case.

**Alternatives considered.**
- *Derive the treatment from A4 instead (the other direction).* Rejected: A4 is coarser (four values covering stacking/cycling/multi-family) and cannot express per-mark treatment or promotions, so the derivation would lose information. The author's explicit answer is also the better authority.
- *Detect and surface only, deriving nothing.* Rejected: FR-027 requires a treatment change to be reflected in subsequent selection, which needs the derivation.

## D7 — The §7.5 multi-family gap: restate as open, unchanged

**Decision.** The EuroLatin row (A4 = multi-family, tree picks S-05 via rule 5, actual keyboard uses S-02) is **restated as open with its reason unchanged**, not closed.

**Rationale.** FR-026 and US4/AC4 require each documented gap to be either closed with evidence or restated with its reason intact. That row's reason is that EuroLatin is a massively multilingual keyboard and MML-as-target is out of scope for v1 — reclassified 2026-06-15, kept as a regression fixture for the MML-derivation path. Nothing in this feature changes MML scope, so closing it would require evidence this feature does not produce. Restating it unchanged is the honest outcome, and the row stays in the table as the fixture it is.

The three rows at the intermediate `RAlt only` band (`sil_euro_latin`, `armenian_mnemonic_r`, `russian_mnemonic_r`) are the ones the spec's Dependencies section flags as at risk from a botched projection. D1's bijective mapping keeps them at `"RAlt only"`, so rule 10 stays dormant for all three and their expected primaries and secondaries are unchanged. The §7.5 suite must nonetheless be re-run after P4 and the result recorded, per FR-026.

## Open item carried forward (not blocking)

**Corpus hygiene — duplicated spec `NNN` prefixes.** Nine collisions exist (`010`, `012`, `023`, `030`, `036`, `046`, `047`, `050`, `051`); the `046` collision already caused a real misattribution during this feature's review, and `utilities/spec-trace` keys units by full directory name so the collisions are invisible to it. Out of scope here and recorded as a concern on `.spec-context.json`. This spec mitigates locally by naming both `046` folders explicitly wherever it cites one.
