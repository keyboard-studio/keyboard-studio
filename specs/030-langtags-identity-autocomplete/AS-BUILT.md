# Spec 030 Langtags identity autocomplete: as built

**Status:** Retired 2026-09-29. Shipped in PRs #1044 (US1-US3, `5fb9eaa`, 2026-07-08) and #1050 (english-first flow, `0a65084`, 2026-07-10); gates closed in #1186 (`5e2645e`). Tasks: 32/32 checked.
**Full docs:** [specs/_archive/030-langtags-identity-autocomplete/](../_archive/030-langtags-identity-autocomplete/) (spec, plan, tasks, research, data-model, contracts, checklists). Not read by default.
**Pinned here:** none

## What shipped
- The identity flow is driven by langtags: the author types the English language name into a `@langtags_names` autocomplete and the entry resolves; own-script name, script, and code are seeded from it.
- Region disambiguation: a conditional `il_language_region` step appears only when the picked language has more than one region variant.
- Own-script name (`il_language_autonym`) is an autocomplete over the entry's `localNames`, with free text always accepted.
- The langtags contract and slim index were extended additively (all-names, local-names, region variants).
- The proposed Phase A flow (`content/flows/proposed/phase_a_identity.modular.yaml`, graph-only) mirrors the new order.

## Public contracts
- `LanguageDefaults` gained optional `englishNames[]`, `localNames[]`, `regionVariants[]`; `RegionVariant = { region, regionName, script, autonym?, localNames[] }`; `LanguageSummary.hasRegionVariants?` -- [packages/contracts/src/langtags.ts](../../packages/contracts/src/langtags.ts). Existing fields unchanged; not a `Pattern` change.
- `getLanguageDefaults(subtag)`, `listLanguages()`, `lookupByName(query)` -- [packages/engine/src/langtags/index.ts](../../packages/engine/src/langtags/index.ts), exported as `@keyboard-studio/engine/langtags`. Runtime reads only the generated slim index, never the raw langtags file.
- Codegen: [scripts/codegen-langtags.mjs](../../scripts/codegen-langtags.mjs) retains `names`, `localnames`, per-region `regionname`, and groups region-distinct tagsets into `regionVariants`. Regenerate; never hand-edit `engine/src/langtags/generated/`.
- Live identity questions live in `packages/studio/src/survey/questions/a/il_language_{english,region,autonym,code}.ts`; membership is [content/flows/identity_lite.modular.yaml](../../content/flows/identity_lite.modular.yaml).

## Key decisions
- Additive contract only, so existing consumers and snapshots stay green (research R2/R3).
- Region step is conditional and taken at runtime by `IdentityLite.getNextOverride` via `ctx.ilRegionAmbiguous`; the `next` array is declared for the flow graph.
- Code stays free-text/blank-tolerant (`required: false`) so unlisted languages are never blocked.
- Committing a name rather than a code reintroduces homonym ambiguity (e.g. "Ainu" maps to aib and ain); resolution therefore keys on the resolved entry.

## Gotchas and limits
- Roughly 60% of languages have no local name, so the autonym seed is frequently absent: free text is the normal path.
- Seeding is seed-on-first-arrival, never overwriting author edits (SurveyRunner contract).
- `proposed/phase_a_identity` has no region analogue: it is display-only, with no runtime resolver.
- `specRef` values `specs/030-langtags-identity-autocomplete` in manifest and question files are spec-trace unit ids, not file paths.

## Divergences from the spec
- The archived `contracts/identity-flow.contract.md` and the `tasks.md` header describe the US1 shape "`il_language_code` first, English/autonym as seeded confirmations". Superseded by #1050: the code is english-first: `il_language_english` (autocomplete, `@langtags_names`) -> optional `il_language_region` -> `il_language_autonym` (autocomplete) -> `il_language_code` (autocomplete `@langtags_iso639`, `next` = `il_target_script`) ([identity_lite.modular.yaml](../../content/flows/identity_lite.modular.yaml), [il_language_english.ts:38-46](../../packages/studio/src/survey/questions/a/il_language_english.ts)). The original plan R4 ("promote English to Q1") is what finally shipped.
- The dedicated post-hoc code-confirmation step (US4 as first described) was never built; the code question stays a plain trailing field. Recorded upstream as a rejected alternative.
- The `tasks.md` header claims every box is unchecked; on main all 32 are checked. Trust the checkboxes and this file.

## Follow-ups and open issues
- Citations to fix if desired: `@see specs/030-.../data-model.md` in [contracts/src/langtags.ts:68](../../packages/contracts/src/langtags.ts) now points into the archive.
- Later spec 068 (langtags defaults) builds on this data model and cites it.
