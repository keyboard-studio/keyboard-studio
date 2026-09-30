# Tasks: Per-keyboard decision audit (CYOA Phase 1 — record and review)

**Feature Branch**: `053-decision-audit`

**Inputs**: [spec.md](spec.md) · [plan.md](plan.md) · [research.md](research.md) · [data-model.md](data-model.md) · [contracts/decision-record.contract.md](contracts/decision-record.contract.md) · [contracts/trail-ui.contract.md](contracts/trail-ui.contract.md)

**Owner**: Engine team (Constitution Article VI)

Line format: `- [ ] **T###** [P?] [US#] Description · exact/file/path`. `[P]` marks a task independent of the others in its wave (different file, no incomplete dependency). Waves are separated by explicit join lines — same-file or dependent tasks are never in the same wave.

**Phase policy**: this feature has three user stories, so `implement` stops after each user-story phase and resumes in a fresh conversation (plan.md "Phase policy note"). Setup + Foundational ride with US1; Polish rides with US3.

---

## Phase 1: Setup

- [x] **T001** Scaffold the two new module folders with barrel files (`export {}` placeholders, filled in Phase 2) and confirm no new npm dependency is introduced — the line differ is engine-local per research D-06, so `pnpm install` and the lockfile stay untouched · `packages/engine/src/decision-audit/index.ts`, `packages/studio/src/decisions/index.ts`

**⟶ Wait for Setup to finish, then:**

---

## Phase 2: Foundational (BLOCKS all user stories)

The record's types, its engine derivation surface, and its persistence spine. No user-story work begins until this phase is done.

**Wave 1 — single task (every other task in this phase imports from it):**

- [x] **T002** Define the canonical types per [contracts/decision-record.contract.md](contracts/decision-record.contract.md) §1 — `DecisionEventKind`, `DecisionAgency`, `DecisionProposalSource`, `DecisionProvenance`, `EditorActionType`, `EditorActionSummary`, `DiffHunk`, `ImpactUnavailableReason`, `DecisionImpact`, `DecisionPayload`, `DecisionEntry`, `DecisionRecord`, `DECISION_RECORD_FORMAT`, `DECISION_RECORD_VERSION`, `PRE_IDENTITY_STEP_ID`. Import `AnswerType` from `./pattern` and do **not** redeclare it; carry `kind` on `payload` as the discriminant; do **not** extend `SurveyAnswer` (FR-001, FR-007; research D-01/D-03/D-10) · `packages/contracts/src/decisionRecord.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T003** [P] Add the zod runtime mirror — `DecisionRecordSchema`, `DecisionEntrySchema`, `DecisionProvenanceSchema`, `DecisionImpactSchema`, `DiffHunkSchema`, `EditorActionSummarySchema` — plus `Expect<AssignableTo<…>>` drift guards in the established form. **Must land in the same commit as T002** (Constitution Article I) · `packages/contracts/src/schemas.ts`
- [x] **T004** [P] Re-export the new module: `export * from "./decisionRecord";` · `packages/contracts/src/index.ts`
- [x] **T005** [P] Implement `diffLines(before, after, contextLines = 3)` — LCS line diff over `.kmn` text emitting unified `DiffHunk[]` with 3 lines of context, deterministic for identical inputs (research D-06; contract §6 diff-context bound) · `packages/engine/src/decision-audit/lineDiff.ts`
- [x] **T006** [P] Unit-test the differ: identical input yields no hunks; single-line insert/delete/replace; hunk coalescing at 3-line context; determinism across two runs · `packages/engine/src/decision-audit/lineDiff.test.ts`
- [x] **T007** [P] Implement `serializeDecisionRecord` (stable key order, byte-identical for equal input) and `parseDecisionRecord` (never throws) with `ParseDecisionRecordResult { record, droppedCount, unreadable }`, honouring every row of contract §5: absent/empty, non-JSON, unrecognised `version`, invalid entries dropped in place, dangling `supersedes` degraded to `null` with the entry kept, duplicate `entryId` dropped and counted (SC-009) · `packages/engine/src/decision-audit/record.ts`
- [x] **T008** [P] Implement the append-only store slice — `append`, `supersede`, `read`, `hydrate` — exposing no mutation of existing entries; a revisit that re-records an identical value for the same `(stepId, questionId)` is a no-op; supersession forms chains, never trees (FR-003, SC-002; data-model *State transitions*) · `packages/studio/src/decisions/decisionLogStore.ts`
- [x] **T009** [P] Add `decisionRecord?: DecisionRecordSnapshot` to `DurableDraft` as an additive optional field — **no `DRAFT_VERSION` bump**, following the `phaseBDraft` precedent (research D-08, SC-009) · `packages/studio/src/lib/draftTypes.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T010** [P] Implement `shedDecisionDetail(record, maxBytes)` — drop `impact` payloads largest-serialized-first, ties broken by oldest `recordedAt`, until the serialized record fits; set `truncated: { shedCount }`; never touch `entryId`, `payload`, `provenance`, or `supersedes` (research D-09, SC-002) · `packages/engine/src/decision-audit/shed.ts`
- [x] **T011** [P] Test round-trip and version tolerance: serialize→parse identity, each contract §5 row, and that a record written by this build is an ignorable unknown field for a build without the feature (SC-009) · `packages/engine/src/decision-audit/record.test.ts`
- [x] **T012** [P] Test the store slice: append monotonicity across arbitrary navigation sequences, superseded entries stay retrievable, identical-revisit no-op, no in-place mutation (SC-002) · `packages/studio/src/decisions/decisionLogStore.test.ts`
- [x] **T013** [P] Implement `recordSurveyAnswers` — fan a `SurveyPhaseResult` out into one entry per answer, carrying `questionId` / `answerType` / `value` and deriving `DecisionProvenance` (`agency` + optional `source`) from the answer's origin (FR-001, research D-03) · `packages/studio/src/decisions/recordSurveyAnswers.ts`
- [x] **T014** [P] Implement `recordEditorStep` — aggregate one editor step into a single `editor-action` entry with a structured `EditorActionSummary` (counts by category plus a ≤12-identifier `sample`, setting `sampleTruncated` beyond that); a return visit to a completed step appends a superseding entry (FR-002; contract §6 sample bound) · `packages/studio/src/decisions/recordEditorStep.ts`
- [x] **T015** [P] Implement `snapshotSource` — at a step boundary, read the emitted `.kmn` text already produced by `projectWorkingCopyVfs` and return the net `diffLines` against the previous boundary's text. Read only; adds no projection pass and no serialization path (FR-008/FR-009, SC-005; research D-04) · `packages/studio/src/decisions/snapshotSource.ts`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — independent (different files):**

- [x] **T016** [P] Export the decision-audit surface: barrel it in `decision-audit/index.ts`, re-export through `output/index.ts`, and add the public names to the engine root index alongside the existing `isSidecarPath` / `buildImportAttributionBlock` exports · `packages/engine/src/decision-audit/index.ts`, `packages/engine/src/output/index.ts`, `packages/engine/src/index.ts`
- [x] **T017** [P] Wire persistence: save and load `decisionRecord` through the existing `saveDraft` / `loadDraft`, and run `shedDecisionDetail` with `MAX_CLOUD_DRAFT_BYTES` **before** the existing cloud-size check so the failure mode is "less detail", not "no sync". No new debounce timer — reuse `AUTOSAVE_DEBOUNCE_MS` / `CLOUD_SYNC_DEBOUNCE_MS` as-is (FR-005, Constitution Article IV; research D-08/D-09) · `packages/studio/src/lib/draftPersistence.ts`
- [x] **T018** [P] Add the injected `recordDecision` callback to `ReducerDeps` and call it from `applyStepCompletion` — injection, not import, because `steps/` may not import `stores/`, `lib/`, or `components/` (research D-02) · `packages/studio/src/steps/reducer.ts`

**⟶ Wait for Wave 4 to finish, then:**

**Wave 5 — single task (the integration point all of the above converges on):**

- [x] **T019** Inject `recordDecision` at the injection site alongside the existing `setTouchSeedSource` injection, composing `recordSurveyAnswers` + `recordEditorStep` + `snapshotSource` over the store; carry pre-identity entries forward verbatim when the keyboard identity is assigned, changing only `keyboardId` (FR-004) · `packages/studio/src/StudioShell.tsx`

- [x] **T020** Test the recording spine end-to-end at the reducer seam: a step completion with survey answers appends one entry per answer; an editor step appends exactly one aggregated entry; recording is inert with respect to the artifact — an identical session with and without `recordDecision` injected produces an identical projected VFS (FR-006, SC-001, SC-006) · `packages/studio/src/steps/reducer.decisionRecording.test.ts`

**Checkpoint**: decisions are recorded, persisted, and survive a reload. Nothing is user-visible yet.

**⟶ Wait for Foundational to finish, then:**

---

## Phase 3: US1 — Author reviews what their decisions did (P1) 🎯 MVP

**Goal**: an author opens the decision trail for their keyboard and sees every decision as one plain-language line, expandable to the exact source change, with revisits shown as history.

**Independent Test**: complete an authoring session, open the trail, confirm every decision appears with a readable headline and an accurate expandable change; close and reopen the studio and confirm the trail is intact.

### Tests

- [x] **T021** [P] [US1] Write the failing trail behaviour tests against the contract's selectors: ordered rendering in append order, `decision-entry-headline` distinguishes `tool-proposed` from `hand-set` for the same value, `decision-entry-expand` reveals `decision-entry-impact`, superseded entries present in the DOM behind `decision-superseded-toggle`, `data-entry-id` on every row (FR-012/013/014/015) · `packages/studio/src/decisions/DecisionTrailView.test.tsx`
- [x] **T022** [P] [US1] Write the failing state-coverage tests: empty record renders `decision-trail-empty`; `truncated` non-null renders `decision-trail-truncated`; `droppedCount > 0` renders `decision-trail-partial`; `impact.state === "none"` renders the positive "changed nothing" string, never an empty diff; `impact.state === "unavailable"` renders the reason; `impact === null` renders the shed notice (spec Edge Cases, FR-011) · `packages/studio/src/decisions/DecisionEntryRow.test.tsx`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T023** [P] [US1] Implement on-request impact: return the stored capture for editor-action entries; for survey answers derive the counterfactual by re-running the question module's pure `mutate(value, ctx)` against the recorded pre-decision IR and diffing the results. Where no `mutate()` module exists or the seam is disabled, return `{ state: "unavailable", reason: "no-rederivable-write-path" }`; where the step sits behind a passed lock gate (`Step.lock`), return `"lock-gate-dependency"`. Never eager — computed only for the requested entry (FR-008/010/011; research D-05/D-11) · `packages/studio/src/decisions/impact.ts`
- [x] **T024** [P] [US1] Compose the localized headline in the studio from the entry's structured payload and provenance — never from an engine-prerendered string: `trail.entry.headline.chose`, `.acceptedSuggested`, `.fromBase`, `.editorStep` with counts interpolated (FR-013, FR-016) · `packages/studio/src/decisions/headline.ts`
- [x] **T025** [P] [US1] Add `"trail"` to `RouteId`, unconditionally valid — it is a production surface, not a developer aid (FR-017; contract trail-ui §1) · `packages/studio/src/lib/navigate.ts`
- [x] **T026** [P] [US1] Add every new author-facing message id under the `trail.` prefix plus `nav.decisionTrail`, per the contract's §3 table, and extract with the existing lingui pipeline; add the `fr` entries (key-set parity lints apply) (FR-016) · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/fr/messages.json`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T027** [P] [US1] Implement the entry row: `data-testid="decision-entry"` with `data-entry-id`, `decision-entry-headline`, `decision-entry-expand` → `decision-entry-impact`, `decision-entry-superseded` marker, and the four impact states (captured hunks / none / unavailable+reason / shed) · `packages/studio/src/decisions/DecisionEntryRow.tsx`
- [x] **T028** [P] [US1] Unit-test headline composition across the three `agency` literals × an optional `source`, and the editor-step count interpolation (FR-013) · `packages/studio/src/decisions/headline.test.ts`
- [x] **T029** [P] [US1] Unit-test impact derivation: stored capture returned verbatim for editor actions; `no-rederivable-write-path` with the mutate seam off (its shipped default); `lock-gate-dependency` behind a passed lock; nothing computed for an unexpanded entry (FR-010/011) · `packages/studio/src/decisions/impact.test.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — single task (composes the row, headline, and impact):**

- [x] **T030** [US1] Implement the trail view: `decision-trail` root, empty / truncated / partial notices, entries in append order, superseded entries collapsed by default behind `decision-superseded-toggle`. The list mounts computing **no** impact — SC-007's "no perceptible delay" is structural, not an optimisation · `packages/studio/src/decisions/DecisionTrailView.tsx`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — independent (different files):**

- [x] **T031** [P] [US1] Mount the `trail` route and add the nav entry for the active keyboard alongside the existing `output` / `preview` entries · `packages/studio/src/StudioShell.tsx`
- [x] **T032** [P] [US1] Add a per-row link to each project's trail, working for `status: "submitted"` rows too — the record is read-only after submission and stays viewable (spec Edge Cases) · `packages/studio/src/components/MyKeyboardsList.tsx`

**Checkpoint**: US1 is independently functional and testable — an author can complete a session, open the trail, read every decision, expand its change, and find the trail intact after a restart. The feature delivers value here even if nothing ships to a reviewer.

**⟶ Wait for US1 to finish, then:**

---

## Phase 4: US2 — Reviewer sees decision-to-source evidence at review time (P2)

**Goal**: a reviewer reads the ordered decision summary in the pull-request description without installing the studio, and finds a machine-readable record in the downloaded package — while the committed source tree gains zero files.

**Independent Test**: open a pull request from a completed session and confirm the description contains the bounded decision summary; download the package and confirm it contains `.studio/decision-record.json` matching the trail.

### Tests

- [x] **T033** [P] [US2] Write the failing packaging guarantees test per contract §3: the zip contains `.studio/decision-record.json`; `isSourceFile(".studio/decision-record.json") === false`; the `publishPR` commit tree has no `.studio/` entry; the committed tree for a session **with** the feature equals the tree **without** it (FR-019, SC-008) · `packages/engine/src/output/sidecar.decisionRecord.test.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T034** [P] [US2] Implement `buildDecisionSummaryBlock(record, { maxEntries = 25 })` — a pure markdown-returning function mirroring `buildImportAttributionBlock`, English and unlocalized (the established precedent for engine-built PR blocks). Beyond `maxEntries`, state that the complete detail is in the packaged record (FR-018, FR-022; contract §6) · `packages/engine/src/decision-audit/prSummary.ts`
- [x] **T035** [P] [US2] Extend `isSidecarPath` to return `true` for any path starting with `STUDIO_METADATA_PREFIX` (`.studio/`) — **added, not substituted**: the existing `.kmn.imported` / `.kmn.imported.sha256` matches are unchanged. Export `DECISION_RECORD_VFS_PATH` and `STUDIO_METADATA_PREFIX` (research D-07) · `packages/engine/src/output/sidecar.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T036** [P] [US2] Implement `addDecisionRecordSidecar(vfs, record)` — idempotent write of the serialized record into the projected VFS at `DECISION_RECORD_VFS_PATH`, using the completed-instance-compatible schema of contract §4 (no `flow_id`; editor activity additive) (FR-020, FR-021) · `packages/engine/src/decision-audit/sidecar.ts`
- [x] **T037** [P] [US2] Test the PR summary: ordered, human-readable, decision→consequence pairing readable without the studio; bounded at 25 entries with the pointer to the packaged record beyond it (SC-004, US2-AS4) · `packages/engine/src/decision-audit/prSummary.test.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T038** [P] [US2] Emit the record into the zip via `addDecisionRecordSidecar`, and name the studio-metadata paths in the injected `NEXT_STEPS.md` as **not to be copied** into `release/<letter>/<id>/` (contract §3, research D-07) · `packages/engine/src/output/zip.ts`
- [x] **T039** [P] [US2] Append the bounded decision block to `prBody` at submission time, generated from the record as it stands — not maintained incrementally (FR-018, spec Assumptions) · `packages/studio/src/components/ManagedPRSubmitPanel.tsx`

**Checkpoint**: US2 is independently functional and testable — a reviewer with no studio access can read the decisions from the pull-request description alone, the package carries the structured record, and the committed tree is byte-identical to a hand-authored keyboard's.

**⟶ Wait for US2 to finish, then:**

---

## Phase 5: US3 — Developer traces the path a keyboard took through the flow (P3)

**Goal**: the existing developer flow map highlights the path a selected keyboard actually took, and a single inspected decision can be asked what a different answer would have produced.

**Independent Test**: open the flow map with a recorded keyboard selected and confirm the walked path is distinguishable from unwalked branches, and that one alternative-answer comparison can be requested and returned.

### Tests

- [x] **T040** [P] [US3] Write the failing identity test for FR-024: with the overlay prop absent, `flowmap-path-overlay` is not in the DOM and the render output is **snapshot-equal** to the current no-overlay render — an identity, not a similarity (contract trail-ui §5) · `packages/studio/src/dashboard/FlowGraphView.pathOverlay.test.tsx`

### Implementation

**Wave 1 — single task (the projection everything else in this phase reads):**

- [x] **T041** [US3] Implement `buildPathOverlay(record): PathOverlay` — `walkedSteps` and `walkedEdges` (`${fromStepId}->${toStepId}`) projected over the existing `StepGraph`. Contributes no node, no edge, and no ordering: **ADR-0001 is not reversed** and `buildStepGraph` stays the only source of graph structure (FR-023) · `packages/studio/src/dashboard/pathOverlay.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T042** [P] [US3] Render the overlay: traversed steps and edges styled distinctly from untraversed; overlay layer carries `data-testid="flowmap-path-overlay"` and is **absent** when the prop is absent. Untaken branches render structural information only — nothing is derived for them (FR-023, FR-024, FR-027) · `packages/studio/src/dashboard/FlowGraphView.tsx`
- [x] **T043** [P] [US3] Unit-test the projection: walked steps and edges derived from a recorded record; superseded entries do not double-count an edge; an empty record yields empty sets · `packages/studio/src/dashboard/pathOverlay.test.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — single task (the wiring seam that must not break the dashboard boundary):**

- [x] **T044** [US3] Compute the overlay where the store is reachable and pass it into the flow map as a prop, exactly as `completenessReport` and `axisFills` are passed today — `packages/studio/src/dashboard/` gains **no** `stores/` import. The route stays behind the existing `SHOW_FLOWMAP` gate, so FR-025 needs no new mechanism (research D-12) · `packages/studio/src/StudioShell.tsx`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — single task:**

- [x] **T045** [US3] Surface the one-branch-deep alternative at an inspected node: reuse `impact.ts` (T023) to return that node's counterfactual and no other; where it cannot be derived, show the branch's structural information plus the localized reason, never a failure (FR-026, FR-027, FR-028) · `packages/studio/src/dashboard/FlowGraphView.tsx`

**Checkpoint**: US3 is independently functional and testable — the walked path is visible in the dev flow map, one alternative can be requested at a time, and production builds are unchanged.

**⟶ Wait for US3 to finish, then:**

---

## Phase 6: Polish & Success-Criteria validation

**Wave 1 — independent (different files):**

- [x] **T046** [P] Validate the artifact-independence criteria end-to-end: run a scripted session twice, once with recording enabled and once with `recordDecision` absent, and assert the projected VFS and the emitted zip are identical (FR-006, SC-006, SC-008) · `packages/studio/src/decisions/artifactIndependence.test.ts`
- [x] **T047** [P] Validate audit-versus-artifact agreement: for a set of recorded steps, assert each entry's captured hunks re-apply to the previous boundary's `.kmn` text to produce exactly the shipped text (SC-005) · `packages/studio/src/decisions/snapshotSource.test.ts`
- [x] **T048** [P] Validate SC-009 in both directions: a draft saved without `decisionRecord` loads in this build as an empty record; a draft saved by this build loads in a build that ignores the field · `packages/studio/src/lib/draftPersistence.decisionRecord.test.ts`
- [x] **T049** [P] Update the keyboard phonebook if any keyboard was newly referenced by a fixture added in this feature, and record the FR-020 deferral (positional nesting under `<id>/` is a Keyman-team-facing call, research D-07) where a reader of the output path will find it · `docs/keyboard-index.md`, `packages/engine/src/output/zip.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — single task:**

- [x] **T050** Run the full gate — `pnpm typecheck`, `pnpm -r test`, `pnpm lint` (which runs `depcruise`, `crew-lint`, the facet lints, and both i18n catalogue lints, including `fr` key-set parity for the new `trail.` ids) — and fix anything they surface · repo root

---

## Dependencies & Execution Order

**Phase order**: Setup (T001) → Foundational (T002–T020) → US1 (T021–T032) → US2 (T033–T039) → US3 (T040–T045) → Polish (T046–T050). Each user-story phase is a demoable increment; US2 and US3 depend on the Foundational record existing, not on US1's trail UI.

**Foundational waves**: T002 (contracts types) blocks everything → Wave 2 (T003–T009: schema mirror, re-export, differ + its test, serialize/parse, store slice, draft field) → Wave 3 (T010–T015: shed, record tests, store tests, the three recording modules) → Wave 4 (T016–T018: engine exports, persistence wiring, reducer dep) → Wave 5 (T019 injection, then T020 spine test).

**US1 waves**: tests T021–T022 first (written to fail) → Wave 1 (T023–T026: impact, headline, route, catalogues) → Wave 2 (T027–T029: entry row, headline test, impact test) → Wave 3 (T030 trail view, which composes them) → Wave 4 (T031–T032: shell route + saved-keyboards link).

**US2 waves**: test T033 first → Wave 1 (T034 PR block, T035 sidecar path predicate) → Wave 2 (T036 sidecar writer, T037 summary test) → Wave 3 (T038 zip + NEXT_STEPS, T039 PR body).

**US3 waves**: test T040 first → Wave 1 (T041 overlay projection) → Wave 2 (T042 render, T043 projection test) → Wave 3 (T044 prop wiring) → Wave 4 (T045 one-branch alternative, which reuses T023).

**Polish waves**: Wave 1 (T046–T049, independent validations and docs) → Wave 2 (T050 full gate).

**Cross-phase note**: T045 reuses `impact.ts` from T023, so US3 cannot start before US1's Wave 1 has landed. This is the only dependency that crosses a story boundary.

### Parallel opportunities

The widest waves are Foundational Wave 2 (seven independent files), Foundational Wave 3 (six), and US1 Wave 1 (four). Each user story's `Tests` block is independent of every other task in its phase and can be written while the previous phase's Polish is still running.

### Constitution gates carried into implementation

- **Article I** — T003's zod mirror and drift guards must land in the same commit as T002. A schema and its interface diverging fails the build by design.
- **Article III** — T015 retains a snapshot of a projection the live preview already runs; the plan's Constitution Check flags this retention seam for reviewer sign-off. Do not add a serialization pass to satisfy it.
- **Article IV** — no new debounce timer anywhere in T017. Snapshots are taken on step-completion events, not on a timer.
- **Article VIII** — no emoji in console output; markdown links in user-facing text; no GitHub issue numbers in shipped code or comments; commits as `feat(contracts)` / `feat(engine)` / `feat(studio)`.
