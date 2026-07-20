# Feature Specification: Studio UI & Content Localization (i18n)

**Feature Branch**: `045-i18n-localization`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Do project-wide localization of Keyboard Studio using TypeScript and Crowdin — efficiently, with stable translation keys that survive slight English drift while still surfacing when the English has changed."

**Governing sections**: [spec.md §12](../../spec.md) (two-team split — engine owns the SPA; content owns survey text, gallery ordering, LLM prompts, criteria triage) is the binding constraint on *where* strings live and *who* owns them. [spec.md §16](../../spec.md) out-of-scope (multi-language `welcome.htm` variants) bounds what localization does **not** cover. Contract touchpoints: the `Criterion` type + `CriterionSchema` and the 148-row count test ([packages/contracts/src/criteria.ts](../../packages/contracts/src/criteria.ts), [schemas.ts](../../packages/contracts/src/schemas.ts)), the `RawPatternSchema` pattern loader boundary, and the working-copy/VirtualFS spine ([docs/architecture.md](../../docs/architecture.md)). Prior art / prototype: [docs/i18n-spike.md](../../docs/i18n-spike.md) and the working spike on branch `km/i18n-lingui-spike` (Lingui v6 wired into the studio; `WelcomeScreen` converted; `crowdin.yml` Tier A drafted).

## Overview

Keyboard Studio's user-facing text is currently hardcoded English in two very
different places: **UI chrome** (literals in the studio's `.tsx`) and
**data-driven content** (survey/adaptation-question prose, pattern
`title`/`description`/`prompt`, and `criteria.json` descriptions — all
content-team-owned per §12). There is no i18n framework today.

This feature externalizes that text into translation catalogs, connects it to a
**Crowdin** translation-management round-trip, and lets a keyboard author use the
Studio in their own language. The chosen design uses **Lingui with explicit,
stable message IDs**: the id is durable identity (translations stay bound to the
same logical string even when the English is tweaked), while the English text is
stored as the catalog **value** so that English drift is still detectable — the
exact trade-off raised in design review.

It is deliberately split into three independently shippable slices: the Studio UI
(P1, the MVP — proven by the spike), the content strings (P2, which crosses the
§12 team boundary and needs an extraction step), and translator-experience /
operational hardening (P3).

This feature is **string localization only**. It does not mirror layout for RTL
scripts, does not localize the emitted keyboard's `welcome.htm` (spec §16
out-of-scope), and does not translate LLM prompts (not user-facing).

## Clarifications

### Session 2026-07-20

- Q: Framework — key-based (i18next) or source-as-key (Lingui default)? → A: **Lingui v6 with explicit IDs**. Explicit ids give the stable-key property the author wants; the Lingui macro *extracts the message from source*, so the English catalog cannot silently fall out of sync with the code (the failure mode that would blind drift detection). Plain i18next hand-maintains the English values; Lingui's default generated ids would break stable keys on every English tweak.
- Q: How is English drift detected when a stable id decouples the key from the source text? → A: **On the catalog value, not the key.** The English is stored as the value under the stable id; Crowdin fingerprints that value and, on a source-text change, **keeps the existing translation but resets its approval to "needs review"** (the translation stays linked; the review signal fires). `git diff` on the English catalog is the repo-local second detector, enforced by a CI gate.
- Q: Catalog format? → A: **Flat minimal JSON** (`{ "<id>": "<text>" }`) via `@lingui/format-json` `style: "minimal"`. It is the one format where id → Crowdin string key and English → fingerprinted value line up with Crowdin's native key-value JSON handling. PO (`msgid` = source) and `style: "lingui"` (nested source) both muddy value-fingerprinting under explicit ids.
- Q: How are content-team strings (Tier B) wired to Crowdin? → A: **Via a build-time extraction step into flat sidecar catalogs**, NOT by pointing Crowdin at the raw content records. Crowdin's generic JSON/YAML parser translates every string value; the content records interleave translatable prose with control fields (`id`, `answerType`, `default`, `firingCondition`, BCP47 tags, `lintRuleId`) at several nesting levels, so raw mapping would send control fields to translators. Extraction keeps the content team's records as source-of-truth and emits translator-safe catalogs.
- Q: How does localization respect the §12 team split? → A: UI catalogs live under `packages/studio` (**engine team**); content sidecar catalogs live under `content/` + `packages/contracts` (**content team**). They are **separate Crowdin file mappings**, never merged into one catalog — merging would pull content-owned text into an engine-owned package and blur the boundary `depcruise` enforces.
- Q: `criteria.json` is zod- and count-test-gated — how is it localized? → A: A localized copy MUST satisfy `CriterionSchema`, and the **148-row count test MUST keep reading the canonical English file**; localized copies are never swept into the count. Localization adds translated `description` values only; ids/bands/lintRuleIds are control fields and stay English.
- Q: Runtime or build-time Crowdin? → A: **Build-time.** Translations are plain committed JSON bundled by Vite; no runtime Crowdin API client (the Studio ships as a static bundle and authors in an in-memory VirtualFS — a runtime client would need a browser token and network on load). The JS API client is reserved for a possible future in-app "suggest a translation" feature only.
- Q: Where does the `I18nProvider` live? → A: **`StudioShell` owns it** (the app-shell boundary), so the provider covers both the running app and the ~40 direct-render component tests without wrapping each call site.
- Q: Out of scope? → A: Emitted keyboard `welcome.htm` localization (spec §16); LLM prompts (not user-facing); RTL layout mirroring (a separate, larger effort — string translation only here).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Studio UI is fully localizable and renders a target locale (Priority: P1)

A keyboard author whose working language is not English opens Keyboard Studio,
switches the interface to their language, and sees the entire UI chrome —
welcome screen, navigation, survey prompts' surrounding UI, editor labels,
buttons, error and status text — in that language, falling back to English only
where a translation is genuinely missing. A maintainer edits an English string;
CI blocks the change until the catalog is re-extracted, so translations can never
silently go stale.

**Why this priority**: This is the MVP and the slice the spike already proves
feasible. It delivers standalone value (a usable non-English Studio) without
touching the content-team boundary, and it establishes every reusable
mechanism — the catalog format, the explicit-id convention, the drift gate, the
Crowdin round-trip — that P2 then reuses.

**Independent Test**: Extract the UI catalog, provide a complete translation for
one target locale (e.g. `fr`), switch to it via the locale selector, and confirm
no English chrome remains; then edit one English source string without
re-extracting and confirm CI fails the drift check. Verifiable without any
content-tier work.

**Acceptance Scenarios**:

1. **Given** a UI string authored as `<Trans id="welcome.title">Welcome to Keyboard Studio</Trans>`, **When** the catalog is extracted, **Then** `en/messages.json` records `"welcome.title": "Welcome to Keyboard Studio"` (English as the value under a stable id) and each target locale gets the same key with an empty value.
2. **Given** a complete `fr` translation, **When** the author selects French, **Then** all UI chrome renders in French and the choice persists across a reload.
3. **Given** a target locale missing one key, **When** that view renders, **Then** the English source is shown as fallback (never the raw id, never a blank).
4. **Given** an author edits an English source string but does not re-run extraction, **When** CI runs, **Then** the drift gate fails with a message identifying the out-of-sync catalog.
5. **Given** an English source value changes under an unchanged id and is re-synced to Crowdin, **When** a translator opens the project, **Then** the prior translation is retained but flagged "needs review" (not discarded, not silently kept as approved).
6. **Given** the studio test suite, **When** it runs, **Then** the `<Trans>` macro is transformed and the `I18nProvider` is present, so localized components render under vitest without per-test wrapping.

---

### User Story 2 - Content-owned strings are localizable (Priority: P2)

The survey questions, adaptation-question prose, pattern `title`/`description`/
`prompt`, and criteria `description`s — all content-team-owned — are translatable,
so an author sees not just the UI chrome but the actual survey and guidance text
in their language. The content team keeps editing their YAML/JSON records exactly
as today; a build step derives translator-safe catalogs from them.

**Why this priority**: High value (this is the bulk of the words an author reads)
but materially harder and boundary-crossing: it needs an extraction step, it must
not expose control fields to translators, and `criteria.json` is zod- and
count-test-gated. P1 stands alone without it, so it is a separate slice.

**Independent Test**: Run the extraction step over `content/` + `criteria.json`,
confirm the emitted catalogs contain only translatable prose (no `id`,
`answerType`, `default`, `firingCondition`, BCP47 tags), translate one locale, and
confirm the survey/patterns/criteria render translated while all control-field
behavior (firing conditions, answer types, lint rule ids) is unchanged.

**Acceptance Scenarios**:

1. **Given** an adaptation-question YAML with `elicits`/`provenanceLabel` prose and control fields, **When** extraction runs, **Then** the sidecar catalog contains only the prose, keyed by a stable id derived from the record, and no control field appears.
2. **Given** a pattern YAML with `title`, `description`, and nested `questions[].prompt`, **When** extraction runs, **Then** all three prose fields are extracted and `default`/`answerType`/`id` are not.
3. **Given** a localized `criteria.<lang>.json`, **When** it is loaded, **Then** it satisfies `CriterionSchema`, its translated `description`s render, and the 148-row count test still reads and counts the canonical English file only.
4. **Given** the extracted content catalogs, **When** `crowdin.yml` is inspected, **Then** the content mapping is a separate file group under `content/`/`packages/contracts` (content team), distinct from the `packages/studio` UI mapping (engine team).
5. **Given** a content record whose prose changes, **When** extraction re-runs, **Then** the drift gate treats it exactly as P1 treats UI strings (stale-translation review signal fires).

---

### User Story 3 - Translator experience & operational hardening (Priority: P3)

Translators get the context they need to translate accurately (per-string
comments, screenshots/labels), region-specific locales are supported where
needed (e.g. `pt-BR` vs `pt`), pluralization/ICU forms are handled correctly, and
the extract → sync → download → PR loop is wired into the build and CI so
translation stays current with low manual effort.

**Why this priority**: Quality and sustainability, not core capability — the
product is usable and correct after P1/P2. These refinements raise translation
quality and reduce operational toil but are not prerequisites for shipping a
localized Studio.

**Independent Test**: Add a region-specific locale with no code change (catalog
files only) and confirm it resolves; author a pluralized string and confirm the
correct plural form renders per locale; run the CI download job and confirm it
opens a translations PR through the existing merge gate.

**Acceptance Scenarios**:

1. **Given** a new locale `pt-BR`, **When** only its catalog files are added, **Then** it resolves and renders with no code change.
2. **Given** a count-dependent string using ICU plurals, **When** rendered in a locale with different plural rules, **Then** the correct plural form is chosen.
3. **Given** a translatable string with a translator comment/context, **When** viewed in Crowdin, **Then** the context is present.
4. **Given** new translations approved in Crowdin, **When** the scheduled CI download runs, **Then** it opens a PR with the updated catalog files that goes through the km-triage merge gate.

---

### Edge Cases

- **Missing translation** → English source fallback via the explicit id; never the raw id or a blank.
- **Missing whole locale catalog** → fall back to the default (English) locale without a hard error.
- **Duplicate/renamed id** → a renamed id orphans its translations (the thing stable ids exist to prevent); the id-namespace convention + review must catch renames deliberately.
- **Region tag with no specific catalog** (`pt-BR` requested, only `pt` present) → resolve to the base language, then English.
- **Localized `criteria.json` drifts from the canonical row set** (extra/missing id) → must fail loudly (schema + a count/parity check), never silently miscount.
- **Untranslatable interpolation** (proper nouns, `.kmn` tokens like `[NCAPS K_C]`) → must not be extracted as translatable prose.
- **Node ≥22 local test runs** → `localStorage` shadow requires the `--localstorage-file` flag locally; CI on Node 22 is unaffected (documented, not a code bug).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All user-facing UI chrome strings MUST be externalized into message catalogs keyed by **stable, explicit ids** following an agreed `area.component.thing` namespace convention.
- **FR-002**: The English source text MUST be stored as the catalog **value** under its id, so English drift is detectable by value comparison.
- **FR-003**: The system MUST render the active locale and MUST fall back to the English source (never the raw id, never blank) when a translation is missing.
- **FR-004**: Users MUST be able to select the UI locale, and the choice MUST persist across reloads (via the studio's existing storage discipline, not ad-hoc `localStorage`).
- **FR-005**: On first load with no saved choice, the system SHOULD detect the locale from the browser language, defaulting to English.
- **FR-006**: A CI gate MUST fail when English source strings change without the catalog being re-extracted (extract → `git diff` must be clean), and MUST integrate with the existing merge gate rather than duplicate it.
- **FR-007**: Adding a new locale MUST require catalog files only — **no code change**.
- **FR-008**: UI catalogs MUST live under `packages/studio` (engine team) and content catalogs under `content/` + `packages/contracts` (content team); the two MUST be separate Crowdin file mappings (§12).
- **FR-009**: Content-string localization MUST extract translatable prose into flat catalogs; control fields (`id`, `answerType`, `default`, `firingCondition`, BCP47 tags, `lintRuleId`, category/priority/etc.) MUST NOT be exposed to translators.
- **FR-010**: Localized `criteria.<lang>.json` copies MUST satisfy `CriterionSchema`; the 148-row count test MUST continue to read and count only the canonical English file.
- **FR-011**: Crowdin sync MUST be driven by `crowdin.yml` with credentials sourced from environment variables only (never committed).
- **FR-012**: Downloaded translations MUST land as committed catalog files reviewed through the existing merge gate (build-time, not runtime).
- **FR-013**: LLM prompts MUST NOT be localized (not user-facing); the emitted keyboard `welcome.htm` MUST NOT be localized (spec §16 out-of-scope).
- **FR-014**: The macro transform and `I18nProvider` MUST be present under the test runner so localized components render in vitest without per-call-site wrapping.
- **FR-015**: Compiled catalogs MUST be build artifacts (gitignored); only the source catalogs are committed.

### Key Entities

- **Message catalog**: a per-locale flat `{ id: text }` file. The `en` catalog is the source (English as value); target catalogs carry translations under the same ids.
- **Message id**: a stable, explicit, namespaced identifier (`welcome.title`) — the durable identity that binds a translation across English edits.
- **Locale**: a BCP47-ish selector (language, optionally region) with a resolution order: exact → base language → English.
- **Sidecar content catalog (Tier B)**: a generated flat catalog derived from content-team records, carrying only translatable prose and a stable per-string id traceable back to its source record.
- **Drift signal**: a source-value change under an unchanged id — surfaced by the CI gate (repo-side) and Crowdin approval-reset (TMS-side).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of user-facing UI chrome strings are externalized (a lint scan finds zero hardcoded user-facing literals in studio views).
- **SC-002**: A keyboard author can switch the Studio to a fully-translated locale and encounter zero English chrome in P1 scope.
- **SC-003**: An English source edit without re-extraction is blocked by CI 100% of the time.
- **SC-004**: Adding a new fully-translated locale requires zero code changes (catalog files only).
- **SC-005**: Translators are exposed to zero control-field values (no `id`/`answerType`/`default`/`.kmn`-token strings appear as translatable in Crowdin).
- **SC-006**: The 148-row criteria count test and all `CriterionSchema`/`RawPatternSchema` boundaries stay green with localized copies present.

## Assumptions

- Localization is **build-time**: catalogs are committed JSON bundled by Vite; no runtime Crowdin API client in the shipped SPA.
- A Crowdin project and credentials (`CROWDIN_PROJECT_ID`, `CROWDIN_PERSONAL_TOKEN`) will be provisioned and stored as CI secrets.
- The framework is Lingui v6 with explicit ids and the minimal-JSON formatter (settled in the spike; see [docs/i18n-spike.md](../../docs/i18n-spike.md)).
- The §12 two-team split is authoritative for string ownership and package placement; `depcruise` boundaries must stay green.
- Node ≥20 (repo baseline), CI on Node 22; local Node ≥22 needs the `--localstorage-file` flag for storage tests (environmental).
- RTL layout mirroring, `welcome.htm` localization, and LLM-prompt localization are explicitly out of scope for this feature.
- The working-copy/VirtualFS spine and the locked Pattern/Criterion contracts are unchanged — localization adds translated values, it does not alter schemas.
