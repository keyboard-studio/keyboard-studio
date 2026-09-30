# Spec 036 Glottolog catalog: as built

**Status:** Retired 2026-09-29. Shipped in PR #1100 (P1+P2+US1, `91653a1`, 2026-07-13) plus the follow-on bridge/codegen phases in the package; tasks verified and closed in #1659 (`9b22a33`, 2026-08-24). Tasks: 29/29 complete.
**Full docs:** [specs/_archive/036-glottolog-catalog/](../_archive/036-glottolog-catalog/) (spec, plan, tasks, quickstart, checklists, bridge contract). Not read by default.
**Pinned here:** [research.md](research.md), [data-model.md](data-model.md), [contracts/glottolog-catalog-api.md](contracts/glottolog-catalog-api.md). Cited by `scripts/glottolog-version.json` (`research.md D1/D2`) and `scripts/codegen-glottolog.mjs` (`research.md D2/D4/D11, data-model.md, contracts/glottolog-catalog-api.md`).

## What shipped
- New package `@keyboard-studio/glottolog` ([packages/glottolog](../../packages/glottolog/)): a pinned, offline Glottolog catalog, with genealogical relatedness between languages.
- A keyboard-base bridge that turns relatedness into ranked base-keyboard suggestions (same script only), wired into studio base resolution.
- Reproducible acquisition: `scripts/fetch-glottolog.mjs` downloads pinned glottolog-cldf files and SHA-256-verifies them; `scripts/codegen-glottolog.mjs` emits a deterministic slim index into `packages/glottolog/src/generated/`. Never hand-edit.

## Public contracts
- Package root ([src/index.ts](../../packages/glottolog/src/index.ts)): `getLanguoid(glottocode) | null`, `byIso639p3(iso): Languoid[]` (permissive, deduped, ordered by glottocode), `ancestors(glottocode): Languoid[]` (root-first, excluding self), `relatedLanguages(glottocode, opts?)`, `relatedIsoCodes(iso, opts?)`. All synchronous, pure, total (unknown input returns `null`/`[]`, never throws). No network, filesystem, `Date.now` or `Math.random` at runtime.
- `RelatednessOptions = { maxResults?, minSharedDepth?, levels? }`. Ordering: `sharedSubgroupDepth` desc, `pathLength` asc, glottocode asc; no default cap; pseudo-family members and cross-family languoids excluded.
- Bridge ([src/bridge.ts:101](../../packages/glottolog/src/bridge.ts)): `findKeyboardBaseCandidates(target: {bcp47}, deps: BridgeDeps, opts?)` returns `KeyboardBaseCandidate[]` with `tier: "direct" | "genealogical" | "script-fallback"`, `script`, `closestRelative`, `alsoSupports`, `base?`. `BridgeDeps` injects `resolveLanguage`, `languagesById`, optional `scriptFallback`, optional `getBase`, so the package never imports engine.
- Studio consumers: [genealogyTier.ts](../../packages/studio/src/lib/genealogyTier.ts) and [BaseResolution.tsx](../../packages/studio/src/editors/panels/BaseResolution.tsx).
- Pinned source: [scripts/glottolog-version.json](../../scripts/glottolog-version.json) (glottolog-cldf commit `072ca0d`, CC-BY-4.0, Glottolog 5.3 notice).

## Key decisions
- Data source is glottolog-cldf; the tree is reconstructed from `values.csv` `classification` (root-first glottocode path) because this release has no `Parent_ID` in `languages.csv` (research D1/D2).
- ISO/BCP47 is the currency, glottocode stays internal (D5); ISO lookup is permissive (D4).
- Curated pseudo-family exclusion set ([pseudo-families.ts](../../packages/glottolog/src/pseudo-families.ts)) (D6); ancestry ordering root-first (D7).
- Bridge is pure with injected deps (D8); one candidate per keyboard, attributed to its closest relative (D10); script must coincide, never guessed (D12).

## Gotchas and limits
- Bridge returns `[]` when the target has no resolved script.
- A keyboard supporting several relatives appears once; the rest are listed in `alsoSupports`.
- The generated index is checked in; changing the pin requires re-running fetch + codegen.
- No CLDR/langtags data is read at runtime by this package.

## Divergences from the spec
- `catalog.ts` exports extras beyond the contract (`ancestorCodes`, `familyMembers`); `relatedness.ts` exports `compareRelatedness` and `isCloser`. Additive only.
- `relatedIsoCodes` is defined in `src/index.ts`, not a separate module. Matches the contract.
- No contradiction found on the public surface.

## Follow-ups and open issues
- Header comments in `bridge.ts` cite `contracts/keyboard-base-bridge-api.md` (it moves to the archive) and other package files cite `spec 036` (they still resolve to this stub).
- [docs/packages.md:75](../../docs/packages.md) and [packages/glottolog/README.md:8](../../packages/glottolog/README.md) link the folder, which stays.
