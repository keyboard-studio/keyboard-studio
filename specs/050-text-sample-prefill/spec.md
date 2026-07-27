# Feature Specification: Text-sample prefill (paste or upload)

**Feature Branch**: `050-text-sample-prefill`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "add another bullet point for 'Paste or upload a text' that gives a large multiline text box. The logic for the current alphabet textbox already supports raw text, just not multiline. This will also pre-fill the 'Add your whole alphabet', except it will be 'Confirm your alphabet' for both of the new bullet points."

## Context

Phase B's character-discovery list already names **Text sample** as a method at the
`CharacterDiscoveryService` contract level ([specs/008-data-flow/](../008-data-flow/spec.md)),
but the studio has never surfaced it: the only text entry point is a **single-line**
`<input type="text">` in `CharChipEditor` with the placeholder *"Type your alphabet with a
space between each character."* An author holding a paragraph of real text in their
language has nowhere to put it.

The extraction logic, however, is already there. `harvestChars` captures **every distinct
character** in whatever it is given and drops only CR/LF/CRLF/tab/space (spec 047
FR-001/FR-002), reporting unusual invisibles rather than swallowing them. Pasting a
paragraph into today's box already works — it is the surface, not the logic, that assumes
one line.

This feature is the sibling of [044-cldr-sldr-exemplars](../044-cldr-sldr-exemplars/spec.md):
044 makes a **reference set** (CLDR/SLDR exemplars) prefill Phase B; this one makes the
author's **own corpus** do the same, through the same propose-then-confirm contract
(044 FR-016/FR-016a/FR-017). Neither is a new screen, and neither auto-confirms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paste a paragraph and get an alphabet (Priority: P1)

An author has a paragraph of text in their language — a Bible portion, a school primer, a
WhatsApp message. They choose "Paste or upload a text", paste it into a large multiline
box, and the next screen opens with every distinct character from that text already
proposed, ready to check.

**Why this priority**: It is the whole feature, and it is the most trustworthy signal an
author can give — characters they demonstrably use, not characters a reference set
predicts. It works for languages no exemplar source covers.

**Independent Test**: Paste a known paragraph, continue, and assert the proposed alphabet
equals the distinct-character set of that paragraph (minus whitespace).

**Acceptance Scenarios**:

1. **Given** a language with no exemplar coverage, **When** the author pastes a paragraph,
   **Then** every distinct character from it is proposed, attributed to the text, and the
   heading becomes "Confirm your alphabet".
2. **Given** a pasted text containing a character the author does not want (a stray Latin
   letter in a name), **When** they remove it and re-enter the step, **Then** it stays
   removed.
3. **Given** an empty or whitespace-only paste, **When** the author submits it, **Then**
   the draft stays empty, the heading stays "Add your whole alphabet", and no error blocks
   the step.

---

### User Story 2 - Upload a file instead of pasting (Priority: P2)

The author's sample is a file, not something they can comfortably paste. They upload a
plain-text file and get the same result.

**Why this priority**: Same value as US1 for a common real-world shape (a corpus lives in
a file), but paste covers the majority of first-time authors, so it can follow.

**Independent Test**: Upload a fixture `.txt` and assert the same proposal as pasting its
contents.

**Acceptance Scenarios**:

1. **Given** a plain-text file, **When** the author uploads it, **Then** the proposal is
   identical to pasting the same bytes.
2. **Given** a file the tool cannot read as text, **When** it is uploaded, **Then** the
   author is told plainly and the step is not blocked.

---

### User Story 3 - Combine a text with exemplar coverage (Priority: P3)

The author's language *is* covered by CLDR or SLDR **and** they have a text. Both
proposals appear, each character showing where it came from.

**Why this priority**: Strictly additive over US1 and 044, and only reachable once both
have landed.

**Independent Test**: For a covered tag, paste a text missing one exemplar character and
assert the union is proposed with per-character attribution.

**Acceptance Scenarios**:

1. **Given** exemplar coverage and a pasted text, **When** the author both accepts the
   exemplar offer and pastes, **Then** the draft is the **union** of both, each character
   attributed to its source(s). Neither action overwrites the other's contribution.
2. **Given** a character present in both, **When** the author inspects it, **Then** it is
   shown as attested by both rather than duplicated.

### Edge Cases

- **Very large paste/upload**: extraction must stay responsive and must not block the
  step's first paint; the distinct-character set of a large corpus is still small.
- **Mixed-script text** (loanwords, names, URLs): out-of-script characters are proposed
  and surfaced, not silently dropped — the existing cross-check posture.
- **Unusual invisibles**: retained per 047 FR-002/FR-003 and made discoverable, not
  swallowed.
- **Text in the wrong language**: the tool cannot detect this; the confirm step is the
  safeguard, which is why the proposal is never auto-confirmed.
- **Encoding**: an uploaded file that is not decodable as UTF-8 text fails loudly rather
  than proposing mojibake as an alphabet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The alphabet page MUST offer paste-or-upload **on the page itself**,
  alongside the existing character box and the exemplar affordance — not as its own screen.
  The three ways to fill the alphabet are complementary and an author may use any
  combination. The discovery method list names it in the second option's label ("Enter
  your alphabet, or discover it from text") rather than carrying a fourth option.
- **FR-002**: That entry point MUST provide a **multiline** text area sized for a
  paragraph, not a single-line field.
- **FR-003**: It MUST accept a plain-text **file upload** producing the same result as
  pasting the file's contents.
- **FR-004**: Character extraction MUST reuse the existing `harvestChars` path — every
  distinct character captured, CR/LF/CRLF/tab/space dropped, unusual invisibles retained
  and reported. No second extraction implementation.
- **FR-005**: The extracted set MUST prefill the alphabet step as a **proposal**, using
  the propose-then-confirm contract of 044 (FR-016/FR-016a/FR-017): proposed characters
  distinguishable from author-entered ones, removal sticky, nothing recorded until the
  author confirms.
- **FR-006**: Each proposed character MUST be attributed to the text sample, distinctly
  from exemplar-sourced characters.
- **FR-007**: When both a text sample and exemplar coverage are available, the proposals
  MUST **union**, with per-character attribution and no precedence rule between them.
- **FR-008**: An empty, whitespace-only, or unreadable input MUST leave the step in its
  un-prefilled state with a plain message and MUST NOT block the survey.
- **FR-009**: Character **frequency** derived from the sample MAY be retained as advisory
  (a placement hint) but MUST NOT filter the proposal, and MUST NOT introduce a wordlist,
  frequency corpus, or prediction model (§16 enumeration-only).
- **FR-010**: The sample text MUST remain in memory for the session only — never written
  to host disk, never uploaded off-device (Article V).

### Key Entities

- **Text sample**: a session-scoped string supplied by paste or file upload; the source of
  a proposal, not itself persisted into the working copy.
- **Proposal attribution**: per-character provenance (`text` / `cldr` / `sldr` / `author`),
  shared with 044 so a union is inspectable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a language with no exemplar coverage, an author who pastes a
  representative paragraph reaches the confirm step having typed **0** characters by hand.
- **SC-002**: The proposed set equals the distinct-character set of the input (minus
  dropped whitespace) in 100% of fixture cases.
- **SC-003**: A removed proposed character does not reappear on re-entry, in 100% of cases.
- **SC-004**: Pasting a text and uploading the same text as a file produce identical
  proposals.
- **SC-005**: No regression to the existing single-line add-a-character path.

## Assumptions

- **Surface change, not logic**: `harvestChars` ([packages/studio/src/survey/PhaseB.tsx](../../packages/studio/src/survey/PhaseB.tsx))
  already handles arbitrary raw text; this feature adds a multiline surface and an upload,
  and MUST NOT fork the extraction.
- **Depends on 044's prefill contract**: FR-016/FR-016a/FR-017 and the attribution model
  live in [044](../044-cldr-sldr-exemplars/spec.md). If 044 has not landed, this feature
  either waits or lands that contract first — it does not build a parallel one.
- **No new screen and no new discovery choice**: the text area lives on the existing
  alphabet page beside the character box and the exemplar affordance. It is surfaced in
  the intro's second option label ("Enter your alphabet, or discover it from text"), which
  044 renumbers to second behind the exemplar option — this feature adds no option of its
  own.
- **Plain text only**: `.txt`-style input. Extracting text from `.docx`/`.pdf`/`.odt` is
  out of scope; revisit only if authors actually arrive with those.
- **Ownership**: the text area, upload, and extraction wiring are Engine/front-end; the
  entry-point wording and the "please check this" framing are Content-owned per the
  §12/§13 split.
- **Language detection is not attempted**: the tool does not verify the text is in the
  claimed language; the confirm step is the safeguard.
