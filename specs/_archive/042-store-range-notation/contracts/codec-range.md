# Codec contract: store-body range notation (`X .. Y`)

**Feature**: 042-store-range-notation · **Date**: 2026-07-20

The codec's "external interface" is its parse/emit behavior on `.kmn` source.
This is the behavioral contract for range notation in a **store body** — the
input→output pairs the implementation and tests must satisfy. Rule-position
ranges are out of scope (FR-009).

Notation below: `→ items[...]` is the resulting `IRStore.items`; `→ opaque(reason)`
means the whole store is preserved as a `RawKmnFragment` with that reason and
zero typed items.

---

## C1 — BMP range expands inclusive-ascending (FR-001, US1)

```
store(svara) U+0904 .. U+0914
→ items[ char U+0904, char U+0905, …, char U+0914 ]   (17 items, in order)
```
No `{kind:"raw", text:".."}` item is present (FR-012).

## C2 — Endpoint forms: U+ and single-char quoted, mixed (FR-002)

```
store(a) 'अ' .. 'ऐ'          → same 17 items as C1
store(b) U+0905 .. 'ऐ'       → char U+0905 … char U+0910  (mixed endpoints OK)
```

## C3 — Whitespace independence (FR-003)

All of the following parse (leniently) to the identical item list
`char U+0905 … char U+0910`:
```
U+0905 .. U+0910      ← the spaced form; the only shape the corpus uses
U+0905..U+0910        ← lenient-accept; NOTE kmcmplib itself rejects no-space
U+0905 ..U+0910          after a numeric endpoint (ERROR_InvalidValue), so these
U+0905.. U+0910          no-/partial-space numeric forms cannot occur in valid
U+0905  ..  U+0910       compiled corpus source — the codec accepts them for
```                    import-robustness; the Layer A oracle flags them if typed.
```
Quoted-endpoint no-space (`'अ'..'ऐ'`) is valid upstream and parses to the range.

## C4 — Multiple ranges + singletons, source order (FR-004)

```
store(p) U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4
→ items[ (U+0591..U+05AF), (U+05BD..U+05BF), char U+05C0, char U+05C4 ]  (in order)
```

## C5 — SMP / astral range no longer opaqued (FR-005, US2)

```
store(ConsU) U+11680 .. U+11689
→ items[ char U+11680, …, char U+11689 ]   (10 astral char items)
```
The store is **not** discarded to `opaque(smp-literal)` for the range reason.

## C6 — Range straddling BMP↔SMP (Edge Cases)

```
store(x) U+FFFE .. U+10001
→ items[ char U+FFFE, char U+FFFF, char U+10000, char U+10001 ]
```

## C7 — Single-codepoint range → one item (FR-006, US3-1)

```
store(x) U+0905 .. U+0905   → items[ char U+0905 ]   (exactly one item)
```
**Deliberately lenient** (user decision 2026-07-20): kmcmplib rejects equal
endpoints with `ERROR_ExpansionMustBePositive` (guard is `High <= Base`). The
codec follows spec US3-AS1 (one item) for import; the Layer A WASM oracle still
reports the kmcmplib compile error, so it is never silently treated as valid.

## C8 — Descending range fails safe (FR-006, US3-2)

```
store(x) U+0910 .. U+0905   → opaque(descending-range)
```
No wrong-direction interior; no empty expansion; store preserved with reason.

## C9 — Malformed range fails safe (FR-006, US3-3)

```
store(x) U+0905 ..          → opaque(malformed-range)   (missing endpoint)
store(x) U+0905 .. foo      → opaque(malformed-range)   (non-codepoint endpoint)
store(x) 'ab' .. U+0910     → opaque(malformed-range)   (multi-cp quoted endpoint)
```

## C10 — Standalone astral singletons UNCHANGED (FR-010)

A non-range astral literal keeps its existing handling:
```
store(x) U+11680            → opaque(smp-literal)   (unchanged; range logic not triggered)
```

## C11 — Emit re-collapses ascending runs ≥ 3 (FR-008)

```
items[ char U+0904 … char U+0914 ]   → emit → "store(svara) U+0904 .. U+0914"
items[ char U+11680 … char U+11689 ] → emit → "store(ConsU) '𑚀' .. '𑚉'"   (SMP endpoints quoted)
items[ char U+0905, char U+0906 ]    → emit → existing string/token form   (run < 3, not collapsed)
```

## C11a — all-printable-ASCII ascending runs are NOT re-collapsed (FR-008 legibility)

An ascending +1 run of length ≥ 3 whose codepoints are ALL printable ASCII
(U+0020–U+007E) is left for the existing string path rather than re-collapsed to
a range:
```
items[ char 'a', char 'b', char 'c' ]       → emit → "'abc'"          (NOT "U+0061 .. U+0063")
items[ char 'A' … char 'Z' ]                → emit → "'ABC…Z'"        (NOT "U+0041 .. U+005A")
```
Rationale: a quoted ASCII word is more human-legible than a codepoint range, and
this preserves dictionary / `&word` stores (`store(word) 'abc'` must not mangle to
codepoints). FR-008's bar is **semantic** round-trip, which the string form still
satisfies. The script ranges that motivate this feature (Devanagari, historic SMP
scripts, Hebrew accents — C1/C5/C11) are all non-ASCII and still re-collapse.

## C12 — Semantic round-trip stable (FR-008, SC-006)

For every store in C1–C7: `parse(emit(parse(src)))` yields an item list whose
codepoint set equals `parse(src)`'s. Byte-identical output is **not** required.

---

## Consumer contract (no consumer changes — FR-011)

## C13 — Produced set includes full interior

```
store(rng) U+0904 .. U+0914 ; rule: + any(k) > index(rng,1)
→ buildProducedSet(ir) contains all 17 codepoints U+0904..U+0914
```
`buildProducedSet` and every downstream consumer (engine inventory diff,
keyboard-lint §18.6 coverage, facet-index classifiers) inherit this with **no
code change**.
