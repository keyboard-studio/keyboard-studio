# Phase 0 Research: Glottolog classification catalog + bridge

All `NEEDS CLARIFICATION` are resolved here. Decisions marked **(clarified)** were fixed in the spec's `## Clarifications` section; decisions marked **(new)** are resolved by this research.

## D1 — Data source: glottolog-cldf release (clarified)

**Decision**: Pin a `glottolog/glottolog-cldf` release (GitHub tag or Zenodo archive) by tag/commit + SHA-256. Consume the CLDF `cldf/languages.csv` table.

**Rationale**: `languages.csv` is one structured, tabular file carrying every field we need: `ID` (Glottocode), `Name`, `Glottocode`, `ISO639P3code`, `Family_ID`, `Parent_ID`, `Level`, `Macroarea`. The full classification tree reconstructs from `Parent_ID` alone. This is the smallest, most stable slice of Glottolog for our purpose and maps 1:1 onto the langtags fetch/codegen discipline.

**Alternatives considered**: (a) raw `glottolog/glottolog` repo (one `md.ini` per languoid) — full fidelity but thousands of files, heavy to fetch and parse, and more than we need; (b) the CLDF Newick `.trees` file alone — smallest, but loses ISO/name metadata that the join requires. Rejected both.

**Follow-up for implementation**: pin the exact current release (e.g. Glottolog 5.x) in `scripts/glottolog-version.json`; record the release's license (CC-BY-4.0 for Glottolog data) in the pin + `SOURCES.json`.

## D2 — Tree + level from `languages.csv` (new)

**Decision**: Reconstruct the tree from `Parent_ID` (a languoid whose `Parent_ID` is empty is a family root). Carry `Level` (`family` / `language` / `dialect`) from the CLDF column. If a given release does not expose `Level` directly in `languages.csv`, derive it (has children ⇒ non-leaf group; leaf with an ISO code ⇒ language; leaf under a language ⇒ dialect) and pin the derivation in codegen.

**Rationale**: `Parent_ID` is the authoritative genealogical edge; `Family_ID` is a convenience denormalisation of the root and is stored too (it lets `relatedLanguages` cheaply pre-filter to a family). `Level` lets consumers decide whether a dialect-level relative is an acceptable base (FR-010).

## D3 — Relatedness metric (clarified)

**Decision**: Closeness = **depth of the deepest shared subgroup** (length of the shared ancestor prefix from the family root ≡ position of the nearest common ancestor). Ties break by **shorter total path** between the two languoids, then by **glottocode** for determinism.

**Rationale**: Matches how linguists talk about relatedness ("same sub-subgroup" beats "same family"); deterministic; cheap to compute from two root-first ancestry lists (longest common prefix). See spec FR-011.

## D4 — Permissive ISO resolution (clarified)

**Decision**: `byIso639p3(iso)` returns **all** matching languoids (deduplicated by Glottocode, deterministic order), not a single pick. Downstream (relatedness, bridge) unions across all matches and deduplicates the final result.

**Rationale**: An ISO 639-3 code can map to 0/1/many glottocodes. Breadth beats precision for base-finding — a spurious extra candidate is cheaper than a missed base. Spec FR-008.

## D5 — Glottocode internal; ISO/BCP47 is the currency (clarified)

**Decision**: Glottocode is an internal traversal id. Input arrives as ISO 639-3 (from langtags); output for the keyboard layer is ISO 639-3 / BCP47. The keyboard-matching layer never sees a glottocode as a match key (it may ride along as provenance).

**Rationale**: Keyman keyboards declare BCP47/ISO tags, not glottocodes (spec FR-017a, FR-011a). Confirmed by the phonebook (`docs/keyboard-index.md`) and `.kps` language lists (`packages/engine/src/base-browser/kps-parser.ts`), both BCP47.

## D6 — Pseudo-family exclusion via curated glottocode set (clarified)

**Decision**: Recognition by a **curated, version-pinned set of stable pseudo-family glottocodes**, checked in at `src/pseudo-families.ts`. A languoid whose family root is in the set is treated as non-genealogical (contributes no relatedness). Reviewed at each dataset-pin bump.

**Known set** (stable Glottolog top-level pseudo-families; confirm exact glottocodes against the pinned release during implementation): Bookkeeping (`book1242`), Unclassifiable (`uncl1493`), Unattested (`unat1236`), Artificial Language (`arti1236`), Sign Language (`sign1238`), Mixed Language (`mixe1287`), Pidgin (`pidg1258`), Speech Register (`spee1234`).

**Rationale**: Glottocodes are stable across releases; name-matching breaks on rename/localization; `languages.csv` does not reliably carry a category flag to derive from. Spec FR-012.

## D7 — Ancestry ordering: root-first (new — resolves the last soft spot)

**Decision**: `ancestors(glottocode)` returns the classification path **root-first**: family root → … → immediate parent (the languoid itself is NOT included). An isolate/top-level family returns `[]`.

**Rationale**: Root-first matches how Glottolog displays classification (Indo-European › Germanic › West Germanic › English) and makes the relatedness metric a trivial **longest-common-prefix** over two ancestry arrays — no reversal needed. Documented so consumers never depend on an unspecified order (spec Assumptions).

**Alternatives considered**: leaf-first (immediate parent first). Rejected — reads backwards versus Glottolog's own display and complicates the shared-prefix computation.

## D8 — Packaging + dependency injection (new)

**Decision**: One standalone package `@keyboard-studio/glottolog` that imports **only** `@keyboard-studio/contracts`. It hosts both the catalog and the bridge. The bridge is a **pure function with injected dependencies**: the caller passes `resolveLanguage(bcp47|iso) → { iso639_3, script }` (langtags-backed) and `languagesById: Record<keyboardId, BCP47[]>` (the phonebook). The package therefore never imports engine/base-browser/langtags, so there is no `glottolog ↔ engine` edge and no dependency-cruiser violation.

**Rationale**: `contracts-is-the-dependency-root` + `engine-not-to-studio` rules in `.dependency-cruiser.cjs` forbid new cross-package cycles. The existing [`suggestBases`](../../packages/studio/src/lib/suggestBases.ts) already proves the injection pattern — it takes `languagesById` rather than importing base-browser. Reusing that pattern keeps the new package a clean leaf and independently testable with fixture data.

**Alternatives considered**: (a) bridge in engine (engine → glottolog edge) — viable but splits the feature and adds an engine module; (b) glottolog → engine (import langtags directly) — inverts layering and couples the pure catalog to the whole engine. Rejected in favour of injection.

## D9 — Default output bound: no cap (clarified)

**Decision**: Relatedness/bridge queries return **all** candidates ranked closest-first by default; a bound (max-N and/or min-closeness cutoff) is opt-in. Never silently truncate. Spec FR-013.

## D10 — Candidate dedup: one per keyboard (clarified)

**Decision**: A keyboard appears **once**, ranked by its closest supported relative; other supported relatives are secondary metadata. A related language with several keyboards still yields several candidates. Spec FR-016 / FR-016a.

## D11 — Slim index shape + determinism (new)

**Decision**: Codegen emits a checked-in `src/generated/index.ts` exporting:
- `languoids: Readonly<Record<Glottocode, LanguoidRecord>>` where `LanguoidRecord = { name, level, iso639p3?, parentId?, familyId? }`;
- `byIso: Readonly<Record<ISO639P3, readonly Glottocode[]>>` (permissive; arrays, sorted).
Keys and array members are sorted; records use a fixed key order; the file is only rewritten when content changes. A `codegen-determinism.test.ts` asserts identical input → byte-identical output.

**Rationale**: Direct port of the langtags codegen (`scripts/codegen-langtags.mjs`), including the per-record cast to avoid the TS2590 "union too complex" error on large array literals.

## D12 — Script comparison (new)

**Decision**: "Same script" (FR-017b) = equality of the **ISO 15924** script subtag. The bridge obtains the target's script and each candidate's script from the injected `resolveLanguage` / the phonebook tag (via the same `hasExplicitScriptSubtag` / primary-subtag helpers `suggestBases` already uses). Glottolog itself does not supply script — this is why script is injected, not derived here.

**Rationale**: Keeps the script signal in the layer that already owns it (langtags/base-browser), consistent with D5/D8 and the existing `suggestBases` decoupling of language and script (spec §8/§9).

---

**Outcome**: all Technical-Context unknowns resolved; zero `NEEDS CLARIFICATION` remain. Ready for Phase 1.
