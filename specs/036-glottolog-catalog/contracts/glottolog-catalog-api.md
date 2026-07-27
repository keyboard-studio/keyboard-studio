# Contract: `@keyboard-studio/glottolog` catalog + relatedness API

Public surface of the package root export. All functions are **synchronous, pure, offline** (FR-006) over the checked-in generated index. Types: [data-model.md](../data-model.md).

## `getLanguoid(glottocode: Glottocode): Languoid | null`

Resolve one languoid by Glottolog code. `null` when absent (never throws). (FR-007)

## `byIso639p3(iso: Iso639P3): Languoid[]`

Permissive ISO → languoids (FR-008, D4). Case-insensitive on input.
- Returns **all** matching languoids, deduplicated by glottocode, deterministic order (by glottocode).
- Returns `[]` when the code maps to none.
- This is the **langtags bridge entry point**: langtags supplies the ISO code for the target language.

## `ancestors(glottocode: Glottocode): Languoid[]`

Root-first classification path, excluding self (FR-009, D7).
- `[stan1293 → …]` example for English: `[Indo-European, Classical Indo-European, Germanic, Northwest Germanic, West Germanic, …]`.
- `[]` for a top-level family or isolate.
- Unknown glottocode ⇒ `[]` (consistent with not-found, never throws).

## `relatedLanguages(glottocode: Glottocode, opts?: RelatednessOptions): RelatednessResult[]`

Genealogically related languoids, closest-first (FR-011, FR-013).

```ts
interface RelatednessOptions {
  maxResults?: number;        // opt-in cap; default: no cap (D9)
  minSharedDepth?: number;    // opt-in cutoff on sharedSubgroupDepth
  levels?: ReadonlyArray<Languoid["level"]>; // e.g. ["language"] to exclude dialects/families
}
```

Rules:
- Excludes the target itself, pseudo-family members (FR-012), and cross-family languoids (no shared subgroup).
- Ordered by `sharedSubgroupDepth` desc, then `pathLength` asc, then glottocode asc (D3).
- No default cap; caller truncates (D9). Never throws on unknown input — returns `[]`.

## `relatedIsoCodes(iso: Iso639P3, opts?: RelatednessOptions): RelatednessResult[]`

The ISO-in → ISO-out convenience path (FR-011a). Resolves `iso` permissively (D4), unions `relatedLanguages` across every matched glottocode, deduplicates by glottocode keeping the **closest** distance, and drops results with no `iso639p3` (they cannot back a keyboard). This is what the bridge consumes.

## Determinism & safety guarantees

- No network, no filesystem, no `Date.now`/`Math.random` at runtime.
- Every function is total: unknown/empty inputs yield `null`/`[]`, never exceptions.
- Results are stable across processes (deterministic ordering).
