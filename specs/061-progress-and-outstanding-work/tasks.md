# Tasks: Honest progress — one mark per activity page, and the first work still owed

**Feature**: 061-progress-and-outstanding-work · **Branch**: `km/061-progress-and-outstanding-work`
**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)
**Data model**: [data-model.md](data-model.md) · **UI contract**: [contracts/ui-contract.md](contracts/ui-contract.md)
**Size**: normal — full phased task list.

Line format: `- [ ] **T###** [P?] [US#] Description · exact/file/path`.
`[P]` = independent of the others in its wave (different file, no incomplete dependency).
Every path is relative to the repo root. All paths under `packages/studio/src/` unless stated.

---

## Phase 1: Setup

The two declarations everything else keys off. Both are additive, neither changes behaviour on its
own.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Add `required?: boolean` to `StepWalkPosition`, with a docstring stating the
      default explicitly — **absent means NOT required** (research R4; absent-means-required would
      make every existing publisher instantly report work the author does not owe) ·
      `packages/studio/src/lib/stepWalk.ts`
- [x] **T002** [P] Export the section-label resolver `stageLabel(stepId, i18n)` (currently module-
      private at `progressDots.ts:216`) so the nudge and the row draw section names from **one**
      shared source per FR-020 ·
      `packages/studio/src/decisions/progressDots.ts`

---

## Phase 2: Foundational — the one derivation (BLOCKS all user stories)

FR-009 requires exactly one derivation of "what does this section still owe", consumed by both the
row and the nudge. No story work begins until it exists and is unit-tested.

**Wave 1 — independent (different files):**

- [x] **T003** [P] Create the pure derivation: `OutstandingSection`, `OutstandingWork`,
      `OutstandingWorkInputs`, and `outstandingWork(inputs)` returning `sections` (manifest order),
      `byStepId`, and `nudgeTarget` (the manifest-earliest section **strictly behind**
      `activeStepId` that owes required work, else `null`). Count = uncovered inventory characters
      (from the injected `coverage` gate, never from `walks`) plus unanswered `required` walk stops;
      a section owing nothing is **absent**, never present with `0`. No store import, no
      `dashboard/` import; total over an empty `walks`, empty `visited`, and a terminal
      `activeStepId` (FR-009, FR-010, FR-011, FR-012, FR-015, FR-016) ·
      `packages/studio/src/lib/outstandingWork.ts`
- [~] **T004** [P] PARTIAL (Phase 3): `footer.dot.outstandingBehind` / `footer.dot.notYetReached` landed and `footer.dot.upcoming.ariaLabel` retired. The `nav.outstandingWork.*` ids land with US2 and the `output.*` ids with US3 — each via `messages:extract` in its own phase. Add the new message ids to the English catalog — `nav.outstandingWork.button`,
      `nav.outstandingWork.count`, `footer.dot.outstandingBehind`, `footer.dot.notYetReached`,
      `output.coverageComplaint.{title,body,proceed,goBack}`,
      `output.publishRefused.coverage`. New ids only; re-point nothing (FR-008, FR-021, FR-024,
      FR-026) · `packages/studio/src/locales/en/messages.json`
- [~] **T005** [P] PARTIAL (Phase 3): same split as T004. Add the same ids to the French catalog so both i18n tiers stay green under
      `pnpm lint` · `packages/studio/src/locales/fr/messages.json`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T006** [P] Unit-test the derivation, covering the four cases the spec's Test surface names:
      `outstandingWork({ walks: {}, coverage: blocked })` reports **both** galleries (the restored-
      draft case, FR-013); `nudgeTarget` ignores the current section and everything ahead (FR-018)
      and picks the manifest-earliest when several are owed (SC-005); a marked-for-later character
      still raises `count` (FR-014, A3); an unanswered **optional** stop contributes nothing
      (FR-007) · `packages/studio/src/lib/outstandingWork.test.ts`
- [x] **T007** [P] Add the React composition seam — reads `useInventoryCoverageGate()`,
      `useStepWalkStore`, `useSurveySessionStore` and the `stageLabel` resolver from T002, memoizes
      on those inputs, and calls `outstandingWork()`. Mirror `useAccountedForGate.ts` exactly; the
      hook holds every store read so the pure module holds none (FR-011, FR-016) ·
      `packages/studio/src/hooks/useOutstandingWork.ts`

---

## Phase 3: User Story 1 — See every section I walked, and which still owe work (P1)

**Goal**: the progress row carries one mark per activity page — one survey question, one marks
station, one gallery — for every section on the author's path, with passed-but-owing sections
visibly and nominally distinct from not-yet-reached ones.

**Independent Test**: walk a project to the Mechanism gallery and compare the row against the
manifest spine: every walked section has exactly one mark, except the marks series which has one
per visible station, and no mark is addressed to a letter.

### Tests (write these first; they must fail before the implementation waves)

**Wave 1 — independent (different files):**

- [x] **T008** [P] [US1] New unit test pinning the row's composition: an **exact ordered match** of
      the full `(step, kind)` sequence from `buildProgressDots` against the real
      `steps/manifest.ts` with a project open — not a subset matcher, not a minimum count, not a
      snapshot (SC-008, closing D-8). Same file asserts: a bypassed `spine: false` side trail
      contributes **no** mark (FR-003); at a terminal position every visited section reads complete;
      no `ProgressDot.id` is ever a character token (FR-033, SC-002); a marks series with two
      visible stations yields exactly two marks (SC-003) ·
      `packages/studio/src/decisions/progressDots.manifestRow.test.ts`
- [x] **T009** [P] [US1] Replace the shell-level assertion at `StudioShell.test.tsx:2614` —
      `querySelectorAll("[data-progress-dot-kind]").length` `.toBeGreaterThan(0)` passes with a
      single mark, which **is** the reported defect — with an exact expected count (research R8) ·
      `packages/studio/src/StudioShell.test.tsx`

### Implementation

**Wave 2 — independent (different files):**

- [x] **T010** [P] [US1] Give a passed section a mark: add a *behind*-position counterpart to
      `aheadStageDot` in the manifest pass of `buildProgressDots`. The existing fallback branch
      (`!isActiveStep && stepRecordDots.length === 0 && walkDotCount === 0`, `progressDots.ts:642`)
      currently calls `aheadStageDot`, which returns `null` for anything at or behind the author —
      so the branch exists and simply has nothing to call. Emit `kind: "completed"` when the
      section owes nothing and `kind: "upcoming"` (the existing hollow shape) plus
      `outstandingCount` when it does. Add `ProgressDot.outstandingCount?: number` and
      `ProgressDotsInput.outstandingByStepId?: ReadonlyMap<string, OutstandingSection>`.
      `ProgressDotKind` stays exactly `"completed" | "current" | "upcoming"` — no fourth member and
      no fourth `data-progress-dot-kind` value (FR-002, FR-006, FR-031, Q4; closes D-1/D-2) ·
      `packages/studio/src/decisions/progressDots.ts`
- [x] **T011** [P] [US1] Publish the marks series' within-step walk from its already-computed
      `visibleStations` array (`MarksSeriesStep.tsx:360`) — `publishStepWalk("marks", positions)`
      with `required: true` per station (A2), one position per **visible** station only. Honour an
      external arrival cursor to set `stationIndex`, **except** when the evidence-changed reset has
      fired, which keeps precedence (052 FR-023). The four station ids are already legal `Location`
      question segments and `liveResolveContext()` passes `stepPositions`, so this makes each
      station individually jumpable with no resolver change (FR-004; closes D-4) ·
      `packages/studio/src/survey/marks/MarksSeriesStep.tsx`
- [x] **T012** [P] [US1] Publish per-question `required` in the survey walk, sourced from the
      surface that owns the question rather than inferred by the row (FR-007) ·
      `packages/studio/src/survey/SurveyRunner.tsx`
- [x] **T013** [P] [US1] Publish `required: true` on character walk positions — every inventory
      character is required work (A1) · `packages/studio/src/hooks/useCharWalkPosition.ts`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T014** [US1] Thread `outstandingByStepId` from `useOutstandingWork()` into
      `buildProgressDots` exactly as `stepWalks` already arrives (the `decisions-layer` depcruise
      rule forbids `decisions/ -> stores/` even for a type-only import, so the derivation must be an
      input), and give the two hollow shapes **distinct accessible names** through the catalog:
      `footer.dot.outstandingBehind` when `outstandingCount` is present,
      `footer.dot.notYetReached` when it is not — branching on structure, not on a guess about
      position (FR-008, FR-020) · `packages/studio/src/components/StudioFooter.tsx`

**⟶ Wait for T014, then:**

- [x] **T015** [P] [US1] a11y test: an outstanding mark **behind** the author and an unreached mark
      **ahead** render the same shape and the same `data-progress-dot-kind="upcoming"` but have
      different accessible names (FR-008, house rule 9) ·
      `packages/studio/src/components/StudioFooter.a11y.test.tsx`
- [x] **T016** [P] [US1] Extend the marks-series test: two visible stations publish a two-position
      walk, each station addressable by its pinned id, and the evidence-changed reset still wins
      over an arrival cursor (FR-004, SC-003) ·
      `packages/studio/src/survey/marks/MarksSeriesStep.test.tsx`

**Checkpoint**: the row is honest on its own — every walked section has a mark, the marks series
contributes one per visible station, each gallery contributes exactly one whatever its inventory
size, and outstanding-behind is nominally distinct from not-yet-reached. Shippable with neither the
nudge nor the output change present.

---

## Phase 4: User Story 2 — Be told the first section that owes work, and taken there (P2)

**Goal**: one top-bar nudge names the earliest passed section that still owes required work, with
its count, and navigates through the single jump implementation.

**Independent Test**: leave required work in two different sections, confirm the nudge names the
earlier one, then confirm it settles to the later one once the first is finished.

> **Ordering is load-bearing here.** The nudge must not ship before the traversal primitive is
> generalized (T017), or D-6 is reintroduced for the duration of a commit (plan, Phase sequencing).

### Implementation

**Wave 1 — one task (blocks the rest of this phase):**

- [ ] **T017** [US2] Collapse `jumpToStep` (`surveySessionStore.ts:407/692`) and
      `backToUnfinishedGallery` (`:465/765`, typed today as `(target: "mechanisms" | "touch")`) into
      **one** section-id-taking backward-landing action: truncate `history` when the target is
      present in it, take the balanced-pop path when the target is in `visited` only. Backward-only
      — a target in neither stays a no-op, so a lock can never be skipped. This also closes a latent
      defect: `visited` is monotonic and is what `resolveLocation` gates on, so a target in
      `visited` but absent from `history` resolves `reachable` and `jumpToLocation` reports
      `arrived` while `jumpToStep` silently does nothing. No new state field; the
      `markedForLaterDesktop` / `markedForLaterTouch` slices keep their meaning (FR-019, research
      R6) · `packages/studio/src/stores/surveySessionStore.ts`

**⟶ Wait for T017, then migrate the four call sites — independent (different files):**

- [ ] **T018** [P] [US2] Call the unified action from the single jump implementation, replacing the
      `jumpToStep` call at `jumpToLocation.ts:154` · `packages/studio/src/lib/jumpToLocation.ts`
- [ ] **T019** [P] [US2] Migrate the Phase F gate's "go back and finish" off
      `backToUnfinishedGallery` (`PhaseFGate.tsx:37`) onto the unified action ·
      `packages/studio/src/editors/adapters/PhaseFGate.tsx`
- [ ] **T020** [P] [US2] Migrate the Output screen's back action (`OutputScreen.tsx:137`) ·
      `packages/studio/src/components/OutputScreen.tsx`
- [ ] **T021** [P] [US2] Migrate the shell's back action (`StudioShell.tsx:1664`) ·
      `packages/studio/src/StudioShell.tsx`

**⟶ Wait for Wave 2 to finish, then:**

- [ ] **T022** [US2] Replace `UnfinishedGalleryIndicator.tsx` with `OutstandingWorkNudge.tsx`: one
      slot, target = `useOutstandingWork().nudgeTarget`, absent (not empty, not disabled) when that
      is `null` (FR-022); label from the shared `stageLabel` source so the nudge and the row name a
      section identically (FR-020); strings through the new `nav.outstandingWork.*` ids (FR-021);
      activation does nothing but `jumpToLocation(target.location)`, so it inherits the same
      reachability resolution and the same refusal rules as a row mark (FR-017, FR-019; closes
      D-5/D-6). `data-testid="nav-outstanding-work"`. **Delete** the old component rather than
      leaving it orphaned · `packages/studio/src/components/OutstandingWorkNudge.tsx` (deletes
      `packages/studio/src/components/UnfinishedGalleryIndicator.tsx`)

**⟶ Wait for T022, then:**

- [ ] **T023** [US2] Wire the single nudge into the top bar, replacing the two
      `UnfinishedGalleryIndicator` usages (desktop + touch) that today render side by side ·
      `packages/studio/src/StudioShell.tsx`

**⟶ Wait for T023, then — tests, independent (different files):**

- [ ] **T024** [P] [US2] Update the store suite for the unified action: history truncation when the
      target is in `history`; the balanced-pop path when it is in `visited` only (the case
      `backToUnfinishedGallery` existed for, standing on `help`); still a no-op for a target in
      neither; the existing history-corruption regression assertions preserved ·
      `packages/studio/src/stores/surveySessionStore.test.ts`
- [ ] **T025** [P] [US2] Rename and rewrite the nudge's test: absent when nothing behind is owed
      (FR-022); names the manifest-earliest owed section when several are owed (SC-005); silent when
      the only owed section is the current one (FR-018); still names the gallery after a letter is
      marked for later (FR-014, Q7); its label matches the row's label for the same section
      (FR-020); activation routes through `jumpToLocation` (FR-019) ·
      `packages/studio/src/components/OutstandingWorkNudge.test.tsx` (renames
      `UnfinishedGalleryIndicator.test.tsx`)
- [ ] **T026** [P] [US2] Update the remaining `backToUnfinishedGallery` references to the unified
      action name · `packages/studio/src/components/wizardEntryPoints.test.tsx`,
      `packages/studio/src/editors/adapters/PhaseFGate.test.tsx`

**Checkpoint**: exactly one nudge, naming the earliest owed section behind the author, navigating
through the one jump implementation with real refusal reasons — and correct after a reload, because
its count comes from the working copy.

---

## Phase 5: User Story 3 — Download an unfinished keyboard; never publish one (P2)

**Goal**: an author with an unplaced letter can reach Output, is told loudly what is missing, can
download both artifacts after an explicit acknowledgement, and cannot publish.

**Independent Test**: leave one character unimplemented, reach Output, download the `.kmp` and the
`.zip`, and confirm the community-submission control refuses.

### Implementation

**Wave 1 — one task (blocks the rest of this phase):**

- [ ] **T027** [US3] Split publish from download in `usePreviewArtifact`. Remove **exactly one**
      term — `!coverageGate.blocked` — from the five-term `canDownload` conjunction
      (`usePreviewArtifact.ts:324`); `stage.kind === "ready"`, `isInstantiated`,
      `!attributionMissing`, and `licenseUnparseable === null` all stand unchanged, as does
      `touchStale` in the button handlers (FR-030, 059 D5/D6). Add `canPublish: boolean` carrying
      its **own** coverage term — derived independently, never from `canDownload`, so a later edit
      to download cannot silently open publish (FR-027) — plus
      `publishBlockReason: string | null` and
      `coverageComplaint: { count; chars; sectionLabel } | null` as the complaint's payload
      (FR-023, FR-026) · `packages/studio/src/hooks/usePreviewArtifact.ts`

**⟶ Wait for T027, then relax the three arrival gates — independent (different files):**

- [ ] **T028** [P] [US3] Relax the actual hard gate: the `help` case at `advance.ts:255` returns
      `{ next: "help" }` while coverage is blocked; make it unconditionally
      `{ next: "done", navigate: "output" }` (FR-028) · `packages/studio/src/steps/advance.ts`
- [ ] **T029** [P] [US3] Turn the Phase F gate from a refusal into a **warning** that names the
      outstanding work (from `useOutstandingWork()`) and lets the author pass ·
      `packages/studio/src/editors/adapters/PhaseFGate.tsx`
- [ ] **T030** [P] [US3] Drop `aria-disabled` from the Output nav tab (`StudioShell.tsx:1649`,
      `outputNavBlocked`) so the tab is usable; keep the explanatory `title` as the warning
      (FR-028) · `packages/studio/src/StudioShell.tsx`

**⟶ Wait for Wave 2 to finish, then:**

- [ ] **T031** [US3] Output screen: raise the coverage complaint before either artifact is produced,
      reusing `editors/assignLoop/parts/ConfirmDialog.tsx` — it already routes Escape/backdrop to a
      chosen action and documents "Escape/backdrop = cancel/stay, never an implicit confirm", which
      is FR-025 exactly, so **no new dismissal semantics are written**. The dialog names the missing
      characters and the owning section, offers "Go back and finish" and "Download anyway"
      (`data-testid` `output-coverage-complaint`, `-proceed`, `-goback`), and indirect dismissal
      produces nothing. Change `canSubmit={canDownload}` at `OutputScreen.tsx:715` to
      `canSubmit={canPublish}` — that single line is the whole of D-7. Reword the coverage banner to
      state that download is possible and submission is not, **keeping** the
      `output.status.coverageBlocked` id (its meaning is unchanged; only its consequence clause
      moves — spec 046) (FR-024, FR-025, FR-026, FR-029) ·
      `packages/studio/src/components/OutputScreen.tsx`

**⟶ Wait for T031, then — independent (different files):**

- [ ] **T032** [P] [US3] Rewire the submission panel's props onto `canPublish` /
      `publishBlockReason` and surface the refusal reason visibly (FR-026); update its test ·
      `packages/studio/src/components/ManagedPRSubmitPanel.tsx`,
      `packages/studio/src/components/ManagedPRSubmitPanel.test.tsx`
- [ ] **T033** [P] [US3] Pin FR-027: `canPublish` is `false` while coverage is blocked **even when**
      `canDownload` is `true`; and coverage-blocked no longer subtracts from `canDownload` while the
      other four terms and `touchStale` still do ·
      `packages/studio/src/hooks/usePreviewArtifact.coverageGate.test.ts`
- [ ] **T034** [P] [US3] Component test with coverage incomplete: both download controls enabled,
      the complaint raised and naming the missing characters plus their section, Escape and backdrop
      each produce **no** artifact (FR-025), "Download anyway" produces the `.kmp`, and the
      submission control is refused **while** download is permitted, on the same screen in the same
      session (FR-024…FR-027, SC-006) ·
      `packages/studio/src/components/OutputScreen.coverageBanner.test.tsx`

**⟶ Wait for Wave 4 to finish, then:**

- [ ] **T035** [US3] E2E: walk to Output with one uncovered character, download the `.kmp` and the
      `.zip` through the complaint, confirm submission refuses; then reload mid-build and confirm
      the nudge and the outstanding mark both survive (SC-004, SC-006, FR-013) ·
      `packages/studio/e2e/outstanding-work.spec.ts`

**Checkpoint**: coverage now blocks only the consequential action. An incomplete keyboard is
reachable, loudly complained about, downloadable on an explicit choice, and unpublishable by its own
independent term.

---

## Phase 6: Polish — corpus, non-regression, gates

**Wave 1 — independent (different files):**

- [ ] **T036** [P] Amend 057: **FR-042** gains a completed-**section** class (or generalizes
      "completed question" to "completed stop" covering both) — a finished section that asked no
      questions falls into none of today's three classes, which **is** D-1; **FR-043** gains the
      "outstanding behind" name beside "not yet reached"; and the data-model note plus the
      within-step-dots handoff caveat are reconciled — `marks` becomes multi-mark while
      `convenience` and `carve` stay single-mark **by design**, one page each, rather than by
      omission · `specs/057-bulletproof-navigation/spec.md`
- [ ] **T037** [P] Record the download-versus-publish policy as a 061 decision — it is user-visible
      contract, not an implementation detail · `docs/spec-signoff.md`
- [ ] **T038** [P] Retire the four two-destination nudge ids —
      `nav.unfinishedGallery.{desktop,touch}.{button,count}` — from both catalogs, together with
      their component rather than left orphaned · `packages/studio/src/locales/en/messages.json`,
      `packages/studio/src/locales/fr/messages.json`
- [ ] **T039** [P] Verify SC-007 and FR-032: the footer's height is unchanged and the current-
      position mark stays visible without manual scrolling at the narrowest supported width, with
      the row roughly a third longer — horizontal scroll, no silent truncation (057 FR-047) ·
      `packages/studio/e2e/footer-progress.spec.ts`

**⟶ Wait for T036 and T037 to finish, then:**

- [ ] **T040** Acknowledge the spec-corpus edits in the **same commit** as the prose changes ·
      `node utilities/spec-trace acknowledge` (verify with `node utilities/spec-trace check`)

**⟶ Wait for everything above, then:**

- [ ] **T041** Full gate, and confirm the Success Criteria: `pnpm typecheck`, `pnpm -r test`,
      `pnpm lint` (ESLint + `depcruise` — the `decisions-layer` rule is the one T010/T014 must stay
      inside — plus both i18n tiers), the `/api` suite, and the spec-trace suite. Confirm no
      validation timer was introduced (FR-034) and that the coverage predicate's fail-closed
      behaviour on a corrupted touch layout, including its deliberate disregard of marked letters in
      that state, is preserved unchanged (FR-035) · repo root

---

## Dependencies & Execution Order

**Phase order**: Setup (T001–T002) → Foundational (T003–T007) → US1 (T008–T016) → US2
(T017–T026) → US3 (T027–T035) → Polish (T036–T041).

- **Setup** — one wave: T001 and T002 are independent (different files).
- **Foundational** — Wave 1 (T003, T004, T005) all independent; **blocks** Wave 2 (T006, T007),
  which are independent of each other. This whole phase blocks every story: T014, T022, T029 and
  T031 all consume `useOutstandingWork()`.
- **US1** — Wave 1 tests (T008, T009) independent, written to fail first. Wave 2 implementation
  (T010, T011, T012, T013) all independent. **T010 blocks T014** (the footer needs the new input
  and the `outstandingCount` field). T014 then blocks T015; T011 blocks T016.
- **US2** — **T017 blocks the whole phase.** Its four call-site migrations (T018–T021) are
  independent, and block T022 (the nudge must not exist before the primitive is generalized, or D-6
  returns for a commit). T022 blocks T023; T023 blocks the test wave (T024, T025, T026), which are
  independent of each other.
- **US3** — **T027 blocks the whole phase.** The three arrival relaxations (T028, T029, T030) are
  independent and block T031; T031 blocks the test wave (T032, T033, T034), which are independent;
  that wave blocks T035.
- **Polish** — T036, T037, T038, T039 independent. T036 + T037 block T040 (acknowledge only what
  has been written). Everything blocks T041, which runs last and alone.

**Parallel opportunities**: the widest waves are Foundational Wave 1 (3 tasks), US1 Wave 2 (4
tasks), US2 Wave 2 (4 call-site migrations), and Polish Wave 1 (4 tasks). Across phases there is no
parallelism to take: each story's first task is a single-file change that everything else in the
phase reads.

**Cross-phase file contention** — these files are edited in more than one phase, and never twice in
one wave: `decisions/progressDots.ts` (T002, T010), `StudioShell.tsx` (T021, T023, T030),
`components/OutputScreen.tsx` (T020, T031), `editors/adapters/PhaseFGate.tsx` (T019, T029),
`locales/{en,fr}/messages.json` (T004/T005, T038).
