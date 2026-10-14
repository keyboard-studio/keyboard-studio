# Spec 046 i18n localization: as built

**Status:** Retired 2026-10-14. Shipped across ~40 PRs (T001-T042; first merges 2026-07-22, last tasks closed by PRs #1668 `79270308` and #1452 `2f35a50e`). Tasks: 42/42 complete.
**Full docs:** [specs/_archive/046-i18n-localization/](../_archive/046-i18n-localization/) (spec, plan, tasks, research, data-model, quickstart). Not read by default.
**Pinned here:** [contracts/catalog-format.md](contracts/catalog-format.md) (still in force: id grammar and authoring rules, cited by CLAUDE.md and specs 055, 081); [contracts/crowdin-mapping.md](contracts/crowdin-mapping.md) (pinned with it; partly stale, see Divergences).

## What shipped
- Tier A: all studio chrome externalized via Lingui v6 with explicit ids; locales `en` + `fr`; the author can switch the whole UI.
- Tier B: content prose (patterns, adaptation questions, criteria, flow questions) extracted to sidecar catalogs and resolved at render sites with English fallback.
- Crowdin round-trip: upload on merge to main, scheduled download opens a translations PR.
- Drift gates in `pnpm lint`: English drift, key-set parity, id sort order, Tier B freshness, collapse guard.
- Region resolution (`pt-BR` -> `pt` -> `en`), ICU plurals, no first-paint English flash.

## Public contracts
- Catalog: flat minimal JSON `{id: text}`, ids sorted (`orderBy: "messageId"`), `packages/studio/lingui.config.ts`; locales at `packages/studio/src/locales/<lang>/messages.json`. Rules: [contracts/catalog-format.md](contracts/catalog-format.md).
- Locale API: `packages/studio/src/lib/i18n.ts` exports `SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE`, `loadSavedLocale`, `saveLocale`, `resolveInitialLocale` (saved, else browser, else `en`), `activateLocale`, `localeReady`.
- Tier A resolve: `resolveMessage(i18n, descriptor)` in `lib/i18nResolve.ts`.
- Tier B: `resolveContentString(type, id, field, englishValue, i18n?)` in `lib/contentI18n.ts`; `ContentCatalogType = patterns | adaptationQuestions | criteria | flowQuestions`; `slugifyIdSegment` (dots in record ids become `_`). Sidecars at `content/i18n/<lang>/<type>.json`.
- Provider: one `<I18nProvider>` in `packages/studio/src/AppRoot.tsx`.
- Tooling (`utilities/`): `i18n-content-extract`, `i18n-catalog-lint`, `i18n-catalog-sort`, `content-i18n-lint`, `content-i18n-normalize`, `i18n-collapse-guard`, `i18n-prune-unconfigured-locales`. Root scripts `i18n-catalog-lint`, `content-i18n-lint`, `content-i18n-freshness`.
- `crowdin.yml` (repo root); workflows `.github/workflows/crowdin-upload-sources.yml`, `crowdin-download-translations.yml`.

## Key decisions
- Lingui with explicit ids; English is the catalog value so edits to English under a stable id reset Crowdin approvals (D1-D3).
- Tier B by sidecar extraction, not raw-record mapping: raw records mix prose with control fields that must not reach translators (D4, D8).
- Loaders and `Pattern`/`Criterion` objects stay English-only; resolution happens at the render site (D8).
- Build-time only; no runtime Crowdin client (D5).
- `content-i18n-lint` is a hand-kept plain-JS mirror of the extractor walk, because CI runs it without tsx or built contracts; keep both in sync by hand (D10).
- Extraction allowlist is render-verified fields only; re-add a field when a render site lands (D8).

## Gotchas and limits
- `skip_untranslated_strings` must stay `false` in `crowdin.yml`: `true` deleted keys (measured). Cost: untranslated strings download as English; the collapse guard catches an all-English catalog.
- A new language-only locale needs, in one commit: `lingui.config.ts`, `SUPPORTED_LOCALES`, both `languages_mapping` blocks, and `CONFIGURED_LOCALES` in `utilities/i18n-prune-unconfigured-locales`. Region-qualified locales need no mapping entry.
- Never hand-sort catalogs: use `pnpm run i18n-catalog-sort`. Do not wrap code ids, test ids, language autonyms.
- `survey/questions/b/*.ts` is Tier A, not Tier B (D8).

## Divergences from the spec
- D6 says `StudioShell` owns the provider; code puts it in `AppRoot.tsx` (StudioShell.tsx notes it lives above).
- `contracts/crowdin-mapping.md` is stale: it calls Tier B deferred/commented and uses `%two_letters_code%`; `crowdin.yml` has Tier B active (T030), `%locale%` plus `languages_mapping` for en/fr, and a fourth catalog `flowQuestions` (spec 073).
- Original T029 (render sites for criteria) closed 2026-10-14 via `CriteriaPage.tsx` / `CriterionRow.tsx` calling `resolveContentString("criteria", ...)`; the `fr` criteria sidecar was 159 keys at close.
- The extractor reads the live phase registries for flow questions (spec 073), beyond the original three types.

## Follow-ups and open issues
- Stale links to archived files (see retire report): `docs/i18n-spike.md` (tasks, quickstart, research), comments in `packages/studio/src/lib/contentI18n.ts` and `utilities/i18n-content-extract/extract.ts` (research.md).
- `Pattern.description`, `Criterion.section` have no confirmed render site; not extracted.
- New locales beyond `fr` not started.
