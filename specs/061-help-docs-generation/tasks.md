# Tasks: Help documentation generation from Phase F answers

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/help-docs-contract.md](contracts/help-docs-contract.md)

Format: `- [ ] **T###** [P?] [US#] Description · exact/file/path`

---

## Phase 1: Setup

**Wave 1 — independent (different files):**

- [X] **T001** Land `docs/keyboard-documentation-plan.md` on this branch — pull its content verbatim from `km/keyboard-documentation-plan` (commit `85bab7e7`); `spec.md`'s Governing Context already cites it as authoritative (research D-09) · `docs/keyboard-documentation-plan.md`

---

## Phase 2: Foundational (blocks all stories)

**Wave 1 — independent (different files):**

- [X] **T002** [P] Define the `HelpDocsAnswers` interface (all fields per [data-model.md](data-model.md)) · `packages/contracts/src/help-docs.ts`
- [X] **T003** [P] Extend `fetchKeyboardSourceToVfs` to best-effort-fetch the base keyboard's own `source/welcome.htm` and `source/help/<id>.php` (mirror the existing `baseLicenseText` fetch: non-fatal on 404, not written into the VFS); add `baseWelcomeHtmText?`/`baseHelpPhpText?` to `FetchKeyboardSourceResult` · `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts`
- [X] **T004** [P] Extend `PackageDescriptorIdentity` with `websiteUrl?: string`; emit `<WebSite URL="...">...</WebSite>` inside `<Info>` in `buildKpsContent` when present (research D-06) · `packages/engine/src/package-descriptor/build.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [X] **T005** [P] Add the zod mirror `HelpDocsAnswersSchema` in the contracts schema module, with the compile-time drift guard against `HelpDocsAnswers` (depends on T002) · `packages/contracts/src/schemas.ts`
- [X] **T006** [P] Add `helpDocs: HelpDocsAnswers | null`, `baseWelcomeHtmText: string | null`, `baseHelpPhpText: string | null` fields and the `setHelpDocs` action to the working-copy store (mirrors `attribution`/`baseLicenseText` exactly); wire T003's new loader result fields into `instantiateFromExisting` (depends on T002, T003) · `packages/studio/src/stores/workingCopyStore.ts`
- [X] **T007** [P] Create the pure render module: `DocSection`, `HelpDocsRenderInput` types; `buildDocSections` (description section only, for now — US3/US4 extend it); `renderReadmeMd`, `renderReadmeHtm`; `renderWelcomeHtm`/`renderHelpPhp` including the FR-013 merge/append-below-preserved-body logic against `baseWelcomeHtmText`/`baseHelpPhpText`; FR-002 placeholder fallback when `answers === null` or `description` is blank (byte-identical to today's `welcomeHtm`/`readmeHtm`/scaffolder stub strings); FR-006 sets `<html lang>` to the primary BCP47 tag; FR-007 never emits a version or copyright year; FR-009 routes all `.htm`/`.php` text through the existing `escapeHtml` (depends on T002) · `packages/engine/src/shared/helpDocsRender.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**

- [X] **T008** [P] Wire `helpDocsRender` into `projectWorkingCopyForOutput`: read `state.helpDocs`/`baseWelcomeHtmText`/`baseHelpPhpText`, the resolved display name/BCP47 tag/`resolvedKeyboardId`, and the projected `.kmn`'s `store(&TARGETS)` platform list; write `README.md`, `source/readme.htm`, `source/welcome.htm`, `` source/help/${resolvedKeyboardId}.php `` into `clonedVfs` on every call (FR-010) — this is the one hook point shared by all three delivery modes (research D-03) (depends on T006, T007) · `packages/studio/src/lib/serializeWorkingCopy.ts`
- [X] **T009** [P] Retire `ensurePackageFiles`'s bare placeholder writes for `welcome.htm`/`readme.htm` in favor of T007's fallback path (same byte-identical output when `helpDocs` is null); leave `LICENSE.md` handling untouched (depends on T007) · `packages/engine/src/output/ensurePackageFiles.ts`, `packages/engine/src/shared/packageDocs.ts`

**⟶ Wait for Wave 3 to finish, then:**

- [X] **T010** Foundational regression tests: placeholder fallback stays byte-identical to today's output (FR-002); merge/append logic preserves a fetched base `welcome.htm`/`help.php` body verbatim and appends new content below it (FR-013 edge case) (depends on T007, T008, T009) · `packages/engine/src/shared/helpDocsRender.test.ts`, `packages/engine/src/output/ensurePackageFiles.test.ts`

---

## Phase 3: User Story 1 — Required description reaches every shipped doc file (P1)

**Goal**: The one required Phase F answer (`pf_welcome_paragraph`) actually reaches `README.md`, `source/readme.htm`, `source/welcome.htm`, and `source/help/<id>.php`.

**Independent Test**: Answer only the required description, leave everything else in Phase F blank, produce an output package — every shipped doc file shows the description and no placeholder text.

### Tests

**Wave 1 — independent (different files):**

- [X] **T011** [P] [US1] Unit test: `extractHelpDocs` on a Phase F result with only the description answered returns `{ description, usageTips: [] }` (all other fields absent) · `packages/studio/src/editors/adapters/flowStepOptions.test.ts`
- [X] **T012** [P] [US1] Integration test: `projectWorkingCopyForOutput`'s output VFS contains the description in all 4 files when `helpDocs` is set, and today's exact placeholders when it is `null` (FR-001/FR-002/SC-001) · `packages/studio/src/lib/serializeWorkingCopy.stubCompletion.test.ts`

### Implementation

**⟶ Wait for Wave 1 (Tests) to finish, then:**

- [X] **T013** [US1] Add `extractHelpDocs(result: SurveyPhaseResult): HelpDocsAnswers | undefined` (reads `pf_welcome_paragraph`, seeds `usageTips: []`) and wire it as `phaseFOptions.onCommit`, calling `deps.setHelpDocs` (depends on T006, T011) · `packages/studio/src/editors/adapters/flowStepOptions.tsx`
- [X] **T014** [US1] Add `setHelpDocs: (patch: HelpDocsAnswers | null) => void` to `FlowStepDeps`; read it via `useWorkingCopyStore((s) => s.setHelpDocs)` and thread it into `depsRef.current` alongside the existing store reads (depends on T006, T013) · `packages/studio/src/editors/adapters/makeFlowStepComponent.tsx`

**Checkpoint**: A Phase F author who answers only the required description now ships real content in all four doc files; Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 — Preview rendered documentation before producing output (P2)

**Goal**: An author can see the rendered README/popup/welcome/help-page content before ever producing an output package, and it updates live as they edit answers.

**Independent Test**: Answer the required description, open the preview, confirm it matches what Story 1's test asserts ends up in the shipped files; edit the answer and confirm the preview updates without a package being produced.

### Implementation

**Wave 1 — independent (different files):**

- [X] **T015** [P] [US2] `useDocsPreview()` hook: synchronously derives `{ readmeMd, readmeHtm, welcomeHtm, helpPhp }` from `useWorkingCopyStore` (`helpDocs`, `identity`, `attribution`, `baseWelcomeHtmText`, `baseHelpPhpText`) by calling T007's render functions directly on every render — no timer, no `useEffect` (Constitution Article IV; research D-08) (depends on T007) · `packages/studio/src/hooks/useDocsPreview.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [X] **T016** [US2] `DocsPreviewPanel` component rendering `useDocsPreview()`'s four outputs, mounted from the Phase F step UI (`PhaseFGate`/`PhaseFStepFactoryComponent`'s screen) behind a "Preview documentation" toggle — exact placement follows the existing panel-mount conventions in that step (depends on T015) · `packages/studio/src/components/DocsPreviewPanel.tsx`
- [X] **T017** [US2] Tests: preview output matches Story 1's shipped-file assertions for the same answers; changing `helpDocs` (via `setHelpDocs`) and re-rendering reflects the edit with no output package produced (FR-015/SC-006) (depends on T015, T016) · `packages/studio/src/hooks/useDocsPreview.test.ts`

**Checkpoint**: The preview reflects current answers live, before any output package exists; Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 — Optional default-path answers reach the docs (P3)

**Goal**: Usage tips, credits, community contact, and project link each land in their designated spot when answered, and leave no trace when skipped.

**Independent Test**: Answer one usage tip and a project URL, skip credits and contact info, produce the package — the answered items appear correctly, the skipped ones leave no section.

### Tests

**Wave 1 — independent (different files):**

- [X] **T018** [P] [US3] Unit test: `extractHelpDocs` captures `usageTips` (from whichever of `pf_usage_tip_1`/`pf_usage_tip_2` are answered), `credits`, `contactInfo`, and splits `pf_project_url`'s one-or-two-line answer into `projectHomeUrl`/`projectHelpUrl` · `packages/studio/src/editors/adapters/flowStepOptions.test.ts`
- [X] **T019** [P] [US3] Unit test: `buildDocSections`/`renderReadmeMd` render each of these when present and omit the section entirely when blank — no stray heading, no `undefined` (FR-003/SC-003) · `packages/engine/src/shared/helpDocsRender.test.ts`
- [X] **T020** [P] [US3] Unit test: `renderReadmeMd`'s Links section shows both a home-page and a help-page entry, correctly labeled, when `pf_project_url` supplied both lines (FR-004) · `packages/engine/src/shared/helpDocsRender.test.ts`
- [X] **T021** [P] [US3] Unit test: `buildKpsContent` emits `<WebSite>` from `projectHomeUrl` only, never from `projectHelpUrl` (FR-012, research D-06) · `packages/engine/src/package-descriptor/build.test.ts`

### Implementation

**⟶ Wait for Wave 1 (Tests) to finish, then:**

**Wave 2 — independent (different files):**

- [X] **T022** [P] [US3] Extend `extractHelpDocs` to populate `usageTips`, `credits`, `contactInfo`, `projectHomeUrl`, `projectHelpUrl` (depends on T013, T018) · `packages/studio/src/editors/adapters/flowStepOptions.tsx`
- [X] **T023** [P] [US3] Extend `buildDocSections` for usage tips / credits / contact info sections, each omitted when blank (depends on T007, T019) · `packages/engine/src/shared/helpDocsRender.ts`
- [X] **T024** [P] [US3] Add the README `Links` section to `renderReadmeMd` (home page + help page, correctly labeled, either line omitted when absent) (depends on T007, T020) · `packages/engine/src/shared/helpDocsRender.ts`
- [X] **T025** [P] [US3] Prune `README.md`'s Supported Platforms list to the projected `.kmn`'s actual `store(&TARGETS)` tokens (FR-008) — reuse the same parsing `buildKpsContent` already does rather than re-deriving it (depends on T008) · `packages/engine/src/shared/helpDocsRender.ts`, `packages/studio/src/lib/serializeWorkingCopy.ts`

**⟶ Wait for Wave 2 to finish, then:**

- [X] **T026** [US3] Thread `helpDocs.projectHomeUrl` through as `PackageDescriptorIdentity.websiteUrl` wherever the descriptor identity is assembled for output (depends on T004, T006, T021, T022) · `packages/studio/src/lib/serializeWorkingCopy.ts`

**Checkpoint**: The full default authoring path (description, tip, credits, contact, project link) now produces genuinely complete documentation; Story 3 is independently functional and testable.

---

## Phase 6: User Story 4 — Opt-in deep documentation reaches the online help page (P4)

**Goal**: Every opt-in "additional detail" answer (design rationale, font guidance, mark ordering, troubleshooting, related keyboards, etc.) appears as its own labeled section in `welcome.htm`/`help/<id>.php`.

**Independent Test**: Opt into additional detail, answer design rationale and known limitations, leave the rest blank — both appear as separate sections; nothing appears for the skipped opt-in questions.

### Tests

**Wave 1 — independent (different files):**

- [X] **T027** [P] [US4] Unit test: `extractHelpDocs` captures all eleven opt-in fields when answered (FR-011/FR-014) · `packages/studio/src/editors/adapters/flowStepOptions.test.ts`
- [X] **T028** [P] [US4] Unit test: `buildDocSections` renders only the opt-in sections that were answered, in the fixed order from research D-10, and omits the whole "Additional Detail" grouping when none were answered · `packages/engine/src/shared/helpDocsRender.test.ts`
- [X] **T029** [P] [US4] Regression test: a non-Latin-script routing case that reaches `pf_canonical_order` renders that section; a Latin-script case that never reaches it renders no such section — asserts the existing survey routing, not new logic (Acceptance Scenario 2) · `packages/studio/src/editors/adapters/flowStepOptions.test.ts`

### Implementation

**⟶ Wait for Wave 1 (Tests) to finish, then:**

- [X] **T030** [US4] Extend `extractHelpDocs` for the eleven opt-in fields (`fontGuidance`, `designRationale`, `canonicalOrder`, `scriptGlossary`, `troubleshooting`, `relatedKeyboards`, `knownLimitations`, `furtherReading`, `scopeVariety`, `provenanceBasis`, `exampleWords`) (depends on T022, T027) · `packages/studio/src/editors/adapters/flowStepOptions.tsx`
- [X] **T031** [US4] Extend `buildDocSections` with the opt-in battery in research D-10's order, each independently omitted when blank (depends on T023, T028) · `packages/engine/src/shared/helpDocsRender.ts`

**Checkpoint**: The full opt-in battery reaches the shipped welcome/help pages; Story 4 is independently functional and testable — all four user stories are now complete.

---

## Phase 7: Polish

**Wave 1 — independent (different files):**

- [X] **T032** [P] Cross-file parity test: for a sampled set of answer combinations, `welcome.htm`'s and `help/<id>.php`'s rendered bodies are identical (FR-005/SC-005) · `packages/engine/src/shared/helpDocsRender.test.ts`
- [X] **T033** [P] Update `docs/keyboard-documentation-plan.md`'s "What the tool already gives you" table — these four files are no longer bare placeholders once this feature ships · `docs/keyboard-documentation-plan.md`
- [X] **T034** [P] If any new test fixture cites a specific `../keyboards` corpus keyboard by name (e.g. for the `<WebSite>` sampling), add its row to the phonebook per the mandatory-currency rule · `docs/keyboard-index.md`

**⟶ Wait for Wave 1 to finish, then:**

- [X] **T035** Full-suite validation against the spec's Success Criteria (SC-001…SC-006): `pnpm typecheck`, `pnpm -r test`, `pnpm lint`

---

## Dependencies & Execution Order

- **Setup → Foundational → User Stories (in priority order) → Polish.** No user-story work begins until Foundational's Wave 3 is fully reconciled.
- **Foundational**: Wave 1 (T002–T004, independent) → Wave 2 (T005–T007, each depends on a Wave-1 file but not on each other) → Wave 3 (T008–T009, each depends on Wave 2 but not on each other) → T010 (regression tests, depends on all of Wave 3).
- **User Story 1** (T011–T014): Tests wave (T011–T012, independent) blocks the implementation pair (T013 then T014 — T014 depends on T013's new `extractHelpDocs`). Depends on Foundational.
- **User Story 2** (T015–T017): T015 (the hook) blocks T016 (the panel) and T017 (tests exercise both). Depends on Foundational only — independent of Story 1's own tasks, though it renders Story 1's output.
- **User Story 3** (T018–T026): Tests wave (T018–T021, independent) blocks the implementation wave (T022–T025, independent of each other) blocks T026 (depends on T022's new fields plus T004's descriptor change). Depends on Foundational; independent of Stories 1/2's tasks.
- **User Story 4** (T027–T031): Tests wave (T027–T029, independent) blocks T030 then T031 (sequential — both touch the fields/sections the other introduces). Depends on Foundational; independent of Stories 1/2/3's tasks.
- **Polish** (T032–T035): Wave 1 (T032–T034, independent) blocks T035 (the full-suite gate). Depends on every user story being complete.

**Parallel opportunities**: Once Foundational is done, Stories 1–4 have no file overlap with each other and can be built in any order or concurrently (a host with subagent support can run them as separate parallel workers). Within each story/phase, tasks marked `[P]` touch different files and have no incomplete dependency between them.
