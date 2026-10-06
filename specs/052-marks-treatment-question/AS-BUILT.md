# Spec 052 Marks treatment question: as built

**Status:** Retired 2026-09-29. Shipped in PR #1440 (squash `897831ed`, 2026-07-30). Tasks: 43/43 complete.
**Full docs:** [specs/_archive/052-marks-treatment-question/](../_archive/052-marks-treatment-question/) (spec, plan, tasks, research D1-D7, data-model, contracts/{mark-treatment-answer,key-budget,station-ui}.md, checklists). Not read by default.
**Pinned here:** none

## What shipped
- One marks-series station records three independent things: per-mark treatment (`own-key` or `composed`), which composed characters are promoted to dedicated keys, and one keyboard-wide input order. The retired S3 order station was folded in.
- Every option set is prefilled (never unanswered), with interactive demos built from the author's own letters and marks.
- Promotion is offered only when the key budget can seat it; otherwise the group is present, disabled, with a plain reason.
- One canonical key-budget measurement, relocated to contracts, now backs the station, the worklist and axis A7.
- The old `MentalModelAnswer = "own-letter" | "letter-plus-mark"` is replaced, not deprecated (contract change ratified 2026-07-29, logged in docs/spec-signoff.md).

## Public contracts
- `packages/engine/src/marks/treatment.ts`: `MarkTreatment = "own-key"|"composed"`, `PromotedComposedCharacter = string` (NFC), `MarkTreatmentAnswer { classTreatment, markTreatment (overrides only), promoted, inputOrder }`, `BaseMarkMechanism = "combining-keystroke"|"precomposed"`, `MarkTreatmentPrefill`, plus `makeMarkTreatmentAnswer`, `treatmentFor(mark, answer, classes, prefills)`, `pruneMarkOverrides`, `dominantTreatment`, `isClassMixed`.
- `packages/engine/src/marks/promotion.ts`: `promotableCharacters(alphabet, markClass, attachments, bcp47?)`, `expandCaseCounterpartPromotions(alphabet, promoted, bcp47?)` (re-exported in `engine/src/index.ts`).
- `packages/contracts/src/keyBudget.ts`: `KeyBudgetBand = "many"|"ralt-only"|"fully-booked"`, `KeyBudget`, `measureKeyBudget(ir): KeyBudget | null` (null when no stock key is bound), `keyBudgetToSpareKeyAvailability(band)`, `DEFAULT_BASELAYOUT`, `STOCK_BASE_LAYOUTS`. Bands: SHIFT plane under half bound = many; SHIFT half+ but AltGr not = ralt-only; else fully-booked.
- Station handles (studio): `marks-treatment`, `treatment-<classId>`, `treatment-option-<classId>-<value>`, `promotion-<classId>[-<char>]`, `promotion-unavailable-reason-<classId>`, `input-order`, `demo-*`. Promotion is a checkbox set (independent of treatment); options are `role="radiogroup"`; the pending demo state is `role="status"`.
- The phase result carries `computedAxes { diacriticBehavior, markInputOrder }`; the recorded answer takes precedence over the survey's earlier A4 guess (D6).

## Key decisions
- Promote the facet-index key-budget measurement to contracts as the only authority; no consumer computes its own (D1). A7 is a defined projection, not newly seeded (D2).
- Answer is a record, not an enum; treatment and promotion are independent so a mark can be reachable both ways, and `buildPlacementWorklist` emits both units (the old "classified twice" coverage problem was deleted) (D3/D4).
- Option set is not platform-forked; touch differs only in placement (D5).
- The EuroLatin `multi-family` gap (tree picks S-05, real keyboard uses S-02) stays open, reason unchanged (D7).

## Gotchas and limits
- "Absent" (nothing to promote) and "unavailable" (budget cannot seat) are different DOM states.
- Promotion is offered on lowercase and caseless bases only; uppercase is derived additively.
- Demos never mutate the working copy or emit diagnostics, and never autoplay.

## Divergences from the spec
None found (types, exports and function names spot-checked at origin/main).

## Follow-ups and open issues
- Number-collision hygiene item was carried forward and resolved in PR #1644.
- Citations to fix: `docs/design-notes/mark-composition-model.md:266` links `../../specs/052.../spec.md`; `packages/contracts/src/keyBudget.ts:42` links `contracts/key-budget.md`; comments in `engine/src/index.ts:475`, `studio/src/steps/manifest.ts:146` and `manifest.specref.json` cite the folder (stub resolves).
