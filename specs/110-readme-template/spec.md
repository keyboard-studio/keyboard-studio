# Feature Specification: README template driven by authoring choices

**Feature Branch**: `km/readme-template`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "README template driven by authoring choices. Source design (approved 2026-11-02): [docs/superpowers/specs/2026-11-02-readme-template-design.md](../../docs/superpowers/specs/2026-11-02-readme-template-design.md)."

**Governing authority** (Constitution precedence): amends [spec 102](../102-keyboard-docs-templates/spec.md) FR-029 (README and package-readme content) and User Story 4 / [spec 080](../080-documentation-completeness/AS-BUILT.md) FR-006 (inherited documentation kept on adaptation), for `README.md` only. Welcome and help pages are unchanged. `readme.htm` stays within criterion `6.2-readme-htm-short` and Keyman's guidance that it be "kept as short as possible" ([Writing Keyboard Documentation](https://help.keyman.com/developer/19.0/guides/walkthrough/07-writing-keyboard-documentation)).

**Ownership** (Constitution Art. VI): Engine owns the section model, the renderers and the studio wiring. Content owns the wording, the headings and the use-case phrasing.

## Clarifications

### Session 2026-11-02 (brainstorm with the user)

- **Who reads the README?** → Someone deciding whether to use the keyboard. They need to know two things: will it produce my characters, and how do I type them? The README also carries a short Design notes section for authors who might adapt the keyboard, as Keyman intends.
- **How much typing detail goes in the README?** → A short summary of at most 8 example rows, plus a pointer to the welcome page for the full guide.
- **Which extras are included?** → Four: how to type a trigger key's own character, a font note, whether marked characters are composed or separate, and a "Suited to" line.
- **What happens to an adapted keyboard's existing README?** → The generated README replaces the original, and reuses the original description when the author hasn't written a new one.
- **What goes in `readme.htm`?** → A brief install-time page drawn from the same facts. It is not a duplicate of the README.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The README says which characters the keyboard gives and how to type them (Priority: P1)

A person looking at a keyboard made in the studio opens its README. Near the top it names the languages and script, and the keyboard it was based on. A Characters section lists the letters, marks, punctuation and digits that go beyond plain typing. A "How to type" table gives a few example keystrokes, one for each typing method used, and says how to type each trigger key's own character. The section ends with a pointer to the welcome page for the full guide.

**Why this priority**: These are the reader's two questions. Today the README answers neither, because it holds only the description, links and platforms.

**Independent Test**: Build a keyboard that adds ɓ through Right Alt and à through a `;` deadkey, then produce output. The README lists ɓ and à under Characters. It shows `Right Alt + b → ɓ`, `; then a → à` and `; then ; → ;` under How to type.

**Acceptance Scenarios**:

1. **Given** a keyboard producing characters outside printable ASCII, **When** output is produced, **Then** README.md has a Characters section that groups exactly those characters (letters, marks, punctuation and symbols, digits, other). Each group is listed in full, and empty groups are omitted.
2. **Given** a keyboard whose typing guide has more than 8 rows, **When** output is produced, **Then** the How to type table shows at most 8 example rows. The rows cover each typing method in use before repeating one. Then comes the line "Full guide with every key: see the welcome page."
3. **Given** a keyboard with a deadkey trigger whose own character can be typed, **When** output is produced, **Then** the table has a row showing how to type it. These rows don't count toward the 8.
4. **Given** a keyboard that adds no characters beyond printable ASCII, **When** output is produced, **Then** neither section appears.

---

### User Story 2 - The README helps the reader decide whether it fits (Priority: P2)

The README carries short lines that help the reader decide:

- **"Suited to"**: the author's use-case answer.
- **Composition**: whether accented letters come out as single characters or as letter plus mark.
- **Font note**: so characters don't show as boxes.
- **Tips and Known limitations**: when the author answered those questions.

**Why this priority**: These answer the follow-up questions that decide whether a keyboard will work for the reader. They matter less than the characters and keystrokes themselves.

**Independent Test**: Answer use-case "literacy" and give font guidance, then produce output. The README shows "Suited to: learning to read and write." and the author's font text.

**Acceptance Scenarios**:

1. **Given** use-case `literacy`, `messaging` or `official`, **When** output is produced, **Then** the README shows "Suited to: …" in plain words. **Given** `general` or no answer, **Then** the line is absent.
2. **Given** the author answered font guidance, **When** output is produced, **Then** the Fonts section shows that answer. **Given** no answer, and characters outside basic Latin in the inventory, **Then** a generic font note appears that names no font. **Given** neither, **Then** there is no Fonts section.
3. **Given** a keyboard whose output includes marked characters, **When** output is produced, **Then** one sentence says whether they come out precomposed, as letter plus combining mark, or a mix. This is determined from the keyboard's actual output.
4. **Given** usage tips or known limitations were answered, **When** output is produced, **Then** each appears under its own heading. **Given** they were not answered, **Then** the heading is absent.

---

### User Story 3 - The README records design notes for authors who might adapt it (Priority: P2)

A short Design notes section, of at most 6 bullets in plain words, records:

- the starting point,
- which typing method covers which group of characters,
- how marks are handled,
- where the touch layout came from,
- how many characters were removed from the copied keyboard,
- the author's design rationale, if given.

**Why this priority**: Keyman intends the README for other keyboard authors as well as users. The user asked for this section.

**Independent Test**: Copy a keyboard, assign Right Alt to the hooked letters and a deadkey to the tones, then produce output. Design notes says "Started from <copied keyboard>." and "Hooked letters: Right Alt; tones: deadkey `;`" (or equivalent grouping).

**Acceptance Scenarios**:

1. **Given** a Track 1 keyboard, **When** output is produced, **Then** Design notes names the copied keyboard. **Given** a Track 2 keyboard, **Then** it says it was adapted from the previous release. No version number appears: spec 102 FR-026 keeps versions in HISTORY.md only, which already records the lineage with its version.
2. **Given** any bullet with nothing to report, **When** output is produced, **Then** that bullet is absent. **Given** all bullets are absent, **Then** the section is absent.
3. **When** output is produced, **Then** no internal strategy ids (S-01 …) or pattern ids appear in the README.

---

### User Story 4 - readme.htm is a brief install-time page (Priority: P1)

When the package is being installed, Keyman shows `readme.htm`. It now shows, in about 6 to 8 lines:

- the name,
- the description,
- the language line,
- one "Adds:" line of the letters and marks,
- the font line, when one applies,
- "After installing, see the welcome page for how to type each character."

**Why this priority**: This is the moment the user decides whether to install. Today it shows only the description.

**Independent Test**: Produce output for the keyboard from User Story 1. `readme.htm` shows the name, the language line, "Adds: ɓ à …" and the welcome pointer. It has no table, no links and no platform list.

**Acceptance Scenarios**:

1. **Given** any keyboard, **When** output is produced, **Then** readme.htm contains no How to type table, Links, Supported Platforms, composition sentence, "Suited to" or Design notes.
2. **Given** more letters and marks than the cap, **When** output is produced, **Then** the "Adds:" line ends "… and N more".
3. **Given** the same working copy, **When** output is produced, **Then** every fact stated in readme.htm matches the same fact in README.md: language, script, based-on, characters and font.

---

### User Story 5 - An updated keyboard's README is regenerated (Priority: P2)

When an author updates an existing keyboard they opened (Track 2), the generated README replaces the original README. If the author did not write a new description, the original description is reused.

**Why this priority**: Without it, an adapted keyboard keeps a stale hand-written README that may not reflect its changes. The user chose replacement over appending.

**Independent Test**: Update a keyboard whose `.kps` has a description and whose README has hand-written prose. Produce output without answering the description question. The README is the generated template, and its description is the `.kps` description.

**Acceptance Scenarios**:

1. **Given** Track 2 with no description answered, **When** output is produced, **Then** the description is taken from the first available source, in this order:
   1. the starting point's `.kps` description,
   2. the original README's Description section or `__DESCRIPTION__` text,
   3. otherwise, no description.
2. **Given** Track 2, **When** output is produced, **Then** none of the original README's other prose is carried over. The "Based on" clause is absent, because the starting point is the keyboard itself.

### Edge Cases

- **A keyboard with no touch layout:** there is no touch row, and no touch bullet in Design notes.
- **A trigger key with no way to type its own character:** there is no literal row. The README does not invent one.
- **A huge inventory** (hundreds of characters): the README Characters lines stay in full, and only the readme.htm "Adds:" line truncates.
- **Several languages:** all are listed. The autonym appears only on the primary one.
- **Author-supplied text containing Markdown or HTML specials:** it is escaped in each format.
- **Live preview:** the in-studio docs preview shows the same README and readme.htm that will ship.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: README.md MUST contain, in order:
  1. title,
  2. description,
  3. language line,
  4. "Suited to",
  5. Characters,
  6. composition sentence,
  7. How to type,
  8. Fonts,
  9. Tips,
  10. Known limitations,
  11. Design notes,
  12. Links,
  13. Supported Platforms.

  Each optional part is omitted when it has no content, with no placeholder text.
- **FR-002**: The language line MUST name every keyboard language with its BCP47 tag, the primary language's autonym when answered, and the script. On Track 1 it MUST add "Based on {copied keyboard}, for a {layout family} base keyboard", with each clause dropped when unknown.
- **FR-003**: Characters MUST list, in full and by group, the produced characters outside printable ASCII (U+0020–U+007E). It MUST add a "Removed from {copied keyboard}" line when characters were carved away.
- **FR-004**: How to type MUST show at most 8 example rows, choosing one per typing method in use first. It MUST add a literal-trigger row for each trigger whose own character the keyboard can produce, and those rows don't count toward the 8. It MUST end with the welcome-page pointer when rows were omitted.
- **FR-005**: The composition sentence MUST be derived from the keyboard's actual output, and is shown only when marked characters exist.
- **FR-006**: The font note MUST use the author's font-guidance answer when given. Otherwise it appears only when the inventory has characters outside basic Latin, and it MUST NOT name a font.
- **FR-007**: "Suited to" MUST map `literacy`, `messaging` and `official` to plain phrases, and MUST be absent for `general` or no answer.
- **FR-008**: Design notes MUST hold at most 6 plain-language bullets (starting point, typing methods by group, marks handling, touch-layout source, removed-character count, rationale). Each bullet is absent when it has no content, and the section MUST NOT expose internal ids.
- **FR-009**: readme.htm MUST contain only:
  - the name,
  - the description,
  - the language line,
  - an "Adds:" line of letters and marks, truncated past a cap with "… and N more",
  - the font line,
  - the welcome-page pointer (only when there is something to type);
  - the existing help-page link.
- **FR-010**: README.md and readme.htm MUST be rendered from one shared set of facts, so they cannot state different values.
- **FR-011**: On Track 2, README.md MUST be fully regenerated, not appended to the inherited README. The description falls back as in User Story 5.
- **FR-012**: The in-studio documentation preview MUST show the same README.md and readme.htm as the output.
- **FR-013**: Fixed template wording MUST be English, as the README's existing fixed headings are.
- **FR-014**: The existing README checks MUST keep passing. In particular, the platforms listed in README.md must match the `.kmn` targets.

### Key Entities

- **README facts**: one per output production. They hold the languages, script, copied keyboard, layout family, the grouped extra characters, the removed characters, example typing rows and literal-trigger rows, the composition kind, the font note, the use case, tips, limitations, design-note bullets, links and platforms. Both README.md and readme.htm are rendered from these facts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a keyboard adding at least one character, a reader can find every added character, and at least one way to type each typing method, without leaving README.md.
- **SC-002**: A typical keyboard's README.md is 40–60 lines, and its readme.htm shows at most 8 visible lines of text.
- **SC-003**: No README.md or readme.htm states a character, keystroke or font the keyboard does not actually produce or the author did not supply. This is checked by tests on corpus-derived fixtures.
- **SC-004**: Zero placeholder strings ("to be confirmed", empty headings) appear in generated READMEs.

## Assumptions

- The typing rows, the grouping and the mechanism detection that welcome.htm already uses are reused as the source of truth. The README needs Markdown output where those currently produce HTML.
- The legacy `readmeMd` / `readmeHtm` stubs in the engine's `packageDocs.ts` are never shipped, because the projection overwrites them. They may be retired.
- Spec 102 FR-029 and User Story 4, and spec 080 FR-006, are amended for README.md by this spec. Their welcome and help behaviour is unchanged.
- Criterion `6.2-readme-htm-short` is unchanged, because the new readme.htm still satisfies it.
