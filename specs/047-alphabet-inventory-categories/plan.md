# Implementation Plan: Richer character-inventory breakdown on "Add your whole alphabet"

**Branch**: `047-alphabet-inventory-categories` | **Spec**: [spec.md](spec.md)

## Summary

On the Phase B build-list ("Add your whole alphabet") step the "Type your alphabet"
box must capture **every distinct character** an author types or pastes — not just the
first grapheme of each space-separated token — dropping only ordinary whitespace
(CR/LF/CRLF/Tab/space) and logging anything else unusual. The captured inventory is then
split, in the "How your alphabet breaks down" panel, into the existing Letters / Marks /
Accented-letters sections plus new **Numbers, Punctuation, Symbols, Separators, and
Control/other** sections, each character routed to exactly one section by its Unicode
General Category, each section ordered by the default (untailored) ICU collation
(`Intl.Collator` with no locale/tailoring), and empty sections hidden. The Letters section
collapses each case pair to its lowercase with a "Show uppercase letters" toggle; on
completion the recorded alphabet gains the locale-correct derived uppercase of every cased
letter. The "Your alphabet" chip list is narrowed to linguistic content (letters,
diacritics, letter+mark combos) only. Multi-code-point graphemes with no single composed
form (e.g. `Ə́` = U+018F U+0301) show a compact `U+018F+` chip label with the full stack on
hover.

The work is almost entirely within `@keyboard-studio/studio` (the SPA — Engine team). Every
Unicode primitive it needs is already exported from `@keyboard-studio/engine`
(`caseCounterpart`, `decomposeGrapheme`, `isCombiningMarkChar`, `isPrivateUseCodePoint`);
the only genuinely new pure primitive is a General-Category classifier, added to the
engine's `character-discovery` alongside those siblings. Category ordering uses the
platform `Intl.Collator` — no new dependency.

## Project Structure

```
packages/engine/src/character-discovery/
  glyphCategory.ts              # NEW — pure GC classifier (\p{L|N|P|S|Z|C}); sibling of decompose.ts
  glyphCategory.test.ts         # NEW — classification vectors
packages/engine/src/
  index.ts                      # export { glyphCategory, type GlyphCategory }

packages/studio/src/survey/
  PhaseB.tsx                    # CharChipEditor.add(): capture-every-char; AlphabetBreakdown: new sections + case toggle; Done: record derived uppercases
  charNormUtils.ts              # NEW: harvestChars() — grapheme-split minus the five skipped whitespace chars, with a logged "unusual char" list
  codepointLabel.ts             # NEW — compact "U+XXXX+" label + full-stack hover title (FR-014)
  collation.ts                  # NEW — shared default-ICU Intl.Collator comparator
  BuildListView.test.tsx        # extend: capture, categories, ordering, case toggle, Your-alphabet filter
packages/studio/src/stores/
  phaseBDraftStore.ts           # deriveStores(): route non-letters to new derived category arrays; add numbers/punctuation/symbols/separators/controls
  phaseBDraftStore.test.ts      # extend: category routing, no-double-count, additive chars/inventory invariants
```

**Structure Decision**: Single-package feature (studio SPA) plus one pure engine primitive.
The category split is computed once in `phaseBDraftStore.deriveStores()` (the existing single
derivation point) and read by the view; display-only concerns (ICU ordering, case-collapse
toggle, code-point labels) live in small studio helpers next to `PhaseB.tsx`.

## Constitution Check

| Article | Assessment |
|---|---|
| I. Pattern schema locked | **PASS** — no `Pattern`/`Criterion`/schema edit. The `ConfirmedAlphabet` contract is untouched; new category arrays are additive studio-store state, not contract fields (spec Assumption + FR-013). |
| II. KeyboardIR spine | **PASS** — no codec/IR involvement; this is survey-time inventory capture. |
| III. Single working copy | **PASS** — no working-copy or serialization change; operates on the Phase B draft only. |
| IV. Validator layering | **PASS** — no validator/debounce touch; category classification is synchronous UI derivation, not a second debounce path. |
| V. VirtualFS only | **PASS** — no host-disk or output-path change. |
| VI. Team boundaries | **PASS** — Engine team (owns the SPA + engine). One pure engine primitive + studio survey UI, both Engine-owned. |
| VII. Out of scope v1 | **PASS** — no CJK/Ethiopic reorder, LDML, mobile, touch-first, etc. Per-language tailored sort and digraph grouping are explicitly deferred by the spec. |
| VIII. House conventions | **PASS** — no console emoji; i18n message ids follow the `area.segment` rule; commit/PR titles use `feat(studio)`. |

No violations — Complexity Tracking omitted.

## Phase 0 — Research

See [research.md](research.md). Key decisions: where category classification is derived
(single store pass vs. view-only), how non-letters stay in the recorded inventory while
leaving the Letters section and "Your alphabet" list (FR-005/FR-011/FR-013 tension), the
ICU-collation mechanism, and the FR-014 label helper.

## Phase 1 — Design & contracts

- [data-model.md](data-model.md) — the derived category arrays on `PhaseBDraftState`, the
  case-pair display model, and the code-point label shape.
- [contracts/ui-contract.md](contracts/ui-contract.md) — the breakdown section identifiers,
  `data-testid`s, the toggle control, and the verbatim chip-label format the tests code
  against.

Post-design Constitution re-check: unchanged — still all PASS, no contract edits.
