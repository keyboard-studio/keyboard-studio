# Spec 071 Marks Question Series: as built

**Status:** Retired 2026-09-29. Shipped in PR #1300 (squash `fc2ee650`, 2026-07-22; folder was numbered 046 until the #1644 renumber), with follow-up #1330 (character-map updates). Later touched by #1762 (S4 wording) and #1822 (per-question answer persistence). Tasks: 35/35 complete.
**Full docs:** [specs/_archive/071-marks-question-series/](../_archive/071-marks-question-series/) (spec, plan, tasks, research, contracts, checklists). Not read by default.
**Pinned here:** [data-model.md](data-model.md) (linked by docs/carve-marks-needed-set.md as the definition of the three stores).

## What shipped
- A single spine step `marks` (title "Accents & marks") that runs right after alphabet confirmation and before `carve`; `packages/studio/src/steps/manifest.ts`, component `MarksSeriesStep.tsx`.
- An S0 computed gate inside the step: a marks-free alphabet completes the step with no render and hands over an empty worklist.
- Stations: attachment (per-mark rows over confirmed bases), treatment, output form, stacking, plus a spec-078 context-tolerance station.
- The three stores as contract types, and a `PlacementWorklist` (own-letter units, mark units with input order, blocked combinations) consumed by the mechanism gallery / carve.
- Retirement of the old Phase B mark questions and relocation of the mark-input-order question.

## Public contracts
- `packages/contracts/src/confirmedAlphabet.ts`: `DeclaredRole` ("letter" | "mark"), `AttestedStack` (ordered, closest-to-base first), `ConfirmedAlphabet` (`bases`, `marks`, `attestedStacks`, `declaredRoles`), `AttachmentState`, `MarkUnit`, `BlockedCombination`, `OutputForm`, `PlacementWorklist`, plus `makeConfirmedAlphabet`, `deriveConfirmedInventory`, `validateConfirmedAlphabet`, `stackKey`, `composeStack`, `confirmedAlphabetKey`.
- Engine seams in `packages/engine/src/marks/`: `nfcPostureOfInventory(alphabet): PosturePair[]`, `aggregateInventoryPosture`, `resolveOutputFormProposal(...)` returning `{form, presentedAs: "notice"|"open-choice", explanation}`, `hasDecidablePairs`, `normalizationFormForOutputForm`, `buildPlacementWorklist(inputs)`, `verifyWorklistCoverage`. `decomposeGrapheme` lives in `packages/engine/src/character-discovery/decompose.ts` (returns null for no known decomposition, including PUA).
- Station ids as rendered (`packages/studio/src/survey/marks/marksViews.ts` `MarksStationId`): `marks_attachment`, `marks_treatment`, `marks_output_form`, `marks_stacking`, `marks_context_tolerance`. Container testids: `marks-attachment`, `marks-treatment`, `marks-output-form`, `marks-stacking`, `marks-series`.
- Answers persist per question under keys like `marks_attachment.<mark>|<base>` and `marks_treatment.input_order`.
- `PlacementWorklist` is the optional handoff to the gallery (`session.marksWorklist`); absent means the flat plain-letter flow.
- E2E helper `driveMarksSeries(page)` in `packages/studio/e2e/helpers/surveyFlow.ts`.

## Key decisions
- One custom spine `EditorStep`, not Phase B FlowQuestions: stations interpolate the designer's own glyphs and per-inventory options, which static FlowQuestions cannot express (research R1).
- Three additive stores; `confirmedInventory` is kept and derived from the alphabet so nothing downstream breaks (R2).
- Output-form proposal reuses the house-target-policy decision-table shape: ordered rows, first match wins, authored explanation, mandatory default (R4).
- The nfc-posture function is the derivation named by `content/facets/orth/mark-composition-posture.yaml` (R5).
- Blocked combinations and backspace-unwrap are net-new IR rule generation (R7).
- When the author picks base-plus-mark output over a ready-made-form base, the need is recorded on the session; the reverse nfc-to-nfd transform is deliberately not built (R10).
- Designer-facing S4 text never says "Unicode" or "normalization" (SC-005, asserted in station tests).

## Gotchas and limits
- Order changed after ship: the step sits before `carve` (originally between `carve` and `mechanisms`).
- Spec 052 amended FR-010 to FR-012 and folded mental-model and input-order into the treatment station; spec 078 added the tolerance station. Read the code, not the station table in the archived contract.
- Digraph (two-base) combinations stay under the digraph question (FR-026).

## Divergences from the spec
- Spec/contract list five stations S1-S5 with ids `marks_mental_model` and `marks_input_order` (testids `marks-mental-model`, `marks-input-order`). Code has `marks_treatment` (input order lives at `marks_treatment.input_order`, `MarksSeriesStep.tsx:516`) and a fifth station `marks_context_tolerance`; no `marks_gate` station exists (gate is internal).
- FR-022 (mark-normalization uniformity validator, `KM_LINT_MARK_NORMALIZATION_UNIFORM`, criteria row 18.13) was retired 2026-07-23. It is absent from `packages/engine/src/validator/`; catalog stays without it (mentioned only in criteria-summary.md history).
- Retired ids `pb_accent_marks_gate`, `pb_diacritic_select`, `pb_mark_style`, `pb_capitals_marks`, `pb_stacking_marks` no longer appear in flow or registry code; they remain only as prose in some `content/facets/**` files and `content/journeys/bafut-end-to-end.yaml`, which are stale text.

## Amendment 2026-10-19 — backspace is its own axis (issue #2302)

Directed by Matthew (2026-10-19): "Input order, output composition, and
backspace are all interrelated, yet independent. Consistent options:
Letter+Affix → NFD → Backspace Peel; Affix/deadkey → NFC → Backspace
Stack. However, Keyman can mix and match with extra code."

This continues the archived spec's numbering. It supersedes the reading
under which backspace behaviour was a mere consequence of the FR-013
output-form answer (the framing PR #2298, for issue #2297, left in
place): the behaviour is now a recorded answer in its own right.

- **FR-027**: The system MUST record a whole-keyboard backspace answer
  (`peel` — one mark at a time — or `whole-stack` — the letter and all
  its marks in one press) alongside the output-form answer, as its own
  survey answer (`marks_output_form.backspace`), phase-result field
  (`marksBackspace`), and session field. It is an author answer:
  prefilled by proposal, confirmable, overridable.
- **FR-028**: The backspace proposal MUST follow the chosen output form
  — base-plus-mark proposes `peel`, ready-made proposes `whole-stack`
  (the consistent pairings) — and MUST be presented as a suggestion at
  the output-form station, under its own heading ("What should backspace
  do to an accented letter?", the #1791 wording), with either behaviour
  choosable under either form. Changing the composition answer
  re-proposes the backspace answer (spec 079 evidence semantics).
- **FR-029**: The produced keyboard MUST realise the recorded pairing:
  base-plus-mark + `peel` and ready-made + `whole-stack` are native (no
  generated rules); ready-made + `peel` generates the stepwise unwrap
  (US8's machinery, now gated on the answer rather than firing on the
  form alone); base-plus-mark + `whole-stack` generates whole-stack
  deletion rules — one per reachable attested stack and each emitted
  prefix, longest first, output `nul` — the R7 family this AS-BUILT
  flagged as net-new IR rule generation. Plain base letters are never
  given a backspace rule.
- **FR-030**: The station's backspace preview (FR-017's consequence
  demo) MUST be derived from the recorded backspace answer applied to
  the chosen form's emitted text, never from the form alone. (Before
  this amendment the preview stated ready-made backspace as whole-letter
  clear while the always-on unwrap generation made produced keyboards
  peel — the contradiction the #2302 walk surfaced.)

Behaviour change on landing: an author who takes the defaults now gets
the consistent pairing — under ready-made that means produced keyboards
STOP peeling by default (before this amendment the unwrap fired
unconditionally). Keyboards already generated are unaffected until
regenerated. Completions recorded before the answer existed apply with
the historical default (`peel`).

## Follow-ups and open issues
- Stale references to the retired question ids: content/facets/orth/diacritic-density.yaml, content/facets/orth/mark-composition-posture.yaml, content/facets/source/caps-handling.yaml, content/facets/source/encoding.yaml, content/facets/source/normalization-posture.yaml, content/journeys/bafut-end-to-end.yaml (for km-doc / content team).
- Per-class mental-model grouping heuristics are calibration work; thresholds are named constants.
- Docs linking the folder to repoint at this stub: docs/carve-gallery-flow.md:71, docs/carve-marks-needed-set.md.
