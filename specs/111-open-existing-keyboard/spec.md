# Feature Specification: Open an existing keyboard

**Feature Branch**: `111-open-existing-keyboard`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Replace the Adapt track with an Open path that updates an existing keyboard from the repository in place (same keyboard ID, new version, submitted as a replacement), keeping the Copy path unchanged. Keep hand-written documentation and hand formatting; import every file, run the criteria, patch rather than regenerate; warn, suggest consistent follow-ups, and let the author justify deliberate non-compliance." Full brief and owner rulings: see [Decisions carried](#decisions-carried-owner-rulings-2026-11-03).

**Comparison of the two paths**: [Open vs Copy Paths](https://claude.ai/artifact/AYxRNW81DyN1Dcq6ZF3Hjt) (step-by-step: converges / tweaked / differs / Open only / Copy only).

## Why

The Adapt track (Track 2) was designed to carve a keyboard *down* into a new one. Authors use it to *update* the keyboard they opened, and it damages that keyboard:

- **It narrows to one language.** The package descriptor is never loaded, so output generates a new one with a single language. Opening the Cameroon QWERTY country keyboard (278 languages) and submitting it ships a keyboard for one language.
- **It regenerates hand-written files.** README, readme.htm and the package descriptor are rebuilt from templates. HISTORY gains "Adapted from" naming the keyboard itself. Welcome sub-pages are dropped.
- **It reformats the source.** Almost any edit regenerates the keyboard source file: comments move to the top, stores are reordered, blank lines vanish. Across the corpus, about 415 keyboards change surviving content when regenerated this way.
- **Its Code tabs show regenerated text, not the file.** Applying an edit updates only the in-memory model.

Most keyboards in the repository work but don't meet every criterion. Updating them is a different job from creating a keyboard: keep what the author wrote, find what falls short, fix it with the author's agreement, and show the reviewer what changed.

## Vocabulary

- **Open**: updating an existing keyboard: same keyboard ID, new version, submitted as a replacement. It is not an import.
- **Copy**: creating a new keyboard (new ID) from a **copied keyboard**.
- **Starting point**: what the working copy was created from: the copied keyboard for Copy, the opened keyboard's current version for Open.
- **Baseline**: the criteria results of the opened keyboard as loaded, before any change.
- **Suggested fix**: a change the studio offers and the author accepts or declines. It is never applied automatically.
- **Review note**: the author's written reason for keeping a change that makes a criterion fail that passed at the baseline.

"Base keyboard" keeps its Keyman meaning: the operating-system layout Keyman falls back to. It is never used for the copied or opened keyboard.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Update a multilingual keyboard without losing anything (Priority: P1)

An author opens the Cameroon QWERTY keyboard to fix one rule. They make the edit and submit. The submitted keyboard still lists all 278 languages, keeps its README, welcome pages, help and history text, keeps the source file's comments and layout, and carries a bumped version with a new HISTORY entry.

**Why this priority**: This is the defect that makes today's track unusable for its real job. Without it, nothing else on the Open path is safe to use.

**Independent Test**: Open a multilingual keyboard and submit with no edits, then with one rule edit. Compare the output with the source, file by file.

**Acceptance Scenarios**:

1. **Given** a keyboard whose package lists many languages, **When** the author opens it and submits without edits, **Then** the package lists the same languages in the same order, and every file is unchanged except the version and the new HISTORY entry.
2. **Given** an opened keyboard, **When** the author edits one rule and submits, **Then** the source file differs from the original only in that rule's lines, the version and the HISTORY entry.
3. **Given** an opened keyboard with a hand-written README, welcome page and help page, **When** the author submits, **Then** those files are carried unchanged unless the author accepted a suggested fix for them.
4. **Given** an opened keyboard, **When** the author submits, **Then** HISTORY.md gains one new "Updated" entry above the existing history and never an "Adapted from" line naming the keyboard itself.
5. **Given** an opened keyboard, **When** the author edits its language list (add, remove, reorder), **Then** the package reflects exactly that list.
6. **Given** a multilingual keyboard, **When** it opens, **Then** the expected characters are the union of its languages' exemplar characters, and any it can't type are listed as pre-existing findings with "add character" fixes.
7. **Given** an opened keyboard, **When** the author adds a language whose exemplars include characters the keyboard can't type, **Then** those characters appear as new findings.

---

### User Story 2 - See what was already wrong and what I broke (Priority: P1)

On opening, the author sees the keyboard's criteria results with every finding marked **pre-existing**. As they edit, findings they cause are marked **new**. Pre-existing findings never block submission. A criterion that passed at the baseline and now fails blocks submission until the author fixes it or writes a review note, which appears in the PR body.

**Why this priority**: Reviewers need to know what the update changed, and authors must not be blocked by problems they inherited. This is the guardrail that makes a full code editor safe to offer.

**Independent Test**: Open a keyboard with known failures, introduce one regression, and attempt to submit. Then justify it and submit.

**Acceptance Scenarios**:

1. **Given** an opened keyboard, **When** it loads, **Then** the criteria view shows every finding marked pre-existing, and no new findings exist.
2. **Given** a criterion that passed at the baseline, **When** an edit makes it fail, **Then** the finding is marked new and links to the change area that caused it.
3. **Given** one or more new failures without review notes, **When** the author tries to submit, **Then** submission is blocked and the view lists each one with the choice to fix it or write a note.
4. **Given** a review note for each new failure and a clean compile, **When** the author submits, **Then** submission proceeds and the PR body lists every note beside its criterion.
5. **Given** a new failure the author later fixes, **When** the criterion passes again, **Then** its review note is dropped and not printed in the PR body.
6. **Given** only pre-existing failures, **When** the author submits, **Then** nothing blocks, and the PR body lists them as inherited.

---

### User Story 3 - Edit the real files (Priority: P2)

The author opens the code view of the keyboard source, the on-screen keyboard and the touch layout. They see the actual file text, including comments and formatting. They edit and apply, and the rest of the studio reflects the change. Studio tools (galleries, suggested fixes, remove tool) change only the parts of the file they touch.

**Why this priority**: Unclean keyboards often need edits no gallery models. Without real-text editing, authors go back to editing outside the studio.

**Independent Test**: Edit a comment and a rule in the code view, apply, and check the preview, criteria and output. Then use a gallery to add a rule and check that only the inserted lines differ.

**Acceptance Scenarios**:

1. **Given** an opened keyboard, **When** the author opens a code view, **Then** it shows the file's actual text, not a regenerated version.
2. **Given** an edit that parses, **When** the author applies it, **Then** the text is saved as written, including formatting-only changes, and every other surface updates from it.
3. **Given** an edit that doesn't parse, **When** the author tries to apply it, **Then** it is refused with positioned errors, and the edited text stays in the editor.
4. **Given** an edit that parses but doesn't compile, **When** the author applies it, **Then** it is saved, and the compile error blocks submission (not Apply).
5. **Given** a studio tool that changes one part of the file, **When** its change is applied, **Then** lines outside that part are unchanged.
6. **Given** a change that cannot be placed precisely in the existing text, **When** the studio would have to regenerate the whole file, **Then** the author is told which file will be reformatted, and asked before it happens.

---

### User Story 4 - Choose which copy of the keyboard to open (Priority: P2)

The author searches for a keyboard by name, ID or language. If the copy in keymanapp/keyboards differs from the copy in keyboard-studio/keyboards, the author sees both and chooses. If choosing upstream would undo curated work in the studio's repository, a warning says so.

**Why this priority**: The studio's repository is curated for some keyboards and stale for others. Opening the wrong copy either loses curation or reverts upstream fixes.

**Independent Test**: Open a keyboard that is identical in both repositories (no choice shown), one that is curated in the studio's repository, and one where the studio's repository is behind upstream.

**Acceptance Scenarios**:

1. **Given** a keyboard identical in both repositories, **When** the author opens it, **Then** no choice is shown.
2. **Given** a keyboard that differs, **When** the author opens it, **Then** both copies are shown with their repository names, and the author picks one.
3. **Given** a keyboard curated in the studio's repository, **When** the author picks the upstream copy, **Then** a warning says the submission will replace the curated copy.
4. **Given** either choice, **When** the author submits, **Then** the pull request goes to keyboard-studio/keyboards, and its body names the repository and version the update was made against.

---

### User Story 5 - Keep the keyboard consistent as I change it (Priority: P2)

After each applied change, the studio compares the physical keys, touch layout and documentation for what this change added or removed. It offers follow-ups: a character added to touch can be added to the physical keys and the docs, and the reverse; a new layer or character can be added to the help; a removal can be repeated on the other parts. The author accepts, skips or ignores each one.

**Why this priority**: Unclean keyboards are usually inconsistent between desktop, touch and docs. Edits are the moment to stop the drift growing, without forcing a fix.

**Independent Test**: Add a character on touch only, apply, and check that the suggestions offer the physical and docs follow-ups. Skip one, accept one, and check the results.

**Acceptance Scenarios**:

1. **Given** a change that adds a character to touch only, **When** it is applied, **Then** suggestions offer to add it to the physical keys and to the docs.
2. **Given** a change that adds a character to the physical keys only, **When** it is applied, **Then** a suggestion offers to add it to touch.
3. **Given** a change that removes a character from one part, **When** it is applied, **Then** a suggestion offers the matching removal on the other parts that still have it.
4. **Given** inconsistencies that existed before this change, **When** a change is applied, **Then** they do not appear as suggestions; they stay in the criteria view as pre-existing findings.
5. **Given** any suggestion, **When** the author does nothing, **Then** nothing is changed.

---

### User Story 6 - Upgrade the keyboard's Keyman structure (Priority: P3)

The criteria view lists upgrades the keyboard would benefit from, each with a suggested fix. For example, a cased-script keyboard that relies on CAPS rules and lacks the cased-keys declaration gets a suggestion to add the declaration and remove the CAPS rules it replaces.

**Why this priority**: The upgrades bring old keyboards up to current Keyman practice, but the update is valuable without them.

**Independent Test**: Open upstream basic_kbdus, accept the cased-keys suggestion, and check that the criterion passes and the source differs only in the added declaration and the removed CAPS rules.

**Acceptance Scenarios**:

1. **Given** an opened keyboard that fails an upgrade criterion, **When** the criteria view loads, **Then** the finding offers its suggested fix.
2. **Given** an accepted upgrade fix, **When** it is applied, **Then** the criterion passes, and only the lines the upgrade concerns change.
3. **Given** an opened keyboard, **When** it loads, **Then** no upgrade is applied without the author accepting it.

---

### User Story 7 - Fill gaps in the documentation, keep what's written (Priority: P3)

The help step asks only about documentation that is missing or fails a criterion, prefilled from the existing documents. Regenerating a document, or one section of it, is a suggested fix the author can preview first.

**Why this priority**: Most existing keyboards have usable but imperfect docs. Authors need help with the gaps without losing what's there.

**Independent Test**: Open a keyboard with complete docs (no doc questions asked) and one with a missing help page (questions asked only for that page).

**Acceptance Scenarios**:

1. **Given** documentation that meets its criteria, **When** the author reaches the help step, **Then** no question about it is asked.
2. **Given** a missing document, **When** the author reaches the help step, **Then** questions are asked for that document only, prefilled from what the other documents say.
3. **Given** a suggested regeneration, **When** the author previews it, **Then** they see the current and proposed text side by side before accepting.

---

### User Story 8 - Walk an opened keyboard step by step (Priority: P1)

*(Added 2026-11-05.)* Opening a keyboard starts a walk, not a dashboard. The walk has fixed steps and adds a page only when the opened keyboard has that kind of problem. Every step has Continue, and the walk ends at Output.

The walk on Open:

1. **Languages** (always): the package's language list.
2. **Letters** (always for a keyboard that is not basic; for a basic keyboard only when it can't type letters its languages need): shows the characters the keyboard types, read from what it produces, for the author to confirm. An author may add characters, or even letters, beyond the base set, so the page always shows for a non-basic keyboard. Letters the listed languages need but the keyboard can't type are grouped by language, and the author adds a letter or removes a language the keyboard isn't meant to support. Adding puts the character in the character inventory; it places nothing. Replaces the character survey.
3. **Upgrades** (only when an upgrade criterion fails), before the galleries so authors edit the upgraded keyboard: one entry per upgrade, each with a preview and Apply or Skip. Upgrades may be structural. The first two are cased keys (criterion 7.28: remove the CAPS rules and add the cased-keys declaration in the source) and the touch caps layer (criterion 18.16, following Keyman's Capsifesto: add a caps layer reached by double-tapping Shift).
4. **Mechanisms** (every keyboard except a basic one, whose physical layout never changes): the Mechanisms gallery, where added characters get their keys, as on Copy. Marks, sequences and rules stay opt-in tools.
5. **On-screen keyboard** and **Touch** (always): edit the existing files, or generate them when missing. Touch is the touch gallery, where unplaced characters get touch keys, on basic keyboards too.
6. **Documentation** (only when documentation is missing or fails its criteria; Story 7).
7. **Review** (always): the criteria view, with pre-existing and new findings, review notes and the submit gate.
8. **Output**.

**Why this priority**: Without it an opened keyboard has no path from the criteria view to submission.

**Independent Test**: Open upstream basic_kbdus and walk it with Continue only, from Languages to Output. Then open a keyboard that has no missing letters and no failing upgrades, and check that those pages are skipped.

**Acceptance Scenarios**:

1. **Given** the author opens a keyboard, **When** it loads, **Then** the Languages step shows, with Continue.
2. **Given** a keyboard that can't type letters its listed languages need, **When** the author continues from Languages, **Then** Missing letters shows each language with its missing letters, and offers to add each letter or remove that language.
3. **Given** a keyboard with no missing letters and no failing upgrade criterion, **When** the author walks it, **Then** neither page appears.
4. **Given** an upgrade the author applies, **When** it is applied, **Then** only the lines and layers that upgrade concerns change (FR-008), and its criterion passes.
5. **Given** the author reaches Review, **When** they continue, **Then** Output opens, with the same submit gate as FR-027.

---

### Edge Cases

- **The keyboard source can't be parsed.** Opening fails with a message naming the problem and its line. No partial working copy is created.
- **A part is missing** (no touch layout, no on-screen keyboard file, no package descriptor). The criteria view reports it as pre-existing, with a suggested fix to generate it.
- **The keyboard exists in only one repository.** It opens from that repository, with no choice shown.
- **The keyboard has no `&KEYBOARDVERSION`.** The version bump creates or updates the keyboard version and never changes the file-format `&VERSION`.
- **The author changes the display name.** It is allowed. The keyboard ID cannot change on Open; a new ID means Copy.
- **A suggestion applies to a part that doesn't exist** (e.g. add to touch on a desktop-only keyboard). The suggestion offers to create the part, or is skipped.
- **A draft saved under the old Adapt track** reopens as an Open session. Its working copy is kept, and any regenerated files it already holds are listed as changes for the author to keep or revert.
- **Opaque constructs** the studio can't model are kept verbatim. Code-view edits can change them; tools can't.
- **Multi-line rules** continued over several lines must be replaced as a whole when a tool changes them.
- **A review note on a criterion that later passes** is dropped (Story 2).
- **The keyboard is in experimental/.** Open works the same; placement criteria apply as for any keyboard.

## Requirements *(mandatory)*

### Functional Requirements

**Entry and source**

- **FR-001**: The studio MUST offer a start screen with two choices, "Create a new keyboard" (the leading, most prominent option) and "Open an existing keyboard". The start screen MUST follow sign-in or continuing as a guest, MUST be where a returning author without a draft lands, and MUST stay reachable from the navigation bar at any time. Each choice MUST record the authoring track, and the Copy walk MUST NOT offer Open again (its track step asks only a draft with no recorded track, and offers Copy only). Opening MUST search by name, keyboard ID or language.
- **FR-002**: When a keyboard's source differs between keymanapp/keyboards and keyboard-studio/keyboards, the studio MUST let the author choose which to open. When they are identical, it MUST open without asking.
- **FR-003**: The studio MUST warn when the chosen upstream copy would replace curated content in keyboard-studio/keyboards.
- **FR-004**: Submissions from Open MUST target keyboard-studio/keyboards, and MUST record the source repository and version in the PR body.
- **FR-005**: Open MUST NOT include the identity-first steps (target language and script, community layout, choosing a keyboard to copy, authoring track, project name). These are declared through the step manifest and screen gates, not a hand-kept list (Constitution Article IX).

**Import and preservation**

- **FR-006**: Opening MUST bring every file of the keyboard folder into the working copy. Files are stored as their text, with structured models derived for the source, on-screen keyboard, touch layout and package descriptor. Package entries that point at build output are rewritten to point at the files the studio builds.
- **FR-007**: For each structured file, the text MUST be the source of truth, and its model MUST always be the result of reading that text.
- **FR-008**: A change made by a studio tool MUST be applied as a change to the text that covers only the affected part (replace, insert or delete), and the model re-read afterwards.
- **FR-009**: When a change cannot be placed precisely, the studio MUST name the file that will be reformatted and get the author's agreement before regenerating it.
- **FR-010**: With no author changes, submitted files MUST be byte-identical to the opened files, except for the version change and the new HISTORY entry.
- **FR-011**: The language list MUST come from the package descriptor and be editable (add, remove, reorder). Submission MUST write exactly that list.
- **FR-012**: The package descriptor MUST be updated in place. Fields the author didn't change (description, files, author, copyright, languages) MUST be kept.
- **FR-013**: The version MUST be bumped from the opened keyboard's version, and HISTORY.md MUST gain one "Updated" entry above the existing history.

**Editing**

- **FR-014**: Code views for the source, on-screen keyboard and touch layout MUST show the actual file text on Open. Applying an edit MUST save the text as written and refresh every surface from it.
- **FR-015**: Applying a code edit MUST be refused only when the text cannot be read (a parse error), with positioned errors and the edited text kept.
- **FR-016**: The remove tool and the feature galleries MUST be optional on Open, reachable from the menu and from findings, and MUST change only the parts they concern (FR-008).
- **FR-017**: The on-screen keyboard and touch editors MUST edit the existing files and MUST offer generation only when the file is missing.
- **FR-018**: The character inventory on Open MUST come from what the keyboard produces. A text sample, if given, is used only to report missing characters.
- **FR-018a**: The expected characters on Open MUST be the union of the standard character exemplars of every language in the keyboard's language list, where exemplar data exists. Expected characters the keyboard can't produce are reported as findings, each with a suggested fix to add the character. The view states how many listed languages had exemplar data. Adding a language to the list re-runs this check, and the characters it adds count as new findings.

**Checks, suggestions and the gate**

- **FR-019**: On opening, the studio MUST run the criteria and keep the result as the baseline for the session.
- **FR-020**: Every finding MUST be marked pre-existing (it fails at the baseline) or new (it passed at the baseline).
- **FR-021** *(amended 2026-11-05)*: Opening MUST land on the Open walk (FR-031), not the criteria view. The criteria view stays reachable from the navigation bar at any time and is the walk's Review step. Each finding links to the step or suggested fix that resolves it.
- **FR-022**: Criteria MUST be rechecked on apply, in the existing validation cycle; Open adds no second timer (Constitution Article IV).
- **FR-023**: After each applied change, the studio MUST compare the characters and layers the change added or removed across physical keys, touch layout and documentation, and offer follow-up suggestions for parts left out (Story 5).
- **FR-024**: Suggestions MUST never apply without the author's explicit acceptance.
- **FR-025**: Keyman structure upgrades MUST each be a criterion paired with a suggested fix. The first pair is cased-keys (criterion 7.28) with the existing removal of CAPS rules and addition of the cased-keys declaration.
- **FR-026**: The author MUST be able to write a review note for any new failure. Notes are saved with the session and printed in the PR body beside their criterion. A note is dropped when its criterion passes again.
- **FR-027**: Submission MUST be blocked when the keyboard doesn't compile, a red-checklist item is unconfirmed, or a new failure has no review note. Pre-existing failures MUST NOT block.

**Documentation**

- **FR-028**: Hand-written documentation MUST be kept. Regenerating a document or one of its sections MUST be a suggested fix, with a preview of current and proposed text.
- **FR-029**: The help step on Open MUST ask only about documentation that is missing or fails its criteria, prefilled from the existing documents.

**The Open walk** *(added 2026-11-05)*

- **FR-031**: Opening MUST start a walk: Languages, Letters, Upgrades, Mechanisms, On-screen keyboard, Touch, Documentation, Review, Output (Story 8). Every step MUST offer Continue. The order MUST follow from what each page requires and provides, not from a hand-kept sequence; the only positional rule is that the walk ends at Review.
- **FR-032**: Upgrades and Documentation MUST appear only when the opened keyboard has that kind of problem. Letters MUST appear for every keyboard that is not basic, and for a basic keyboard only when it has missing letters. Mechanisms MUST appear only for a keyboard that is not basic. Which problem kinds it has MUST be recorded as a decision when the baseline is taken, and whether it is basic MUST be recorded when it is opened, so the walk's pages depend on recorded decisions only (Constitution: screens derive from decisions).
- **FR-033**: Missing letters MUST group each missing letter under every listed language that expects it, and offer to add the letter or remove the language. Composed and decomposed forms MUST count as the same letter.
- **FR-034**: Upgrades MUST list each failing upgrade criterion with its paired fix (FR-025), starting with cased keys (7.28), the touch caps layer (18.16, the full Capsifesto behaviour: caps layers for shift, right-alt and ctrl, double-tap Shift, one-shot Shift), consistent Ctrl/RAlt touch keys, and a symbols layer. Applying one MUST change only what that upgrade concerns; skipping one MUST keep it from coming back in this session.

**Ctrl** *(added 2026-11-05; owner rulings, Keyman team decision)*

Keyman core matches unsided `CTRL` on either Ctrl key, and unsided `CTRL ALT` on AltGr as Windows reports it (Left Ctrl + Right Alt) and also on a plain left Ctrl+Alt (core `kmx_modifiers.cpp`). On a Mac, Control maps to `CTRL` and Command is never a keyboard modifier. Corpus census (release/): 131 keyboards type something on unsided Ctrl; 31 have output that no other key produces, on the number row (18 keyboards), letters (11), punctuation (13) and Space (5, all special spaces).

- **FR-035**: Outside `basic_*` keyboards, a rule on unsided `CTRL` (without Alt) on a letter, number or punctuation key MUST be reported, recommending that it move off Ctrl and warning that the keyboard may not be accepted if it stays. Ctrl+Space (special spaces) is not reported. `basic_*` keyboards keep their Ctrl content and are never reported.
- **FR-036**: The fix MUST remove those Ctrl rules (a text splice) and return each character they typed to the inventory as unplaced, so the Mechanisms gallery, which follows Upgrades in the Open walk, is where the author gives it a new key. A character also typed elsewhere is not re-added.
- **FR-037**: On Copy, and in the Open galleries, no new content MAY be placed on a Ctrl layer, and no Ctrl layer MAY be added (physical or touch) where the keyboard has none. Existing Ctrl content on a copied `basic_*` keyboard is kept, unless the characters it types are carved: carving a character removes its Ctrl rules with its other rules.
- **FR-038**: `LCTRL` / `RCTRL` are allowed, with an advisory that an Alt-based placement is preferred.
- **FR-039** *(proposed, awaiting the owner)*: Unsided `CTRL ALT` is AltGr in practice, so it is not raw Ctrl; it is offered an upgrade to `RALT` that converts every unsided Alt/Ctrl rule in the keyboard (mixing sided and unsided modifiers is not allowed), withheld unless a before/after simulation shows every AltGr key types the same.

**Removing letters** *(added 2026-11-06)*

- **FR-040**: On both paths, removing a character that a listed language needs (its main CLDR/SLDR exemplar set; carve on Copy, the Remove tool and gallery deletions on Open) MUST show a warning naming the language or languages that need it. The warning is dismissable: the author can keep the removal. Composed and decomposed forms count as the same character.

**Copy path**

- **FR-030** *(amended 2026-11-05)*: The Copy path's steps, prompts and output MUST be unchanged by this feature, with owner-approved exceptions that Copy shares with Open (the Ctrl rules FR-037, and the removal warning FR-040, also apply to Copy), the first two being: the touch caps layer follows the full Capsifesto behaviour (caps layers for shift, right-alt and ctrl, double-tap Shift, one-shot Shift, Shift-key labels), and `&CasedKeys` lists a key when its Caps output is its Shift output (so an AZERTY number row qualifies) and leaves out a key whose Caps does anything else. "Unchanged" is checked by Copy's outputs (the golden walk); walk order follows each step's inputs and outputs and is not pinned as a literal sequence.

### Key Entities

- **Opened keyboard**: the keyboard folder as loaded: repository, version, every file's text.
- **Working copy (Open)**: the opened keyboard's files plus every applied change, with models derived from the text. Saved in the draft envelope.
- **Baseline**: the criteria results at load, per criterion.
- **Finding**: a criterion result, marked pre-existing or new, linked to where it can be fixed.
- **Suggested fix**: a proposed change to one or more files, with a preview. Accepted, declined or pending.
- **Consistency suggestion**: a suggested fix raised by an applied change that left another part of the keyboard inconsistent.
- **Review note**: author text attached to a new failure, carried into the PR body. It is a review note, not a keyboard decision.
- **Source choice**: which repository the keyboard was opened from. It is a decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening and submitting the Cameroon QWERTY keyboard without edits keeps all 278 languages in the package, in their original order.
- **SC-002**: With no edits, 100% of submitted files are byte-identical to the opened files, apart from the version change and the one new HISTORY entry. Checked on at least 20 corpus keyboards, including multilingual, deadkey-heavy and touch-enabled ones.
- **SC-003**: After a single tool change, the source file differs from the original only in the lines of the parts that changed, on 100% of the sample above.
- **SC-004**: The Copy path produces the same output for its existing end-to-end walks before and after the feature.
- **SC-005**: Every finding in a session is marked pre-existing or new. None is unmarked.
- **SC-006**: Submission is blocked in exactly these cases, in a test matrix that covers each one alone and in combination: compile error, unconfirmed red item, unjustified new failure. Pre-existing failures alone never block.
- **SC-007**: Opening upstream basic_kbdus shows the cased-keys finding with its suggested fix. Accepting it makes the criterion pass, and the change touches only the declaration and the CAPS rules.
- **SC-008**: No change reaches a file without either the author's own edit or the author's acceptance of a suggestion. Verified by opening, waiting and submitting with no interaction.
- **SC-009**: An author goes from the start screen to the criteria view of an opened keyboard in at most three interactions when the two repositories agree.

## Constitution impact

These are named here so `/speckit-plan`'s Constitution Check can't miss them:

- **Article II (IR is the spine; mutations never on raw text)**: Open makes the file text the source and the IR its parse. Tool changes are still computed on the IR, then placed into the text as precise edits, extending the existing carve splice. Author code edits are text. This needs an amendment that recognises text-sourced working copies, with the carve splice as precedent.
- **Article III (working copy recalculated from decisions)**: on Open, file text and applied changes are the state. Decisions cover only real choices (source repository, accepted and declined suggestions). Text, including review notes, is never stored as a decision. This needs an amendment, plus a rule for how decision replay coexists with text edits (e.g. a text edit is a checkpoint that replay never crosses).
- **Article IX**: removing the identity-first steps from Open is done with screen gates and step declarations (FR-005).
- **Article X**: carried values on Open are the keyboard's own content, not proposals from another keyboard, so they take effect without confirmation. Every change the studio proposes is a suggestion requiring acceptance (FR-024).
- **Article VII**: byte-identical round trip stays out of scope as a general guarantee. FR-010 promises only that content the author didn't touch is carried unchanged.
- **Article VI**: engine owns the Open entry, import, patching, gate and output. Content owns the criteria (including new upgrade criteria), suggestion and review-note wording, and help questions.

## Decisions carried (owner rulings 2026-11-03)

1. Open replaces Adapt as the way to update an existing keyboard, and Copy is untouched.
2. Choose between keymanapp/keyboards and keyboard-studio/keyboards when they differ. PRs go to keyboard-studio/keyboards until the Keyman team is consulted.
3. Code is imported into the IR so criteria can run and the keyboard can be patched. Text cannot be stored as decisions.
4. Warn, offer more consistent follow-ups, and allow justification of changes the studio doesn't like.
5. Keyman structure upgrades are criterion-and-fixer pairs, never silent automatic fixes.
6. Reuse existing backend code wherever possible.

## Supersedes / amends

- [spec.md](../../spec.md) §15 Scenario F ("adapting a country keyboard down to a single language"): replaced. A single-language keyboard from a country keyboard is a Copy, which keeps its carve step.
- [specs/110-readme-template](../110-readme-template/spec.md) User Story 5 (README replaced on adapt): on Open, README regeneration becomes a suggested fix (FR-028).
- [docs/workflow-model.md](../../docs/workflow-model.md) Track 2 wording: becomes Open, with "update, not import" vocabulary.

## Assumptions

- The remaining TIKE ports (icon editor, HTML editor) land before this feature ships. Open mounts them when available; until then, those files are editable only as text.
- The existing criteria judge, carve splice, touch raw-JSON patch, package-descriptor patch, OSK editor and code views are reused. The splice's extension to replace and insert is the main new engine work.
- The model records where each part starts in the text. Whether it records where each part ends is unverified; multi-line rules may need that added (planning item).
- Hand-written help pages without section markers may support only "append a section", not "replace a section" (planning item).
- Fetching from both repositories is fast enough to compare on open. Comparison covers the keyboard source and package descriptor.
- Reviewers at keyboard-studio/keyboards read review notes in the PR body. No separate review UI is needed.
- Criterion 7.28 (cased keys) exists on branch `km/casedkeys-criterion`, not yet on main. FR-025 and SC-007 depend on it merging.
