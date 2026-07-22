# Implementation Plan: Mark Composition Model and the Marks Question Series

**Branch**: `046-marks-question-series` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/046-marks-question-series/spec.md`, implementing the design in [docs/design-notes/mark-composition-model.md](../../docs/design-notes/mark-composition-model.md).

## Summary

Split the confirmed alphabet from today's flat NFC `string[]` (`SurveySession.confirmedInventory`) into three canonical stores — base letters, marks, and ordered attested stacks — populated by a character picker that decomposes whole-grapheme picks visibly and asks a role question only for private-use-area characters. Insert a six-station marks question series (S0 gate, S1 attachment, S2 mental model, S3 input order, S4 output form, S5 stacking) between the alphabet-confirmation step and the mechanism gallery, everything prefilled propose-then-confirm; the series emits a typed placement worklist (own-letter units, mark units with input order, blocked combinations) that the mechanism gallery consumes via an optional typed prop, and the whole-keyboard output-form decision is enforced by a new mechanical uniformity check (one new criteria row) so a produced monolingual keyboard is uniformly composed or uniformly decomposed, never mixed. The series retires five existing standalone marks questions and relocates `pb_mark_input_order` as station S3.

Stack is the existing one throughout (TypeScript monorepo; React + Vite studio, engine, zod-mirrored contracts; vitest + Playwright). The one structural addition is a new "cards" surface: stations S1/S2 interpolate the designer's own glyphs and cannot be static `FlowQuestion`s, so the series is hosted as a custom `EditorStep` component (the `CharactersStep` / gallery precedent), with its stations specified as question semantics.

## Project Structure

### Documentation (this feature)

```text
specs/046-marks-question-series/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities
├── contracts/
│   └── marks-series-contract.md   # Station ids, store/worklist types, function seams
└── tasks.md             # (/speckit-tasks output — not created by /plan)
```

### Source code (repository root)

```text
packages/contracts/src/
├── confirmedAlphabet.ts             # NEW: ConfirmedAlphabet, AttestedStack, DeclaredRole,
│                                    #      PlacementWorklist + zod mirrors in schemas.ts
├── surveyPhaseResult.ts             # additive optional fields (alphabet?, marksWorklist?)
├── surveySession.ts                 # additive session fields + merge semantics
└── data/criteria.json               # +1 layer-c-enforce row (uniformity), 148 → 149

packages/engine/src/
├── character-discovery/
│   ├── characterMap.ts              # reuse isCombiningMarkChar / isPrivateUseCodePoint
│   └── decompose.ts                 # NEW: grapheme → base + marks (NFD, order-preserving)
├── marks/                           # NEW subsystem (pure functions)
│   ├── nfc-posture-of-inventory.ts  # the shared per-pair posture table (facet stub's `planned` fn)
│   ├── mark-classes.ts              # attachment-set similarity + function grouping (FR-010)
│   ├── attachment-proposals.ts      # attested / plausible / blocked tri-state (FR-006)
│   ├── mental-model-prefill.ts      # productivity spread + base-mechanism + spare-key budget (FR-011)
│   ├── output-form-policy.ts        # decision table (house-target-policy row shape) (FR-013..016)
│   └── worklist.ts                  # series answers → PlacementWorklist (FR-020)
├── pattern-apply/
│   └── (blocking + stepwise-unwrap rule generation over IR)   # FR-021, backspace recipe
├── strategy-selector/
│   └── import-mark-order.ts         # existing S3 prefill authority (consumed, not changed)
└── validator/
    └── layer-b-uniformity.ts        # NEW: checkNormalizationUniformity(ir) (FR-022)

packages/studio/src/
├── stores/phaseBDraftStore.ts       # split: bases / marks / attestedStacks (+ declared roles)
├── survey/
│   ├── CharacterMapPane.tsx         # visible decomposition on pick; PUA role prompt (US5/US6)
│   ├── PhaseB.tsx                   # three-section inventory (Letters / Marks / Accented letters)
│   ├── CharactersStep.tsx           # commits ConfirmedAlphabet on complete
│   └── marks/                       # NEW: the series step + station cards
│       ├── MarksSeriesStep.tsx      # EditorStep host; S0 gate + station sequencing
│       ├── AttachmentStation.tsx    # S1 card (per-mark rows, auto-confirm summary)
│       ├── MentalModelStation.tsx   # S2 card (per-class radio; MVP: single global)
│       ├── InputOrderStation.tsx    # S3 (relocated pb_mark_input_order content)
│       ├── OutputFormStation.tsx    # S4 (notice or open choice + backspace preview)
│       └── StackingStation.tsx      # S5 (bool + attested-stack confirm)
├── steps/
│   ├── manifest.ts                  # new spine step `marks` between carve and mechanisms
│   └── advance.ts                   # advance policy + expectedSpine update
├── editors/assignLoop/MechanismGallery.tsx   # optional worklist prop (placementMap seam pattern)
└── survey/questions/b/              # retire 5 modules from registry.b.ts + phase_b_characters.modular.yaml

content/
├── facets/orth/mark-composition-posture.yaml # derivation flips planned → implemented
└── flows/phase_b_characters.modular.yaml     # retired ids removed; routing retargeted

packages/studio/e2e/                 # driveMarksSeries helper + walk coverage
```

**Structure Decision**: All engine logic for the series lands as pure functions in a new `packages/engine/src/marks/` subsystem (single-source-of-truth-as-data, per the spec 045 convention), consumed by a new studio `survey/marks/` card surface hosted as one spine `EditorStep` between `carve` and `mechanisms`. Contract additions are additive optional fields only — no locked-type edits.

## Constitution Check

*Gate re-checked after Phase 1 design: PASS (no change — the design introduced no locked-type edits, no second debounce, no host-disk writes).*

| Article | Assessment |
|---|---|
| I. Pattern schema is a locked contract | **PASS** — the `Pattern` interface is untouched. New contract types (`ConfirmedAlphabet`, `PlacementWorklist`) and fields on `SurveyPhaseResult`/`SurveySession` are **additive optional** per the documented contracts convention, each mirrored by a zod schema in the same change (drift guards). No rename/removal, so no major version bump. |
| II. KeyboardIR is the engine spine | **PASS** — blocking-rule and stepwise-unwrap generation, and the uniformity check, all operate on typed `KeyboardIR` (reusing shapes from `nfd-to-nfc.ts` / `import-mark-order.ts`), never raw `.kmn` text. No silent normalization of IR bytes: inventory-layer NFD/NFC handling stays in `character-discovery` (canonical-identity use, explicitly sanctioned by the design note). |
| III. Single persistent working copy | **PASS** — series answers and the worklist are session state on the one working copy; nothing is serialized before output. |
| IV. Validator layering is fixed | **PASS** — `checkNormalizationUniformity` is one new IR-level check following the existing `layer-a-prime.ts` convention (tagged layer "B"), running inside the existing single 300 ms debounce cycle. No second debounce, no parallel validation path. |
| V. VirtualFS only during authoring | **PASS** — no host-disk writes; generated rules land in the working-copy IR / VirtualFS as today. |
| VI. Team boundaries | **PASS** — declared: **Engine team** owns the contracts additions, engine `marks/` subsystem, validator check, gallery seam, and step host; **Content team** owns station prompt wording, the facet YAML derivation flip, and the flow YAML retirement edits. The plan keeps prompt text in data/props so the split is clean. |
| VII. Out of scope for v1 | **PASS** — touch rendering is explicitly out of this feature's scope (the mental-model decision is recorded for the touch act to consume later); no CJK/Ethiopic, LDML, or multi-source merge. The declined `nfc → nfd` migration is **recorded as a consequence, not implemented** (spec assumption; design-note open question 3). |
| VIII. House conventions | **PASS** — no emoji in console output; markdown-link file references in user-facing text; no issue numbers in shipped code; commit style `feat(studio)/feat(engine)/feat(contracts)` per the locked vocabulary. |

No violations → no Complexity Tracking table.

## Phase 0 — Research

See [research.md](research.md). Headline decisions: the series is one new spine `EditorStep` (not more Phase B `FlowQuestion`s); the three stores + worklist are additive contract types; the output-form proposal copies the `house-target-policy.ts` ordered decision-table shape; `nfc-posture-of-inventory` is built as the shared pure function feeding four consumers; the uniformity invariant ships as an IR check plus one new `layer-c-enforce` criteria row (148 → 149, band 66 → 67); blocked combinations are net-new generated rules with swallow behavior as the minimal A6 pull-forward.

## Phase 1 — Design & contracts

See [data-model.md](data-model.md) and [contracts/marks-series-contract.md](contracts/marks-series-contract.md). The contract document pins the station ids (`marks_gate`, `marks_attachment`, `marks_mental_model`, `marks_input_order`, `marks_output_form`, `marks_stacking`), the store names (`bases`, `marks`, `attestedStacks`), the `PlacementWorklist` shape the mechanism gallery codes against, and the retirement list from FR-025.
