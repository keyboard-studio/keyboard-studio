# Feature Specification: Richer character-inventory breakdown on "Add your whole alphabet"

**Feature Branch**: `047-alphabet-inventory-categories`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "In the 'Add your whole alphabet' page it is possible to paste a whole text and get a character inventory. Letters and marks get their own categories (plus attested characters). Also show sections for Punctuation, Symbol, Separator, and control characters underneath 'accented letters'. Sort letters using the default ICU sort (per-language canonical order later). When a lowercase is selected also select its uppercase, and vice versa — but show only the lowercase with a toggle to reveal the derived uppercases. Parse every character in the pasted string (spacing was only for digraphs, deferred); skip CR/LF/CRLF/Tab/space but log anything else; add arrays for the new categories. Don't show non-letters in the 'Your alphabet' section — letters, diacritics, and combos should show there."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paste a whole text and get a complete inventory (Priority: P1)

A keyboard author on the "Add your whole alphabet" step pastes a paragraph (or more) of
text in their language into the "Type your alphabet" box. Instead of capturing only the
first character of each word, the tool captures **every distinct character** in the pasted
text and files each one into the right part of the alphabet breakdown.

**Why this priority**: This is how the author actually uses the box today, and it is the
foundation the other stories build on — without a real inventory, the new category sections
have nothing to show. It delivers immediate value on its own.

**Independent Test**: Paste a sentence containing letters, an accented letter, a digit, and
a punctuation mark; confirm all distinct characters are captured and appear in the
breakdown (not just the first letter of each word).

**Acceptance Scenarios**:

1. **Given** an empty alphabet, **When** the author pastes "Naïve? Yes — 3 times.", **Then**
   every distinct character in that text is captured into the alphabet.
2. **Given** the box, **When** the author types characters with no spaces between them,
   **Then** each character is captured (spacing is no longer required to separate them).
3. **Given** a paste containing ordinary line breaks, tabs, or spaces, **When** it is
   parsed, **Then** carriage return, line feed, CRLF, tab, and plain space are dropped while
   every other character (including unusual invisible ones) is kept and recorded.

---

### User Story 2 - See the inventory split into meaningful categories (Priority: P1)

The "How your alphabet breaks down" panel already groups the alphabet into Letters, Marks,
and Accented letters. The author now also sees dedicated sections for **Numbers,
Punctuation, Symbols, Separators, and Control/other characters** beneath Accented letters,
so nothing captured is hidden and each character type is easy to review.

**Why this priority**: Making the captured inventory legible by category is the core of the
request and directly complements Story 1; together they form the MVP.

**Independent Test**: With an alphabet containing a letter, a digit, a punctuation mark, and
a currency symbol, confirm each appears under the correct new section and none is
double-counted under Letters.

**Acceptance Scenarios**:

1. **Given** an alphabet containing "a", "1", ".", and "€", **When** the breakdown renders,
   **Then** "a" is under Letters, "1" under Numbers, "." under Punctuation, and "€" under
   Symbols, each shown exactly once.
2. **Given** a category with no members, **When** the breakdown renders, **Then** that
   section is not shown (no empty sections).
3. **Given** letters in the Letters section, **When** they are displayed, **Then** they are
   ordered by the default dictionary-style (ICU) sort rather than by raw code-point value,
   so accented letters sit near their base letters.

---

### User Story 3 - Review letters by lowercase, with uppercase on demand (Priority: P2)

To keep the Letters section uncluttered, the author sees only the **lowercase** of each
case pair by default. A **"Show uppercase letters"** toggle reveals the derived uppercase
counterparts. Regardless of the toggle, both cases are recorded so the finished keyboard can
type uppercase and lowercase.

**Why this priority**: A quality-of-life and correctness refinement layered on Stories 1–2;
valuable but not required for the inventory itself to work.

**Independent Test**: Enter lowercase letters only, confirm the Letters section shows just
the lowercase; turn on the toggle and confirm the matching uppercase letters appear; finish
the step and confirm the recorded alphabet contains both cases.

**Acceptance Scenarios**:

1. **Given** the author entered "a b c", **When** the Letters section renders with the
   toggle off, **Then** only "a", "b", "c" are shown.
2. **Given** that state, **When** the author turns the toggle on, **Then** "A", "B", "C"
   also appear alongside their lowercase counterparts.
3. **Given** the author completes the step, **When** the alphabet is recorded, **Then** it
   contains both the lowercase letters and their uppercase counterparts, computed in a way
   that respects the language's casing rules.
4. **Given** a caseless-script letter or a letter whose lowercase was never entered, **When**
   the Letters section renders, **Then** it is shown as-is and not incorrectly folded away.

---

### User Story 4 - Keep the "Your alphabet" list focused on letters (Priority: P2)

The "Your alphabet" chip list (the running list the author builds) shows only the linguistic
content — **letters, diacritics, and letter+mark combinations** — and does not clutter with
numbers, punctuation, symbols, separators, or control characters. Those still appear in
their own breakdown sections below.

**Why this priority**: A focus/clarity refinement; the inventory and categories work without
it, but it keeps the primary list readable.

**Independent Test**: Paste text containing letters, a digit, and punctuation; confirm the
"Your alphabet" list shows only the letters (and any diacritics/combos), while the digit and
punctuation appear only in their category sections.

**Acceptance Scenarios**:

1. **Given** an alphabet with "a", "é", a combining accent, "5", and "?", **When** the "Your
   alphabet" list renders, **Then** it shows "a", "é", and the diacritic/combo, but not "5"
   or "?".
2. **Given** that same alphabet, **When** the breakdown renders, **Then** "5" appears under
   Numbers and "?" under Punctuation.

### Edge Cases

- Pasting text that contains only whitespace (spaces, tabs, newlines) adds nothing to the
  alphabet.
- An unusual invisible character (e.g. a non-breaking space or a formatting control) is
  retained, recorded to the appropriate category section, and logged so it is discoverable
  rather than silently dropped.
- A letter whose uppercase/lowercase counterpart does not exist as a single character (e.g.
  a case mapping that expands to multiple letters) is left un-folded and shown as entered.
- A cased letter entered **only in its uppercase form** (its lowercase was never entered) is
  shown as entered (the uppercase) and not replaced by a synthesized lowercase; the Letters
  case-collapse only ever hides an uppercase behind a lowercase that is actually present.
- A private-use character the author has declared as a letter is treated as a letter, never
  as a control character.
- Digraphs entered with a space between the two letters (e.g. "n g") are now parsed as two
  separate letters; dedicated digraph handling is intentionally out of scope here.
- A base+mark combination that has no single composed form (e.g. Ə́) is a multi-code-point
  grapheme; its chip shows "U+018F+" with the full stack (U+018F U+0301) on hover, rather
  than mislabeling it as only the base.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The "Type your alphabet" input MUST capture every distinct character from the
  text the author types or pastes, rather than only the first character of each
  space-separated token.
- **FR-002**: When capturing characters, the system MUST drop only carriage return, line
  feed, CRLF, tab, and plain space (U+0020); every other character MUST be retained.
- **FR-003**: When a retained character is an unusual separator or control/format character,
  the system MUST record it into the appropriate category and log its presence so it is
  discoverable. "Discoverable" here means the character both appears in its category section
  (Separators / Control-other) and is emitted to the developer console log; no additional
  in-UI alert is required by this feature.
- **FR-004**: The alphabet breakdown MUST present dedicated sections for Numbers,
  Punctuation, Symbols, Separators, and Control/other characters, displayed beneath the
  existing Accented letters section.
- **FR-005**: Each captured character MUST appear in exactly one breakdown category (no
  character shown under both Letters and another category).
- **FR-006**: A breakdown category section MUST be shown only when it has at least one
  member (no empty sections).
- **FR-007**: Characters within each breakdown section MUST be ordered using the default
  (untailored) ICU collation, not raw code-point order. Per-language canonical ordering is
  explicitly deferred.
- **FR-008**: The Letters section MUST display only the lowercase of each case pair by
  default, and MUST provide a toggle that additionally reveals the derived uppercase
  counterparts; the toggle affects display only.
- **FR-009**: When the author completes the step, the recorded alphabet MUST include the
  derived uppercase counterpart of each cased letter (in addition to the lowercase), so the
  produced keyboard can type both cases. Case derivation MUST respect the language's casing
  rules (e.g. Turkish dotted/dotless i).
- **FR-010**: Case folding MUST leave caseless-script letters, and cased letters with no
  single-character counterpart, shown as entered.
- **FR-011**: The "Your alphabet" running list MUST display only letters, diacritics, and
  letter+mark combinations, and MUST NOT display numbers, punctuation, symbols, separators,
  or control characters (which remain visible in their own category sections).
- **FR-012**: The character picker's Unicode-value ordering MUST remain unchanged by this
  feature.
- **FR-013**: The change MUST be additive to the confirmed-alphabet data: existing
  downstream consumers of the alphabet MUST continue to behave as before.
- **FR-014**: A character chip whose grapheme is more than one code point — a
  base+mark combination with no single composed form (e.g. Ə́ = U+018F + U+0301) — MUST
  indicate the extra code points compactly by showing the base code point followed by a
  `+` affordance (e.g. "U+018F+"), and MUST reveal the full code-point stack (e.g.
  "U+018F U+0301") on hover. A single-code-point character shows its code point with no
  `+`. This applies wherever a character's code-point label is shown in the alphabet UI
  (the "Your alphabet" chips and the breakdown chips).

### Key Entities *(include if feature involves data)*

- **Alphabet inventory**: the full set of distinct characters the author has captured for
  the language, from which every breakdown view is derived.
- **Glyph category**: the classification of a captured character as one of Letter, Number,
  Punctuation, Symbol, Separator, or Control/other, used to route it to a breakdown section.
- **Case pair**: a lowercase letter and its derived uppercase counterpart (and vice versa),
  used for the collapsed Letters display and for recording both cases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After pasting a paragraph of the target language, 100% of the distinct
  non-skipped characters in that paragraph appear in the alphabet breakdown.
- **SC-002**: A character of each type (letter, number, punctuation, symbol) lands under its
  correct section, and no character appears in more than one section.
- **SC-003**: In a sample containing accented and unaccented letters, the Letters section is
  ordered so that accented letters sit adjacent to their base letters (dictionary order),
  not scattered by code-point value.
- **SC-004**: With the uppercase toggle off, the Letters section shows no uppercase
  counterpart of any lowercase letter present; turning it on reveals them, and the completed
  alphabet contains both cases in every case-pair sample tested.
- **SC-005**: The "Your alphabet" list contains zero numbers, punctuation, symbols,
  separators, or control characters across the test samples, while still showing all
  letters, diacritics, and combos.
- **SC-006**: Ordinary whitespace (CR, LF, CRLF, tab, space) never appears as a captured
  character.
- **SC-007**: For a multi-code-point grapheme with no single composed form (e.g. Ə́), the
  chip label shows "U+018F+" and its hover text lists every code point (e.g.
  "U+018F U+0301"), verified in test.

## Assumptions

- The author works on the build-list ("Add your whole alphabet") path of the character
  step; the step-by-step manual path is out of scope for this change.
- Per-language canonical/tailored sort order is deferred; the default ICU (root) collation
  is acceptable for now.
- Dedicated digraph handling is deferred; multi-letter units are not specially grouped by
  this feature.
- Recording the derived uppercase counterparts complements, and does not conflict with, the
  existing downstream case-pairing performed during key placement; duplicates are
  de-duplicated.
- New category labels and the uppercase toggle follow the existing (currently untranslated)
  copy pattern of the breakdown panel; full localization of the panel is a separate
  follow-up.
- No change to the locked pattern schema or the confirmed-alphabet contract is required; the
  new category groupings are additive.
