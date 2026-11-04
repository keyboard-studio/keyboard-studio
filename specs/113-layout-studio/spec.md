# Feature Specification: Layout tab — a visual desktop-layout editor that never shows what it can't produce

**Feature Branch**: `km/113-layout-studio`

**Created**: 2026-11-04

**Status**: Draft

**Owner**: Engine team (Constitution Art VI) — the tab, the per-key attribution, the write path,
the derived-surface registration. Content team — the cell labels and explanations (what
"context-dependent", "base keyboard fallback", and "view in code" say to the author).

**Input**: User description: "Layout Studio (Q6 of the TIKE port remainder) — a visual
desktop-layout editor. Matthew's ruling (2026-11-02): the TIKE visual KMN layout editor 'doesn't
work in TIKE for even basic keyboards. It would need a rewrite.' This spec is that rewrite — not a
port." Source draft: `q6-layout-editor-spec.md` (2026-11-04), with the five open questions
resolved below.

**Related specs**:
- [spec 082](../082-rule-access-tracks/spec.md) FR-015 — behaviours compile to and from the
  KeyboardIR only; the text-level `kmnFragment` injection path MUST NOT be used.
- The Mechanical Gallery's Code tab (shipped 2026-11-03) — "view swap, not a fork": Monaco over the
  emitted `.kmn`, Apply back into the working copy. The Layout tab is the third view of the same
  working copy.
- [spec 063](../063-touch-key-editor/AS-BUILT.md) and the Touch Builder — the touch key grid, its
  propose-then-confirm editing, and its accessible grid. The Layout tab follows the same patterns
  for the desktop layout. It does not edit the touch layout.
- [spec 109](../109-base-keyboard-fallback/spec.md) — the base-keyboard fallback. Its enumerator of
  unhandled positions (FR-040), its per-key base-keyboard data (FR-030–FR-032), and its per-class
  fallback policy (FR-020) are what the Layout tab shows for keys the keyboard does not handle.
  This spec reads them. It does not decide fallback.
- [spec 105](../105-derived-working-copy/spec.md) — the derived working copy. Every working-copy write
  surface MUST appear in the derived-surface registry (its FR-010); the Layout tab is one.
- Spec 090 — the `physical-layout` decision: the Mechanical Gallery's assignment set, recorded at
  step completion.

## Authority

Constitution v2 precedence table. Art II (the KeyboardIR is the spine; opaque constructs are never
silently dropped) and Art III (one working copy; decisions are the live truth) govern the write
path. Art X governs base-derived values: they are proposals, shown with provenance, and never take
effect over the author. Art XI governs "done": the tab is done when an author can reach it in the
Mechanical Gallery and use it, not when the component exists.

## Rulings (Matthew, 2026-11-04)

1. **Audience** — confirmed: there is a middle audience (authors who outgrow the guided gallery but
   will not edit code). Spec it.
2. **Paradigm** — **assignment** in v1: select a key, type or pick what it produces. A
   **placement tray** (drag characters from the confirmed inventory onto keys, Touch Builder style)
   is an optional later phase (User Story 5).
3. **Flow placement** — a **third tab in the Mechanical Gallery**: Assign | Code | Layout. No new
   wizard step, no new decision id.
4. **Edit depth** — **simple outputs only** in v1: one character, one existing deadkey, or nothing
   (`nul`). Everything rule-driven, context-dependent, or multi-output is read-only with a way to
   see it in code.
5. **Base seeding** — keys the keyboard does not handle show what the **base keyboard** types
   there, marked **base-derived and provisional**. An author edit makes the key hand-set.

## The problem

TIKE's desktop visual editor is a grid: click a key, assign a character, switch shift/ctrl/alt
layers. It refuses or misrepresents almost every real keyboard and falls back to code. Four traps
cause that, and this spec is built around not repeating them:

1. **A key is not a character.** A `.kmn` keyboard maps key + modifiers + context to rules. A grid
   that stores "this key produces X" cannot represent a context rule, so it shows the wrong thing
   or refuses the keyboard.
2. **Deadkeys.** A key that emits a deadkey shows nothing until the next keystroke. A grid with no
   "pending" concept shows a blank.
3. **Unhandled keys fall through.** A key the keyboard does not handle types whatever the base
   keyboard types there — and the base keyboard differs from computer to computer. A grid that
   shows a fixed US character, or nothing, is wrong on most computers.
4. **One keystroke can do more than type one character.** It can type a string, reorder, or
   swallow input. A one-character cell cannot hold that.

The studio now has what TIKE lacked: the KeyboardIR spine, a simulator that answers "what does
this key produce in this modifier state?", desktop key geometry, and the Code tab as a precedent
for a second view over one working copy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See what every key really types (Priority: P1)

An author in the Mechanical Gallery opens the Layout tab. They see their keyboard's desktop layout
as a keyboard picture. They switch between modifier layers (default, Shift, AltGr, and any other
layer the keyboard uses). Each key shows what it actually produces in that layer, and how the
studio knows: from the author's own assignment, from the copied keyboard, from the base keyboard
because the keyboard does not handle that key, or from a rule too complex to show as one character.

**Why this priority**: This is the honesty rule, and it is the whole difference from TIKE. A
read-only Layout tab that is always right is already useful: it answers "what does my keyboard do?"
without reading code. Every later story depends on the attribution built here.

**Independent Test**: Load a set of corpus keyboards (simple positional, deadkey-heavy,
context-rule-heavy, with an opaque fragment, mnemonic). For every key in every listed layer,
compare the cell against what the compiled keyboard produces with an empty context. Every cell
either matches or is marked read-only with its reason. No keyboard is refused.

**Acceptance Scenarios**:

1. **Given** a Track 1 working copy copied from a simple positional keyboard, **When** the author
   opens the Layout tab, **Then** each key in the default layer shows the character the compiled
   keyboard produces for it, labelled as coming from the copied keyboard.
2. **Given** a key whose only rule emits a deadkey, **When** the author views it, **Then** the cell
   shows it as a deadkey (with the deadkey's name and how many combinations it starts), not as a
   blank.
3. **Given** a key with a context rule (`'a' + [K_E] > ...`) as well as a plain rule, **When** the
   author views it, **Then** the cell shows the plain output, is marked "depends on what was typed
   before", and is read-only, with "view in code".
4. **Given** a key the keyboard does not handle, and two picked base keyboards that type different
   characters there, **When** the author views it, **Then** the cell shows the primary base
   keyboard's character, marked as base keyboard fallback and provisional, and the detail lists
   what each picked base keyboard types there.
5. **Given** the author has set the letters class to "Do nothing" in the fallback policy (spec
   109), **When** they view an unhandled letter position, **Then** the cell shows that the key
   types nothing, not the base keyboard's character.
6. **Given** a key covered by an opaque fragment the codec could not model, **When** the author
   views it, **Then** the cell is marked as code the studio cannot show here, read-only, with "view
   in code".
7. **Given** the author edits the working copy in the Assign or Code tab, **When** they return to
   the Layout tab, **Then** every cell reflects the change.

---

### User Story 2 — Change what a key types (Priority: P1)

The author selects a key whose output is simple and changes it: types a character, picks one of
the keyboard's existing deadkeys, or sets the key to type nothing. The change goes into the working
copy the same way an Assign-tab change does. The Assign and Code tabs show it. The compiled
keyboard and the simulator reflect it. The key is now marked hand-set.

**Why this priority**: This is the "QWERTY with a few changed keys" job the middle audience asked
for — the reason for the tab.

**Independent Test**: On a simple positional keyboard, change three keys in two layers. Check the
Assign tab's assignment set, the Code tab's text, and the simulator's output for those keys. Undo
each change and check that the working copy returns to its earlier state.

**Acceptance Scenarios**:

1. **Given** a key that types `q` from the copied keyboard, **When** the author assigns `ŋ` to it in
   the default layer and confirms, **Then** the key types `ŋ`, the cell is marked hand-set, the
   Assign tab lists `ŋ` on that key, and the Code tab shows the rule.
2. **Given** the author's new character was already typed by another key, **When** they assign it,
   **Then** they are told where it already is and can keep both or move it — the same choice the
   Assign tab offers today, not a silent duplicate or a silent move.
3. **Given** the assignment displaces a character the keyboard typed on that key, **When** the
   author confirms, **Then** the displaced character is handled as the Assign tab handles
   displacement today (offered elsewhere, or declined on record).
4. **Given** the keyboard defines deadkeys, **When** the author chooses "deadkey" for a key, **Then**
   they can pick only a deadkey the keyboard already defines, and see how many combinations it
   starts.
5. **Given** a read-only cell, **When** the author tries to edit it, **Then** nothing is written, and
   they are told why and offered "view in code".
6. **Given** the author made a change in the Layout tab, **When** they undo, **Then** the change is
   reversed through the same undo the Assign tab uses.
7. **Given** a key the base keyboard types through (provisional), **When** the author assigns that
   same base character on purpose ("keep this"), **Then** the keyboard now handles the key itself,
   and the cell is hand-set, not provisional.

---

### User Story 3 — See complex keys honestly and jump to their code (Priority: P2)

For a read-only key, the author can open its detail: what it types with nothing typed before, the
rules that can fire on it, and a "view in code" action that switches to the Code tab at that rule.

**Why this priority**: Read-only cells are only honest if the author can find out what they do.
Without this, the tab hides complexity rather than showing it. It is P2 because US1's labels
already prevent wrong edits.

**Independent Test**: On a context-heavy keyboard, open the detail for three read-only keys and
follow "view in code" for each. The Code tab opens at the rule that fires for that key.

**Acceptance Scenarios**:

1. **Given** a read-only key, **When** the author opens its detail, **Then** they see the empty-
   context output, the number of rules that match the key in this layer, and the reason it is
   read-only, in plain words.
2. **Given** the detail is open, **When** the author chooses "view in code", **Then** the Code tab
   opens with the rule that fires for this key in view.

---

### User Story 4 — Confirm what the base keyboard proposes (Priority: P2)

Keys the keyboard does not handle are provisional. The author can see at a glance which keys in a
layer are still provisional, and confirm them: either key by key (by assigning, US2 scenario 7), or
by confirming the fallback policy for that character class (spec 109's surface, reached from the
Layout tab).

**Why this priority**: The seeding ruling makes base-derived values visible proposals (Art X).
Showing them is US1; this story makes confirming them a designed step, not a formality.

**Independent Test**: On a sparse keyboard, count provisional keys in each layer. Confirm the
punctuation policy in the fallback surface; the punctuation keys stop being provisional. Assign one
letter key; it stops being provisional. Nothing else changes.

**Acceptance Scenarios**:

1. **Given** a layer with provisional keys, **When** the author views it, **Then** provisional keys
   are visually distinct (and announced as such to screen readers), and the layer shows how many
   there are.
2. **Given** the author follows "change the fallback policy" from a provisional key, **When** they
   confirm a class policy there and come back, **Then** keys of that class are no longer
   provisional, and show the confirmed result (the base character, or nothing).

---

### User Story 5 — Place characters from a tray (Priority: P3, optional later phase)

The author has a confirmed character inventory. They see the characters not yet on any key in a
tray beside the keyboard and drag one onto a key (or select both with the keyboard) to assign it.
This builds a layout from scratch faster than one key at a time.

**Why this priority**: Ruling 2 makes placement optional and later. It is built only after US1–US4
ship and only if the product owner decides to take it (see Assumptions, "Placement tray gate").

**Independent Test**: With an inventory of five unplaced characters, place all five by tray. Each
lands as a US2 assignment would; the tray empties.

**Acceptance Scenarios**:

1. **Given** a confirmed inventory, **When** the author opens the tray, **Then** it lists the
   inventory characters that no key in any layer types yet.
2. **Given** a character in the tray, **When** the author places it on an editable key, **Then** the
   result is identical to assigning it there through US2 (same write, same displacement handling,
   same undo).
3. **Given** a read-only key, **When** the author tries to drop a character on it, **Then** the drop
   is refused with the same explanation as US2 scenario 5.

### Edge Cases

- **Mnemonic keyboards** (`&mnemoniclayout`): what a key types depends on the base keyboard's
  character there, not its position. The tab shows the grid read-only, says why, and offers the
  Code tab. Editing mnemonic keyboards is out of scope for v1.
- **A key whose output is changed by a later group** (for example a normalization group that
  rewrites what the key typed): the cell shows what is actually produced. If that differs from the
  key rule's own output, the cell is read-only ("changed by a later rule").
- **Rules gated by `if()`, `platform()`, or option stores**: read-only, because the output depends
  on state the grid does not show.
- **A key rule written with a character instead of a virtual key** (`+ 'a'`) on a positional
  keyboard: attributed to the key position Keyman uses for it, and treated like the same rule
  written with a virtual key.
- **Output that is one user-perceived character made of several code points** (a base letter plus
  a combining mark): editable. Output of two or more characters: read-only in v1.
- **Frame keys** (Backspace, Enter, Tab, Escape, Delete, arrows, function keys): shown for
  orientation, never editable, never listed as provisional (matches spec 109 FR-011).
- **The 102nd key** (between left Shift and Z on ISO keyboards): shown, since some base keyboards
  have it, and labelled when the primary base keyboard does not.
- **No base-keyboard data for a picked base keyboard** (spec 109 FR-032): the cell shows "unknown",
  never a guess.
- **The working copy fails to compile**: the tab shows the last good result, marked stale, with the
  compile errors linked. It never shows cells it cannot back with a compiled keyboard. Editing is
  blocked until the working copy compiles.
- **The desktop step is locked** (completed): the tab follows the same lock as the Assign tab.
- **Layers the keyboard does not use** (for example Ctrl+Alt on a keyboard with no Ctrl rules):
  not listed by default; the author can show them, and their keys show base-keyboard fallback.
- **A key with a hand-set assignment that the copied keyboard also had**: hand-set wins in the
  label; the copied keyboard's value appears in the detail as "replaced".

## Requirements *(mandatory)*

### Functional Requirements

**Placement in the flow**

- **FR-001**: The Mechanical Gallery MUST offer a third tab, **Layout**, beside Assign and Code.
  The tab is a view over the same working copy. It adds no wizard step, no decision id, and no
  survey question (Art IX: the gallery step is already registered).
- **FR-002**: Switching tabs MUST NOT lose state. A change made in any tab is visible in the other
  two the next time they render.

**Showing keys (US1, US3) — the honesty rule**

- **FR-010**: The tab MUST render the desktop layout with the studio's existing desktop key
  geometry, one layer at a time, with a layer selector. It lists by default the default and Shift
  layers, AltGr, and every other modifier layer the keyboard has a rule for.
- **FR-011**: Every key's displayed output MUST come from the compiled working copy — what the
  keyboard produces for that key and layer with nothing typed before — or, for keys the keyboard
  does not handle, from FR-014. The tab MUST NOT show a stored label it cannot reproduce.
- **FR-012**: Each key in each layer MUST be classified into exactly one of these, and the class
  shown on the cell:
  - **Hand-set** — the author's assignment (agency `hand-set`). Editable.
  - **From the starting point** — a simple rule from the copied keyboard (Track 1) or the current
    release (Track 2). Editable.
  - **Deadkey** — a simple rule that emits one deadkey. Editable.
  - **Types nothing** — a simple rule with `nul` output. Editable.
  - **Base keyboard fallback** — the keyboard has no rule for this key and layer (agency
    `base-derived`, provisional). Editable.
  - **Depends on what was typed before** — the key also matches one or more context rules.
    Read-only.
  - **Complex output** — the output is more than one character, uses stores, indexes, `if()`,
    `platform()`, options, or is changed by a later group. Read-only.
  - **Code the studio cannot show here** — the key is touched by an opaque fragment. Read-only.
  - **Frame key** — not editable.
- **FR-013**: A key and layer is **simple** (editable) only when all of these hold: exactly one rule
  in the keyboard's key-processing groups can match it; that rule has no context; its output is one
  user-perceived character, one deadkey, or `nul`; and what the compiled keyboard actually produces
  for it with an empty context equals that rule's output. Anything else is read-only. When in
  doubt, read-only.
- **FR-014**: For a key and layer the keyboard does not handle, the tab MUST use spec 109's
  enumerator of unhandled positions and its base-keyboard data. The cell shows the **primary** base
  keyboard's character, unless the fallback policy for that character's class is a confirmed "Do
  nothing", in which case it shows that the key types nothing. The detail lists what each picked
  base keyboard types there. The tab MUST NOT use the simulator's built-in US fallback for these
  keys, because typists' computers differ.
- **FR-015**: Each read-only cell MUST say why in plain words (FR-012's class), and offer **view in
  code**, which switches to the Code tab with the rule that fires for that key in view.
- **FR-016**: Each cell's detail MUST show: the output with an empty context, the class and its
  provenance, the number of rules that match the key in this layer, and, if a hand-set value
  replaced a starting-point value, the replaced value.
- **FR-017**: The tab MUST recompute after any working-copy change, using the result of the
  existing validation cycle (decision D3). It MUST NOT add its own compile or debounce timer.
- **FR-018**: A keyboard the codec can parse MUST NOT be refused. A mnemonic keyboard renders
  read-only with the reason shown. A keyboard that does not compile shows FR-011's last good result
  marked stale, or an explanation if there is none.

**Changing keys (US2)**

- **FR-020**: For an editable key and layer, the author MUST be able to set its output to: one
  character (typed, or picked from the confirmed inventory), one deadkey the keyboard already
  defines, or nothing. The change is proposed, previewed, and written only on an explicit confirm.
- **FR-021**: A confirmed change MUST be recorded in the Mechanical Gallery's assignment set — the
  same set the Assign tab writes and the `physical-layout` decision records at step completion — so
  that the Assign tab, the decision, and replay all see it. It MUST reach the KeyboardIR through
  the same write path as an equivalent Assign-tab change. It MUST NOT use the `kmnFragment` text
  injection path (spec 082 FR-015) or any other text-level path.
- **FR-022**: A change whose character another key already types, or which displaces a character
  this key typed, MUST go through the same duplicate and displacement choices the Assign tab
  offers. The Layout tab MUST NOT resolve them silently.
- **FR-023**: A changed key MUST show as hand-set. Assigning to a provisional key the same character
  the base keyboard types there makes the keyboard handle it, and the key becomes hand-set.
- **FR-024**: Every Layout-tab change MUST be undoable with the same undo the Assign tab uses, one
  confirmed change per undo step. Undoing restores the working copy to its state before the change.
- **FR-025**: Edits MUST be refused with an explanation, and nothing written, when: the cell is
  read-only; the working copy does not compile; or the step is locked.
- **FR-026**: The Layout tab's write surface MUST be registered in the derived-surface registry
  (spec 105 FR-010) in the same change that adds it. An unregistered write surface is a gate
  failure.

**Provisional keys (US4)**

- **FR-030**: Provisional keys MUST be visually distinct and announced as provisional to assistive
  technology. Each layer MUST show how many provisional keys it has.
- **FR-031**: A provisional key's detail MUST offer the fallback policy surface (spec 109) for its
  character class. The Layout tab MUST NOT set fallback policy itself.
- **FR-032**: When a class's fallback policy is confirmed, the keys of that class MUST stop being
  shown as provisional and show the confirmed result.

**Accessibility and copy**

- **FR-040**: The key grid MUST be fully operable from the keyboard and follow the same accessible
  grid pattern as the touch key grid (spec 063): arrow-key navigation, a selected cell, and a
  label for each cell that includes its key, layer, output, and class.
- **FR-041**: Every user-facing string MUST go through the studio's localization (spec 046 message
  ids). Cell-class labels and read-only explanations are Content-team copy.

**Placement tray (US5) — optional later phase**

- **FR-050**: *(Phase 3, gated — see Assumptions.)* The tab MAY offer a tray of confirmed inventory
  characters that no key types yet. Placing a character on an editable key MUST be identical in
  effect to FR-020–FR-024. Placing on a read-only key MUST be refused as in FR-025. The tray MUST
  be operable without a pointer.

### Key Entities

- **Key cell** — one key position in one modifier layer of the desktop layout. Has: the key, the
  layer, the empty-context output, the class (FR-012), the provenance (hand-set, starting point,
  base-derived provisional), whether it is editable, and the reason when it is not.
- **Cell attribution** — the per-cell result of FR-013: which rules match the key in this layer,
  which fired with an empty context, and whether the compiled output matches the rule's own
  output. Derived from the working copy on every recompute. Never stored.
- **Assignment** — the Mechanical Gallery's existing record of what an author put where. A Layout
  edit creates or changes one. No new record type.
- **Base-keyboard position** — spec 109's unhandled position joined with each picked base
  keyboard's character there. Read, not owned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (honesty)**: Across the corpus test set (at least 20 keyboards covering simple
  positional, deadkey-heavy, context-rule-heavy, opaque-fragment, and mnemonic cases), every
  editable cell in every listed layer matches what the compiled keyboard produces with an empty
  context — zero mismatches. Every cell that cannot be matched is read-only with a stated reason.
- **SC-002 (no refusals)**: 100% of codec-parseable keyboards in that set open in the Layout tab.
  TIKE refused or misrepresented most of them.
- **SC-003 (round trip)**: A change made in the Layout tab is visible in the Assign tab, the Code
  tab, and the simulator's output within one validation cycle, and an undo returns the emitted
  `.kmn` to exactly its previous text.
- **SC-004 (one spine)**: The Layout tab adds no text-level write path and no second validation
  timer. Checked by a test that fails on either.
- **SC-005 (task speed)**: An author can change five keys across two layers of a simple keyboard in
  under two minutes, and in no more than three interactions per key (select, enter, confirm).
- **SC-006 (provenance)**: Every provisional key in the test set is shown as provisional, and no key
  the author assigned is shown as provisional.

## Assumptions

- **Middle audience is real** (ruling 1). The tab does not replace the Assign tab's guided
  character-first flow; it is the key-first view of the same assignments.
- **"Simple" is conservative on purpose.** FR-013 makes many keys on complex keyboards read-only.
  That is the honesty rule working, not a defect. Rule-chain editing is out of scope for v1
  (ruling 4).
- **One character** means one user-perceived character (grapheme cluster). Multi-character literal
  output is read-only in v1 because TIKE trap 4 is exactly that case.
- **Deadkeys**: v1 assigns only deadkeys the keyboard already defines. Creating a deadkey and its
  combinations stays in the guided gallery and the Code tab.
- **Spec 109 dependency.** FR-014 and US4 need spec 109's enumerator (FR-040) and base-keyboard data
  (FR-030). Until those ship, unhandled keys show "base keyboard fallback — character not yet
  available" rather than a guessed character. US1–US3 for handled keys do not wait for 109.
- **Placement tray gate** (Art XI: owner and trigger). Owner: the product owner. Trigger: when
  US1–US4 have shipped, the product owner decides go or no-go on US5. If no-go, or if no decision
  is recorded by this spec's retirement pass, FR-050 and US5 are removed from the spec rather than
  rolled forward.
- **Plan-phase research** (not decided here): which existing write path an assignment uses to
  reach the IR for a direct key mapping; how FR-013's attribution is computed from the IR and the
  simulator's fired-rule tracking; how "view in code" finds the rule's line in the Code tab's text.
- **Vocabulary.** "Desktop layout" is the layout being edited; "base keyboard" is the OS layout
  Keyman falls back to; "starting point" is the copied keyboard or the current release
  ([glossary](../../docs/design-notes/keyboard-vocabulary-glossary.md)).

## Out of scope

- Editing context rules, rule chains, stores, `if()`/`platform()`/options, or opaque fragments.
- Creating deadkeys or authoring deadkey combinations across keys.
- Editing mnemonic keyboards.
- The touch layout (Touch Builder owns it) and on-screen-keyboard labels and images (the OSK editor
  owns them).
- Key geometry editing.
- Setting the fallback policy (spec 109 owns it).
- A port of TIKE's Delphi grid widget.
