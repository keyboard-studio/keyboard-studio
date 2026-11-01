# Feature Specification: Base-keyboard fallback — show the leaks, and make "Do nothing" true

**Feature Branch**: `109-base-keyboard-fallback`

**Created**: 2026-11-01

**Status**: Draft

**Owner**: Engine team (Constitution Art VI) — position enumerator, `swallowUndefined` compile,
base-keyboard data codegen, the studio surface. Content team — the surface's copy.

**Input**: User description: "The fallback question is not clear about what it asks. In that
question, list the 'leaky' base characters that are available if we don't block them. Base
keyboards may be plural. Cross-link spec 108."

**Related specs**:
- [spec 076](../076-rule-behaviours/AS-BUILT.md) — shipped the keyboard-wide fallback policy and
  its surface ([fallback-surface-design.md](../076-rule-behaviours/fallback-surface-design.md)),
  but not `swallowUndefined` (its FR-005). This spec takes FR-005 and the fallback surface only.
  FR-006–FR-017 and the Behaviours step stay out of scope.
- [spec 108](../108-ldml-export/spec.md) — the LDML export fills every position the keyboard
  does not handle from one base keyboard (FR-021, FR-027) and records each position's provenance
  (FR-028). It needs the same set of unhandled positions this spec lists (FR-040).
- Spec 090 — the `windows-layout` decision, a multi-select of base keyboards with a primary pick.

## Authority

Constitution v2 precedence table. For the shipped half (the policy, its store and the interim
surface), spec 076's AS-BUILT and the code. Art X governs the default and every behaviour change
this spec introduces. Art XI governs the copy: a sentence on the surface is a claim about the
compiled keyboard.

## The problem

The studio asks "When a key isn't in your keyboard" with two options, "Do nothing" and "Use the
computer's layout". Three things are wrong:

1. **It does not say what it is about.** Nothing names the base keyboard — the physical layout
   on the typists' computers that Keyman falls back to — or the word fallback. It sits in a
   collapsed section at the bottom of the Assign Mechanisms step. Authors do not recognise it.
2. **It shows one sample key.** The table shows what a single representative key types on each
   likely base keyboard. The author never sees the full set of characters that leak through.
3. **"Do nothing" is not true.** Its copy says "Keys not in your keyboard do nothing. Silent on
   every computer". The policy reaches only *carved* keys (removed from the copied keyboard). Keys
   the copied keyboard never defined still fall through to the base keyboard, because
   `swallowUndefined` (spec 076 FR-005) was not built. The motivating case: `sil_cameroon_qwerty`
   on a UK English base keyboard types € on AltGr+4, and the author never sees it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See what leaks from my base keyboards (Priority: P1)

An author reaches the fallback question. It says plainly that it is about the base keyboards:
what happens on a key the keyboard does not handle. For each base keyboard picked earlier, it
lists every such position and the character that base keyboard types there. The author sees, for
example, that AltGr+4 types € on UK English and decides whether that is acceptable.

**Why this priority**: The leak list is the decision's evidence (Art X: choices with
consequences are visible and demonstrable per combination). It ships alone, before US2, as long
as the copy states what "Do nothing" covers today (FR-005).

**Independent Test**: Load `sil_cameroon_qwerty` with UK English picked. The surface lists
AltGr+4 → €, and the "Do nothing" copy says it does not yet cover keys the keyboard never
defined.

**Acceptance Scenarios**:

1. **Given** two picked base keyboards (US and French AZERTY), **When** the author opens the
   question, **Then** it shows one list per base keyboard, primary first, each with its own
   characters for the same unhandled positions.
2. **Given** a picked base keyboard with no character data, **When** the list renders, **Then**
   every position for that base keyboard says "unknown"; nothing is guessed from its family.
3. **Given** a position that is a deadkey on the base keyboard, **When** the list renders,
   **Then** that entry says it starts a deadkey.
4. **Given** the question is collapsed, **When** the keyboard has unhandled positions, **Then**
   the summary line shows how many positions type something on the primary base keyboard.
5. **Given** no base keyboard was picked, **When** the list renders, **Then** it uses the likely
   base keyboards (spec 076 FR-023 order) and labels them as the studio's guess.

---

### User Story 2 — "Do nothing" covers every key the keyboard does not handle (Priority: P1)

The author chooses "Do nothing". The compiled keyboard suppresses every printable position the
keyboard does not handle, on the modifier layers it uses, while Backspace, Enter and the other
frame keys keep working.

**Why this priority**: Without it the most common choice does not do what it says.

**Independent Test**: Compile a keyboard with the policy confirmed as "Do nothing". Typing any
unhandled printable position on a covered layer produces no output; frame keys work.

**Acceptance Scenarios**:

1. **Given** "Do nothing" is confirmed, **When** the keyboard compiles, **Then** one store of
   unhandled positions maps to `nul`, and no `nomatch > nul` rule is emitted.
2. **Given** the keyboard binds no key on the RALT layer, **When** it compiles, **Then** AltGr
   positions are not swallowed, and the surface says AltGr is not covered and why.
3. **Given** the author adds or removes a binding, **When** the working copy recompiles, **Then**
   the store is recomputed; carved combinations already handled by carve suppression are not
   emitted twice.
4. **Given** an existing draft whose policy came from the default or a migration, **When** this
   feature ships, **Then** its compiled output does not change until the author confirms the
   policy (FR-021).

---

### User Story 3 — Character data for every base keyboard the author can pick (Priority: P2)

The author can pick any of the 186 Windows layouts in the catalog. Today only five of them carry
per-key character data. Every catalog layout gets the data, generated from the Keyman `basic_kbd*`
keyboards, so the leak list is never "unknown" for a picked layout.

**Independent Test**: The codegen test passes for all catalog layouts, each pinned to its corpus
source.

**Acceptance Scenarios**:

1. **Given** the author picks `basic_kbdgr` (German), **When** the list renders, **Then** every
   unhandled position shows the German character.

---

### User Story 4 — One enumerator for the leak list, the swallow store and the LDML fill (Priority: P2)

The leak list, the `swallowUndefined` store and spec 108's LDML fill all ask the same question:
which key-and-modifier positions does this keyboard not handle? One engine function answers it.

**Independent Test**: On the same IR, the leak list's positions, the swallow store's positions
(on covered layers) and spec 108's "filled" positions are the same set.

---

### Edge Cases

- **Minimal overlay keyboards (the headline risk).** A keyboard that overrides a few keys and
  relies on the base keyboard for the rest becomes nearly dead under "Do nothing" once US2 ships.
  Today's default is "Do nothing", and every existing draft received it by migration without the
  author seeing the question. FR-020 proposes "Use the computer's layout" for such a keyboard when
  its base keyboard shares its script, and FR-021 keeps unconfirmed drafts from changing.
- **Same script, different language.** A Latin-script keyboard on a Latin base keyboard
  (French on US English) proposes "Use the computer's layout", even though some leaked letters
  are not in the language's alphabet. The leak list shows them; the author can still choose
  "Do nothing".
- **Mixed picks.** A Latin-script keyboard with US English and Russian base keyboards proposes
  "Do nothing", because the Russian base keyboard leaks Cyrillic letters. The evidence names the
  Russian base keyboard.
- **Multi-script targets.** When the language tag carries one script but the keyboard
  deliberately types two (for example a transliteration keyboard), the target script is the tag's;
  the author can override the proposal.
- **Plural base keyboards.** Positions do not depend on the base keyboard; characters do. One
  policy covers every base keyboard: the swallow store is positional. The leak list is per base
  keyboard.
- **A layer the keyboard never uses.** The swallow store covers only modifier layers the IR binds
  at least one key on (spec 076 FR-005). The leak list still shows the other layers' leaks and
  marks them "not covered by Do nothing".
- **Deadkeys on the base keyboard.** Under pass-through, an unhandled position that is a deadkey
  on the base keyboard arms that deadkey. The list says so.
- **Imported keyboards with `nomatch > nul`.** Not lifted into `swallowUndefined`; it stays an
  opaque fragment with a lint note that it also swallows frame keys (spec 076 edge case).
- **Caps Lock.** A caps layer is covered only when the IR binds a caps-dependent rule, as for any
  other layer.
- **Touch layouts.** Out of scope: a touch key that is not defined does not exist, so nothing
  leaks.

## Requirements *(mandatory)*

### Functional Requirements

**The surface (US1)**

- **FR-001**: The question MUST say what it is about: the base keyboard or keyboards the typists'
  computers fall back to, and what happens on a key-and-modifier position the keyboard does not
  handle. Its title names fallback to the base keyboard.
- **FR-002**: For each picked base keyboard (the `windows-layout` decision's picks, primary
  first), the surface MUST list every unhandled position with the character that base keyboard
  types there, "starts a deadkey", or "unknown". The primary base keyboard's list is shown; the
  others can be expanded. Each list groups its leaks into letters, digits, and punctuation and
  symbols, so the author can judge them separately (see FR-020).
- **FR-003**: With no picked base keyboard, the surface MUST use the likely base keyboards (spec
  076 FR-023 order) and label them as the studio's guess (A3 honesty caption).
- **FR-004**: The copy MUST follow the binding A2 rules (spec 076): each option states its own
  risk, neither is recommended, and the retired one-sided slogan appears nowhere.
- **FR-005**: The copy MUST match what the compiled keyboard does. Until US2 ships, "Do nothing"
  states that it covers removed keys only and that the listed characters still come through.
- **FR-006**: The collapsed summary MUST show how many unhandled positions type something on the
  primary base keyboard, so the decision is visible before the section is opened (Art X).
- **FR-007**: The list is derived from the working copy and recomputed when it changes. It adds no
  timer.
- **FR-008**: The setting stays an editor-authored working-copy setting at its interim host (the
  Assign Mechanisms step) until the Behaviours step exists. If it moves into a survey step, the
  registry declaration is a functional requirement of that change (Art IX).

**`swallowUndefined` (US2) — spec 076 FR-005, carried forward**

- **FR-010**: When the policy is "Do nothing", the compiled keyboard MUST suppress every printable
  virtual-key position, on each modifier layer the IR binds at least one key on, that the IR does
  not match. The positions go into one store, emitted as one rule with `nul` output.
- **FR-011**: The store MUST never include frame keys (Backspace, Enter, Tab, Escape, Delete,
  navigation). The keyboard MUST NOT use `nomatch > nul`.
- **FR-012**: The store MUST be recomputed whenever a binding is added or removed. It MUST respect
  the existing skip-set predicate (`isInSwallowSet`): combinations covered by carve suppression or
  another behaviour's rule are not emitted again, and deadkey carves always suppress.
- **FR-013**: The rule and store are behaviour-owned IR written through the `mutate()` seam, use
  corpus naming idiom, and compile cleanly through Layer A/B and `kmcmplib`.
- **FR-014**: When the policy is "Use the computer's layout", nothing is emitted beyond today's
  carve behaviour.

**Defaults and existing drafts**

- **FR-020**: The default policy is a proposal the author confirms (Art X). It is derived from
  the **script of what leaks**, compared with the **target script** (product-owner ruling,
  2026-11-01: "A random 'Q' would be less disconcerting in a Latin-script keyboard than, say,
  Korean script."):
  - **Target script**: the script subtag of the keyboard's language tag, filled by likely
    subtags when absent.
  - **Leak script**: the scripts of the letters the picked base keyboards type at unhandled
    positions (FR-002).
  - **Digits and punctuation** may need separate handling. [NEEDS CLARIFICATION: whether leaked
    digits and punctuation count toward the proposal. They are mostly Common script, but a target
    script can have its own digits (Arabic-Indic, Devanagari, Thai) or punctuation (Arabic comma,
    danda, full-width CJK forms), so an ASCII `4` or `,` can be as foreign to it as a stray
    letter. Options: (a) neutral, ignored; (b) counted when the target script has its own digits
    or punctuation; (c) a separate fallback choice for digits and punctuation. Until resolved,
    the proposal uses letters only.]
  - If every leaked letter is in the target script, or no letter leaks, the proposal is "Use the
    computer's layout". A stray letter is mildly surprising but legible.
  - If any picked base keyboard leaks a letter in another script, the proposal is "Do nothing".
    A foreign-script letter is disconcerting, as with Latin leaking into a Hangul keyboard.
  - Where a base keyboard has no character data, its script is taken from its catalog language
    tags.
  - The proposal shows its evidence: which base keyboard and which script triggered it, with
    the leak count.
  This replaces spec 076 FR-005's "declined for sparse Latin overlays, accepted for non-Latin
  scripts" with a test that also covers non-Latin targets on non-Latin base keyboards.
- **FR-021**: A policy the author never confirmed MUST NOT start suppressing never-defined keys
  when US2 ships. Such drafts are re-proposed the choice, with the leak list, before their
  compiled output changes (Art X: no silent automation).

**Base-keyboard data (US3)**

- **FR-030**: Every layout in the Windows-layout catalog MUST have per-key character data,
  generated from its `basic_kbd*` keyboard in the keyboards corpus by extending the existing
  codegen. It is pinned to the corpus commit with a hash per source, never hand-edited, and the
  codegen test fails on drift.
- **FR-031**: The data stays keyed by key and modifiers for all positions, not by carved
  combination (spec 076 amendment A3), so carved and never-defined keys are one leak category.
- **FR-032**: Where a layout has no data, its positions show "unknown"; the studio never guesses a
  character from the layout family.

**Shared enumerator (US4) — spec 108 cross-links**

- **FR-040**: One engine function MUST return the key-and-modifier positions the keyboard does not
  handle, from the IR alone. It is positional and does not depend on the base keyboard. The leak
  list (FR-002), the swallow store (FR-010, restricted to covered layers) and spec 108's fill
  (FR-021) and "filled" provenance (FR-028) all use it.
- **FR-041**: Characters are joined in by the caller from base-keyboard data passed as input. The
  engine never imports the studio (spec 108 Assumptions, "Base keyboard").
- **FR-042**: Spec 108 uses only the **primary** base keyboard (its FR-027), because an LDML file
  must fill each position with one concrete key. This spec lists **every** picked base keyboard,
  because the typists may use any of them. The two are consistent: under "Do nothing" the swallow
  store's `nul` outputs reach the LDML export as suppressed positions (spec 108 rows 2.25 and
  3.15a: gap keys), so a swallowing keyboard's LDML export does not depend on the base keyboard.
  Under "Use the computer's layout", spec 108 fills from the primary base keyboard and reports
  it.

### Key Entities

- **Unhandled position**: a key and modifier set, on a layer the keyboard uses or not, that no
  rule in the IR matches. Positional; independent of the base keyboard.
- **Leak**: an unhandled position paired with what one base keyboard types there (a character,
  "starts a deadkey", or "unknown").
- **Base keyboard**: a physical OS layout the typists use (project vocabulary; never the copied
  keyboard). The `windows-layout` decision holds one or more, primary first.
- **Fallback policy**: the existing keyboard-wide `"swallow" | "pass-through"` setting (spec 076).
  This spec does not change its type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `sil_cameroon_qwerty` with UK English picked lists AltGr+4 → € (spec 076's A3
  case).
- **SC-002**: For every keyboard in the test corpus compiled with "Do nothing" confirmed, no
  unhandled printable position on a covered layer produces output, and every frame key behaves as
  before.
- **SC-003**: The "Do nothing" copy variant shown always matches whether US2 is active; a test
  asserts the pairing.
- **SC-004**: All 186 catalog layouts have character data, and the codegen test passes.
- **SC-005**: On the same IR, the enumerator's positions equal spec 108's "filled" plus
  "suppressed" positions.
- **SC-006**: No existing draft's compiled output changes on upgrade without an author
  confirmation.
- **SC-007**: A Korean (Hangul) keyboard on a US English base keyboard proposes "Do nothing"; a
  French Latin-script overlay on a US English base keyboard proposes "Use the computer's layout";
  each proposal names its triggering base keyboard and script.

## Assumptions

- **Platform behaviour.** Keyman deliberately passes undefined keys to the base keyboard on
  desktop (spec 076 FR-005). That is why the policy exists.
- **Studio conventions.** New strings use message ids with French in the same change (spec 046);
  the surface meets the accessibility rules (spec 056).
- **Out of scope**: spec 076 FR-006–FR-017 and the Behaviours step; a per-key override (retired by
  spec 076); LDML import.
- **Follow-ups** carry an owner and a trigger (Art XI). The interim host moves when the Behaviours
  step lands (owner: Engine; trigger: that step's spec).
