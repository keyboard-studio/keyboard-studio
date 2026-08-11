# Feature Specification: Touch key editor — Developer-parity remodel

**Feature Branch**: `061-touch-editor-parity`

**Created**: 2026-08-06

**Status**: Draft

**Governing docs**: [spec.md](../../spec.md) §3c ("Defaults are the product" — propose-then-confirm, "no default is a defect"), §8 (the touch layout is derived from the locked desktop), §14 Decision 6 (desktop-first authoring), decision D3 (single 300 ms validation debounce). Extends [specs/058-touch-key-editor](../058-touch-key-editor/spec.md) and **withdraws its FR-039** — see [docs/adr/0002-touch-grid-renders-the-last-key-stretched.md](../../docs/adr/0002-touch-grid-renders-the-last-key-stretched.md). Vocabulary: [docs/design-notes/touch-editor-glossary.md](../../docs/design-notes/touch-editor-glossary.md).

**Tracked issue**: #1530 — *Touch editor follow-up*.

**Input**: User description: *"The Touch editor from 1503 that Claude built is a valiant effort. Unfortunately, it falls short in many ways. 1. It does not look as functional/clean as the keyman developer interface. 2. No fields are editable, even the sp 'type'. 3. I don't see commands for adding or removing keys (developer had + and x buttons). 4. No text is editable, even by changing preferences. For example, I can't turn a K_1 key into U_0300 when I want to redefine it as non-number or use special rules with it. 5. It seems we can only edit the 'default' layer. 6. We can't see separate 'phone' and 'tablet' versions if they exist. The goal was something with similar functionality, but with simpler controls and good suggestions."*

---

## Context: what actually went wrong *(read first)*

Spec 058 shipped its **engine** work complete — all seven key-edit operations, the key-id ↔ rule join, eleven edit-time diagnostics each carrying a concrete fix, and a key-grid view model already parameterized by `(platform, layer)` and already proportional to the 100-unit grid. That work is sound, and this feature keeps essentially all of it.

What shipped broken is the **seam between that engine and the screen**.

### The root cause is one idiom, not eight oversights

The key-grid components gate their editing affordances behind **optional `on*` props**. There is exactly one caller — [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) — and it supplies exactly **one of eight**:

| Callback | Component | Supplied | Symptom the author sees |
|---|---|---|---|
| `onPlatformChange` | `KeyGrid` | **yes** | works |
| `onSpChange` | `KeyInspector` | no | the key-type radio group **reverts on click** |
| `onApplyFix` | `KeyInspector` | no | every diagnostic's fix button renders **`disabled`** |
| `onFillRow` | `KeyGrid` | no | button renders; clicking does nothing |
| `onEvenOutRow` | `KeyGrid` | no | button renders; clicking does nothing |
| `onAddKeyAfter` | `KeyGridCell` | no | the `+` wedge never renders |
| `onOpenCommandMenu` | `KeyGridCell` | no | the `⋯` wedge never renders |
| `onFollowNextLayer` | `KeyGridCell` | no | double-click does nothing |

Whole components were built, unit-tested, and never mounted: `KeyGridCommandMenu`, `RemoveKeyDialog`, `RenameDialog`, `FamilyApplyDialog`, `FindPanel`, `useKeyCommands`, `useModeContextCarry`.

The components also **disagree about what to do when the prop is absent**. `KeyGridCell` hides the affordance (correct). `KeyGrid` renders a dead button. `KeyInspector` renders a *controlled* input whose value can never change — the worst of the three, because a dead button looks broken while a reverting radio looks like the application is refusing the author.

Optionality bought nothing here. With a single caller, it converted eight compile-time errors into eight silent runtime nothings.

### Why no test caught it

Unit tests render each component **directly**, supplying the handlers, so they pass. The end-to-end test that drives the real walk — [e2e/touch-key-add-remove.spec.ts](../../packages/studio/e2e/touch-key-add-remove.spec.ts) — is `test.skip`, with an honest 40-line header naming the exact blocker and a four-step un-skip recipe. E2E runs outside the lane a pull request runs. The feature could therefore be reported as "all 130 tasks done" while being unreachable.

### What is genuinely missing rather than merely unwired

- **No layer selector at all.** `activeKeyLayerId` is `useState<string>("default")` with a repair effect and no control. Issue complaint #5, exactly.
- **No per-row width feedback** that survives the geometry change this spec makes (see below).
- **Four editable fields the contract already carries and nothing surfaces**: `width`, `pad`, `hint`, and `layer` — the per-key modifier override, added to the locked key type by spec 058 *because 11,593 corpus keys use it*, then omitted from the editable field set.
- **No `move` operation.** Reordering cannot be composed from `remove` + `add`: the new-key spec carries only `{ id, text, output?, sp, nextlayer? }`, so a re-add discards the key's longpresses, multitaps, flicks, geometry and provenance, and mints a fresh node id — the identity that key addressing, the decision trail, and spec 035's Case B byte-preservation all key off.

### Complaint #6 was already working

Platform tabs render and function ([KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx), `role="tablist"`). `onPlatformChange` is the one wired handler. The tabs are simply too quiet to find inside a pane that is otherwise inert.

---

## Reference: Keyman Developer's touch layout builder

Developer presents four regions: a left column (Platform / Layer selectors with add-remove-edit), a centre canvas inside a device photo, a right **property panel**, and a bottom **gesture panel** (Longpress / Flicks / Multitaps) with its own nested sub-key property panel.

Its property panel carries Keycap Value, Text, Text Unicode, Hint, Hint Unicode, Key Type, **Modifier**, ID, Padding Left, Width, and Next Layer. Each keycap prints its **key id** beneath the glyph. Each row prints a **metrics readout** (`11 keys / 1150 key width / 165 padding / 1315 total`).

This feature adopts that control set. It declines Developer's device-photo chooser (we render a live OSK), its `Template…` and `Import from On Screen` entry points (upstream of the touch stage in our workflow), its Design/Code raw-source tabs, and its Platform/Layer add-remove-edit — see [Out of Scope](#out-of-scope).

---

## Clarifications

### Session 2026-08-06 (issue #1530 design review)

- Q: Is this a wiring job or a redesign? → A: **Both, sequenced.** Wire what exists first, then reach Developer parity. The engine layer is kept.
- Q: Should the grid mirror the OSK's sizing? → A: **No.** *"We're editing the touch layer with different sizing."* The grid renders the touch layer's own geometry; the number of *physical* keys is fixed, the number of touch keys is not.
- Q: Where do the per-key controls live? → A: *"The key options can be configured in a panel when you select the key like in Developer."* Add stays on the grid; **everything else — including remove — moves into the panel.**
- Q: Should slack be drawn? → A: **No.** *"Last key must stretch if the row is shorter. This is how it works in the keyboard."* This withdraws FR-039's hatch and both row buttons.
- Q: Then how does the author see row width? → A: Developer's **per-row metrics readout**, which spec 058's own research already listed as a thing to adopt.
- Q: Is width author-editable? → A: Keys are always added at the standard width. *"The user will primarily balance row width by moving keys."* Width stays editable for the cases that need it — *"modifier keys are often larger… space bar is big."*
- Q: Given the stretch, what does width mean? → A: *"Because of the last key stretching rule, it is handled more like a CSS min-width."* Confirmed against the shipping renderer. Developer's "Width" label is kept and the semantics stated in help text.
- Q: How do move controls behave at a row's edge? → A: *"Hide a move key that would push it off the row."* **No wrapping**, and *"we need a move up/down when appropriate"* — four self-hiding buttons.
- Q: May a row exceed the platform key maximum? → A: **Yes, with a complaint.** Cameroon carries a full desktop complement of 11–12 keys per row.
- Q: How prominent is the key id? → A: Most ids should be automatic — inherited where the physical key's outputs still match, otherwise minted. *"If our rules are good, then custom can become the rare case."*
- Q: Custom or Unicode id as the minting default? → A: **Unicode**, per the existing policy. A custom hex id does not self-output; the hex is a human convention. Custom is reserved for combining marks, strings, and case triples.
- Q: Must the keycap match the output? → A: **No.** *"Keycaps for letters can, but won't always match the output."* Propose a good default, offer an explicit override, and *"warn if they are clearly unrelated on a 'normal' key."*
- Q: Diacritic keycaps? → A: Offer the U+25CC dotted-circle carrier, with a standalone form as an explicit alternative — and treat spacing stand-ins (`` ` `` for U+0300) as related, not as mismatches.
- Q: Does key mode keep the live OSK preview? → A: **No.** *"We don't need to show the live preview on the right when in key edit mode (so we can use the space), but we do want it in letter placement mode."*

---

## User Scenarios & Testing *(mandatory)*

The user is the language-community author from [034](../034-mvp-authoring-walk/spec.md), at the touch stage with a locked desktop layout — most often having imported an existing keyboard whose touch layout already carries custom keys.

### User Story 1 - The controls on screen actually do something (Priority: P1)

The author opens key mode, clicks the key-type radio for a key, and the selection **holds**. They click a diagnostic's fix button and the fix **applies**. They hover a key and see a `+`; they select a key and can delete it. They switch layers.

**Why this priority**: This is the defect of record. A feature that shipped complete and unreachable is worse than one that shipped absent, because the author concludes the tool is refusing them. Five of issue #1530's six complaints resolve here, and it depends on nothing else in this spec.

**Independent Test**: Load `sil_cameroon_qwerty`, reach the touch stage, switch to "By key". Change a key's type and confirm it persists through a re-render and into the emitted artifact. Add a key, assign it, remove a different key, switch to the `shift` layer, and confirm each took effect.

**Acceptance Scenarios**:

1. **Given** a selected key of type *Character*, **When** the author selects *Blank*, **Then** the radio stays on *Blank* and the emitted layout carries the new key type.
2. **Given** a diagnostic finding with an offered fix, **When** the author activates the fix control, **Then** the control is enabled and the fix is applied to the working copy.
3. **Given** a platform with more than one layer, **When** the author opens key mode, **Then** a layer selector is present and switching layers re-renders the grid for that layer.
4. **Given** any key-mode surface, **When** it renders, **Then** no control is present that cannot act — every affordance either works or is absent.
5. **Given** the un-skipped add/remove end-to-end walk, **When** it runs, **Then** it passes without modification to its assertions.

---

### User Story 2 - The board reads like the keyboard, and says what it measures (Priority: P2)

The author sees a board shaped like the device: rows scaled to the longest row, each row's last key stretched to the right edge. Beside each row is a readout of its key count and widths, which becomes a complaint when the row is over the platform's maximum.

**Why this priority**: Issue #1530's *first* complaint. It is also the precondition for trusting the editor at all — an author who cannot recognise their own keyboard will not believe what the editor tells them about it.

**Independent Test**: Load a layout whose rows differ in length. Confirm short rows end in a stretched key rather than a hatch, that each row reports its metrics, and that a phone row of 11 interactive keys is flagged while a tablet row of 11 is not.

**Acceptance Scenarios**:

1. **Given** a layer whose second row totals less than the layer maximum, **When** the grid renders, **Then** that row's last key fills the remaining width and no hatch is drawn.
2. **Given** any row, **When** the grid renders, **Then** the row reports its interactive key count, total key width, total padding, and row total.
3. **Given** a phone-layer row with 11 interactive keys, **When** diagnostics run, **Then** a non-blocking crowding warning is reported on that row; **and** the same row on tablet is not.
4. **Given** the author adds a key to the longest row, **When** the grid re-renders, **Then** every key narrows proportionally, no width is negative, and nothing is clipped.
5. **Given** a key that is last in its row, **When** its width is shown, **Then** the **declared** value is shown, labelled as a minimum — never the rendered width.

---

### User Story 3 - One panel holds everything about the selected key (Priority: P3)

Selecting a key opens a single property panel — keycap, hint, id, key type, modifier override, next layer, width, padding — plus delete and four move buttons. Key mode uses the full width; the live OSK preview steps aside, because the grid *is* the preview.

**Why this priority**: Complaints #2 and #4 in their full form. User Story 1 makes the existing controls work; this makes the *right set* of controls exist in one place, instead of split across a read-only inspector and a separate assign panel stacked below the fold.

**Independent Test**: Select a key and change every field in the panel, confirming each reaches the emitted artifact. Move a key left, right, up and down, confirming its longpresses, flicks and width survive. Confirm a move control is absent rather than inert at each boundary.

**Acceptance Scenarios**:

1. **Given** a selected key, **When** the panel renders, **Then** it exposes keycap, hint, id, key type, modifier override, next layer, width and padding, and every one is editable.
2. **Given** a key carrying longpresses, flicks and a non-default width, **When** it is moved, **Then** all three survive and its identity is unchanged.
3. **Given** a key at the start of its row, **When** the panel renders, **Then** no move-left control is present — likewise move-right at the end, move-up on the first row, move-down on the last.
4. **Given** key mode, **When** the pane renders, **Then** the live OSK preview is not shown and the grid occupies the full width; **and** character mode still shows it.
5. **Given** any key, **When** the grid renders it, **Then** its key id is legible on the keycap.

---

### User Story 4 - Gestures are editable where the key is (Priority: P4)

Longpress alternates, multitap sequences and the eight flick directions are added, edited and removed from key mode, beside the key they belong to — rather than only being reachable by finding the right character in the character walk.

**Why this priority**: A longpress alternate is the most common thing an author adds to a touch key, and today key mode only *counts* them. It ranks below the panel because the character walk is a working, if indirect, route to the same edits.

**Independent Test**: Select a key, add a longpress and a north-east flick, edit each one's text, remove one, and confirm all of it in the emitted artifact.

**Acceptance Scenarios**:

1. **Given** a selected key, **When** the gesture panel renders, **Then** it presents longpresses, multitaps, and all eight flick directions, each with an add control.
2. **Given** a selected sub-key, **When** its property panel renders, **Then** its gesture type, keycap and text are shown and editable.
3. **Given** a sub-key edit made in key mode, **When** the author switches to character mode, **Then** the edit is present there — the toggle stays lossless in both directions.

---

### User Story 5 - The editor proposes the right id and the right keycap (Priority: P5)

Assigning a character proposes an id without being asked: the inherited physical id when that key still produces the right thing, a Unicode id for a plain new output, a custom id only where neither can work. The keycap is proposed too — a dotted-circle carrier for a combining mark.

**Why this priority**: This is what makes the feature *simpler* than Developer rather than merely equal to it, and it is the §3c requirement. It ranks last because every earlier story is usable with a hand-typed id.

**Independent Test**: Assign a plain character, a combining mark, a multi-codepoint string, and a character the physical key already produces. Confirm each proposal, and that a hand-typed id is never required for any of them.

**Acceptance Scenarios**:

1. **Given** a key whose physical counterpart still produces the intended default and modifier outputs, **When** an id is proposed, **Then** the inherited id is proposed and **no rule is written**.
2. **Given** a plain single-codepoint output needing no guard, **When** an id is proposed, **Then** a Unicode id is proposed and no rule is written.
3. **Given** a combining mark, **When** an id is proposed, **Then** a custom id with a guard rule is proposed, and the keycap is proposed as the mark on a U+25CC carrier.
4. **Given** a proposed dotted-circle keycap, **When** the author chooses the standalone form, **Then** it is accepted and the rendering consequence has been stated.
5. **Given** a keycap the author has edited by hand, **When** the key's output later changes, **Then** the keycap is **not** rewritten.
6. **Given** a character key labelled `1` that outputs `١`, **When** diagnostics run, **Then** no keycap-mismatch warning is raised.

---

### Edge Cases

- A layer reachable from no key's next-layer — it must still be selectable, since following a layer-switch key cannot reach it.
- A platform with exactly one layer — the selector must not imply choices that do not exist.
- A single-key row — move-left and move-right are both absent; the key both is and fills the row.
- A row whose every key is blank or spacer — crowding counts interactive keys only, so it never warns.
- Moving the only key out of a row, leaving it empty.
- A titlecase character (`Ǆ`, `Ǉ`, `Ǌ`) — matches neither upper nor lower case, so no case triple is offered; the panel must say *why* rather than silently offering nothing.
- A keycap that is a bare dotted circle with nothing on it — must credit no character.
- A key-type change that makes a key non-interactive while its id still resolves to a rule — the half-done-suppression diagnostic must fire.
- An opaque source fragment that makes the key-id ↔ rule join unprovable — edit-time rejection downgrades to warn-and-confirm rather than blocking.

## Requirements *(mandatory)*

### Functional Requirements — wiring and safety (US1)

- **FR-001**: Every editing callback on a key-mode surface MUST be a **required** input, not optional. A surface that cannot act MUST fail to build rather than render inert.
- **FR-002**: The studio MUST supply handlers for all key-mode editing affordances: key type, apply-fix, add-key, remove, rename, and follow-next-layer.
- **FR-003**: No key-mode control may render in a state where activating it has no effect. An affordance that does not apply MUST be **absent** — not disabled, and not silently inert.
- **FR-004**: Key mode MUST provide a layer selector covering every layer of the active platform, including layers no key's next-layer reaches.
- **FR-005**: The layer selector MUST group layers by family and plane, and MUST show each layer's rolled-up diagnostic count without the author visiting it.
- **FR-006**: Following a key's next-layer MUST switch the selector to that layer.
- **FR-007**: The "Fill row" and "Even out row" controls MUST be removed.
- **FR-008**: The add/remove end-to-end walk MUST be un-skipped and MUST pass.

  **Amended during implementation (T016).** "Unmodified" was written on the assumption that the
  walk's assertions were correct and only the wiring was missing. Measured, four of them were
  not: the walk was `test.skip`ped from birth, so none had ever executed, and bambara's
  import-adapt path legitimately rewrites three files and five rows **before the touch stage is
  reached** (a synthesized `phone:rightalt` layer, shift-layer `output` fields, a `.kvks` token
  remap). Four assertions were amended to state their real intent — count keys in the layer the
  edit touched; excuse the mechanism-owned platform `defaultHint`; diff untouched keys against a
  zero-edit projection baseline rather than the shipped source; excuse `.kvks`. The `font`
  assertion, the regression SC-006 actually names, is unchanged and still exact.

  This is an amendment, not a weakened gate: assertion (c) is now **stronger** than as written,
  asserting that editing two keys changed only the row those keys are in, rather than excusing a
  hardcoded list of upstream-churned rows. The evidence table is in
  [tasks.md](tasks.md) under T016.

  With the premises corrected the walk still failed, and that failure was real: it caught a
  pre-existing spec-035 R9 violation in spec-058 code (every Case B key edit round-tripped the
  whole touch layout through the IR, stamping `p: "hand-set"` on every key and making an imported
  layout immune to re-propagation after a single edit). That defect is fixed under this feature in
  its own commit. **The walk earned its un-skip by finding a shipped bug on its first real run.**
- **FR-009**: Key-mode editing MUST be covered by a test that runs in the lane a pull request runs, so an unmounted affordance cannot ship green again.

### Functional Requirements — geometry and reporting (US2)

- **FR-010**: The grid MUST render the touch layer's own geometry. It MUST NOT derive sizing from the desktop layout.
- **FR-011**: Row scale MUST be proportional to the layer maximum — the largest row total in the layer.
- **FR-012**: The last key in every row MUST render stretched to the layer maximum, matching the shipping renderer. The slack hatch MUST be removed.
- **FR-013**: Each row MUST report its interactive key count, total key width, total padding, and row total.
- **FR-014**: A row exceeding the platform's key maximum MUST be reported as a **non-blocking** warning on that row, at edit time. Exceeding the maximum MUST NOT be prevented.
- **FR-015**: A key's **declared** width MUST be presented as a minimum, distinct from its rendered width, with the distinction stated to the author.
- **FR-016**: A newly added key MUST take the standard default width. The editor MUST NOT split an anchor key's width and MUST NOT normalize the row.
- **FR-017**: Adding a key MUST NOT clip content, produce a negative width, or make any row unrenderable.

### Functional Requirements — the property panel (US3)

- **FR-018**: Selecting a key MUST open one panel exposing keycap, hint, id, key type, modifier override, next layer, width and padding — all editable.
- **FR-019**: The panel MUST offer delete, presenting the three outcomes (reflow, redistribute, suppress) with a proposal derived from the layer's kind.
- **FR-020**: The panel MUST offer move left, right, up and down. Each MUST be absent when it cannot act. Moves MUST NOT wrap across row boundaries.
- **FR-021**: Moving a key MUST preserve its identity, sub-keys, geometry and provenance.
- **FR-022**: `+` between keys and at both row ends MUST be the only editing affordance on the grid itself.
- **FR-023**: Every keycap MUST display its key id.
- **FR-024**: Key mode MUST use the full pane width and MUST NOT render the live OSK preview. Character mode MUST continue to render it.
- **FR-025**: Switching between character mode and key mode MUST remain lossless in both directions.

### Functional Requirements — gestures (US4)

- **FR-026**: Key mode MUST allow adding, editing and removing longpress alternates, multitap entries, and all eight flick directions on the selected key.
- **FR-027**: A selected sub-key MUST expose its gesture type, keycap and text for editing.
- **FR-028**: Sub-key edits made in either mode MUST be visible in the other.

### Functional Requirements — defaults (US5)

- **FR-029**: When a touch key's inherited physical id still produces the intended default and modifier outputs, the editor MUST propose keeping it, and MUST write no rule.
- **FR-030**: For a newly added key, the editor MUST propose an id by asking whether any physical key already produces the character — never by geometric proximity.
- **FR-031**: Where neither applies, the existing minting policy stands: a Unicode id by default; a custom id only for combining marks, multi-codepoint strings, and case triples.
- **FR-032**: Every character class an author can reach MUST have a proposal path. Where no proposal is possible, the editor MUST state **why** rather than silently offering nothing.
- **FR-033**: Assigning a character MUST propose a keycap — a dotted-circle carrier for a combining mark, the character itself otherwise.
- **FR-034**: A standalone (uncarried) keycap MUST be offered as an explicit non-default alternative, with its rendering consequence stated.
- **FR-035**: Once the author edits a keycap by hand, later output changes MUST NOT rewrite it.
- **FR-036**: A keycap/output mismatch MUST be reported only on character-class keys, only when the two are unrelated by **every** relatedness test, at hint severity, never blocking. Localized digits, case variants, normalization variants, dotted-circle carriers, and spacing-accent stand-ins MUST all count as related.

### Cross-cutting requirements

- **FR-037**: All author-facing copy MUST be studio-composed and localized. The engine MUST return structured fields, never English prose.
- **FR-038**: The grid MUST remain a conformant ARIA grid, keyboard-operable throughout. The row-actions accessibility fix from spec 058 SC-009 MUST NOT regress.
- **FR-039**: New diagnostics MUST ride the existing single validation debounce cycle. No second timer may be introduced.
- **FR-040**: Every edit MUST remain undoable, and the undo affordance MUST continue to name what it will undo.

### Key Entities

- **Touch key** — one addressable key on one layer of one platform: an id, a keycap, a hint, a type, geometry, an optional modifier override and next layer, and any sub-keys.
- **Sub-key** — a longpress, multitap or flick entry hanging off a touch key.
- **Layer / layer family / plane** — a board of keys; the modifier variants held to positional parallelism; the broader class that decides whether parallelism is enforced.
- **Key edit operation** — one committed change, replayable and undoable. This feature adds **move** to the existing set.
- **Row metrics** — a row's interactive key count and width totals, and its standing against the platform maximum.
- **Id proposal** — the editor's unrequested answer to "what should this key be called", together with any rules it implies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of issue #1530's six complaints is demonstrably resolved by clicking through the touch stage, with complaints 2–5 resolved by User Story 1 alone.
- **SC-002**: Zero controls in key mode can be activated without effect, verified by a structural test asserting every editing affordance has a live handler.
- **SC-003**: An author can change a key's id, keycap, type and position, and add a longpress, **without leaving key mode** and without typing an id by hand.
- **SC-004**: Every editing path is completable by keyboard alone, and the touch stage reports no accessibility violations at or above serious impact.
- **SC-005**: Editing a handful of keys leaves every untouched file byte-identical and every untouched key structurally identical in the emitted artifact.
- **SC-006**: A row exceeding its platform's key maximum is reported at edit time, and the edit still succeeds.
- **SC-007**: For every character class an author can reach, the editor proposes an id and a keycap, or states why it cannot.
- **SC-008**: A keyboard whose number row is localized raises no keycap-mismatch warnings.
- **SC-009**: The previously-skipped add/remove walk passes, and key-mode editing is covered by a test that runs on every pull request.

## Out of Scope

- **Adding, deleting or renaming layers and platforms.** Layer operations remain deferred, and Developer's free-text layer-name dialog conflicts with [specs/008-data-flow](../008-data-flow/spec.md)'s rule that layer ids are auto-derived and never author-typed. Resolving that conflict is a prerequisite, not part of this feature.
- **A raw source view** of the touch layout (Developer's Design/Code tabs).
- **Device-photo presentation chooser**, `Template…`, and `Import from On Screen` — replaced by the live OSK and by steps upstream of the touch stage.
- **Touch-first authoring and reverse touch → physical derivation.** Decision 6 is not engaged: this deepens editing of a layout still derived from the locked desktop.
- **Byte-level patch minimization** of a touched layout file — unchanged from spec 058.

## Assumptions

- **The engine layer is kept.** All seven existing key-edit operations, the key-id ↔ rule join, the eleven diagnostics and the key-grid view model are sound. This feature adds `move`, extends the editable field set, and connects what exists to the screen.
- **Extending the editable field set is not a locked-schema change.** Width, padding, hint and the modifier override are already on the parsed key type; admitting them to the editable set is engine-internal and does not engage the §17 joint-session gate.
- **The proposal machinery folds into the id field rather than disappearing.** Developer's panel is a flat field list, but the studio's assign flow carries a rule-path choice, a case-triple option, and an opaque-fragment acknowledgement. The id field shows the proposal as its default with alternatives behind a disclosure; the case-triple and acknowledgement controls stay in the assign flow rather than becoming panel fields. This keeps §3c's propose-then-confirm without turning the panel into a form.
- **Compatibility decomposition is used only for the display heuristic.** The house rule of canonical decomposition only, for character identity, is unchanged; the keycap-relatedness test is a display judgement and is scoped to itself.
- **Crowding thresholds come from the existing hygiene check** rather than being redefined here.
- **A gap analysis over reachable character classes precedes User Story 5.** FR-032 is only meaningful if the classes are enumerated first — titlecase characters, free-standing modifier symbols, emoji sequences, variation selectors.
- **User Story 1 ships on its own.** It depends on nothing else here, and it addresses the defect of record.
