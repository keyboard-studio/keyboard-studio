# Feature Specification: KMN store range notation (`X .. Y`)

**Feature Branch**: `041-construction-facet-classifiers` (rides the open spec 041 branch/PR #1190 at owner request — not its own branch)

**Created**: 2026-07-19

**Status**: Ready for planning (clarifications resolved 2026-07-19)

**Input**: User description: "we have to handle U+XXXX .. U+YYYY stores. open a new spec for this (include it in this branch)"

**Governing spec**: [spec.md](../../spec.md) §5a (KeyboardIR codec spine), §10 (validator layering). This feature is a **codec** enhancement — it changes how `packages/engine/src/codec` parses (and round-trips) a store body. It therefore deliberately steps **outside** spec 041's FR-043 "utilities-only, no `packages/*` change" guardrail, which is why it is its own numbered feature rather than a 041 follow-up commit.

---

## Context — why this exists

Keyman `.kmn` stores may express a contiguous run of codepoints with **range notation**: two codepoint literals separated by `..`, meaning the inclusive set of every codepoint from the first to the second.

```kmn
store(svara)   U+0904 .. U+0914          c 17 Devanagari vowels
store(d_digits) U+0966 .. U+096F          c Devanagari digits
store(LtrsU)   U+16EA0 .. U+16EB8 U+16EBB .. U+16ED3   c Bassa Vah (two ranges + gap)
store(punctuation) U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4  c ranges mixed with singletons
```

A range line may contain **multiple ranges**, **mix ranges with singleton tokens**, and use endpoints anywhere in Unicode (BMP or the astral/SMP planes). **53 keyboards / 204 store lines** in the `keymanapp/keyboards` corpus use this notation; a large share are historic-script keyboards whose entire output alphabet lives in a range store (Takri, Medefaidrin, Bassa Vah, Marchen, Sogdian, Imperial Aramaic, Pahlavi, Manichaean, Palmyrene, Ugaritic, Meroitic, …).

**The codec does not model range notation today**, in two distinct broken ways:

1. **BMP range → silent data loss.** `store(rng) U+0905 .. U+0910` parses to three store items — `{char:"अ"}`, `{raw:".."}`, `{char:"ऐ"}` — capturing only the two endpoints and the literal `..` token. The 10 interior codepoints are **dropped from the IR**. (Emit re-serialises this as `'अ' .. 'ऐ'`, which the compiler happens to read as a range again, so the loss is invisible to a compile-only check and only shows up in IR-consuming analysis.)
2. **SMP range → wholly opaque.** Because an endpoint above U+FFFF trips the codec's `smp-literal` guard, the **entire store** is discarded to a `RawKmnFragment` with zero items.

**Downstream blast radius.** `buildProducedSet` ([packages/contracts/src/ir/producedSet.ts](../../packages/contracts/src/ir/producedSet.ts)) is the single shared "what glyphs can this keyboard produce" utility, consumed by the §8 inventory diff (engine), the §18.6 coverage check (keyboard-lint), and the spec 041 construction classifiers (facet-index). For every range-store keyboard it under-counts (BMP: endpoints only) or empties (SMP: nothing) the produced set. Concretely, this is the root cause of the residual `undetermined` values the spec 041 recovery work traced but could not fix under FR-043: **46 keyboards** `undetermined` for the `encoding` facet and **15** for `casing` (and the same class distorts `script`), because their alphabet is defined entirely in SMP range stores.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Range store expands to its full codepoint set in the IR (Priority: P1)

A keyboard defines its output alphabet with a BMP range store (`store(svara) U+0904 .. U+0914`). Any engine subsystem that reads the parsed IR — produced-set extraction, inventory diff, coverage check, facet classification — sees **all 17 codepoints**, not just the two endpoints, and never sees a stray `..` token.

**Why this priority**: This is the correctness core. Range notation is a first-class Keyman feature; a codec that silently drops the interior of a range is producing a wrong model of the keyboard, and every consumer inherits the error. Fixing BMP ranges alone already repairs the produced-set for the BMP range-store keyboards and removes the `{raw:".."}` artifact class.

**Independent Test**: Parse a `.kmn` whose only store is `U+0904 .. U+0914`, referenced by a rule; assert the store resolves to exactly the 17 expected codepoints in order, with no `raw` item, and that `buildProducedSet` returns those 17 glyphs.

**Acceptance Scenarios**:

1. **Given** `store(svara) U+0904 .. U+0914`, **When** the keyboard is parsed, **Then** the `svara` store contains the 17 char items U+0904…U+0914 inclusive and no `raw` item.
2. **Given** a store line mixing a range and singletons `U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4`, **When** parsed, **Then** the store contains each range's full interior plus each singleton, in source order.
3. **Given** a rule `+ any(k) > index(rng,1)` where `rng` is a range store, **When** `buildProducedSet` runs, **Then** every codepoint in the range is present in the produced set.

---

### User Story 2 — SMP range stores are no longer discarded (Priority: P1)

A historic-script keyboard defines its alphabet entirely in an SMP range store (`store(ConsU) U+1168A .. U+116AA`). The keyboard's produced characters are recoverable from the IR, so `casing`, `script`, and `encoding` classify it from real content instead of falling through to `undetermined`.

**Why this priority**: Same priority as US1 because, for this corpus, it carries most of the *value* — the bulk of the affected keyboards are SMP historic scripts, and they are precisely the ones the spec 041 recovery could not reach. Without SMP range handling the 46-`encoding` / 15-`casing` residue is not meaningfully reduced. It is listed second only because US1 establishes the range-expansion mechanism that US2 extends to the astral planes.

**Independent Test**: Parse a `.kmn` whose alphabet store is `U+11680 .. U+11689` (SMP), referenced by a rule; assert the store resolves to the 10 SMP codepoints and that the produced set contains them; run the `casing`/`script`/`encoding` classifiers and assert a real value (not `undetermined`).

**Acceptance Scenarios**:

1. **Given** `store(rng) U+11680 .. U+11689`, **When** parsed, **Then** the store contains the 10 astral char items and the store is **not** discarded to an opaque fragment for the range reason alone.
2. **Given** the Takri keyboard (`takri_inscript`, alphabet in SMP range stores), **When** the facet index is rebuilt, **Then** its `casing`, `script`, and `encoding` facets carry content-derived values, not `undetermined`.
3. **Given** an SMP range store, **When** the IR is emitted and re-parsed, **Then** the store's codepoint set is preserved (round-trip is semantic-stable — see FR-008 / the round-trip decision).

---

### User Story 3 — Malformed and degenerate ranges fail safe, never silently (Priority: P2)

An authored or imported store contains a descending range (`U+0910 .. U+0905`), a single-codepoint "range" (`U+0905 .. U+0905`), or a `..` with a missing/non-codepoint endpoint. The codec's behaviour is defined and it never fabricates a wrong interior or crashes.

**Why this priority**: Correctness hardening. It is P2 because these forms are rare in the corpus, but a range parser that guesses on a malformed range would reintroduce silent-wrongness — the exact defect this feature removes.

**Independent Test**: Parse each degenerate form and assert the documented outcome (single-cp range → one item; descending or malformed → the documented fail-safe, e.g. preserved-opaque with a reason, not a silently-wrong expansion).

**Acceptance Scenarios**:

1. **Given** `U+0905 .. U+0905`, **When** parsed, **Then** the store contains exactly one char item U+0905.
2. **Given** a descending range `U+0910 .. U+0905`, **When** parsed, **Then** the codec does not emit an expanded interior in the wrong direction; it applies the documented fail-safe (see FR-006) and records why.
3. **Given** `U+0905 ..` with no closing endpoint, **When** parsed, **Then** the codec preserves the tokens without inventing a range and records an opaque/diagnostic reason rather than dropping data silently.

---

### Edge Cases

- **Multiple ranges + singletons on one line** (US1 scenario 2) — resolved in order, each independently expanded.
- **Range endpoints as quoted literals** (`'अ' .. 'ऐ'`) rather than `U+` notation — Keyman accepts quoted-char endpoints; the codec must recognise a range whether endpoints are `U+XXXX` or single-char quoted literals. (Note this is exactly what the current buggy emit produces, so ignoring it would break the codec's own round-trip.)
- **Whitespace variation** around `..` (`U+0905..U+0910`, `U+0905 ..U+0910`, `U+0905  ..  U+0910`) — all denote the same range.
- **Very large ranges** (e.g. a private-use `U+E000 .. U+E317`, ~800 codepoints; `U+16E00 .. U+16E40`) — expansion must stay bounded and deterministic; define a sane cap policy if one is needed (see FR-007).
- **Range straddling BMP↔SMP** (endpoints on opposite sides of U+FFFF) — a single valid range; must expand across the boundary.
- **Range in a system store** (`&…`) — out of scope for expansion semantics; system stores keep their existing handling.
- **Range appearing in rule context/output** rather than a store body — is that in scope? (see FR-009 / Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The codec MUST recognise the range operator `..` between two codepoint endpoints in a store body and expand it to the **inclusive** set of every codepoint from the first endpoint to the second, in ascending source order.
- **FR-002**: The codec MUST recognise range endpoints written as `U+XXXX` notation **and** as single-character quoted literals (`'x'` / `"x"`), in any combination.
- **FR-003**: The codec MUST tolerate arbitrary whitespace (including none) around the `..` operator.
- **FR-004**: A store line MUST support multiple ranges and ranges freely interleaved with singleton tokens; each token/range is resolved independently and the results concatenated in source order.
- **FR-005**: Range expansion MUST work for endpoints in the SMP/astral planes (> U+FFFF), and a store MUST NOT be discarded to an opaque `smp-literal` fragment **solely** because it contains an astral range. (Interaction with the broader SMP-opaque policy: see FR-010.)
- **FR-006**: A **descending** range (first endpoint > second), a `..` with a missing/non-codepoint endpoint, or any other malformed range MUST NOT be expanded in the wrong direction or as an empty set silently. **Resolved:** the codec preserves the affected store as an opaque `RawKmnFragment` with a recorded diagnostic reason (e.g. `descending-range`, `malformed-range`) rather than fabricating an interior. Exact kmcmplib behaviour for these forms is to be confirmed during `/speckit-plan`, but the codec-level contract is fail-safe-preserve, never silently-wrong.
- **FR-007**: Expansion MUST be bounded and deterministic for large ranges. **Resolved:** no arbitrary cardinality cap is imposed; the natural Unicode codepoint range is the ceiling. Expansion of a well-formed ascending range from `from` to `to` is inherently bounded (`to − from + 1` codepoints) and deterministic. Corpus max observed ≈ 800 cp (`U+E000 .. U+E317`), well within acceptable memory/perf.
- **FR-008**: The change MUST preserve the codec's round-trip contract for range stores at the level spec 041 requires (semantic round-trip; byte-identical is explicitly out of scope). Re-parsing emitted output MUST yield the same codepoint set. **Resolved (consequence of the IR = option A decision):** because ranges expand eagerly to individual char items in the IR, `emit` MUST **re-collapse** a contiguous ascending run of char items back to `X .. Y` notation so authored `.kmn` stays compact and human-legible. Emitting the fully-expanded literal list is not acceptable (it would bloat the round-tripped source), but the bar remains semantic round-trip: the re-parsed codepoint set is identical.
- **FR-009**: The feature's scope is **store bodies only**. **Resolved:** all 204 corpus range lines live in store bodies; range operators in rule context/output positions are **out of scope** for this feature and deferred to a follow-up should they be found to exist. This feature does not add range handling to rule-position parsing.
- **FR-010**: The feature MUST leave the existing `smp-literal` opaque handling correct for the constructs it legitimately covers, changing behaviour only for the range case. **Resolved:** the IR `{kind:"char"}` item already carries a full codepoint string and can hold an astral codepoint, so expanding an astral range into astral char items requires no new IR variant. Standalone astral `U+XXXXX` store items keep their existing opaque handling — lifting SMP-opaqueness is scoped **narrowly to the range case** and does not imply typing standalone astral singletons. Any broader astral-singleton work is orthogonal and out of scope here.
- **FR-011**: No consumer of `buildProducedSet` (engine inventory diff, keyboard-lint §18.6 coverage, facet-index classifiers) may require changes to benefit — the fix MUST land in the shared parse/IR path so all consumers inherit the corrected produced set.
- **FR-012**: The `{raw:".."}` store-item artifact produced by the current misparse MUST no longer be emitted for any well-formed range.

### Key Entities *(include if feature involves data)*

- **Range token** — a source construct `<endpoint> .. <endpoint>` where each endpoint is a codepoint literal (`U+XXXX` or a single quoted char). Denotes the inclusive ascending codepoint set between the endpoints.
- **Store item (IR)** — the parsed unit of a store body. **Resolved: option (A).** A range is expanded eagerly at parse time into individual `{kind:"char"}` items. **No contract change** to `packages/contracts` — no `@keyboard-studio/contracts` major bump and no joint engine+content session are required. Consumers (`buildProducedSet` and friends) see the expanded set with no changes on their side; compact, human-legible `.kmn` is preserved by `emit` re-collapsing contiguous ascending char runs back to `X .. Y` notation (FR-008). Option (B) — a preserved `{kind:"range", from, to}` variant — was considered and rejected: no downstream consumer needs to distinguish an authored range from an expanded list, so its locked-contract cost is not justified.
- **Produced set** — the existing `buildProducedSet` output; the primary beneficiary. Must reflect the full range interior once expansion lands.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A store `U+0904 .. U+0914` resolves to exactly 17 codepoints in the IR; a store `U+11680 .. U+11689` resolves to exactly 10 astral codepoints. (0 → full-interior, verifiable by unit test.)
- **SC-002**: After rebuild, the `encoding` facet's `undetermined` count drops from **46** and `casing` from **15** by the number attributable to range-store keyboards; no keyboard that was correctly classified before regresses to `undetermined`.
- **SC-003**: Zero `{kind:"raw", text:".."}` store items remain across the full corpus parse (down from the current non-zero count).
- **SC-004**: The facet-index build stays **deterministic** (two consecutive `--classified-only` builds are byte-identical) and `facet-index-lint` stays green.
- **SC-005**: The codec test suite and the engine/keyboard-lint suites stay green; new tests cover BMP range, SMP range, mixed range+singleton, quoted-endpoint range, and each degenerate form (US3).
- **SC-006**: Corpus round-trip (parse → emit → re-parse) yields an identical codepoint set for all 204 range-store lines.

## Assumptions

- Range notation semantics follow Keyman/kmcmplib: `X .. Y` is an inclusive, ascending run of codepoints; endpoints may be `U+` or quoted literals. The exact descending/degenerate behaviour is to be confirmed against kmcmplib during `/speckit-plan` (FR-006); the codec-level contract is fail-safe-preserve regardless.
- The feature rides the **existing** `041-construction-facet-classifiers` branch and PR #1190 per the owner's instruction; it is not given its own feature branch.
- Byte-identical round-trip remains out of scope (spec §16 / spec 041); the bar is **semantic** round-trip (same codepoint set).
- The recovery of the spec 041 `undetermined` facets (`encoding`, `casing`, `script`) is a **consequence** of this fix, not a separate work item — once the produced set is correct, the existing classifiers need no change (FR-011). Any classifier tweak still needed after expansion (e.g. `encoding` reading store-declaration spelling for store-driven rules like `adiga_danef`, which is a **non-range** char-literal case) is tracked separately under the 041 recovery, not here.

### Resolved clarifications (2026-07-19)

- **IR representation → option (A), eager expand.** Ranges expand to individual `{kind:"char"}` items at parse time. **No `@keyboard-studio/contracts` change, no major version bump, no joint engine+content session.** Emit re-collapses contiguous ascending char runs to `X .. Y` (FR-008). Option (B), a new `{kind:"range"}` store-item variant, was rejected — no consumer needs to distinguish an authored range from an expanded list.
- **Descending/malformed range → preserve opaque + diagnostic** (FR-006). The store is preserved as a `RawKmnFragment` with a recorded reason; never expanded wrong-direction, never silently emptied.
- **Scope → store bodies only** (FR-009). Range operators in rule context/output positions are out of scope and deferred.
- **Range cardinality → no arbitrary cap** (FR-007); the natural Unicode ceiling suffices. Corpus max ≈ 800 cp.
- **SMP handling scoped to the range case** (FR-010). Astral char items are fine (the `char` kind holds a full codepoint string); standalone astral singletons keep their existing opaque handling — no change there.
