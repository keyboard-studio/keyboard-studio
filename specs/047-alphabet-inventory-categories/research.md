# Phase 0 Research: Richer character-inventory breakdown

All decisions below were resolved against the existing code so the plan carries no open
`NEEDS CLARIFICATION`.

## Decision 1 — Capture every character (FR-001/FR-002/FR-003)

**Decision**: Replace `CharChipEditor.add()`'s per-token "first grapheme" capture with a
whole-string grapheme harvest. Split the raw input into grapheme clusters (existing
`Intl.Segmenter` usage in `PhaseB.getFirstGrapheme`), drop **only** the five ordinary
whitespace characters — CR (U+000D), LF (U+000A), the CRLF pair, Tab (U+0009), and space
(U+0020) — and keep every other character, including unusual invisibles. Factor this into a
new pure `harvestChars(raw)` in `charNormUtils.ts` returning `{ chars, unusual }`, where
`unusual` lists retained separator/format/control characters so the caller can log them
(FR-003). NFC-normalize + dedup via the existing `nfcDedup`.

**Rationale**: `getFirstGrapheme` is exactly the "only the first character of each word"
behavior the spec targets. `Intl.Segmenter` is already used here, so grapheme-correct
splitting adds no dependency. Keeping the skip-set to five explicit code points (not
`\s`/`\p{Z}`) is required: `\s` would wrongly drop NBSP and other separators the spec says
to **keep and record**.

**Alternatives considered**: Split on `/\s+/` then take all tokens — rejected: still loses
characters that aren't separated by whitespace, and `\s` over-drops. Handling the paste in
the engine's `harvestFromText` — rejected: that path serves the separate `pb_text_sample`
question, not the build-list "Type your alphabet" box this spec targets.

## Decision 2 — Where the category split is derived, and how non-letters stay recorded (FR-004/FR-005/FR-011/FR-013)

**Decision**: Compute the category split **once** in `phaseBDraftStore.deriveStores()`, the
existing single derivation point, and add derived arrays `numbers`, `punctuation`, `symbols`,
`separators`, `controls` to `PhaseBDraftState`. Restrict the **Letters view** (and the three-
store `bases` the section renders from) to true letters (`\p{L}`); route each non-letter,
non-mark, non-PUA pick to its category array by General Category instead of into the Letters
section. Crucially, the flat `chars` array — and therefore `confirmedInventory` recorded on
Done — remains the **complete** captured inventory (letters *and* non-letters), so every
downstream consumer of the recorded alphabet keeps seeing everything (FR-013). The category
arrays are additive display state, never a new contract field.

**Rationale**: One derivation keeps the six display sections mutually exclusive by
construction (FR-005 — no double-count) and makes the store directly unit-testable. Leaving
`chars`/`confirmedInventory` complete honors the spec Assumption ("the new category groupings
are additive; no change to the confirmed-alphabet contract") and FR-013. PUA picks keep their
existing declared-role path (letter/mark) ahead of GC classification (FR spec edge case).

**Verification task**: confirm no downstream consumer relies on the three-store `bases`
containing digits/punctuation (it currently does, via the catch-all `pushBase`). If one does,
prefer the view-only variant below for that consumer rather than regressing it.

**Alternatives considered**: Derive categories view-only in `AlphabetBreakdown` from `chars`,
leaving the store untouched — rejected as the primary approach: it duplicates classification
away from the tested derivation and risks the Letters view and the store's `bases`
disagreeing. Adding the categories to the `ConfirmedAlphabet` contract — rejected: violates
the spec's "no confirmed-alphabet contract change" assumption and would trip Article I review.

## Decision 3 — Category classification primitive (FR-004/FR-005)

**Decision**: Add a pure `glyphCategory(char): GlyphCategory` to
`engine/src/character-discovery/glyphCategory.ts`, returning one of `letter | number |
punctuation | symbol | separator | control`, using native `\p{L}` / `\p{N}` / `\p{P}` /
`\p{S}` / `\p{Z}` / `\p{C}` escapes in that precedence, with marks (`\p{M}`) and PUA handled
by the caller ahead of it. Export from the engine index next to `decomposeGrapheme` /
`isCombiningMarkChar`.

**Rationale**: The engine already classifies characters exclusively via native `\p{…}`
escapes (`isCombiningMarkChar` = `/^\p{M}$/u`), needs no charnames/UCD table, and keeps all
Unicode-property logic in one package. A single total function over the six top-level
categories makes "exactly one section" a type-level guarantee.

**Alternatives considered**: A studio-local classifier — rejected: fragments Unicode-property
logic across packages when the engine is its established home. Using the generated charnames
JSON — rejected: unnecessary weight for a GC test the regex engine already does.

## Decision 4 — Default ICU ordering (FR-007)

**Decision**: Order each section with a shared `Intl.Collator(undefined, { usage: "sort" })`
comparator in a new `collation.ts`, invoked with no locale (root/default collation). Sort
each section's display array; do not reorder the stored `chars`/picks.

**Rationale**: `Intl.Collator` is the platform ICU binding — root collation places accented
letters adjacent to their base (SC-003) with no data or dependency. Sorting the *view* keeps
capture order (first-appearance) intact for the canonical stores and leaves the picker's
Unicode-value ordering untouched (FR-012).

**Alternatives considered**: Raw `String` / code-point sort — rejected: scatters accented
letters (the exact defect FR-007 fixes). A tailored per-language collator — rejected:
explicitly deferred by the spec.

## Decision 5 — Case-pair collapse + record-both-cases (FR-008/FR-009/FR-010)

**Decision**: Reuse the engine's existing `caseCounterpart(char, bcp47)`. In the Letters
view, show one chip per lowercase (or caseless) letter; a "Show uppercase letters" toggle
additionally renders the derived uppercase counterparts (display-only). On Done, augment the
recorded alphabet with each cased letter's counterpart before calling `onComplete`. Letters
whose counterpart is null (caseless scripts, multi-character expansions like ß→SS) are shown
and recorded as entered (FR-010).

**Rationale**: `caseCounterpart` already encodes every guard the spec asks for — single-code-
point only, locale-sensitive (Turkish dotted/dotless i, FR-009), null for caseless/expanding
cases — and is bidirectional. No new casing logic is written.

**Alternatives considered**: Raw `toUpperCase()` — rejected: wrong for Turkic locales and
lets multi-char expansions through, both of which the spec calls out.

## Decision 6 — Multi-code-point chip label (FR-014)

**Decision**: Add a studio-local `codepointLabel(grapheme): { label, title }`. A single-code-
point grapheme returns `{ label: "U+XXXX", title: "U+XXXX" }` (today's behavior). A
multi-code-point grapheme returns `{ label: "U+<first>+", title: "U+.. U+.. …" }`. Use it for
the `chipCodepoint` span and its `title`/`aria` in both `CharChipEditor` chips and
`AlphabetBreakdown` chips. Leave the contract util `toUPlusNotation` unchanged.

**Rationale**: `toUPlusNotation` is a locked contract util that reads only `codePointAt(0)`
and is called across the app; changing it risks unrelated call sites and FR-012. A thin
studio label helper localizes the new behavior to the alphabet UI where the spec scopes it.

**Alternatives considered**: Extend `toUPlusNotation` to render all code points — rejected:
broad blast radius on a locked util for a UI-label concern.
