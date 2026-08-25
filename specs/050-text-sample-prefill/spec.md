# Feature Specification: Text-sample prefill (paste or upload)

**Feature Branch**: `050-text-sample-prefill`

**Created**: 2026-07-27

**Status**: Draft, scope corrected 2026-08-19 — FR-001/FR-002/FR-004 (multiline paste + extraction) already shipped (predates this spec); FR-003 (file upload), FR-005/FR-006 (044-contract propose-then-confirm + attribution), and FR-007 (union with exemplar) remain unbuilt. Not yet planned (`/speckit-plan` has not run).

**Input**: User description: "add another bullet point for 'Paste or upload a text' that gives a large multiline text box. The logic for the current alphabet textbox already supports raw text, just not multiline. This will also pre-fill the 'Add your whole alphabet', except it will be 'Confirm your alphabet' for both of the new bullet points."

## Context

> **Ground-truth correction (2026-08-19).** This section's original claim — "the only text
> entry point is a single-line `<input type="text">`... an author has nowhere to put [a
> paragraph]" — is **false against the current tree** and was already false when this spec
> was authored (2026-07-27). A modular question pair, `pb_text_sample` /
> `pb_text_sample_review` (`packages/studio/src/survey/questions/b/`), already exists,
> is registered in `registry.b.ts`, and is live in `content/flows/phase_b_characters.modular.yaml`
> — the manifest Phase B actually runs. `pb_text_sample` is a `type: "text"` question, which
> `QuestionField.tsx` renders as a **multiline textarea** (`isMultiLine = question.type ===
> "text"`), prompting "Paste a paragraph or more of text written in your language," and its
> `next` routes to `pb_text_sample_review`. Git history traces `pb_text_sample.ts` to commit
> `7b262941` — one of the earliest modular-question commits, predating this spec by weeks.
> **What this genuinely narrows the remaining scope to** (verified live, not re-derived):
> - **FR-001/FR-002/FR-004 (multiline paste + `harvestChars` extraction): DONE.** No work
>   needed.
> - **FR-003 (file upload): NOT DONE.** No `type="file"`/`FileReader` exists near this path.
> - **FR-005/FR-006 (propose-then-confirm per 044's attribution contract) and FR-007 (union
>   with exemplar coverage): NOT DONE.** `pb_text_sample_review` is a plain `type: "bool"`
>   yes/no gate ("Do you want to continue with this list?") whose `next` routes to
>   `pb_routing_branch` **regardless of the answer** — it is not wired to 044's chip-based,
>   per-character-attributed proposal UI (`SuggestionChip`/`ExemplarApplyAffordance` and
>   friends) at all. Its own help text describes ticking/unticking individual characters, but
>   no such per-character UI is rendered for this specific step — that text describes
>   aspirational behavior that was never built, or refers to editing on a later, unrelated
>   confirm page. Building FR-005/FR-006/FR-007 for real means replacing this bool gate with
>   044's actual proposal/attribution mechanism, not "wiring an existing thing" — it is closer
>   to net-new work than the original US2-only framing implied.
>
> **The real integration point is already reserved, not `pb_text_sample`.** `PhaseB.tsx`'s
> unified "build-list" page (the `IntroChooser`'s DEFAULT discovery method) has a
> `TextSamplePlaceholder` component, rendered beside `ExemplarApplyAffordance`, whose own
> code comment reads: *"The paste/upload route is owned by spec 050 and is deliberately NOT
> built here; 044 only guarantees the affordance is present on page 2 alongside the other
> two (FR-016b)."* It renders only a "Coming soon" message today. **This is this spec's real
> target** — not the `pb_text_sample`/`pb_text_sample_review` chain, which is reachable only
> via `IntroChooser`'s non-default **"manual" (step-by-step)** path, through
> `pb_discovery_intro`'s own `"text-sample"` radio option. Both paths are live and reachable
> (`pb_discovery_intro` is registered and present in `content/flows/phase_b_characters.modular.yaml`),
> but they are two different, non-interoperating mechanisms for the same idea — the
> `pb_text_sample` chain predates the build-list unification and never received 044's
> attribution/union treatment. This spec's scope is the build-list page's reserved slot;
> the manual-path chain is left as-is (out of scope for this spec, not deleted per §3.8 —
> a future consistency pass could unify them, but that is not required here).

> `ExemplarApplyAffordance` (`PhaseB.tsx`) is the concrete mechanism to mirror: it reads
> `usePhaseBDraftStore((s) => s.provenance)` / `s.seedFromProposal`, and calls
> `seedFromProposal(inv: SourcedInventory, bcp47?)` to union a proposal's characters into the
> draft, respecting sticky rejection (`rejected: string[]`) and per-character provenance
> tagging. Since union/attribution/sticky-rejection are already `phaseBDraftStore`'s generic
> behavior, wiring a `"text"` provenance source through this same path makes FR-005/FR-006/
> FR-007 largely a UI + adapter task (build a `SourcedInventory` from `harvestChars`/
> `harvestFromText`'s output, tagged `"text"`), not new state-management design.

> `harvestFromText(sample: string, base: BaseKeyboard): Promise<InventoryChar[]>`
> (`packages/engine/src/character-discovery/CharacterDiscoveryServiceImpl.ts`) takes a plain
> string — the file-upload path (FR-003) is `File.text()`/`FileReader.readAsText()` (100%
> client-side, satisfying Article V / FR-010 trivially) feeding the same function, no second
> extraction path.

The remaining prose below (User Scenarios, Requirements, Success Criteria) is left as
> originally written — it still correctly describes the *target* end state. Read it against
> the corrected scope above: US1's paste-and-extract mechanics are done (via the OLD,
> non-default path); the NEW build-list page's text-sample affordance, with its propose-
> then-confirm/attribution acceptance criteria, is what remains to build. US2 (upload) and
> US3 (union) are both fully unbuilt, as originally scoped.

Phase B's character-discovery list already names **Text sample** as a method at the
`CharacterDiscoveryService` contract level ([specs/008-data-flow/](../008-data-flow/spec.md)).
The extraction logic is already there: `harvestChars` captures **every distinct
character** in whatever it is given and drops only CR/LF/CRLF/tab/space (spec 047
FR-001/FR-002), reporting unusual invisibles rather than swallowing them.

This feature is the sibling of [044-cldr-sldr-exemplars](../044-cldr-sldr-exemplars/spec.md):
044 makes a **reference set** (CLDR/SLDR exemplars) prefill Phase B through a propose-then-
confirm, per-character-attributed contract (FR-016/FR-016a/FR-017, confirmed shipped and
verified this session). This spec's remaining work is making the author's **own corpus** go
through that *same* contract, rather than the older plain-confirm gate it goes through today.

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

- **Surface change, not logic**: `harvestChars` (consumed via `pb_text_sample`, see the
  corrected Context section above) already handles arbitrary raw text and already has its
  multiline surface; this feature adds the upload path and MUST NOT fork the extraction.
- **Depends on 044's prefill contract**: FR-016/FR-016a/FR-017 and the attribution model
  live in [044](../044-cldr-sldr-exemplars/spec.md) — confirmed shipped and verified this
  session (2026-08-19), so this dependency is satisfied. The remaining work is replacing
  `pb_text_sample_review`'s plain bool gate with that actual contract, not waiting on it.
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
