# Tasks: Derived working copy (spec 105)

Programme tasks, one phase per section. Each phase is one PR to `dev`
(merges are Matthew's call). Gate evidence for every phase: the
equivalence gate green + targeted suites green under the A/B rule
(FR-011: a red counts only if it doesn't reproduce on pristine `dev`),
plus the perf re-measure where the phase is marked ⚡ (093 baselines:
warm 7.20 ms / cold 9.58 ms, `rebuildPerf.measure` procedure).

## Phase 0 — Inventory + equivalence gate (this PR)

- [X] T001 Spec, plan, data-model, contracts written (ruling 2026-10-19, Option A)
- [X] T002 I1: store-backbone census — all 130 WorkingCopyState members classified, persistence capture map, patch-sink map → phase0/fragments/inventory-store-backbone.md
- [X] T003 I2: carve + deadkeys + editors/ write inventory (39 grouped writes, verdicts per write) → phase0/fragments/inventory-carve-deadkeys.md
- [X] T004 I3: galleries + VFS/docs + identity + instantiation inventory (55 rows) → phase0/fragments/inventory-galleries-vfs-identity.md
- [X] T005 Research assembled: reconciled vocabulary, per-surface verdicts, assumption deltas vs the D1 scan, in-flight + envelope-slice classifications → research.md
- [X] T006 Registry: decisions/derivedSurfaceRegistry.ts — 11 surfaces, every EDITOR-AUTHORED/UNCLASSIFIED member covered, statuses per research
- [X] T007 Gate: decisions/derivedEquivalence.test.ts — census (130 members, exact), coverage, replay (survey path), draft-load (bypass form, real APIs) arms + planted-violation self-test; 14/14 green on dev d9e3d63a, studio tsc clean
- [X] T008 PR to dev: PR #2292 (ruling, phase map, Phase 0 evidence, LOC deltas, gate results). NOT merged — Matthew's call.

## Phase 1 — Starting point as replay input ⚡

- [ ] T101 Starting-point id as an explicit envelope field (v2-compatible carrier); load prefers it, falls back to the WC slice's startKeyboard
- [ ] T102 Starting point produced pre-mount (093 US2 boot restructure, starting-point half): startingPointIR available before StudioShell mounts
- [ ] T103 Base-artifact slices (welcome/help/README texts, license, baseline findings) become pure functions of the starting-point bundle; remove the parallel seeding in hooks/useKeyboardArtifact.ts
- [ ] T104 setStartDocProfile re-expressed as a starting-point derivation (presented/confirmed per Art. X where the author chose it)
- [ ] T105 Base-switch retain + recalculate re-proven through replay (FR-013): switch test — decisions kept, unfit answers re-proposed, no stale base slices
- [ ] T106 Registry: starting-point-instantiation flips to derived; gate + ⚡ perf evidence in PR

## Phase 2 — Deadkeys

- [ ] T201 Edit-time recording: the DeadkeySurface commit funnel records the deadkeys-defined op at edit time (no completion snapshot)
- [ ] T202 Rebuild installs the deadkeyOverlay slice from the deadkeys-defined record (contracts §5.1)
- [ ] T203 Remove the completion-time recordEditorStep-era snapshot path for deadkeys (none exists — verify and record the negative in the PR)
- [ ] T204 Registry: deadkeys equivalence-proven (replay + draft-load arms extended); gate evidence in PR

## Phase 3 — Carve ⚡

- [ ] T301 Promote the carve fold into the module contract (declared channel or named fold in decisions/); carved-layout apply no longer a silent no-op
- [ ] T302 Edit-time recording for carve writes (cascade pair, dispositions, card state) replacing the completion snapshot
- [ ] T303 Fix keepAll/restoreAll cross-surface clears: deadkeyOverlay/keyEditOverlay are cleared only by their own surfaces' recorded decisions
- [ ] T304 Family toggle (toggleFamilyDisabled) records into carved-layout at edit time
- [ ] T305 Resolve dormant carve members: carveTouchKeepInert, setCarveDisposition, setClosedKeyboardCard — represented or deleted with rationale in PR
- [ ] T306 Registry: carve equivalence-proven; gate + ⚡ perf evidence in PR

## Phase 4 — Physical layout / mechanisms

- [ ] T401 Decision representation for assignments + sequence flags with a reproducing apply()/fold (physical-layout module)
- [ ] T402 MechanismGallery direct writes (recordAssignments path) removed behind the gate; cascadeDelete's carved-layout desync closed
- [ ] T403 Completion effects (lockDesktop/unlockDesktop, repropagate) become derivations of the recorded state
- [ ] T404 Registry: physical-layout equivalence-proven; gate evidence in PR

## Phase 5 — Touch layout ⚡

- [ ] T501 Key-edit fold: replay installs keyEditOverlay + deletedTouchKeyIds from the touch-layout record
- [ ] T502 Character-mode assignments (touchDraft.charTouchEntries) gain a decision value arm; edit-time recording in TouchGallery character mode
- [ ] T503 Suggestion resolutions + bulk groups recorded in the touch-layout value (replace the WC-only suggestion state)
- [ ] T504 touchLayoutJson becomes a projection computed where consumed; the stored field is deleted
- [ ] T505 Direct setWorkingIR promotions in TouchGallery re-expressed as key-edit ops or named records
- [ ] T506 Registry: touch-layout equivalence-proven; gate + ⚡ perf evidence in PR

## Phase 6 — Spec-104 touch identity

- [ ] T601 touch-key-identity DecisionSet family: spec-104 record shapes move into the DecisionSet unchanged
- [ ] T602 WC touchKeyIdentity / keyIdentityDecisions slices become derived caches installed by replay
- [ ] T603 TouchGallery + KeyIdentitySection write through decisions (record-first); direct slice writes removed
- [ ] T604 Registry: touch-identity-104 equivalence-proven; gate evidence in PR

## Phase 7 — Docs, identity, overlays, raw-KMN

- [ ] T701 TrackOneIdentityPanel records identity decisions; the per-keystroke setIdentity path removed
- [ ] T702 Doc-fix proposals become a recorded decision family (confirmable, #504 posture); setDocFixProposals direct writes removed
- [ ] T703 Chart preference, start-holder override, context-tolerance fix: representations landed; direct writes removed
- [ ] T704 historyEntryState mount write (flowStepOptions) becomes a replay derivation
- [ ] T705 Patch sink converges to one composition (StudioShell + galleryHostDeps compositions retire into the fold)
- [ ] T706 Raw-KMN editor: design decision per contracts §5.5 with evidence; implement the chosen arm
- [ ] T707 Registry: docs-identity-overlays equivalence-proven; gate evidence in PR

## Phase 8 — Survey residue

- [ ] T801 Session derived from the decision set; mergePhaseResults read paths moved to decisions
- [ ] T802 phaseResults slot + recordPhase deleted; all call sites rewired (45-file fan-in — rg-verified zero at exit)
- [ ] T803 In-flight residue: position-slice question presented for ruling (research §6) if not already ruled; disposition recorded in spec.md clarifications
- [ ] T804 Registry: survey-residue equivalence-proven; gate evidence in PR

## Phase 9 — Final: envelope v3 + store reduction ⚡

- [ ] T901 v2 fixture capture set (the 093 T014 set) + rebuild migration v2→v3 with migration report (SC-003: zero silent drops)
- [ ] T902 DRAFT_VERSION 3: workingCopy + surveyAnswers slices removed; starting-point id explicit; criteria/testing slices dispositioned per research §7
- [ ] T903 Boot restructured to replay-only resume (093 T018 remainder); cold-resume ⚡ perf vs 9.58 ms baseline
- [ ] T904 persistWorkingCopy snapshot path removed; OAuth session continuity re-expressed per contracts §4.4
- [ ] T905 answers↔decisions filter/rehydrate pair deleted from draftPersistence
- [ ] T906 Dormant slices deleted (keyTransplants, WC guardSpecification) + ghost test files irStore.test.ts / surveyResultsStore.test.ts resolved
- [ ] T907 Incremental apply ceases to be a rival writer: apply is a step of the fold (FR-003); StepHost completion path writes once, through replay
- [ ] T908 Gate draft-load arm converted to the real v3 loader; registry zero pending / zero unclassified (SC-001)
- [ ] T909 Spec-trace acknowledgement, AS-BUILT written, specs/README row, phase0 fragments removed (Art. XI)
- [ ] T910 Final PR body evidences SC-001…SC-006. Programme complete — merges remain Matthew's call throughout.
