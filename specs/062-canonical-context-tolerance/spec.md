# Feature Specification: Canonical-equivalence context tolerance

**Feature Branch**: `062-canonical-context-tolerance`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Keyboards typically output NFC or NFD, and as a result they tend to expect the context side of the rule to be predictably composed. In `sil_yoruba8`, `x` creates a composed `ọ` and subsequently typing `]` is supposed to take the input and output `ọ́` (`ọ` plus U+0301). Programs often compose and decompose freely. FieldWorks stores working data as decomposed but exports as composed; old versions did this lazily on save, so a recently typed text was in the keyboard's output format until saved, but FLEx now decomposes immediately. This breaks the Keyman rule that expects `ọ` and finds `o` plus the combining dot below. Unicode's decree is that software should handle composed and decomposed the same, but across the board this is not true. Spellcheckers often mark differently-composed words wrong. The user should never need to know whether a text is composed or decomposed; the keyboard should handle it. This is why `sil_cameroon_qwerty` has the backspacing rules so that composed characters get backspaced in the same order as decomposed ones. How might we consistently fix keyboards like `sil_yoruba8` running through Keyboard Studio so composed and decomposed context are handled transparently?"

**Governing context**: [spec.md](../../spec.md) §10 (validator layering — where a new check may and may not live) and §9 (reorder posture and the auto-emitted normalization `group(reorder)` cascade). The mark model this feature extends is
[docs/design-notes/mark-composition-model.md](../../docs/design-notes/mark-composition-model.md) — specifically the uniformity invariant, the per-pair table generator, and the stepwise-unwrap recipe. This spec does not re-derive that model; it names its missing second half and adds one consumer. The engine-side alternative is analysed in [research.md](research.md) and is **out of scope here** — it is not ours to ship.

## Why this exists

A `.kmn` rule matches its context **byte-exactly**. Canonical equivalence is not
a thing Keyman knows about. So a rule written against a precomposed character
stops firing the moment the host application decomposes the buffer, and a rule
written against a decomposed sequence stops firing the moment something composes
it. Neither the author nor the end user has any way to see this coming.

Host applications compose and decompose on their own schedule. FieldWorks stores
working data decomposed and composes only for export; it used to do this lazily
at save, so freshly typed text still held whatever form the keyboard emitted, and
the mismatch only showed up after a save. FLEx now decomposes on entry, so inside
FLEx the mismatch is the *normal* state rather than an occasional one. Paste,
autocorrect, a second keyboard, and a sync round-trip all do the same thing.

The consequence is worse than a dead key, because keyboards usually have a
fallback rule for the unaccompanied accent key. In
`../keyboards/release/sil/sil_yoruba8` the acute key falls through to
`+ ']' > '´'`, so decomposed `a` + U+0301 followed by `]` silently produces a
**spacing acute** rather than toggling the accent. The author sees a plausible
character, not an error.

`../keyboards/release/sil/sil_cameroon_qwerty` already solves the mirror-image
problem. It emits decomposed output, yet carries a 236-entry
`composed` → `comp-dia` table so that a *precomposed* character arriving from
anywhere backspaces one diacritic at a time, exactly as a decomposed sequence
would. That keyboard is proof the problem is solvable in `.kmn` today, and proof
that solving it by hand does not scale: 236 hand-aligned characters in two
parallel stores, maintained by eye.

The principle this feature encodes: **an author should never have to know, and a
user should never have to care, which normalization form the buffer is in.**

### The invariant this feature names

The mark model already asserts that a monolingual keyboard is uniformly NFC or
uniformly NFD ([mark-composition-model.md](../../docs/design-notes/mark-composition-model.md)
"The uniformity invariant"), and separately observes that `sil_cameroon_qwerty`
carries composed-form context rules despite decomposed output *"because the
document may contain NFC text from any source (paste, other keyboards,
autocorrect), and context rules match the actual buffer."*

Those are two invariants, and only the first has a name. This spec names the
second:

> **Output is uniform. Context is tolerant.**
> A keyboard emits exactly one normalization form. It *matches* the whole
> canonical equivalence class of its context.

They are not in tension. Uniformity is what makes the keyboard's own output
predictable to search, spellcheck, rendering and backspace. Tolerance is what
lets it survive a buffer it did not author. Stating only the first is what makes
context tolerance look like a violation instead of the other half of the rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diacritic keys work on text the host has decomposed (Priority: P1)

As a keyboard author whose users type into FieldWorks, I want the accent keys on
the keyboard I produce to work on text that FLEx has already decomposed, so my
users get `ọ́` whether the buffer holds a precomposed `ọ` or an `o` followed by a
combining dot below — and never a stray spacing accent.

**Why this priority**: This is the reported defect and the entire point of the
feature. It is also the smallest slice that stands alone: a keyboard whose
diacritic keys work on both forms is strictly better than today's even if the
author is never told why, never chooses a write-back form, and backspace is left
alone.

**Independent Test**: Take a keyboard whose diacritic rules are written against
precomposed characters, seed a simulated buffer with the decomposed form of a
base+mark pair from its inventory, press the diacritic key, and confirm the
result is canonically equivalent to what the same keystroke produces on the
precomposed buffer. Repeat for every attested pair in the inventory.

**Acceptance Scenarios**:

1. **Given** a keyboard whose acute rule is written against precomposed vowels,
   **When** the buffer holds a decomposed base + combining mark and the acute key
   is pressed, **Then** the result is canonically equivalent to the result of the
   same keystroke on the precomposed buffer.
2. **Given** the same keyboard and a buffer holding the **precomposed** form,
   **When** the diacritic key is pressed, **Then** the output is byte-identical to
   what the keyboard produced before this feature — existing behaviour is not
   perturbed.
3. **Given** a diacritic key that has an unaccompanied-key fallback rule (such as
   `+ ']' > '´'`), **When** the buffer holds a decomposed accented letter,
   **Then** the accent rule fires and the fallback does **not** — no spacing
   accent is emitted.
4. **Given** a keyboard that toggles or cycles an accent (pressing the accent key
   on an already-accented letter removes or replaces it), **When** the buffer
   holds the decomposed form, **Then** the toggle or cycle behaves as it does on
   the precomposed form.

---

### User Story 2 - The author is shown the gap, with a reproducible case (Priority: P2)

As a keyboard author importing or adapting an existing keyboard, I want the
studio to tell me which of its rules will fail on a differently-normalized
buffer, and show me the exact keystroke that demonstrates it, so I can judge the
problem myself instead of trusting an invisible transform.

**Why this priority**: This is independently valuable and independently
shippable — the diagnostic is useful on an imported keyboard we choose not to
modify, and it is what makes Story 1 auditable rather than magic. It is P2 rather
than P1 because knowing about a defect is worth less than not having it.

**Independent Test**: Run the diagnostic against a keyboard known to have the gap
and against one known not to. The first reports each affected rule with a
concrete failing keystroke sequence and both observed outputs; the second reports
nothing. No fix is applied in either case.

**Acceptance Scenarios**:

1. **Given** a keyboard with a diacritic rule written against precomposed
   characters only, **When** the diagnostic runs, **Then** it reports that rule
   with a keystroke sequence, the output on the precomposed buffer, and the
   differing output on the decomposed buffer.
2. **Given** a keyboard whose rules already accept both forms, **When** the
   diagnostic runs, **Then** it reports no finding for those rules.
3. **Given** a keyboard containing rules the codec could not model, **When** the
   diagnostic runs, **Then** those rules are reported as **not analysed** rather
   than silently passed or silently failed.
4. **Given** a reported finding, **When** the author reads it, **Then** the
   explanation names the characters involved by codepoint and name, and never
   requires the author to know the words "NFC" or "NFD" to act on it.

---

### User Story 3 - The author decides what gets written back (Priority: P3)

As a keyboard author, I want to choose whether the keyboard echoes back the form
it found or rewrites the cluster into my keyboard's own form, because my users
type into an application that owns its own normalization and I do not want my
keyboard fighting it.

**Why this priority**: The default is safe and correct for the reported case, so
the choice is a refinement rather than a prerequisite. It matters because the
wrong answer is actively harmful in FLEx — rewriting untyped text means emitting
backspaces over characters the user did not type, which FLEx immediately undoes,
churning the round-trip and dirtying the field.

**Independent Test**: With the same keyboard and the same decomposed buffer,
switch the setting between its values and confirm the emitted bytes differ as
specified while the visible result stays canonically equivalent in every case.

**Acceptance Scenarios**:

1. **Given** the default setting, **When** a diacritic key fires against a
   decomposed buffer, **Then** the keyboard emits the decomposed form and issues
   no backspace over pre-existing characters.
2. **Given** the setting is changed to write back the keyboard's own form,
   **When** the same keystroke fires, **Then** the touched cluster is emitted in
   that form, and the author was shown — before committing — that this rewrites
   text the keyboard did not type.
3. **Given** either setting, **When** the buffer already holds the keyboard's own
   form, **Then** the emitted bytes are identical under both settings.

---

### User Story 4 - Backspace behaves the same over either form (Priority: P4)

As a user, I want backspace to peel one diacritic at a time regardless of how the
text I am deleting happens to be stored, so deleting text I pasted feels the same
as deleting text I typed.

**Why this priority**: This is the `sil_cameroon_qwerty` behaviour generalised and
mirrored. It is last because it is a separate keystroke from Story 1 and the
existing hand-written precedent shows keyboards ship usefully without it — but
without it, tolerance is half-applied: the keyboard would accept both forms on
input and behave inconsistently on delete.

**Independent Test**: For each attested multi-mark form in the inventory, seed the
buffer with that form in both normalizations, press backspace repeatedly, and
confirm the two sequences of intermediate states are canonically equivalent at
every step.

**Acceptance Scenarios**:

1. **Given** a buffer holding a precomposed two-mark form and another holding its
   decomposed equivalent, **When** backspace is pressed once against each,
   **Then** the two results are canonically equivalent and each has lost exactly
   one mark.
2. **Given** a host that deletes a whole grapheme cluster on backspace, **When**
   backspace is pressed against a decomposed accented letter, **Then** exactly one
   mark is removed, not the whole cluster.

**Known limitation**: on a MNEMONIC-layout keyboard — `sil_yoruba8`, this feature's
own flagship motivating keyboard, included — `any(store) + [K_BKSP] > index(store,1)`
never matches through this repo's KeymanWeb-model simulator, so Scenario 2 is unmet
for that case. Root-caused to `setMnemonicCode`'s `Lcode` deletion for non-modifier
keys with no character mapping (upstream KeymanWeb behaviour,
[keymanapp/keyman#3744](https://github.com/keymanapp/keyman/issues/3744)); not
confirmed against Keyman's native Core engine. See `context-variants.ts`'s
`addBackspaceUnwrap` doc, "KNOWN LIMITATION 1", for the implementation-level detail.
Story 1's diacritic-tolerance fix is unaffected and is canary-tested against
`sil_yoruba8` in the real corpus.

---

### Edge Cases

- **Private Use Area characters.** PUA is in scope for this project and is
  **property-blank** — `\p{M}` does not match a PUA mark. Any classification step
  that depends on a Unicode character property is wrong for PUA. Canonical
  decomposition is property-independent, so this feature must decide
  "decomposable?" by decomposition, never by mark class.
- **Rules the codec could not model.** Opaque source fragments are round-tripped
  verbatim and cannot be rewritten. They must be reported as untouched, never
  counted as covered.
- **Stores used with paired `index()`.** Adding decomposed members to a store is
  safe when the store is echoed identity-wise and **silently corrupts output**
  when the store is paired with a different one under `index()`, because the two
  stores stop being parallel. This distinction is not cosmetic; it is the
  difference between a correct keyboard and one that emits the wrong accent.
- **Multi-mark stacks and non-canonical mark order.** A buffer may hold marks in
  non-canonical order, in which case neither the composed nor the naively
  decomposed form matches. Canonical ordering must be resolved when the variants
  are generated, not assumed of the buffer.
- **Deadkeys in context.** A deadkey occupies a context position and is not a
  Unicode character; nothing may reorder across it or treat it as a mark.
- **Mixed-form buffers.** A buffer may be partly composed and partly decomposed.
  The feature must not assume the whole buffer shares one form.
- **Mnemonic keyboards.** `sil_yoruba8` sets a mnemonic layout, so its rules are
  written with character literals rather than virtual keys. Any generated rule
  and any simulated keystroke must respect that.
- **Rules whose context is longer than the equivalence expansion.** Adding a
  context position shifts every later offset; an off-by-one here produces a
  wrong character rather than a failed match.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The studio MUST be able to determine, for a given keyboard, which
  of its rules produce different results on canonically-equivalent buffers.
- **FR-002**: That determination MUST be made by observing the keyboard's actual
  behaviour on both forms, not by inspecting rule text for composed-looking
  characters. A rule that already handles both forms by any means MUST report
  clean.
- **FR-003**: The studio MUST be able to generate context variants that make an
  affected rule fire on the canonically-equivalent buffer, without changing what
  the rule does on the form it already handled.
- **FR-004**: Generated variants MUST preserve the keyboard's existing behaviour
  byte-for-byte on buffers in the form the keyboard already handled.
- **FR-005**: Canonical ordering of marks MUST be resolved when variants are
  generated, so the shipped keyboard contains no ordering logic of its own.
- **FR-006**: Decomposability MUST be decided by canonical decomposition, not by
  Unicode character property, so that PUA characters are handled correctly.
- **FR-007**: The author MUST be able to choose what the keyboard writes back on
  the tolerant path: echo the form found, or normalize the touched cluster to the
  keyboard's own form. The default MUST be to echo the form found.
- **FR-008**: When the chosen setting causes the keyboard to rewrite characters it
  did not type, the author MUST be shown that consequence before it is committed.
- **FR-009**: Nothing in this feature may normalize IR bytes on the parse or emit
  path. Changes to a keyboard MUST be proposed, previewed and confirmed.
- **FR-010**: Rules the codec could not model MUST be reported as not analysed and
  MUST NOT be modified.
- **FR-011**: Applying the change twice MUST produce the same keyboard as applying
  it once.
- **FR-012**: Diagnostics MUST name characters by codepoint and Unicode name, and
  MUST be actionable without the author knowing normalization terminology.
- **FR-013**: The feature MUST record which rules it could not make tolerant, and
  why, rather than reporting blanket success.
- **FR-014**: Backspace behaviour MUST be consistent across canonically-equivalent
  buffers wherever the keyboard defines backspace behaviour at all.

### Key Entities

- **Canonical equivalence class**: the set of byte sequences Unicode considers the
  same text. The unit this feature matches against, in place of a byte sequence.
- **Per-pair table**: the enumerated base+mark inventory already specified in the
  mark-composition model, currently feeding the posture facet, the output-form
  proposal, the stepwise-unwrap stores and the blocking rules. Context tolerance
  is its **fifth consumer**; each composed form's decomposition is exactly the
  context variant to add.
- **Context variant**: an added rule, or added store members, that make an
  existing rule fire on a canonically-equivalent buffer. Never a replacement.
- **Write-back policy**: the author's choice of what the keyboard emits on the
  tolerant path — echo, or the keyboard's own form.
- **Tolerance report**: per rule, whether it is already tolerant, was made
  tolerant, or could not be analysed or modified.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every attested base+mark pair in a keyboard's confirmed
  inventory, the diacritic keystroke produces canonically-equivalent results
  starting from either normalization of the context. Measured across the whole
  inventory, not a sample.
- **SC-002**: For buffers in the form the keyboard already handled, emitted bytes
  are unchanged from before the feature — zero regressions, measured by
  byte-comparison over the same inventory sweep.
- **SC-003**: No keyboard produced through the studio emits a spacing accent, or
  any other fallback-rule output, in place of a diacritic that should have been
  applied.
- **SC-004**: `sil_yoruba8`'s reported case is fixed: with the buffer decomposed,
  the acute key applies an acute; and the plain-vowel toggle case
  (decomposed `a` + acute, then the acute key) behaves as it does on the
  precomposed form.
- **SC-005**: Making a keyboard tolerant requires no hand-aligned character
  tables. The 236-entry hand-maintained pair table in `sil_cameroon_qwerty` is the
  baseline being replaced; the generated equivalent is derived from the
  inventory.
- **SC-006**: The tolerance report accounts for 100% of the keyboard's rules —
  every rule is classified as already tolerant, made tolerant, or explicitly not
  analysed. No rule is unaccounted for.
- **SC-007**: Under the default write-back policy, the keyboard issues no
  backspace over characters it did not itself emit.

## Assumptions

- Keyboards produced by this studio are monolingual, per the mark model's
  uniformity invariant. Multilingual country-scale keyboards are supported
  upstream but are not an output of this studio; their inventories are open by
  necessity and a generated pair table would not terminate usefully.
- The confirmed inventory is the source of the pair table. A keyboard whose
  inventory has not been confirmed can be diagnosed but cannot have variants
  generated from the inventory.
- Canonical decomposition is available from the platform's Unicode
  implementation at generation time. This is what removes the need for a
  combining-class data table, which this repository does not have and has flagged
  as a gap in two places.
- Only canonical forms are in play. Compatibility decomposition is never used.
- The engine-side fix analysed in [research.md](research.md) is not available and
  is not assumed. If it ever ships, the work specified here becomes its input
  rather than being superseded — see that document.

## Out of scope

- Changing what normalization form a keyboard **outputs**. That is the existing
  facet-transform question, including the declined `nfc → nfd` migration, and is
  a different decision from this one.
- Compatibility normalization forms.
- Reordering marks in the user's existing buffer.
- Any change to the Keyman Engine, compiler, or `.kmn` language. Analysed in
  [research.md](research.md), campaigned separately, not shipped here.
- Multilingual keyboards with open attachment matrices.

## Dependencies

- **Simulator context seeding.** The behavioural comparison in FR-001/FR-002
  cannot be written today: the simulator always starts from an empty buffer, so
  there is no way to express "the host handed us this text". Seeding a starting
  buffer is a prerequisite for every acceptance test in Story 1, 2 and 4, and
  should be the first task in the plan.
- **The per-pair table** (`nfc-posture-of-inventory` as the shared pure function
  the mark model already calls for) is the generator input.
- **Layer placement.** A new diagnostic lands in the hygiene layer alongside the
  existing IR-consuming checks. It must not be introduced as the first check of
  the style layer, which is unimplemented — that is a layer-boundary decision
  requiring sign-off, and both existing checks that touch the question say so.
