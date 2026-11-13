# Feature Specification: Layout tab — a visual desktop-layout editor that never shows what it can't produce

**Feature Branch**: `km/117-layout-studio`

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

1. **Audience** — not asked separately; the request was to spec the feature, so this spec
   proceeds on the draft's premise of a middle audience (authors who outgrow the guided gallery
   but will not edit code). Whether that audience is real remains the product owner's call.
2. **Paradigm** — **assignment** in v1: select a key, type or pick what it produces. A
   **placement tray** (drag characters from the confirmed inventory onto keys, Touch Builder style)
   is an optional later phase (User Story 7).
3. **Flow placement** — a **third tab in the Mechanical Gallery**: Assign | Code | Layout. No new
   wizard step. (The original "no new decision id" is superseded by ruling 6.)
4. **Edit depth** — **as much as possible, where a useful UI exists** (amended by the 2026-11-04
   clarifications below). v1 edits literal text, nothing (`nul`), deadkeys with their combinations
   (chains included), and literal contextual replacements, through the confirmed "after …" view.
   Whatever has no useful UI yet (store-based rules, `if()`/`platform()`/options, later-group
   changes, opaque fragments) is read-only with a way to see it in code.
5. **Base seeding** — keys the keyboard does not handle show what the **base keyboard** types
   there, marked **base-derived and provisional**. An author edit makes the key hand-set.

## Rulings (Matthew, 2026-11-05)

6. **Edits to the KMN are decisions.** Layout-tab edits are not a separately stored log copied
   into `physical-layout` at step completion. They are recorded, at each confirm, as one bundled
   decision, **`kmn-edits`**: an ordered list of edits whose `apply()` reproduces them. This is
   the spec 105 Option A direction (the working copy derived from decisions) from the first day;
   it does not wait for spec 105 phase 4. One bundled decision, not one decision per edit; each
   edit still appears in the decision trail.
7. **Code-tab edits are imported into the same decision** (User Story 8). Code-tab Apply parses
   the edited text, computes the structural difference from the working copy, and records it in
   `kmn-edits`. **The code edit wins** over a rule another editor produced, but **errors are
   blocked** (nothing is recorded) and **inconsistencies are flagged for review**. Ships as its
   own phase after User Story 3, so the first PR stays at US1–US3.

## Rulings (Matthew, 2026-11-07)

8. **The `kmn-edits` replay gate is an absolute budget, not a noise band.** T063's comparison
   against the spec 093 / 105 baselines (7.20 ms warm, 9.58 ms cold) is retired: those predate
   the README/docs generation every projection now runs, so a 0-edit run already measures
   ~17 ms. The gate is: with 20 `kmn-edits` entries on sil_euro_latin (`rebuildPerf.measure`),
   the warm-edit and cold-resume medians are each **≤ 30 ms**. The design's ~4.7 ms replay cost
   (two replays per R12, step 2.2's parse and re-emit; the Code-tab replay at step 2.9 adds at most one more parse and emit, only when `code-apply` entries exist) is accepted as measured (research R12,
   "Replay cost"); one-replay and no-re-parse designs are not pursued in this spec.
9. **On a key the Assign tab assigns, the assignment wins over a Code-tab edit, and the edit is
   flagged, never lost silently.** *Amended by ruling 11: the Code tab now shows the built
   keyboard, so it can edit an assignment's rule; this ruling still governs a code edit made
   BEFORE the key is assigned.* Assign-tab
   assignments enter the keyboard when the output is built (projection step 2, which also
   drops the starting rule the assignment claims). A code edit aimed at the rule an assignment
   replaces, made before the assignment, does not fit in the built keyboard. This is acceptance scenario 4 and FR-063 (b), whichever tab was used
   first; Assign-tab assignments are therefore not an owner under FR-062. A rule a code edit
   adds that an assignment's rule shadows in the built keyboard is flagged under FR-063 (c).
   *Amended by ruling 10 for the order "assign first, then code edit", and by ruling 11, which
   shows Assign-tab rules in the Code tab.*
10. **On an assigned key, the most recent edit wins; a character it displaces returns to be
    placed** (amends ruling 9). The order is decided when the later edit is made and is recorded
    in it, so the projection needs no timestamps:
    - **Assign first, then a code edit on that key:** Apply accepts it (the T098 gate does not
      refuse it). The confirm names the Assign tab as the owner (FR-062, owner `assign-tab`). The
      change is recorded **keyed to the keystroke** (the rule's key and modifiers), so in the
      built keyboard it replaces whatever rule is on that keystroke — the assignment's rule. The
      entry is flagged for review under FR-063 (a), and the Assign tab shows that key as changed
      in code. Only a rule whose context is exactly one key can be keyed this way; any other
      change keeps its content anchor.
    - **Code edit first, then assign that key:** unchanged from ruling 9 — the assignment wins,
      and the code edit no longer fits and is flagged under FR-063 (b).
    - **Code edit and Layout-tab edit on the same key (or row):** the most recent wins, in the
      build and in the live model alike. Code edits replay after Layout-tab edits (research R15),
      so a code change is skipped, with no flag, when a later Layout-tab edit targets the same key
      or row; a code edit made after the Layout-tab edit stands.
    - **Displaced characters:** a confirmed-inventory character that the built keyboard no longer
      types after an edit (replace `g` with `ĝ`: `g` is now typed nowhere) returns to the letters
      to place through the **existing** inventory coverage, exactly as when an assignment is
      removed in the galleries. That coverage reads the starting keyboard plus assignments today,
      so it is extended to count `kmn-edits`; no new reminder surface is built.

## Ruling (product owner, 2026-11-13)

11. **On Copy the Code tab shows the keyboard as it will be built, and Apply keeps the
    difference from that view** (owner ruling 2026-11-13; research R15). The tab, the preview, and
    the download agree. The tab's text is the projected `.kmn` (carve, assignments, deadkey
    operations, rules-step additions, mark guards, context tolerance, caps handling), not the
    working IR's emit. Apply diffs the edited text against the text the author was shown and
    records that difference as one `kmn-edits` entry, so the edit is in the build and stays
    visible. An Apply that changes or removes a rule a build step after the `kmn-edits` replay
    makes (mark guards, context tolerance, caps handling) is allowed: the confirm names the step,
    the edit is kept and replays after those steps, and the entry is flagged for review (owner
    ruling 2026-11-13, research R15). Only `&TARGETS`, which the build forces to `any` on Copy, is
    refused. On Open nothing changes: the tab shows the file text
    and Apply replaces the starting point.

## Clarifications

### Session 2026-11-04

- Q: A key that also completes deadkey combinations (`dk(acute) + [K_E] > 'é'`) matches a rule with
  context. Should that make it read-only? → A: No. Deadkeys MUST be editable in the grid — MSKLC
  handles deadkeys in its visual editor, and so must this tab. The gap the tab leaves to code is
  **contextual replacements** (rules whose context holds characters), not deadkeys. (Narrowed by
  the last item below.)
- Q: Which modifier layers (and Caps Lock states) can the author edit? → A: Any Keyman modifier
  combination. Layers the starting-point keyboard already uses are listed; any other combination
  must be added by the author explicitly.
- Q: When the author puts a cased letter on a key, what happens to its case partner? → A: The
  preview proposes the partner on the matching Shift layer of the same key; the author accepts or
  declines it in the same confirm, and a decline is recorded.
- Q: MSKLC keys can type a short literal string (a ligature). Editable? → A: Yes. A key, or a row
  after a deadkey or context, may type literal text of any length.
- Q: (Raised by the product owner.) Ruling 4 held back on context because it looked hard. → A: The
  eventual goal is editing as much as possible. If a useful UI can be found for more, take it.
- Q: Is the proposed "after …" view the UI for that? (One view serves deadkeys and context alike:
  the author picks what came before — a deadkey, literal text, or both — the grid shows what each
  key does after it, and an edit says what the context plus the keystroke **becomes**; a row whose
  result is a deadkey links to "after" that deadkey.) → A: Yes, confirmed. The product owner has
  wished for this view in Keyman's own on-screen keyboard. Literal contextual replacements
  (User Story 4) and chained deadkeys are in scope through it; store-based rules
  (`any()`/`index()`) stay read-only, with a sketched next frontier (Assumptions).

### Session 2026-11-05

- Q: The plan stored Layout-tab edits in their own log and copied it into `physical-layout` at
  step completion, while spec 105's Option A says the working copy becomes purely derived from
  decisions. Acceptable? → A: No. Edits to the KMN are additional decisions: one bundled
  decision, `kmn-edits`, recorded at each confirm (ruling 6).
- Q: The template keyboard is already interpreted (parsed into the IR). Should Code-tab edits
  be imported as a diff, checked, and stored the same way? → A: Yes, in this spec, as its own
  phase after US3 (ruling 7).
- Q: When a Code-tab edit changes a rule another editor owns (an Assign-tab assignment, a
  deadkey, a Layout-tab edit), what happens? → A: The code edit wins, but errors are blocked
  and inconsistencies are flagged for review (ruling 7; FR-061–FR-063).

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

The bar is Microsoft's Keyboard Layout Creator (MSKLC): a visual editor that handles characters,
shift states, and deadkeys with their combination tables, and nothing more. Everything MSKLC can
express, this tab edits. Beyond MSKLC, `.kmn` adds contextual replacements; the tab edits the
literal ones through the same "after …" view it uses for deadkeys, and shows the rest honestly with
a way into the Code tab.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See what every key really types (Priority: P1)

An author in the Mechanical Gallery opens the Layout tab. They see their keyboard's desktop layout
as a keyboard picture. They switch between modifier layers (default, Shift, and every other layer
the keyboard uses), and can add any other modifier combination as a layer. Each key shows what it
actually produces in that layer, and how the studio knows: from the author's own assignment, from the copied keyboard, from the base keyboard
because the keyboard does not handle that key, or from a rule too complex to edit here.

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
   shows it as a deadkey (with its display character and how many combinations it starts), not as
   a blank.
3. **Given** a key with a store-based rule (`any(vowel) + [K_E] > index(...)`) as well as a plain
   rule, **When** the author views it, **Then** the cell shows the plain output as editable, and its
   detail lists the store-based rule as read-only with "view in code".
3a. **Given** a key that types `e` and also completes deadkey combinations (`dk(acute) + [K_E]`)
   or literal contextual replacements (`'a' + [K_E] > 'æ'`),
   **When** the author views it, **Then** the cell shows `e` as editable, and its detail lists the
   combinations and replacements it takes part in.
4. **Given** a key the keyboard does not handle, and two picked base keyboards that type different
   characters there, **When** the author views it, **Then** the cell shows the primary base
   keyboard's character, marked as base keyboard fallback and provisional, and the detail lists
   what each picked base keyboard types there.
5. **Given** the author has set the letters class to "Do nothing" in the fallback policy (spec
   109), **When** they view an unhandled letter position, **Then** the cell shows what the compiled
   keyboard actually does there: "types nothing" only once the keyboard really suppresses that
   position (spec 109 FR-010). Until then the cell shows the base keyboard's character with a note
   that the policy is not yet in effect for keys the keyboard never defined.
6. **Given** a key covered by an opaque fragment the codec could not model, **When** the author
   views it, **Then** the cell is marked as code the studio cannot show here, read-only, with "view
   in code".
7. **Given** the author edits the working copy in the Assign or Code tab, **When** they return to
   the Layout tab, **Then** every cell reflects the change. (The Code-tab half holds once User
   Story 8 ships: today a Code-tab Apply never reaches the compiled keyboard, research R1.)

---

### User Story 2 — Change what a key types (Priority: P1)

The author selects a key whose output is simple and changes it: types a character, makes it a
deadkey (User Story 3), or sets the key to type nothing. The change goes into the working
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
1a. **Given** the author is assigning `ŋ` to the default layer of a key, **When** the preview
   appears, **Then** it proposes `Ŋ` on the Shift layer of the same key, showing what that would
   replace; accepting writes both in one confirm and one undo step, declining writes only `ŋ` and
   records the decline.
2. **Given** the author's new character was already typed by another key, **When** they assign it,
   **Then** they are told where it already is and can keep both or move it — the same choice the
   Assign tab offers today, not a silent duplicate or a silent move.
3. **Given** the assignment displaces a character the keyboard typed on that key, **When** the
   author confirms, **Then** the displaced character is handled as the Assign tab handles
   displacement today (offered elsewhere, or declined on record).
4. **Given** a key that completes deadkey combinations, **When** the author changes the character
   it types, **Then** before confirming they see the combinations it completes and what each still
   produces (combinations follow the keystroke, not the character), and can go to the deadkey's
   table to change them. Nothing is rewritten silently.
5. **Given** a read-only cell, **When** the author tries to edit it, **Then** nothing is written, and
   they are told why and offered "view in code".
6. **Given** the author made a change in the Layout tab, **When** they undo, **Then** the change is
   reversed through the same undo the Assign tab uses.
7. **Given** a key the base keyboard types through (provisional), **When** the author assigns that
   same base character on purpose ("keep this"), **Then** the keyboard now handles the key itself,
   and the cell is hand-set, not provisional.

---

### User Story 3 — Make a deadkey and fill its combinations, MSKLC-style (Priority: P1)

The author selects an editable key and makes it a deadkey: a new one, or one the keyboard already
has. They give it a display character (usually the spacing accent). They open its combination
table and fill it: for each following keystroke, what it produces — `a` → `á`, `e` → `é`, space →
`´`. They can switch the grid to "after this deadkey" and see, on every key, what typing that key
next produces.

**Why this priority**: Deadkeys are how most Latin-script keyboards reach accented letters, and
MSKLC — the tool this middle audience knows — edits them visually. A layout editor without them
would push the commonest job back into code. (Clarification Q1.)

**Independent Test**: On a keyboard with no deadkeys, make the key right of `P` an acute deadkey
with five combinations and a space row. Type each sequence in the simulator; each produces the
table's result. Then, on a corpus deadkey keyboard, open each deadkey's table; every row matches
what the compiled keyboard produces.

**Acceptance Scenarios**:

1. **Given** an editable key, **When** the author makes it a new deadkey and confirms, **Then** the
   deadkey is defined through the studio's deadkey lifecycle (spec 083), including its warning
   about what that key does on the likely base keyboards, and the cell shows the deadkey.
2. **Given** a deadkey, **When** the author adds a row "`e` key → `é`", **Then** typing the deadkey
   then `e` produces `é` in the simulator, and the Code tab shows the combination rule.
3. **Given** a deadkey with combinations, **When** the author switches the grid to "after this
   deadkey", **Then** each key shows its combination result, or that the key has no combination
   and what happens instead (what the compiled keyboard actually does).
4. **Given** a new deadkey, **When** its table is first opened, **Then** a row for "deadkey then
   space → the display character" is proposed, not silently added; the author confirms or removes
   it.
5. **Given** a combination row whose result is itself a deadkey (a chain), **When** the author
   views the table, **Then** the row is editable, and following it opens "after" that second
   deadkey. A row that uses a store is read-only with "view in code"; the other rows stay editable.
6. **Given** the author changes or removes a row, **When** they undo, **Then** the row returns as it
   was.

---

### User Story 4 — Edit what a key does after something was typed (Priority: P2)

The author opens the "after …" view and chooses what came before: a deadkey (User Story 3) or
literal text such as `n` or `a`. The grid shows what each key does after it — from the compiled
keyboard — and the author edits it the same way: select a key, say what the text before plus this
keystroke **becomes**. `n` then `g` becomes `ŋ`; `a` then `e` becomes `æ`. The view lists the
contexts the keyboard already uses, and the author can add a new one.

**Why this priority**: Contextual replacements are what `.kmn` adds beyond MSKLC, and the
product owner's goal is editing as much as possible. Deadkey combinations and literal replacements
are the same shape ("after X, key K gives Y"), so one view serves both. P2 because P1 already
covers the MSKLC bar.

**Independent Test**: On a keyboard with literal replacements (`'n' + [K_G] > 'ŋ'`), open "after
`n`"; every key with a replacement shows its result and matches the simulator seeded with `n`.
Add "after `a`, `e` becomes `æ`"; typing `a` `e` in the simulator gives `æ`.

**Acceptance Scenarios**:

1. **Given** the keyboard has literal contextual replacements, **When** the author opens the
   "after …" view, **Then** it lists every literal context the keyboard uses (and its deadkeys),
   with how many keys each affects.
2. **Given** "after `n`" is open, **When** the author sets `g` to become `ŋ` and confirms, **Then**
   the keyboard gains that replacement, the Code tab shows it, and typing `n` `g` gives `ŋ`.
3. **Given** a "becomes" value that keeps the text before (`n` then `g` becomes `ng`), **When** the
   author confirms, **Then** the result is exactly that text; the studio does not guess which part
   is replaced.
4. **Given** a context that no key in any listed layer can type, **When** the author adds it,
   **Then** they are told it cannot be reached by typing on this keyboard before confirming.
5. **Given** two rules for the same context and keystroke, **When** the author views that key,
   **Then** the one that fires is shown and editable, and the other is shown as "never fires",
   read-only, with "view in code".

---

### User Story 5 — See complex keys honestly and jump to their code (Priority: P2)

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

### User Story 6 — Confirm what the base keyboard proposes (Priority: P2)

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

### User Story 7 — Place characters from a tray (Priority: P3, optional later phase)

The author has a confirmed character inventory. They see the characters not yet on any key in a
tray beside the keyboard and drag one onto a key (or select both with the keyboard) to assign it.
This builds a layout from scratch faster than one key at a time.

**Why this priority**: Ruling 2 makes placement optional and later. It is built only after US1–US6
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

---

### User Story 8 — Edits in the Code tab are kept (Priority: P2)

The author edits the `.kmn` text in the Code tab and applies it. The studio reads the edited text
back into the keyboard model, works out exactly what changed, and records those changes in the
`kmn-edits` decision, beside the Layout tab's edits. The edit reaches the preview, the simulator,
and the downloaded keyboard, survives reload, and can be undone. If the text has errors, nothing
is recorded. If the edit overrides something another editor produced, or later stops fitting
because an earlier decision changed, it is flagged for the author to review.

**Why this priority**: Today a Code-tab Apply changes what the studio shows but never reaches the
preview or the download (research R1) — the author's work is silently lost. Ruling 7 brings the
Code tab under the same decision as the Layout tab. P2, shipped right after PR 1, because it
reuses the decision and replay that User Story 2 builds.

**Independent Test**: On a simple positional keyboard, change one rule, add one, and delete one in
the Code tab, and Apply. Download the source; the `.kmn` has exactly those changes. Reload; they
are still there. Re-assign one of the edited keys in the Assign tab; that code edit is no longer
applied there and is flagged with the reason (scenario 4, ruling 9). Introduce a syntax error and a compile error; Apply is refused both times and nothing is
recorded.

**Acceptance Scenarios**:

1. **Given** the author changes `+ [K_Q] > 'q'` to `+ [K_Q] > 'ŋ'` in the Code tab, **When** they
   Apply, **Then** the `kmn-edits` decision gains one entry, the simulator types `ŋ` on `K_Q`, the
   Layout tab shows the key as hand-set (from the Code tab), and the downloaded `.kmn` has the rule.
2. **Given** edited text that does not parse, fails a validator error check, or does not compile,
   **When** the author tries to Apply, **Then** nothing is recorded, the working copy is unchanged,
   and the errors are shown at their lines.
3. **Given** an edit that changes or removes a rule another editor produced (a deadkey, a rules
   step addition, a Layout-tab edit, or an Assign-tab assignment made before the edit, ruling
   10), **When** the author Applies, **Then** they are told
   before confirming which editor owns it; on confirm the code edit wins, the owning editor shows
   the rule as "changed in code", and the edit is flagged for review.
4. **Given** a recorded code edit whose rule an earlier decision later changes or removes (the
   author switches the starting point, or re-assigns that key), **When** the keyboard is rebuilt,
   **Then** the edit is not applied where it no longer fits, is flagged for review with the reason,
   and is never dropped silently.
4a. **Given** a key the Assign tab already assigns, **When** the author changes that key's rule in
   the Code tab and confirms the owner warning, **Then** the code edit is in the download in
   place of the assignment's rule, the edit is flagged for review, the Assign tab shows the key
   as changed in code, and any confirmed-inventory character no longer typed anywhere returns to
   the letters to place (ruling 10).
5. **Given** flagged edits, **When** the author opens the review list, **Then** each shows what it
   changed, why it is flagged, and "view in code"; the author can keep it (the flag clears, on
   record) or revert it.
6. **Given** a change that only reformats the text (the emitter normalises it away), **When** the
   author Applies, **Then** nothing is recorded.
7. **Given** an applied code edit, **When** the author undoes, **Then** the whole Apply is reversed
   as one step, and the entry leaves `kmn-edits`.

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
- **A deadkey with no combinations yet**: allowed while authoring; the cell and the Layout tab's
  summary flag it, because on its own it only swallows the next keystroke's deadkey state.
- **A deadkey defined in the keyboard but on no key**: listed in the tab's deadkey list so the
  author can place or delete it (delete goes through spec 083).
- **A deadkey on more than one key or layer**: one deadkey, one table; every key that emits it
  shows it.
- **A combination keyed to a key the author later changes**: the combination still fires on that
  keystroke; US2 scenario 4 shows this before the change is confirmed.
- **Output that is one user-perceived character made of several code points** (a base letter plus
  a combining mark), or a literal string of several characters (`ng`, an MSKLC ligature): editable
  when the rule has no context.
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
- **Layers the starting-point keyboard does not use** (for example Shift+AltGr on a keyboard with
  none): not listed; the author adds them explicitly (FR-010a), and their keys show base-keyboard
  fallback until edited.
- **An added layer the author leaves empty**: it has no rules, so it does not exist in the
  keyboard; the tab says so rather than implying it will be saved.
- **Caps Lock**: a key whose rules do not mention Caps Lock behaves the same with it on or off; the
  `CAPS` layer shows that honestly. Editing a key in a `CAPS` or `NCAPS` layer makes that key
  Caps-sensitive, and the preview says so (MSKLC's per-key "Caps Lock affects this key").
- **A key with a hand-set assignment that the copied keyboard also had**: hand-set wins in the
  label; the copied keyboard's value appears in the detail as "replaced".
- **A Code-tab edit to a Layout-tab rule, or the reverse**: the later edit in `kmn-edits` wins
  (one ordered list); a Code-tab edit that overrides a Layout-tab rule is flagged (FR-062).
- **A Code-tab edit to header or system stores** (`&NAME`, `&VERSION`, `&TARGETS`) that identity or
  other decisions produce: the code edit wins and is flagged like any other override (FR-062).
- **A Code-tab edit inside an opaque fragment**: recorded as a change to that fragment's text; the
  fragment stays opaque.
- **A Code-tab edit that renames or reorders groups, or changes the `begin` statement**: recorded
  like any other structural change; the Layout tab re-reads the entry group from the result.

## Requirements *(mandatory)*

### Functional Requirements

**Placement in the flow**

- **FR-001**: The Mechanical Gallery MUST offer a third tab, **Layout**, beside Assign and Code.
  The tab is a view over the same working copy. It adds no wizard step and no survey question
  (Art IX: the gallery step is already registered). It adds exactly one decision id,
  `kmn-edits` (ruling 6), declared as a gallery decision module in the module registry like
  every other decision.
- **FR-002**: Switching tabs MUST NOT lose state. A change made in any tab is visible in the other
  two the next time they render.

**Showing keys (US1, US5) — the honesty rule**

- **FR-010**: The tab MUST render the desktop layout with the studio's existing desktop key
  geometry, one layer at a time, with a layer selector. A layer is any Keyman modifier
  combination, including Caps Lock states (`CAPS`/`NCAPS`) and left/right Ctrl and Alt where the
  keyboard distinguishes them. The selector lists the default and Shift layers and every layer the
  starting-point keyboard or the working copy has a rule for. Every listed layer is editable under
  the same rules as the default layer.
- **FR-010a**: The author MUST be able to add any other modifier combination as a layer, explicitly
  ("Add layer"). The studio never adds a layer on its own. An added layer's keys show base-keyboard
  fallback (FR-014) until edited. Adding a combination that collides with common system shortcuts
  (Ctrl or Alt with a letter, without AltGr) MUST show that consequence before the author confirms
  it.
- **FR-011**: Every key's displayed output MUST come from the compiled working copy — what the
  keyboard produces for that key and layer with nothing typed before — or, for keys the keyboard
  does not handle, from FR-014. The tab MUST NOT show a stored label it cannot reproduce.
- **FR-012**: Each key in each layer MUST carry exactly one value on each of two axes, both shown on
  the cell:
  - **Provenance** (where the behaviour comes from):
    - **Hand-set** — the author's own edit (agency `hand-set`).
    - **From the starting point** — a rule from the copied keyboard (Track 1) or the current
      release (Track 2).
    - **Base keyboard fallback** — the keyboard has no rule for this key and layer (agency
      `base-derived`, provisional).
  - **Output** (what it does, and whether it is editable):
    - **Text** — one character or a literal string. Editable.
    - **Deadkey** — one deadkey, with its combination table. Editable.
    - **Types nothing** — `nul`, or a fallback position the compiled keyboard suppresses.
      Editable.
    - **Complex output** — reorders context, uses stores, indexes, `if()`, `platform()`,
      options, or changed by a later group. Read-only.
    - **Code the studio cannot show here** — the key is touched by an opaque fragment. Read-only.
    - **Frame key** — not editable (no provenance shown).
  Separately, a cell carries a **has contextual rows** flag when the key also takes part in
  deadkey combinations or contextual replacements (edited in the "after …" view, FR-029; read-only
  rows per FR-013). The flag is not an output value and never by itself makes the cell read-only.
- **FR-013**: Editability is decided per behaviour, not per key, so that as much as possible is
  editable:
  - A key's **plain output** (no context) is editable when at most one context-free rule matches
    the key and layer, its output is literal text, one deadkey, or `nul`, and what the compiled
    keyboard produces with an empty context equals that rule's output.
  - Each **contextual row** (a rule whose context is literal text, deadkeys, or both) is editable
    when its output is literal text, deadkeys, or `nul`, and what the compiled keyboard produces
    for that context plus that keystroke equals the rule's output.
  - A **deadkey table in the studio's own shape** (spec 083's fan-out: `dk(x) + any(bases) >
    index(outputs, n)`, with both stores plain character lists) is editable as rows of base
    character → result, despite using stores. (Amended by the plan, research R3.)
  - Anything else that uses stores (`any()`, `index()`, `notany()`), `if()`, `platform()`, options,
    `use()` chains whose later groups change the result, `beep`, or an opaque fragment is a
    read-only row with its reason. A read-only row never makes the key's other behaviours
    read-only, unless it changes what the plain output produces (then the plain output is
    read-only too).
  When in doubt, read-only.
- **FR-014**: For a key and layer the keyboard does not handle, the tab MUST use spec 109's
  enumerator of unhandled positions and its base-keyboard data. The cell shows what the compiled
  keyboard does there: "types nothing" when it suppresses the position, otherwise the **primary**
  base keyboard's character. A class policy of "Do nothing" that the compiled keyboard does not yet
  enforce for that position (spec 109 FR-010 not shipped) MUST NOT be shown as "types nothing"; the
  cell shows the base character and says the policy is not yet in effect there. The detail lists
  what each picked base keyboard types there. The tab MUST NOT use the simulator's built-in US
  fallback for these keys, because typists' computers differ.
- **FR-015**: Each read-only cell MUST say why in plain words (FR-012's class), and offer **view in
  code**, which switches to the Code tab with the rule that fires for that key in view.
- **FR-016**: Each cell's detail MUST show: the output with an empty context, the class and its
  provenance, the number of rules that match the key in this layer, the deadkey combinations and
  contextual rows it takes part in (each marked editable or read-only), and, if a hand-set value replaced a starting-point value, the replaced value.
- **FR-017**: The tab MUST recompute after any working-copy change, using the result of the
  existing validation cycle (decision D3). It MUST NOT add its own compile or debounce timer.
- **FR-018**: A keyboard the codec can parse MUST NOT be refused. A mnemonic keyboard renders
  read-only with the reason shown. A keyboard that does not compile shows FR-011's last good result
  marked stale, or an explanation if there is none.

**Changing keys (US2)**

- **FR-020**: For an editable key and layer, the author MUST be able to set its output to: one
  character or literal string (typed, or picked from the confirmed inventory), a deadkey (new or
  existing, FR-027), or nothing. The change is proposed, previewed, and written only on an explicit confirm. When the
  key completes deadkey combinations, the preview lists them and what each still produces.
- **FR-020a**: When the new character is a cased letter, the preview MUST propose its case partner
  (Unicode simple case mapping) on the same key in the paired layer — the Shift layer for a
  default-layer edit, the unshifted layer for a Shift-layer edit, and likewise for any other layer
  with and without Shift. Where the keyboard distinguishes Caps Lock on that key, the proposal
  also covers the matching Caps Lock layers. The proposal shows what it would replace there. The author accepts or
  declines it in the same confirm; both outcomes are recorded, and a declined partner is not
  proposed again for that key and layer. If the partner layer's key is read-only, the proposal
  says so and is not offered. Nothing is written to the partner layer without acceptance (Art X).
- **FR-021**: A confirmed change MUST:
  - be recorded **at the confirm**, as one entry appended to the `kmn-edits` decision (ruling 6) —
    not held in a separate store and copied into `physical-layout` at step completion. The
    decision's `apply()` MUST reproduce the change on replay, so a rebuild from decisions alone
    yields it;
  - be shown by the Assign tab where its own model can represent it (a character placed on a
    key), labelled as set in the Layout tab;
  - reach the KeyboardIR through the `mutate()` seam (Art IX; the same seam spec 109 FR-013 uses);
  - use no text-level path — not the `kmnFragment` injection path (spec 082 FR-015), and not a
    parse of edited `.kmn` text.
  - reach the compiled keyboard, the preview, and the downloaded keyboard, not only the live view.
  Deadkey definitions and fan-out table edits stay spec 083 operations recorded in
  `deadkeys-defined` (FR-027); they are decisions already.
- **FR-022**: A change whose character another key already types, or which displaces a character
  this key typed, MUST go through the same duplicate and displacement choices the Assign tab
  offers. The Layout tab MUST NOT resolve them silently.
- **FR-023**: A changed key MUST show as hand-set. Assigning to a provisional key the same character
  the base keyboard types there makes the keyboard handle it, and the key becomes hand-set.
- **FR-024**: Every Layout-tab change MUST be undoable, one confirmed change per undo step (a change
  with an accepted case partner is one step), through the working copy's existing undo stack (the
  one deletions and touch key edits already use). This is new work: the Assign tab has no undo for
  assignments today. Undoing restores the working copy to its state before the change and
  removes the entry from `kmn-edits` (the decision log keeps the history).
- **FR-025**: Edits MUST be refused with an explanation, and nothing written, when: the cell is
  read-only; the working copy does not compile; or the step is locked.
- **FR-026**: The `kmn-edits` write surface (the Layout tab, and the Code tab from User Story 8)
  MUST be registered in the derived-surface registry (spec 105 FR-010) in the same change that
  adds it. An unregistered write surface is a gate failure. Because `kmn-edits` is recorded at
  edit time and has a reproducing `apply()`, the surface MUST reach **equivalence-proven** status
  (the gate's replay and draft-load arms cover it) in the change that adds it. It does not
  depend on `physical-layout`'s phase 4, which stays as spec 105 left it.

**Deadkeys and contexts (US3, US4) — the MSKLC bar and beyond**

- **FR-027**: The author MUST be able to make an editable key and layer a deadkey: an existing one,
  or a new one. Defining, renaming, retargeting, and deleting a deadkey MUST go through the studio's
  deadkey lifecycle (spec 083), including its disclosure of what the trigger key does on the likely
  base keyboards. The Layout tab is a surface onto that lifecycle, not a second implementation.
- **FR-028**: Each deadkey MUST have a **display character** (shown on its key, usually the spacing
  form of the accent) and a **combination table** the author can edit in the tab: each row is a
  following keystroke (shown as the key, its layer, and the character that key types) and its
  result — literal text, or nothing. For tables in spec 083's fan-out shape, a row is keyed by the
  base character (as in MSKLC) and shown with the key that types it. The author can add, change, and remove rows.
  For a new deadkey, a row "space → display character" is proposed for the author to confirm
  (Art X), not added silently.
- **FR-029**: The grid MUST offer an **after …** view. The author chooses what came before — a
  deadkey, literal text, or literal text ending in a deadkey — from the list of contexts the
  keyboard uses, or enters a new one. Every key then shows what typing it after that context
  produces, from the compiled keyboard (simulated with that context): its row's result, or, for a
  key with no row, what actually happens instead. A row whose result is a deadkey links to "after"
  that deadkey, so chains are followed and edited the same way. Rows FR-013 makes read-only
  (stores, `if()`, `platform()`, options, later-group changes, opaque fragments) are shown with
  their reason and "view in code"; the rest stay editable.
- **FR-029a**: In the "after …" view, an edit sets what the context plus the keystroke
  **becomes**: literal text, optionally with deadkeys. The studio writes exactly that — it does not
  guess which part of the context is kept. A new context that no listed layer can type MUST be
  flagged before confirm. Two rules for the same context and keystroke show the one that fires as
  editable and the other as "never fires", read-only.
- **FR-029b**: Combination and contextual-row edits follow FR-021 (recorded in `kmn-edits`, or
  in `deadkeys-defined` for fan-out tables, through `mutate()`, no text path), FR-024 (one undo
  step per confirmed row change), and FR-025 (refused when the working copy does not compile or
  the step is locked).

**Provisional keys (US6)**

- **FR-030**: Provisional keys MUST be visually distinct and announced as provisional to assistive
  technology. Each layer MUST show how many provisional keys it has.
- **FR-031**: A provisional key's detail MUST offer the fallback policy surface (spec 109) for its
  character class. The Layout tab MUST NOT set fallback policy itself.
- **FR-032**: When a class's fallback policy is confirmed, the keys of that class MUST stop being
  shown as provisional and show the confirmed result.

**Code-tab edits (US8) — ruling 7**

- **FR-060**: Code-tab Apply MUST record the edit as one entry in `kmn-edits`: the **structural
  difference** between the text the author was shown (on Copy the built keyboard, ruling 11; on
  Open the file) and the IR parsed from the edited text — rules inserted, removed, or replaced; stores, groups, headers, and opaque
  fragments added, changed, or removed. The entry holds IR changes, never `.kmn` text, so the
  text is parsed once at Apply and never re-parsed on replay (spec 082 FR-015 forbids the text
  path for behaviours). Apply MUST change the live working copy by applying that difference, not
  by replacing the IR wholesale, so untouched nodes keep their identity.
- **FR-061**: **Errors are blocked.** Apply MUST record nothing and leave the working copy
  unchanged when the edited text does not parse, has a validator error (Layer A), or does not
  compile. The errors are shown at their lines. Warnings do not block. On Copy, an Apply whose
  difference changes `&TARGETS` is refused the same way, with a message naming it (the build
  forces it to `any`). A rule made by mark guards, context tolerance or caps handling is not
  refused: it is ordinary text by the time the author edits code, and compliance is left to this
  compile gate and to review (ruling 11; the owner ruling of 2026-11-13, research R15).
- **FR-062**: **The code edit wins.** When the difference changes or removes a node another
  decision produced — a deadkey (spec 083), a Layout-tab edit, a rules step addition,
  identity's header stores, an Assign-tab assignment on the edited key (ruling 10: the change
  is then keyed to the keystroke so it replaces the assignment's rule in the built keyboard) —
  the author MUST be told which editor owns it before
  confirming. On confirm, the code edit is applied and wins; the owning editor shows the node as
  "changed in code"; the entry is flagged for review. Rules from the starting point are the
  author's to change and are not flagged.
- **FR-063**: **Inconsistencies are flagged for review, never resolved silently.** A code entry is
  flagged when: (a) it overrides another decision's node (FR-062); (b) on replay, a change in it
  no longer fits because an earlier decision changed — its anchor is gone — in which case that
  change is not applied and the reason is shown; (c) it leaves a rule that can never fire (an
  earlier rule with the same context and key always matches first), in the working copy or in
  the built keyboard, where Assign-tab rules are present (ruling 9). A flagged entry stays in
  effect where it fits.
- **FR-064**: Flagged entries MUST be listed for review in the Code tab, with a count on the tab,
  and shown on the `kmn-edits` entry in the decision trail. Each item shows what changed, why it
  is flagged, and "view in code"; the author can **keep** it (the flag clears, recorded in the
  decision) or **revert** it (the latest edit is undone; an older one is reversed by a new entry
  that restores what it changed). Flags do not block step completion or download.
- **FR-065**: A code entry MUST locate what it changes by content (the rule's own text and its
  neighbours within its group), not by node id, because node ids are renumbered by every parse.
- **FR-066**: A change the emitter normalises away (formatting only) MUST record nothing. Each
  Apply is one undo step (FR-024); undoing removes its entry from `kmn-edits`.
- **FR-067**: Code-tab Apply MUST NOT add a validation timer (decision D3). How FR-061's compile
  check runs on the candidate text is plan-phase research; it is an explicit, one-shot check on
  the author's Apply, like the compile on download.

**Accessibility and copy**

- **FR-040**: The key grid MUST be fully operable from the keyboard and follow the same accessible
  grid pattern as the touch key grid (spec 063): arrow-key navigation, a selected cell, and a
  label for each cell that includes its key, layer, output, and class.
- **FR-041**: Every user-facing string MUST go through the studio's localization (spec 046 message
  ids). Cell-class labels and read-only explanations are Content-team copy.

**Placement tray (US7) — optional later phase**

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
- **Assignment** — the Mechanical Gallery's existing record of what an author put where
  (`physical-layout`). A Layout character edit does not create one (it is a `kmn-edits` entry);
  the Assign tab shows it on the key, labelled as set in the Layout tab.
- **Deadkey** — spec 083's deadkey entity: a stable id, a name, the keys and layers that emit it,
  and a display character.
- **Contextual row** — one "after …" rule: the context (a deadkey, literal text, or both), the
  following keystroke (key and layer), and what they become. A deadkey's combination table is the
  set of rows whose context is that deadkey. Read from and written to the IR's rules; never a second
  copy.
- **Base-keyboard position** — spec 109's unhandled position joined with each picked base
  keyboard's character there. Read, not owned.
- **KMN edits decision (`kmn-edits`)** — one bundled decision: the ordered list of the author's
  edits to the keyboard rules, from the Layout tab (key and layer edits, contextual rows) and the
  Code tab (structural differences). Recorded at each confirm or Apply; its `apply()` replays the
  list in order, after every other decision that writes rules. Later entries win (a code edit replays after the Layout-tab edits, but one a later Layout-tab edit supersedes is skipped: research R15).
- **Code edit entry** — one Code-tab Apply: the structural changes, each located by content
  (FR-065), plus its review flags and whether the author kept them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (honesty)**: Across the corpus test set (at least 20 keyboards covering simple
  positional, deadkey-heavy, context-rule-heavy, opaque-fragment, and mnemonic cases), every
  editable cell in every listed layer matches what the compiled keyboard produces with an empty
  context — zero mismatches. Every cell that cannot be matched is read-only with a stated reason.
- **SC-002 (no refusals)**: 100% of codec-parseable keyboards in that set open in the Layout tab.
  TIKE refused or misrepresented most of them.
- **SC-003 (round trip)**: A change made in the Layout tab is visible in the Assign tab, the Code
  tab, and the simulator's output within one validation cycle, and an undo returns the working
  copy's keyboard rules to their previous state (the emitted `.kmn` matches its previous text
  except for formatting the emitter normalises).
- **SC-004 (one spine)**: The Layout tab adds no text-level write path and no second validation
  timer. Checked by a test that fails on either.
- **SC-005 (task speed)**: An author can change five keys across two layers of a simple keyboard in
  under two minutes, and in no more than three interactions per key (select, enter, confirm).
- **SC-006 (provenance)**: Every provisional key in the test set is shown as provisional, and no key
  the author assigned is shown as provisional.
- **SC-007 (deadkeys and context rows)**: On every corpus keyboard with deadkeys or contextual
  replacements, every editable row (deadkey combination or literal contextual replacement) matches
  what the compiled keyboard produces for its context plus keystroke — zero mismatches.
  An author can define a new deadkey with five combinations and a space row in under three
  minutes, without opening the Code tab.
- **SC-008 (MSKLC parity)**: Every layout MSKLC can express (characters and ligatures per shift
  state, deadkeys with combination tables) can be built in the Layout tab without the Code tab.
- **SC-009 (edit as much as possible)**: For every positional (non-mnemonic, FR-018) corpus
  keyboard none of whose rules falls in FR-013's read-only list, 100% of its rules are editable in
  the Layout tab. For the rest, the plan reports the share of rules editable per keyboard as a baseline for the
  store-based next frontier.
- **SC-010 (code edits kept)**: Across a test set of Code-tab edits (change, add, delete a rule;
  edit a store; edit a header; edit inside an opaque fragment) on at least five corpus keyboards,
  100% of applied edits appear in the downloaded `.kmn` and survive reload; 100% of edits with a
  parse, validator, or compile error record nothing; and after an earlier decision changes, every
  change that no longer fits is flagged — zero silent drops.
- **SC-011 (derived from decisions)**: The `kmn-edits` surface passes the spec 105 equivalence
  gate's replay and draft-load arms: a rebuild from decisions alone reproduces the working copy's
  rules after any mix of Layout-tab and Code-tab edits.

## Assumptions

- **Middle audience is real** (ruling 1). The tab does not replace the Assign tab's guided
  character-first flow; it is the key-first view of the same assignments.
- **As much as possible, honestly.** FR-013 decides editability per behaviour so that one hard
  rule does not lock a whole key. What stays read-only is what has no useful grid UI yet, not what
  looked hard on paper.
- **Next frontier: store-based rows** (`any()`/`index()` — "after any vowel, this key gives the
  matching accented vowel"). Sketch: a row whose context is a named character class, and whose
  result is a parallel list, shown as a two-column mapping in the "after …" view. Owner: product
  owner with the Engine team. Trigger: once User Story 4 ships, decide go or no-go on a follow-up
  spec; if no decision is recorded by this spec's retirement pass, this note is deleted, not rolled
  forward (Art XI).
- **Text** means literal characters with no context: one character or a string (MSKLC ligatures,
  clarification Q4). TIKE trap 4 is answered by refusing what is not literal — reorder, stores,
  context — not by limiting length.
- **Deadkeys** are in scope at and beyond MSKLC depth: chained deadkeys (a combination whose result
  is another deadkey) are edited by following the chain in the "after …" view.
- **Spec 083 dependency.** FR-027 relies on spec 083's deadkey lifecycle (define with any trigger
  key, rename, retarget, delete). Where a lifecycle operation has not shipped when this spec is
  implemented, the plan MUST either build it as spec 083 specifies it or record the gap with an
  owner and trigger (Art XI) — never a Layout-tab-only deadkey path. Named deadkeys (`dk(acute)`)
  are typed IR elements in the codec today, not opaque fragments, so they fall under FR-013's
  editable rules.
- **Spec 109 dependency.** FR-014 and US6 need spec 109's enumerator (FR-040), its base-keyboard
  data (FR-030), and its `swallowUndefined` compile (FR-010) before a "Do nothing" class can show
  as "types nothing" on never-defined keys. Until the enumerator and data ship, unhandled keys show
  "base keyboard fallback — character not yet available" rather than a guessed character. US1–US5
  for handled keys do not wait for 109. Owner of the interim wording: the Engine team. Trigger: when spec 109's enumerator and base data ship, the fallback cells show the base keyboard character and "types nothing" states; until then the interim wording stays.
- **Assign-tab rules in the Code tab** (resolved by ruling 11, 2026-11-13). The Code tab shows
  the built keyboard, so Assign-tab rules are visible there and a code edit to one is kept as a
  `kmn-edits` entry. Assignments stay a projection step; they were not moved into the working
  copy. A rule made by mark guards, context tolerance or caps handling is shown and editable from
  the Code tab (owner ruling 2026-11-13, research R15): the confirm names the step, the edit is
  kept and wins, and the entry is flagged. Consequence: a kept code edit replays after all
  Layout-tab edits, whatever order they were recorded in, except that a change a later Layout-tab edit
  supersedes (same key or row) is skipped without a flag (ruling 10); where a later change in what a
  step generates means a recorded change no longer fits, the FR-063 (b) flag names it. `&TARGETS` stays refused (the build forces it to `any`).
- **Placement tray gate** (Art XI: owner and trigger). Owner: the product owner. Trigger: when
  US1–US6 have shipped, the product owner decides go or no-go on US7. If no-go, or if no decision
  is recorded by this spec's retirement pass, FR-050 and US7 are removed from the spec rather than
  rolled forward.
- **Plan-phase research** (settled in [research.md](research.md) R1–R14; listed here as the questions it answered): how a character edit reaches the IR through
  `mutate()` for a direct key mapping; the shape of `kmn-edits` entries (ruling 6); how a
  structural difference is computed and located by content (FR-060, FR-065); how FR-061's
  compile check runs without a validation timer; how FR-013's attribution is computed from the IR and the simulator's fired-rule tracking; how
  the deadkey display character is stored; how "view in code" finds the rule's line in the Code
  tab's text.
- **Vocabulary.** "Desktop layout" is the layout being edited; "base keyboard" is the OS layout
  Keyman falls back to; "starting point" is the copied keyboard or the current release
  ([glossary](../../docs/design-notes/keyboard-vocabulary-glossary.md)).

## Out of scope

- Editing store-based rules (`any()`/`index()`/`notany()`), `if()`/`platform()`/options,
  `use()` chains whose later groups change results, or opaque fragments **in the Layout tab**
  (read-only there in v1; store-based rows are the next frontier). The Code tab edits all of
  them (User Story 8).
- Editing mnemonic keyboards.
- The touch layout (Touch Builder owns it) and on-screen-keyboard labels and images (the OSK editor
  owns them).
- Key geometry editing.
- Setting the fallback policy (spec 109 owns it).
- A port of TIKE's Delphi grid widget.
