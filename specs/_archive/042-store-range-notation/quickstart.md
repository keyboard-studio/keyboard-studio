# Quickstart: validate KMN store range notation

**Feature**: 042-store-range-notation · **Date**: 2026-07-20

Runnable validation scenarios that prove the feature works end-to-end. Behavioral
details live in [contracts/codec-range.md](contracts/codec-range.md) (cases C1–C13)
and [data-model.md](data-model.md); this is the run guide. All commands run from
the repo root unless noted.

## Prerequisites

```bash
pnpm install
pnpm build            # prebuild codegen + build engine/contracts (see CLAUDE.md)
```

The corpus round-trip and facet-index scenarios also need the sibling
`../keyboards` checkout (see [docs/keyboard-index.md](../../docs/keyboard-index.md)).

## Scenario A — BMP range expands in the IR (US1 / C1)

```bash
pnpm --filter @keyboard-studio/engine test src/codec/parse.test.ts -t "range"
```
**Expected**: `store(svara) U+0904 .. U+0914` parses to 17 `{kind:"char"}` items
U+0904…U+0914 in order; **no** `{kind:"raw", text:".."}` item present (FR-012).

## Scenario B — mixed range + singletons, source order (US1 / C4)

Parse `store(p) U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4`.
**Expected**: both range interiors fully expanded plus the two singletons, in
source order.

## Scenario C — SMP range no longer opaqued (US2 / C5)

```bash
pnpm --filter @keyboard-studio/engine test src/codec/parse.test.ts -t "smp range"
```
**Expected**: `store(ConsU) U+11680 .. U+11689` parses to 10 astral char items;
the store is **not** a `RawKmnFragment` with reason `smp-literal`.

## Scenario D — produced set includes the interior (US1 / C13, FR-011)

```bash
pnpm --filter @keyboard-studio/contracts test src/ir/producedSet.test.ts
```
**Expected**: for a keyboard with `store(rng) U+0904 .. U+0914` referenced by
`+ any(k) > index(rng,1)`, `buildProducedSet(ir)` contains all 17 codepoints.
Consumer code is **unchanged** — the test proves inheritance.

## Scenario E — degenerate forms fail safe (US3 / C7–C9)

```bash
pnpm --filter @keyboard-studio/engine test src/codec/parse.test.ts -t "degenerate range"
```
**Expected**:
- `U+0905 .. U+0905` → exactly one char item (lenient; see C7 note).
- `U+0910 .. U+0905` (descending) → store preserved opaque, reason `descending-range`.
- `U+0905 ..` / non-cp endpoint / multi-cp quoted endpoint → opaque, reason
  `malformed-range`. Never a wrong-direction or empty expansion.

## Scenario F — emit re-collapse + semantic round-trip (US2 / C11–C12, FR-008)

```bash
pnpm --filter @keyboard-studio/engine test src/codec/emit.test.ts -t "range collapse"
pnpm --filter @keyboard-studio/engine test src/codec/roundtrip.test.ts -t "range"
```
**Expected**: an expanded svara store re-emits as `store(svara) U+0904 .. U+0914`
(not a 17-char string / 17 tokens); an SMP run re-emits with quoted endpoints
(`'𑚀' .. '𑚉'`); an ascending run of length < 3 is left in the existing form.
`parse(emit(parse(src)))` yields an identical codepoint set.

## Scenario G — full codec + downstream suites stay green (SC-005)

```bash
pnpm --filter @keyboard-studio/engine test
pnpm --filter @keyboard-studio/contracts test
pnpm --filter @keymanapp/keyboard-lint test
```
**Expected**: all green; the criteria/count guards and existing round-trip vectors
unaffected.

## Scenario H — corpus round-trip over all 204 range lines (SC-006)

Run the codec parse→emit→re-parse over every range-store line in `../keyboards`.
**Expected**: identical codepoint set for all 204 lines; zero `{raw:".."}` items
across the corpus parse (SC-003).

## Scenario I — facet-index recovery + determinism (SC-002 / SC-004)

```bash
node utilities/facet-index/... --classified-only   # rebuild (see CLAUDE.md facet-index)
pnpm run facet-index-lint
```
**Expected**: `encoding` `undetermined` count drops from 46 and `casing` from 15
by the range-store-attributable amount (e.g. `takri_inscript` now carries
content-derived `casing`/`script`/`encoding`); no previously-classified keyboard
regresses to `undetermined`; two consecutive builds are byte-identical and the
lint stays green.

## Success-criteria mapping

| Scenario | Verifies |
|----------|----------|
| A, C | SC-001 (17 / 10 codepoints) |
| I | SC-002 (undetermined drop), SC-004 (determinism + lint) |
| A, H | SC-003 (zero `{raw:".."}`) |
| G | SC-005 (suites green + new coverage) |
| F, H | SC-006 (corpus round-trip) |
