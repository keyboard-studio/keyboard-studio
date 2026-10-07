# Implementation Plan: Live extraction from the starting point (specs/092-live-extraction)

**Branch**: `km/live-extraction` (stacked off `km/derived-steps`) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/092-live-extraction/spec.md`; series plan in
[088 HANDOFF.md](../088-modular-decisions/HANDOFF.md) (G2, G7 and "Extraction runs live");
predecessor plans 088 (decision store), 089 (`apply`), 090 (gallery modules), 091 (derived steps).

## Summary

`extract()` exists on five modules but never runs in the live app; every live pre-fill is
step-specific seeding code, and the working copy is set up before the track is known. This spec
runs extraction **once, after setup**, in the live wizard: a thin live runner over the existing
primitives (`orderByDependencies`, per-module `extract` + `validate`, `buildExtractContext`)
merges extracted values and lookup defaults into the 088 `decisionStore` — seeding unanswered
decisions with their source named, and placing the extracted value beside (`offered`) an answer
the author already gave, never over it. The five step-specific seeders named in FR-002 become
`extract`s or lookup defaults of the same record shape and are deleted as write paths. Setup
itself becomes the `apply` of a decision that `requires: ["base-keyboard", "authoring-track"]`,
so the track is known when the working copy is instantiated (fixing the HANDOFF G7 hazard), and
the starting-point decision-log entry is recorded at the same post-setup point, where its
inputs exist by construction. The spec contains the series' acceptance test (US1): add
`requires: ["authoring-track"]` to `il_copyright_holder` and change nothing else — on the adapt
track the question then appears after the track choice, pre-filled from the keyboard's own
copyright and labelled "from <keyboard>"; on the copy track it defaults to the author. That
test is verified by a Playwright walk of **both** tracks in `pnpm dev`, never in the demo.

**Owner's words, carried verbatim (HANDOFF.md):**

> "Values from the starting point become defaults the author knowingly confirms, changes or
> overturns. They are never applied silently."

> "Run this test in the **live wizard**, not the demo."

**Settled principles this plan does not reopen:** extracted values are never applied silently;
every answer is saved the moment it is given; old drafts migrate automatically with unmapped
answers shown, never dropped (087 Q5 precedent, owned by 088 for this series). No owner ruling
specific to 092 was outstanding at plan time; the series' open owner questions sit in 090
(carve per-item provenance shape) and 093 (starting-point change semantics, perf budgets) and
neither blocks this spec.

## Technical Context

**Language/Version**: TypeScript (repo stack), Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: React + Zustand stores (existing); the 087 decision machinery
(`decisions/orderDecisions.ts`, `decisions/extractContext.ts`, `decisions/decisionFlow.ts`
semantics); Playwright `^1.61.1` for the live walks. No new dependency.

**Storage**: `decisionStore` (088) is the only store seeded. Drafts keep 088's v2 `decisions`
slice; this spec changes no draft shape and no `DRAFT_VERSION`.

**Testing**: Vitest via the studio package's own config (never bare `vitest` at the root);
Playwright e2e in `packages/studio/e2e/` against `pnpm dev`; store-level tests through the
real `StepHost`. The 089 golden walk is the byte-identical regression gate.

**Target Platform**: the studio SPA (browser), live wizard only — `DecisionsDemo` is not a
verification surface for this spec.

**Performance Goals**: none set by the spec. The extraction pass is one synchronous pass over
the registry inside the setup commit; it adds no timer and no per-step cost. (093 owns perf
budgets for replay; not this spec.)

**Constraints**: no `packages/contracts` change; no new timer (D3 untouched — the pass runs
inside the setup commit, not in the validation cycle); no i18n message id changes (a genuinely
new source-label string takes a new id under the existing survey provenance pattern; moving or
re-sourcing a question never renames its id); Pattern schema untouched; the acceptance test
permits exactly one declaration edit (FR-005) — any second edit it seems to need is a series
failure to report, not to quietly make.

**Scale/Scope**: one live runner; five converted seeders (FR-002 inventory, verified in
research.md R3); one setup decision; one module declaration change; both renderer kinds gain
record-driven source labels. Engine package: no changes expected — extraction reads the IR
through the existing codec-built bundle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Assessment |
|---|---|
| I — Pattern schema locked | PASS — no Pattern field, type, or `{{slotId}}` syntax is touched; nothing in `packages/contracts` changes (the `DecisionProposalSource` vocabulary the seeds already use is consumed as-is). |
| II — KeyboardIR is the engine spine | PASS — extraction reads the parsed `KeyboardIR` + catalog bundle (`buildExtractContext`); no raw `.kmn` handling; opaque `RawKmnFragment` content is never survey-edited or silently dropped — an extractor that cannot read a value returns absent and the question is asked. |
| III — Single persistent working copy | PASS — setup still instantiates exactly one working copy (`instantiateFromBase` / `instantiateFromExisting`); it becomes an `apply` so it runs once with the track known, instead of twice (new-from-base, then adapt). No second copy, no intermediate serialization. |
| IV — Validator layering fixed | PASS — no new debounce timer, no parallel validation path. The extraction pass is synchronous inside the setup commit, outside the 300 ms D3 cycle; extracted values pass each module's own `validate()` (a question-level check, not a new validation layer). |
| V — VirtualFS only during authoring | PASS — no host-disk writes; the pass reads the in-memory bundle and writes decision records. |
| VI — Team boundaries | PASS — Engine team owns the runner, the setup decision, and the module `extract` conversions. Content boundary respected: question wording and help copy are unchanged; seed *values* that Content owns (Phase F proposals in `lib/phaseFSeeds.ts`) keep their derivation logic and only change their delivery path. |
| VII — Out of scope for v1 | PASS — none of the excluded items is implemented; no CJK/Ethiopic, LDML, multi-source merge, or opaque-fragment editing. |
| VIII — House conventions | PASS — commit titles use the locked `<prefix>(<area>)` vocabulary; no issue numbers in shipped code/comments; no emoji in console output; file references in user-facing text use markdown links. |
| IX — No survey surface outside the decision registry | PASS, and this spec is an Article IX completion step: the last step-specific seeders (survey surfaces whose values were computed outside the registry's modules) are folded into module `extract`s / lookup defaults, and placement of the acceptance question follows from its declared `requires` under 091's derived steps. The registry declaration for the one changed module (FR-005) and for the setup decision (FR-004) is a functional requirement of the spec itself. |

No violations; no Complexity Tracking table needed.

**Post-design re-check**: Phase 1 design (research.md, data-model.md, contracts/) introduces
no new store, no new timer, no contracts change, and no surface outside the registry — the
check above stands unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/092-live-extraction/
├── spec.md                  # Feature specification (already written)
├── plan.md                  # This file (/speckit-plan)
├── research.md              # Phase 0 output — verified seeder inventory, hazard localisation
├── data-model.md            # Phase 1 output — records the pass writes, merge rules
├── quickstart.md            # Phase 1 output — live-walk validation scenarios
├── contracts/
│   └── live-extraction.md   # The extraction pass + setup decision + label contracts
└── tasks.md                 # Phase 2 output (/speckit-tasks — not part of plan)
```

### Source Code (repository root)

```text
packages/studio/src/decisions/
├── liveExtraction.ts        # NEW: the live extraction pass (merge into decisionStore)
├── liveExtraction.test.ts   # NEW: merge-rule unit tests (seed / offered / validate-reject)
├── extractContext.ts        # unchanged — buildExtractContext supplies the bundle
├── decisionFlow.ts          # unchanged semantics; the demo runner stays demo-facing
└── recordBaseContribution.ts# unchanged function; its call site moves post-setup

packages/studio/src/survey/questions/a/
└── il_copyright_holder.ts   # FR-005: requires gains "authoring-track" (the one-line edit)

packages/studio/src/survey/
├── IdentityLite.tsx         # seed refs (langtags/profile) become lookup defaults; seed write path deleted
├── Prefill.tsx              # renders rows from decision records; computed prefill values move to module extracts
├── CharactersStep.tsx       # confirmPrefill write path deleted; alphabet proposal = pb_character_inventory extract
└── SurveyRunner.tsx         # seed props fed from decision records (default renderer labels, FR-003)

packages/studio/src/survey/questions/b/
└── pb_character_inventory.ts# its existing extract becomes live via the pass

packages/studio/src/editors/adapters/
└── flowStepOptions.tsx      # PHASE_F_SEEDS table deleted; entries become pf_* module extracts/defaults

packages/studio/src/editors/carve/
└── CarveGalleryV2.tsx       # prefillCarveDispositions effect deleted; dispositions arrive as decision value (090)

packages/studio/src/stores/
└── workingCopyStore.ts      # prefillCarveDispositions action deleted; instantiation invoked by setup apply

packages/studio/src/
├── StudioShell.tsx          # doCommit mode re-derivation deleted; setup runs via the decision runner
└── components/StepHost.tsx  # completion path: setup apply → extraction pass → recordBaseContribution

packages/studio/e2e/
├── live-extraction-acceptance.spec.ts  # NEW: US1 both-tracks walk + US3/US4 assertions + SC-002 count
└── golden-walk.spec.ts                 # 089's walk, reused unchanged as the regression gate
```

**Structure Decision:** the live runner lives in `decisions/` beside the machinery it reuses —
the same home 087 chose for the decision unit — as a new file, not an extension of
`decisionFlow.ts`: that runner's whole-flow pure-pass semantics (extract → answer → default in
one return value) are demo-shaped, and bending them into a store merge would blur both. The
per-module semantics (order, validate-rejects-are-absent, source naming) are shared by
construction and pinned by tests on both sides (research R1/OQ-3). Everything else is a
conversion at an existing site: seeders become module declarations where their modules already
live, and the two deletions in `StudioShell.tsx` / `StepHost.tsx` rewire setup and recording
into the runner's post-setup point. No new directories; no engine changes.

## Complexity Tracking

No Constitution Check violations — table not required.
