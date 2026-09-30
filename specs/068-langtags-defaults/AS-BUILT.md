# Spec 068 SIL langtags defaults at the front of the survey: as built

**Status:** Retired 2026-09-29. Shipped in PR #913 (squash `e05619f0`, "SIL langtags defaults at the front of the survey"), extended by spec 030 (PR #1044); folder renumbered in #1644 and tasks closed out in #1652 (`75349837`, 2026-08-18). Tasks: 29/29 complete.
**Full docs:** [specs/_archive/068-langtags-defaults/](../_archive/068-langtags-defaults/) (spec, plan, tasks, research D1-D7, data-model, contracts/engine-langtags-api.md, quickstart, checklists). Not read by default.
**Pinned here:** none

## What shipped
- A vendored, commit-pinned, SHA-256-verified copy of SIL `langtags.json` (MIT notice retained), reduced at build time to a slim generated index.
- Engine lookup API: default script/region/autonym/English name per language subtag, a language list, and name/code/autonym search.
- The survey's identity step lets an author search for a language; script, region, autonym and English name are proposed as editable, "langtags"-labelled confirmations with a provenance caption.
- Free-text "not in list" path retained; an unknown code yields no proposal.

## Public contracts (as the code has them)
- `@keyboard-studio/engine/langtags` (`packages/engine/package.json` subpath `./langtags`; `packages/engine/src/langtags/index.ts`): `getLanguageDefaults(subtag): LanguageDefaults | null` (2- or 3-letter, case-insensitive, never throws), `listLanguages(): readonly LanguageSummary[]`, `lookupByName(query): readonly LanguageSummary[]` (exact-code, englishName-prefix, autonym-prefix, substring; empty query gives `[]`).
- Types in `packages/contracts/src/langtags.ts`: `LanguageDefaults`, `RegionVariant`, `LanguageSummary`, `LangtagsProvenance`.
- Generated index: `packages/engine/src/langtags/generated/index.ts` (never hand-edit).
- Build: root `pnpm run fetch-langtags` (`scripts/fetch-langtags.mjs`, pin in `scripts/langtags-version.json`: commit `99b856bb`, SHA-256 recorded) and `pnpm run codegen-langtags`; both in `prebuild`. Codegen is deterministic (`codegen-determinism.test.ts`).
- Studio: `studio/src/lib/langtagsDefaults.ts` loads the engine module through dynamic `import()` (separate chunk); seeds and provenance via `getSeedProvenance` in `studio/src/survey/IdentityLite.tsx`.

## Key decisions
- Vendor a pinned file instead of runtime fetch: deterministic, offline authoring (D1, D2).
- Never ship the raw ~5.4 MB dataset to the browser; slim index behind a dynamic import (D3, SC-005).
- Default record comes from the bare-subtag tagset's `full` tag; indexed under the 2-letter tag and `iso639_3` so both `ha` and `hau` resolve (D4).
- Provenance via a parallel seed-provenance mechanism, propose-then-confirm (D5).
- Free-text fallback for the autocomplete (D7).

## Gotchas and limits
- Upstream `tag`/`full` values are unstable across langtags versions; every derived value is an editable proposal, never a locked decision.
- Script-qualified tagsets are not indexed for defaults; they are reached through the author's explicit script choice.
- Bumping the pin means changing `scripts/langtags-version.json` and its SHA-256 together.

## Divergences from the spec
None found. The spec's `getLanguageDefaults`/`listLanguages`/`lookupByName` signatures match the code. Phase A (`PhaseA.langtags.test.ts`) and identity-lite both consume langtags seeding.

## Follow-ups and open issues
- Stale citations for km-programmer: `contracts/src/langtags.ts:22,89,120` (data-model.md), `engine/src/langtags/index.ts:8-9` and `index.test.ts:4` (data-model.md, contracts/engine-langtags-api.md) resolve into `../_archive/`.
