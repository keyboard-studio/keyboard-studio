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

## Implementation audit (T001, 092 agent — against cascaded base `81e79756`)

Base verified: merge of `km/derived-steps` @ `54fe4883` (088 close + 089 through
T024 + its depcruise fix pending restack, see G-6; 090 US1+US2) into
`km/live-extraction`. Present exactly as planned: 088 `stores/decisionStore.ts`
(`record/recordAll/forget/set/snapshot/peek`, `selectTrack`/`selectTouchSeedSource`);
the `Decision` record with `inputs`/`offered`/`source`; 089's `applyDecisionEffects`
runner + `galleryHost` record-then-apply; `runDecisionFlow` semantics (order,
gating, extract→validate, source = catalog id → IR-header fallback, throwing
extract names its module) with **no live caller** (non-test callers are
`DecisionsDemo` ×2 and `spikeRunner` only — T002 grep snapshot);
`buildExtractContext(baseIr, baseKeyboard)` against `workingCopyStore`'s
`baseIr`/`baseKeyboard` slots; `il_copyright_holder` exactly as research R5
(`requires: ["author-name"]`, `extractCopyrightHolder`, no `validate`);
`questionRegistry`/`decisionIndex` composition (flow + Phase F + reserve +
gallery).

**Predecessor gaps and plan deltas (recorded, not silently adapted):**

- **G-1 (091 in flight):** `steps/stepDependencies.ts` is still present and
  steps are not yet derived. Does not block the pass (it orders by module
  `requires` via `orderDecisions`); T001's "091 landed" item is unmet and the
  acceptance walk's placement assertions ride on 091 + CI.
- **G-2 (090 US3/US4 in flight):** gallery modules for `carved-layout`,
  `touch-layout`, `physical-layout`, `help-docs`, `deadkeys-defined`,
  `rule-set` are registered but placeholder (`UnmigratedGalleryRenderer`,
  no-op `apply`). T037 is **PENDING-PREDECESSOR**: `prefillCarveDispositions`
  (store action + `CarveGalleryV2` effect) still exists; its conversion waits
  for 090's carve migration to land via restack.
- **G-3:** `DecisionRendererProps` (090) carries `provenance`/`source` but no
  `offered`. T032 extends the type additively with `offered?: unknown`.
- **G-4:** no module-level lookup-default declaration exists in the landed
  contract (`runDecisionFlow`'s `default` is value-less). 092 defines it:
  optional `lookupDefault(ctx)` on `QuestionModule`, returning
  `{ value, source? }` — introduced in T010, populated by the US2 conversions.
- **G-5:** T035 names `pb_character_inventory.ts`; 090 deleted it. Its
  `extract` lives on as `survey/questions/gallery/characterInventory.ts`'s
  extract. T035 retargets there.
- **G-6:** the base carries the known depcruise cycle
  (`survey/types` ↔ `workingCopyStore`); the fix (`030bf59c`) sits on
  `km/decision-apply` and arrives via a later restack. Not fixed here; local
  `pnpm lint` depcruise verdicts are read with that caveat (eslint on touched
  files + focused suites are the local gates; CI is authoritative).
- **G-7 / OQ-2 RESOLVED:** setup is the `base-keyboard` completion's deferred
  instantiation (no new `DecisionId` — a record for it would pollute the set
  093 replays and SC-002 counts). T013's wiring lands in `StudioShell.tsx` +
  `decisions/liveExtraction.ts`, not `StepHost.tsx` as the task's file list
  suggested: the instantiation artifact and `doCommit` live in `StudioShell`,
  which `StepHost` cannot reach. Shape: the single-instantiation effect gates
  on BOTH `base-keyboard` and `authoring-track` records; `doCommit` then runs
  the existing `applyStepCompletion("choose_base", …)` apply path with the
  track known, exactly once (per-base guard unchanged); the extraction pass
  is invoked at the post-apply point inside `doCommit` (the same point T050
  later adds `recordBaseContribution` to). FR-004's observable behaviour
  holds: instantiation only through the apply path, requires both decisions,
  runs once, track known.

- **G-8 (FR-005 is NOT self-sufficient on the intermediate base — lead
  ruling requested, US1 thread stopped at T023):** T021's one-line edit
  landed exactly as specified, and T022's `seedWhen` is independently
  sound at pass level. But on today's base the edit has a consequence the
  plan did not record: `orderDecisions(flowModules.identity_lite)` — and
  with it `loadFlowSourceDef(identity_lite)` — THROWS `unresolved
  decision: "authoring-track" required by "il_copyright_holder"`,
  because per-flow ordering rejects cross-flow `requires` by design.
  The loader's live callers include `IdentityLite.tsx:171` (the wizard's
  identity step itself, in a useMemo), the Dashboard routing view, and
  the Flow Map's renderedNodeSet — so on the intermediate stack the live
  identity step cannot render. (The store-level golden walk does not
  catch this: its harness substitutes the identity step.) The frozen
  parity test (`orderParity.test.ts`, identity_lite) is red for the same
  reason. On the COMPLETED stack this resolves itself: 091's design
  unifies identity/track/project_name into one SurveyRunner flow (its
  research.md: "screens are one SurveyRunner over one flow"), making the
  requires intra-flow, and 091's plan already owns the parity rewrite.
  Options for the lead: (a) accept the intermediate red — it heals at the
  091 restack, which precedes 092 in merge order; (b) hold T021 (revert
  the one line; T020/T022 stand) until 091 lands; (c) authorise a
  cross-flow tolerance change in `orderDecisions`/`loadDerivedFlow` on
  this branch — out of 092's declared scope and on the exact surface 091
  is rewriting, so a restack collision is likely. 092's recommendation:
  (a), with (b) if any consumer needs a runnable identity flow from this
  branch before 091 lands (093's re-audit is the candidate consumer).

- **G-9 (gate-open-after-setup, resolved in T031/T036):** the setup pass
  evaluates gates once against the pre-pass decision set (the demo
  runner's `filterGated` semantics), so a question gated behind an
  as-yet-unanswered choice (Phase F's more-detail branch:
  `pf_doc_language`, `pf_project_url`, `pf_provenance_basis`, …) is
  correctly NOT seeded at setup — seeding it would leak an unreached
  value into decision-derived output. When the author opens the gate
  mid-step, `SurveyRunner`'s record-proposal path re-runs the idempotent
  pass at question-push time (only for a question whose module declares
  an extract/lookup default and has no record yet), materialising the
  record so the seed and its "from <source>" caption arrive exactly as
  if the gate had been open at setup. The pass remains the single
  evaluation engine; only its invocation gains a second, lazy trigger.

- **G-10 (T034 premise gap — stopped and reported):** the script-alignment
  firing path the task converts is DORMANT on this base.
  `evaluateFiringConditions` (adaptation/firing.ts) and
  `buildScriptAlignmentRows` (survey/Prefill.tsx) have no live caller
  (tests only), and the `AdaptationEvidenceProvider` seam's live
  implementation does not exist ("The live implementation (follow-up
  feature) reads the committed facet index; tests and the current studio
  inject a mock" — adaptation/evidence.ts). There is no live prefill
  write path for sa1/sa2/sa3 to convert, and no evidence source an
  extract could read at setup. Building the evidence pipeline is the
  follow-up feature the seam names, not a 092 conversion. T034 is left
  unlanded; `Prefill.tsx`'s live rows (buildPrefillRows) are untouched.
- **G-11 (T035 disposition):** on the landed base, 090 already converted
  the characters step to the decision shape: `phaseBDraftStore` is gone,
  `CharactersStep.confirmPrefill` is no longer a seeding write path — it
  is spec 079 US3's carry-over over the decision record
  (`getCharacterInventoryValue` reads the record), and the pass runs
  `characterInventory`'s extract at setup, seeding that record. The
  task's carry-over clause ("kept, with `offered` beside") is the pass's
  merge rule, implemented and tested (T011/T030). T035 is therefore
  satisfied by the predecessor's conversion plus the pass; no code
  change, and `confirmPrefill` is NOT deleted (deleting it would break
  spec 079's carry-over behaviour and its tests).

- **G-12 (T033 partial — declarations landed, IdentityLite write path
  remains):** the five il_* lookup defaults are declared on their modules
  (values/sources mirror `IdentityLite`'s seeders exactly, including the
  deliberate exclusions — no profile name → absent, never the login
  handle; `il_copyright_holder` not seeded there), `ExtractContext`
  carries the `identity` lookup inputs, and `SurveyRunner` renders the
  shared langtags caption from a `default`/`langtags` record. What is
  NOT done: deleting `IdentityLite.tsx`'s seed refs and its
  `getSeedValue`/`getSeedProvenance`/`getSeedSource` props, and the
  ask-time evaluation that would feed the declarations (evaluate in the
  resolution effect, seed-if-absent via `peekDecision`, so restored
  asked records are never offered a lookup default). That surgery
  touches the identity surface's timing (resolution effects, restore
  interplay, the PhaseA/IdentityLite test suites) and was not landed
  sight-unseen in this pass; the declarations are unit-pinned so the
  remaining wiring is mechanical. The lead may schedule it as a
  follow-up on this branch or fold it into the 091 restack work.

- **G-13 (T050 satisfied by position + T013, no move needed):**
  `recordBaseContribution` is invoked from `createDecisionRecorder`'s
  completion callback, which `StepHost` calls AFTER `applyStepCompletion`
  by construction — its inputs are read from the instantiated store at
  that point, and with the T013 setup gate the first instantiation
  happens only once the track decision exists, so the live path writes
  the entry with non-null inputs and the correct mode (pinned for both
  tracks by T051's tests). The function's no-entry-when-uninstantiated
  behaviour (spec 055 FR-030 / research D-11: no entry, never a
  fabricated zero) is deliberate and stays. T040/T041 likewise reduced
  to verification + retiring the stale hazard comment: `doCommit`'s
  track read is the recorded decision (never the session's mutable
  state), the gated effect is its only live caller, and the restore
  pre-seed guard stays as written.

- **G-14 (restack pass, 2026-10-07 — the G-8 boundary ruling's premise
  is FALSIFIED for group-member modules by 091's landing; STOPPED for a
  lead ruling):** the restack merge itself landed clean
  (`46e1dffe`, origin/km/derived-steps @ ed8f12fd, zero conflicts). The
  ruled conversion (il_copyright_holder's `authoring-track` edge:
  module `requires` → `screenRequires`) was then tested by ablation
  before being committed, and it does NOT heal the full-list consumer
  on the completed stack. Evidence (scratch ablations, all reverted):
  (1) with the edge in `requires` (current tree), the raw per-flow sort
  throws `unresolved decision: "authoring-track" required by
  "il_copyright_holder"` (G-8's named item), AND `deriveScreens` over
  the live registry returns 18 screens with the `identity` group SPLIT
  (il_copyright_holder dragged after `track` by the edge), so
  `steps/manifest.ts` throws at module load ("18 steps declared but 19
  screens derived") — stepOrder.parity and sc002 fail at COLLECTION and
  the live manifest is unloadable. (2) With the edge as
  `screenRequires`, the per-flow sort heals (copyright last in flow),
  but deriveScreens STILL returns the split 18: 091's Phase-4 final
  design folds `screenRequires` back into deriveScreens' module-level
  sort, which is exactly right for singleton-screen modules
  (track_choice, project_display_name — 091's cases) and exactly wrong
  for a group member: the folded edge reorders the one module out of
  its group. (3) With the edge dropped entirely, deriveScreens returns
  17 screens = 091's frozen baseline (identity whole, 9 members),
  the manifest loads, and orderParity + sc002 pass 17/17. A further
  wrinkle either way: the pass's `snapshotInputs` reads `m.requires`,
  so moving or dropping the edge removes `authoring-track` from the
  seeded copyright record's `inputs` snapshot (T012's recorded
  behaviour) unless the snapshot's declaration channel is extended.
  Semantic note: `screenRequires: ["authoring-track"]` on this module
  would assert "the identity screen is placed after the track screen",
  which the frozen baseline itself contradicts (identity sorts first);
  the track dependency is a run-time data dependency, already consumed
  by `seedWhen`, the T013 setup gate (track recorded before the pass
  runs), and the pass's inputs snapshot — it was never a screen-order
  fact. Options put to the lead: (A) drop the edge (ablation-proven;
  snapshot loses authoring-track); (A2) drop the edge + snapshotInputs
  reads `requires` ∪ the module's `inputs` declaration (set
  `inputs: ["authoring-track"]` on the module) — keeps T012's snapshot
  byte-identical, small mechanism change inside liveExtraction.ts,
  RECOMMENDED by this pass; (B) keep the conversion and re-engineer
  deriveScreens to apply screenRequires at screen granularity —
  rewrites 091's landed core sort inside 092's pass, not recommended;
  (C) convert + move the whole identity screen — contradicts the
  frozen baseline and the protected parity test, rejected. The rest
  of the restack pass (T023, acceptance re-run, G-12 remainder, T037,
  gates, PR) is NOT executed on a tree whose manifest throws at load;
  it resumes on the ruling.

## Implementation outcome (Phase 7, T060–T063)

- **SC-001 (FR-005):** the one-line `requires` edit + both-tracks
  acceptance walk are landed; the walk is CI-gated (sandbox Chromium
  cannot navigate localhost). Store-level: T030 proves the seeding,
  offered, copy-track, and no-source behaviours against the real stores.
  Caveat G-8: on the intermediate stack the live identity step cannot
  render (cross-flow ordering throws) — the walk's live verdict lands
  with the completed stack; lead ruling requested on the interim state.
- **SC-002 (seed mechanisms):** after this spec, live seed VALUES are
  computed by exactly one engine — the extraction pass — for: the
  copyright holder (extract), all seven Phase F entries (extracts +
  lookup defaults), and every module declaring extract/lookupDefault.
  Remaining non-pass seed surfaces, honestly counted: (1)
  `IdentityLite`'s langtags/profile seeders still compute values at
  render — their lookup defaults are DECLARED on the modules (T033)
  but the ask-time evaluation is not wired (G-12); (2) the
  SurveyRunner host-proposal channel remains as the fallback for
  flows this spec did not convert (gallery/mechanism steps are 090's
  decision modules with their own proposal path). SC-002's "exactly
  one" is therefore met for every surface this spec converted, with
  (1) the named remainder.
- **SC-003 (write paths deleted):** the PHASE_F_SEEDS table is deleted
  (remaining mentions are comments recording its removal);
  `prefillCarveDispositions` still exists — its deletion is T037,
  PENDING-PREDECESSOR on 090's carve migration (G-2); the Phase B
  seeding write (`seedPhaseBFromPrefill`) was already deleted by 090
  and the character-inventory decision is pass-seeded (T035/G-11);
  IdentityLite's seed write path remains per G-12.
- **SC-004:** the walk's adapt leg runs from track choice to prefill
  confirmation with no reload (T042); the mode is asserted at store
  level (T051).
- **SC-005:** `recordBaseContribution` writes with non-null inputs and
  the track-correct mode on the live path (G-13, T051 both tracks).
- **Golden walk:** unchanged from the characterised baseline delta
  (decisionMutations-only fixture staleness owned by 089/090; no
  store/navigation/content deltas introduced by this branch).

**T002 baseline (pre-change, this base):** the Playwright golden walk is
CI-gated per the owner's ruling (sandbox Chromium cannot navigate localhost).
The store-level StepHost golden walk (`tests/steps/stepHost.goldenWalk.test.tsx`,
2 tests) is **red on this base with a characterised, decisionMutations-only
delta**: in both tracks, ~4 entries whose committed fixtures say
`decisionMutations: []` actually record 1–2 `"record"` mutations (plus added
`"record"` entries in existing lists); zero store-mutation, navigation, or
content deltas. This is predecessor-cascade fixture staleness (the unified
spy harness from 089's restack vs fixtures regenerated on parallel branches),
not a 092 effect — no 092 code existed when measured. The fixtures are NOT
regenerated on this branch (the oracle belongs to 089/090 and its
reconciliation rides their restack); per-phase, this suite is re-run and any
delta beyond the characterised shape is a stop-and-report. Also pre-existing
on this base (verified by stash-and-rerun at Phase 2):
`tests/steps/stepHost.renderSmoke.test.tsx` fails 2 `touch_seed_source`
render assertions (24 passed) — a 090-era stub/manifest drift, untouched by
092's changes and left for the predecessors' reconciliation.
