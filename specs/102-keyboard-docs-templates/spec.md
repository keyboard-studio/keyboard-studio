# Feature Specification: Keyboard documentation templates and version policy

**Feature Branch**: `095-keyboard-docs-templates`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Keyboard documentation templates and version policy. Source design (approved 2026-10-14): [docs/design-notes/keyboard-docs-templates-and-versioning.md](../../docs/design-notes/keyboard-docs-templates-and-versioning.md). Author chooses Copy vs Adapt when picking the starting keyboard; Copy ships 1.0, Adapt ships the source version bumped, an invalid source version falls back to 1.0 with a notice; the shipped documentation explains how the keyboard works; each documentation file follows a fill-in form whose blanks are filled from the keyboard's design."

**Governing authority** (Constitution precedence): builds on [spec 061](../061-help-docs-generation/AS-BUILT.md) (help docs generation), [spec 080](../080-documentation-completeness/AS-BUILT.md) (documentation completeness) and [spec 094](../094-test-and-revise/AS-BUILT.md) (test-build versions). Version rules are held to [docs/criteria.md](../../docs/criteria.md) §2; documentation rules to §3, §5 and §11. The design note records the brainstorming decisions Q1–Q10 that this spec carries.

## Clarifications

### Session 2026-10-14

- Q: Should Copy vs Adapt be a new question? → A: No. The studio already asks it: the track question (`track_choice`, recorded as the `authoring-track` decision) offers Copy (a new keyboard, Track 1) and Adapt (modify this keyboard in place, Track 2). That one answer drives the version and the documentation. In this spec "Copy" means Track 1 and "Adapt" means Track 2. The new-ID "variant" mode, its 1.0 fallback notice and the provisional-proposal handling for old drafts are dropped.

**Ownership** (Constitution Art. VI): Engine owns version resolution, the derived documentation content, the form renderer and the studio wiring. Content owns the wording, headings and section order of the documentation forms and the new question's text.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new keyboard starts at the right version (Priority: P1)

An author picks an existing keyboard to start from and answers the existing track question: **Copy** (start a new keyboard from it) or **Adapt** (modify it in place). A copy ships as version 1.0. An adaptation keeps today's behaviour: the keyboard's version with its last number increased by one (2.3 → 2.4). Whatever the version, every place in the package that states it agrees.

**Why this priority**: Today a keyboard copied from a v3.2 keyboard ships as "3.2", a first release that claims a history it doesn't have. The version is visible to every user who installs the keyboard and to every reviewer, and it is cheap to get right.

**Independent Test**: Start from a keyboard at version 2.3, choose Copy, download: the package says 1.0 everywhere, where today it says 2.3.

**Acceptance Scenarios**:

1. **Given** the author chose Copy from a keyboard at 2.3, **When** they download or submit, **Then** the keyboard source, the package description, the download file name and the newest history entry all state version 1.0.
2. **Given** the author chose Copy and makes test builds, **When** each test build is produced, **Then** it ships at 0.1, 0.2, … and the release at 1.0.
3. **Given** the author chose Adapt (Track 2), **When** they download, **Then** the version behaves exactly as it does today.
4. **Given** a Copy keyboard, **When** the history file is produced, **Then** its newest entry carries the lineage line "Created from <source id> v<source version> via keyboard-studio.", in the same form as the existing Track 2 "Adapted from" line.

---

### User Story 2 - The documentation explains how the keyboard works (Priority: P1)

An author finishes a keyboard and downloads it. Without writing any extra prose, the welcome page and the help page explain how to type with it: a typing guide (each special character and its keystrokes), a short explanation of each input method the keyboard uses (such as deadkeys, a right-Alt layer, or pressing a key again to cycle), the layout pictures, what is on the phone and tablet layout, and the full list of characters the keyboard can type.

**Why this priority**: This is the gap the author hit when testing today: the shipped documents were bare. A keyboard user's first question is "how do I type ŋ?", and the studio already knows the answer.

**Independent Test**: Build a keyboard that uses deadkeys and a right-Alt layer, answer no documentation questions, download it: the welcome and help pages contain a typing guide, a paragraph for each of those two methods, the layout pictures and a character list, and the two pages carry the same text.

**Acceptance Scenarios**:

1. **Given** a keyboard that produces characters the underlying system layout cannot, **When** documentation is produced, **Then** a typing guide lists each such character, its Unicode name and the shortest keystroke sequence that types it, ordered by code point.
2. **Given** a keyboard that uses deadkeys and a right-Alt layer but no repeat-to-cycle keys, **When** documentation is produced, **Then** "How this keyboard works" has one paragraph each for deadkeys and the right-Alt layer and none for repeat-to-cycle.
3. **Given** a keyboard with a phone/tablet layout that uses long-press keys, **When** documentation is produced, **Then** an "On phones and tablets" section lists the long-press and flick characters; **Given** a keyboard with no phone/tablet layout, **Then** that section is absent, heading included.
4. **Given** any keyboard, **When** documentation is produced, **Then** a "Characters on this keyboard" section lists every character it can type, grouped as letters, marks, punctuation and symbols, and digits.
5. **Given** a combining mark appears in any generated table or list, **When** it is shown, **Then** it is drawn on a dotted circle and named by its Unicode name, never shown bare.
6. **Given** the same keyboard is downloaded twice, **When** the two packages are compared, **Then** every generated documentation file is identical.
7. **Given** the author is looking at the documentation preview, **When** they change the keyboard, **Then** the preview reflects the new typing guide and sections within the existing preview update, with no separate wait.

---

### User Story 3 - Each documentation file follows a consistent form (Priority: P2)

Each of the six documentation files (README, short package readme, welcome page, help page, history, licence) follows a fixed form: set headings in a set order, with blanks the studio fills from the keyboard's design and from the author's answers. A blank with nothing to fill removes its whole section. The content team can change the wording and order of a form without an engine code change.

**Why this priority**: The forms make every studio-made keyboard read the same way and pass the review criteria by construction. They depend on User Story 2's content, so they follow it.

**Independent Test**: Change a heading's wording in the welcome/help form only, regenerate: the new heading appears on both the welcome and help pages and nowhere else changes; no engine code was edited.

**Acceptance Scenarios**:

1. **Given** the six forms, **When** any keyboard's documentation is produced, **Then** the version number appears only in the history file and the copyright year only in the licence file.
2. **Given** the copyright holder is set once, **When** documentation is produced, **Then** every file that names a copyright holder names the same one.
3. **Given** any keyboard, **When** the welcome and help pages are produced, **Then** their bodies are the same text (after the help page's standard header and the welcome page's layout section are set aside).
4. **Given** a section whose blank has no content (e.g. no usage tips were given), **When** documentation is produced, **Then** neither the section nor its heading appears.
5. **Given** a form references a blank the studio does not provide, **When** the project's checks run, **Then** they fail and name the form and the unknown blank.
6. **Given** the author's free-text answer contains characters that are special in a web page (`<`, `&`), **When** the welcome and help pages are produced, **Then** the pages stay well-formed and show the author's text literally.
7. **Given** a keyboard with no documentation answers at all, **When** documentation is produced, **Then** each file is still a complete, criteria-clean document built from the derived sections, rather than the one-line placeholders shipped today.

---

### User Story 4 - Adaptations keep the original's documentation (Priority: P3)

When the author adapts a keyboard (Track 2), the original's written welcome and help text is kept as the starting point, and the generated sections are added after it. If the original's documentation already has its own typing table, the generated typing guide is left out so the page does not show two. Producing the documentation again replaces only the generated part.

**Why this priority**: Adaptations are variants; the original's prose is mostly still true and is often the best-written part. It is lower priority because Copy (the more common first-keyboard path) does not need it.

**Independent Test**: Adapt a keyboard whose help page has a hand-written typing table; download twice: the original prose is present once, the generated typing guide is absent, the other generated sections are present once, and the documentation checklist explains the omission.

**Acceptance Scenarios**:

1. **Given** the author chose Adapt, **When** documentation is produced, **Then** the original keyboard's welcome and help prose appears first and the generated sections follow; **Given** the author chose Copy, **Then** none of the original's prose is carried over (its images and page skeleton still are, as today).
2. **Given** the original's documentation contains a table or list holding at least half of the characters the generated typing guide would list, **When** documentation is produced, **Then** the generated typing guide is omitted, the other generated sections remain, and the Output step's documentation checklist says "Typing guide not generated: the original docs already include one."
3. **Given** the original keyboard's own documentation already contains a generated block from an earlier Keyboard Studio release, **When** documentation is produced, **Then** that old block is replaced, so the generated sections appear exactly once and the original prose is unchanged.

### Edge Cases

- **Source has no version or an invalid one.** Copy ships 1.0 regardless; Adapt keeps today's Track 2 behaviour.
- **Copy with test builds.** Test builds ship at 0.1, 0.2, … and the release at 1.0, so the release upgrades every tester's install.
- **Author switches Copy ↔ Adapt late.** The version, lineage line and inherited prose follow the new answer on the next preview and output; nothing from the previous answer lingers.
- **Very large keyboard** (hundreds of special characters). The typing guide switches to a grouped summary that points at the layout pictures instead of an unreadable table.
- **Character outside the renderer's coverage.** Shown as `U+XXXX` with its Unicode name.
- **Help prose written in another language.** Author prose keeps its language; generated headings and tables are in English (translated forms are out of scope).
- **Original keyboard's docs are malformed.** Inherited prose is carried as today; the existing documentation warnings report it as an upstream finding.

## Requirements *(mandatory)*

### Functional Requirements

**Version**

- **FR-001**: The version and the documentation MUST be driven by the existing track answer (`authoring-track` decision): Copy is Track 1, Adapt is Track 2. No new question or decision is added.
- **FR-002**: *(Removed by the 2026-10-14 clarification: no new question, so no provisional proposal.)*
- **FR-003**: *(Removed: see FR-001.)*
- **FR-004**: A Copy keyboard MUST publish at version 1.0, whatever the source keyboard's version.
- **FR-005**: *(Removed: the new-ID variant mode is dropped; Adapt is Track 2, covered by FR-007.)*
- **FR-006**: *(Removed: no variant mode, so no 1.0 fallback notice. Track 2 keeps today's handling of an invalid version.)*
- **FR-007**: Track 2 (Adapt) version behaviour MUST NOT change.
- **FR-008**: Test-build versions MUST sort strictly below the publish version: a Copy's test build N is 0.N; Adapt test builds follow the existing Track 2 rule.
- **FR-009**: The keyboard source's release version, the package description's keyboard version, the download/package file name and the newest history entry heading MUST all state the same resolved version. The project file's format version MUST NOT be changed.
- **FR-010**: For Copy keyboards, the criteria page MUST report the "strictly greater than the previously deployed version" criterion as not applicable (already true today; kept).
- **FR-011**: The newest history entry of a Copy keyboard MUST contain "Created from <source id> v<source version> via keyboard-studio.". The Track 2 "Adapted from" line is unchanged.

**How the keyboard works (derived content)**

- **FR-012**: The studio MUST derive the documentation's "how it works" content from the keyboard as built (including behaviour inherited from the starting keyboard that the author never touched), not only from the author's recorded decisions.
- **FR-013**: The derived content MUST include a typing guide: each character the keyboard produces that the underlying system layout does not, its Unicode name, and the shortest keystroke sequence that produces it, ordered by code point.
- **FR-014**: Above a size threshold, the typing guide MUST become a grouped summary that refers the reader to the layout pictures. The threshold is set during planning (initial value 200 characters).
- **FR-015**: The derived content MUST include one explanatory paragraph for each input method the keyboard actually uses, from at least: deadkeys, a right-Alt (AltGr) layer, repeat-to-cycle keys, and combining-mark typing order, in a fixed order. A method the keyboard does not use MUST NOT get a paragraph.
- **FR-016**: The derived content MUST include the existing per-layer layout pictures, unchanged in behaviour.
- **FR-017**: When the keyboard has a phone/tablet layout, the derived content MUST list its long-press and flick characters; otherwise that section MUST be absent.
- **FR-018**: The derived content MUST include an inventory of every character the keyboard can type, grouped as letters, marks, punctuation and symbols, and digits.
- **FR-019**: Every character in generated content MUST be identified by its code point: combining marks drawn on a dotted circle, every character named by its Unicode name, characters outside the renderer's coverage shown as `U+XXXX` (house accessibility rules, spec 056).
- **FR-020**: Generated documentation MUST be deterministic: the same keyboard and answers MUST produce byte-identical files.
- **FR-021**: The documentation preview MUST show the derived content and update within the existing preview derivation; this feature MUST NOT add a timer (decision D3).

**Forms**

- **FR-022**: Each documentation file (README, package readme page, welcome page, help page, history, licence) MUST be produced from a form: fixed text with named blanks. The forms MUST be content-owned data, editable without engine code changes.
- **FR-023**: A form MUST support only two constructs: insert a blank's value, and include a block only when a named blank is non-empty. No loops, conditions on values, or expressions.
- **FR-024**: A section whose blank is empty MUST be omitted entirely, heading included.
- **FR-025**: The welcome page and help page MUST be built from one shared body form so their bodies are identical by construction (criterion 11.10). The help page MUST keep the standard help-site header and fragment-only shape (spec 080 Decision B).
- **FR-026**: The forms MUST place the version only in the history file and the copyright year only in the licence file, and MUST draw the copyright holder from one source for every file.
- **FR-027**: Every value inserted into a web-page form MUST be escaped so the page stays well-formed; values inserted into Markdown forms MUST be escaped for Markdown.
- **FR-028**: The project's checks MUST fail when a form references an unknown blank or does not parse, naming the form and the problem.
- **FR-029**: The README form MUST hold the description, links (homepage and the keyboard's help-site page) and supported platforms; it MUST NOT include the typing guide. The package readme page MUST hold the description and a pointer to the help page.
- **FR-030**: With no documentation answers, the forms MUST still produce complete documents from identity and derived content, replacing today's one-line placeholders.
- **FR-031**: Existing author answers (description, usage tips, credits, contact, the optional extra sections, the documentation language) MUST keep their current meaning and appear in the forms; no saved answer may be lost.

**Inherited documentation**

- **FR-032**: For Adapt (Track 2), the original keyboard's welcome and help prose MUST be carried as the start of the body, with generated sections after it. For Copy, only the original's images and page skeleton are carried (unchanged from today). **Exception (issue #2206, Matthew's ruling 2026-10-17, amending spec 080 FR-007)**: on Copy, symptom/fix lines extracted from the base help's Troubleshooting section may be offered as editable suggestions for `pf_troubleshooting` from a separate extraction-only retention that is never carried into the body — see the FR-007 exception text in spec 080 for the full conditions. The carried body itself is unchanged by the exception.
- **FR-033**: Generated sections in documentation that also carries inherited prose MUST be delimited by start and end markers. A marked block already present in the inherited prose (from an earlier Keyboard Studio release) MUST be removed before the new one is added, so the generated sections appear exactly once.
- **FR-034**: When any table or list in the inherited prose contains at least half of the characters the generated typing guide would list, the generated typing guide MUST be omitted (other generated sections unaffected), and the Output step's documentation checklist MUST say why.
- **FR-035**: New studio UI text (the checklist note) MUST use message ids following spec 046. Generated document text lives in the content-owned forms, which are English only (see Assumptions).

### Key Entities

- **Resolved version**: the single version a download, submission or test build ships at, determined from the track, the source version and whether test builds exist.
- **Documentation content model**: the full set of named values a form can use: identity facts (name, ID, languages, platforms, copyright holder, year, documentation language), derived content (typing guide, input-method paragraphs, layout pictures, phone/tablet notes, character inventory), author answers, inherited prose, and history facts (version, date, entries, lineage line).
- **Documentation form**: one per documentation file plus the shared body; fixed text with named blanks; owned by the content team.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Copy keyboards ship at 1.0 and Adapt keyboards ship exactly as today, verified across the version test table (both tracks × one-, two- and three-part sources × with and without test builds × invalid source).
- **SC-002**: In every produced package, the four places that state a version agree (0 disagreements across the test table).
- **SC-003**: An author who answers no documentation questions gets welcome and help pages that tell a reader how to type every character outside the system layout (or, above the threshold, a grouped summary): 100% of special characters covered across the fixture keyboards (one each for deadkeys, right-Alt layer, repeat-to-cycle, combining marks, a phone/tablet layout, and none).
- **SC-004**: The project's existing documentation warnings report 0 findings attributable to the forms on studio-generated documentation across the same fixtures.
- **SC-005**: Producing documentation twice for the same keyboard gives byte-identical files; producing it twice for an adaptation gives exactly one copy of each generated section.
- **SC-006**: A wording or order change to a form takes effect with 0 engine code changes.
- **SC-007**: Drafts saved before this feature load with every documentation answer intact.

## Assumptions

- "Copy" and "Adapt" are the existing track answers (Track 1 and Track 2). Design note Q1–Q3 and Q10 (a separate new-ID variant mode) are superseded by the 2026-10-14 clarification.
- "Shortest keystroke sequence" is the fewest-step way to type the character, derived statically from the keyboard as built (the same derivation the character gallery uses); when two tie, a fixed ordering picks one so output stays deterministic.
- The "underlying system layout" for the typing guide is the base keyboard the working copy already declares (US English unless otherwise set).
- Forms are English only; translated form sets are a follow-up (design: out of scope). This is not the excluded "multi-language welcome.htm variants" (Constitution Art. VII): there is still one welcome page.
- No on-screen editor for generated sections in this feature (design Q5); authors influence content through the keyboard itself and their free-text answers.
- No "changes from the starting keyboard" documentation section; the history entry covers it (design Q4).
- The mechanism-paragraph wording is content-owned. Whether it lives inside the forms or in a separate content catalog is settled in planning.
