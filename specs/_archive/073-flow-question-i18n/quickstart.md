# Quickstart: Flow-Question Content i18n

Validates that the identity-lite language-identification questions (and, more generally, any modular flow-engine question) render translated text under a non-English locale, with English fallback where no translation exists yet.

## Prerequisites

- `pnpm install` at the repo root.
- Engine + contracts + keyboard-lint built (studio typechecks against their `dist`): `pnpm --filter @keyboard-studio/contracts --filter @keyboard-studio/engine --filter @keymanapp/keyboard-lint run build`.
- The implementation tasks for this spec landed (extractor extension, `contentI18n.ts` fourth catalog type, `QuestionField.tsx` wiring, `content/i18n/fr/flowQuestions.json` authored).

## 1. Regenerate the English source catalog

```bash
npx tsx utilities/i18n-content-extract/extract.ts   # or whatever the wired CLI entry point is (see tasks.md)
```

**Expected**: `content/i18n/en/flowQuestions.json` is written (or confirmed unchanged) with keys for every live-registry question — e.g. `content.flowQuestion.il_language_english.prompt`, `content.flowQuestion.il_language_english.help_text`. No keys for anything under `packages/studio/src/survey/questions/reserve/`.

## 2. Confirm the drift gate passes

```bash
pnpm run content-i18n-lint
```

**Expected**: exits 0 — the committed `content/i18n/en/flowQuestions.json` matches a fresh extraction, and `content/i18n/fr/flowQuestions.json` has full key parity against it.

## 3. Unit-test the resolution path

```bash
pnpm --filter @keyboard-studio/studio test src/lib/contentI18n.test.ts
pnpm --filter @keyboard-studio/studio test src/survey/QuestionField.test.tsx
```

**Expected**: `resolveContentString("flowQuestions", "il_language_english", "prompt", …)` returns the French value when a seeded `fr` catalog contains it, and the English value when it doesn't (fallback contract). `QuestionField` renders the resolved text for `prompt`/`label`/`body`/`help_text` and each `options[].label`.

## 4. Manual walk in the running Studio

```bash
pnpm dev
```

1. Open the Studio, switch the locale to `fr` via the NavBar `LocaleSwitcher`.
2. Start a new keyboard through the identity-lite flow.
3. **Expected**: the `il_language_english`/`il_language_autonym`/`il_language_code` question prompts and help text render in French.
4. Type an answer (e.g. type a language's English name into the autocomplete).
5. **Expected**: the typed value itself is displayed exactly as entered — never translated or altered — per FR-004/SC-004.
6. Navigate to a later-phase question that has no `fr` translation entry yet (if any remain).
7. **Expected**: it falls back to English — never blank, never a raw catalog key.

## 5. Independent test acceptance (per spec.md)

- **US1**: Steps 4.1-4.5 above satisfy US1's independent test directly.
- **US2**: Add a throwaway `fr` entry for a non-identity-lite question (e.g. a Phase B or Phase G question), rerun step 4, and confirm it also resolves — proving the fix is general, not special-cased to the three identity-lite ids.
- **US3**: Confirm `crowdin.yml`'s Tier B block lists `flowQuestions.json` alongside the other three catalogs, and that `content-i18n-lint` (step 2) covers it in its freshness/parity report.
