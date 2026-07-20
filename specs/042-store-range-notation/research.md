# Phase 0 Research: KMN store range notation

**Feature**: 042-store-range-notation · **Date**: 2026-07-20

This feature entered planning with all *product* clarifications already resolved
(see spec.md "Resolved clarifications (2026-07-19)"). Phase 0 therefore records
the **engineering** decisions that follow from those resolutions, plus the one
outstanding factual confirmation flagged for `/speckit-plan`: kmcmplib's exact
behavior on descending/degenerate ranges (FR-006).

---

## Decision 1 — Range detection lives in `parseStoreItems`, before the SMP bail

**Decision**: Detect the `..` operator inside `parseStoreItems`
([parse.ts:245](../../packages/engine/src/codec/parse.ts)) by scanning the token
list (`splitTokens` already emits `..` as its own bare token and each endpoint as
a separate token). When a `<endpoint> .. <endpoint>` triple is found, expand it to
the inclusive ascending run of `{kind:"char"}` items. The range check MUST run
**before** the current `if (isSmpLiteral(tok)) return { opaqueReason: SMP_LITERAL }`
early-return, otherwise an astral endpoint (`U+11680`) bails the whole store to an
opaque fragment before range logic ever sees it (this is exactly the current SMP
bug, FR-005).

**Rationale**: `splitTokens` is line-based and already produces the exact token
shape we need (`["U+0905", "..", "U+0910"]`). The tokenizer needs no change. The
endpoint decoder `parseCodepoint` already accepts 4–6 hex digits and returns a
full codepoint string for astral values (it only rejects > U+10FFFF), so astral
endpoints decode correctly once the `isSmpLiteral` guard no longer short-circuits.

**Alternatives considered**:
- *Handle `..` in the tokenizer* — rejected: the tokenizer is line-oriented and
  store-agnostic; range semantics are a store-body concern and belong with the
  other store-item classification in `parseStoreItems`.
- *A post-parse IR pass* — rejected: would re-walk the IR and re-introduce the
  `{raw:".."}` artifact class transiently; expanding at the point of tokenisation
  keeps the IR clean by construction (FR-012).

---

## Decision 2 — Endpoint forms: `U+XXXX` and single-char quoted literals

**Decision**: Accept an endpoint that is either a `U+XXXX` token (via
`parseCodepoint`) **or** a single-character quoted literal (`'x'` / `"x"`, via
`isQuoted`/`unquote`, requiring the unquoted content to be exactly one codepoint).
Mixed endpoints (`U+0905 .. 'ऐ'`) are permitted (FR-002).

**Rationale**: Keyman accepts quoted-char endpoints, and — critically — the codec's
*own current buggy emit* already re-serialises the endpoints as quoted literals
(`'अ' .. 'ऐ'`), so a parser that only understood `U+` endpoints would fail to
re-parse the codec's own output and break round-trip (spec Edge Cases). A quoted
endpoint whose content is not exactly one codepoint is **not** a valid range
endpoint → falls through to the malformed-range fail-safe (Decision 5).

**kmcmplib note**: `process_expansion` decodes whatever codepoint the endpoint
literal resolves to, so bare hex (`xHH`) and decimal (`dNN`) endpoints are also
legal upstream. They are vanishingly rare in the corpus; the codec's endpoint
decoder covers `U+XXXX` and quoted forms (the two the corpus uses) and lets any
other endpoint form fall to the malformed-range fail-safe rather than guess.

---

## Decision 3 — Whitespace independence

**Decision**: Treat `U+0905..U+0910`, `U+0905 ..U+0910`, `U+0905 .. U+0910`, and
`U+0905  ..  U+0910` as the same range (FR-003).

**Engineering note**: `splitTokens` splits on whitespace, so `U+0905 .. U+0910`
already yields three tokens (the corpus's overwhelmingly common form). The
no-whitespace form `U+0905..U+0910` would arrive as a **single** token; the
hybrids (`U+0905..`, `..U+0910`) as split tokens. The recogniser therefore also
splits a token internally on an embedded `..` between two decodable endpoints, so
all spacings resolve to the same range (FR-003).

**kmcmplib reality (confirmed) — corrects "including none" for numeric endpoints**:
kmcmplib's `GetXStringImpl` enforces `if (*p != '\0' && !iswspace(*p)) return
ERROR_InvalidValue` immediately after a numeric (`U+`/`x`/`d`) endpoint literal
(`Compiler.cpp:2446,2207`), **before** the `..` dispatch. So `U+0905..U+0910`
with **no space** after a numeric endpoint is a *compile error* upstream — it
cannot occur in valid compiled corpus source. A space is only optional for quoted
endpoints (`'x'..'z'`, no trailing-whitespace check). The two dots must be
adjacent (`. .` is not a range). **Consequence**: keeping the codec lenient on the
no-space numeric form (FR-003 "including none") is harmless import-robustness —
the form never appears in real corpus source, and if a studio author types it the
Layer A WASM oracle reports `ERROR_InvalidValue`. The codec neither depends on nor
forbids it; it simply resolves whatever spelling it is handed.

---

## Decision 4 — Multiple ranges + singletons, resolved in source order

**Decision**: A store line may contain any interleaving of ranges and singleton
tokens; each is resolved independently and results concatenated in source order
(FR-004). Implementation: the `parseStoreItems` loop consumes a range as a
3-token (or split-token) unit and pushes its expanded chars, then continues; a
singleton token is handled by the existing per-token branches unchanged.

**Rationale**: Matches the corpus (`U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4`
— two ranges + three singletons) and keeps the existing item-ordering contract.

---

## Decision 5 — Fail-safe for descending / degenerate ranges (FR-006)

**Decision (codec-level, now cross-checked against kmcmplib)**:
- **Single-codepoint range** (`U+0905 .. U+0905`, from == to) → expand to exactly
  **one** char item. **User decision 2026-07-20**: follow spec US3-AS1 (lenient
  one item), *not* kmcmplib. kmcmplib actually rejects equal endpoints with
  `ERROR_ExpansionMustBePositive` (the guard is `HighChar <= BaseChar`,
  `Compiler.cpp:3002-3003`), so such source never compiles and cannot appear in
  valid corpus; if a studio author types it, the Layer A WASM oracle surfaces the
  compile error. The codec is intentionally more permissive than the compiler
  here — never silently wrong (the oracle covers the invalidity).
- **Descending range** (from > to) → do **not** expand; preserve the whole store
  as a `RawKmnFragment` with reason `descending-range`. This is the faithful
  mirror of kmcmplib's `ERROR_ExpansionMustBePositive` ("An expansion must have
  positive difference (i.e. A-Z, not Z-A)").
- **Malformed range** (missing endpoint `U+0905 ..`, non-codepoint endpoint,
  multi-codepoint quoted endpoint, or `..` with no preceding token) → preserve the
  whole store as a `RawKmnFragment` with reason `malformed-range`. Mirrors
  kmcmplib's `ERROR_CharacterExpansionMustBeFollowedByCharacter` /
  `ERROR_ExpansionMustFollowCharacterOrVKey`.

Two new strings are added to `OPAQUE_REASONS`
([opaque-reasons.ts](../../packages/engine/src/codec/opaque-reasons.ts)):
`DESCENDING_RANGE = "descending-range"`, `MALFORMED_RANGE = "malformed-range"`.
This is additive (Article I: no locked-type change — the enum is an engine-local
const, not a `packages/contracts` type).

**Rationale**: A range parser that guesses on a malformed range reintroduces the
silent-wrongness this feature removes. Preserve-opaque-with-reason is the codec's
established pattern for "can't model faithfully" (SMP literal, named deadkey,
outs-expansion all do exactly this) and surfaces the construct in the carve
gallery rather than dropping it. For the two hard-invalid forms (descending,
malformed) the fail-safe is also the faithful mirror of what kmcmplib itself
rejects; for the equal-endpoint edge the codec is deliberately lenient per the
user's spec-fidelity choice, with the WASM oracle as the safety net.

**kmcmplib source** (sibling `../keyman` checkout — confirm the `fetch-kmcmplib`
pin matches these line numbers, `Compiler.cpp` is large and shifts): dispatch
`Compiler.cpp:2752-2757`; `process_expansion` `Compiler.cpp:2925-3027`; positive-
difference guard `:3002-3003`; missing-endpoint guards `:2931-2933,2963-2964`;
error codes in `common/include/kmn_compiler_errors.h:176-200`; message text
`developer/docs/help/reference/messages/km02064–02078.md`.

---

## Decision 6 — Emit re-collapse of contiguous ascending runs (FR-008)

**Decision**: `emitStoreItems`
([emit.ts:206](../../packages/engine/src/codec/emit.ts)) MUST re-collapse a
contiguous run of `{kind:"char"}` items whose codepoints ascend by exactly +1
back to `first .. last` notation, so an expanded 17-item svara store re-emits as
`U+0904 .. U+0914`, not a 17-char quoted string or 17 individual tokens.

**Threshold**: only collapse runs of length **≥ 3** (a 2-item ascending pair
`U+0905 U+0906` is clearer left as two tokens / a 2-char string than as
`U+0905 .. U+0906`). Runs below threshold fall through to the **existing**
string-collapse / per-token logic unchanged.

**Interaction with existing collapse**: the range-collapse pass runs *first* over
the char items; any char not consumed by a range run flows into the existing
`buf`/`flushBuf` string-collapse path exactly as today. SMP chars (which
`isStringSafeChar` already excludes from string buffers and emits as individual
`'𑚀'` tokens) are collapsible into a range (`'𑚀' .. '𑚫'`) — this is the primary
legibility win for the SMP historic-script keyboards.

**Rationale**: FR-008 is explicit that emitting the fully-expanded literal list is
*not acceptable* (source bloat), while the correctness bar is only **semantic**
round-trip. Re-collapse keeps authored `.kmn` compact and human-legible and makes
the parse→emit→re-parse codepoint set identical (SC-006). Endpoint spelling on
emit: reuse `fmtCodepoint` (BMP → `U+XXXX`, SMP → `'𑚀'`), matching the endpoint
forms the parser accepts (Decision 2), so re-collapsed output re-parses cleanly.

**Determinism (SC-004)**: run-detection is a deterministic left-to-right scan;
two consecutive `--classified-only` facet-index builds stay byte-identical.

---

## Decision 7 — No cardinality cap (FR-007)

**Decision**: Impose no arbitrary *codec* cap. A well-formed ascending range from
`from` to `to` is inherently bounded (`to − from + 1` codepoints) and
deterministic. Corpus max ≈ 800 cp (`U+E000 .. U+E317`); memory/perf impact
negligible. The natural Unicode ceiling (endpoints already rejected above
U+10FFFF by `parseCodepoint`) is the only bound.

**kmcmplib note**: kmcmplib *does* have a buffer cap —
`ERROR_CharacterRangeTooLong` ("Character range is too large and cannot be
expanded", `Compiler.cpp:3011/3018`) — so an over-large range is a compile error
upstream, not silent truncation. Corpus max (~800) is far below it, so no codec
cap is needed; a pathologically large hand-authored range would be caught by the
Layer A oracle. The codec never silently truncates (it expands the full interior
or, for the invalid forms, fails safe).

---

## Decision 8 — Scope: store bodies only (FR-009)

**Decision**: Range handling is added to `parseStoreItems` only. Rule
context/output element parsers (`parseContextElements`, `parseOutputElementsCore`)
are **not** taught `..`. All 204 corpus range lines live in store bodies; range
operators in rule positions are out of scope and deferred. A `..` appearing in a
rule position continues to fall to its existing `{kind:"raw"}` handling (no
regression, no new behavior).

**kmcmplib reality — this is a product-scope decision, not a compiler constraint**:
kmcmplib's `GetXString`/`GetXStringImpl` (the very function that dispatches `..`)
is the *shared* lexer for store bodies, rule context/match, rule key, rule output,
and `if()`/`set()`/`baselayout()`/`platform()` arguments alike (`Compiler.cpp:811,
1732,1735,1748,1753,2805,2880,3035,3107`). So `..` is syntactically legal in rule
positions too — kmcmplib imposes **no** store-body restriction. FR-009's
store-body-only scope is a keyboard-studio v1 decision (that is where all 204
corpus lines are), **not** something the compiler enforces. Corollary: if the
codec ever wants to reject `..` outside store bodies, that would be an *invented*
Layer B style check, not a Layer A kmcmplib-fidelity check — do not cite a
kmcmplib line for it, there isn't one.

---

## kmcmplib range semantics — CONFIRMED (FR-006)

Confirmed by `km-keyman` against `../keyman/developer/src/kmcmplib/src/Compiler.cpp`
(`process_expansion`) on 2026-07-20. Findings, and how each lands in the design:

| kmcmplib behavior | Source | Codec response |
|-------------------|--------|----------------|
| `..` → inclusive ascending run, one cp per position | `Compiler.cpp:2925-3027` | expand to `{kind:"char"}` items (Decision 1) — **confirms** the core semantics |
| endpoints: `U+XXXX`, quoted char, also bare hex/dec | `:2206-2212,2224-2232,2440-2456` | decode `U+`+quoted (corpus forms); other → malformed fail-safe (Decision 2) |
| **space mandatory** after numeric endpoint before `..` | `:2446,2207` (`ERROR_InvalidValue`) | codec stays lenient (form can't occur in valid corpus); oracle covers it (Decision 3) |
| **descending** (`from > to`) → `ERROR_ExpansionMustBePositive` | `:3002-3003` | preserve-opaque `descending-range` — faithful mirror (Decision 5) |
| **equal endpoints** → same `ERROR_ExpansionMustBePositive` (`<=`) | `:3002-3003` | **diverge:** lenient one item per user's spec-fidelity choice; oracle reports the error (Decision 5) |
| missing/absent 2nd endpoint → `ERROR_Character…MustBeFollowedByCharacter` | `:2931-2933,2963-2964` | preserve-opaque `malformed-range` — mirror (Decision 5) |
| over-large range → `ERROR_CharacterRangeTooLong` | `:3011,3018` | no codec cap needed (corpus max ~800); oracle covers pathological input (Decision 7) |
| `..` is legal in rule positions too (shared lexer) | `:811,1732-1753,…` | store-body-only is a **product** scope, not a compiler rule (Decision 8) |

**Net**: the resolved codec contract is fully consistent with kmcmplib for every
form except the deliberately-lenient equal-endpoint edge, which the Layer A oracle
backstops.

---

## Summary of resolved unknowns

| Question | Resolution | Source |
|----------|-----------|--------|
| IR representation | Option A — eager expand to `{kind:"char"}`; no contracts change | spec clarifications; Decision 1 |
| Endpoint forms | `U+XXXX` and single-char quoted; mixed OK | FR-002; Decision 2 |
| Whitespace | All spacings incl. none; recogniser splits embedded `..` | FR-003; Decision 3 |
| Multiple/mixed | Independent resolve, source order | FR-004; Decision 4 |
| Descending/malformed | Preserve-opaque + `descending-range`/`malformed-range` (mirrors kmcmplib) | FR-006; Decision 5 |
| Equal endpoints | Lenient one item (user 2026-07-20); kmcmplib errors, oracle backstops | FR-006; Decision 5 |
| Emit compactness | Re-collapse ascending runs (len ≥ 3) to `X .. Y` | FR-008; Decision 6 |
| Cardinality cap | None in codec; kmcmplib caps via `ERROR_CharacterRangeTooLong` | FR-007; Decision 7 |
| Scope | Store bodies only (product decision, not a kmcmplib rule) | FR-009; Decision 8 |
| SMP handling | Range case only; astral `char` items already legal | FR-010; Decision 1 |
| kmcmplib exact behavior | **CONFIRMED** 2026-07-20 (km-keyman); contract consistent | FR-006 |
