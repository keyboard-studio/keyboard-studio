---
description: "Task list — Flow-Question Content i18n (Tier B coverage for the modular flow engine)"
---

# Tasks: Flow-Question Content i18n (Tier B coverage for the modular flow engine)

**Input**: Design documents from `/specs/073-flow-question-i18n/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/flow-question-catalog-format.md](contracts/flow-question-catalog-format.md), [quickstart.md](quickstart.md)

**Tests**: Included (lean) — matches the repo's heavy-test norm and spec 046's own tasks.md precedent. Test tasks map to the spec's acceptance scenarios; they are not full TDD.

**Organization**: Grouped by user story (P1/P2/P3). Team ownership per Article VI: **(content)** = `content/` + `utilities/i18n-content-extract` + `utilities/content-i18n-lint`; **(engine)** = `packages/studio`. This mirrors spec 046 US2's own (content, + engine seam) split.

**Governing precedent**: spec 046 (specs/046-i18n-localization/) — the Tier A/B split, the `resolveContentString` loader (T028), the extraction control-field-exclusion discipline (T024/T027), the drift gate (T031), and the Crowdin Tier B mapping (T030). This feature extends that scope with a fourth catalog type; it does not re-derive it.

**GitHub issues**: epic #1374 · US1 #1375 (T001-T009) · US2 #1376 (T010-T012) · US3 #1377 (T013-T019). Parent epic: #1252 (spec 046).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish carry no story label)

---

## Phase 1: Setup (Shared Infrastructure) — (content + engine)

**Purpose**: No new toolchain — this feature reuses the entire spec 046 Tier B pipeline. This phase only confirms the ground state before extending it.

- [x] T001 Confirm the ground state before extending: `content/i18n/en/` holds `patterns.json`/`adaptationQuestions.json`/`criteria.json` (no `flowQuestions.json` yet), `pnpm run content-i18n-lint` is green, and `npx tsx utilities/i18n-content-extract/cli.ts --check` is green. Record the pre-change catalog count for the T014 completeness check.

---

## Phase 2: Foundational (Blocking Prerequisites) — (content + engine)

**⚠️ CRITICAL**: The new catalog type must exist in both the loader's type union and the extractor's output before any story work can resolve or extract flow-question strings.

- [x] T002 Add `"flowQuestions"` to the `ContentCatalogType` union, the `CONTENT_CATALOG_TYPES` array, and the `NAMESPACE` map (segment `"flowQuestion"`) in [packages/studio/src/lib/contentI18n.ts](../../packages/studio/src/lib/contentI18n.ts). This makes `activateContentLocale` lazy-load a `flowQuestions.json` chunk per locale and `resolveContentString("flowQuestions", …)` type-check — no other change to the loader (its resolution/fallback logic is type-generic).

**Checkpoint**: The Tier B loader knows about the fourth catalog type; extraction and wiring can now proceed.

---

## Phase 3: User Story 1 — Identity-lite language questions render in the active locale (Priority: P1) 🎯 MVP — (content + engine)

**Goal**: The `il_language_english` / `il_language_autonym` / `il_language_code` question prompts and help text render in the active locale with English fallback; typed answer values are never altered.

**Independent Test**: Switch Studio to `fr`, start the identity-lite flow, confirm the three language-identify question prompts + help text render in French; confirm a typed answer value renders verbatim.

### Tests for User Story 1

- [x] T003 [P] [US1] Extractor unit test in [utilities/i18n-content-extract/extract.test.ts](../../utilities/i18n-content-extract/extract.test.ts): `extractFlowQuestionStrings()` emits `content.flowQuestion.il_language_english.prompt` / `.help_text` (and the `il_language_autonym` / `il_language_code` keys), excludes control fields (`id`/`type`/`required`/`next`/`options_source`/`engine_resolved`/`advisory` and `options[].value`/`options[].note`), and drops empty-string values.
- [x] T004 [P] [US1] Loader resolution test in [packages/studio/src/lib/contentI18n.test.ts](../../packages/studio/src/lib/contentI18n.test.ts): a seeded `fr` `flowQuestions` catalog resolves `resolveContentString("flowQuestions", "il_language_english", "prompt", englishValue, i18n)` to the French value, and falls back to `englishValue` when the key is absent / locale is `en` / catalog not activated.
- [x] T005 [P] [US1] Render test in [packages/studio/src/survey/QuestionField.test.tsx](../../packages/studio/src/survey/QuestionField.test.tsx): with a seeded `fr` catalog, `QuestionField` renders the translated `prompt` (label) and `help_text` for `il_language_english`; and renders the typed answer value unchanged (FR-004 guard).

### Implementation for User Story 1

- [x] T006 [US1] Add `extractFlowQuestionStrings()` to [utilities/i18n-content-extract/extract.ts](../../utilities/i18n-content-extract/extract.ts): import the live phase sub-registries (`phaseARegistry`/`phaseBRegistry`/`phaseFRegistry`/`phaseGRegistry` — NOT `reserveRegistry`, per research.md D2), walk each module's `definition.{prompt,label,body,help_text}` and `definition.options?.[].label`, key as `content.flowQuestion.<id>.<field>` / `.option.<value>.label` (research.md D4/D5), skip empty strings. Add `flowQuestions` to `ContentCatalogs` and `extractContentCatalogs()`. (depends on T003)
- [x] T007 [US1] Add `flowQuestions.json` to the emitted-files list in [utilities/i18n-content-extract/cli.ts](../../utilities/i18n-content-extract/cli.ts)'s `run()`, then run the extractor to generate [content/i18n/en/flowQuestions.json](../../content/i18n/en/flowQuestions.json). (depends on T006)
- [x] T008 [US1] Wire the render sites in [packages/studio/src/survey/QuestionField.tsx](../../packages/studio/src/survey/QuestionField.tsx): resolve `labelText` (line ~764: `prompt ?? label ?? id`), the `help_text` paragraph (line ~789), the Notice fallback chain (`body ?? help_text ?? prompt`, line ~730), and each rendered option `label` through `resolveContentString("flowQuestions", question.id, field, <englishValue>, i18n)` using the live `I18n` (via `useLingui()`, matching the `Prefill.tsx` call-site pattern). English value stays the raw field so fallback is identity. (depends on T002)
- [x] T009 [US1] Author the French entries for the three identity-lite language questions in [content/i18n/fr/flowQuestions.json](../../content/i18n/fr/flowQuestions.json) (`il_language_english`, `il_language_autonym`, `il_language_code` — prompt + help_text). (depends on T007)

**Checkpoint**: The MVP — an author in `fr` sees the first three survey questions translated, with untouched answer values. STOP and validate against US1's independent test.

> **Implementation note (US1, landed):** A P0 surfaced in review — `SurveyRunner`'s `interpolateQuestion()` substitutes `{{base_name}}`/`{{language_name}}` into the English fields *before* `QuestionField`, so a translated catalog value (a raw template) rendered the literal token. Fix: `interpolate()` was extracted to the leaf module [packages/studio/src/survey/interpolate.ts](../../packages/studio/src/survey/interpolate.ts) and `QuestionField` now interpolates the *resolved* Tier-B string (passing an optional `context?: SurveyContext` prop). **US2/US3 must keep interpolation running AFTER `resolveContentString`** — any new resolved render site must wrap its output in `interpolate(resolved, context ?? {})`. Four live catalog strings carry tokens (`track_choice.prompt`, `pb_linguist_confirm.prompt`, the two `linguist` option labels); US2's full `fr` translation must preserve the `{{…}}` tokens verbatim.

---

## Phase 4: User Story 2 — Coverage generalizes to every modular flow-engine question (Priority: P2) — (content + engine)

**Goal**: Every live-registry modular flow question translates through the same path — not just the three identity-lite ids.

**Independent Test**: Add a `fr` entry for a non-identity-lite flow question (a Phase B or Phase G question) and confirm it resolves the same way the identity-lite ones do.

### Tests for User Story 2

- [x] T010 [P] [US2] Extend [utilities/i18n-content-extract/extract.test.ts](../../utilities/i18n-content-extract/extract.test.ts): assert `extractFlowQuestionStrings()` covers questions from every live phase registry (A/B/F/G) and emits NO key for any `registry.reserve.ts` module (research.md D2 — pick a known reserve id, e.g. `language_name_english`, and assert its absence).

### Implementation for User Story 2

- [x] T011 [US2] Verify T006's extractor walks the full merged live registry (all of A/B/F/G), not just Phase A. If T006 hardcoded only `phaseARegistry`, generalize it to merge all four live phase registries. (depends on T006) — **Already satisfied by T006**: `extractFlowQuestionStrings()` iterates `[phaseARegistry, phaseBRegistry, phaseFRegistry, phaseGRegistry]` ([extract.ts:168-173](../../utilities/i18n-content-extract/extract.ts#L168-L173)); no code change needed. T010's new dynamic per-registry coverage assertion locks this in.
- [x] T012 [US2] Complete the `fr` translation of [content/i18n/fr/flowQuestions.json](../../content/i18n/fr/flowQuestions.json) to full key parity against `content/i18n/en/flowQuestions.json` (every live question, all extracted fields) — the same parity bar the other three Tier B `fr` catalogs meet. (depends on T007, T009) — 202/202 keys, all `{{…}}` tokens (`{{language_name}}`, `{{base_name}}`) preserved verbatim, no empty values.

**Checkpoint**: Any live modular flow question translates; the fix is general, not special-cased to three ids.

---

## Phase 5: User Story 3 — Operational parity with the rest of the Tier B pipeline (Priority: P3) — (content)

**Goal**: The new catalog rides the same drift-gate and translator-sync machinery as the other three, so it can't silently rot.

**Independent Test**: `pnpm lint` validates `flowQuestions` freshness + `fr` parity; `crowdin.yml`'s Tier B block includes it.

### Tests for User Story 3

- [x] T013 [P] [US3] Add a lint-tool case to [utilities/content-i18n-lint/index.js](../../utilities/content-i18n-lint/index.js)'s test coverage (or a fixture assertion) that a `fr/flowQuestions.json` with a missing or extra key is reported as a parity problem. — Added [index.test.ts](../../utilities/content-i18n-lint/index.test.ts) (+ [vitest.config.ts](../../utilities/content-i18n-lint/vitest.config.ts)); `index.js` refactored to export a pure `lint()` core (main guarded by `require.main === module`). 5 cases: missing-key, extra/stale-key, values-differ-but-parity-passes, no-freshness-check (D7), and untranslated-locale-skipped.
- [x] T014 [US3] Add `"flowQuestions.json"` to `CATALOG_FILES` in [utilities/content-i18n-lint/index.js](../../utilities/content-i18n-lint/index.js) for the **locale key-set parity** check only (reference = committed `en/flowQuestions.json`, since this tool cannot re-extract TS modules in plain JS — research.md D7). Do NOT add a plain-JS freshness mirror for it. — Implemented as a separate `PARITY_ONLY_FILES` list (NOT added to `CATALOG_FILES`, which is freshness+parity), so `flowQuestions.json` is key-set-checked against the committed `en/flowQuestions.json` with no freshness mirror.
- [x] T015 [US3] Add a `pnpm` lint step that runs the extractor **freshness** check for `flowQuestions` (`npx tsx utilities/i18n-content-extract/cli.ts --check --quiet`) and wire it into the `lint` script in [package.json](../../package.json) alongside `content-i18n-lint` (research.md D7 — freshness is single-sourced in the TS extractor). (depends on T007) — Added `content-i18n-freshness` script (`tsx --tsconfig utilities/i18n-content-extract/tsconfig.json utilities/i18n-content-extract/cli.ts --check --quiet`) wired into `lint` before `content-i18n-lint`. `tsx` added as a root devDependency (was only transitive) so the step resolves deterministically in CI without a network fetch; `--tsconfig` pins the paths mapping for `@keyboard-studio/contracts` (cross-platform, no env var).
- [x] T016 [US3] Verify [crowdin.yml](../../crowdin.yml)'s Tier B block (`source: /content/i18n/en/*.json`) already globs the new `flowQuestions.json` — confirm no edit is needed and note it in the PR (research: the glob is inclusive). If a per-file mapping turns out to be required, add it mirroring the existing Tier B entry. — Verified: the Tier B `source: "/content/i18n/en/*.json"` glob already matches `flowQuestions.json`; `%original_file_name%` in the `translation` path carries it to `content/i18n/%locale%/flowQuestions.json`. **No edit needed.**

**Checkpoint**: All stories independently functional; the new catalog stays fresh + parity-checked with low toil.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T017 [P] Run [quickstart.md](quickstart.md) end-to-end (extract → lint → unit tests → manual `fr` walk of the identity-lite flow). — Automated pipeline green: freshness (`pnpm run content-i18n-freshness`), `content-i18n-lint` (incl. `flowQuestions` parity), studio `contentI18n.test.ts` (17), `QuestionField.test.tsx` (8), extractor suite (30), lint suite (5). The interactive `pnpm dev` browser walk (quickstart step 4) is not run headlessly here; the `QuestionField`/`contentI18n` render+resolution unit tests exercise the identical `resolveContentString("flowQuestions", …)` + interpolate path (US1 render tests) and stand as its headless proxy.
- [x] T018 [P] Completeness check (SC-002): confirm adding a fully-translated locale for `flowQuestions` requires zero code change (a new `content/i18n/<locale>/flowQuestions.json` alone resolves), mirroring spec 046 SC-004. — Confirmed by inspection of [contentI18n.ts](../../packages/studio/src/lib/contentI18n.ts): `activateContentLocale` maps over `CONTENT_CATALOG_TYPES` (which now includes `flowQuestions`) and dynamically imports `@content-i18n/${locale}/${type}.json`; `@content-i18n` is a **directory** alias (`../../content/i18n`, in vite.config.ts + vitest.config.ts + tsconfig `@content-i18n/*`). A new `content/i18n/<locale>/flowQuestions.json` is picked up by the same glob-backed dynamic import as the other three catalogs — no flowQuestions-specific code path, so no code change (only enabling the locale in `SUPPORTED_LOCALES`, the shared Tier A step, same as spec 046 SC-004).
- [x] T019 Update the T029 note / add a cross-reference in [specs/046-i18n-localization/tasks.md](../046-i18n-localization/tasks.md) and this feature's relationship to spec 046 (docs/i18n-spike.md if it enumerates Tier B catalog types), so the "three Tier B catalogs" prose is updated to four. — Added a "Follow-on (spec 073)" note after 046's US2 checkpoint cross-referencing the fourth catalog; updated the stale i18n-spike.md Tier B bullet (was "deferred, commented scaffolding only") to "shipped … extended to a fourth catalog", enumerating all four and pointing at spec 073.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002)** → user stories → **Polish**.
- **US1 (P1)**: T006 depends on T003 (test first); T007 depends on T006; T008 depends on T002; T009 depends on T007. T008 (engine wiring) and T006/T007 (content extraction) are largely parallel once T002 lands.
- **US2 (P2)**: T011 depends on T006; T012 depends on T007+T009. US2 is a generalization + completion of US1's mechanism — it does not block US1's independent test.
- **US3 (P3)**: T014/T015 depend on T007 (a real `flowQuestions.json` must exist to gate); T016 is verify-only.

### Within US1

- Tests T003/T004/T005 are `[P]` (three different test files). Implementation T006→T007→T009 is a content-side chain; T008 is the independent engine-side edit.

### Parallel opportunities

- T003, T004, T005 (three test files) in parallel.
- T008 (engine, `QuestionField.tsx`) runs in parallel with T006/T007 (content, extractor) once T002 lands.
- T017, T018 (polish) in parallel.

---

## Implementation Strategy

### MVP (User Story 1)

T001 → T002 → US1 (T003-T009) → the three identity-lite questions translate in `fr` with English fallback and untouched answer values. **STOP and validate** against US1's independent test — this alone closes the reported gap.

### Incremental delivery

1. US1 → MVP (identity-lite questions translate).
2. US2 → generalize extraction across all live phase registries + complete the `fr` catalog.
3. US3 → wire the drift gate + confirm Crowdin coverage.

Keep `pnpm lint` green at every step (add `flowQuestions.json` to the committed catalogs and the gate in the same change that generates it).

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks.
- After generating/regenerating `content/i18n/en/flowQuestions.json`, keep both gates green: `npx tsx utilities/i18n-content-extract/cli.ts --check` (freshness) and `pnpm run content-i18n-lint` (parity).
- Do NOT extract `registry.reserve.ts` modules (dead content — research.md D2) or user-entered answer values (FR-004 — only static question copy is in scope).
- Team split (Article VI): `content/` + `utilities/*` extraction/lint = content; `packages/studio/src/survey/QuestionField.tsx` = engine seam. Same split as spec 046 T026-T031.
- Commits gated — do not commit/push without explicit authorization.
