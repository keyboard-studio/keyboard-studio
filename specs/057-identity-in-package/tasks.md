# Tasks: Identity in the package

**Feature**: 057-identity-in-package · **Branch**: `057-identity-in-package` · **Size**: normal

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md) · **Data model**: [data-model.md](data-model.md) · **Contracts**: [contracts/](contracts/)

Line format: `- [ ] **T###** [P?] [US#] Description · exact/file/path`. `[P]` marks a task independent of the others in its wave (different file, no incomplete dependency). Waves are separated by explicit join lines.

---

## Phase 1: Setup

**No setup tasks.** The plan adds no dependency, no new stack, and no tooling row — the FR-016 check runs under the existing `pnpm --filter @keyboard-studio/studio test` lane, so CLAUDE.md's commands table needs no new entry ([contracts/question-output-reach.md](contracts/question-output-reach.md) §4). A "confirm the build is green" task would not be real work.

---

## Phase 2: Foundational — the single writer and its declarations

Blocks every story. US1/US2/US3 all reach the descriptor through the module built here, and the FR-016 check validates against the field set it exports.

**Wave 1 — independent (different files):**

- [x] **T001** [P] Add `OutputTargetId`, `IdentityOverlayField`, `OutputWrite`, and the optional `QuestionModule.outputs` field, with the doc comment stating the address-space distinction from `writes` (IRPath over KeyboardIR vs. emitted artifacts) · `packages/studio/src/survey/types.ts`
- [x] **T002** [P] Create the descriptor builder: move the scaffolder's private `buildKpsContent` (index.ts:307) verbatim into the new module, replacing its `languages: string[]` parameter with `PackageDescriptorIdentity` (`displayName`, `languageTag?`, `languageName?`); keep every interpolated value passing through `escapeHtml` · `packages/engine/src/package-descriptor/build.ts`
- [x] **T003** [P] Add `languageName?: string` to `IdentityPatch` (data-model §3) · `packages/studio/src/stores/workingCopyStore.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T004** [P] Implement `applyIdentityToKps(vfs, keyboardId, identity, kmnText, version?) → { warnings, generated }` — patches `source/<keyboardId>.kps` in place, **generates** it via `buildKpsContent` when absent (D-09), replaces the `<Languages>` block **totally** rather than appending, and never throws: an absent or unparseable descriptor reports through `warnings` using the bracketed, emoji-free strings in [contracts/package-descriptor.md](contracts/package-descriptor.md) §5 · `packages/engine/src/package-descriptor/patch.ts`
- [x] **T005** [P] Declare `outputs` on the five identity-lite questions exactly as pinned in [contracts/question-output-reach.md](contracts/question-output-reach.md) §2 — `il_language_english` → `languageName`; `il_language_code`, `il_language_region`, `il_target_script` → `bcp47`; `il_language_autonym` → `[]`. Leave every `writes: []` unchanged · `packages/studio/src/survey/questions/a/il_language_english.ts`, `il_language_autonym.ts`, `il_language_code.ts`, `il_language_region.ts`, `il_target_script.ts`

**⟶ Wait for T002 + T004, then:**

- [x] **T006** Barrel the module and export `DESCRIPTOR_CONSUMED_FIELDS = { "displayName", "bcp47", "languageName" }` — the writer owns this table, not the test that reads it · `packages/engine/src/package-descriptor/index.ts`

**⟶ Wait for T006, then:**

- [x] **T007** [P] Re-export `package-descriptor` from the engine's public surface · `packages/engine/src/index.ts`
- [x] **T008** [P] Rewire `generateStubs` to call the shared builder instead of its own private one, passing the base's languages through the new `identity` shape; behaviour unchanged — it still only writes when the path is absent · `packages/engine/src/scaffolder/index.ts`

**Checkpoint**: one descriptor writer exists, is exported, and the scaffolder no longer owns a private copy. No behaviour has changed yet.

---

## Phase 3 (US1, P1): The finished package declares the author's language

**Goal**: a Bambara keyboard built on a French base ships a `.kps` declaring the author's composed tag and their language's English name — not `fr` (FR-001…FR-004, FR-007, SC-002).

**Independent Test**: complete an authoring walk answering the identity questions, download the package, read the `.kps`. No decision trail involved.

### Tests

**Wave 1 — independent (different files):**

- [x] **T009** [P] [US1] Builder tests — language block declares `languageTag` with `languageName` as element text; blank/absent tag → the existing well-formed `und` placeholder and **never** the base's tags (US1-3, FR-007); blank name → the tag stands in as display text (FR-002); `<Info><Name>`, `<Info><Description>`, `<Keyboards><Keyboard><Name>` all track `displayName` (FR-003); a display name containing `&` or `<` produces well-formed XML · `packages/engine/src/package-descriptor/build.test.ts`
- [x] **T010** [P] [US1] Patch tests — an existing descriptor declaring the base's `fr` ends up declaring **only** the author's tag (total replacement, SC-002); an absent descriptor is generated with `generated: true` plus the naming warning; an unparseable descriptor warns rather than throwing; `<Files>`, `<System>`, `<Options>`, and `<Version>` are left untouched · `packages/engine/src/package-descriptor/patch.test.ts`

### Implementation

**⟶ Wait for the tests to be red, then:**

- [x] **T011** [US1] Add `languageName?: string` to `IdentityOverlay` and carry both `bcp47` and `languageName` from the store's identity patch into the overlay (data-model §2) · `packages/studio/src/lib/projectWorkingCopyVfs.ts`

**⟶ Wait for T011, then — independent (different files):**

- [x] **T012** [P] [US1] Insert **projection step 3.6**: after the `.kmn` identity write / keycap-label patch (step 3.5) and **before** the step-4 id-rename pass, call `applyIdentityToKps` under the pre-rename keyboard id and merge its warnings into the projection's `warnings[]`. The step must not touch `<ID>` or `<Files>` paths — step 4's `rewriteKpsFilePaths` owns those, and its deliberate skip of non-path-shaped `<Name>` values is what preserves the display names this step sets (D-02) · `packages/studio/src/lib/projectWorkingCopyVfs.ts`
- [x] **T013** [P] [US1] Populate `bcp47` and `languageName` on the copy track from `IdentityLiteResult.bcp47` / `.english`, consumed **whole** — no second tag-composition rule (FR-001, D-03) · `packages/studio/src/editors/panels/TrackOneIdentityPanel.tsx`
- [x] **T014** [P] [US1] Populate the same two fields on the copy track's other identity writer · `packages/studio/src/editors/adapters/flowStepOptions.tsx`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T015** [US1] Projection-level test: with a copy-track store whose identity carries a tag and name differing from the base's, the projected `source/<id>.kps` declares the author's language and the author's display name, and survives the step-4 rename intact · `packages/studio/src/lib/projectWorkingCopyVfs.test.ts`
- [x] **T016** [US1] Strengthen the existing Track-1 walk's `.kps` assertion (copy-edit.spec.ts:243-266) to require the author's language tag and name rather than merely the file's presence (US1-1, SC-002) · `packages/studio/e2e/copy-edit.spec.ts`

**Checkpoint**: US1 is independently functional — a copy-track download carries the author's identity, verifiable by reading the archive with the trail unopened.

---

## Phase 4 (US3, P2): An adapted keyboard ships a package descriptor

**Sequencing note**: US3 runs ahead of US2 despite its lower priority, per [plan.md](plan.md) §"Sequencing note" — it shares the writer with US1, and without it US1 and US2 would both silently deliver the copy track only (E-6).

**Goal**: the adapt track's archive contains a generated descriptor carrying the author's identity, with its version agreeing with the source and no silent failure (FR-005, FR-006, FR-008).

**Independent Test**: run an import-and-adapt walk, download, assert the archive contains a non-empty descriptor whose language and name match the author's answers.

### Tests

**Wave 1 — independent (different files):**

- [x] **T017** [P] [US3] Adapt-track coverage that does **not** seed what it proves: call `seedAdaptStore(version)` with no `kpsContent` and assert the delivered artifact contains a descriptor whose language and name match the author's answers (US3-1, D-08). Leave the optional `kpsContent` parameter in place for the tests that legitimately pin a legacy descriptor shape · `packages/studio/src/lib/serializeWorkingCopy.test.ts`
- [x] **T018** [P] [US3] Track-2 walk assertion mirroring the Track-1 one: the downloaded archive contains a package descriptor carrying the author's identity · `packages/studio/e2e/touch-derivation-us1.spec.ts`

### Implementation

**⟶ Wait for the tests to be red, then:**

- [x] **T019** [US3] Confirm the generated descriptor's keyboard version agrees with the `.kmn`'s on the adapt track, and that the existing `<Version>` regex patch now always finds a file to patch — the silent no-op of E-6 must be unreachable. Add the agreement assertion (US3-2, FR-008) · `packages/studio/src/lib/serializeWorkingCopy.ts`, `packages/studio/src/lib/serializeWorkingCopy.test.ts`

**⟶ Wait for T019, then:**

- [x] **T020** [US3] Surface the descriptor step's warnings on the download path so a failure to write is **named** rather than silent (US3-3, FR-006), and cover the failure path with a test that asserts the warning reaches the caller · `packages/studio/src/lib/serializeWorkingCopy.ts`, `packages/studio/src/lib/serializeWorkingCopy.test.ts`

**Checkpoint**: both tracks deliver a descriptor from one writer. SC-002 and SC-003 are satisfiable end-to-end; the trail has something real to attribute.

---

## Phase 5 (US2, P1): The identity decisions show what they changed

**Goal**: expanding an identity entry names the package descriptor as the changed file and shows the language line — and where no working copy exists yet, says so as its own distinct reason (FR-009…FR-015, SC-004, SC-006, SC-007).

**Independent Test**: with US1/US3 in place, complete an identity walk, instantiate a working copy, expand each identity entry, and check a per-file change naming the package descriptor.

### Implementation

**Wave 1 — independent (different files):**

- [x] **T021** [P] [US2] Add `"no-working-copy-yet"` to `ImpactUnavailableReason` **and** its `z.enum` mirror — one commit, per the contract source-of-truth chain; the compile-time drift guards enforce it · `packages/contracts/src/decisionRecord.ts`, `packages/contracts/src/schemas.ts`
- [x] **T022** [P] [US2] Extract `textBaseline` and `normalizeHistoryDateStamp` into a shared module so the volatile-content exclusion has exactly one home, and have the boundary snapshotter import them (D-10, FR-013) · `packages/studio/src/decisions/projectedText.ts`, `packages/studio/src/decisions/snapshotSource.ts`
- [x] **T023** [P] [US2] Add `ProjectForOutputOptions.identityOverride?: Partial<IdentityOverlay>` to `projectWorkingCopyForOutput` (currently `serializeWorkingCopy.ts:107`) — merged over the store's overlay for that call only, a pure input, the store never written. Existing no-argument callers (zip, PR, `readProjectedFiles`) are unchanged · `packages/studio/src/lib/serializeWorkingCopy.ts`
- [x] **T024** [P] [US2] Add the two catalog strings under the established ids — `trail.entry.impact.unavailable.noWorkingCopyYet` and `trail.entry.impact.pending`, wording per [contracts/impact-resolution.md](contracts/impact-resolution.md) §5. The `noWorkingCopyYet` message must read as distinct from both existing unavailability messages and from `trail.entry.impact.none` · `packages/studio/src/locales/en/messages.json`

**⟶ Wait for T022 + T023, then:**

- [x] **T025** [US2] Implement `resolveIdentityCounterfactual(field, recordedValue, alternativeValue, deps)` — project twice differing in exactly one overlay field, reduce both through the shared `projectedText` baselines (skipping binaries, normalizing volatiles on **both** sides), diff per path over the union, sort `files` by path, zero changed files → `{ state: "none" }` (never an empty `"captured"`), either projection `null` → `null`. Both projections are discarded on return; nothing is stored · `packages/studio/src/decisions/counterfactualProjection.ts`
- [x] **T026** [US2] Carry joint attribution: when several same-stage answers feed the same overlay field, the impact's `sharedWith` names the co-decisions' `entryId`s and an entry never names itself — the three `bcp47` questions are the case this exists for (FR-014, 055 FR-019) · `packages/studio/src/decisions/counterfactualProjection.ts`

**⟶ Wait for T025 + T026, then:**

- [x] **T027** [US2] Counterfactual tests — descriptor-only change names the descriptor as the changed file; an author whose language matches the base's yields `{ state: "none" }` and not a fabricated change (Edge Cases); a pair straddling a `HISTORY.md` date-stamp change shows no spurious diff (FR-013); no working copy → `null`; `sharedWith` lists the co-decisions for a `bcp47` answer · `packages/studio/src/decisions/counterfactualProjection.test.ts`

**⟶ Wait for T021 + T027, then:**

- [x] **T028** [US2] Add the async resolver alongside the unchanged sync `resolveImpact`, following the precedence table in [contracts/impact-resolution.md](contracts/impact-resolution.md) §3: shed → `null`; a stored capture with no `requestedValue` → returned **verbatim** (SC-005); declares `outputs` + working copy → counterfactual; declares `outputs` + no working copy → `no-working-copy-yet`; behind a lock → `lock-gate-dependency`; otherwise → `no-rederivable-write-path` · `packages/studio/src/decisions/impact.ts`
- [x] **T029** [US2] Extend the resolver tests to cover each row of that table, including that a stored capture is returned byte-for-byte rather than re-derived · `packages/studio/src/decisions/impact.test.ts`

**⟶ Wait for T028, then:**

- [x] **T030** [US2] Implement `useEntryImpact(entry, expanded)` — nothing runs until `expanded` is true (FR-011, SC-006 by construction); no batch form and no signature accepting a list; a result superseded by a collapse or a newer expand is discarded, not applied; a stored capture resolves synchronously on first render with `pending: false`; not memoised across collapse/expand · `packages/studio/src/decisions/useEntryImpact.ts`
- [x] **T031** [US2] Export the new modules from the decisions barrel · `packages/studio/src/decisions/index.ts`

**⟶ Wait for T021 + T030, then — independent (different files):**

- [x] **T032** [P] [US2] Add an **explicit arm** for `no-working-copy-yet`; it must not fall into a trailing `else` that would render it as "no re-derivable write path" · `packages/engine/src/decision-audit/prSummary.ts`
- [x] **T033** [P] [US2] Add the same explicit arm · `packages/studio/src/dashboard/FlowGraphView.tsx`
- [x] **T034** [P] [US2] Add the explicit arm, render the pending state from `trail.entry.impact.pending`, and consume `useEntryImpact` for on-expand resolution · `packages/studio/src/decisions/DecisionEntryRow.tsx`

**⟶ Wait for T034, then:**

- [x] **T035** [US2] Wire the async resolver through the shell so the row receives it · `packages/studio/src/StudioShell.tsx`
- [x] **T036** [US2] Row tests — an identity entry expanded after instantiation shows the descriptor as the changed file (US2-1); expanded before base selection shows the `noWorkingCopyYet` message, distinct from "changed nothing" and from both existing reasons (US2-2, FR-012); expanding one entry computes an impact for that entry and no other, and mounting the trail computes none (US2-3, SC-006); a co-decided answer names its co-decisions (US2-4) · `packages/studio/src/decisions/DecisionEntryRow.test.tsx`

**Checkpoint**: US2 is independently functional — every identity answer that reached the artifact reports what it changed, and the one state that genuinely cannot be resolved says so in its own words.

---

## Phase 6 (US4, P3): Revising the language keeps both answers on the record

**Goal**: a post-instantiation revision gets an ordinary boundary capture, and that account agrees with the counterfactual account (FR-014, 053 FR-015, 055 FR-026).

**Independent Test**: complete a walk, revisit the identity stage, change the language code, inspect both entries.

- [x] **T037** [US4] Revision coverage — a language-code revision after instantiation is captured at the stage boundary and attributed to the revising decision (US4-1); the superseded original stays visible as history and the stage roll-up reads the effective answer only (US4-2); the boundary-captured account and the counterfactual account of the same descriptor do not contradict each other (US4-3, SC-007) · `packages/studio/src/decisions/snapshotSource.test.ts`

**Checkpoint**: the two attribution mechanisms — boundary capture and counterfactual — are shown to agree on the same artifact.

---

## Phase 7: Anti-regression (FR-016…FR-018)

Not polish. FR-016's check is what stops the E-1/E-4 class from reappearing, and it must be able to see the declarations T005 introduced.

**Wave 1 — independent (different files):**

- [x] **T038** [P] Registry-wide check with two assertions over `questionRegistry`, both failing the build: **(a) declaration integrity** — every declared `OutputWrite` names a `target` in the writer table and a `field` that target's writer actually consumes, validated against the engine's `DESCRIPTOR_CONSUMED_FIELDS`; **(b) promise integrity** — a question whose `help_text` or `prompt` matches the curated phrase list ([contracts/question-output-reach.md](contracts/question-output-reach.md) §3b, case-insensitive) must declare a non-empty `outputs` or a non-empty `writes`. Ship `PROMISE_CHECK_EXEMPT` **empty**; an entry with an empty justification is itself a failure. The failure message names the question id, the matched phrase, and both remedies in the spec's order of preference — make the promise true, not make it quieter (FR-018) · `packages/studio/src/survey/questions/outputReach.test.ts`
- [x] **T039** [P] Copy-track counterpart to T017: assert from the delivered artifact that a descriptor exists, without supplying one (FR-017, E-7) · `packages/studio/src/lib/serializeWorkingCopy.test.ts`

**⟶ Wait for T038 to pass, then:**

- [x] **T040** Confirm FR-018 resolves the intended way: `il_language_code`'s "it goes on the finished keyboard" help text is now **true** and needs no edit, and T038's promise check holds it true. Record the finding; only if the check fails does the Content-team text edit become the fallback · `packages/studio/src/survey/questions/a/il_language_code.ts`

---

## Phase 8: Polish

**Wave 1 — independent (different files):**

- [x] **T041** [P] Update fixtures and baselines the descriptor change moves. The spec's Assumptions name this as expected work, not a signal the change is wrong — a diff that grows beyond descriptor content is the signal · fixtures under `packages/engine/src/**/__fixtures__/`, `packages/studio/src/**/*.test.ts` snapshots
- [x] **T042** [P] Sweep for any second descriptor writer that crept in: `serializeWorkingCopy` must **not** grow a descriptor write of its own — its `<Version>` regex patch stays where it is, and FR-004/SC-005 require the OSK preview to see the same descriptor the zip does (FR-005) · `packages/studio/src/lib/serializeWorkingCopy.ts`, `packages/engine/src/scaffolder/index.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T043** Full gate: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`. `pnpm lint` includes `crew-lint`, `depcruise`, and the i18n catalog checks — the new `messages.json` ids must pass catalog lint · repo root
- [x] **T044** Validate against the spec's Success Criteria and record the evidence for each: SC-001 (both tracks), SC-002/SC-003 (zero base-language and zero missing descriptors), SC-004/SC-007 (trail and artifact agree), SC-005 (preview / archive / PR agree), SC-006 (one expand computes one impact), SC-008 (the repository check catches the promise class) · `specs/057-identity-in-package/`

---

## Dependencies & Execution Order

**Phase order**: Setup (empty) → Foundational → US1 → US3 → US2 → US4 → Anti-regression → Polish.

Story order deviates from strict priority in one place: **US3 (P2) runs before US2 (P1)**, per the plan's sequencing note. US1 is a hard prerequisite for US2 — shipping the trail first would make its message false rather than merely unhelpful — and US3 shares the writer with US1, so landing it second keeps the adapt track from being silently excluded from both.

**Wave map**:

| Phase | Waves |
|---|---|
| 2 — Foundational | `T001,T002,T003` ⟶ `T004,T005` ⟶ `T006` ⟶ `T007,T008` |
| 3 — US1 | tests `T009,T010` ⟶ `T011` ⟶ `T012,T013,T014` ⟶ `T015,T016` |
| 4 — US3 | tests `T017,T018` ⟶ `T019` ⟶ `T020` |
| 5 — US2 | `T021,T022,T023,T024` ⟶ `T025,T026` ⟶ `T027` ⟶ `T028,T029` ⟶ `T030,T031` ⟶ `T032,T033,T034` ⟶ `T035,T036` |
| 6 — US4 | `T037` |
| 7 — Anti-regression | `T038,T039` ⟶ `T040` |
| 8 — Polish | `T041,T042` ⟶ `T043,T044` |

**Cross-phase blockers worth stating outright**:

- T006 (`DESCRIPTOR_CONSUMED_FIELDS`) blocks T038 — the check reads its table from the writer, not from itself.
- T005 (the five `outputs` declarations) blocks both T028 (the resolver's precedence depends on `outputs` being declared) and T038.
- T021 (the new reason) blocks T032/T033/T034 — all three consumers need an explicit arm in the same change, or the new code renders as the old false message.
- T022 (`projectedText.ts`) blocks T025 — FR-013 applies to both sides of the counterfactual, and re-implementing the exclusion is how one copy goes stale.
- T012 (projection step 3.6) blocks everything in US3 and US2 — it is the step that puts identity in the artifact there is anything to diff.

**Parallel opportunities**: the largest genuine fan-out is Phase 5 Wave 1 (four unrelated files: contracts, `projectedText`, the projection option, the catalog) and Phase 5's reason-arm wave (`T032,T033,T034` — three consumers, three files). Phase 2 Wave 1 and Phase 3's copy-track writer wave (`T012,T013,T014`) are the other three-wide waves.
