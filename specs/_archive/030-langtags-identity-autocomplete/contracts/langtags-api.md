# Contract: langtags lookup API (extended)

**Owner**: Engine. **Package**: `@keyboard-studio/engine/langtags` + `packages/contracts/src/langtags.ts` + `scripts/codegen-langtags.mjs`.

This contract is **additive**: every existing field/function keeps its current shape and behavior. New fields are optional; new behavior is opt-in via the new fields. It does NOT touch the locked `Pattern` contract.

## Types (contracts/src/langtags.ts)

### LanguageDefaults (extended)

```
interface LanguageDefaults {
  // --- unchanged (existing consumers depend on these) ---
  subtag: string;
  iso639_3?: string;
  script: string;
  region: string;
  regions: readonly string[];
  autonym?: string;      // primary own-script name
  englishName: string;   // primary English name
  // --- new, additive ---
  englishNames?: readonly string[];     // all English/alt names, primary first, de-duped
  localNames?: readonly string[];       // all own-script names, primary first, de-duped
  regionVariants?: readonly RegionVariant[]; // one per region-distinct tagset
}

interface RegionVariant {
  region: string;        // ISO 3166 / UN M.49 code
  regionName: string;    // display label (region-question choice)
  script: string;
  autonym?: string;
  localNames: readonly string[];
}
```

### LanguageSummary (extended search result)

```
interface LanguageSummary {
  subtag: string;
  englishName: string;
  autonym?: string;
  script: string;
  hasRegionVariants?: boolean;   // new: >1 region variant → a region step will follow
}
```

## Functions (unchanged signatures)

- `getLanguageDefaults(subtag: string): LanguageDefaults | null` — now also populates the new fields when present; returns `null` for unknown subtags (unchanged).
- `lookupByName(query: string): readonly LanguageSummary[]` — searches English name + autonym (unchanged); now sets `hasRegionVariants`.
- `listLanguages(): readonly LanguageSummary[]` — unchanged.

## Codegen (scripts/codegen-langtags.mjs)

- MUST additionally retain `names[]`, `localnames[]`, and per-region `regionname` from each source tagset, grouping region-distinct tagsets of the same bare subtag into `regionVariants`.
- MUST preserve the existing emitted fields byte-for-behavior (existing snapshot/tests for the current fields stay green).
- The generated slim index remains the single runtime source (no raw-file parsing at runtime).

## Contract tests (engine)

- `getLanguageDefaults` for a known **single-region** language → `regionVariants` length 1, `localNames` includes the primary autonym.
- `getLanguageDefaults` for a known **multi-region** language (same English name across regions) → `regionVariants` length > 1, each with its own `regionName`/`localNames`.
- `lookupByName` sets `hasRegionVariants=true` iff the resolved subtag has >1 region variant.
- Existing langtags tests (primary `autonym`/`englishName`/`script`/`region`) remain unchanged and green (back-compat).
- **Build-time verification** (R1): confirm the pinned `99b856b` data actually carries `names`/`localnames`/`regionname` with real multiplicity for the exemplar languages used in tests.
