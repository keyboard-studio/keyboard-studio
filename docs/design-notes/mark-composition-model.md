# Design Note — Mark Composition Model (Proposal)

> **Status: PROPOSAL / design note — not a spec change.** Captured from a
> design discussion (2026-07-21) about how the survey and engine should model
> diacritics: the mental-model question, the NFC/NFD decision, attachment
> constraints, and backspace behavior. Companion to the survey-flow-rework
> note (on `dev`, commit `30142ad5`) and issue #1293's 8-act flow; the Act 5
> "accented letters" card and the `nfc-posture-of-inventory` function should
> be built against this model, not against `pb_mark_style`'s current framing.

---

## The core separation: two axes, never one question

The PrimerPrep "Treat combining diacritics separately" checkbox conflates two
independent axes. Keyboard design must keep them apart:

1. **Mental model** (linguistic fact, per mark-class): is é a distinct letter
   of the alphabet, or e-plus-something (tone, length, nasalization)? Only
   the speech community can answer this. It drives the **input mechanism** —
   a dedicated key/slot for the unit letter, vs. a productive diacritic key
   (deadkey, postfix mark, touch diacritic row) that applies across bases.
2. **Output encoding** (Unicode fact, per base+mark pair): NFC precomposed
   vs. NFD combining sequence in the emitted text. For most pairs this is
   not a preference — either a precomposed form exists or it does not, and
   Unicode's normalization stability policy guarantees no new precomposed
   characters will ever be added (see langtechcameroon.info/composed-characters).

The axes cross freely: a typist can think "e, then tone mark" while the
keyboard emits NFC é; a language can treat ẹ́ as one letter while its output
is necessarily combining because no precomposed form exists. **Mental model
chooses the mechanism; a designer decision (informed by Unicode) chooses the
bytes.**

## Why NFD is the right default for never-composing orthographies

NFC works for European orthographies because *every* pair composes — such a
keyboard can be uniformly FC or FD. For orthographies with bases that never
compose (ə, ŋ, ɔ, ɛ …), preferring NFC produces a **mixed-encoding mark
system**: é is one codepoint, ə́ is two. That breaks:

- **Search** — one pattern cannot find every "e-family" letter.
- **Backspace symmetry** — deletes a whole letter here, a lone mark there;
  the inconsistency leaks the encoding to a user who should never need to
  know it exists.
- **Rule authoring** — `.kmn` context matching is literal bytes, so rules
  over "any vowel + tone mark" only generalize when the encoding is uniform.

NFD is the only form in which such orthographies are internally consistent.
Linguistic applications (e.g. FieldWorks) work decomposed internally for the
same reason, composing only for print. Interop caveats are real in the other
direction too — mainstream spellcheckers wrongly treat NFC "père" as correct
and NFD "père" as misspelled — which is why fully-composable orthographies
default to NFC.

## The uniformity invariant (monolingual keyboards)

**A monolingual keyboard — this app's target — is uniformly NFC or uniformly
NFD. Never a mix.** Mixed-encoding keyboards (e.g. `sil_cameroon_azerty`:
composed French + decomposed Cameroonian orthographies) are a product of
multilingual/country-scale scope, colonial heritage, and Unicode history —
supported reality upstream, out of scope as an output of this studio. A
monolingual keyboard derived from such a base is **transformed** to one
uniform form at instantiation.

Consequences:

- **The decision is designer-facing, defaults-first, end-user-invisible.**
  Proposed by a decision table (same conditional-house-target shape as
  `packages/engine/src/facet-transform/house-target-policy.ts`):
  1. Any base+mark pair in the confirmed inventory has no precomposed form →
     propose **NFD** for the whole keyboard, with the explanation chip
     stating why (consistent search + backspace for every accented letter).
  2. Every pair composes → propose **NFC** (interop with spellcheck/rendering).
  The designer can override either way once the repercussions are explained;
  the end user never sees the word "normalization".
- **Uniformity is checkable.** "Every mark-bearing output in the keyboard is
  in the declared normalization form" is a mechanical validator/criteria
  check over the IR — candidate new criteria row. The card proposes; the
  check proves.
- **The `nfc → nfd` migration decline needs revisiting.** The
  `nfd-to-nfc` facet-transform migration exists; its reverse was declined in
  v1 as unneeded cleanup. Under the uniformity invariant it becomes the
  transform Track 1 instantiation needs whenever the designer picks NFD over
  a base with composed outputs (the common case for a Cameroonian-language
  derivation from Cam AZERTY). Record as a consequence; do not silently
  implement.
- **No silent normalization.** Nothing in the codec/emit path may normalize
  IR bytes; normalization of IR is only legal through a consented
  facet-transform with an output-level diff. (Inventory-layer NFC
  normalization in `character-discovery` is fine — there NFC is a canonical
  dedup key for grapheme identity, and decomposition is always recoverable.)

## The attachment matrix

Country-scale and single-language keyboards differ not in mechanism but in
the **allowed mark × base matrix**:

- **Multilingual/country keyboard:** matrix open by necessity — a future
  orthography may attach any mark to any letter (what most know as a tone
  marker may be a newly-coined length marker on a consonant). Only safe
  blocks are category-level: no marks on punctuation or digits
  (`sil_cameroon_qwerty` goes exactly this far).
- **Single-language keyboard:** the orthography defines the matrix; the
  confirmed Act 3b inventory is the attested-pair list. Propose a tri-state
  per mark × base:
  - **attested** — in the confirmed alphabet;
  - **plausible** — mark-class heuristics (tone attaches to vowels and
    nasals; headroom for loanwords / the contact language);
  - **blocked** — everything else, including mutually-exclusive stacks.
  Default for single-language: block outside attested+plausible; the
  designer relaxes or tightens on the card. Blocking impossible
  combinations is preferred but is always the designer's call.

Open modeling question: represent mutual exclusivity **slot-based** (a mark
occupies a position — above / below / through; one occupant per slot, with
tone-contour stacking as a named exception) rather than as an N×N exclusion
list. Blocked-combination runtime behavior (swallow vs. feedback) is the A6
loudness axis, currently Phase-C-gated; blocking may pull a minimal A6
forward.

## Backspace: stepwise unwrap, both encodings

`sil_cameroon_qwerty` carries
`any(composed) + [K_BKSP] > index(comp-dia,1)` even though its own output is
combining-mark NFD — because the *document* may contain NFC text from any
source (paste, other keyboards, autocorrect), and context rules match the
actual buffer. The unwrap rule makes backspace uniform — **peel one mark at
a time** — over text of any provenance: ệ → ê → e → ∅.

Generation recipe (per the Cameroon keyboard's construction): enumerate all
valid combinations from the attachment matrix, NFC each full form, and pair
each composed form with its **one-mark-shorter predecessor** (not its bare
base). ệ and ê are distinct inputs with distinct outputs; backspace unwinds
the same path entry followed.

One computed per-pair table therefore feeds four consumers: the
`orth.mark-composition-posture` facet, the output-form proposal, the
stepwise unwrap stores, and the blocking rules. Build
`nfc-posture-of-inventory` (the facet's `planned` derivation) as that shared
pure function.

## Mechanism is per-platform

Mental model is per mark-class and platform-independent. **Mechanism is per
mark-class per platform**: physical entry may be deadkey/postfix/direct
while the touch overlay independently uses dedicated diacritic keys or a
diacritic row (touch can display anything — precedent: the Cameroon
QWERTY/AZERTY touch layouts). Act 5 decides physical; Act 7 proposes touch.

## Elicitation process (supersedes the earlier "ask early" placement)

Three candidate processes were weighed: (1) an up-front diacritics +
mental-model question before the alphabet — discarded (a blank question with
no signal, §3c violation; noise for no-diacritic languages); (2) pausing to
ask when the user first selects a composed character — discarded as the
question (modal, picker-only, one pause can't settle a per-mark-class
answer) but kept as pedagogy; (3) Paratext-style separate base and diacritic
lists with combinations locked down later — **adopted as the backbone**,
with one correction: entry must never *require* decomposed thinking, or the
UI forces the mental model instead of eliciting it.

**Storage is canonical and mental-model-free; the mental model is derived,
then confirmed.**

- **Stores:** `bases[]`, `marks[]`, and `attestedStacks[]` — ordered
  base+marks sequences (ệ = e + ◌̂ + ◌̣, order preserved), NFD-decomposed
  internally. The stacks list is required: two lists alone lose which
  combinations are real and lose stack order; the attachment matrix, unwrap
  stores, and posture computation all derive from the stacks.
- **Entry accepts any form and decomposes visibly.** Text-sample harvest
  decomposes silently into the stores. Picker/suggested-list picks are whole
  graphemes (the user picks é as é); the UI shows the consequence — picking
  é lights up **e** in Letters and **◌́** in Marks. That visible
  decomposition is the option-2 teaching moment without the modal
  interruption; no clarifying question fires.
- **Act 3b inventory screen:** three sections — Letters, Marks (on
  dotted-circle carriers), Accented letters (attested combinations).
  Deliberately neutral to the mental model: orthographic facts only,
  nothing decided yet.
- **PUA affordance:** no decomposition data exists, so the picker asks "add
  as a letter, or as a mark?" at pick time — the one unavoidable role
  question, asked concretely.
- **Combination lock-down as per-mark rows**, not an N×N grid: "◌́ appears
  on: a e i o u — anything else?" with attested pre-checked, plausible
  additions proposed by mark-class heuristics, everything else blocked by
  default (single-language). Grid view as power-user toggle. Attested pairs
  confirm at the tail of Act 3b (they are inventory facts); the blocking
  *policy* confirms on the Act 5 card.
- **The mental-model question fires only at Act 5, per mark-class, as a
  prefilled confirmation.** Prefill signals: productivity spread (mark on
  many bases → "separate"; one or two bases with NFC forms → "unit"), the
  base keyboard's own mechanism (deadkey vs. direct key), CLDR exemplar
  structure. The PrimerPrep "treat diacritics separately" toggle thereby
  disappears as a user-facing control — it becomes a derived per-mark-class
  value the user confirms, never a switch they must understand to set.
- **Act 5 card previews must show backspace behavior**, not just forward
  typing — backspace is where encoding leaks.
- Granularity: **per mark-class** default (quality accents vs. tone/length/
  nasalization) with per-pair exceptions — some combos combined, some
  separate, within one language.
- Edge cases on the radar: **mark×mark co-occurrence** (two lists constrain
  base×mark, not ◌̂+◌̣ stacking — attested stacks give the observed answer,
  the slot model the generalization) and **digraphs** (same unit-vs-sequence
  structure but two bases; they stay on their existing card, with
  deliberately parallel wording).

## The marks question series (alphabet picker → mechanism gallery seam)

The concrete elicitation sequence sitting between Act 3b (inventory
confirmed) and Act 6 (key placement). Six stations; a typical user sees two
or three. Everything prefilled; several stations computed and never
rendered. Existing control vocabulary
(`packages/studio/src/survey/types.ts`): text / short_text / autocomplete /
select / radio / bool / multi_select / notice.

- **S0 `marks_gate`** — computed, never rendered (like `pb_routing_branch`).
  `marks[]` empty → skip the whole series. Otherwise computes: proposed
  mark-classes (attachment-set similarity + Unicode semantics), per-pair
  NFC posture, attachment proposals, per-class mental-model prefill.
- **S1 `marks_attachment`** — one row per mark, multi_select over the
  user's letters. "Which letters can carry ◌́? We found it on these —
  check any others." Attested checked, plausible suggested, rest unchecked
  (= blocked). Help text states the blocking consequence plainly.
  Auto-confirm rule: a mark with one attested base and no plausible
  additions (cedilla-on-c) is a pre-confirmed summary row, not a question.
  Case pairs derived here (retires `pb_capitals_marks` as a question).
- **S2 `marks_mental_model`** — one radio per proposed class; the heart.
  "Look at these letters: á à é è ọ́. Is each its own letter of the
  alphabet — or a letter with a mark added (for example, to show tone)?"
  Options: own-letter (consequence: each combination gets its own key
  place) / letter-plus-mark (consequence: one mark key works with any
  letter) / mixed → per-mark split. Prefill signals: productivity spread,
  base keyboard's deadkey-vs-direct (import-mark-order machinery),
  and the **spare-key budget** — if combinations exceed spare keys,
  own-letter is unaffordable and the prefill explanation says so.
  Repercussions shown, theory never explained.
- **S3 `marks_input_order`** — today's `pb_mark_input_order`
  (prefix/postfix), relocated; asked only if ≥1 class is letter-plus-mark;
  prefilled from the base keyboard via
  `packages/engine/src/strategy-selector/import-mark-order.ts`.
- **S4 `marks_output_form`** — the NFC/NFD station, designer-framed, per
  the decision table. Unambiguous case → a notice with a change
  affordance, not a question ("stored as letter + mark, because ə́ has no
  single-character form — keeps search and backspace consistent").
  Open case (all pairs compose but a letter-plus-mark class exists) →
  radio, recommended option first, labels carrying concrete repercussions;
  the words "Unicode"/"normalization" never appear in the prompt. Preview
  must demonstrate backspace (ệ → ê → e).
- **S5 `marks_stacking`** — bool, asked only when evidence warrants
  (attested ≥2-mark stacks, or two marks sharing plausible bases): "Can
  one letter carry two marks at once (like ệ)?" Yes → confirm the attested
  stack list. Otherwise silently blocked.

**Exit state:** the mechanism gallery receives a typed worklist — own-letter
units (need placements), mark keys (need placement + S3 mechanism), blocked
combinations (generated rules). Touch is deliberately not asked here: the
per-class mental model carries to the touch-overlay act, which proposes the
diacritic-row rendering there, with its own confirm.

**Implementation notes:** (1) Dynamic content is mandatory — prompts
interpolate the user's glyphs, option lists come from the inventory; the
static FlowQuestion shape can't express S1/S2, so these are **cards**
(custom step components, per #1293 Act 5), specced here as question
semantics; an MVP can degrade to one static global mental-model radio with
per-class refinement deferred. (2) The series retires/absorbs:
`pb_accent_marks_gate` (S0), `pb_diacritic_select` (picker),
`pb_mark_style` (split into S2 + S4), `pb_capitals_marks` (S1),
`pb_stacking_marks` (S5); `pb_mark_input_order` survives as S3 — matching
the survey-flow-rework note's Act 5b accented-letters absorption list, so
this series is that card's specification.

## PUA characters

Non-Unicode keyboards are out of scope; **private-use-area characters are
in scope.** PUA codepoints are normalization-inert (NFC/NFD never touch
them — safe under the uniformity invariant) but property-blank: `\p{M}`
does not match them, so nothing about them can be derived from Unicode
data. Every classification this model relies on — mark vs. base, slot,
attachability — must be **designer-declared** on the inventory entry for
PUA characters. Concretely: inventory entries carry a declared role
field-set; classifiers read the declared role first and fall back to
Unicode properties, so the `\p{M}` test (e.g. in the `nfd-to-nfc`
migration) is never the sole classifier.

## Resulting data model (per confirmed inventory)

| Datum | Granularity | Decided by | Feeds |
|---|---|---|---|
| Mental model (unit vs. base+mark) | per mark-class | derived from inventory, user-confirmed at Act 5 | presentation, mechanism defaults |
| Attachment matrix (attested/plausible/blocked) | mark × base | designer (proposed from inventory + heuristics) | blocking rules, unwrap stores, valid-combination space |
| Output form (NFC or NFD, uniform) | per keyboard | designer (decision table proposes) | emit, uniformity check, migrations |
| Mechanism | per mark-class × platform | strategy selector (physical), touch seeder (touch) | Act 5 / Act 7 cards |
| Declared role (mark/base, slot) | per PUA entry | designer (required for PUA) | all classifiers |
| Unwrap + blocking rules | derived | generated, never hand-authored | emitted keyboard |

## Open questions

1. Slot-based mutual exclusivity — does one-mark-per-position (with a
   tone-contour exception) cover the real cases, or are pairwise exclusions
   needed?
2. Which component is "the new character picker" (not on this branch;
   presumably `dev`) — the grouping-mode change lands there.
3. When/whether to lift the `nfc → nfd` migration decline (consequence
   recorded above; needs its own decision).
4. Mental-model prefill heuristics need calibration against real
   orthographies (productivity-spread thresholds; weight of the base
   keyboard's deadkey-vs-direct signal) — a corpus/facet-index question
   once the Act 5 card exists.
