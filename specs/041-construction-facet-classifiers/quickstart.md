# Quickstart: Construction Facet Classifiers

Validation guide for the three phases. All commands run from the repo root. The tool is standalone `utilities/*` — run its tests via its own vitest config; it is not part of `pnpm -r`.

## Prerequisites

- `pnpm install` and one `pnpm build` (the facet-index tool imports the engine codec + recognizer, and the langtags/UCD generated data must exist). See [CLAUDE.md](../../CLAUDE.md) "prebuild is not optional".
- The sibling `keymanapp/keyboards` checkout at `../keyboards` for a full-corpus build (unit tests use the hermetic fixtures under [utilities/facet-index/__fixtures__/](../../utilities/facet-index/__fixtures__/)).

## Run the tool's tests

```bash
pnpm --filter <facet-index-vitest> test        # or: cd utilities/facet-index && npx vitest run
node utilities/facet-index-lint/index.js        # artifact validator (also via pnpm run facet-index-lint)
pnpm run facet-lint                              # validates content/facets/*.yaml (P3's display-difficulty)
```

## P1 — Nine desktop facets (MVP)

**Build & inspect**

```bash
# rebuild the --classified-only index against the fixture (or ../keyboards) corpus
tsx utilities/facet-index/cli.ts --classified-only   # flags per cli.ts
```

**Expected (US1 acceptance):**
- A case-folding keyboard → `caps-handling = any-index-fold`, consistency 1, no `causeTagCounts`.
- A mixed quoted/`\u` keyboard → `encoding` records per-role (`input`/`base`/`combining`) distribution; minority spelling sites counted in `causeTagCounts`.
- A `&MNEMONICLAYOUT` keyboard → `mnemonic-vs-positional = mnemonic`, marked as a gate.
- Arabic fixture → `casing = caseless`, `caps-handling` emitted with `notApplicable: true` (no forced value).
- Abugida/abjad → `normalization-posture` `notApplicable` (not `nfc`/`nfd`).
- Unset `&baselayout` → `fallback-posture` fall-through base recorded **defaulted**.
- All nine `content/keyboard-facets/*.yaml` have a real `classifierId`; `pnpm run facet-index-lint` passes.

## P2 — Four touch facets

**Expected (US2 acceptance):**
- A longpress-popup touch layout → `touch-combo-mechanism = longpress` with distribution.
- A keyboard with no `.keyman-touch-layout` → all four touch facets `notApplicable` (never defaulted).
- A touch layout reproducing ALT/RALT → `touch-modifier-layers = maps-desktop-modifiers` with the appropriate cause tags.
- The four defs have real `classifierId`; `facet-index-lint` passes.

## P3 — Display-difficulty input facet

**Expected (US3 acceptance):**
- Basic Latin (old block) → `well-supported`.
- A script with corpus PUA usage → `poorly-supported` regardless of block age.
- [content/facets/orth/display-difficulty.yaml](../../content/facets/orth/display-difficulty.yaml) `sourceStatus: available`, real `source` id, era-boundary params recorded; `pnpm run facet-lint` passes.

## Whole-feature acceptance (SC-001..SC-005)

```bash
# determinism: rebuild twice, diff must be empty
tsx utilities/facet-index/cli.ts --classified-only && cp docs/keyboard-facet-index.json /tmp/a.json
tsx utilities/facet-index/cli.ts --classified-only && diff docs/keyboard-facet-index.json /tmp/a.json   # no output
```

- **SC-001**: 16 keyboard facets per base in the `--classified-only` index; zero `classifierId: planned` in `content/keyboard-facets/`.
- **SC-002**: every value carries provenance + consistency (+ `causeTagCounts` when consistency < 1).
- **SC-003**: byte-identical rebuild; `facet-index-lint` + tests pass.
- **SC-004**: not-applicable rules hold corpus-wide.
- **SC-005**: a base's construction decisions are readable from the index alone.
