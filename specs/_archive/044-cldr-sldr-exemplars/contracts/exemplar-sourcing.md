# Contract: exemplar sourcing (engine)

**Feature**: 044-cldr-sldr-exemplars · Consumers: `characterMap.ts`, `suggestMissing.ts`,
studio `services.ts`. Types: [../data-model.md](../data-model.md).

This is the **single** sourcing path required by FR-015. `characterMap.ts` and
`suggestMissing.ts` must consume it rather than each wiring their own loader.

## Public API

```ts
// packages/engine/src/character-discovery/exemplarSource.ts

/**
 * Resolve the exemplar inventory for a BCP47 tag from the committed offline index.
 * Returns null when neither source covers the tag or the confidence gate fires —
 * callers then fall through to whole-script behaviour (FR-010). Never throws for
 * an unknown/malformed tag.
 */
export function sourceExemplars(bcp47: string): SourcedInventory | null;

/** Locale-directory candidates for a tag, most specific first (R10). */
export function exemplarLocaleCandidates(tag: string): string[];

/** True when the tag is suppressed by the confidence gate, per source (FR-008, R7). */
export function isGatedTag(tag: string, source: ExemplarSource): boolean;
```

`sourceExemplars` is **synchronous and offline** — the index is a lazily-imported chunk,
so callers that may run before it loads use the async wrapper:

```ts
export async function loadExemplarSource(): Promise<void>;   // idempotent; awaits the chunk
```

### Compatibility with today's exports

`createFetchCldrLoader` / `createFetchCldrFullLoader` / `CldrFullLoader` stay exported and
keep working (they are the injection seam every existing test uses). They become the
**live-refresh** path, not the authoring path. `loadExemplars` /
`loadExemplarsFromFull` keep their signatures; `buildCharacterMap`'s `opts.loader`
injection hook is preserved so existing tests need no rewrite.

## Resolution order (normative)

1. **Normalize + candidates** — `exemplarLocaleCandidates(tag)`, most specific first
   (`ewo-Latn` → `["ewo-Latn", "ewo"]`; `sr-Latn` resolves at the first candidate).
2. **First candidate present in the index wins.** Its id becomes `resolvedTag`.
3. **Confidence gate** (FR-008, per-source per R7) — return `null` for `und`, script-only
   tags, and un-narrowed macrolanguages (`ms`, `zh`, `ar`, `fa`) for **both** sources;
   for `qaa`–`qtz`, gate CLDR but **allow an SLDR-backed entry** through.
4. **Precedence** (R5) — if the entry has a CLDR side, use it; else the SLDR side.
5. **Tier extraction** — parse `main`/`auxiliary`/`punctuation`/`numbers` through the
   canonical `parseUnicodeSet`; a character present in several tiers is recorded at its
   highest.
6. **NFC-normalize** every character (FR-009). Uppercase counterparts are **not** added
   here — that is the caller's/047's `caseCounterpart` job, so the inventory stays a
   faithful record of what the source attested.

Every step is pure and deterministic: same index + same tag → same result.

## Index format

`packages/engine/src/character-discovery/generated/exemplars.generated.json`

```jsonc
{
  "version": {
    "cldr": "48.2.0",                                   // cldr-misc-full package version
    "sldrCommit": "<40-hex commit sha>",                 // silnrsi/sldr pin
    "generated": "cldr:48.2.0+sldr:<sha7>"               // input-derived, NOT a timestamp
  },
  "locales": {
    "ewo": {
      "c": {                                             // CLDR side
        "m": "[aáàâǎ b d {dz} eéèêě ə… ]",
        "a": "[c j q x]",
        "p": "[\\- ‐ – — , ; \\: ! ? . … ' ‘ ’ \" “ ” ( ) \\[ \\] § @ * / \\& # † ‡ ′ ″]",
        "n": "[  \\- , . % ‰ + 0 1 2 3 4 5 6 7 8 9]"
      },
      "s": { "m": "[…]", "d": "generated" }              // SLDR side + draft status
    }
  }
}
```

**Rules**
- Keys sorted; two-space indent; trailing newline. Regenerating from the same pins is
  **byte-identical** (FR-013 / SC-005) — no wall clock, no `Math.random`, no filesystem
  iteration order dependence (sort explicitly).
- Tier keys are abbreviated (`m`/`a`/`p`/`n`) purely for size; `d` is the SLDR draft rank.
- Raw exemplar strings are stored **unparsed** — smaller, digraph-preserving, diffable.
- A locale with no usable `main` set in either source is **omitted**.
- Size budget **< 2 MB**. If exceeded, gitignore + regenerate at prebuild like
  `charnames.generated.json` rather than committing it.

## Build-time contract

```text
scripts/cldr-version.json   { "package": "cldr-misc-full", "version": "48.2.0" }
scripts/sldr-version.json   { "repo": "silnrsi/sldr", "commit": "<sha>", "sha256": "<hex>" }
```

- `pnpm fetch-sldr` — downloads **one** tarball
  (`codeload.github.com/silnrsi/sldr/tar.gz/<commit>`), verifies SHA-256, extracts to the
  gitignored `packages/engine/data/sldr/`. **Fails loudly** on mismatch, on an HTML error
  page masquerading as a tarball, or on a placeholder/zero-length file (FR-012).
- `pnpm codegen-exemplars` — reads `node_modules/cldr-misc-full/main/*/characters.json`
  plus the SLDR extract, writes the index. Fails loudly on any exemplar set it cannot
  parse (FR: malformed set never yields a partial inventory).
- Both join the existing `prebuild` chain next to `fetch-langtags` / `codegen-langtags`.
- Console output uses `[OK]` / `[WARN]` / `[ERROR]`, no emoji (Article VIII).
- A **staleness check** reports (never auto-applies) when upstream has a newer CLDR
  release or SLDR commit.

## SLDR reader rules (normative — research R6)

1. Read `<exemplarCharacters>` elements under `<characters>` only.
2. **Skip any element carrying an `alt` attribute** — alternative proposals, not the
   locale's set. (Without this, `sldr/e/ebk.xml` yields its punctuation twice.)
3. On duplicate `type` after that, pick the highest `draft` rank; ties break by document
   order. Record the winner's rank as `d`.
4. `type` absent ⇒ `main`. Map `auxiliary`/`punctuation`/`numbers`; **ignore `index`**.
5. File-level `sil:identity/@draft` is the fallback rank when an element has none.

## Parser fixes required (research R9 — verified defects)

The canonical `parseUnicodeSet` must, before SLDR ingestion:

| Input | Current (verified) | Required |
|---|---|---|
| `[a ‌ b]` | `a`, `u`, `2`, `0`, `C`, `b` | `a`, U+200C, `b` |
| `[[a-z]-[aeiou]]` | `[`, `]`, `a`…`z` | fail loudly (unsupported set operation) |
| `[! , \- . \: \[ \]]` | correct | unchanged |

Also handle `\x{...}` and `\\` (literal backslash). SLDR uses `‌`/`‍` in real
exemplar sets, so shipping without this would inject `u`,`2`,`0`,`C`,`D` into authors'
alphabets.

## Test obligations

| # | Assertion | Maps to |
|---|---|---|
| T1 | All four tiers non-empty for a locale that has all four (`fr`, `ewo` auxiliary = `[c j q x]`) | R0, FR-005/006/007 |
| T2 | `\uXXXX` decodes; set-difference syntax fails loudly | R9 |
| T3 | `ewo-Latn` resolves to `ewo`; `sr-Latn` resolves at first candidate | R10, locale-granularity edge case |
| T4 | An SLDR-only tag yields a seed; a both-sources tag yields CLDR with `source: "cldr"` | FR-002/003, SC-001 |
| T5 | Every returned character carries `source` + `confidence` | FR-004, SC-007 |
| T6 | `und`, `Latn`, `zh`, `ms` return `null`; `qaa`-`qtz` gated for CLDR, allowed for SLDR | FR-008, R7 |
| T7 | Tag covered by neither source returns `null` and does not throw | FR-010 |
| T8 | Regenerating the index twice is byte-identical | FR-013, SC-005 |
| T9 | Checksum mismatch / placeholder tarball fails the build | FR-012 |
| T10 | Every character NFC | FR-009 |
| T11 | No network access during a full survey run (fetch stubbed to throw) | FR-011, SC-004 |
| T12 | No locale that seeded before this feature loses its seed (corpus diff vs baseline) | SC-006 |
