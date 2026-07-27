# Data Model: Richer character-inventory breakdown

No persisted contract types change. The entities below are additive studio-store state and
pure display shapes; the `@keyboard-studio/contracts` `ConfirmedAlphabet` and the flat
`confirmedInventory` are untouched (FR-013, spec Assumption).

## GlyphCategory (engine, new)

```ts
type GlyphCategory =
  | "letter"        // \p{L}
  | "number"        // \p{N}
  | "punctuation"   // \p{P}
  | "symbol"        // \p{S}
  | "separator"     // \p{Z}
  | "control";      // \p{C}  (control/format/other, incl. unusual invisibles)
```

- **Total & exclusive over its domain**: the six values are the six Unicode top-level
  categories *other than* Marks (`\p{M}`). Marks and private-use characters are classified by
  the caller (`phaseBDraftStore`) *before* this function is consulted — marks → the Marks
  store, PUA → the designer's declared role — so on the intended (non-mark, non-PUA) domain
  `glyphCategory(char)` returns exactly one value.
- **Defensive fallback**: because `\p{L|N|P|S|Z|C}` is *not* total over all of Unicode (a bare
  combining mark matches none of the six), the implementation MUST still return a defined value
  for any input. Unmatched input (a `\p{M}` char that reaches the function) falls to `control`
  — the catch-all "other" bucket — so the function is total over *all* strings and never
  returns `undefined`. This branch is defensive only; correct callers never hit it.
- Routing to a breakdown section is 1:1 with this value, giving FR-005 (no double-count) by
  construction.

## PhaseBDraftState additions (studio store, derived)

Added to the existing `PhaseBDraftState`, populated by the single `deriveStores()` pass
alongside `bases` / `marks` / `attestedStacks`:

| Field | Type | Meaning |
|---|---|---|
| `numbers` | `string[]` | Captured `\p{N}` characters, deduped, first-appearance order. |
| `punctuation` | `string[]` | Captured `\p{P}` characters. |
| `symbols` | `string[]` | Captured `\p{S}` characters. |
| `separators` | `string[]` | Captured `\p{Z}` characters (incl. NBSP and other unusual separators). |
| `controls` | `string[]` | Captured `\p{C}` control/format/other characters that survived the whitespace skip-set. |

**Invariants**
- Each captured non-mark, non-PUA character appears in exactly one of `bases` (letters) /
  `numbers` / `punctuation` / `symbols` / `separators` / `controls`.
- `chars` (the flat legacy list) still contains **every** captured character across all
  categories — it is the complete inventory the recorded `confirmedInventory` is taken from.
- The five skipped whitespace characters (CR, LF, CRLF, Tab, U+0020) never enter any array
  (SC-006).
- Removing a pick recomputes every derived array from the surviving picks (no orphans).

## Case-pair display model (view state, not stored)

Derived per render in the Letters section via `caseCounterpart(letter, bcp47)`:

- **Display unit**: one entry per lowercase or caseless letter present in `bases`. A cased
  letter present **only in its uppercase form** (its lowercase was never entered) is *not*
  folded to a synthesized lowercase — it is shown as entered (the uppercase), consistent with
  FR-010 ("shown as entered, not folded away"). Only a lowercase that is actually present in
  `bases` collapses its uppercase counterpart under the toggle; the collapse never runs in the
  uppercase→lowercase direction on the display side.
- **`showUppercase` toggle** (local component state, default `false`): when on, each display
  unit whose `caseCounterpart` direction is `toUpper` additionally renders its uppercase
  counterpart chip.
- **Recorded-on-Done augmentation**: the alphabet passed to `onComplete` = the captured
  `chars` ∪ `{ caseCounterpart(c).counterpart | c ∈ chars, counterpart ≠ null }`, deduped.
  A `null` counterpart (caseless, or multi-character expansion) contributes nothing
  (FR-010).

## CodepointLabel (studio display shape, new)

```ts
interface CodepointLabel { label: string; title: string }
// single code point:  { label: "U+0061",  title: "U+0061" }
// multi code point:   { label: "U+018F+",  title: "U+018F U+0301" }
```

`label` is what the chip shows; `title` (hover / accessible description) lists every code
point space-separated. Applies to every chip that carries a code-point label in the alphabet
UI (the "Your alphabet" chips and the breakdown chips).
