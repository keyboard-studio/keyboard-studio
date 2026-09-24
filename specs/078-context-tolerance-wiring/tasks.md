# Tasks: Context tolerance reaches the author

**Input**: Design documents from `specs/078-context-tolerance-wiring/`

**Prerequisites**:
- [plan.md](plan.md), [spec.md](spec.md), and [research.md](research.md) (the decisions are in §10, D1–D9).
- [data-model.md](data-model.md), [contracts/](contracts/), and [quickstart.md](quickstart.md).

**Tests**: The spec requires them. It has per-story Independent Tests, an FR-012 corpus gate, SC-003/SC-008 byte-identity, and FR-014 accessibility. Test tasks come before implementation within each phase.

**Story map**:
- US1 (P1) is the diagnosis.
- US2 (P2) is accept and partial accept.
- US3 (P3) is decline.
- **US4 is removed**: echo-only, resolved 2026-09-24. No tasks.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: The task can run in parallel, because it touches different files and depends on no incomplete task.
- **[Story]**: The user story the task belongs to (US1, US2, US3).

---

## Phase 1: Setup

**Purpose**: The flag, the dependency harness, and the CI gate (FR-011, FR-012).

- [ ] T001 Merge PR #1757, or rebase `078-context-tolerance-wiring` onto it, so that `utilities/nfd-tolerance-corpus/` exists on the branch. This is a dependency and gets its own commit. Record the harness's baseline verdict counts on the pinned `../keyboards` corpus in `specs/078-context-tolerance-wiring/research.md` §10, under "Dependency status at plan time".
- [ ] T002 [P] Create `packages/studio/src/flags/contextToleranceFlag.ts`, exporting `isContextToleranceEnabled()`. It reads `VITE_KM_CONTEXT_TOLERANCE` through the same `readEnvFlag` helper `packages/studio/src/flags/mutateFlag.ts` uses, and defaults to off.
- [ ] T003 [P] Add a CI step that runs `node utilities/nfd-tolerance-corpus` on the pinned corpus and fails on any `regressed` verdict (FR-012). Put it in the existing workflow under `.github/workflows/`, following the pattern the `/api` bundle-safety step uses for suites outside `pnpm -r`.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Make the context-tolerance analysis runnable in the browser behind a lazy engine subpath (research D1, D2, D5, D7). This phase blocks every user story.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

### Tests for Foundational

- [ ] T004 [P] Write a loader-equivalence test in `packages/engine/src/simulator/keyboardLoader.test.ts`. The same compiled `sil_yoruba8` must give identical `simulate()` output for the composed seed and the decomposed (NFD) seed under `nodeKeyboardLoader` and under `browserKeyboardLoader`. Repeat for the `basic_kbdfr` recognizer fixture. The test fails until T006 and T007 exist.
- [ ] T005 [P] Write a bundle-safety test in `packages/studio/tests/contextToleranceBundle.test.ts`. It builds (or inspects) the studio production bundle and asserts:
  - no `node:vm`;
  - no unresolved `keyman/engine/` or `@keymanapp/keyman-version` bare specifier;
  - no simulator code in the chunk for the root `@keyboard-studio/engine` entry.

  Model it on `api/bundle-safety.test.ts`.

### Implementation for Foundational

- [ ] T006 Create `packages/engine/src/simulator/keyboardLoader.ts` with the `KeyboardLoader` interface and `setKeyboardLoader()`, as in [contracts/engine-context-tolerance-entry.md](contracts/engine-context-tolerance-entry.md). Refactor `packages/engine/src/simulator/nodeKeyboardLoader.ts` to implement it. Remove the side-effect import of `./nodeKeyboardLoader.js` from `packages/engine/src/simulator/reverseUsLayout.ts`, and select the loader through the seam instead. Behaviour under Node is unchanged.
- [ ] T007 Create `packages/engine/src/simulator/browserKeyboardLoader.ts`. It evaluates the compiled keyboard JS with `new Function(...)` and injects the same sandbox globals that `nodeKeyboardLoader` passes to `vm.createContext`.
- [ ] T008 Rewrite the bare specifiers in `packages/engine/src/simulator/vendor/**` to relative paths: `@keymanapp/common-types`, `keyman/engine/keyboard`, `keyman/engine/js-processor`, `keyman/common/web-utils`, and `@keymanapp/keyman-version`. Then remove the now-unused alias entries from `packages/engine/tsconfig.json` `paths` and `packages/engine/vitest.config.ts`. Confirm `pnpm --filter @keyboard-studio/engine test` is green (research D1).
- [ ] T009 Add `classifyToleranceFinding(f)` to `packages/engine/src/validator/context-tolerance.ts`, with unit tests in `packages/engine/src/validator/context-tolerance.classify.test.ts`. It returns `"tolerant" | "made-tolerant" | "gap" | "not-analysed"`, where a gap is `not-analysed` plus `failingKeystrokes` and no reason. Also cover the SC-005 accounting invariant from [data-model.md](data-model.md) (research D5).
- [ ] T010 [P] Create `packages/engine/src/pattern-apply/tolerance-fingerprint.ts` exporting `toleranceFingerprint(ir, ruleIds)`. It is an FNV-1a 64-bit hex digest over each rule's emitted `.kmn` text, sorted by rule id. Test it in `packages/engine/src/pattern-apply/tolerance-fingerprint.test.ts`: the digest is stable across a parse→emit→parse round trip, is independent of input order, and changes when one rule's text changes (research D7).
- [ ] T011 Create `packages/engine/src/context-tolerance/index.ts`. It re-exports the full list in [contracts/engine-context-tolerance-entry.md](contracts/engine-context-tolerance-entry.md), and in the browser build it installs `browserKeyboardLoader`:
  - `computeContextTolerance`
  - `classifyToleranceFinding`
  - `proposeContextVariants`
  - `createContextToleranceMigrationRule`
  - `buildContextToleranceOutputDiffPreview`
  - `toleranceFingerprint`
  - `loadCharNames` from `packages/engine/src/character-discovery/charNames.ts`

  Add a `"./context-tolerance"` entry to the `exports` of `packages/engine/package.json`, with `browser`, `import` and `types` conditions. Do **not** touch `packages/engine/src/index.ts`.
- [ ] T012 Add a depcruise rule to `.dependency-cruiser.cjs` that forbids `packages/engine/src/context-tolerance/**` from reaching `simulator/nodeKeyboardLoader`. Run `pnpm lint` to confirm it passes.
- [ ] T013 Create `packages/studio/src/lib/contextToleranceEngine.ts`: a memoised `import("@keyboard-studio/engine/context-tolerance")` that caches only a successful load. It follows the `packages/studio/src/lib/langtagsDefaults.ts` `_modulePromise` pattern.
- [ ] T014 Add a browser-environment test in `packages/studio/src/lib/contextToleranceEngine.test.ts` (jsdom or happy-dom, whichever `packages/studio/vitest.config.ts` uses). It loads the subpath through T013 and runs `computeContextTolerance` on the parsed `sil_yoruba8` IR from the `../keyboards` corpus. Assert at least one `gap` via `classifyToleranceFinding`, and assert no `compileDiagnostics`. This covers the `&LAYOUTFILE` strip fixed in #1774.

**Checkpoint**: T004, T005 and T014 are green, and the analysis now runs in the browser. User-story work can begin.

---

## Phase 3: User Story 1 - The author is told their keyboard breaks on decomposed text (Priority: P1) 🎯 MVP

**Goal**: Once the preview compiles, a single advisory finding appears in the main walk. It counts the affected rules and expands to one plain-language case per rule, with every character shown by codepoint and Unicode name. A separate "could not be checked" notice covers everything the analysis missed. None of this blocks the preview or download.

**Independent Test**: Import `sil_yoruba8` with the flag on and wait for the preview. The finding appears, names the rules, and gives a named case for each. Then import a keyboard that already handles both forms: there is no finding ([quickstart.md §3](quickstart.md)).

### Tests for User Story 1

- [ ] T015 [P] [US1] Write a keyboard-lint test for the new narrow entry in `packages/keyboard-lint/src/lintContextTolerance.test.ts`, feeding it a hand-built `ToleranceReport`. `lintContextTolerance(ir, report)` returns exactly the `KM_WARN_CONTEXT_NOT_TOLERANT` and `KM_HINT_CONTEXT_NOT_ANALYSED` findings and nothing from any other Layer C check.
- [ ] T016 [P] [US1] Write a hook test in `packages/studio/src/hooks/useKeyboardArtifact.contextTolerance.test.ts` for the new option `analyseContextTolerance: true`:
  - The stage reaches `ready` **before** the slice leaves `analysing`, so the preview is not delayed (FR-001).
  - A superseded `runId` discards its result.
  - A thrown analysis sets `failed`.
  - Without the option, or with the flag off, no analysis runs.
- [ ] T017 [P] [US1] Write a component test in `packages/studio/src/lint/ContextToleranceNotice.test.tsx`:
  - **Collapsed view:** one line with the rule count.
  - **Expanded view:**
    - each case renders `U+006F LATIN SMALL LETTER O` and `U+0323 COMBINING DOT BELOW`;
    - with no name available it falls back to `codepointLabel`;
    - no rendered text contains `NFC`, `NFD`, `normalization` or `canonical` unless a gloss follows (FR-013).
  - **Could-not-check:** the notice renders a count and reasons, both for a `failed` slice and for a `compileDiagnostics` report (FR-004).
  - **Live region:** the notice sits inside the existing live region (FR-014).
- [ ] T018 [P] [US1] Write a Playwright e2e test in `packages/studio/e2e/context-tolerance.spec.ts`, US1 part, with `VITE_KM_CONTEXT_TOLERANCE=1`:
  - Import `sil_yoruba8`. The finding appears after the preview is ready, the download button stays enabled, and expanding the finding shows named characters.
  - A keyboard that is already tolerant shows no finding.

### Implementation for User Story 1

- [ ] T019 [P] [US1] Add `lintContextTolerance(ir, report): LintFinding[]` to `packages/keyboard-lint/src/lintContext.ts`, wrapping `checkContextTolerance` from `packages/keyboard-lint/src/checks/check-19-x-context-tolerance.ts`. Export it from `packages/keyboard-lint/src/index.ts`. Add no engine import (depcruise).
- [ ] T020 [P] [US1] Add the `contextTolerance: ContextToleranceState` slice (shape in [data-model.md](data-model.md)) to `packages/studio/src/stores/workingCopyStore.ts`, with setter `setContextTolerance` and a reference-equality guard like `setValidatorFindings`. Do **not** add it to `packages/studio/src/lib/persistWorkingCopy.ts`.
- [ ] T021 [US1] Implement the analysis task in `packages/studio/src/hooks/useKeyboardArtifact.ts`, per [contracts/studio-tolerance-state.md](contracts/studio-tolerance-state.md) § Analysis task:
  - Add the option `analyseContextTolerance?: boolean`.
  - After the `ready` `setStage` in `runCompile`, launch an un-awaited async task that loads the engine through `lib/contextToleranceEngine.ts`, then runs `computeContextTolerance`, then `lintContextTolerance`.
  - Compute `fixableRuleIds` and `fingerprint`.
  - Check `runId.current` after every await, and write to the slice.
  - Never join the `Promise.all`. Add no timer (D3).
- [ ] T022 [US1] Pass `analyseContextTolerance: isContextToleranceEnabled()` at the `useKeyboardArtifact` call in `packages/studio/src/StudioShell.tsx` (around line 1171) only. Leave every other caller unchanged.
- [ ] T023 [US1] Create `packages/studio/src/lint/ContextToleranceNotice.tsx` per [contracts/studio-tolerance-state.md](contracts/studio-tolerance-state.md) § Notice:
  - Render a collapsible finding with a per-rule case in plain words. Build it from the report's `failingKeystrokes`, `precomposedOutput` and `decomposedOutput`, not from the lint message string.
  - Resolve character names with `loadCharNames()`.
  - Render a separate could-not-check notice.
  - Add no shippability or C4 entry (FR-002).
- [ ] T024 [US1] Mount `ContextToleranceNotice` next to `<LintSummary>` inside the existing `role="status" aria-live="polite"` region in `packages/studio/src/StudioShell.tsx` (around lines 1494–1512). Render nothing when the flag is off or the slice is `idle`.
- [ ] T025 [US1] Wrap every US1 string under `lint.contextTolerance.*` using Lingui (`<Trans>` or `t`). Use ICU plurals for the rule counts. Take the FR-013 reference glosses as the first draft. Run the i18n extract and the lint checkers (`pnpm lint`) so the tier-1 catalog stays consistent.

**Checkpoint**: T015–T018 are green. US1 can ship on its own behind the flag.

---

## Phase 4: User Story 2 - The author accepts the proposed fix (Priority: P2)

**Goal**: A pre-filled `marks_context_tolerance` station previews the change in the spec 039 `FacetTransformPanel`: the rule count, the shadowed rules, and the behaviour in words. The author confirms all of it or a subset. The decision is recorded in the trail, and the rules are applied through the mutate seam by a separate effect.

**Independent Test**: Import `sil_yoruba8`, accept, and download. In the simulator, decomposed `o` + U+0323 followed by each of the five accent keys produces the correct accent. Composed input is byte-identical, and the notice then reports the fixed rules as tolerant ([quickstart.md §4](quickstart.md)).

### Tests for User Story 2

- [ ] T026 [P] [US2] Write an engine test in `packages/engine/src/pattern-apply/context-variants.disclosure.test.ts` for the per-variant `VariantDisclosure`:
  - A fixture with a non-fallback overlapping rule on the same key reports it in `shadows`, as well as the bare fallback.
  - A `&mnemoniclayout` keyboard marks its backspace-unwrap sites `unobservable: "mnemonic-backspace"`.
  - A two-class stack gets a `markOrderNote`.
- [ ] T027 [P] [US2] Write an engine test in `packages/engine/src/pattern-apply/context-variants.refusal.test.ts`. No site is produced for any FR-010 hazard shape, and each one is reported as `not-analysed` with a reason:
  - a key store selecting different physical keys per member, with key-position `index()`;
  - compound key parts;
  - `notany()`;
  - context-indexed output;
  - a store mixing characters and deadkeys;
  - `if()`, `platform()` or `baselayout()` guards;
  - an opaque rule.
- [ ] T028 [P] [US2] Write a contracts test in `packages/contracts/src/surveyPhaseResult.contextTolerance.test.ts` for the zod round-trip and drift guard of `SurveyPhaseResult.marksContextTolerance`, the `DecisionProposalSource` member `"analysis"`, and the `DecisionProvenance.proposed` field. Also check that a v2 decision record without the new fields still parses.
- [ ] T029 [P] [US2] Write a station test in `packages/studio/src/survey/marks/ContextToleranceStation.test.tsx`:
  - Every site is pre-ticked.
  - The disclosure rows render.
  - Confirming with every site ticked gives `accept`; unticking one gives `partial` with the right `acceptedSiteIds`.
  - Each tick is a labelled checkbox and the panel is keyboard-operable (FR-014).
  - Accept takes at most two interactions (SC-002).
- [ ] T030 [P] [US2] Write an apply-effect test in `packages/studio/src/hooks/useContextToleranceApply.test.ts`:
  - `accept` writes through `applyMutatePatch` with `CONTEXT_TOLERANCE_WRITES`.
  - A patch outside the declared writes throws.
  - A stale site, whose rule changed after the decision, is dropped and reported.
  - A non-`committed` `applyFacetTransform` result leaves the IR unchanged.
  - Re-running with the same `appliedFingerprint` does nothing (FR-008).
- [ ] T031 [P] [US2] Write a decision-trail test in `packages/studio/src/decisions/contextToleranceTrail.test.ts`:
  - `accept` records `marks.context_tolerance` as `tool-proposed` with source `analysis`.
  - `partial` records `hand-set` with `proposed.siteIds`, plus a `marks.context_tolerance.sites` answer.
  - The headline renders with a real question label, not "unknown question".
- [ ] T032 [US2] Extend `packages/studio/e2e/context-tolerance.spec.ts` with US2:
  - Walk to the marks series and confirm. The trail shows the accepted entry, and after the next compile the notice reports the rules made tolerant.
  - In the simulator, decomposed `o` + U+0323 plus each of the five accent keys gives the correct accent (SC-003).
  - Composed output is byte-identical to the unfixed keyboard (FR-008).
  - A partial run changes only the ticked sites.

### Implementation for User Story 2

- [ ] T033 [P] [US2] Add these to `packages/contracts/src/surveyPhaseResult.ts`: the `MarksContextToleranceDecision` type and the optional `marksContextTolerance` field, where the last phase carrying it wins in `mergePhaseResults`, mirroring `marksOutputForm`. Add their zod mirror and a drift guard in `packages/contracts/src/schemas.ts`.
- [ ] T034 [P] [US2] In `packages/contracts/src/decisionRecord.ts`, add `"analysis"` to `DecisionProposalSource` and the optional `proposed?: { value: string; siteIds?: string[] }` to `DecisionProvenance`. Update the zod schemas in `packages/contracts/src/schemas.ts` (around lines 621 and 722). Leave `DECISION_RECORD_VERSION` at 2.
- [ ] T035 [US2] Extend `packages/engine/src/pattern-apply/context-variants.ts` so `proposeContextVariants` attaches a `VariantDisclosure` to each variant (research D9):
  - overlap detection against non-fallback rules on the same key, alongside the existing `precedesFallbackRuleId`;
  - the mnemonic backspace flag;
  - the two-class mark-order note, reusing `packages/engine/src/pattern-apply/mark-decomposition.ts`.

  Make sure the FR-010 refusal list is complete. Export `VariantDisclosure` through `packages/engine/src/context-tolerance/index.ts`.
- [ ] T036 [US2] Audit and name the generated rules and stores. In `packages/engine/src/pattern-apply/context-variants.ts`, rename them so each describes what it does rather than which tool made it. Emit one source comment on the generated block that names its origin and purpose (FR-015). Update the affected snapshot and fixture expectations in the same package.
- [ ] T037 [US2] Change `commit` in `packages/studio/src/hooks/useFacetTransform.ts` to accept `options?: { ruleOverride?: MigrationRule }` and forward it to `applyFacetTransform`. Import `MigrationRule` as a type only.
- [ ] T038 [US2] Create `packages/studio/src/steps/contextToleranceWrites.ts`, exporting `CONTEXT_TOLERANCE_WRITES: readonly IRPath[]` (the groups' rules and the stores). Spread it into the `marks` entry's `writes` in `packages/studio/src/steps/manifest.ts` (around lines 129–138). Update the `validateManifestShape` expectations in its test if needed.
- [ ] T039 [US2] Create `packages/studio/src/survey/marks/ContextToleranceStation.tsx` per [contracts/marks-context-tolerance-station.md](contracts/marks-context-tolerance-station.md):
  - Mount `packages/studio/src/components/facet-transform/FacetTransformPanel.tsx` with a `TransformProposal` built from `ContextVariantsResult`, every site `accepted`.
  - Add the disclosure rows.
  - Confirm produces `accept` or `partial`; Decline produces `decline`.
  - Wrap strings under `marks.contextTolerance.*`.
- [ ] T040 [US2] Wire the station into `packages/studio/src/survey/marks/MarksSeriesStep.tsx`:
  - Add `"marks_context_tolerance"` to `MarksStationId`, ordered after `marks_output_form` and `marks_stacking`.
  - Apply the visibility table from the station contract, reading the `contextTolerance` slice.
  - For the `analysing` state, render a "checking…" message that still lets the author continue.
  - Have `seriesResult()` emit `marksContextTolerance` and the `marks.context_tolerance` / `.sites` answers.
- [ ] T041 [US2] Make the decision trail record the new question:
  - In `packages/studio/src/decisions/createStudioDecisionRecorder.ts`, teach `resolveProposal` the `marks.context_tolerance` question id. Accept-all resolves to `tool-proposed` / `analysis`; partial resolves to `hand-set` plus `proposed`.
  - Add a label source for both question ids in `packages/studio/src/decisions/lookupQuestionLabel.ts`, so that `packages/studio/src/decisions/headline.ts` renders a real label.
- [ ] T042 [US2] Create `packages/studio/src/hooks/useContextToleranceApply.ts` per [contracts/studio-tolerance-state.md](contracts/studio-tolerance-state.md) § Apply effect:
  1. Recompute the report and proposal on the current IR.
  2. Intersect the accepted sites with the fixable sites whose fingerprint still matches.
  3. Verify with `applyFacetTransform` and `ruleOverride: createContextToleranceMigrationRule(result, "echo")`.
  4. Write with `applyMutatePatch(base, patch, CONTEXT_TOLERANCE_WRITES)`, then `setWorkingIR`.
  5. Record `appliedFingerprint`.

  Surface stale sites and refusals to the notice.
- [ ] T043 [US2] Mount `useContextToleranceApply` in `packages/studio/src/StudioShell.tsx`, gated on `isContextToleranceEnabled()`. Extend `ContextToleranceNotice.tsx` to show "made tolerant" counts, stale-site messages, and apply refusals.

**Checkpoint**: T026–T032 are green. US1 and US2 both work.

---

## Phase 5: User Story 3 - The author declines, and nothing is hidden or changed (Priority: P3)

**Goal**: Declining leaves the working copy unchanged and keeps the finding visible. It records the decline with the tool's proposal attached, and the proposal is not raised again until the affected rules change.

**Independent Test**: Decline and download. The output equals the working copy's emitted output without the feature. Reopen the survey: the decision reads as declined and the finding is still visible ([quickstart.md §5](quickstart.md)).

### Tests for User Story 3

- [ ] T044 [P] [US3] Extend `packages/studio/src/survey/marks/ContextToleranceStation.test.tsx` and `MarksSeriesStep.test.tsx`:
  - `decline` sets `acceptedSiteIds: []`.
  - A prior decision with an identical fingerprint renders read-only with the prior outcome and a "change" control, and is not raised again.
  - A changed fingerprint raises the proposal again, pre-filled (FR-009).
- [ ] T045 [P] [US3] Extend `packages/studio/src/decisions/contextToleranceTrail.test.ts`. A decline records `hand-set` with `proposed: { value: "accept", siteIds }`, and a revisit with the same value does not append a duplicate entry.
- [ ] T046 [US3] Extend `packages/studio/e2e/context-tolerance.spec.ts` with US3:
  - Decline and download. The `.kmn` equals the emitted working copy with the flag off (SC-008).
  - Revisit the marks series: no re-proposal.
  - Edit an affected rule: after the next compile, the proposal is raised again.

### Implementation for User Story 3

- [ ] T047 [US3] Add decline handling in `packages/studio/src/survey/marks/ContextToleranceStation.tsx`:
  - a "Leave my keyboard as it is" action;
  - the read-only prior-decision view with a "change" control;
  - the `marks.contextTolerance.station.prior.*` strings.
- [ ] T048 [US3] Implement re-raise suppression in `packages/studio/src/survey/marks/MarksSeriesStep.tsx` by comparing the stored `marksContextTolerance.fingerprint` with the slice's current `fingerprint`. Confirm `useContextToleranceApply` never acts on `decline` (`packages/studio/src/hooks/useContextToleranceApply.ts`).
- [ ] T049 [US3] Route every drafted author-facing string (`lint.contextTolerance.*`, `marks.contextTolerance.*`) to content for sign-off (Constitution Art. VI). Record the approved wording, and any changes, in `specs/078-context-tolerance-wiring/research.md` §10. Update the catalogs without renaming ids, because the meaning is unchanged.

**Checkpoint**: All three stories work independently behind the flag.

---

## Phase 6: Polish & cross-cutting concerns

- [ ] T050 [P] Add or update rows in `specs/056-ada-accessibility/wcag-2.2-aa-tracker.md` for the notice (live region) and the station (labelled ticks, keyboard operation). Name the test evidence from T017 and T029 (FR-014).
- [ ] T051 [P] Update [docs/architecture.md](../../docs/architecture.md) and [docs/packages.md](../../docs/packages.md):
  - the new engine subpath `./context-tolerance`;
  - the browser keyboard loader;
  - Layer C's first production caller (`lintContextTolerance`);
  - the async-compute → mutate-seam apply pattern (research D8).
- [ ] T052 [P] Add a `sil_yoruba8` row to [docs/keyboard-index.md](../../docs/keyboard-index.md) if one is missing, along with rows for any other keyboard newly used as a fixture in T004, T014, T026 or T027. Read each `<id>.kps` for name, BCP47 and author. Run `node utilities/spec-trace check` and acknowledge the spec 078 units that changed.
- [ ] T053 Run the full [quickstart.md](quickstart.md) walk. The harness must report `regressed = 0` and `gap-fixed ≥ 40%` of the keyboards with a gap (SC-004, SC-005). Record the numbers in `specs/078-context-tolerance-wiring/research.md` §10.
- [ ] T054 Retire the flag once T053 passes (FR-011): make `isContextToleranceEnabled()` default on in `packages/studio/src/flags/contextToleranceFlag.ts`, and keep the env override as a kill switch. Land this in its **own** commit so it can be reverted independently.
- [ ] T055 Run `pnpm typecheck && pnpm lint && pnpm test`, plus the studio e2e suite, and fix any fallout. Out-of-scope repairs to shared helpers get their own commits.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependencies. T001 unblocks T003 and T053.
- **Foundational (Phase 2)**: Depends on Setup. It blocks all stories. T006 → T007 → T011; T008 → T011; T011 → T013 → T014.
- **US1 (Phase 3)**: Depends on Foundational.
- **US2 (Phase 4)**: Depends on Foundational and on US1's slice and task (T020, T021). The station reads the slice.
- **US3 (Phase 5)**: Depends on US2's station and decision field (T033, T039, T040).
- **Polish (Phase 6)**: Depends on every story. T054 depends on T053.

### Within each story

- Tests are written first and must fail before implementation.
- Contracts come first (T033, T034), then engine (T035, T036), then studio hooks and components (T037–T042), then shell wiring (T043).

### Parallel opportunities

- **Setup:** T002 ∥ T003 (after T001).
- **Foundational tests:** T004 ∥ T005.
- **Foundational implementation:** T009 ∥ T010 alongside the loader work (T006–T008).
- **US1:** tests T015 ∥ T016 ∥ T017 ∥ T018. Implementation T019 ∥ T020, then T021 → T022, and T023 → T024 → T025.
- **US2:** tests T026–T031 in parallel. T033 ∥ T034 ∥ T035 ∥ T037 ∥ T038, then T039 → T040 → T041, and T042 → T043.
- **US3:** T044 ∥ T045.
- **Polish:** T050 ∥ T051 ∥ T052.

## Parallel Example: User Story 1

```text
# Tests together:
T015 packages/keyboard-lint/src/lintContextTolerance.test.ts
T016 packages/studio/src/hooks/useKeyboardArtifact.contextTolerance.test.ts
T017 packages/studio/src/lint/ContextToleranceNotice.test.tsx
T018 packages/studio/e2e/context-tolerance.spec.ts (US1 part)

# Then implementation together:
T019 packages/keyboard-lint/src/lintContext.ts (lintContextTolerance)
T020 packages/studio/src/stores/workingCopyStore.ts (contextTolerance slice)
```

## Implementation Strategy

### MVP (User Story 1 only)

1. Phases 1–2: harness, flag, and the browser-safe analysis.
2. Phase 3: the finding reaches the author.
3. **Stop and validate** against quickstart §3. It can ship behind the flag, and an author who never accepts a fix still learns to test in FieldWorks.

### Incremental delivery

- Setup + Foundational + US1 → first PR (diagnosis).
- US2 → accept and partial.
- US3 → decline and re-raise suppression.
- Polish, then flag retirement (T054) in its own commit.

Per the project cadence, each green phase is **one commit** that names its tasks (`spec 078 TNNN-TNNN`) and is pushed to the feature branch. Nothing is merged unasked.

## Notes

- US4 has no tasks: the own-form write-back stays built in the engine and is not exposed.
- The wrong upstream-issue citation for the mnemonic backspace limitation (research §2 item 2) is a docs follow-up outside this spec.
- Widening `ToleranceStatus` with a `"gap"` member is a candidate `maint(contracts)` follow-up (research D5).
