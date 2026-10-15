# Tasks: Keyboard documentation templates and version policy

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: included. The plan's Testing section names each suite. Write each test first and watch it fail.

**Shape**: the forms pipeline (renderer, slot vocabulary, form data, and the three renderers rebuilt on it) is Foundational, because every story's output goes through it. The story phases add the version rule (US1), the derived content (US2), the form-level guarantees (US3) and the Track 2 inheritance surface (US4).

**Deviation from the contracts**: [contracts/doc-forms.md](contracts/doc-forms.md) puts the form checks in `packages/contracts/src/docForms.test.ts`. Those checks need `parseDocForm` and `DOC_SLOT_IDS` from the engine, and contracts cannot import the engine because the engine already depends on contracts. The check moves to `packages/engine/src/shared/docForms.check.test.ts`, which `pnpm -r test` still runs (FR-028).

**One shared file**: `packages/studio/src/lib/serializeWorkingCopy.ts` is the one output writer. US1 edits its version and lineage, and US2 edits its docs input, so **US2 starts only after US1 is done**. Splitting the writer only to separate ownership would add a module with no other purpose.

## Phase 1: Setup

Files: `packages/studio/src/lib/docContent.fixtures.ts`

- [x] **T001** Add the fixture keyboards as inline `.kmn` sources parsed to IR, plus touch layouts: deadkey, right-Alt layer, repeat-to-cycle (rota), combining marks, touch with long-press and flick, no touch, and one with more than 200 non-ASCII characters (summary switch). US2, US3 and Polish share them · `packages/studio/src/lib/docContent.fixtures.ts`

## Phase 2: Foundational (the forms pipeline)

No story starts until this phase is done. When it ends, output is byte-identical to today's except for planned changes. Today's existing snapshots stay green, or each changed snapshot has a stated reason.

Files: `packages/contracts/data/doc-forms.json`, `packages/contracts/src/docForms.ts`, `packages/contracts/src/index.ts`, `packages/engine/src/shared/docSlots.ts`, `packages/engine/src/shared/docSlots.test.ts`, `packages/engine/src/shared/renderDocForm.ts`, `packages/engine/src/shared/renderDocForm.test.ts`, `packages/engine/src/shared/docForms.check.test.ts`, `packages/engine/src/shared/renderHistoryMd.ts`, `packages/engine/src/shared/renderHistoryMd.test.ts`, `packages/engine/src/shared/helpDocsRender.ts`, `packages/engine/src/shared/helpDocsRender.test.ts`, `packages/engine/src/shared/packageDocs.ts`, `packages/engine/src/index.ts`, `packages/engine/src/output/adapt-staging.ts`, `packages/studio/src/hooks/useDocumentationFindings.ts`

**Wave 1: independent (different files):**

- [x] **T002** [P] Create `doc-forms.json` with the seven forms (`readmeMd`, `readmeHtm`, `welcome`, `help`, `body`, `history`, `license`) as line arrays, plus the four `mechanisms` paragraphs. The forms reproduce today's section order and add the derived-content blocks (`typingGuide`, `mechanisms`, `layoutPictures`, `touchNotes`, `characterInventory`), each heading inside its own `{{#slot}}` block. Add `docForms.ts` with `DocFormId`, `DocMechanismId`, `DocForms`, a strict `DocFormsSchema` (no extra keys) and `DOC_FORMS`, loaded the way `axisPriors.ts` loads its data. Export it from the contracts barrel (FR-022, FR-023, FR-024, FR-029, FR-031) · `packages/contracts/data/doc-forms.json`, `packages/contracts/src/docForms.ts`, `packages/contracts/src/index.ts`
- [x] **T003** [P] Write `docSlots.test.ts` first: `stripGeneratedBlocks` removes every marked block and the legacy `<!-- Keyboard Studio additions -->` tail and leaves other prose byte-identical; `escapeDocHtml` handles `<`, `&` and quotes; `escapeDocMarkdown` escapes Markdown metacharacters. Then create `docSlots.ts` with `DocSlotModel`, `DocSlotId`, `DOC_SLOT_IDS`, `DOC_GENERATED_START` and `DOC_GENERATED_END`, `stripGeneratedBlocks`, `escapeDocHtml` (wrapping the existing `escapeHtml`) and `escapeDocMarkdown` (FR-027, FR-033) · `packages/engine/src/shared/docSlots.ts`, `packages/engine/src/shared/docSlots.test.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T004** Write `renderDocForm.test.ts` first, covering `{{id}}` insertion, an absent slot rendering as `""`, a kept `{{#id}}` block, an empty or whitespace-only slot dropping its block and the following newline, determinism, and `parseDocForm` errors (unbalanced block, unknown construct) that name the problem. Then create `renderDocForm.ts` with `renderDocForm`, `parseDocForm` and `DocFormParseError` (FR-020, FR-023, FR-024) · `packages/engine/src/shared/renderDocForm.ts`, `packages/engine/src/shared/renderDocForm.test.ts`

**⟶ Wait for T004, then (Wave 3, independent):**

- [x] **T005** [P] Write `docForms.check.test.ts`. Every `DOC_FORMS` form passes `parseDocForm`. Every referenced slot is in `DOC_SLOT_IDS`. `{{version}}` appears only in `history` and `{{year}}` only in `license`. `typingGuide` is absent from `readmeMd`. Each failure names the form id (FR-026, FR-028, FR-029) · `packages/engine/src/shared/docForms.check.test.ts`
- [x] **T006** [P] In `renderHistoryMd.ts`, replace `adaptedFrom` with `lineage: HistoryLineage | null`, add `createdFromBullet`, and render the file through the `history` form. Keep the existing dedupe, and inject the lineage bullet first in the newest entry, decided or not. Update `renderHistoryMd.test.ts`: `{ kind: "adapted" }` gives exactly today's output, `created` with no decided entry gives the created-from bullet then `"Initial release."`, and a verbatim bullet is not duplicated (FR-007, FR-011) · `packages/engine/src/shared/renderHistoryMd.ts`, `packages/engine/src/shared/renderHistoryMd.test.ts`
- [x] **T007** [P] Reimplement `helpDocsRender.ts` on `renderDocForm`, keeping every export. `renderWelcomeHtm` and `renderHelpPhp` both render the shared `body` form. The help page keeps the `helpSiteHeader` prefix and fragment-only shape. `HelpDocsRenderInput` gains optional `generated: GeneratedDocSlots`. Every author answer is escaped per target file. On Track 2, `stripGeneratedBlocks` runs on the inherited prose, which comes first, followed by the generated sections between the markers. Copy output has no markers. Update `helpDocsRender.test.ts`: existing snapshots stay green where content is unchanged, `<` and `&` in answers stay literal and well-formed, and a second render over inherited prose that already holds a marked block gives exactly one block (FR-025, FR-027, FR-031, FR-032, FR-033) · `packages/engine/src/shared/helpDocsRender.ts`, `packages/engine/src/shared/helpDocsRender.test.ts`
- [x] **T008** [P] Render `licenseMd(holder, year)` through the `license` form, with the signature unchanged and output identical to today (FR-026) · `packages/engine/src/shared/packageDocs.ts`

**⟶ Wait for Wave 3 to finish, then (Wave 4, independent):**

- [x] **T009** [P] Export `renderDocForm`, `parseDocForm`, `DocFormParseError`, `DocSlotModel`, `DocSlotId`, `DOC_SLOT_IDS`, `GeneratedDocSlots`, `HistoryLineage`, `createdFromBullet`, the generated-block markers, `stripGeneratedBlocks`, `escapeDocHtml` and `escapeDocMarkdown`. Drop any re-export of the removed `adaptedFrom` option type · `packages/engine/src/index.ts`
- [x] **T010** [P] Migrate the engine caller to `lineage: { kind: "adapted", id: originalId, version: originalVersion }` · `packages/engine/src/output/adapt-staging.ts`
- [x] **T011** [P] Migrate the docs-lint history render to `lineage`: `adapted` on Track 2, and on Track 1 `created` with the start keyboard's id and raw version, so the linted history matches what ships (FR-011) · `packages/studio/src/hooks/useDocumentationFindings.ts`

**Checkpoint**: `pnpm -r build` and `pnpm -r test` are green. Every documentation file now renders through a form.

## Phase 3: User Story 1, a new keyboard starts at the right version (P1) MVP

**Goal**: a Copy keyboard ships at 1.0, its test builds at 0.N, and all four version sites agree. Adapt is unchanged.

**Independent Test**: start from a 2.3 keyboard, choose Copy, download. The package says 1.0 everywhere.

Files: `packages/engine/src/output/output-version.ts`, `packages/engine/src/output/output-version.test.ts`, `packages/studio/src/lib/projectWorkingCopyVfs.ts`, `packages/studio/src/lib/serializeWorkingCopy.ts` (version and lineage; US2 edits it after this phase), `packages/studio/src/lib/serializeWorkingCopy.test.ts`, `packages/studio/e2e/copy-version.spec.ts`

### Tests

**Wave 1: independent (different files):**

- [x] **T012** [P] [US1] Extend the version table in `output-version.test.ts` to cover both modes, one-, two- and three-part sources, with and without test builds, and an invalid or empty source. `new-from-base` always publishes `"1.0"`, test build N is `{ ok: true, version: "0.N" }` even for an invalid source, and every `adapt-existing` row is unchanged (SC-001, FR-004, FR-007, FR-008) · `packages/engine/src/output/output-version.test.ts`
- [x] **T013** [P] [US1] Add package-consistency cases. Copy from a 2.3 start keyboard gives `1.0` in `&KEYBOARDVERSION`, the `.kps` `<Version>`, the result `version` (file name) and the newest HISTORY heading, for both a renamed and an unrenamed id. The `.kps` file-format version is unchanged. Copy HISTORY contains "Created from <id> v2.3 via keyboard-studio.". An Adapt case matches today's output (SC-002, FR-009, FR-011) · `packages/studio/src/lib/serializeWorkingCopy.test.ts`

### Implementation

**⟶ Wait for the tests, then (Wave 2, independent):**

- [x] **T014** [P] [US1] `resolvePublishVersion`: `"new-from-base"` returns `"1.0"`. `resolveTestBuildVersion`: `"new-from-base"` computes against P = 1.0, with the invalid-version check moved after that branch. Signatures and `adapt-existing` are unchanged (FR-004, FR-007, FR-008, FR-010) · `packages/engine/src/output/output-version.ts`
- [x] **T015** [P] [US1] Delete the copy-path base-version preservation (`copyVersion`, step 4), so `resetIdentity` takes the overlay version or its `1.0` default · `packages/studio/src/lib/projectWorkingCopyVfs.ts`
- [x] **T016** [P] [US1] Make `publishVersion` come from `resolvePublishVersion` on both tracks. Always set `identityForProjection.version = shippedVersion`, not only for a test build. Pass `lineage`: `created` (start id plus raw version) on Track 1 and `adapted` on Track 2 (FR-001, FR-009, FR-011) · `packages/studio/src/lib/serializeWorkingCopy.ts`

**⟶ Wait for Wave 2, then:**

- [x] **T017** [US1] Write a Playwright E2E. Pick a keyboard whose version is not 1.0 and choose Copy. The Output step's version and the download file name show 1.0 (Constitution Art. XI) · `packages/studio/e2e/copy-version.spec.ts`

**Checkpoint**: US1 is independently functional. T012, T013 and T017 pass.

## Phase 4: User Story 2, the documentation explains how the keyboard works (P1)

**Goal**: with no answers given, welcome and help carry a typing guide, mechanism paragraphs, layout pictures, phone/tablet notes and a character inventory derived from the IR as built.

**Independent Test**: a deadkey plus right-Alt keyboard with no answers. Both pages show a typing guide, exactly those two mechanism paragraphs, the layout pictures and a character list, and the bodies are identical.

**Depends on**: Phase 3 (shares `serializeWorkingCopy.ts`).

Files: `packages/studio/src/lib/docContent.ts`, `packages/studio/src/lib/docContent.test.ts`, `packages/studio/src/hooks/useDocsPreview.ts`, `packages/studio/src/hooks/useDocsPreview.test.ts`, `packages/studio/src/lib/serializeWorkingCopy.ts` (docs input only)

### Tests

**Wave 1: independent (different files):**

- [x] **T018** [P] [US2] Write `docContent.test.ts` against the T001 fixtures, with one snapshot per slot per fixture. The typing guide covers every produced character outside U+0020–U+007E in code-point order, with the fewest-step keystrokes and the label tie-break. Mechanism paragraphs appear only for detected mechanisms, in fixed order. `touchNotes` is `""` with no touch layout. The inventory is grouped as letters, marks, punctuation and symbols, and digits. Combining marks sit on U+25CC, and unnamed characters show as `U+XXXX`. Two calls are identical. Above 200 rows the guide becomes the summary. Suppression fires at ≥ 50 % overlap of one table or list, not below it, and leaves the other slots unchanged (FR-012 to FR-020, FR-034, SC-003) · `packages/studio/src/lib/docContent.test.ts`
- [x] **T019** [P] [US2] Extend `useDocsPreview.test.ts`. The preview welcome and help contain the derived sections. Changing the working-copy IR updates them in the same memoised derivation. No timer is created (fake timers show no pending timer). `typingGuideSuppressed` is returned (FR-021, D3) · `packages/studio/src/hooks/useDocsPreview.test.ts`

### Implementation

**⟶ Wait for the tests, then:**

- [x] **T020** [US2] Create `docContent.ts` with `buildDocContent`, `DocContentInput`, `DocContent` and `TYPING_GUIDE_SUMMARY_THRESHOLD = 200`. It builds the typing guide from `buildProducedSet` and `charProducers`/`keySequenceLabel`, detects mechanisms per R7 using `DOC_FORMS.mechanisms` for the wording, builds touch long-press and flick notes, and builds the inventory from contracts `getName`/`getCategory`. It suppresses the guide per R11 and escapes every value with `escapeDocHtml`. It is pure and synchronous. Add the comment `// simplified: base = printable ASCII; when another base layout is declared, derive the set from it.` · `packages/studio/src/lib/docContent.ts`

**⟶ Wait for T020, then (Wave 3, independent):**

- [x] **T021** [P] [US2] Feed `buildDocContent({ ir, touchLayout, inheritedProse })` from the working-copy store into `HelpDocsRenderInput.generated` inside the existing `useMemo`, and return `typingGuideSuppressed`. Pass `layoutPictures` from the existing chart derivation · `packages/studio/src/hooks/useDocsPreview.ts`
- [x] **T022** [P] [US2] Pass the same `buildDocContent` result into `docsInput.generated`. Inherited prose is the start welcome/help text on Track 2 and `null` on Track 1. `layoutPictures` comes from `buildLayoutCharts` (FR-016) · `packages/studio/src/lib/serializeWorkingCopy.ts`

**Checkpoint**: US2 is independently functional. A no-answer download of the deadkey plus right-Alt fixture passes the Independent Test.

## Phase 5: User Story 3, each documentation file follows a consistent form (P2)

**Goal**: prove the form guarantees end to end over the real output path. The mechanics came in Phase 2.

**Independent Test**: edit one heading in the `body` form. It changes on welcome and help only, with no engine code touched.

Files: `packages/studio/src/lib/serializeWorkingCopy.forms.test.ts`

- [ ] **T023** [US3] Write an output-level forms test over the T001 fixtures. Each fixture checks the following. The version appears only in HISTORY.md and the year only in LICENSE.md. Every file that names a copyright holder names the same one. The welcome and help bodies are equal once the help header and the welcome layout section are set aside. With no answers, an empty usage-tips section and its heading are absent, and every file is a complete document, not today's one-line placeholder. An answer containing `<` and `&` gives a well-formed page that shows the text literally. A `DOC_FORMS.forms.body` heading swapped in through `vi.mock` of the contracts module appears on welcome and help and nowhere else (FR-024, FR-025, FR-026, FR-027, FR-030, SC-006) · `packages/studio/src/lib/serializeWorkingCopy.forms.test.ts`

**Checkpoint**: US3 is verified. A failure here is fixed in its Phase 2 owner file (`doc-forms.json` or `helpDocsRender.ts`).

## Phase 6: User Story 4, adaptations keep the original's documentation (P3)

**Goal**: Track 2 keeps the original prose first, carries one generated block, and tells the author when the typing guide was skipped.

**Independent Test**: adapt a keyboard whose help page has a typing table, and download twice. The prose appears once, the guide is absent, the other sections appear once, and the checklist explains why.

Files: `packages/studio/src/components/DocumentationChecklist.tsx`, `packages/studio/src/components/DocumentationChecklist.test.tsx`, `packages/studio/src/components/OutputScreen.tsx`, `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/en/messages.js`, `packages/studio/src/locales/fr/messages.json`, `packages/studio/src/locales/fr/messages.js`, `packages/studio/src/lib/serializeWorkingCopy.inheritedDocs.test.ts`

### Tests

**Wave 1: independent (different files):**

- [ ] **T024** [P] [US4] Write a Track 2 output test. The original welcome/help prose comes first and the generated sections follow inside the markers. Copy carries none of the original prose but keeps its images and skeleton. With a typing table covering ≥ 50 % of the guide's characters, the guide is omitted and the other sections stay. An original that already holds a `ks:generated` block gives exactly one block. Two downloads give byte-identical files (FR-032, FR-033, FR-034, SC-005) · `packages/studio/src/lib/serializeWorkingCopy.inheritedDocs.test.ts`
- [ ] **T025** [P] [US4] Add a test that the checklist shows "Typing guide not generated: the original docs already include one." when `typingGuideSuppressed` is true and hides it otherwise · `packages/studio/src/components/DocumentationChecklist.test.tsx`

### Implementation

**⟶ Wait for the tests, then (Wave 2, independent):**

- [ ] **T026** [P] [US4] Add a `typingGuideSuppressed` prop and render `output.docs.checklist.typingGuideSuppressed` through the Lingui `t`/`<Trans>` macro per spec 046 · `packages/studio/src/components/DocumentationChecklist.tsx`
- [ ] **T027** [P] [US4] Pass `typingGuideSuppressed` from `useDocsPreview` into `DocumentationChecklist` · `packages/studio/src/components/OutputScreen.tsx`

**⟶ Wait for Wave 2, then:**

- [ ] **T028** [US4] Extract and compile the catalogs so `output.docs.checklist.typingGuideSuppressed` lands in `en` and `fr` (FR-035) · `packages/studio/src/locales/en/messages.json`, `packages/studio/src/locales/en/messages.js`, `packages/studio/src/locales/fr/messages.json`, `packages/studio/src/locales/fr/messages.js`

**Checkpoint**: US4 is independently functional. T024 and T025 pass.

## Phase 7: Polish

Files: `packages/studio/src/lib/collectDocLintInput.forms.test.ts`, `docs/keyboard-documentation-plan.md`, `specs/095-keyboard-docs-templates/quickstart.md`

**Wave 1: independent (different files):**

- [ ] **T029** [P] Write a Layer C test. `runDocChecks` (13 codes) over the projected output of every T001 fixture, with no answers and with full answers, reports zero form-attributable findings (SC-004) · `packages/studio/src/lib/collectDocLintInput.forms.test.ts`
- [ ] **T030** [P] Add a "What the tool gives you" section listing the derived sections, the version rule for Copy and Adapt, and where content edits the forms · `docs/keyboard-documentation-plan.md`
- [ ] **T031** [P] Write the quickstart: how to verify each story by hand in the studio (Copy at 1.0, a no-answer download, a form-edit round trip, an Adapt with a typing table) · `specs/095-keyboard-docs-templates/quickstart.md`

**⟶ Wait for Wave 1, then:**

- [ ] **T032** Validate against the Success Criteria. Run `pnpm build`, `pnpm lint` (ESLint, depcruise, the i18n tiers), `pnpm -r test`, and the `copy-version` Playwright spec. Check SC-001 to SC-006 against T012, T013, T018, T023, T024 and T029. Check SC-007 with the existing draft-persistence tests (no `HelpDocsAnswers` field changed). Confirm that no keyboard outside [docs/keyboard-index.md](../../docs/keyboard-index.md) was referenced (the fixtures are inline) · (no file)

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T011)** → **US1 (T012–T017)** → **US2 (T018–T022)** → **US3 (T023)** and **US4 (T024–T028)** in parallel → **Polish (T029–T032)**.
- US2 waits for US1 only because both edit `serializeWorkingCopy.ts`. US3 and US4 own disjoint files and can run as two workers.
- Foundational waves: W1 {T002, T003} → W2 {T004} → W3 {T005, T006, T007, T008} → W4 {T009, T010, T011}.
- US1: tests {T012, T013} → {T014, T015, T016} → T017.
- US2: tests {T018, T019} → T020 → {T021, T022}.
- US3: T023 alone.
- US4: tests {T024, T025} → {T026, T027} → T028.
- Polish: {T029, T030, T031} → T032.
