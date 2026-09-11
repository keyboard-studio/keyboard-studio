# Tasks: Documentation completeness — every package ships its full documentation set

**Input**: Design documents from `specs/076-documentation-completeness/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: The spec's Success Criteria (SC-002 sweep, SC-004 byte-identity, SC-007 fixture
sweep, SC-008 legibility) and the repo's "one green phase per commit" cadence require tests,
so each phase carries its own test tasks. Tests are co-located `*.test.ts` files per package
convention; they are written alongside implementation, not TDD-first.

**Organization**: One phase per user story in spec priority order (P1 → P7). Each phase lands
independently with green gates (`pnpm typecheck && pnpm lint` plus the touched packages'
`vitest`) and one commit on branch `076-documentation-completeness`
(`feat(engine|studio|…): … spec 076 TNNN-TNNN`). Push to the feature branch after each green
phase; never merge unasked.

**Team ownership** (Constitution Article VI): the engine team owns every task below **except**
those marked **[content]** — question wording, flow YAML copy, and checklist copy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1 … US7)
- Every task names the exact file(s) it touches

## Path Conventions

pnpm workspace monorepo: `packages/contracts/src/`, `packages/engine/src/`,
`packages/keyboard-lint/src/`, `packages/studio/src/`, `content/flows/`, `utilities/`,
`docs/`. Corpus keyboards live in the sibling `../keyboards` checkout.

---

## Phase 1: Setup

**Purpose**: Housekeeping the design artifacts already require.

- [ ] T001 Add phonebook rows for `ahom_star` and `akha_lahu` (cited in [contracts/help-header.md](contracts/help-header.md) and [quickstart.md](quickstart.md)) to `docs/keyboard-index.md`, reading each keyboard's `../keyboards/release/a/<id>/source/<id>.kps` for name, BCP47 languages, and author per the file's "Keep this current" recipe (CLAUDE.md: a stale phonebook is a defect)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The additive contracts types every later story reads. US1 does not depend on
this phase; US2–US7 do.

- [ ] T002 Create `packages/contracts/src/doc-members.ts` exporting the types from [data-model.md](data-model.md) §1–§7: `DocMemberId`, `DocSourceTier`, `DocMemberState`, `BaseDocLevel`, `WelcomeConvention`, `BaseDocumentationProfile`, `HistoryProposalStatus`, `HistoryProposal`, `HistoryEntryState`, `LayoutChartFile`, `LayoutChartInput`, `ChartPreference`, `DocLintInput`; re-export from `packages/contracts/src/index.ts`
- [ ] T003 Add zod mirrors for `DocMemberState`, `BaseDocumentationProfile`, `HistoryEntryState`, `LayoutChartFile`, `ChartPreference`, `DocLintInput` in `packages/contracts/src/schemas.ts` with the standard compile-time drift guard for each (Article I)
- [ ] T004 [P] Add `packages/contracts/src/doc-members.test.ts`: each schema round-trips a valid literal and rejects a malformed one; `DocMemberId` enumerates exactly six members with their projected paths

**Checkpoint**: `pnpm --filter @keyboard-studio/contracts test` and `pnpm typecheck` green.

---

## Phase 3: User Story 1 — Fresh help page carries the standard help-site header (Priority: P1) 🎯 MVP

**Goal**: A non-inherited `source/help/<id>.php` begins with the corpus-standard PHP header
([contracts/help-header.md](contracts/help-header.md)); inherited help pages are untouched.

**Independent Test**: Produce a net-new "Hausa Basic" package with only the required
description answered; `source/help/hausa_basic.php` starts with `$pagename = 'Hausa Basic
Keyboard Help'` / `$pagetitle = $pagename` / `require_once('header.php')`, followed by the same
body `source/welcome/welcome.htm` renders. Early production (no description) still has the
header above the placeholder body.

### Implementation for User Story 1

- [ ] T005 [US1] Add a pure `helpSiteHeader(displayName: string): string` to `packages/engine/src/shared/helpDocsRender.ts` emitting the exact block in [contracts/help-header.md](contracts/help-header.md): page name `<Display Name> Keyboard Help` (or `<Display Name> Help` when the name already ends in "Keyboard", case-insensitive), `$pagetitle = $pagename`, `require_once('header.php')`, with PHP single-quote escaping (`'` → `\'`, `\` → `\\`); export it from `packages/engine/src/index.ts`
- [ ] T006 [US1] In `renderHelpPhp` (`packages/engine/src/shared/helpDocsRender.ts`) prepend `helpSiteHeader` on the fresh-document path only — both the answered branch and the current bare `<?php /* <name> help */ ?>` placeholder branch (keep the stub body, add the header) — and leave the base-merge path (base help text present) byte-for-byte unchanged so no second header is ever added (FR-003)
- [ ] T007 [US1] Extend `packages/engine/src/shared/helpDocsRender.test.ts`: "Hausa Basic" header exact text; "Foo Keyboard" dedupes to "Foo Keyboard Help"; a name containing `'` and `\` is escaped; placeholder production still starts with the header; a base help page with its own header yields exactly one `$pagename`; the help body after the header equals the welcome body (spec 061 FR-005 / FR-004 parity)
- [ ] T008 [US1] Extend `packages/studio/src/lib/serializeWorkingCopy.stubCompletion.test.ts`: early production (no Phase F answers) writes a help page that begins with the standard header and is marked placeholder-bodied
- [ ] T009 [US1] Update every test or fixture that pins the old bare help stub (`grep -rn "help \*/" packages/engine/src packages/studio/src --include=*.test.ts`) to the new header-prefixed form; run `pnpm --filter @keyboard-studio/engine test` and `pnpm --filter @keyboard-studio/studio test`

**Checkpoint**: US1 ships alone. Commit `feat(engine): standard help-site header on fresh help pages (spec 076 T005-T009)`.

---

## Phase 4: User Story 2 — Welcome page ships in the folder convention, with its images (Priority: P2)

**Goal**: The welcome page lives at `source/welcome/welcome.htm` end-to-end (loader → store →
projection → descriptor → kmp), base welcome images are fetched and carried, the descriptor
lists everything, and no flat `source/welcome.htm` ever appears in output (FR-002, FR-006,
FR-007, SC-002).

**Independent Test**: Adapt `ahom_star` (folder convention, 6 images) and produce a package:
`source/welcome/welcome.htm` plus every image present, each listed in `<Files>` as
`welcome\…`, `<WelcomeFile>welcome\welcome.htm</WelcomeFile>`, no flat file. Adapt a
flat-convention base: still found and merged, output at the folder path. Net-new: welcome at
the folder path. Track 1 copy: images carried, no base prose.

### Implementation for User Story 2

- [ ] T010 [US2] In `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts` replace the single `source/welcome.htm` fetch (≈line 410) with the three-step resolution from research R3 — `.kps`-declared `<WelcomeFile>` first (the `.kps` is already parsed at ≈line 231 via `parseKpsFiles` from `packages/engine/src/base-browser/kps-parser.ts`), then `source/welcome/welcome.htm`, then flat `source/welcome.htm` — recording `baseWelcomeConvention` (`folder` wins when both exist; a 404 on the declared name degrades to the next probe, `absent` if none); when the folder convention is found, fetch every `welcome\…` file listed in `<Files>` (images as bytes, page as text) into `baseWelcomeImages`, skipping and recording missing files; also fetch `README.md` and `HISTORY.md` into `baseReadmeMdText` / `baseHistoryMdText`; extend `FetchKeyboardSourceResult` per [data-model.md](data-model.md) §6 (all optional, fetch-don't-write)
- [ ] T011 [P] [US2] In `packages/engine/src/package-descriptor/build.ts` add a `welcomeFolderFiles: string[]` input to `buildKpsContent`; `<Files>` lists `welcome\welcome.htm` plus each folder file (backslash-relative, corpus form) instead of `welcome.htm` (≈line 125); `<Options><WelcomeFile>` becomes `welcome\welcome.htm` (≈line 152)
- [ ] T012 [P] [US2] In `packages/engine/src/package-descriptor/patch.ts` add the welcome-path migration to `applyIdentityToKps`: rewrite a flat `welcome.htm` `<File>`/`<WelcomeFile>` reference to the folder form and append missing welcome-folder entries; report every rewrite in `warnings`; document in the module header that this is the sole sanctioned exception to the "don't touch `<Options>`/`<Files>`" rule (FR-002)
- [ ] T013 [P] [US2] In `packages/engine/src/scaffolder/index.ts` change the welcome stub path (≈line 563) to `source/welcome/welcome.htm`; confirm the rename pass (≈lines 158–168) still skips subdirectory files
- [ ] T014 [P] [US2] Extend `packages/engine/src/output/kmpPaths.test.ts`: `resolveFilename` handles the backslash-relative `welcome\welcome.htm` and `welcome\image.png` forms
- [ ] T015 [US2] Add store slices `baseReadmeMdText`, `baseHistoryMdText`, `baseWelcomeImages`, `baseWelcomeConvention` to `packages/studio/src/stores/workingCopyStore.ts` (declared defaults, identity-guarded setters, mutation-name allowlist entries) and snapshot/rehydrate coverage in `packages/studio/src/lib/persistWorkingCopy.ts` with a size budget on `baseWelcomeImages` ([contracts/studio-surfaces.md](contracts/studio-surfaces.md) store table)
- [ ] T016 [US2] Thread the loader bundle through instantiation in `packages/studio/src/hooks/useKeyboardArtifact.ts` (the fetch currently runs only on the open-base branch, ≈lines 742–748): on the adapt branch set all four slices; on Track 1 set `baseWelcomeImages` only and keep `baseWelcomeHtmText` / `baseHelpPhpText` / README / HISTORY prose slices `null` (research R9, FR-007)
- [ ] T017 [US2] In `packages/studio/src/lib/serializeWorkingCopy.ts` step 5c (≈line 455) write `source/welcome/welcome.htm` (never the flat path), write every `baseWelcomeImages` entry beside it by its own name, pass the resulting `welcomeFolderFiles` into `buildKpsContent` / the `applyIdentityToKps` migration, and collect a `missingInheritedImages` warning list by diffing `extractWelcomeImageRefs(baseWelcomeHtmText)` (new pure helper in `packages/engine/src/shared/helpDocsRender.ts`, [contracts/engine-api.md](contracts/engine-api.md)) against the carried image names (edge case)
- [ ] T018 [US2] In `packages/engine/src/shared/helpDocsRender.ts` give the fresh welcome page (`buildFreshHtmlDoc` branch of `renderWelcomeHtm`) a "Keyboard Layout" section referencing the carried image files when any are supplied, so a Track 1 copy inherits skeleton + images (research R9); the help page never receives this section (FR-004)
- [ ] T019 [US2] Tests: extend `packages/engine/src/loader/fetchKeyboardSourceToVfs.test.ts` (kps-named, folder, flat, ghost descriptor entry, both conventions → folder wins, images fetched, missing image recorded, README/HISTORY fetched); `packages/engine/src/package-descriptor/build.test.ts` and `patch.test.ts` (folder listing, `<WelcomeFile>`, migration + warning); `packages/studio/src/lib/serializeWorkingCopy.descriptor.test.ts` (no flat path in VFS or `<Files>`, every image listed); a Track 1 test in `packages/studio/src/lib/serializeWorkingCopy.test.ts` asserting no base prose sentence appears in the copy's welcome/help output (FR-007)
- [ ] T020 [US2] Update every existing engine/studio test that pins `source/welcome.htm` or `<WelcomeFile>welcome.htm` (`grep -rn "welcome.htm" packages --include=*.test.ts -l`) and re-run `pnpm --filter @keyboard-studio/engine test` and `pnpm --filter @keyboard-studio/studio test`
- [ ] T021 [P] [US2] Create the SC-002 offline sweep `utilities/welcome-sweep/run.mjs` (+ `README.md`): walk `../keyboards/release/**/source/welcome/`, run the loader's welcome-resolution and descriptor-projection logic against each folder-convention base, assert the welcome page and 100% of images are carried and listed; `[OK]`/`[ERROR]` console output, non-zero exit on any miss; add it to the standalone-utilities inventory in `docs/tooling.md`
- [ ] T022 [US2] Add `packages/studio/src/lib/serializeWorkingCopy.determinism.test.ts` (SC-004 seed): produce the same working copy twice with injected clock values and assert byte-identical `README.md`, `HISTORY.md`, `LICENSE.md`, `source/readme.htm`, `source/welcome/welcome.htm`, `source/help/<id>.php`; later phases extend this test. Add `packages/studio/src/lib/serializeWorkingCopy.memberMatrix.test.ts` (SC-001): a parametrized nine-cell matrix — net-new, Track 1 copy, Track 2 adaptation × flat-convention base, folder-convention base, base with no documentation — asserting every cell's output contains all six members with the welcome page at the folder path

**Checkpoint**: Run `node utilities/welcome-sweep/run.mjs` once against the corpus and record the count in the commit message. Commit `feat(engine): welcome folder convention end-to-end (spec 076 T010-T022)`.

---

## Phase 5: User Story 3 — Output step shows what documentation ships and where it came from (Priority: P3)

**Goal**: A pure `deriveDocMemberStates` is the single source of truth for six
`{path, tier, placeholder}` records (FR-022); an informational `DocumentationChecklist` on the
Output step renders them and never gates download or submission (FR-017, FR-018).

**Independent Test**: Reach Output with the HISTORY member on placeholder: six rows, HISTORY
marked placeholder, others show a tier; activating the row navigates to the Phase F step;
download and submission both remain enabled with every row on placeholder.

### Implementation for User Story 3

- [ ] T023 [US3] Create `packages/engine/src/shared/deriveDocMemberStates.ts` implementing the [contracts/engine-api.md](contracts/engine-api.md) signature: exactly six entries in `DocMemberId` order; FR-005 tier priority (`authored` only when an author answer contributed prose, `inherited` only on `adapt-existing` with base content present, else `derived`); Track 1 never `inherited` for prose members; `history-md.placeholder` true iff the stub would ship; `fillStepId` = the Phase F help step for description/HISTORY members and the step recorded for welcome/chart members; `warnings` from `missingInheritedImages`; export from `packages/engine/src/index.ts`
- [ ] T024 [P] [US3] Add `packages/engine/src/shared/deriveDocMemberStates.test.ts` covering the guarantees in T023 across net-new, Track 1, Track 2, dismissed-HISTORY, and missing-image inputs
- [ ] T025 [US3] Add store slices `historyEntryState: HistoryEntryState | null` (setter `setHistoryEntryState`) and `chartPreference: ChartPreference` (setter `setChartPreference`, default per FR-015) to `packages/studio/src/stores/workingCopyStore.ts` with allowlist entries, and snapshot/rehydrate coverage in `packages/studio/src/lib/persistWorkingCopy.ts` + `persistWorkingCopy.test.ts` — the derivation input needs them now; US5/US6 fill them
- [ ] T026 [US3] Create `packages/studio/src/hooks/useDocMemberStates.ts`: `useMemo`-wrapped call to `deriveDocMemberStates` keyed on the store slices it reads (`instantiationMode`, `helpDocs`, `historyEntryState`, base doc texts/images, keyboard id, projection warnings) — no timer (D3)
- [ ] T027 [US3] Create `packages/studio/src/components/DocumentationChecklist.tsx`: a semantic list of six rows showing member name, tier label (derived / inherited / authored), placeholder marker, and per-row warnings; placeholder rows render a "Go to <step>" button using existing store back-navigation actions plus `navigateTo("survey")` for Phase F — **never `advance()`** (documented P0 regression at `surveySessionStore.ts` ≈446–457); disclosure pattern per `packages/studio/src/editors/assignLoop/parts/RemovalBanner.tsx`; programmatic labels per `docs/accessibility.md`; strings wrapped with Lingui ids under `output.docs.checklist.*` (spec 046 conventions) **[content]** owns the copy
- [ ] T028 [US3] Mount `DocumentationChecklist` in `packages/studio/src/components/OutputScreen.tsx` between the download section and `ManagedPRSubmitPanel`; extend the Output editor step's `specRef` with `specs/076-documentation-completeness` in `packages/studio/src/steps/manifest.ts` / `manifest.specref.json` (FR-021, Article IX); do **not** touch `canDownload` (`usePreviewArtifact.ts`) or `submitEnabled` (`ManagedPRSubmitPanel.tsx`)
- [ ] T029 [US3] Tests: `packages/studio/src/components/DocumentationChecklist.test.tsx` (six rows, tier labels, placeholder marker, "Go to" calls the nav action and never `advance`); extend `packages/studio/src/components/OutputScreen.test.tsx` with the FR-018 regression — download and submit remain enabled with every row on placeholder; `packages/studio/src/steps/manifest.test.ts` still passes with the extended `specRef`
- [ ] T030 [US3] Run `pnpm --filter @keyboard-studio/studio messages:extract` so the new `output.docs.checklist.*` ids land in the source catalog; run `pnpm lint` (both i18n tiers)

**Checkpoint**: Commit `feat(studio): Output documentation checklist + deriveDocMemberStates (spec 076 T023-T030)`.

---

## Phase 6: User Story 4 — Help-docs step adapts to what the base documents (Priority: P4)

**Goal**: Bases are classified none / minimal / full / unknown at selection (FR-008); on an
adaptation of a base with a usable description, `pf_welcome_paragraph` is prefilled and no
longer required (FR-009, SC-005).

**Independent Test**: Focus a fully documented base in choose-base → card shows
"documentation: full"; at the Phase F description the base text is prefilled and one confirm
completes the step. A base with no welcome/help → "documentation: none", description required.
Track 1 copy of a full base → required, nothing prefilled.

### Implementation for User Story 4

- [ ] T031 [US4] Create `packages/engine/src/base-browser/classifyBaseDocumentation.ts`: `classifyBaseDocumentation(kpsFiles: KpsFileEntry[], welcomeText: string | null, helpText: string | null): BaseDocumentationProfile` plus an exported `extractUsableBaseDescription(welcomeText, helpText): string | null` implementing the spec assumption (strip header and layout section; ≥1 paragraph that is not the tool's placeholder text and not solely a chart reference); rules: none = no doc member beyond LICENSE in the manifest, minimal = members present but no usable description, full ⇔ usable description; `folder` wins over `flat`; never throws — degrades to `unknown` / `minimal`; export from `packages/engine/src/index.ts`
- [ ] T032 [P] [US4] Add `packages/engine/src/base-browser/classifyBaseDocumentation.test.ts` using `ahom_star`-shaped and `basic_kbdfr`-shaped `.kps` manifests: none / minimal / full / unknown, folder-wins, ghost descriptor entry → `absent`, malformed input does not throw, `full ⇒ hasUsableDescription`
- [ ] T033 [US4] Add an optional `docProfile?: BaseDocumentationProfile` carrier field on `BaseKeyboard` in `packages/contracts/src/baseKeyboard.ts` (additive, zod mirror in `schemas.ts`), and in `packages/engine/src/base-browser/base-browser.ts` compute the profile lazily for the focused base from the already-fetched `.kps` (≈lines 184–185) plus one welcome-probe fetch, cached per base id (research R4)
- [ ] T034 [US4] Add store slice `baseDocProfile: BaseDocumentationProfile | null` to `packages/studio/src/stores/workingCopyStore.ts` (setter, allowlist, persist in `persistWorkingCopy.ts`), set at base selection from the carrier
- [ ] T035 [P] [US4] Render the "documentation: none | minimal | full" badge on suggestion cards in `packages/studio/src/editors/panels/BaseResolution.tsx` and on `packages/studio/src/components/MetadataCard.tsx` for the selected base; `unknown` renders no badge (never "none"); Lingui ids under `base.docs.level.*` **[content]**; extend the `choose_base` step `specRef` in `packages/studio/src/steps/manifest.ts` / `manifest.specref.json`
- [ ] T036 [US4] Update `packages/studio/src/survey/questions/f/pf_welcome_paragraph.ts`: when `instantiationMode === "adapt-existing"` and `baseDocProfile.hasUsableDescription`, prefill the answer with `extractUsableBaseDescription(...)` and waive `required` (accept / edit / replace in one action, §3c); net-new, Track 1, and `none`/`minimal` bases behave exactly as today; write path unchanged (`extractHelpDocs` → `setHelpDocs`)
- [ ] T037 [US4] Tests: `packages/studio/src/survey/questions/f/pf_welcome_paragraph.test.ts` (prefill + waived on adapt-full; required + empty on net-new, Track 1, and adapt-none); badge render tests in `BaseResolution.test.tsx` / `MetadataCard.test.tsx` (unknown → absent); an SC-005 test proving the help step completes with a single confirm on an adapt-full fixture
- [ ] T038 [P] [US4] **[content]** Update the description prompt wording in `content/flows/phase_f_helpdocs.modular.yaml` to read as a proposal when prefilled ("We found this description in the base — keep, edit, or replace it"); run `pnpm lint` (content-i18n tier)

**Checkpoint**: Commit `feat(studio): base documentation profile + adaptive description (spec 076 T031-T038)`.

---

## Phase 7: User Story 5 — HISTORY.md carries a real first entry (Priority: P5)

**Goal**: A HISTORY entry is proposed from the decision-audit record, confirmed / edited /
dismissed on a new Phase F screen, and rendered at the top of `HISTORY.md` with the
"Adapted from" bullet always present on adaptations and base entries preserved below
(FR-010..FR-012).

**Independent Test**: Adapt `basic_kbdfr`, add two characters via a mechanism, reach the
Phase F history screen: proposal names the base and the additions under `## <version>
(<date>)`. Edit a bullet, confirm, produce: `HISTORY.md` top entry carries the edited bullets
plus "Adapted from", base entries below. Dismiss instead: stub ships, Output marks placeholder.

### Implementation for User Story 5

- [ ] T039 [P] [US5] Create `packages/engine/src/decision-audit/historyProposal.ts`: `buildHistoryProposal(seed: HistoryProposalSeed, version: string, dateIso: string): HistoryProposal` per [contracts/engine-api.md](contracts/engine-api.md) — heading `## <version> (<YYYY-MM-DD>)`, bullets for base ("Adapted from <id> <version>"), characters added, mechanisms assigned, keys removed; criteria 3.5 format; export from `packages/engine/src/decision-audit/index.ts` and `packages/engine/src/index.ts`
- [ ] T040 [P] [US5] Create `packages/engine/src/shared/renderHistoryMd.ts`: `renderHistoryMd(entry, opts)` per the contract — confirmed/edited entry at top (edited bullets win), `baseHistoryText` preserved verbatim below (criterion 3.4), dismissed/null renders the existing `Initial release.` stub unchanged, "Adapted from" injected on adaptations regardless of edits (FR-012 / criterion 19.2), date taken from the stored `proposal.dateIso` (research R12); export from `packages/engine/src/index.ts`
- [ ] T041 [US5] Add `packages/engine/src/decision-audit/historyProposal.test.ts` and `packages/engine/src/shared/renderHistoryMd.test.ts` covering every guarantee in T039–T040, including the version-change case (heading re-derived, `editedBullets` kept)
- [ ] T042 [US5] Create `packages/studio/src/decisions/historyProposalSeed.ts`: build `HistoryProposalSeed` from `snapshotDecisionRecord()` (`packages/studio/src/decisions/decisionLogStore.ts` ≈line 401), the `recordBaseContribution` baseline, and `EditorActionSummary` counts — no new change journal (spec assumption); add `historyProposalSeed.test.ts`
- [ ] T043 [US5] Create the question module `packages/studio/src/survey/questions/f/pf_history_entry.ts` (`inputs: []`, `writes: []`, `specRef: "specs/076-documentation-completeness"`, store-slice pattern per spec 061) rendering the proposal heading + bullets with confirm / edit-bullets / dismiss actions that call `setHistoryEntryState`; register it in `packages/studio/src/survey/questions/registry.f.ts`; **[content]** add the `pf_history_entry` screen to `content/flows/phase_f_helpdocs.modular.yaml` between the description and the opt-in gate, with its wording; re-derive `proposal.version` when the keyboard version changes while preserving `editedBullets`
- [ ] T044 [US5] In `packages/studio/src/lib/serializeWorkingCopy.ts` write `HISTORY.md` via `renderHistoryMd` every production: Track 1 replaces the stub body under the same heading; Track 2 supplies the entry `stageAdaptHistory` (`packages/engine/src/output/adapt-staging.ts` ≈line 96) prepends, with `baseHistoryMdText` preserved below — adjust `stageAdaptHistory` to accept the rendered entry rather than composing its own
- [ ] T045 [US5] Tests: extend `serializeWorkingCopy.stubCompletion.test.ts` (dismissed → stub + `history-md.placeholder`), `serializeWorkingCopy.test.ts` (confirmed/edited entry at top, base entries preserved, "Adapted from" present after edits), `packages/engine/src/output/adapt-staging.test.ts` for the new input, and `serializeWorkingCopy.determinism.test.ts` (confirmed entry byte-identical across two productions); `pf_history_entry.test.ts` for the three actions and the registry pickup via `registerQuestionSteps`; `manifest.test.ts` sees the new question
- [ ] T046 [US5] Confirm the Output checklist HISTORY row's "Go to" lands on the `pf_history_entry` screen and that returning shows `authored` — extend `DocumentationChecklist.test.tsx` (US3-2 / quickstart scenario 3.2)

**Checkpoint**: Commit `feat(studio): HISTORY proposal + renderHistoryMd (spec 076 T039-T046)`.

---

## Phase 8: User Story 6 — Every welcome page has a layout chart (Priority: P6)

**Goal**: A deterministic engine-side SVG renderer emits one `ks-layout-<platform>-<layer>.svg`
per layer into `source/welcome/`, referenced from the welcome page's "Keyboard Layout" section
and listed in the descriptor; base images are kept unless the author opts to regenerate
(FR-013..FR-016, SC-004, SC-008).

**Independent Test**: Net-new keyboard with default + shift desktop layers and a phone touch
layout, produced twice: `source/welcome/` holds `ks-layout-desktop-default.svg`,
`ks-layout-desktop-shift.svg`, one `ks-layout-phone-<layer>.svg` per touch layer; each is
referenced from the welcome page and listed in the `.kps`; both productions are byte-identical.
Legibility fixture draws a dotted-circle carrier, `U+XXXX`, and a distinct empty key.

### Implementation for User Story 6

- [ ] T047 [P] [US6] Create `packages/engine/src/layout-chart/geometry.ts` (fixed ANSI/ISO physical-grid table for desktop rows, RTL-agnostic key order) and `packages/engine/src/layout-chart/filename.ts` (`layoutChartFilename(platform, layerId)` → `ks-layout-<platform>-<sanitized>.svg`, sanitizing to `[a-z0-9_-]` with a deterministic escape; reserved prefix documented, FR-015)
- [ ] T048 [P] [US6] Create `packages/engine/src/layout-chart/legibility.ts`: classify a key output as combining mark (Mn/Mc/Me → render on U+25CC carrier), no-glyph heuristic (script-block table → render `U+XXXX` in a smaller monospace face), or empty (distinct hatched/dimmed keycap style); generic fallback font stack constant (FR-016, research R2)
- [ ] T049 [US6] Create `packages/engine/src/layout-chart/svg.ts` (string emitter with fixed attribute order, a fixed-precision number formatter, no timestamps) and `packages/engine/src/layout-chart/index.ts` exporting `renderLayoutCharts(input: LayoutChartInput): LayoutChartFile[]`: desktop layers from `KvksIR` when present else from `KeyboardIR` rule outputs via `buildComboKeyMap` / `collectLayerCombosInUse` projected onto the geometry table; touch layers from `TouchLayoutIR` using declared `width`/`pad` and `computeRowMetrics` (`packages/contracts/src/row-metrics.ts`); model-order iteration; zero touch files when `touchLayout` is null and vice versa; re-export from `packages/engine/src/index.ts`
- [ ] T050 [US6] Add `packages/engine/src/layout-chart/layoutChart.test.ts`: render twice → identical strings (FR-014); one file per (platform, layer); desktop-only and touch-only fixtures; filename sanitization and prefix; SC-008 legibility fixture (combining mark, no-glyph character, empty key) as an SVG snapshot asserting the carrier, the `U+XXXX` label, and the empty-key class
- [ ] T051 [US6] In `packages/engine/src/shared/helpDocsRender.ts` extend the "Keyboard Layout" section from T018 so `renderWelcomeHtm` lists every supplied chart/image file (grouped by platform, no omission for large layer counts) on both fresh and merged welcome pages, while the help page body still excludes it (FR-004); extend `helpDocsRender.test.ts`
- [ ] T052 [US6] In `packages/studio/src/lib/serializeWorkingCopy.ts` step 5c call `renderLayoutCharts` and write charts into `source/welcome/` when `chartPreference === "regenerate"` or the base ships no images (default per FR-015), keep inherited `baseWelcomeImages` untouched, never overwrite a base image (prefix guarantee), include charts in `welcomeFolderFiles` for the descriptor, and pass the file list to the welcome layout section; desktop-only / touch-only keyboards produce only their charts (edge cases)
- [ ] T053 [US6] Add a "Regenerate layout charts" / "Keep base images" control on the welcome row of `packages/studio/src/components/DocumentationChecklist.tsx` writing `setChartPreference` (store write, not a gate; the fifth FR-021 surface, declared in research R11 and covered by the Output step `specRef` extension from T028); Lingui ids under `output.docs.charts.*` **[content]**; `DocumentationChecklist.test.tsx` covers the toggle
- [ ] T054 [US6] Tests: extend `serializeWorkingCopy.test.ts` (charts present and listed; base-image keyboard yields no charts by default and keeps images; regenerate adds charts without touching base images), `serializeWorkingCopy.descriptor.test.ts` (each chart in `<Files>`), `serializeWorkingCopy.stubCompletion.test.ts` (early production still has charts), and `serializeWorkingCopy.determinism.test.ts` (chart bytes identical across two productions)

**Checkpoint**: Commit `feat(engine): deterministic SVG layout charts in the welcome folder (spec 076 T047-T054)`.

---

## Phase 9: User Story 7 — Documentation quality problems surface as yellow findings (Priority: P7)

**Goal**: Thirteen criteria rows (thirteen codes) become pure warning-level Layer C checks in twelve modules in
`@keymanapp/keyboard-lint` ([contracts/lint-checks.md](contracts/lint-checks.md)), wired
through a memoized studio hook inside the existing cycle (no new timer), with the missing
`origin: "upstream"` producer built from base baselines (FR-019, FR-020, SC-007).

**Independent Test**: Mutate the store so HISTORY's top version disagrees with the keyboard
version: exactly one warning names both versions, points at `HISTORY.md`, carries a hint;
download and submission still proceed. The SC-007 sweep fires each row on its broken fixture
and stays silent on the clean one; the bijection test proves every `lintRuleId` has an
emitting check.

### Implementation for User Story 7

- [ ] T055 [US7] Create `packages/keyboard-lint/src/checks/docs/_shared.ts` (+ `_shared.test.ts`): HISTORY parser (entries → `{version, date, bullets}`), dependency-free void-element-aware tag-balance scanner (11.5; module header documents the DOMParser deviation, research R7), body normalizer (strip PHP header and "Keyboard Layout" section, collapse whitespace), inline-style extractor, `$pagename` parser, README platform-list parser
- [ ] T056 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-3-3-history-order.ts` + test — `KM_LINT_HISTORY_ORDER` when the top entry is not the newest version
- [ ] T057 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-3-4-history-cumulative.ts` + test — `KM_LINT_HISTORY_TRUNCATED` when base HISTORY entries (input `DocLintInput.baseHistoryMdText`, [data-model.md](data-model.md) §7) are missing from the current text
- [ ] T058 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-3-5-history-entry-format.ts` + test — `KM_LINT_HISTORY_ENTRY_FORMAT` when a heading is not `<version> (<YYYY-MM-DD>)` followed by bullet items
- [ ] T059 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-3-6-7-1-version-match.ts` + test — one comparison emitting `KM_LINT_HISTORY_VERSION_MISMATCH` (location `HISTORY.md`) and `KM_LINT_KMN_VERSION_MISMATCH` (location the `.kmn`) at most once each, message naming both versions (US7-1)
- [ ] T060 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-3-7-history-stale-refs.ts` + test — `KM_LINT_HISTORY_STALE_FILE_REFS` when a bullet names a file in `deletedFilenames`
- [ ] T061 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-4-7-copyright-holder.ts` + test — `KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT` when present holder strings across LICENSE / `.kmn` / `.kps` / README / HISTORY differ (absent files skipped)
- [ ] T062 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-5-7-readme-targets.ts` + test — `KM_LINT_README_TARGETS_MISMATCH` naming each extra or missing platform versus `targets` (US7-2)
- [ ] T063 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-11-5-html-wellformed.ts` + test — `KM_LINT_HTML_NOT_WELL_FORMED` for unbalanced/unclosed elements in the welcome or help body
- [ ] T064 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-11-6-data-states.ts` + test — `KM_LINT_PHP_DATA_STATES_INCOMPLETE` when the help page's `data-states` names a layer not in `layerIds`
- [ ] T065 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-11-7-pagename-format.ts` + test — `KM_LINT_PHP_PAGENAME_FORMAT` when `$pagename` does not match the [help-header contract](contracts/help-header.md) form for `displayName`
- [ ] T066 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-11-9-body-parity.ts` + test — `KM_LINT_PHP_HTM_BODY_MISMATCH` when normalized welcome and help bodies differ (US7-3)
- [ ] T067 [P] [US7] Create `packages/keyboard-lint/src/checks/docs/check-11-10-style-parity.ts` + test — `KM_LINT_PHP_HTM_STYLE_MISMATCH` when inline CSS differs modulo non-rendering whitespace
- [ ] T068 [US7] Register the twelve check modules (thirteen codes) in `packages/keyboard-lint/src/lintContext.ts` behind a `ctx.docLintInput?: DocLintInput` gate (ordered list, all `severity: "warning"`, `layer: "C"`, `hint` populated, `location.file` = member path), export every check and the shared helpers from `packages/keyboard-lint/src/index.ts`; confirm `pnpm lint`'s `lint-not-to-engine` depcruise rule stays green (contracts-only imports)
- [ ] T069 [US7] Add `packages/keyboard-lint/src/checks/docs/bijection.test.ts`: read `packages/contracts/data/criteria.json`, collect the thirteen FR-019 `lintRuleId`s (rows 3.3, 3.4, 3.5, 3.6, 3.7, 4.7, 5.7, 7.1, 11.5, 11.6, 11.7, 11.9, 11.10), and assert each is emitted by exactly one registered check on its broken fixture and by none on the shared clean fixture (SC-007); fixtures under `packages/keyboard-lint/src/checks/docs/fixtures/`
- [ ] T070 [US7] Create `packages/studio/src/lib/collectDocLintInput.ts` (+ test): assemble `DocLintInput` from the rendered members the docs preview already computes (`packages/studio/src/hooks/useDocsPreview.ts`), the `.kmn` `&VERSION` / `&TARGETS`, desktop + touch layer ids, display name, copyright holders from LICENSE / `.kmn` / `.kps` / README / HISTORY, `deletedFilenames`, and `baseHistoryMdText`
- [ ] T071 [US7] Create `packages/studio/src/hooks/useDocumentationFindings.ts`: `useMemo` over `collectDocLintInput` → the twelve check modules (synchronous, `useTouchKeyDiagnostics` precedent in `packages/studio/src/hooks/useValidatorFindings.ts` ≈127–138), then apply the upstream classifier; concatenate its result into the findings array `packages/studio/src/StudioShell.tsx` (≈line 1202) already renders — **no new timer, no second debounce** (D3)
- [ ] T072 [US7] Upstream producer (FR-020, research R8): add store slice `baselineDocFindings: LintFinding[] | null` to `packages/studio/src/stores/workingCopyStore.ts` (persisted), computed once at instantiation in `useKeyboardArtifact.ts` by running the same checks over the base's own member texts; in `useDocumentationFindings.ts` mark a finding `origin: "upstream"` iff its `code` appears in that member's baseline **and** the member's tier from `useDocMemberStates` is still `inherited`
- [ ] T073 [US7] In `packages/studio/src/lint/LintSummary.tsx` exclude `origin: "upstream"` findings from the headline severity counts and the live-region text (they still render muted via `LintChip.tsx`); extend `LintSummary.test.tsx`
- [ ] T074 [US7] Tests: `useDocumentationFindings.test.tsx` (memo recomputes on input change only; the US7-1 store mutation yields exactly one `KM_LINT_HISTORY_VERSION_MISMATCH` warning with a hint; upstream classification flips to authored once the member is edited); FR-018 regression asserting documentation findings never reach `canDownload`, `submitEnabled`, or the blocking predicate in `packages/studio/src/dashboard/completeness.ts`; `lintContext.test.ts` covers the `docLintInput` gate (absent → no doc findings)

**Checkpoint**: Commit `feat(keyboard-lint): thirteen documentation check codes + upstream findings (spec 076 T055-T074)`.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T075 [P] Extend `packages/studio/e2e/copy-edit.spec.ts` (the template walk): the downloaded artifact contains all six members with the welcome page at `source/welcome/welcome.htm`, the help page starts with the standard header, and the documentation checklist is present on Output (quickstart "E2E"; local Playwright per the known global-install + junction procedure)
- [ ] T076 [P] Documentation: update `docs/keyboard-documentation-plan.md` (folder convention, tiers, HISTORY proposal, charts), `docs/packages.md` (new engine `layout-chart/` module, `deriveDocMemberStates`, `renderHistoryMd`, `classifyBaseDocumentation`; keyboard-lint `checks/docs/`), and `docs/tooling.md` (welcome-sweep already added in T021 — verify); cross-link criteria rows rather than re-deriving counts
- [ ] T077 [P] Record the Layer C cadence self-conflict (spec.md ≈:576 "per-phase-exit + at submit" vs ≈:649 "every 300 ms cycle"; FR-019 wording adopted) as a clarification request in `docs/spec-signoff.md` — do not edit `spec.md` §10 unilaterally
- [ ] T078 Run the full quickstart: `pnpm typecheck && pnpm lint`, `pnpm --filter @keyboard-studio/contracts test`, `pnpm --filter @keyboard-studio/engine test`, `pnpm --filter @keymanapp/keyboard-lint test`, `pnpm --filter @keyboard-studio/studio test`, `node utilities/welcome-sweep/run.mjs`; walk quickstart scenarios 1–7 in `pnpm dev`; check the vitest exit code, not just the "passed" line
- [ ] T079 If `docs/architecture.md` or any extracted spec unit changed, run `node utilities/spec-trace check` and acknowledge the intended drift (`node utilities/spec-trace acknowledge`); run `pnpm run spec-search "welcome.htm"` and fix any remaining flat-path prose references in `docs/**` this feature made stale

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: no dependencies; **blocks US2–US7** (contracts types). US1 does not need it.
- **US1 (Phase 3)**: independent — can start immediately, in parallel with Phase 2
- **US2 (Phase 4)**: needs Phase 2 (`WelcomeConvention`)
- **US3 (Phase 5)**: needs Phase 2 and US2 (member paths, base doc slices from T015)
- **US4 (Phase 6)**: needs Phase 2 and US2's loader/kps plumbing (T010); badge/store work is otherwise independent of US3
- **US5 (Phase 7)**: needs US3 (`historyEntryState` slice T025, checklist link-back) and US2 (`baseHistoryMdText`)
- **US6 (Phase 8)**: needs US2 (welcome folder + `welcomeFolderFiles`) and US3 (`chartPreference` slice, checklist row for the toggle)
- **US7 (Phase 9)**: needs US1–US6 content to exist for meaningful fixtures, US3's tier record for upstream classification; check modules T056–T067 themselves need only Phase 2
- **Polish (Phase 10)**: after all desired stories

### Story completion order

US1 → US2 → US3 → US4 → US5 → US6 → US7 (spec priority order; the plan's phasing). US4 may
be pulled ahead of US3 if staffed, since only T034's store slice pattern is shared.

### Within Each Story

- Contracts/pure engine functions before their tests before studio wiring
- Store slices before hooks before components before mounting
- Update pinned tests in the same task group as the behaviour change (T009, T020)
- One commit per phase; `tasks.md` checkboxes land with the work, never ahead of it

---

## Parallel Opportunities

- **Phase 2 ∥ Phase 3**: contracts types (T002–T004) and the US1 header work (T005–T009) touch disjoint files
- **US2**: T011, T012, T013, T014 (descriptor build, patch, scaffolder, kmpPaths test) run in parallel after T010; T021 (sweep utility) in parallel with T015–T020
- **US3**: T024 (derivation test) in parallel with T025–T026
- **US4**: T032, T035, T038 in parallel with T033–T034
- **US5**: T039 ∥ T040 (proposal builder and HISTORY renderer are separate modules)
- **US6**: T047 ∥ T048 (geometry/filename and legibility) before T049
- **US7**: T056–T067 — all twelve check modules in parallel after T055; T070 ∥ T073
- **Polish**: T075, T076, T077 in parallel

### Parallel Example: User Story 7

```text
# After T055 (_shared.ts) lands, dispatch the twelve check modules together:
Task: "check-3-3-history-order.ts + test"          (T056)
Task: "check-3-4-history-cumulative.ts + test"     (T057)
Task: "check-3-5-history-entry-format.ts + test"   (T058)
Task: "check-3-6-7-1-version-match.ts + test"      (T059)
Task: "check-3-7-history-stale-refs.ts + test"     (T060)
Task: "check-4-7-copyright-holder.ts + test"       (T061)
Task: "check-5-7-readme-targets.ts + test"         (T062)
Task: "check-11-5-html-wellformed.ts + test"       (T063)
Task: "check-11-6-data-states.ts + test"           (T064)
Task: "check-11-7-pagename-format.ts + test"       (T065)
Task: "check-11-9-body-parity.ts + test"           (T066)
Task: "check-11-10-style-parity.ts + test"         (T067)
# Then T068 registers them and T069 proves the bijection.
```

### Parallel Example: User Story 2

```text
# After T010 (loader) lands:
Task: "build.ts welcomeFolderFiles + <WelcomeFile>"   (T011)
Task: "patch.ts welcome-path migration"                (T012)
Task: "scaffolder folder-path stub"                    (T013)
Task: "kmpPaths backslash-form test"                   (T014)
Task: "utilities/welcome-sweep/run.mjs"                (T021)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 (phonebook) and T005–T009 (help header). Phase 2 is not required.
2. **STOP and VALIDATE**: `pnpm --filter @keyboard-studio/engine test`, quickstart scenario 1.
3. Commit and push the feature branch. US1 alone fixes the one shipped member that is
   currently wrong for every net-new keyboard (SC-003).

### Incremental Delivery

1. Phase 2 → US2 (folder convention + SC-002 sweep + SC-004 seed) → commit
2. US3 (checklist + tier record) → commit — the reporting surface every later story feeds
3. US4 (classification + adaptive description) → commit
4. US5 (HISTORY proposal) → commit
5. US6 (charts) → commit — determinism test now covers all six members plus charts
6. US7 (lint checks + upstream) → commit — SC-007 fixture sweep green
7. Polish → E2E, docs, spec-signoff note, full gate run

### Parallel Team Strategy

With two engineers after Phase 2: one takes US1 → US2 → US3 (the projection spine), the other
starts US7's twelve check modules (T055–T067, contracts-only, no studio dependency) and the
US6 renderer (T047–T050, engine-only), joining the spine for wiring (T068–T074, T051–T054)
once US3 lands. The **[content]** tasks (T027 copy, T035 copy, T038, T043 wording, T053 copy)
go to the content team as each phase opens.

---

## Notes

- Every store write is a slice write via an identity-guarded setter on the allowlist, not
  an IR write; the `mutate()` seam is not involved (Article IX reading recorded in plan.md).
- No new timer anywhere: `useDocMemberStates` and `useDocumentationFindings` are `useMemo`
  computations inside the existing render/validation cycle (D3).
- `criteria.json` is not edited; the twelve check modules string-match the thirteen existing `lintRuleId`s.
- Charts are SVG text so the managed-PR path (text entries only) carries them.
- Windows console output in `utilities/welcome-sweep` uses `[OK]` / `[ERROR]`, no emoji.
- Do not cite GitHub issue numbers in shipped code or comments.
