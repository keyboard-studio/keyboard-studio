# Implementation Plan: Punctuation defaults and the invisible-character question

**Branch**: `075-punctuation-defaults` | **Date**: 2026-09-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from [spec.md](spec.md); code-level findings in
[research.md](research.md) (Part I written with the spec, Part II re-verified at plan
time); entities in [data-model.md](data-model.md); the adopted surface in
[contracts/punctuation-defaults-contract.md](contracts/punctuation-defaults-contract.md).

## Summary

The "Choose your punctuation" step already fetches the locale's CLDR/SLDR punctuation
tier and already draws proposed-versus-chosen attribution, but starts the author from an
empty list. This feature seeds that list on first arrival through the draft store's
existing `addProposed` path, adds a second proposed group for punctuation the base
keyboard already produces (falling back to a fixed basic-ASCII floor only when opaque
fragments make base output unknowable), and promotes the lossy "add by code point"
route for format characters into a new always-rendering spine step, `invisibles`,
placed between `punctuation` and `convenience`. The rejection ledger Story 4 asks for
already exists in the draft store (spec 044 FR-017, `rejected[]`); what is missing is
that the draft-restore path drops it on reload, and that gets fixed.

No new dependency, no contracts-package change, no new persistence mechanism. Base
coverage and the proposal builder are pure engine helpers beside `convenienceChars.ts`;
everything user-facing is React in `packages/studio`, on the same zustand stores, Lingui
catalogs, vitest and Playwright conventions the punctuation and convenience steps use.

## Constitution Check

*GATE: checked before Phase 0 research; re-checked after Phase 1 design (see the
post-design section at the end).*

| Article | Assessment | Evidence |
|---|---|---|
| I. Pattern schema is a locked contract | PASS | No `Pattern` field, no zod schema, no `packages/contracts` type changes. The only type widened is the studio-internal `DraftProvenance` union in `phaseBDraftStore.ts` (gains `"base"` and `"ascii-floor"`). |
| II. KeyboardIR is the engine spine | PASS | Base punctuation coverage is read from the working copy's `KeyboardIR` via `producedGlyphs`; opaque `RawKmnFragment` nodes flip `coverageComplete` to false and the step says so (FR-008) instead of guessing. Nothing parses raw `.kmn`. |
| III. Single persistent working copy | PASS | The steps read `useWorkingCopyStore((s) => s.ir)` exactly as `ConvenienceCharsStep` does. Confirmed inventories are survey results (`recordPhase`), not a second copy. |
| IV. Validator layering / one 300 ms cycle | PASS | No diagnostics produced, no timer added. The existing 500 ms autosave and 20 s cloud-sync debounces are untouched and are outside D3's scope. |
| V. VirtualFS only during authoring | PASS | No host-disk writes. Draft persistence stays in the existing localStorage envelope; this plan only forwards fields that envelope already saves. |
| VI. Team boundaries | PASS, mixed ownership declared | **Engine team** owns every code change (studio steps, stores, engine helpers, tests, e2e). **Content team** owns three text artefacts and reviews them: the per-character "you need this if…" statements, the retirement of the two RTL direction-mark question modules, and the FR-012 family-default statement. Dispatch: km-frontend/km-programmer build; km-domain reviews the need statements and RTL subsumption; km-doc lands the spec mirror. |
| VII. Out of scope for v1 | PASS | No LDML, no touch placement, no carve rule change (carve's always-keep for `\p{N}\p{P}\p{S}` stays; the disagreement with a declined base character is surfaced, not resolved). |
| VIII. House conventions | PASS | Commit titles `feat(studio): …` / `fix(studio): …`; no issue numbers in code; `[OK]`/`[WARN]` in any console output. |
| IX. No survey surface outside the manifest | PASS | The invisibles step is a manifest `editor-step` with `inputs: []`, `writes: []` (spec 066 FR-006 explicit-empty rule; convenience/punctuation precedent). It writes no IR path, so the mutate seam is not bypassed. Its manifest entry is the FR-020 deliverable. |

No violations, so there is no Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/075-punctuation-defaults/
├── spec.md                                   # feature spec (clarified 2026-09-15)
├── plan.md                                   # this file
├── research.md                               # Part I code findings + Part II plan decisions
├── data-model.md                             # entities, mapped onto the existing draft store
├── contracts/punctuation-defaults-contract.md  # adopted identifiers and invariants
└── tasks.md                                  # produced by /speckit-tasks, not here
```

### Source code (files this feature touches)

```text
packages/engine/src/
├── character-discovery/
│   ├── punctuationProposal.ts        # NEW: ASCII_PUNCTUATION_FLOOR, basePunctuationCoverage(), buildPunctuationProposal()
│   ├── punctuationProposal.test.ts   # NEW: colocated, per-tag SC-001 oracle over the offline index
│   └── convenienceChars.ts           # header comment: "punctuation needs no question" premise retired
├── inventory/computeInventoryDelta.ts  # export hasUnaccountedOpaqueFragment (currently private)
└── index.ts                            # barrel exports; retire the "computeInventoryDelta is unwired" note

packages/studio/src/
├── survey/
│   ├── punctuation/PunctuationStep.tsx        # seed on arrival; base group; Cf hand-off; missing-side count
│   ├── punctuation/PunctuationStep.test.tsx   # FR-024 phase-C pin, seeding, base/floor, hand-off, SC-003
│   ├── invisibles/InvisiblesStep.tsx          # NEW spine step (always renders)
│   ├── invisibles/InvisiblesStep.test.tsx     # NEW
│   ├── invisibles/invisibleCandidates.ts      # NEW: pure candidate list (fixed five + bidi allowlist + carried-over Cf)
│   ├── invisibles/invisibleCandidates.test.ts # NEW: SC-005 completeness assertion
│   ├── phaseCInventory.ts                     # NEW: phaseCConfirmedInventory() shared by both phase-C inventory emitters
│   ├── CharacterMapPane.tsx                   # punctuation-scope code-point entry hands Cf to the invisibles decision
│   ├── surveyWriteObservability.test.tsx      # NEW: SC-004 / SC-009 — every Cf through every input, one of three outcomes
│   ├── journey-runner.ts                      # replay case for "invisibles"
│   └── questions/b/
│       ├── pb_rtl_short_vowels.ts             # next → pb_rtl_special_letters (skip the retired pair)
│       ├── pb_rtl_direction_marks.ts          # DELETED (subsumed, FR-019)
│       ├── pb_rtl_direction_marks_detail.ts   # DELETED (subsumed, FR-019)
│       └── ../registry.b.ts, ../registry.test.ts  # two fewer entries; count 114 → 112
├── stores/
│   ├── phaseBDraftStore.ts        # DraftProvenance += "base" | "ascii-floor"; seededProposals; invisibleDecisions; seedProposals(); acceptInvisible()/declineInvisible(); snapshot fields
│   ├── phaseBDraftStore.test.ts
│   └── surveySessionStore.ts      # ActiveStepId += "invisibles"
├── steps/
│   ├── manifest.ts                # entry between punctuation and convenience; expectedSpine; header prose
│   ├── manifest.specref.json      # regenerated by pnpm test
│   ├── advance.ts / phases.ts     # id unions, advance() case, phase-C stepIds
│   └── *.test.ts                  # spine-order pins updated
├── lib/
│   ├── draftPersistence.ts        # restore forwards rejected/provenance/proposalConfidence/exemplarMethodDeclined/declaredRoles + new fields
│   └── irToCarveNodes.ts          # INVISIBLE_CHAR_LABELS += U+2060 WORD JOINER; isAlwaysKeepCategory docstring cross-ref
├── decisions/progressDots.ts, decisions/DecisionTrailView.tsx   # stage labels for the new step
├── StudioShell.tsx                # stale spine-order comment
└── locales/{en,fr}/messages.json  # regenerated by messages:extract

packages/studio/e2e/
├── helpers/surveyFlow.ts          # driveInvisiblesStep(); called from buildOneCharacterList
├── copy-edit.spec.ts              # back-walk heading chain gains the new step
└── light-theme-a11y.spec.ts       # drive + axe assertion for the new step

packages/studio/tests/steps/       # renderSmoke stub map, goldenWalk StepAction + both __fixtures__/goldenWalk/*.json
content/i18n/{en,fr}/flowQuestions.json   # re-extracted after the RTL pair is retired
docs/spec-trace.json               # gains specs/075-punctuation-defaults (node utilities/spec-trace seed) — must land before the manifest specRef test passes
docs/journey-coverage.json         # regenerated (totalSteps 14 → 15)
```

**Structure Decision**: the pure computations (floor, base coverage, proposal builder)
live in `@keyboard-studio/engine` beside `convenienceChars.ts`, the letters-family
precedent, and are reached through the root barrel — there is no `./character-discovery`
subpath export and the plan does not add one. Everything stateful or rendered lives in
`packages/studio` on the existing three-store model. Nothing lands in
`packages/contracts`, which carries shapes only and may not import other workspace
packages.

## Design

### Story 1 — CLDR punctuation arrives already chosen

- **Seeding** is a new store action `seedProposals(chars, source, seedKey)` on
  `phaseBDraftStore`: it no-ops when `seedKey` is already in the sticky
  `seededProposals[]`, otherwise runs each character through the existing
  `addWithProvenance` (which already honours `rejected[]` and never downgrades an
  `"author"` entry — FR-005, FR-022) and records the key. The punctuation step calls it
  once per resolved locale with `seedKey = "punctuation:" + inventory.resolvedTag` in an
  effect that fires when `useSourcedExemplars` settles with a non-null inventory.
- **FR-023 guard**: the effect does not seed when the working copy already holds a
  phase-C result carrying `confirmedInventory` — that is the "author completed this step
  before the feature shipped" signal — and instead records the seed key so the guard is
  not re-evaluated on every visit.
- **Attribution** reuses the dashed proposed chip exactly as today (`provenance[c] !==
  "author"`); the group caption names the source (`inventory.source`, "CLDR" or "SLDR")
  and the resolved locale's display name, which the step already renders.
- **Edge cases**: `inventory === null` after loading → the CLDR group is shown as absent
  with the reason "no exemplar data for this language" (the hook's own P2 contract);
  `inventory !== null` with an empty punctuation tier → "this locale attests no
  punctuation", a distinct message. There is no third state in the return type (research
  Part II).

### Story 2 — Base-keyboard punctuation is declared, not assumed

- **Engine helpers** (new `punctuationProposal.ts`, pure, browser-safe):
  `ASCII_PUNCTUATION_FLOOR` (the 32 characters U+0021–U+002F, U+003A–U+0040,
  U+005B–U+0060, U+007B–U+007E, frozen), `basePunctuationCoverage(ir)` (=
  `producedGlyphs(ir)` filtered to `glyphCategory === "punctuation"`, with
  `coverageComplete = !hasUnaccountedOpaqueFragment(ir)` — the same derivation
  `computeInventoryDelta` uses, so that private predicate is exported rather than
  duplicated), and `buildPunctuationProposal(input)` which returns the two disjoint
  groups plus `cldrAbsentReason` and `baseCoverageIncomplete`.
- **Floor rule** is one-way and lives in the builder: `baseCoverage === null` or
  `coverageComplete === false` → the base group is the floor minus rejections and
  author-chosen characters, and the caption states that the base set is not fully known
  (FR-007, FR-008). Otherwise the base group is every produced punctuation character
  (FR-009) and the floor plays no part.
- **Provenance in the store** stays single-valued (`DraftProvenance` gains `"base"` and
  `"ascii-floor"`); a character in both groups is seeded once, under the CLDR source, and
  the component derives "also produced by the base" at render time from the proposal
  groups. The union is therefore never counted twice (SC-003) and the spec-044 provenance
  tests keep their shape.
- **FR-011**: the step calls `computeInventoryDelta(chosen, ir)` over the chosen
  punctuation and shows the missing-side count ("N of these are not on the base keyboard
  and will need placing") before Done. This is the first production caller of that
  function; the engine barrel's "intentionally unwired" note is retired in the same
  change.
- **Always-keep disagreement** (edge case): the base group's caption carries one line
  stating that removing a character here declares it unsupported but the base layout
  still types it until carve's punctuation rule changes, which is out of scope. The
  disagreement is surfaced, not silently resolved; a plan concern records it.

### Story 3 — Invisible characters get a named question

- **Step**: `InvisiblesStep` is a manifest `editor-step`, `id: "invisibles"`, `spine:
  true`, `inputs: []`, `writes: []`, `specRef: ["specs/075-punctuation-defaults"]`,
  default right pane (the character map cannot show these characters, so no scoped map).
  It always renders; when no candidate is relevant it still shows the offer list with
  none selected and says why (FR-020). No computed gate, no `null` return.
- **Candidates** (`invisibleCandidates.ts`, studio): the fixed five (U+200D, U+200C,
  U+200B, U+00AD, U+2060), plus the bidi allowlist (`isBidiControlCodePoint`) when the
  author's Phase B branch answer is right-to-left, plus any `\p{Cf}` character already in
  the draft's `controls` bucket so nothing an author entered is ever dropped. Names come
  from `invisibleCharLabel()` extended with U+2060 (FR-015); need statements are
  `<Trans id="survey.invisibles.need.uXXXX">` entries in the component; SC-005 is a test
  asserting every candidate has a non-empty label and a need statement.
- **Decisions** live in a new sticky store field `invisibleDecisions: Record<string,
  "accepted" | "declined">` keyed by `U+XXXX` notation (matching
  `directionControlChars`), cleared only by `resetPhaseBDraftDecisions()`, snapshotted
  and restored with the draft. Accepted characters are **not** pushed into `chars`, so
  they never reach the unrendered `controls` bucket (FR-014).
- **Result**: `{ phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() }`
  where the helper returns the NFC-deduped union of the draft's `punctuation` slice and
  the accepted invisibles. The punctuation step emits the same helper's output, so
  whichever of the two steps completes last, the phase-C `confirmedInventory` is the full
  union and the shallow same-phase merge clobbers nothing (FR-024 preserved and pinned
  by test). `answers` carries one `boolean` entry per offered candidate
  (`questionId: "invisibles.u200c"` etc.), so the spec-053 decision record captures
  declined offers distinguishably from unasked ones (FR-018);
  `routeAnswersThroughMutate` ignores ids with no registry module, so this is inert
  for the IR.
- **Hand-off from the punctuation page** (FR-016, FR-021): both the type-in box and the
  punctuation-scope code-point field test each harvested character with `/^\p{Cf}$/u`;
  a match calls `acceptInvisible(notation)` (pre-selected on the next step) and the page
  shows a `role="status"` note naming the invisibles step. No forced navigation. A
  multi-codepoint cluster containing a format character is neither split nor filed as
  punctuation: it is declined with a stated reason. The alphabet scope is unchanged
  (out of scope); its Cf entries are adopted by carry-over.
- **Carry-over** (FR-017): on first render the step migrates every `\p{Cf}` character
  found in the draft's `controls` bucket into `invisibleDecisions` as `"accepted"` and
  removes it from `chars`, so it is offered once, pre-selected, and appears in one
  answer rather than two.
- **RTL subsumption** (FR-019): `pb_rtl_direction_marks` and
  `pb_rtl_direction_marks_detail` are removed from the Phase B modular flow;
  `pb_rtl_short_vowels.next` is rewired to `pb_rtl_special_letters`; the registry count
  test drops to 112; Tier B catalogs are re-extracted; the Phase B flow-edge snapshot is
  regenerated. Nothing in the studio consumed the detail answer.

### Story 4 — A rejection sticks

- **Already built**: `remove()` records a proposal's NFC key in `rejected[]`,
  `addWithProvenance` vetoes re-proposing it, typing it by hand records `"author"` and
  clears the veto, and `reset()` deliberately leaves it in place. Seeding through the
  same helper inherits all of that, for revisits and for locale re-resolution alike.
- **The gap**: `applyEnvelopeToStores` in `draftPersistence.ts` rebuilds the draft with
  only `chars`, `exemplarDigraphs` and `selectedFont`, so `applyPhaseBDraftSnapshot`'s
  defaults wipe `rejected`, `provenance`, `proposalConfidence`,
  `exemplarMethodDeclined` and `declaredRoles` on reload even though `saveDraft` stores
  them. Forwarding those fields (plus the new `seededProposals` and
  `invisibleDecisions`) is a pre-existing spec-044 defect fixed on this branch as its
  **own commit**, per the out-of-scope-unblocker rule.
- **Unbounded growth** (edge case): the ledger is a keyed set of NFC strings; entries
  for characters no source proposes are inert and cost bytes only. No pruning is added;
  the size is bounded by the number of distinct characters an author has ever removed.

### Cross-cutting

- **FR-012 family defaults, stated**: (1) punctuation the base produces — proposed for
  acceptance with attribution, removable, this feature; (2) letters and marks the base
  produces beyond the orthography — proposed for removal by the convenience question,
  unchanged; (3) base ASCII letters on a non-Latin target — optional low-priority
  removal group, unchanged; (4) ASCII punctuation arriving by that same fall-through —
  treated as (1), not demoted, because the engine's own always-keep rationale holds
  that punctuation is wanted on essentially every keyboard; (5) digits and symbols —
  still shielded silently, explicitly out of scope. A docs task mirrors this list into
  the spec's Assumptions.
- **SC-009 / SC-004 harness**: a studio test drives each of ZWJ, ZWNJ, ZWSP, SOFT
  HYPHEN, WORD JOINER and every allowlisted bidi control through the punctuation type-in
  box and the punctuation-scope code-point field, and through the invisibles step's own
  selection, asserting each ends accepted, routed, or declined with a visible reason.
  The always-rendering step plus the plain (non-racing) e2e driver closes the second
  half: a step that stopped rendering now stalls the walk instead of passing.
- **SC-008 measurement**: a report-only vitest over `content/journeys/*.yaml` writes
  the empty-punctuation-inventory rate; the threshold is set after the first run, as
  the spec requires.

## Phase 0 — Research

Complete. Decisions D-01 to D-15 with rationale and rejected alternatives are in
[research.md](research.md) Part II, together with the plan-time re-verification of the
Part I citations (three corrections: `RawCodepointEntry` path, `SourcedInventory`
naming, and the existence of `rejected[]`).

## Phase 1 — Design & contracts

Complete. [data-model.md](data-model.md) maps every spec entity onto an existing or
new store field; [contracts/punctuation-defaults-contract.md](contracts/punctuation-defaults-contract.md)
fixes the identifiers tests and tasks code against.

## Post-design Constitution re-check

Unchanged from the gate above. The one design choice that could have crossed a line
— where `ProposalProvenance` lives — was resolved *away* from `packages/contracts`
(Article I stays untouched; contracts cannot depend on the engine anyway). The
invisibles step declares empty IR declarations and routes nothing through `mutate()`,
so Article IX is satisfied by the manifest entry alone.

## Concerns carried into tasks

- Carve still emits base punctuation an author declined (edge case "interaction with
  the always-keep carve rule"). Surfaced in the base group's caption; a carve-side fix
  is a separate feature.
- `docs/spec-trace.json` has no `specs/075-punctuation-defaults` key yet; the manifest
  `specRef` test fails until `node utilities/spec-trace seed` runs and the file is
  committed. This must be the first task in the invisibles phase.
- The goldenWalk fixtures and the `copy-edit.spec.ts` back-walk heading chain encode the
  exact spine sequence; both need regenerating when the step is inserted.
- Right-to-left detection for the bidi candidates reads the author's Phase B branch
  answer; when unanswered, the bidi group is offered collapsed with a "usually only for
  right-to-left scripts" note rather than hidden.

## Gates before each phase commit

```
pnpm typecheck
pnpm --filter @keyboard-studio/engine test
pnpm --filter @keyboard-studio/studio test
pnpm --filter @keyboard-studio/studio messages:extract && pnpm run i18n-catalog-sort
npx tsx utilities/i18n-content-extract/cli.ts      # only when questions/b changes
pnpm lint
```
