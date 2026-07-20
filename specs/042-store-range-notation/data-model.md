# Phase 1 Data Model: KMN store range notation

**Feature**: 042-store-range-notation · **Date**: 2026-07-20

This feature introduces **no new IR type** and **no change to
`@keyboard-studio/contracts`** (IR option A). It reuses the existing store-item
model and adds behavior to the codec. This document records the entities in play,
the (unchanged) contracts they map to, and the expansion/collapse rules.

---

## Entities

### Range token (source construct — transient, never in the IR)

A source-level construct `<endpoint> .. <endpoint>` in a store body.

| Field | Type | Notes |
|-------|------|-------|
| `from` | codepoint | decoded from a `U+XXXX` token or a single-char quoted literal |
| `to` | codepoint | same forms as `from` |
| operator | literal `..` | whitespace-independent; may be standalone or embedded in an endpoint token |

Denotes the **inclusive ascending** codepoint set `[from, to]`. It exists only
during parsing; it is expanded immediately and **never** appears in the IR (no
`{kind:"range"}` variant — rejected in spec clarifications).

**Validity**:
- `from == to` → valid, expands to one codepoint.
- `from < to` → valid, expands to `to − from + 1` codepoints.
- `from > to` (descending) → **invalid** → fail-safe (see State transitions).
- missing / non-codepoint / multi-codepoint endpoint → **invalid** → fail-safe.

### Store item (IR — `StoreItem`, UNCHANGED)

Canonical type in `@keyboard-studio/contracts` (`keyboard-ir.ts`). A well-formed
range expands to a sequence of the existing `char` variant:

```ts
{ kind: "char"; value: string }   // value is a full codepoint string (BMP or astral)
```

No new variant, no field change. `value` already holds astral codepoints (the
`char` kind is what makes SMP range endpoints representable without a contracts
change — FR-010).

### RawKmnFragment (IR — UNCHANGED type, two new reason *values*)

A store containing a malformed/descending range is preserved whole as a
`RawKmnFragment` (existing type), exactly as SMP-literal / named-deadkey /
outs-expansion stores already are. The only addition is two new **reason
strings** in the engine-local `OPAQUE_REASONS` const (not a contracts type):

| New reason | Value | Emitted when |
|------------|-------|--------------|
| `DESCENDING_RANGE` | `"descending-range"` | a range's first endpoint > second |
| `MALFORMED_RANGE` | `"malformed-range"` | `..` with missing / non-codepoint / multi-cp endpoint |

### Produced set (consumer — `buildProducedSet`, UNCHANGED)

`Set<string>` of NFC codepoints. Not edited: once the store's `items` contain the
full expanded range, `expandStore` (already iterating `item.kind === "char"`)
folds every interior codepoint in automatically (FR-011). The primary beneficiary.

---

## Expansion rules (parse — `parseStoreItems`)

1. Tokenise the store body with the existing `splitTokens`.
2. Walk tokens. At each position, test for a **range** before the existing
   per-token branches (and **before** the `isSmpLiteral` early-bail):
   - a standalone `..` token with a decodable codepoint endpoint immediately
     before and after it, **or**
   - a single token containing an embedded `..` between two decodable endpoints
     (`U+0905..U+0910`), **or** the split-token hybrids (`U+0905..`, `..U+0910`).
3. Decode both endpoints (`U+XXXX` via `parseCodepoint`; single-char quoted via
   `unquote` + one-codepoint check).
4. Classify:
   - `from == to` → push one `{kind:"char"}`.
   - `from < to` → push `{kind:"char"}` for every codepoint `from..to` inclusive.
   - `from > to` → abandon item accumulation, return `{ items, opaqueReason:
     DESCENDING_RANGE }` (whole store goes opaque).
   - undecodable endpoint → return `{ items, opaqueReason: MALFORMED_RANGE }`.
5. Non-range tokens are handled by the existing branches unchanged (singletons
   interleave freely — FR-004).

**Invariant**: no well-formed range ever produces a `{kind:"raw", text:".."}`
item (FR-012 / SC-003).

## Collapse rules (emit — `emitStoreItems`)

1. Before the existing string-collapse pass, scan `items` left-to-right for a
   **maximal run** of `{kind:"char"}` items whose single codepoints ascend by
   exactly +1 (`cp[i+1] === cp[i] + 1`).
2. A run of length **≥ 3** collapses to `fmtCodepoint(first) .. fmtCodepoint(last)`,
   **except** a run whose codepoints are all printable ASCII (U+0020–U+007E),
   which is left for the existing string path — a quoted ASCII word (`'abc'`,
   `'A'..'Z'`) is more legible than a codepoint range and this preserves
   dictionary / `&word` stores (FR-008 "human-legible"; see contract C11a). The
   non-ASCII script ranges that motivate the feature still re-collapse.
   Runs of length < 3 are left for the existing string/token logic.
3. Chars not part of any ≥3 ascending run flow into the existing `buf`/`flushBuf`
   string-collapse path unchanged; non-char items break runs and emit as today.

**Invariant (SC-006)**: `parse(emit(parse(src)))` yields a store whose codepoint
set equals `parse(src)`'s — for all 204 corpus range lines.

---

## State transitions (a range in a store body)

```
                         ┌─────────────────────────────────────────────┐
   store body token(s) → │ range recogniser (parseStoreItems)           │
                         └─────────────────────────────────────────────┘
                                  │
        ┌─────────────────┬───────┴────────┬────────────────────┐
        ▼                 ▼                ▼                     ▼
   from == to        from < to        from > to           bad endpoint
        │                 │                │                     │
   1 char item     N char items     store → opaque       store → opaque
   (valid)          (valid)         reason=              reason=
                                    descending-range      malformed-range
```

Emit is the inverse for the two valid paths (≥3 ascending run → `X .. Y`); opaque
stores round-trip via their preserved `sourceText` as today.

---

## Contract impact summary

| Surface | Change |
|---------|--------|
| `@keyboard-studio/contracts` types / zod schemas | **NONE** (Article I gate green) |
| `StoreItem` union | **NONE** — reuses `{kind:"char"}` |
| `RawKmnFragment` type | **NONE** — two new reason *values* only |
| `OPAQUE_REASONS` (engine const) | +2 strings (additive) |
| `parseStoreItems` (parse.ts) | range detection + expansion |
| `emitStoreItems` (emit.ts) | ascending-run re-collapse |
| `buildProducedSet` + all consumers | **NONE** — inherit corrected set (FR-011) |
