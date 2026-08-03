# Tasks: Legible decision trail

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Branch**: `055-legible-decision-trail` · **Size**: oversized

42 tasks across 8 phases. Every phase is laid out as **waves**: tasks in one wave touch different files and have no incomplete dependency on each other, so they can be built in any order (or fanned out). A join line between waves marks where work has to wait.

Design sources each task codes against: [data-model.md](data-model.md), [contracts/record-shape.contract.md](contracts/record-shape.contract.md), [contracts/headline-spec.contract.md](contracts/headline-spec.contract.md), [contracts/catalog-audit-label.contract.md](contracts/catalog-audit-label.contract.md), and the eleven decisions in [research.md](research.md).

---

## Phase 1: Setup — the tooling prerequisite with a hard ordering obligation

The `audit_label` lint rule **must land before the first `audit_label` value** (research D-08). `content/i18n/fr/flowQuestions.json` exists, so French has "started" the catalog, and today's whole-key-set parity would fail the moment one optional key appears in English.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Teach `checkTargetLocaleParity` per-key optionality: a target-locale catalog MAY omit a key matching `content.flowQuestion.*.audit_label` without being reported missing; an **extra** key still fails; every other key stays strictly parity-checked · `utilities/content-i18n-lint/index.js`
- [x] **T002** [P] Add `audit_label` to the field list `extractFlowQuestionStrings` walks alongside `prompt` / `label` / `body` / `help_text`, emitted only when non-empty after trim (same guard the other four use); demoted `registry.reserve.ts` modules stay excluded · `utilities/i18n-content-extract/extract.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T003** Confirm the prerequisite holds with no value authored yet: `pnpm run content-i18n-lint` and `pnpm run content-i18n-freshness` both green with `fr/flowQuestions.json` present · (verification only — no file edit)

---

## Phase 2: Foundational — the record-shape reshape (BLOCKS every story)

The contracts change breaks every consumer by design: with the counts optional, an unwired producer fails typecheck instead of silently reporting `0` (research D-06). Nothing below this phase ships until every consumer handles absence explicitly (FR-005a).

**Wave 1 — the contract, one commit (interface + zod mirror move together or the drift guards fail the build):**

- [x] **T004** Reshape the record contract per [record-shape.contract.md](contracts/record-shape.contract.md) §2–§5, landing the interface and its zod mirror **in the same commit**: (a) `EditorActionSummary`'s four counts → `number | undefined`, mirrored with `.optional()` and never `.default(0)`; (b) new `DecisionFileChange`, and `DecisionImpact`'s `"captured"` variant → `files: readonly DecisionFileChange[]` + aggregate `magnitude` + optional `sharedWith`, dropping `path`; (c) `DecisionPayload` gains the `"base-contribution"` member; (d) `DECISION_RECORD_VERSION` → `2` · `packages/contracts/src/decisionRecord.ts` + `packages/contracts/src/schemas.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T005** [P] Schema tests for the reshape: an absent count parses and stays absent (no coercion to `0`), a captured impact with an empty `files` array is rejected, `sharedWith` never contains the entry's own id, `EDITOR_ACTION_SAMPLE_LIMIT` still `12` and `DECISION_DIFF_CONTEXT_LINES` still `3` · `packages/contracts/src/schemas.test.ts`
- [x] **T006** [P] NEW pure read-time normalizer: a record with `version < 2` has every `EditorActionSummary` count read as **absent** whatever is stored, and a captured impact's `path`/`hunks`/`magnitude` lifted into a one-element `files` array; nothing is written back · `packages/studio/src/decisions/recordMigration.ts` + `recordMigration.test.ts` (v1 fixture, SC-011)
- [x] **T007** [P] Absorb the new shape at every existing consumer so `pnpm typecheck` and `pnpm -r test` go green — each reads absence through an explicit branch that renders words, never a number, and reads a captured impact as `files[]` (FR-005a, FR-020 distinctions preserved) · `packages/studio/src/decisions/headline.ts`, `DecisionEntryRow.tsx`, `snapshotSource.ts`, `impact.ts`, `packages/engine/src/decision-audit/prSummary.ts`, `shed.ts`, `packages/studio/src/lib/draftPersistence.ts`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T008** Wire `recordMigration` into the record read path so every consumer sees the normalized shape, and confirm nothing writes the normalized form back (append-only invariant, [record-shape.contract.md](contracts/record-shape.contract.md) §6) · `packages/studio/src/decisions/decisionLogStore.ts`

**Checkpoint**: the record can express *unmeasured*, a pre-feature record renders without claiming activity, and every consumer is forced by the typechecker to say so. No producer has changed yet.

---

## Phase 3: User Story 1 — Every stage reports what it actually did (P1)

**Goal**: the mechanisms stage reports the mechanisms it assigned and the keys it newly occupied, from the same store state the rest of the studio reads. No stage that did work reports having done none.

**Independent Test**: complete a session with edits in all three editor stages and confirm each entry's recorded counts match the edits made. Delivers value alone even if every headline still reads awkwardly (spec, US1).

### Implementation

**Wave 1 — the one derivation with no shipped precedent (research D-05 names it the highest-uncertainty task; build and test it first):**

- [x] **T009** NEW pure helper `occupiedHostKeys(ir: KeyboardIR): ReadonlySet<string>` — which physical keys an IR occupies, host key recovered via the existing `extractMechanismHostKey`; an assignment yielding no host key contributes nothing rather than an empty-string key · `packages/studio/src/lib/occupiedHostKeys.ts` + `occupiedHostKeys.test.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T010** `RecordEditorStepDeps` gains `getMechanismAssignments` plus the carve-projection inputs; `observeEditorStep`'s `mechanism_edit` branch computes `mechanismsAssigned` from the dep (never from `result.assignments`, which the adapter never populates) and `keysAdded` as `|after \ before|` over `occupiedHostKeys(applyCarveMutate(baseIr, deletedNodeIds, deletedItemIds))`; every dimension a stage does not measure is left **absent**, per the [data-model.md](data-model.md) §1 producer/consumer matrix · `packages/studio/src/decisions/recordEditorStep.ts`

**⟶ Wait for T010 to finish, then:**

- [x] **T011** Wire the new deps in the shell: `getMechanismAssignments` → the existing `selectDesktopAssignments(phaseResults)` (the documented single source of truth — do not fork the definition), carve inputs → the working-copy store. No adapter prop shape changes and no editor component learns the audit exists (FR-006) · `packages/studio/src/StudioShell.tsx`

**⟶ Wait for T011 to finish, then:**

- [x] **T012** Rewrite the recording tests to drive the **production completion path** with real store state instead of the synthetic `{ answers: [], assignments: [...] }` payload no adapter emits, and add one test per dimension that drives it non-zero through that path — `keysRemoved`, `keysAdded`, `mechanismsAssigned`, `touchKeysAffected` (FR-027/FR-029, SC-002/SC-010) · `packages/studio/src/steps/reducer.decisionRecording.test.ts`

**Checkpoint**: US1 is independently functional — every editor stage's recorded counts match the working copy's own state after that stage, and no dimension survives without a producer a test can move.

---

## Phase 4: User Story 2 — Every entry reads as a sentence (P1)

**Goal**: questions named the way they were asked, stages named for what they do, only the dimensions in which something happened, and no internal identifier anywhere in rendered text.

**Independent Test**: render a trail containing one entry of every kind and confirm no internal identifier appears and no zero-valued dimension is mentioned. Testable without completing a session (spec, US2).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T013** [P] Reshape the selection surface per [headline-spec.contract.md](contracts/headline-spec.contract.md) §1–§3: `HeadlineDeps.lookupQuestionLabel` injected (never imported), `QuestionName` replacing the raw `questionId`, `HeadlineDimension` carrying only counts that are **present and non-zero** in fixed order, and the three distinguished editor outcomes `editorStep` / `editorStepNoChange` / `editorStepUnmeasured`. No variant carries a `questionId`, an action-type string used as prose, a `stepId`, a message id, or a field name · `packages/studio/src/decisions/headline.ts`
- [x] **T014** [P] Add the new message ids from [headline-spec.contract.md](contracts/headline-spec.contract.md) §4 — `question.unknown`, the three `stage.*` names (adopting the engine's `EDITOR_LABEL` wording, **not** importing it), the four `dimension.*` ICU plurals, `editorStep.composed` / `.noChange` / `.unmeasured`; retire `trail.entry.headline.editorStep` rather than repurposing it, and rename no existing id · `packages/studio/src/locales/en/messages.json`
- [x] **T015** [P] NEW production `lookupQuestionLabel` resolving `audit_label` → `prompt` → `undefined` through the existing `resolveContentString("flowQuestions", id, field, englishValue, i18n)` seam that `QuestionField.tsx` already uses — no second per-question label store (FR-009) · `packages/studio/src/decisions/lookupQuestionLabel.ts` + test
- [x] **T016** [P] Author `definition.audit_label` on the questions whose `prompt` reads badly as a headline (sparse by design — most need none), then regenerate `content/i18n/en/flowQuestions.json` with the extractor rather than hand-editing it; `pnpm run content-i18n-freshness` and `pnpm run content-i18n-lint` stay green · question modules under `content/` + `content/i18n/en/flowQuestions.json`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T017** [P] Render the reshaped spec: stage **code** mapped to a catalog message, the dimension list composed through `editorStep.composed`, and the no-change / unmeasured outcomes rendered as statements rather than a row of zeros (US1 scenario 5, FR-011). `data-testid` values are the trail-UI contract — add, never rename · `packages/studio/src/decisions/DecisionEntryRow.tsx`
- [x] **T018** [P] Selection tests without a DOM (FR-013): zero-and-absent suppression, fixed dimension order, plural agreement at a count of exactly one, the `{ known: false }` fallback, and the three-outcome table from [headline-spec.contract.md](contracts/headline-spec.contract.md) §3 · `packages/studio/src/decisions/headline.test.ts`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T019** NEW mechanical guard for FR-028: render one entry of **every** kind — each survey agency, each editor action type, the shed and unavailable states — through the real component against the real English catalog, and assert the rendered text matches no `snake_case` / `camelCase` identifier token drawn from the payload (research D-12: a CI-failing test is the mechanism; `test-antipattern-lint` is not extended) · `packages/studio/src/decisions/DecisionEntryRow.identifiers.test.tsx`

**Checkpoint**: US2 is independently functional — SC-003 and SC-004 are mechanically enforced, and every line this feature renders is localisable.

---

## Phase 5: User Story 3 — The base keyboard's contribution is on the record (P2)

**Goal**: base selection appears as the decision it was, with the starting inventory later counts are read against, and values carried from the base are presented as carried rather than author-set.

**Independent Test**: instantiate from a base, open the trail, and confirm the base selection appears with an account of what it contributed (spec, US3).

### Implementation

**Wave 1 — independent (different files):**

- [x] **T020** [P] NEW baseline recorder: one entry at `choose_base` completion carrying `baseId`, `baseDisplayName`, `startingKeyCount`, `derivedAxes`, `inheritedMetadata`, `instantiationMode`, read from the **instantiated store** via injected deps (never a re-read of the base source, FR-035). `startingKeyCount` uses `toRailNodes(baseIr, removalCapabilities)` so the denominator is in the same `nodes + items` unit as `keysRemoved` (FR-034). No instantiated working copy at that instant → **no entry**, never a fabricated zero (research D-11) · `packages/studio/src/decisions/recordBaseContribution.ts` + `recordBaseContribution.test.ts`
- [x] **T021** [P] Add the `baseContribution` variant to the selection surface — base name plus only the contributions actually present ([headline-spec.contract.md](contracts/headline-spec.contract.md) §2) · `packages/studio/src/decisions/headline.ts`
- [ ] **T022** [P] Add `trail.entry.headline.baseContribution` plus the messages that render `derivedAxes` and `inheritedMetadata[].field` **codes** as prose — a code must never reach author-facing text (FR-008) · `packages/studio/src/locales/en/messages.json`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T023** [P] Call the baseline recorder from the existing `recordStepCompletion` event at `choose_base` — `StepHost` already fires it **after** `applyStepCompletion`, so the working copy exists by then and no new event or timer is needed (Constitution Article IV) · `packages/studio/src/decisions/createDecisionRecorder.ts` + `packages/studio/src/StudioShell.tsx`
- [x] **T024** [P] Render the base-contribution entry, resolving axis ids and metadata field codes through the catalog · `packages/studio/src/decisions/DecisionEntryRow.tsx`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T025** Wire the unwired `resolveProposal` register with the base's inherited values so `deriveAnswerProvenance` returns `{ agency: "base-derived", source: "base" }` and the already-authored `trail.entry.headline.fromBase` message becomes reachable. This is wiring an existing seam, not a competing provenance concept (FR-032); a later author override supersedes rather than overwrites, so both stay visible (FR-033) · `packages/studio/src/StudioShell.tsx`

**⟶ Wait for T025 to finish, then:**

- [x] **T026** Tests through the production path: a base-instantiated session records the base and what it contributed (SC-012), and a base-supplied value renders as carried-from-base rather than author-set with the author's later replacement still visible (SC-013, US3 scenarios 5–6) · `packages/studio/src/steps/reducer.decisionRecording.test.ts`

**Checkpoint**: US3 is independently functional — every count in the trail now has a stated denominator, and 053's `base-derived` provenance is reachable at last.

---

## Phase 6: User Story 4 — Decisions that shape the package show their effect (P2)

**Goal**: an identity decision shows what it changed in the produced package — the metadata file included — and a change several decisions share is stated as shared rather than claimed by one of them.

**Independent Test**: complete the identity stage, expand each of its decisions, and confirm the change shown corresponds to the metadata that decision set. Testable against a projection, no PR or download needed (spec, US4).

### Implementation

**Wave 1 — the widened baseline:**

- [x] **T027** Hold the boundary baseline as a `Map<path, text>` over **every** projected-VFS entry with `isBinary === false` instead of one `.kmn` text, and diff per path into a `files[]` set plus an aggregate magnitude. The set is enumerated from `vfs.entries()`, never from a maintained file list (FR-016), and still read from `projectWorkingCopyForOutput` — the same projection the zip and PR paths call, so FR-018 holds by construction · `packages/studio/src/decisions/snapshotSource.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T028** [P] Add a single named normalizer that holds the `HISTORY.md` staged date stamp stable before diffing, so a boundary crossing midnight shows no spurious change while a genuine history edit stays visible. The `.kps` `<Version>` bump is deterministic (derived from `baseIr.header.version`) and needs no handling — recorded so it is not re-litigated (FR-017a, research D-09) · `packages/studio/src/decisions/snapshotSource.ts`
- [x] **T029** [P] Attach the boundary's **one** capture to every entry recorded at that boundary and populate `sharedWith` with the co-decisions' `entryId`s — never the entry's own. A single-decision boundary is unchanged: `sharedWith` absent, the entry claims the change outright. One comparison per boundary, so 053's model is preserved exactly (FR-019/FR-019a) · `packages/studio/src/decisions/createDecisionRecorder.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T030** [P] Render each changed file separately rather than merging them into one diff, plus the shared-change note naming the co-decisions; add `trail.entry.impact.shared` to the catalog. Keep "cannot be isolated" distinct from "changed nothing" (FR-017, FR-020) · `packages/studio/src/decisions/DecisionEntryRow.tsx` + `packages/studio/src/locales/en/messages.json`
- [x] **T031** [P] `formatEffect` gains a per-file cell for the widened captured impact and a shared-change note when `sharedWith` is present · `packages/engine/src/decision-audit/prSummary.ts`
- [x] **T032** [P] Truncation over the enlarged captured payload: detail is shed, entries never are, and the threshold is neither raised nor exempted for this feature ([record-shape.contract.md](contracts/record-shape.contract.md) §6) · `packages/engine/src/decision-audit/shed.ts`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — independent (different files):**

- [x] **T033** [P] Baseline and diff tests: binaries skipped never diffed, a zero-changed-file capture is `{ state: "none" }` and not an empty `files` array, aggregate magnitude equals the sum over `files`, and the volatile normalizer holds the date stamp while a real HISTORY edit still surfaces · `packages/studio/src/decisions/snapshotSource.test.ts`
- [x] **T034** [P] Identity-stage integration test: expanding each identity decision shows the `.kps` metadata change with the file identified, and the four answers made together show the same change stated as shared (SC-006, US4 scenarios 2–3) · `packages/studio/src/decisions/impact.test.ts`

**Checkpoint**: US4 is independently functional — no identity decision reports a reason a widened comparison would have resolved, and the shipped package and the shown change agree.

---

## Phase 7: User Story 5 — The trail reads as a staged narrative (P3)

**Goal**: decisions grouped under the stage they were made in, in flow order, each group carrying a one-line account available without expanding it.

**Independent Test**: open a trail from a full session and confirm entries are grouped by stage in flow order with a per-stage summary line, and every entry visible in the flat trail is still reachable (spec, US5).

This phase is presentation over an unchanged record — cuttable without touching anything above it.

### Implementation

**Wave 1 — independent (different files):**

- [x] **T035** [P] NEW derived grouping: `StageGroup { stepId, entries, rollUp }` ordered by the stage's position in the flow manifest, with a `stepId` absent from the manifest (`PRE_IDENTITY_STEP_ID`, or a step a later build removed) sorted first under a generic heading rather than dropped. `rollUp` states the stage's **net effect** from its *effective* entries — for an editor stage the latest non-superseded entry, never a sum, because editor counts are cumulative per step and summing double-counts every revisit (research D-02). Not persisted, not a second record · `packages/studio/src/decisions/stageGroups.ts` + `stageGroups.test.ts`
- [x] **T036** [P] Add `trail.stage.rollUp` · `packages/studio/src/locales/en/messages.json`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T037** Render groups with the collapsed one-line account; superseded entries stay in the DOM hidden rather than filtered (053 FR-015), a stage with nothing recorded is omitted or shown as untouched but never as a stage that made changes (FR-025), and `data-testid` values are added, never renamed · `packages/studio/src/decisions/DecisionTrailView.tsx`

**⟶ Wait for T037 to finish, then:**

**Wave 3 — independent (different files):**

- [x] **T038** [P] Grouping tests: stages in walked order (FR-022), a collapsed roll-up line per group (FR-023), every flat-trail entry still reachable (FR-024), an untouched stage never presented as changed (FR-025), and a revisit visible as history inside its stage (FR-026) · `packages/studio/src/decisions/DecisionTrailView.test.tsx`
- [ ] **T039** [P] Rendering a stage roll-up resolves **no** entry's impact, and expanding one entry resolves only that one (FR-021, SC-009) · `packages/studio/src/decisions/impact.test.ts`

**Checkpoint**: US5 is independently functional — a long trail is scannable and grouping hides nothing.

---

## Phase 8: Polish — cross-cutting validation against the Success Criteria

**Wave 1 — independent (different files):**

- [x] **T040** [P] SC-007 made mechanical: generate the trail headlines and the PR summary from **one** record and assert they agree on stage naming, mentioned dimensions, and counts — including that both skip absent counts and say "not measured" rather than treating `undefined` as falsy alongside `0` (FR-015) · `packages/engine/src/decision-audit/prSummary.test.ts`
- [x] **T041** [P] Extend the artifact-independence guard: an identical session with and without recording produces a byte-identical keyboard artifact across the widened capture (FR-007, SC-008 — the capture reads the projection and must never write to it) · `packages/studio/src/decisions/artifactIndependence.test.ts`
- [x] **T042** [P] Document the closed gaps: note in the 053 spec folder that its FR-001..FR-028 are now delivered by 055, and record the `audit_label` field's ownership split (content owns values, engine owns plumbing) where the i18n conventions are documented · `specs/053-decision-audit/spec.md` + `docs/` as appropriate

**⟶ Wait for Wave 1 to finish, then:**

- [ ] **T043** Full gate before hand-off: `pnpm typecheck`, `pnpm -r test`, `pnpm lint` (which runs `depcruise`, `crew-lint`, `content-i18n-lint`, `content-i18n-freshness`, and `test-antipattern-lint`), plus a walkthrough of SC-001..SC-013 recording the evidence for each · (verification only — no file edit)

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup ──────────────► Phase 4 (US2)        [T001/T002 gate T016's first audit_label value]
Phase 2 Foundational ───────► Phases 3, 5, 6, 7    [the contract reshape blocks every story]
Phase 3 (US1, P1) ──────────► Phase 8
Phase 4 (US2, P1) ──────────► Phase 5              [T021 extends the surface T013 reshapes]
Phase 5 (US3, P2) ──────────► Phase 8
Phase 6 (US4, P2) ──────────► Phase 7              [T035's roll-up reads impacts T029 attaches]
Phase 7 (US5, P3) ──────────► Phase 8
```

Phases 3 and 4 depend only on Phase 2 and on each other not at all — the plan's delivery order notes US1 and US3 read the same store state at the same completion event, so **Phase 3's recorder work and Phase 5's T020 can be built concurrently**; only Phase 5's headline variant (T021) has to wait for Phase 4. Phase 7 is the designated scope cut: dropping it leaves a flat trail of correct, legible entries, which already satisfies 053.

### Wave map

| Phase | Waves |
|---|---|
| 1 Setup | W1 `T001 T002` → `T003` |
| 2 Foundational | W1 `T004` → W2 `T005 T006 T007` → `T008` |
| 3 US1 | W1 `T009` → `T010` → `T011` → `T012` |
| 4 US2 | W1 `T013 T014 T015 T016` → W2 `T017 T018` → `T019` |
| 5 US3 | W1 `T020 T021 T022` → W2 `T023 T024` → `T025` → `T026` |
| 6 US4 | W1 `T027` → W2 `T028 T029` → W3 `T030 T031 T032` → W4 `T033 T034` |
| 7 US5 | W1 `T035 T036` → `T037` → W3 `T038 T039` |
| 8 Polish | W1 `T040 T041 T042` → `T043` |

### Parallel opportunities

- **Phase 2 W2** (3 tasks) is the widest independent wave: the migration module, the schema tests, and the consumer-absorption sweep touch disjoint files.
- **Phase 4 W1** (4 tasks) splits cleanly along the team boundary — T016 is content-owned (`audit_label` values), the other three are engine-owned.
- **Phase 6 W3** (3 tasks) fans the widened-capture consumers across studio, PR summary, and truncation.
- **Across phases**: Phase 3 (US1 producers) and Phase 5 T020 (base baseline) can run together once Phase 2 lands; Phase 1 can run at any time before T016.

### Serialisation points worth naming

- **T004** is a wave of one on purpose: the interface and its zod mirror must move in the same commit or the drift guards at `schemas.ts:789-793` fail the build.
- **T010 → T011** is sequential because T011 wires a dep shape T010 defines.
- **T027 → T028** touch the same file; the normalizer sits on top of the widened baseline.
- **T023 → T025** both edit `StudioShell.tsx`.
