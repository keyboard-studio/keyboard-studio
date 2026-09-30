# Feature Specification: Help documentation generation from Phase F answers

**Feature Branch**: `061-help-docs-generation`

**Created**: 2026-08-07

**Status**: Implemented (US1–US4, all FRs/SCs) — shipped via PR #1585 (3bc73b7b), with post-review fixups (7e3c89a5, 51f96b11, e8534738). Retroactively verified 2026-08-19.

**Input**: User description: "Wire Phase F's help-docs survey answers (pf_welcome_paragraph, pf_usage_tip_1..5, pf_credits, pf_contact_info, pf_project_url, and the opt-in battery: pf_font_guidance, pf_design_rationale, pf_canonical_order, pf_script_glossary, pf_troubleshooting, pf_related_keyboards, pf_known_limitations, pf_further_reading, pf_scope_variety, pf_provenance_basis, pf_example_words, pf_doc_language) into the actual documentation artifacts a keyboard package ships: README.md, source/readme.htm, source/welcome.htm, source/help/<id>.php, combined with information already derivable from the keyboard's design (display name, primary BCP47 tag, Attribution copyright holder/author, store(&TARGETS) platform list, keyboard id). Every Phase F question module currently declares writes: [] and no outputs, so the survey collects real author content but nothing consumes it — the scaffolder/ensurePackageFiles ship placeholder text regardless of what the author answered."

**Governing context**: [spec.md](../../spec.md) §12 (output/delivery — the documentation members a Keyman package ships) and the Phase F survey design in [docs/workflow-model.md](../../docs/workflow-model.md) §4 ("Phase F targets only the help docs"). Target doc-file content requirements: [docs/keyboard-documentation-plan.md](../../docs/keyboard-documentation-plan.md). This spec does not re-derive that scope; it wires the already-designed survey answers to the already-documented file requirements.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Required description reaches every shipped doc file (Priority: P1)

As a keyboard author, when I answer the one required "what is this keyboard for" question, I want that description to actually appear in my keyboard's README, package popup text, welcome page, and online help page — not a generic placeholder — so anyone who receives my keyboard understands what it does without me editing files by hand afterward.

**Why this priority**: This is the one truly required answer in the entire help-docs step; today it is collected and then silently discarded. Wiring only this question already turns every shipped keyboard's documentation from a placeholder into real content, and needs nothing else to work first — the smallest correct, shippable slice.

**Independent Test**: Answer only the required description question, leave every other help-docs question blank, and produce the output package. Every shipped doc file (`README.md`, `source/readme.htm`, `source/welcome.htm`, `source/help/<id>.php`) contains the author's description text and none of today's placeholder text (`Welcome to <name>` / `<name> keyboard` / a bare title), and no file shows a blank section, `undefined`, or a leftover template comment.

**Acceptance Scenarios**:

1. **Given** an author has typed a description and answered nothing else in the help-docs step, **When** they produce the output package, **Then** the description appears (HTML-escaped where needed) in the package's README, popup text, welcome page, and online help page.
2. **Given** the author has not yet reached the help-docs step, **When** an output package is produced anyway (an early download), **Then** the shipped files fall back to today's placeholder behavior rather than failing the build.

---

### User Story 2 - Preview rendered documentation before producing output (Priority: P2)

As a keyboard author, I want to see what my README, package popup text, welcome page, and online help page will actually look like before I produce the output package, so I can catch a typo or an awkward-looking section and fix my answer without downloading, checking, and re-downloading.

**Why this priority**: Per [spec.md](../../spec.md) §3c, the studio never resolves a decision silently — an author's help-docs answers driving four generated files without any way to see the result first would be exactly that. This depends only on Story 1's rendering existing, and is valuable on its own before Stories 3 or 4 add more content to preview.

**Independent Test**: Answer the required description (and nothing else), open the documentation preview, and confirm it shows the same rendered text that Story 1's acceptance test verifies ends up in the shipped files. Change the answer, reopen or refresh the preview, and confirm it reflects the edit without producing an output package first.

**Acceptance Scenarios**:

1. **Given** the author has answered the required description question, **When** they open the documentation preview, **Then** it shows the rendered README, popup text, welcome page, and online help page content, matching what the output package would contain.
2. **Given** the author edits a help-docs answer while the preview is open, **When** the edit is saved, **Then** the preview updates to reflect it without requiring an output package to be produced.

---

### User Story 3 - Optional default-path answers reach the docs (Priority: P3)

As a keyboard author, when I add a usage tip, list who should be credited, give a community contact, or give a project website, I want each to show up in the right place in my shipped documentation, and I want any I skip to simply not appear — never as an empty or broken section — so my keyboard's help page looks complete however much I chose to fill in.

**Why this priority**: These are the remaining questions on the "default path" (the ~5-screen path every author sees without opting into more detail). Completing this slice makes the whole default authoring experience produce genuinely complete documentation, not just the one required field from Story 1.

**Independent Test**: Answer a subset of the optional default-path questions (e.g. one usage tip and a project URL, but skip credits and contact info) and produce the output package. The answered items appear in their designated locations; the skipped ones leave no visible trace.

**Acceptance Scenarios**:

1. **Given** the author supplies one usage tip, **When** the package is produced, **Then** the tip appears as a distinct item in the welcome page and online help page, alongside the required description.
2. **Given** the author supplies a project URL as two lines (a home page and a separate help page, one per line — the existing question's own supported format), **When** the package is produced, **Then** the README's links section shows both, correctly labeled.
3. **Given** the author leaves credits and community contact blank, **When** the package is produced, **Then** neither a "Credits" nor a "Contact" section appears anywhere in the shipped documentation.

---

### User Story 4 - Opt-in deep documentation reaches the online help page (Priority: P4)

As a keyboard author documenting real complexity (an uncommon script, involved rules, testing notes), I want the additional detail I choose to provide — design rationale, font guidance, mark ordering, troubleshooting, related keyboards, and so on — to appear as extra sections in my documentation, so users who need the deeper explanation can find it without me hand-writing HTML.

**Why this priority**: This is the opt-in battery, reached only when the author asks for more detail. It is real, valuable content the survey already collects, but it affects a minority of keyboards and depends on Stories 1 and 2 already working — the right thing to build last.

**Independent Test**: Opt into the additional-detail branch, answer two or three opt-in questions (e.g. design rationale and known limitations), leave the rest blank, and produce the output package. The answered sections appear as clearly labeled additional sections in both the welcome page and the online help page; the unanswered opt-in questions leave no trace.

**Acceptance Scenarios**:

1. **Given** the author opts into additional detail and answers only the design-rationale and known-limitations questions, **When** the package is produced, **Then** both appear as separate labeled sections, and no section appears for any opt-in question the author skipped.
2. **Given** the author's keyboard routes past a script-specific opt-in question (e.g. canonical mark order, gated to non-Latin scripts by the existing survey flow), **When** the package is produced, **Then** the generated section reflects only what the survey actually asked this author — this scenario validates the existing routing carries through unchanged, not new generation logic.

---

### Edge Cases

- An author revises a help-docs answer after already producing one output package, then produces the package again: the new package MUST reflect the updated answer, never a stale prior render.
- An author's free-text answer contains HTML-significant characters (`<`, `>`, `&`): the shipped `.htm`/`.php` files MUST remain well-formed regardless.
- An author answers Phase F but never reaches output (abandons the session): no special handling required — nothing is written until an output package is actually produced.
- Adapting an existing published keyboard whose base already ships its own hand-authored welcome page and online help page, where the author also answers Phase F questions: the existing content is preserved and the new answers are merged alongside it (FR-013).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST carry the required "what is this keyboard for" answer into every shipped documentation file that currently receives placeholder text (`README.md`, `source/readme.htm`, `source/welcome.htm`, `source/help/<id>.php`).
- **FR-002**: System MUST leave a shipped documentation file's placeholder text unchanged when the author has not yet answered the required description question — no build failure, no blank file.
- **FR-003**: System MUST render each optional default-path answer (usage tip, credits, community contact, project link) into its designated location in the shipped documentation when supplied, and MUST omit that item's section entirely — not as an empty placeholder — when the answer is blank.
- **FR-004**: System MUST split a project-link answer that supplies both a project home page and a separate help/documentation page (one per line, the existing question's own supported format) into distinct, correctly labeled entries in the shipped README's links section.
- **FR-005**: System MUST keep the bundled welcome page's and the online help page's documentation body identical wherever they cover the same answers, so the two never visibly disagree (matches the existing corpus cross-file parity expectation).
- **FR-006**: System MUST set the shipped welcome page's and online help page's declared language to the keyboard's own primary language, not a fixed default.
- **FR-007**: System MUST NOT embed a version number or a copyright year in `README.md`, `source/readme.htm`, `source/welcome.htm`, or `source/help/<id>.php` — those remain sourced only from `HISTORY.md`, the keyboard's own version metadata, and `LICENSE.md`.
- **FR-008**: System MUST list only the platforms the keyboard actually supports in `README.md`'s supported-platforms section, derived from the keyboard's own build configuration rather than a fixed full list.
- **FR-009**: System MUST safely render any free-text author answer containing HTML-significant characters, so shipped `.htm`/`.php` files remain well-formed regardless of what the author typed.
- **FR-010**: System MUST regenerate shipped documentation from the author's current answers every time an output package is produced, so an edited answer is reflected in the next package rather than a stale prior render.
- **FR-011**: System MUST render each opt-in "additional detail" answer (design rationale, font guidance, known limitations, troubleshooting, related keyboards, and the rest of that battery) as its own clearly labeled section in the shipped welcome page and online help page when supplied, and omit it when not answered.
- **FR-012**: System MUST record a project link the author supplies in the keyboard's package metadata — today the survey tells the author this happens, and it does not.
- **FR-013**: When adapting an existing published keyboard that already ships its own hand-authored welcome page / online help page, System MUST merge the author's new help-docs answers alongside that existing content rather than replacing or discarding it — the base keyboard's original writing is preserved, and newly-answered content is added to it.
- **FR-014**: System MUST render the full opt-in "additional detail" battery (font guidance, design rationale, canonical order, script glossary, troubleshooting, related keyboards, known limitations, further reading, scope/variety, provenance basis, example words) in scope for this feature, not deferred to a later feature.
- **FR-015**: System MUST provide an in-studio preview of the rendered documentation (README, popup text, welcome page, online help page) that reflects the author's current help-docs answers, viewable before the author produces an output package, and that updates when an answer changes.

### Key Entities

- **Help documentation answer**: A single piece of author-supplied content from the help-docs step (description, a usage tip, credits, contact info, project link, or one of the opt-in detail answers). Optional except for the description.
- **Design-derived metadata**: Information already established elsewhere in the keyboard's design — display name, primary language, copyright holder/author, and supported-platform list — that documentation generation reads but does not itself collect.
- **Shipped documentation file**: One of the four files an output package delivers to describe the keyboard to its end users (package listing text, package popup text, bundled welcome page, online help page). Each is assembled from some combination of help documentation answers and design-derived metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every keyboard produced after answering only the required description question ships with that description visible in all four documentation files, with zero placeholder text remaining.
- **SC-002**: An author who fills in the full default path (description, one tip, credits, contact, project link) can find every one of those five answers, unedited, somewhere in their produced package's documentation, with no manual post-download editing required.
- **SC-003**: An author who skips every optional question sees no empty or broken-looking section (no stray heading, no "undefined", no leftover placeholder comment) anywhere in the produced documentation.
- **SC-004**: Changing a help-docs answer and producing the package again always reflects the new answer — a second production run is never stale.
- **SC-005**: The bundled welcome page and the online help page never disagree in content for the same keyboard, verified by comparing their rendered text bodies.
- **SC-006**: An author can view accurate rendered documentation before ever producing an output package, and an edited answer is reflected in that view without a package having to be produced first.

## Assumptions

- The existing Phase F question set ([content/flows/phase_f_helpdocs.modular.yaml](../../content/flows/phase_f_helpdocs.modular.yaml)) is the authoritative source of what content authors can supply; this feature wires the existing questions through to output and does not add or remove questions.
- The copyright/attribution pipeline (author name, copyright holder feeding `LICENSE.md` and `.kps`) is already fully wired and out of scope; only the four documentation files that currently receive placeholder text are in scope.
- New-from-base keyboards have no pre-existing welcome page or online help page to merge with, so FR-013's merge behavior only has effect when adapting an existing keyboard.
- `HISTORY.md` and `LICENSE.md` are out of scope — already correctly wired to design-derived metadata, and FR-007's no-version/no-copyright rule depends on them staying the sole source, so this feature deliberately does not touch them.
- "Produce the output package" covers every delivery mode the studio already supports (download `.kmp`, download `.zip`, GitHub fork+PR) equally; this feature does not distinguish between them.
