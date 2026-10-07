# Tasks: Live extraction from the starting point (specs/092-live-extraction)

Dependency-ordered, organized by user story. `[P]` marks tasks in an independent wave
(different files, no incomplete dependencies). Tests are included because the spec's success
criteria are test-shaped (live Playwright walks, store-level `StepHost` tests) — per the
series rule from 087/088, verification is in the **live wizard** (`pnpm dev`) or through the
real `StepHost`; `DecisionsDemo` / `sc004Harness` results never count.

**Series rule for this spec (binding):** US1 is the series acceptance test. It permits exactly
one declaration edit (T021). If any task finds the walk needs a second edit to pass, STOP and
report — that is a series failure, not a licence to quietly make the edit.

## Phase 1: Setup

- [ ] **T001** Verify the stack this spec stands on is landed in this branch: 088's
  `decisionStore` (records carry `inputs`/`offered`), 089's `apply` + patch runner, 090's
  `DecisionRendererProps` (`provenance`/`source`) and `carved-layout` value shape, 091's
  derived steps with `stepDependencies.ts` deleted. Record any predecessor gap in the PR
  description before writing code · packages/studio/src/decisions/, packages/studio/src/steps/
- [ ] **T002** Capture the pre-change baseline: the 089 golden walk
  (e2e/golden-walk.spec.ts, copy track from `basic_kbdfr`) green and byte-identical, and a
  grep snapshot proving `runDecisionFlow` has no live caller (research R1) ·
  packages/studio/e2e/golden-walk.spec.ts

**Checkpoint:** predecessors present, baseline pinned — the pass can be built.

## Phase 2: Foundational (blocking prerequisites)

The live extraction pass and the setup decision. No user story can be verified without both:
extraction has nothing to read until setup has run, and setup is what makes the track known.

**Wave 1 — independent (different files):**
- [ ] **T010** [P] Implement the live extraction pass per contracts/live-extraction.md:
  modules in derived order, gated-off skipped, `extract` → `validate` (rejection = absent),
  merge into `decisionStore` (unanswered → seeded `extracted` + source; answered → `offered`
  only; nothing extracted → nothing written), lookup defaults in the same pass with
  `default` provenance and named source; returns seeded/offered ids; a throwing
  extract/validate aborts naming the module · packages/studio/src/decisions/liveExtraction.ts (new)
- [ ] **T011** [P] Unit tests for the merge rules: seed-unanswered, offered-on-answered
  (answer byte-unchanged), validate-reject treated as absent, missing value writes nothing,
  gated-off module skipped, throwing extract names its module, second run idempotent ·
  packages/studio/src/decisions/liveExtraction.test.ts (new)

**⟶ Wait for Wave 1, then:**
- [ ] **T012** Wire the pass's inputs: build the bundle with `buildExtractContext(baseIr,
  baseKeyboard)` from the working-copy store's post-setup slots, and give the pass the
  current decision set so each seeded record's `inputs` snapshot includes its `requires`
  values (notably `authoring-track`) · packages/studio/src/decisions/liveExtraction.ts,
  packages/studio/src/decisions/extractContext.ts (read-only)
- [ ] **T013** The setup decision (FR-004): a decision that `requires: ["base-keyboard",
  "authoring-track"]` whose `apply` — through 089's patch runner — instantiates the single
  working copy (`instantiateFromBase` / `instantiateFromExisting`, mode from
  `authoring-track`), running exactly once with the track known; on its completion the
  runner invokes the extraction pass (T010) · packages/studio/src/decisions/liveExtraction.ts,
  packages/studio/src/components/StepHost.tsx

**Checkpoint:** after setup, the store holds seeded records with sources named — stories can build on it.

## Phase 3: User Story 1 — The acceptance test (Priority: P1) 🎯 MVP

**Goal:** add `requires: ["authoring-track"]` to `il_copyright_holder` and change nothing
else; the question then appears after the track choice — adapt: pre-filled from the
keyboard's own copyright, labelled "from <keyboard>"; copy: defaults to the author.

**Independent Test:** a Playwright walk of both tracks in `pnpm dev` (SC-001).

### Tests for User Story 1
- [ ] **T020** [US1] Write the both-tracks acceptance walk FIRST (expect it to fail):
  adapt walk — choose `basic_kbdfr`, choose adapt, assert the copyright-holder question
  appears after the track choice, pre-filled "(c) 2009-2019 SIL International"
  (docs/keyboard-index.md), labelled "from basic_kbdfr"; copy walk — same starting point,
  assert the field defaults to the author and the copied notice is not offered for
  re-entry · packages/studio/e2e/live-extraction-acceptance.spec.ts (new)

### Implementation for User Story 1
**Wave 1 — the one allowed edit:**
- [ ] **T021** [US1] FR-005: `requires` on `il_copyright_holder` becomes
  `["author-name", "authoring-track"]`. One line; no other change to the module (its
  `extract` and its D1 no-`validate` stance are unchanged) ·
  packages/studio/src/survey/questions/a/il_copyright_holder.ts
**⟶ Then:**
- [ ] **T022** [US1] Track-dependent disposition in the pass (generic mechanism, not a
  copyright special case): where a decision's `inputs` include `authoring-track`, the
  pass applies the module's declared seeding disposition — for `copyright-holder`:
  adapt → the extracted value seeds the record; copy → no extracted seed, the D1
  default-to-author stands · packages/studio/src/decisions/liveExtraction.ts
- [ ] **T023** [US1] Run T020's walk: both tracks pass in `pnpm dev`. If a second edit
  appears necessary, stop and report per the series rule above ·
  packages/studio/e2e/live-extraction-acceptance.spec.ts

**Checkpoint:** the series acceptance test passes with exactly one declaration edit.

## Phase 4: User Story 2 — Starting-point values seed decisions (Priority: P1)

**Goal:** after a starting point is chosen, every question it can answer arrives pre-filled
and labelled with its source, in both renderer kinds; the FR-002 seeders are converted.

**Independent Test:** store-level tests through the real `StepHost` for the three
acceptance scenarios + the missing-value edge case, and the live walk's seeding assertions.

### Tests for User Story 2
- [ ] **T030** [P] [US2] Store-level tests through the real `StepHost`: (1) unanswered +
  extractable → record `{ provenance: "extracted", source: <keyboard id> }`; (2) answered
  → answer kept, `offered` set; (3) `validate`-rejecting extract → asked normally;
  (4) starting point missing the value → no record, no silent default ·
  packages/studio/src/decisions/liveExtraction.stepHost.test.tsx (new)

### Implementation for User Story 2
**Wave 1 — labels (different files):**
- [ ] **T031** [P] [US2] Default renderer (FR-003): feed SurveyRunner's seed props from
  decision records instead of per-step callbacks — the field renders the record's source
  label and, when `offered` is set, the offered value beside the author's ·
  packages/studio/src/survey/SurveyRunner.tsx
- [ ] **T032** [P] [US2] Custom renderers (FR-003): pass the record's `provenance`,
  `source` and `offered` through `DecisionRendererProps` (090) at the StepHost wiring, so
  a gallery/picker renders the same "from <keyboard>" label without computing any seed
  itself · packages/studio/src/components/StepHost.tsx

**Wave 2 — seeder conversions (different files, can run in parallel):**
- [ ] **T033** [P] [US2] `IdentityLite.tsx` (FR-002): the langtags seeds (autonym, code,
  script) and GitHub-profile seeds (author name/email) become lookup defaults of the
  record shape (`default` provenance; sources `"langtags"` / `"identity"` per the
  existing `getSeedSource`); delete the seed refs and the `getSeedValue` /
  `getSeedProvenance` / `getSeedSource` write path. Preserve the deliberate exclusions:
  no profile name → no seed (never the login handle); `il_copyright_holder` is not
  seeded here · packages/studio/src/survey/IdentityLite.tsx
- [ ] **T034** [P] [US2] `Prefill.tsx` (FR-002): the script-alignment prefill values
  (`sa1-target-script-spread`, `sa2-base-script-mismatch`, `sa3-latin-flavor`, from
  `adaptation/firing.ts`) become `extract`s on their modules; `Prefill` renders its
  confirmation rows from decision records (value + provenance label + tier) and
  computes no values · packages/studio/src/survey/Prefill.tsx,
  packages/studio/src/adaptation/firing.ts
- [ ] **T035** [P] [US2] `CharactersStep.tsx` (FR-002): delete `confirmPrefill`'s seeding
  write path; the starting-point alphabet proposal is produced by
  `pb_character_inventory`'s existing `extract` running in the pass, and
  author-additions carry-over is expressed through the pass's answered-decision rule
  (kept, with `offered` beside) · packages/studio/src/survey/CharactersStep.tsx,
  packages/studio/src/survey/questions/b/pb_character_inventory.ts
- [ ] **T036** [P] [US2] `PHASE_F_SEEDS` (FR-002): each entry becomes an `extract`
  (`pf_welcome_paragraph`, `pf_project_url`, `pf_provenance_basis` — source `"base"`,
  derivations stay in `lib/phaseFSeeds.ts`) or a lookup default (`pf_contact_info`,
  `pf_doc_language` — `"identity"`; `pf_history_entry` — `"analysis"`;
  `pf_more_detail_gate` — plain default, no source) on its `pf_*` module, keeping each
  entry's documented source; `pf_credits` stays unseeded (thanking ≠ owning); delete the
  table and its `getSeedValue`/`getSeedSource` readers ·
  packages/studio/src/editors/adapters/flowStepOptions.tsx,
  packages/studio/src/survey/questions/f/
- [ ] **T037** [US2] `prefillCarveDispositions` (FR-002): the bulk-default pre-fill
  becomes per-item `derived` entries in the `carved-layout` decision value (090's
  shape), written by the pass/recompute path — never over a combo that already has a
  disposition; delete the `workingCopyStore` action and the `CarveGalleryV2` effect
  that called it · packages/studio/src/stores/workingCopyStore.ts,
  packages/studio/src/editors/carve/CarveGalleryV2.tsx

**Checkpoint:** every FR-002 seeder is a module declaration; T030 green; both renderers label sources.

## Phase 5: User Story 3 — The track is chosen before setup (Priority: P1)

**Goal:** setting up the working copy `requires: ["authoring-track"]`; the adapt track
takes effect on the first commit, not the second (HANDOFF G7).

**Independent Test:** the acceptance walk's adapt leg asserts first-commit effect with no
refresh (SC-004).

- [ ] **T040** [US3] Delete `StudioShell` `doCommit`'s instantiation path: the
  `baseConfirmed` effect's commit and the mode re-derivation from a possibly-null
  `selectedTrack` (~lines 979, 1142–1161 on the pre-series branch) — instantiation is
  the setup decision's `apply` (T013) and nothing else instantiates in the live
  wizard · packages/studio/src/StudioShell.tsx
- [ ] **T041** [US3] Delete the restoring-boot re-commit hazard the T040 removal leaves
  behind: the restore path no longer needs to defend against a re-commit re-deriving
  the mode (the hazard documented at `StudioShell.tsx` ~645–655); the résumé/restore
  guard (`instantiatedForBaseIdRef` pre-seeding) stays · packages/studio/src/StudioShell.tsx
- [ ] **T042** [US3] Extend the acceptance walk: on the adapt leg, assert the working
  copy's instantiation mode is adapt from the first commit after the track choice,
  with no page refresh anywhere in the walk (SC-004) ·
  packages/studio/e2e/live-extraction-acceptance.spec.ts

**Checkpoint:** one setup, track known, first commit correct — G7's hazard is gone structurally.

## Phase 6: User Story 4 — The starting-point log entry is written (Priority: P2)

**Goal:** `recordBaseContribution` runs after setup, so the starting-point entry is no
longer null (HANDOFF G7).

**Independent Test:** after every live walk, the decision trail holds the
starting-point entry (SC-005).

- [ ] **T050** [US4] Move the `recordBaseContribution` invocation to the runner's
  post-setup point (after the setup `apply` and the extraction pass, per
  contracts/live-extraction.md), so base keyboard, base IR and instantiation mode
  exist by construction; the function's null guard stays as a guard ·
  packages/studio/src/decisions/createDecisionRecorder.ts,
  packages/studio/src/components/StepHost.tsx
- [ ] **T051** [US4] Extend the acceptance walk: after each track's walk, assert the
  decision trail contains the starting-point (base-contribution) entry naming the
  starting point (SC-005) · packages/studio/e2e/live-extraction-acceptance.spec.ts

**Checkpoint:** the entry is present after every live walk.

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] **T060** SC-002 measurement: in the live wizard, choose `basic_kbdfr` and record
  the extraction pass's seeded ÷ applicable decisions (from the pass's returned ids);
  report the figure in the implementation PR and in T063's spec evidence note. The
  spec sets no target percentage — report the measured number, do not invent a bar ·
  packages/studio/e2e/live-extraction-acceptance.spec.ts
- [ ] **T061** [P] SC-003 verification: zero remaining step-code seeders — grep shows no
  `PHASE_F_SEEDS`, no `prefillCarveDispositions`, and no seed write path in
  `IdentityLite.tsx` / `Prefill.tsx` / `CharactersStep.tsx` (research R3's table is the
  checklist) · packages/studio/src/
- [ ] **T062** Regression gates: the 089 golden walk byte-identical; the studio vitest
  suite via the package's own config (never bare `vitest` at the root); `tsc --noEmit`;
  `pnpm lint` · packages/studio/
- [ ] **T063** Reconcile and record evidence: run `/speckit-analyze` over
  spec ↔ plan ↔ tasks, record the SC-002 measured figure and the SC-001/SC-004/SC-005
  walk results in the spec's success-criteria evidence, and update the series
  duplication ledger entries this spec retires (step seeders; two setups) ·
  specs/092-live-extraction/spec.md

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: predecessor specs 088–091 landed — hard dependency for everything.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **US1 (Phase 3)**: depends on Foundational (the pass, T013's setup). Its walk also
  exercises US3's setup ordering — T042 (Phase 5) extends the same walk file, so Phase 5
  follows Phase 3 in execution even though both are P1.
- **US2 (Phase 4)**: depends on Foundational. Wave 2 conversions (T033–T037) are mutually
  independent; T037 additionally depends on 090's `carved-layout` value shape (Phase 1
  verifies it).
- **US3 (Phase 5)**: T013 (Foundational) is its mechanism; T040–T041 delete the old path
  only once T013 is proven by T023's walk — do not delete `doCommit`'s path before the
  acceptance walk passes on the new one.
- **US4 (Phase 6)**: depends on T013 + T050's post-setup point existing; its assertion
  (T051) rides the acceptance walk.
- **Polish (Phase 7)**: depends on all stories.

### Within Each Story

- Tests first, watched failing (T020, T030), then implementation.
- One commit per phase, pushed to `km/live-extraction` as its gates go green (repo
  cadence); the commit message names the tasks it closes.
- The golden walk (T002 baseline) is re-run at every checkpoint; a byte difference is a
  stop, not a baseline update.

### Parallel Opportunities

- T010 ∥ T011 (runner vs its tests' fixtures), T031 ∥ T032 (the two renderer kinds),
  T033 ∥ T034 ∥ T035 ∥ T036 ∥ T037 (five seeder conversions, disjoint files),
  T061 alongside T060.

## Implementation Strategy

### MVP

Foundational + US1: the pass exists, setup requires the track, and the series acceptance
test passes on both tracks in the live wizard. Everything after that is conversion breadth
(US2), deletion of the old setup path (US3), and the log-entry guarantee (US4).

### Incremental delivery

1. Setup + Foundational → extraction runs live after setup.
2. US1 → the acceptance test, both tracks, one declaration edit.
3. US2 → seeders converted in five independent slices; golden walk byte-identical after each.
4. US3 → old setup path deleted; first-commit adapt verified.
5. US4 → log entry guaranteed; Polish → SC-002 figure measured and recorded.
