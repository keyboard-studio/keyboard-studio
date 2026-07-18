# facet-index — per-keyboard facet index build tool

Standalone Node tool (spec [036](../../specs/036-keyboard-facet-index/)) that scans the sibling
`keymanapp/keyboards` corpus and emits a committed, offline, deterministic **per-keyboard facet index**:
for every corpus keyboard, a categorization of each defined facet (dominant value, likelihood
distribution, provenance tier, analysis outcome, and freshness). 036 landed exactly one facet — `script` —
as the worked example that proves the artifact shape; [037](../../specs/037-facet-classifiers/) adds two
more classifiers — `strategy-fingerprint` (rule-structure) and `target-mix` (declared-metadata) —,
[038](../../specs/038-adaptation-questions/) surfaces them to users.

This is a `utilities/*` tool: it is deliberately **out of `pnpm -r`** (no build step), run via `tsx`, and
imports engine source by relative path. Do not add it to `packages/*`.

## Ownership split (constitution Article VI)

- **Engine team** owns the **algorithms**: the classifiers (`*-classifier.ts`), the build shell
  (`build-index.ts`), the fallback/outcome/validate plumbing, and the pinned UCD lookup. A classifier is a
  pure, deterministic function that reads the parsed IR (or, for the declared-metadata archetype, the
  scanned source bytes) and emits a `Categorization`. Register each as a `{ classify, fallback }`
  `ClassifierPair` in `DEFAULT_CLASSIFIERS`, keyed by the **facet id** (`def.id`) — never by
  `derivation.classifierId`, which is a free-form `<facet>-classifier` doc/freshness label.
- **Content team** owns the **definitions**: [`content/keyboard-facets/*.yaml`](../../content/keyboard-facets/)
  (closed value set, likelihood semantics, fallback chain, `feedsSessionFacets`) and the hand-judged
  validation-set judgments. The tool never defines a facet.

**Lockout coordination.** `content/keyboard-facets/` and this directory are shared with concurrent crews
(036/037/039). Acquire a lock (`--team facet-<spec>`) on each file before the first write and release at
checkpoint close; lock narrowly and heartbeat long corpus runs.

**Classifier-less definitions (cross-crew).** A facet YAML can land ahead of its classifier (e.g. spec 039's
construction facets). The default build **fails loud** on such a def — the intentional guard. Use
`--classified-only` to build the artifact scoped to facets that have a registered classifier while the rest
land; the shipped `docs/keyboard-facet-index.json` is currently built that way.

## Artifacts it produces

- `docs/keyboard-facet-index.json` — the machine-readable index (the deliverable).
- `docs/keyboard-facet-index.md` — a human-readable audit companion (per-facet coverage, sample rows,
  build inputs).

Facet definitions are **content-owned data** in [`content/keyboard-facets/*.yaml`](../../content/keyboard-facets/)
(not a locked `packages/contracts` type). The build reads them; the tool never defines a facet.

## Run

Prerequisites: sibling `../keyboards` checkout present (`release/**` is the scope); `pnpm install` +
`pnpm run prebuild` done at least once; UCD lookup generated (see below).

```bash
# Full build (default): scan the whole corpus, write both artifacts.
npx tsx utilities/facet-index/cli.ts

# Incremental: re-analyze only keyboards whose source bytes changed vs the prior
# committed index; carry the rest forward byte-for-byte.
npx tsx utilities/facet-index/cli.ts --incremental

# Verify without writing (CI): fails non-zero if the committed artifact is stale.
npx tsx utilities/facet-index/cli.ts --check

# Dev smoke: only the first N keyboards (by id).
npx tsx utilities/facet-index/cli.ts --limit 20

# Build only facets that have a registered classifier (skip definition-only YAMLs
# a later spec landed ahead of its classifier). How the shipped artifact is built today.
npx tsx utilities/facet-index/cli.ts --classified-only
```

Other flags: `--out <path>` (override the write target), `--corpus-root <path>` (override the
`../keyboards` location), `--quiet` (suppress the `[OK]` summary). `--help` prints the list.

## UCD lookup — pin + generate (once, and on Unicode bumps)

The script classifier maps codepoints to ISO-15924 via a pinned Unicode Character Database lookup. It is
generated and committed, never fetched at build time:

```bash
node utilities/facet-index/ucd/codegen-ucd.mjs
```

This SHA-256-verifies `lib/ucd/{Scripts,ScriptExtensions,PropertyValueAliases,Blocks}.txt` against
[`scripts/ucd-version.json`](../../scripts/ucd-version.json), then codegens
[`ucd/generated/scriptLookup.ts`](ucd/generated/scriptLookup.ts) + [`data/SOURCES.json`](data/SOURCES.json).
A hash mismatch (including the `PLACEHOLDER` sentinel) **fails loud and writes nothing partial** — corrupt
or unpinned reference data can never silently change the index.

## Freshness & the pin-bump-forces-rescan guarantee

Rescan is content-hash driven (SHA-256 of source bytes — never mtimes, which are not stable across
checkouts/CI). Two gates (see [`freshness.ts`](freshness.ts)):

1. **Per-keyboard hash** — `--incremental` re-analyzes only keyboards whose source bytes changed; the rest
   carry forward verbatim.
2. **Version bump** — when `scannerVersion` (tool + schema + classifier stamp) or `unicodeVersion` (the
   pinned UCD release) changes, **all** content-derived records are recomputed, even under `--incremental`.
   Adding or removing a facet likewise discards the prior index and forces a full rescan.

## Invariants

- **Offline / no runtime host-disk writes.** The studio never runs this tool. It reads the sibling corpus
  at build time only; the committed artifacts are what consumers read (no corpus checkout, no network).
- **Deterministic.** Identical inputs ⇒ byte-identical `keyboard-facet-index.json` — recursively
  key-sorted, 2-space indent, no timestamps in the payload, write-only-if-changed
  ([`writeStable.ts`](writeStable.ts)). A no-op rebuild produces no git diff.
- **Full coverage (SC-001 / X3).** Every in-scope keyboard has a record for every defined facet — a
  missing record is a loud build failure, never a silent gap.
- **Loud validation (FR-008).** Every record is validated at production ([`validate.ts`](validate.ts),
  X1/X2/X4) and again over the committed artifact by
  [`utilities/facet-index-lint`](../facet-index-lint/) in `pnpm lint` (X1–X7, C1–C5).

## Corpus scope

`../keyboards/release/**` only (the phonebook convention). A keyboard whose primary `.kmn` cannot be
parsed is **not** dropped — it still gets a record via the fallback chain (declared `.kps` metadata →
langtags default script → `undetermined`), with `analysisOutcome: 'fallback-only'`.
