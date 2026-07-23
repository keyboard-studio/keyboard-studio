---
description: "Task list — Studio UI & Content Localization (i18n)"
---

# Tasks: Studio UI & Content Localization (i18n)

**Input**: Design documents from `/specs/046-i18n-localization/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included (lean) — the repo tests heavily and the spec carries acceptance scenarios + independent tests. Test tasks map to those scenarios; they are not full TDD.

**Organization**: Grouped by user story (P1/P2/P3). Team ownership is annotated per Article VI: **(engine)** = `packages/studio` / `utilities`; **(content)** = `content/` + `packages/contracts`.

**Status note**: The P1 foundation and first chrome areas already shipped on `km/i18n-lingui-spike` (PR #1248) — those tasks are checked `[x]` and were verified this session. Remaining work is unchecked.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish carry no story label)

---

## Phase 1: Setup (Shared Infrastructure) — (engine)

**Purpose**: Lingui toolchain + catalog plumbing.

- [x] T001 Add Lingui v6 deps to [packages/studio/package.json](../../packages/studio/package.json) (`@lingui/core`,`react`,`cli`,`vite-plugin`,`babel-plugin-lingui-macro`,`format-json`)
- [x] T002 [P] Create [packages/studio/lingui.config.ts](../../packages/studio/lingui.config.ts) — minimal-JSON formatter, locales `en`+`fr`, `LINGUI_CATALOG_CHECK_DIR` override
- [x] T003 [P] Wire the Lingui babel macro + vite plugin in [vite.config.ts](../../packages/studio/vite.config.ts) and [vitest.config.ts](../../packages/studio/vitest.config.ts)
- [x] T004 [P] Add [packages/studio/src/lingui.d.ts](../../packages/studio/src/lingui.d.ts) ambient module for `*.json?lingui`
- [x] T005 Add `messages:extract` / `messages:compile` scripts + gitignore compiled catalogs ([packages/studio/.gitignore](../../packages/studio/.gitignore))

---

## Phase 2: Foundational (Blocking Prerequisites) — (engine)

**⚠️ CRITICAL**: Establishes the format, provider, and drift gate every story depends on.

- [x] T006 i18n bootstrap in [packages/studio/src/lib/i18n.ts](../../packages/studio/src/lib/i18n.ts) (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, sync-load `en`, `activateLocale`)
- [x] T007 `I18nProvider` ownership in [StudioShell.tsx](../../packages/studio/src/StudioShell.tsx) (covers app + direct-render tests)
- [x] T008 Drift gate [utilities/i18n-catalog-lint/index.js](../../utilities/i18n-catalog-lint/index.js) + wired into `pnpm lint`
- [x] T009 Establish the `area.component.thing` id-namespace convention ([contracts/catalog-format.md](contracts/catalog-format.md))
- [x] T010 Provision the Crowdin project; set `CROWDIN_PROJECT_ID` / `CROWDIN_PERSONAL_TOKEN` as CI secrets; verify `crowdin upload sources --dryrun -b main` (ops; blocks the live round-trip, not the code work) (#1253)

**Checkpoint**: Foundation ready — user-story chrome work can proceed.

---

## Phase 3: User Story 1 — Studio UI localizable + a target locale renders (Priority: P1) 🎯 MVP — (engine)

**Goal**: All UI chrome externalized to explicit-id catalogs; an author can switch the whole Studio to a translated locale; English drift is CI-blocked.

**Independent Test**: Provide a complete `fr` translation for a converted area, switch via the NavBar picker → no English chrome; edit an English string without re-extracting → CI drift gate fails.

### Tests for User Story 1

- [x] T011 [P] [US1] LocaleSwitcher tests (render / persist / activate / `resolveInitialLocale`) — [LocaleSwitcher.test.tsx](../../packages/studio/src/components/LocaleSwitcher.test.tsx)
- [x] T012 [P] [US1] Acceptance check: a fully-translated area renders zero English chrome under `fr` (extend a converted-area test) (#1254)

### Implementation for User Story 1

- [x] T013 [US1] Convert WelcomeScreen chrome to `<Trans>` (`welcome.*`) — [WelcomeScreen.tsx](../../packages/studio/src/components/WelcomeScreen.tsx)
- [x] T014 [US1] LocaleSwitcher in NavBar + persistence (`ks.locale`) + browser-language detection — [LocaleSwitcher.tsx](../../packages/studio/src/components/LocaleSwitcher.tsx)
- [x] T015 [US1] Convert Output delivery area chrome (`output.*`) — [OutputScreen.tsx](../../packages/studio/src/components/OutputScreen.tsx), [ManagedPRSubmitPanel.tsx](../../packages/studio/src/components/ManagedPRSubmitPanel.tsx), [SignUpPanel.tsx](../../packages/studio/src/components/SignUpPanel.tsx)
- [x] T016 [US1] Convert survey chrome (`survey.*`) — `packages/studio/src/survey/*.tsx`. **Only hardcoded chrome** — do NOT touch Tier B text sourced from `content/` YAML records. (#1255)
- [x] T017 [P] [US1] Convert editors chrome (`editor.*`) — `packages/studio/src/editors/*.tsx` (#1256)
- [x] T018 [P] [US1] Convert dashboard chrome (`dashboard.*`) — `packages/studio/src/dashboard/*.tsx` (#1257)
- [x] T019 [P] [US1] Localize `ui/` primitive user-facing strings + aria (`ui.*`) — `packages/studio/src/ui/*.tsx` (#1258)
- [x] T020 [P] [US1] Convert remaining `components/` chrome (`preview.*`/`profile.*`/`account.*`) — PreviewScreen, ProfileScreen, AccountControl, OAuthCallbackScreen, etc. (#1259)
- [x] T021 [US1] Convert [lib/publishManagedPRErrorMessage.ts](../../packages/studio/src/lib/publishManagedPRErrorMessage.ts) error-copy (global `t` macro pattern) + fix its unit test (deferred from the Output area) (#1260)
- [x] T022 [US1] After each area: re-extract catalogs, keep the drift gate green, add illustrative `fr` for the demo — `pnpm --filter @keyboard-studio/studio messages:extract` (#1261)
- [x] T023 [US1] Crowdin Tier A first live `upload sources` (after T010) (#1262)

**Checkpoint**: Studio UI fully localizable; MVP demonstrable in `fr`.

---

## Phase 4: User Story 2 — Content-owned strings localizable (Priority: P2) — (content, + engine seam)

**Goal**: Survey/adaptation prose, pattern `title`/`description`/`prompt`, and criteria `description`s are translatable via sidecar extraction, with control fields never exposed to translators.

**Independent Test**: Run extraction over `content/` + `criteria.json`; confirm catalogs hold only prose (no `id`/`answerType`/`default`/`firingCondition`/BCP47); translate one locale; survey/patterns/criteria render translated with control-field behavior unchanged.

### Tests for User Story 2

- [ ] T024 [P] [US2] Extractor test: control fields excluded, prose extracted, from a sample pattern + adaptation-question YAML (#1263)
- [ ] T025 [P] [US2] `criteria.<lang>.json` satisfies `CriterionSchema`; the 148-row count test still reads only the canonical English `criteria.json` (#1264)

### Implementation for User Story 2

- [x] T026 [US2] **Joint engine+content session** (Article VI seam): agree per-string id derivation from a record, extractor location, and loader fallback semantics; record the decision in [research.md](research.md) (#1265)
- [ ] T027 [US2] Build extraction utility `utilities/i18n-content-extract` → flat `content/i18n/en/*.json` from content records (#1266)
- [ ] T028 [US2] Content i18n loader with English fallback (studio/engine resolves localized prose by active locale) (#1267)
- [ ] T029 [US2] Localize criteria descriptions → `packages/contracts/data/criteria.<lang>.json`; loader + schema conformance (respects T025) (#1268)
- [ ] T030 [US2] Activate the Tier B mapping in [crowdin.yml](../../crowdin.yml) (`content/i18n/**`) (#1269)
- [ ] T031 [US2] Extend the drift gate (or add a content-catalog checker) to cover Tier B extraction freshness; wire into `pnpm lint` (#1270)

**Checkpoint**: Author sees survey + guidance text translated, not just chrome.

---

## Phase 5: User Story 3 — Translator experience & operational hardening (Priority: P3) — (engine)

**Goal**: Region locales, correct ICU plurals, translator context, and a low-toil extract→sync→download→PR loop.

**Independent Test**: Add a region locale with catalog files only (resolves); a pluralized string renders the correct form per locale; the CI download job opens a translations PR through the merge gate.

### Tests for User Story 3

- [x] T032 [P] [US3] Region-resolution test (`pt-BR` → `pt` → `en`) for `lib/i18n.ts` (#1271)
- [x] T033 [P] [US3] Playwright E2E locale-switch walk in `packages/studio/e2e` (#1272)

### Implementation for User Story 3

- [x] T034 [P] [US3] Region-specific locale resolution (`pt-BR` → `pt` → `en`) in [lib/i18n.ts](../../packages/studio/src/lib/i18n.ts) + switch to `%locale%` token in [crowdin.yml](../../crowdin.yml) (#1273)
- [x] T035 [P] [US3] ICU plural audit; convert count-dependent strings to the `plural` macro (#1274)
- [x] T036 [P] [US3] Add translator context (message comments / screenshots) for ambiguous ids (#1275)
- [x] T037 [US3] CI: `upload sources` on merge to `main` (`.github/workflows`) (#1276)
- [x] T038 [US3] CI: scheduled/webhook `download` → open a translations PR through the km-triage gate (#1277)
- [x] T039 [P] [US3] Remove the first-paint English flash: pre-resolve persisted/detected locale before initial render (#1278)

**Checkpoint**: All stories independently functional; translation stays current with low toil.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T040 [P] Docs: keep [docs/i18n-spike.md](../../docs/i18n-spike.md) + this spec in sync; add the id-namespace convention to [CLAUDE.md](../../CLAUDE.md) Conventions (#1279)
- [x] T041 Run [quickstart.md](quickstart.md) validation end-to-end (#1280)
- [x] T042 [P] Completeness check (SC-004): adding a fully-translated locale requires zero code change (#1281)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → **Foundational (P2)** → user stories. Setup + Foundational are DONE except **T010** (Crowdin provisioning), which blocks only the *live* round-trip (T023, T030, T037–T038), not chrome conversion.
- **US1 (P1)**: chrome conversion (T016–T022) can start now — foundation is in place.
- **US2 (P2)**: gated on **T026** (the joint seam session) before T027+.
- **US3 (P3)**: after US1; T037–T038 also need T010.

### Within US1

- The remaining area conversions (T016–T020) are mutually independent — parallelizable across files. T022 (re-extract + drift-green) runs after each area. T023 needs T010.

### Parallel opportunities

- T016–T020 are `[P]` across distinct directories (survey / editors / dashboard / ui / components) — different files, no shared edits (each converts its own area; only the shared catalog is re-extracted by T022, so serialize T022).
- US2 tests (T024, T025) parallel; US3 (T032–T036, T039) largely parallel.

---

## Parallel Example: User Story 1 remaining sweep

```bash
# After the foundation (done), fan out the area conversions (different dirs):
Task: "T017 Convert editors chrome (editor.*) in packages/studio/src/editors/*.tsx"
Task: "T018 Convert dashboard chrome (dashboard.*) in packages/studio/src/dashboard/*.tsx"
Task: "T019 Localize ui/ primitive strings + aria (ui.*) in packages/studio/src/ui/*.tsx"
Task: "T020 Convert remaining components/ chrome (preview.*/profile.*/account.*)"
# Then serialize: T022 re-extract catalogs + confirm the drift gate is green.
```

---

## Implementation Strategy

### MVP (User Story 1)

Foundation is done. Finish the chrome sweep (T016–T022), provision Crowdin (T010), first upload (T023) → the Studio is fully localizable and demonstrable in `fr`. **STOP and validate** against the US1 independent test.

### Incremental delivery

1. US1 chrome sweep → the current PR (#1248) grows or a follow-up PR per area → MVP.
2. US2 (content) — after the joint seam session → separate PR (content team).
3. US3 (ops/UX) — after US1 → separate PR.

Each story ships independently; keep the drift gate green at every step.

---

## Notes

- `[P]` = different files, no dependency on incomplete tasks.
- After ANY chrome conversion, re-extract (T022 pattern) or the drift gate fails CI.
- Tier A stays under `packages/studio` (engine); Tier B under `content/` + `packages/contracts` (content) — never merge the catalogs (Article VI).
- Do NOT localize: the emitted keyboard's `welcome.htm` (spec §16), LLM prompts, or RTL layout (spec out-of-scope).
- Local Node ≥22: studio storage tests need `NODE_OPTIONS="--localstorage-file=…"` (environmental; CI Node 22 unaffected).
- Commits gated — do not commit/push without explicit authorization.
