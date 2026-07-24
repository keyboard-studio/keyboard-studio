# Carve's needed-set: threading marks-survey decisions into keep/remove (design note)

> Status: ratified by domain/keyman/strategy review, 2026-07-23. Captures the data
> contract that issue #1357 (carve-gallery selection UI) builds its interaction on
> top of. Not itself an implementation plan — see [specs/046-marks-question-series/](../specs/046-marks-question-series/)
> and [specs/049-lowercase-diacritic-questions/](../specs/049-lowercase-diacritic-questions/)
> for the series that produces the inputs this note consumes.

## 1. Problem

The carve gallery's keep/remove recommendations are driven off the flat
`confirmedInventory` set (see [packages/studio/src/lib/irToCarveNodes.ts](../packages/studio/src/lib/irToCarveNodes.ts),
`neededCharsForLanguage`/`confirmedInventory` union around line 1650). That set
unconditionally contains the bases, *all* composed base+mark combos, and *all*
lone marks the character-discovery step surfaced — regardless of how the author
answered the marks-question series (spec 046: attachment, mental model, input
order, output form, stacking). Carve therefore cannot tell a combo the author
actually needs from one that exists only because the base keyboard happened to
carry it, and it cannot use the marks-series "own-letter" vs. "letter-plus-mark"
mental-model answer (spec 049) at all. The result: carve's remove-candidates are
either too conservative (nothing looks removable) or, if naively tightened,
dangerously wrong — see Guards, §4.

## 2. The 3-tier model (ratified design)

Carve's needed-set is no longer a flat union; it is partitioned into three tiers
per base+mark pair (or bare mark), keyed off the marks-series mental-model answer
(`"own-letter" | "letter-plus-mark" | "mixed"` — see
[specs/046-marks-question-series/data-model.md](../specs/046-marks-question-series/data-model.md)):

| Tier | Own-letter class | Letter-plus-mark class | Removal candidate? |
|---|---|---|---|
| **REQUIRED-PRIMARY** | precomposed base+mark combo | bare mark + base (decomposed) | No — keep, never a removal candidate |
| **OPTIONAL-SECONDARY** | bare mark + base (decomposed) | precomposed base+mark combo | No — kept, surfaced as "not required by your choices", never auto-flagged |
| **BLOCK-CANDIDATE** | the specific `blockedCombinations` mapping (FR-021) | same | Yes — active remove-candidate, but only that mapping |

- **REQUIRED-PRIMARY.** For an author who thinks of the accented letter as its
  own unit ("own-letter"), the precomposed combo is what they need — carve keeps
  it and never offers it for removal. For an author who thinks of the mark as
  separable ("letter-plus-mark"), the bare mark and its bases are the
  required-primary units instead.
- **OPTIONAL-SECONDARY.** The *other* representation is not deleted — it is kept
  and labeled "not required by your choices" in the carve UI, but is **never**
  auto-flagged for removal. This is deliberate: legacy/font/edge routes still
  reach the secondary form — e.g. Vietnamese tone+diphthong combinations that
  round-trip through legacy NFC, or Devanagari nukta forms that belong to more
  than one conjunct family. Auto-removing the secondary tier would silently
  break those routes.
- **BLOCK-CANDIDATE.** `blockedCombinations` (spec 046 FR-021 — "must never be
  reachable by any ordinary key sequence") is the *only* tier carve treats as an
  active removal candidate. Even here, carve removes only the specific
  base×mark mapping the author blocked — never the shared rule machinery, the
  deadkey trigger, or any fan-out rule the mapping shares with a kept
  combination (see Guards, §4).
- **Multi-mark stacks.** For `attestedStacks` with two or more marks
  (spec 046's `AttestedStack` shape), the fully composed form is
  required-primary whenever the author is in the own-letter class for that
  stack, and the marks-series' confirmed stacking order is preserved in the
  produced worklist — carve does not re-derive or re-order it.

## 3. Contract change

`marksOutputForm` (`"ready-made" | "base-plus-mark"` — the per-keyboard output-form
decision already modeled in
[specs/046-marks-question-series/data-model.md](../specs/046-marks-question-series/data-model.md)
§`OutputFormDecision`) becomes an **additive, optional** field threaded from the
marks question series onto the survey session, so carve can resolve which
concrete grapheme — NFC precomposed vs. NFD/decomposed base+mark — is "the
precomposed combo" for a given pair. This is a non-breaking addition to the
session shape (no existing field renamed or removed); consumers that do not read
it see the same flat behavior carve has today.

## 4. Guards (why the removal direction is dangerous)

Productive marks are usually implemented as deadkey fan-outs that *emit*
precomposed characters. That means a single precomposed-combo rule can be the
**only** realization of a needed letter in the IR — there may be no separate
"bare mark" rule to fall back on. Tiering (keep-as-optional rather than delete)
exists specifically to avoid the naive read of "the author didn't check this
combo, so remove it":

- **Deadkey-orphan guard.** Never delete a rule that is the sole producer of a
  required-primary character, even if the specific base+mark pairing feeding it
  looks unused in isolation.
- **Fan-out-shared-rule guard.** A `blockedCombinations` removal touches only
  the mapping the author explicitly blocked — never the deadkey trigger, the
  group, or any rule the blocked mapping shares with a kept combination. Carve
  must not walk "up" from a blocked pair into shared rule machinery and delete
  it wholesale.

## 5. Relationship to #1357

This design produces the **data** — the 3-tier classification and the
`marksOutputForm` contract addition — that the carve gallery consumes. Issue
#1357 (Jordan) builds the **interaction UI** (selection affordances, the
"not required by your choices" surfacing, the block-candidate removal flow) on
top of this data contract and lands after it. The two are sequential, not
overlapping: this note defines what carve knows; #1357 defines how the author
acts on it.
