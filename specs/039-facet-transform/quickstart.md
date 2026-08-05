# Quickstart: Facet Transform Engine

Runnable validation scenarios proving the feature works end-to-end. Each maps to a user story + success
criteria. Details live in [data-model.md](data-model.md) and [contracts/](contracts/) — this is the run guide.

## Prerequisites

- `pnpm install` at the repo root (see [CLAUDE.md](../../CLAUDE.md) — `prebuild` fetches langtags; the compiler wasm ships in the `@keymanapp/kmc-kmn` npm dependency).
- Fixtures: real corpus keyboards from [docs/keyboard-index.md](../../docs/keyboard-index.md) plus injected
  `SourceFacetMeasurement` fixtures (037/036 output shape — [data-model.md](data-model.md) Entity 0). 037's
  live `source.*` measurements need not exist yet; the engine is exercised against fixture measurements
  (research D4).
- Run the module's tests: `pnpm --filter @keyboard-studio/engine test src/facet-transform`

## Scenario 1 — Behavior-preserving encoding normalization (US1 · SC-001/SC-002)

**Goal**: a mixed-encoding base is normalized to house style with byte-identical output and identical behaviour.

1. Load a fixture base with mixed input/base/combining encoding; inject its `source.encoding` measurement.
2. `proposeFacetTransform(ir, measurement, { facetId: 'source.encoding.output-spelling', preset: 'house-style' })`.
3. **Expect**: a `TransformProposal` with `previewKind: 'source-diff'`, per-role before/after, and a
   `houseTargetProvenance` chip **only** if a non-default target fired (e.g. `U+`-kept for a poorly-displaying
   script — US1 AC1).
4. `applyFacetTransform` with confirmation.
5. **Assert**: `buildProducedSet` unchanged; `simulate` output identical over `generateCorpus`; source now
   matches house-style per role; `assertSemanticEquivalence(before, inverse(after)).equivalent === true`
   (reversible — AC1.3).

## Scenario 2 — longpress → flick with exception preservation (US2 · SC-004)

**Goal**: dominant longpress switched to flick; principled-split preserved; gap surfaced; output unchanged.

1. Load a fixture with a known **principled-split** (one touch mechanism for diacritics, another for base
   chars) and a known **gap-omission**; inject its `source.touch-combo-mechanism` measurement.
2. `proposeFacetTransform(..., { facetId: 'source.touch-combo-mechanism', toValue: 'flick' })`.
3. **Expect**: `previewKind: 'ux-description'`; principled-split sites listed with `defaultDisposition:
   preserve` (**named**, not converted); the gap listed as `fix-offered`; a derived flick-direction table to
   review; any subkey-count-over-budget key **refused per-site** with a reason.
4. Confirm the dominant switch, leave principled-split preserved (partial acceptance, FR-012).
5. **Assert**: dominant sites → flick; principled-split sites unchanged; gap offered not carried forward;
   `simulate` **output** identical (only input UX changed); refused keys untouched.

## Scenario 3 — NFD → NFC with coordinated backspace rewrite (US3 · SC-006)

**Goal**: output migrates NFD→NFC and the backspace rules stay consistent; output diff shown before commit.

1. Load a fixture NFD base **with** matching two-codepoint backspace overrides; inject its
   `source.normalization-posture` measurement.
2. `proposeFacetTransform(..., { facetId: 'source.normalization-posture', toValue: 'nfc' })`.
3. **Expect**: `previewKind: 'output-diff'` showing emitted-byte changes **and** the companion backspace-rule
   rewrite (now-unreachable overrides removed); explicit confirmation required (US3 AC2).
4. Confirm.
5. **Assert**: output normalization changed as intended; backspace rules migrated consistently (single
   backspace deletes the composed codepoint); the working copy still compiles.

## Scenario 4 — Honest declines + refusals (FR-004 · Edge Cases)

1. Request `source.mnemonic-vs-positional` **and** `source.casing` → **gate refusal** with explanation for each (never attempted; both gate facets per transition-matrix contract invariant #4).
2. Request `source.encoding.input-match-kind` `key-ref → char-ref` → **permanent decline** with reason
   (semantic, not behavior-preserving).
3. Request `source.normalization-posture` `nfc → nfd` → **deferred decline** with reason.
4. Inject an `undetermined` measurement → transform **declines or re-measures**, never guesses.
5. **Assert**: each returns a `TransformRefusal` with a verbatim reason; none reaches a `proposed` state;
   none mutates the working copy.

## Scenario 5 — Compile-regression guard + opaque integrity (SC-005/SC-006)

1. Construct a fixture where a transform would produce an invalid working copy.
2. `applyFacetTransform`.
3. **Assert**: `status: 'commit-failed'`; working copy **unchanged**; failure attributed to the proposal
   (no second debounce timer involved — a one-shot `validateWithOracle`/`compile` call, research D8/D9).
4. Run a transform over a fixture containing `RawKmnFragment` opaque regions.
5. **Assert**: no fragment dropped/altered; `opaqueUntouched` reports what could not be modelled (FR-009).

## What "done" looks like

All five scenarios pass in `pnpm --filter @keyboard-studio/engine test src/facet-transform`, the FR-013
produced-set-change path re-seeds discovery axes (verified via the studio store test), and any newly-cited
fixture keyboard has a row in [docs/keyboard-index.md](../../docs/keyboard-index.md).
