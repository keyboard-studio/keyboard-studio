# Feature Specification: Flow-Question Content i18n (Tier B coverage for the modular flow engine)

**Feature Branch**: `073-flow-question-i18n`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Extend Tier B content-i18n coverage (spec 046) to the modular flow-engine's question prompt/help_text — starting with the identity-lite language-identification questions. The initial survey questions that ask for a language's English name, autonym, and BCP47 code are defined as TS modules under `packages/studio/src/survey/questions/a/` (`il_language_english.ts`, `il_language_autonym.ts`, `il_language_code.ts`) with `prompt`/`help_text` as hardcoded English string literals, registered via `registry.a.ts` and the `content/flows/identity_lite.modular.yaml` manifest, and rendered by the generic dispatcher `QuestionField.tsx` with zero i18n resolution — no Tier A `<Trans>`/`t` macro, no Tier B `resolveContentString()` call. This affects every modular flow-engine question's prompt/help_text uniformly, not just these three. `contentI18n.ts` currently defines only three Tier B catalog types (`patterns`, `adaptationQuestions`, `criteria`) with no type for flow/identity questions, and the extraction tool never walks the question-definition modules — so the English-source catalog has no keys for them at all. This gap exists because spec 046's own scoping decision (research.md D8) never mentions the identity-lite/modular flow engine; it was simply outside Tier B's designed scope, and T016 explicitly deferred this text to the Tier B pipeline, which never grew coverage for this question source. Cite spec 046 as governing precedent for the Tier A/B split, the `resolveContentString` loader semantics (T028), and the control-field-exclusion extraction discipline (T024/T027) — this feature extends that scope rather than re-deriving it. The answer values a user types in response to these questions (a language's autonym, English name, BCP47 code) are legitimately untranslatable data and must stay excluded from the catalog — only the question prompt/help_text copy is in scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identity-lite language questions render in the active locale (Priority: P1)

An author who has switched Studio to a translated locale (e.g. French) starts a new keyboard through the identity-lite flow. The first questions they see ask for the language's English name, its autonym, and its BCP47 code. Today those three question prompts and their help text render in English regardless of the active locale — the first thing every author sees in a translated Studio is untranslated chrome.

**Why this priority**: These are literally the first questions in the primary authoring journey (spec 036's language-identify flow). Leaving them untranslated undercuts the credibility of the entire i18n effort at the first touchpoint a translated-locale author encounters.

**Independent Test**: Switch Studio to `fr`, start a new keyboard via the identity-lite flow, and confirm the `il_language_english`, `il_language_autonym`, and `il_language_code` question prompts and help text render in French, not English.

**Acceptance Scenarios**:

1. **Given** Studio's active locale is `fr`, **When** the author reaches the identity-lite language-identification questions, **Then** the question prompt and help text render in French.
2. **Given** a locale has no translation yet for a given flow-question id/field, **When** that question renders, **Then** the English source text is shown as a fallback — never a blank or broken string.
3. **Given** the author types an answer (the language's autonym, its English name, or its BCP47 code), **When** that answer is stored or displayed elsewhere in the app, **Then** the answer value itself is left exactly as entered — it is user data, not translatable copy, and must never be altered by the localization mechanism.

---

### User Story 2 - Coverage generalizes to every modular flow-engine question (Priority: P2)

The render path and catalog wiring live in the flow engine's shared question-rendering machinery, not in code specific to the three identity-lite questions. Any other modular flow question — current or future, in any registered flow — must translate the same way, or the same gap simply reappears elsewhere the next time a new flow question is added.

**Why this priority**: A fix narrowly scoped to three hardcoded question ids would leave every other modular-flow question (present and future) permanently untranslatable, reproducing today's gap under a different name.

**Independent Test**: Add a French entry for a modular flow question outside the identity-lite flow and confirm it resolves the same way the identity-lite questions do, through the same catalog and loader.

**Acceptance Scenarios**:

1. **Given** a translator adds a French entry for any modular flow question's prompt or help text, **When** that question renders under the `fr` locale, **Then** the translated text is used.
2. **Given** a new modular flow question is added to the codebase without a corresponding translation entry, **When** the extraction/drift-check tooling runs, **Then** the gap is surfaced rather than silently shipping untranslated indefinitely.

---

### User Story 3 - Operational parity with the rest of the Tier B pipeline (Priority: P3)

The three existing Tier B catalogs (patterns, adaptation questions, criteria) already round-trip through the translator sync process and are checked for drift on every `pnpm lint` run. A fourth catalog left outside that machinery will quietly rot the moment anyone edits a flow question's English text without updating its translation.

**Why this priority**: Operational hardening, not user-facing — but skipping it reintroduces exactly the kind of silent drift spec 046 built dedicated tooling to prevent for the other three catalogs.

**Independent Test**: Confirm the new catalog type is included in the translator-sync configuration and in the content-i18n freshness/parity check, the same as the other three catalog types.

**Acceptance Scenarios**:

1. **Given** the flow-question catalog exists, **When** `pnpm lint` runs, **Then** its freshness and locale-parity are validated the same way the other three Tier B catalogs already are.
2. **Given** a translator-sync upload runs, **When** sources are pushed, **Then** the flow-question catalog's keys are included alongside the other three.

---

### Edge Cases

- What happens when a flow question is later removed or renamed? Its now-orphaned catalog entry must be caught by the same stale-key detection already proven for the other Tier B catalogs (spec 046 T031 caught exactly this case for `criteria`), not left to accumulate silently.
- What happens for a flow whose questions are registered but never reached in a given authoring path (e.g. skipped by a firing condition)? Extraction must still cover it — coverage is based on the question's registration, not on whether a given session happens to render it.
- User-entered answer values (the autonym, English name, BCP47 code themselves) are explicitly out of scope for translation — only the static prompt/help_text copy asking for those values is in scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render the prompt and help text of every modular flow-engine question through the active-locale content-translation path, not as raw hardcoded English.
- **FR-002**: The system MUST provide an English-source translation-catalog entry for every modular flow-engine question's prompt and help text, derived from its canonical definition.
- **FR-003**: The system MUST fall back to the English source string when the active locale has no translation for a given flow-question id/field — it must never render a blank or undefined string.
- **FR-004**: The system MUST NOT alter, translate, or otherwise transform user-entered answer values (e.g. a language's autonym, English name, or BCP47 code) — only the static question prompt/help text is in scope for translation.
- **FR-005**: The extraction process MUST exclude non-prose control fields (question id, answer type, default value, firing condition, and similar) from the generated catalog, matching the exclusion discipline already applied to the existing Tier B catalogs.
- **FR-006**: The system MUST ship a French translation of the new catalog with full key parity against its English source, matching the parity bar already met by the existing three Tier B catalogs.
- **FR-007**: The drift/freshness check MUST cover the new catalog type so an added, changed, or removed flow question is caught if its translation entry falls out of sync.
- **FR-008**: The translator-sync configuration MUST include the new catalog so its keys upload and download through the same round-trip as the existing three Tier B catalogs.

### Key Entities

- **Flow-question text**: the prompt and help-text copy of a single modular flow-engine question, keyed by question id and field name — has one English source value and zero or more per-locale translated values, with English used as the fallback when a locale's value is absent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author who has switched Studio to a fully-translated locale sees zero English text among the identity-lite language-identification question prompts and help text (the same zero-English-chrome bar spec 046 US1 already established, applied here to this content).
- **SC-002**: Adding a translation for a new locale to the flow-question catalog requires no code change (mirrors spec 046's SC-004 completeness bar).
- **SC-003**: An untranslated flow-question addition is caught by the lint gate before merge, rather than shipping silently with English-only text indefinitely.
- **SC-004**: A user's own entered answer (autonym, English language name, BCP47 tag) is never altered by the localization mechanism, in any supported locale.

## Assumptions

- The identity-lite flow's three language-identification questions are the immediate, motivating case, but the fix targets the shared question-rendering path so it covers every current and future modular flow question, not just those three ids.
- French (`fr`) remains the only actively-authored non-English locale, consistent with the rest of the Tier B rollout (spec 046); additional locales follow the same translator-sync round-trip already established there.
- This spec extends spec 046's Tier B scope and does not reopen any of its resolved decisions (research.md D1-D10); no `Pattern`/`Criterion` schema or contract changes are implied.
- Out of scope: building any new UI surface (e.g. a criteria-review/checklist screen — that is spec 046 T029's separately-scoped follow-up). This spec only closes the Tier B coverage gap for existing modular flow-engine question text.
