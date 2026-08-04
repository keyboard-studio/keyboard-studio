# Feature Specification: Key-level touch layout editing

**Feature Branch**: `058-touch-key-editor`

**Created**: 2026-08-03

**Status**: Draft

**Governing docs**: [spec.md](../../spec.md) §8 (data flow — the touch layout is derived from the locked desktop), §3c ("Defaults are the product" — propose-then-confirm, "no default is a defect"), §14 Decision 6 (desktop-first authoring; no reverse touch→physical derivation), §16 (out of scope), and [.specify/memory/constitution.md](../../.specify/memory/constitution.md) Art. VII. This feature **extends the scope boundary** set by [specs/035-mobile-touch-derivation](../035-mobile-touch-derivation/spec.md) — see [Relationship to spec 035](#relationship-to-spec-035) below.

**Input**: User description: "Keyman developer uses a very complex touch keyboard manager that handles key Ids, nextlayers, key width, outputs, long presses, flicks, and keycaps. When we started this project, I thought that the user would be dropping back to Keyman Developer to do fine-tuning, but that is no longer the plan. This means that we need (minimally) a method of redefining key Ids (specifically `T_...` ids), adding and removing keys. Also, we need to be able to assign letters to existing `T_...` keys like in the Cameroon Keyboard, and the calculations of what is possible to output a character need to take these into account. Look at KM developer's touch keyboard development interface and make a plan to streamline it into our workflow."

---

## Context: why this feature exists *(read first)*

Until now the studio's touch surface has assumed an escape hatch: an author who needed key-level control would open the project in **Keyman Developer** and use its touch layout builder. **That assumption is withdrawn.** The studio must be sufficient on its own, which means it must own the three capabilities Developer provides and the studio currently lacks:

1. **Redefining key ids** — specifically the custom `T_*` class.
2. **Adding and removing keys.**
3. **Assigning letters to existing `T_*` keys** (the SIL Cameroon pattern), and having the studio's *producibility calculations* account for them.

### What exists today

The touch stage (`touch` in [steps/manifest.ts](../../packages/studio/src/steps/manifest.ts)) is built and interactive, but it is **character-driven, not key-driven**. [editors/assignLoop/TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) walks `session.confirmedInventory` one character at a time and asks "where should this character live?", offering four mechanisms (`touch_key_replace`, `longpress_alternates`, `flick_gestures`, `multitap`). Its "Existing methods" section — [enumerateTouchMethodsForChar](../../packages/engine/src/pattern-apply/enumerateTouchMethodsForChar.ts) plus per-method delete buttons — is the closest thing to key-level editing that exists.

What the studio cannot do today: edit a key id, add or remove a key, edit keycap text directly, edit `nextlayer`, or see the layout as a grid of keys at all.

### The `T_*` mechanism, and why it breaks our arithmetic

A `T_XXXX` touch-layout key id has **no intrinsic output**. It produces a character only if the `.kmn` contains a rule keyed on it. `kmcmplib` interns unknown `[NAME]` vkeys into a VKDictionary store (case-**insensitively**), which becomes `KVKD` in the compiled JS; Keyman Developer's compiler then cross-checks the layout against that dictionary and warns `WARN_TouchLayoutCustomKeyNotDefined` (`SevWarn|0x092`) — *"is a custom key but has no corresponding rule in the source"* — matching case-**sensitively**.

Our two producibility calculations each know one half of that join, and they never meet:

- **[buildProducedSet](../../packages/contracts/src/ir/producedSet.ts)** walks `rule.output` only. It never reads `ir.touchLayout` and never checks whether the struck key exists on any layout, so it **over-credits**: `sil_cameroon_azerty.kmn` carries `+ [T_03B1] > U+03B1` while its layout has no `T_03B1` key at all, and that orphan counts as produced.
- **[computeTouchCoverage](../../packages/contracts/src/touch-coverage.ts)** walks the layout only. `decodeUnicodeKeyId` understands `U_` ids and nothing else, so a `T_` key contributes only its keycap `text` verbatim — and it therefore **under-credits**: Cameroon's `T_0300` has keycap `"◌̀"`, so the covered set gains the two-codepoint string `U+25CC U+0300` and U+0300 reads as *"has no touch mechanism"* despite both a key and a rule existing. All fourteen of that keyboard's combining-mark keys fail this way.

The missing primitive is a **key-id ↔ rule join**. It is the same join Keyman's compiler performs, and it is the prerequisite for every user story below: the tool cannot honestly report what a keyboard can type, nor safely let an author edit a key, without it.

### Two verified defects this feature must fix

- **`isSpacerKeyClass` misreads the `sp` enum.** [touch-coverage.ts](../../packages/contracts/src/touch-coverage.ts) declares `SPACER_SP_VALUES = {8, 10}`. Upstream's own enum ([keyman-touch-layout-file.ts](../../../keyman/common/web/types/src/keyman-touch-layout/keyman-touch-layout-file.ts) lines 106-129) is `deadkey=8, blank=9, spacer=10`; the "blocks any interaction" set is `{9, 10}`. We therefore discard interactive deadkey-styled keys as spacers and credit non-interactive blank keys. This also explains Developer's 0x092 exemption set (`sp ∈ {normal(0), deadkey(8)}`): those are exactly the two classes where a custom key is *expected* to produce via a rule. Corpus counts: 997 `sp:8` keys, 804 `sp:9`.
- **`TouchKeyIR` has no per-key `layer` field.** The wire format's per-key `layer` is a *modifier override* for the emitted key event (distinct from `nextlayer`, which switches the displayed layer). [parseTouchLayout.ts](../../packages/contracts/src/parseTouchLayout.ts) maps `nextlayer` and drops `layer`; [parse-touch.ts](../../packages/engine/src/codec/parse-touch.ts) never writes it. **11,593 corpus keys use it**, overwhelmingly to disambiguate two keys that share an id within one layer. Without the field, Case A collapses those keys into indistinguishable duplicates, a duplicate-id check is unimplementable on `TouchLayoutIR`, and the studio could add a key that [touchKeyAddress](../../packages/engine/src/pattern-apply/touchKeyAddress.ts) cannot stably address.

### Corpus calibration

Measured across the 863 keyboards in `../keyboards` shipping both a `.kmn` and a `.keyman-touch-layout`:

| Class | Findings | Keyboards |
|---|---|---|
| Dead `T_` key (`sp ∈ {0,8,absent}`, no `nextlayer`, no producing rule) | 1,524 | 196 |
| — of which Developer-minted `T_new_*` | 34 | — |
| Orphan `T_` rule (rule id on no reachable layer) | 691 | ~205 |
| Duplicate key id within a layer, after exemptions | 1,170 | — |
| — before exemptions (dominated by the legitimate `layer`-override idiom) | ~13,900 | — |

Corpus-wide, 829 of 962 touch layouts contain a `T_` id, but only 242 of 1,045 `.kmn` files carry a `T_` rule — the rest use `T_SPACER`/`T_NUL` filler. The ~23% with real `T_` rules are the population this feature serves.

---

## Reference implementation: Keyman Developer's touch layout builder

Developer hosts a jQuery editor (`developer/src/tike/xml/layoutbuilder/`) in a CEF browser inside a Delphi frame. The user's instruction is to **streamline** it, not clone it. The full field-by-field analysis is in [research.md](research.md); the shape of the judgement:

**What Developer does well, and we adopt.** Character-map drag-and-drop onto a key, which derives a `U_xxxx` id from the dropped character — the single best interaction in its editor and the direct answer to "assign letters to keys". Hint fields whose *placeholder shows the inferred value*, so you see what you would get without an override. A per-row metrics readout.

**What Developer defers, and we must not.** The editor performs **no validation whatsoever** — the id field is free text with type-ahead over the VK table, and you can type `Q_FOO` and only discover it at compile. There is no duplicate-id detection, no dangling-`nextlayer` check, no overfull-row warning, and no "`T_` key has no rule" check (the editor has no access to the `.kmn` at all). Its default id for a new key is `T_new_<n>` — a dead key by construction, and there are 34 of them shipped in the corpus. Every one of Developer's compile-time touch warnings is a **pure synchronous join** we can compute at edit time with a one-click fix.

**What Developer exposes that our defaults should decide.** Six `sp` values where authors need three (and where `specialActive` is *derivable*, removing Developer's worst footgun). Raw `width`/`pad` numeric boxes over a 100-unit grid. A device-photo "presentation" chooser — needed only because Developer has no live OSK, where we render the real KeymanWeb OSK beside the editor. Platform and layer **deep-copy** on add. And a free-text layer **Name** box, which is precisely what [specs/008-data-flow](../008-data-flow/spec.md) forbids: *"Layer ids are auto-derived, not author-typed (§3c)… there is no user naming step."*

**Where Developer's model is authoritative and we follow it exactly.** The `sp` enum semantics; the id classes `K_`/`T_`/`U_` and their validation regex; the 0x092 exemption set; the `layer`-vs-`nextlayer` distinction; the 100-unit width grid with `DEFAULT_PAD=15`; and the rule that the last key in a row stretches to fill the remainder.

---

## Relationship to spec 035

[specs/035-mobile-touch-derivation](../035-mobile-touch-derivation/spec.md) §Out of Scope reads: *"Touch affordances beyond longpress/flick/multitap/replace already supported by the touch gallery."* **This feature deliberately moves that boundary** to add key ids, add/remove keys, keycap assignment, and `nextlayer` — and cites 035 as the boundary it extends. 035's Case A/Case B split, its R9 byte-preservation requirement, and its R11 emission matrix are all **preserved unchanged**.

**Decision 6 is not engaged.** What §16 and Decision 6 place out of scope is touch-**first** authoring — inverting the data flow so touch is authored before or instead of the desktop layout — and reverse touch→physical derivation. This feature does the opposite: it deepens editing of a layout that is still *derived from the locked desktop*, entered only after the physical lock. The desktop remains the mandatory substrate.

---

## Clarifications

### Session 2026-08-03

- Q: Do authors still drop back to Keyman Developer for touch fine-tuning? → A: **No.** That was the original assumption and it is withdrawn. The studio must be sufficient.
- Q: What is the minimum? → A: Redefining key ids (specifically `T_*`), adding and removing keys, and assigning letters to existing `T_*` keys as in the Cameroon keyboard.
- Q: Must producibility account for these? → A: Yes — explicitly. "The calculations of what is possible to output a character need to take these into account."
- Q: Clone Developer's interface? → A: No — *streamline* it into our workflow.
- Q: Is key type (`sp`) an authoring control or an implementation detail? → A: **An authoring control — it must be author-definable.** Choosing not to output a key from an alt layer is done by setting its key type to **spacer**; blank versus spacer is a deliberate distinction. (This reverses an earlier draft that reduced the six values to three — §3c means *propose a good default*, not *remove the option*.)
- Q: Why also change the id, if `sp` already blocks interaction? → A: The blank key's id is set to `T_BLANK`, left **undefined** (no rule), "so that it doesn't trigger the underlying key." `sp` governs rendering and interactivity; the id governs output. Both halves are required.
- Q: Why suppress rather than delete? → A: **Hiding unused keys allows the remaining keys to show up in their expected positions.** Deletion reflows the row (and silently resizes its stretched final key); suppression preserves geometry.
- Q: How should modifier keys be typed? → A: **A modifier key must be defined as active when its layer is active** — `sp:2` on the layer it switches to, `sp:1` elsewhere.
- Q: What happens to a key's longpresses and flicks when it is disabled? → A: They are discarded with it, and the author cannot see them on the keycap. **Warn about the linked outputs first, and those letters then need re-placing** — distinguishing real loss from characters still reachable elsewhere.
- Q: How is deleting a key across layers handled? → A: **Gracefully, family-wide.** Deleting the apostrophe key because punctuation moved to a symbol layer means removing it from every layer of its family, shown with per-layer content first — not clicking through six layers.
- Q: Which cross-layer conflicts warrant a loud complaint? → A: Those **within a layer family** (shift, caps, RAlt, Alt, Ctrl, RAlt-Ctrl…), because parallel position is what makes a layout predictable and no author can verify it by eye across eight layers. **Symbol and emoji planes are freeform** and must not be nagged.
- Q: Any exception to family parallelism? → A: Yes — *"sometimes the modifier keys will change appropriately on the bottom row."* For frame and layer-switch keys, `sp`, `nextlayer`, `id`, and keycap may all legitimately differ; **position and width must not**. The exemption is property-scoped, not key-scoped.
- Q: Do authors toggle between the character walk and the key grid? → A: **Yes, freely.** *"I don't think the user will know what they want to do until they play with it a bit."* So the selector is a **view toggle, not a fork** — lossless in both directions, with context carrying across and one shared set of progress figures. Mode choice is never a commitment.
- Q: So is suppression always preferable to deletion? → A: **No.** *"My method of blank keys is a solution to improve predictability across layers, but does not give more touchable space"* — and *"some users will want to remove keys to make touch layers simpler."* Predictability and touchable area are **opposed goals**; the studio offers three outcomes with their trade-offs and proposes from the layer's kind rather than hard-coding one. (This softens the previous answer, which made suppression the universal default.)

### Needs resolution before `/speckit-plan` closes

- **[NEEDS CLARIFICATION: contract sign-off]** Adding `TouchKeyIR.layer?: string` is a locked-type change under [spec.md](../../spec.md) §18 and needs sign-off recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md). Recommended: **take it** (see FR-030 and the fallback in [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md)).

---

## User Scenarios & Testing *(mandatory)*

The user is the language-community author from [034](../034-mvp-authoring-walk/spec.md), who has locked their desktop layout and reached the touch stage — most often having *imported* an existing keyboard (Case B) whose touch layout already contains `T_*` keys.

### User Story 1 - The studio tells the truth about what my keyboard can type (Priority: P1)

The author's imported keyboard is Cameroon-like: fourteen combining marks live on `T_*` keys whose keycaps read `◌̀`, each backed by a rule in the `.kmn`. Today the studio reports every one of those marks as *"has no touch mechanism"* and blocks completion on characters the keyboard demonstrably types. After this story, the studio joins the layout against the rules and reports coverage correctly — and separately surfaces the inverse defect, a rule whose key exists nowhere.

**Why this priority**: It is a correctness bug that misinforms the author today, it is the user's explicit requirement ("the calculations… need to take these into account"), and it is the prerequisite primitive for every other story. It delivers value with **zero UI change**.

**Independent Test**: Load `sil_cameroon_qwerty` as a base, reach the touch stage, and confirm all fourteen mark characters read as covered and the FR-008 gate does not block. Load `sil_cameroon_azerty` and confirm the orphan `T_03B1` rule is reported.

**Acceptance Scenarios**:

1. **Given** a layout with `T_0300` (keycap `◌̀`) and a rule `+ [T_0300] > U+0300`, **When** touch coverage is computed with the rule join, **Then** U+0300 is covered.
2. **Given** the same layout and the guard rule `any(diablock) + [T_0300] > context`, **When** coverage is computed, **Then** the guard contributes **nothing** (it re-emits context; it does not produce).
3. **Given** `+ [T_CAM] > nul` with `nextlayer: "rightalt"`, **When** coverage is computed, **Then** the key is treated as wired-but-non-producing and is **not** reported as a dead key.
4. **Given** `+ [T_03B1] > U+03B1` and no `T_03B1` on any layer, **When** the orphan check runs, **Then** it reports the rule, names the near-miss `U_03B1` present on the layout, and explains that the self-outputting `U_` id bypasses the author's `any(diablock)` guard.
5. **Given** a keyboard with no touch layout at all, **When** reachability is computed, **Then** every rule is reachable and the result equals today's `buildProducedSet` exactly.

---

### User Story 2 - Assign a letter to an existing `T_*` key (Priority: P1)

The author's imported layout has keys that type nothing — a `T_*` id with no rule, or a key the base author left as a placeholder. The author selects the key, picks a character, and the studio proposes everything else: the keycap, the id, and — when a rule is genuinely needed — the `.kmn` rule itself, shown literally before it is written.

**Why this priority**: This is the user's named use case ("assign letters to existing `T_...` keys like in the Cameroon Keyboard") and, for imported keyboards, it is a **primary** flow rather than an expert escape hatch.

**Independent Test**: On an import-adapt walk, select a `T_*` key with no rule, assign `ɛ` by typing `U+025B`, and confirm the live OSK preview types `ɛ` and the emitted layout carries the change.

**Acceptance Scenarios**:

1. **Given** a selected key that types nothing, **When** the author opens the assign panel, **Then** the studio offers the inventory characters first, plus a single field accepting either a character or `U+xxxx`, plus the character map.
2. **Given** the author picks `ɛ`, **When** the proposal renders, **Then** the default is id `U_025B` with **no rule required**, and the alternative — keep the `T_*` id and add `+ [T_X] > U+025B` — is shown with the literal rule text and the honest reason to prefer it (the same id appears on N other layers, and one rule serves all of them).
3. **Given** the author confirms the rule-bearing option, **When** the edit lands, **Then** the rule is written into the entry group, the key is promoted to `hand-set` provenance, and the live preview types the character.
4. **Given** the character is a **combining mark**, **When** the proposal renders, **Then** the studio proposes a `T_*` id *and* a guard rule (`any(<guard>) + [T_X] > context` emitted immediately before the producing rule), because a `U_` id self-outputs before any rule can guard it.
5. **Given** a keyboard-only user, **When** they Tab to the grid, arrow to the key, press Enter, type `U+025B`, and press Enter, **Then** the assignment completes with no pointer event.

---

### User Story 3 - Redefine a key id (Priority: P2)

The author renames a key id — most often a `T_*` id — and the studio validates it live, shows what else the rename touches, and fixes up every reference it owns.

**Why this priority**: Named in the user's minimum. Ranked below US2 because renaming is rarer than assigning, and it depends on the same validation and join machinery.

**Independent Test**: Rename a `T_*` key that appears on three layers and is referenced by two rules; confirm the layout, the rules, and the node-id map are all updated and nothing is orphaned.

**Acceptance Scenarios**:

1. **Given** the rename dialog, **When** it opens, **Then** the field is **pre-filled with the proposed id** (never blank) and validation runs on every keystroke.
2. **Given** an id that is syntactically invalid, or collides with another id in the same layer, or differs from an existing id **only by case**, **When** the author types it, **Then** Rename is disabled with a specific reason.
3. **Given** a valid rename, **When** it is confirmed, **Then** the key id, every `.kmn` rule keyed on the old id (producing *and* guard), and the `touchLayout.nodeIds` entries are all rewritten, and any stale address in the deletion overlay is remapped.
4. **Given** the rename would leave rules referencing an id no key carries, **When** it is confirmed, **Then** the studio **proposes** rather than silently performs the rule cleanup, defaulting to remove for rules the studio generated and to keep-and-report for hand-written ones.

---

### User Story 4 - Add and remove keys (Priority: P2)

The author adds a key to a row, or removes one, using the keyboard or the pointer.

**Why this priority**: Named in the user's minimum. Ranked below US2/US3 because a newly added key is only useful once US2 can give it a letter.

**Independent Test**: Add a key to a row, assign it a character, remove a different key, and confirm the emitted layout reflects both and untouched keys are byte-identical.

**Acceptance Scenarios**:

1. **Given** a selected key, **When** the author presses Insert (or uses the key's command menu), **Then** a key is added after it and the studio proposes a real id — **never** `T_new_<n>`.
2. **Given** the author deletes the last key in a row, **When** the deletion is confirmed, **Then** the studio asks whether to remove the row, defaulting to **keeping** it with a full-width spacer (Developer silently deletes the row; that breaks the positional alignment sibling layers depend on).
3. **Given** any add or remove, **When** it lands, **Then** the row's remaining slack is shown and "Fill row" / "Even out row" are *offered* — widths are never silently redistributed.
4. **Given** an import-adapt (Case B) layout, **When** one key is edited, **Then** every untouched key and every platform-level field (including fields our IR does not model, e.g. `font`) is **byte-identical** to the shipped file.
5. **Given** a key on an alt layer that should not output, **When** the author suppresses it, **Then** one action sets a non-interactive key type **and** neutralizes the id to a ruleless sentinel, the key stops producing anything, and **every other key in the row keeps its position and width**.
6. **Given** the author removes a key, **When** the choice is offered, **Then** all three outcomes appear with their trade-offs — suppress in place, remove and reflow, remove and redistribute — and the proposed one matches the layer's kind (twin layer → suppress; standalone function layer → remove and redistribute).
7. **Given** a row already over the platform crowding limit, **When** the author removes a key, **Then** redistribution is proposed regardless of layer kind and the over-limit reason is stated.
8. **Given** a row where some keys were suppressed and others removed, **When** the layer is audited, **Then** the inconsistency is surfaced — that row has lost predictability without fully reclaiming touch area.
9. **Given** a frame key whose `nextlayer` names its own containing layer, **When** it is placed or edited, **Then** `sp:2` is proposed automatically, remains editable, and a disagreement between the two is reported.

---

### User Story 5 - Problems surface while I edit, not at compile (Priority: P2)

Every touch-layout warning Keyman Developer defers to compile time appears inline as the author edits, with a one-click fix.

**Why this priority**: It is the largest single quality gain over Developer and it is what makes US2-US4 safe, but each of those stories carries its own minimum validation, so this can land as a consolidated surface afterwards.

**Independent Test**: Load a layout with a dead `T_` key, a dangling `nextlayer`, a duplicate id, and a layer missing `K_BKSP`; confirm four findings render with working fixes.

**Acceptance Scenarios**:

1. **Given** a `T_` key with no producing rule (and no `nextlayer`, `sp ∈ {0,8,absent}`), **When** it is selected, **Then** the studio reports it and offers both "add the rule" and "convert to a `U_` id".
2. **Given** a `nextlayer` naming a layer that does not exist, **When** the layout is audited, **Then** the finding offers to repoint or remove the switch.
3. **Given** an author edit that removes the last mechanism for an inventory character, **When** the edit lands, **Then** the studio **warns inline** (an editor must permit invalid intermediate states) offering undo or restore, and the existing FR-008 gate still **blocks** at Continue.
4. **Given** any finding, **When** it renders, **Then** it is conveyed by icon and text (never colour alone), carries a codepoint-derived accessible name for any glyph, and is announced through one `aria-live` region with **no new debounce timer** (Decision D3).

---

### Edge Cases

- A `T_` id whose layout spelling and rule spelling differ only by case: `kmcmplib` interns case-insensitively so it *works* here, while Developer's case-sensitive validator warns. Join case-insensitively; report the mismatch as a hint.
- A `T_` key whose only rules are guards, `> nul`, `use()`, or unparsed opaque text: **wired, not dead** — must not be reported.
- A rule inside a `RawKmnFragment`: the join cannot see it, so a dead-key finding must **downgrade to a hint** whenever any opaque fragment is present.
- A keycap of a bare `◌` (U+25CC): must not be stripped to empty — U+25CC is a real inventory character on at least one corpus keyboard.
- The same `T_` id on several layers or platforms: an assignment or rule change affects all of them; deletion must not cascade to rules until the id is carried by no key anywhere.
- A store-driven output (`index()`/`outs()`) behind a `T_` key: it has no single keycap string, and the coverage consumer must know that.
- Adding a key that collides with an existing id in the same layer — the exact ambiguity `touchKeyAddress` documents as unaddressable. Must be rejected at edit time.
- A layout with `desktop`, `tablet`, and `phone` platforms: the grid must render what exists rather than assuming phone.

---

## Requirements *(mandatory)*

### Functional Requirements — the join and the arithmetic (US1)

- **FR-001**: A canonical **touch key ↔ rule join** MUST live in `packages/contracts` (Layer C lint cannot import engine) and MUST index rules by their struck key id — `T_`, `U_`, **and `K_`** ids, since a `K_QUOTE` key whose rule emits U+0300 under a `◌̀` keycap suffers the identical under-credit.
- **FR-002**: The join MUST classify each binding's role and MUST credit production only for producing rules: a `> context` guard, a `> nul` suppression, a `use()`/deadkey/beep transition, and an unclassifiable opaque output all produce **nothing**.
- **FR-003**: The join MUST normalize ids case-insensitively (matching `kmcmplib` interning) while retaining every as-written spelling so a case mismatch can be reported.
- **FR-004**: The join MUST reuse the existing exported `collectFromElements` walk rather than re-deriving output collection, so store expansion and NFC run-merging cannot drift from `buildProducedSet`.
- **FR-005**: `computeTouchCoverage` MUST credit a key with what its producing rules emit. The change MUST be additive — absent the join, behaviour MUST be byte-identical to today.
- **FR-006**: Touch coverage MUST additively credit a U+25CC-stripped form of a keycap, but **only** when the remainder is non-empty and consists solely of combining marks.
- **FR-007**: All callers of touch coverage MUST be migrated in the same change — engine, Layer C, and the studio inventory gate — because leaving one on the unjoined path defeats the fix.
- **FR-008**: A **reachability-aware** producibility view MUST be added *alongside* `buildProducedSet`, returning the reachable set, the orphaned set, and the offending bindings. `buildProducedSet`'s existing default semantics MUST NOT change, and a regression test MUST pin that it still counts an orphan `T_` rule.
- **FR-009**: Reachability MUST treat `K_` ids as always reachable (a physical key exists regardless of the touch layout) and `T_`/`U_` ids as reachable only when carried by a key on a layer reachable from `default`. When no touch layout exists, everything MUST be reachable.
- **FR-010**: Each producibility view MUST document its adopter list in its module header. The facet classifiers, `producedGlyphs`, and `facet-transform/verify` MUST keep the plain view; `docs/keyboard-facet-index.json` MUST be regenerated and asserted **unchanged**.
- **FR-011**: `useInventoryDiff` MUST be **extended, not switched** — a third `producedButUnreachable` array — leaving `lettersToAdd`/`alreadyProduced` arithmetic untouched so author workload and the §18.6 denominator do not silently move.
- **FR-012**: `isSpacerKeyClass` MUST be corrected to `{9, 10}` and a deadkey predicate added, in an isolated change with a recount of the keys-per-row check.

### Functional Requirements — editing (US2, US3, US4)

- **FR-020**: The studio MUST provide a **key grid** for the touch layout: a composite widget following the ARIA grid pattern with roving tabindex, arrow/Home/End navigation, and per-key annotations for longpress, multitap, flick, provenance, and diagnostics.
- **FR-020a**: The grid MUST be a **single Tab stop** using roving tabindex — exactly one cell tabbable at a time, with a fallback so the grid is never stranded outside the Tab order when nothing is selected (the [CharScrollStrip](../../packages/studio/src/editors/assignLoop/parts/CharScrollStrip.tsx) `hasSelectedVisible` precedent). A layout of several hundred keys MUST NOT produce several hundred Tab stops.
- **FR-020b**: Selection MUST be **separate from editing**. Arrow keys and clicks change the selection and update the inspector's display while focus remains in the grid; **Enter** or **F2** moves focus into the inspector; **Escape** returns it to the cell. Keys: ←/→ within the row, ↑/↓ to the adjacent row, Home/End for row ends, Ctrl+Home/Ctrl+End for the layer.
- **FR-020c**: Vertical navigation MUST be **geometry-based, not index-based**: ↑/↓ lands on the key whose horizontal span contains the current key's centre. Rows have unequal key counts and unequal widths, so index-clamping lands the caret somewhere the author is not looking. The view model already carries per-key proportional position for rendering (FR-022).
- **FR-020d**: Arrow navigation MUST NOT wrap between layers or platforms — layers are separate surfaces, switched by an explicit selector; platform tabs appear only when more than one platform exists. Switching layers MUST **preserve the selected row/column position**, so comparing one key across `default` / `shift` / `caps` is a single action — the check that a twin layer's predictability (FR-029g) actually holds.
- **FR-020e**: The grid MUST provide a **find-by-value path to selection**, not spatial navigation alone: jump to a key by id, by the character it produces, or by filtering to keys with no assigned output. On a layout with several hundred keys across many layers, an author who knows *"the key that types `ɛ`"* or *"`T_0300`"* MUST NOT have to arrow to it. The character→key lookup already exists in [enumerateTouchMethodsForChar](../../packages/engine/src/pattern-apply/enumerateTouchMethodsForChar.ts); this exposes it as navigation. The "no assigned output" filter is the worklist for US2.
- **FR-020f**: `[role="grid"]` MUST be added to `SKIP_SELECTOR` in [useCharCycleKeys.ts](../../packages/studio/src/editors/assignLoop/useCharCycleKeys.ts). That hook is attached at the pane level and consumes ArrowLeft/ArrowRight from anywhere in its subtree unless the target matches, so without this the grid's horizontal navigation is silently eaten; the module's own documentation requires new arrow-consuming widgets to register there.
- **FR-020g**: Selecting a key by clicking it **in the live OSK preview is out of scope** — the preview is a KeymanWeb iframe where a click types the key. Selection is a grid-side concern only; do not design an interaction that implies otherwise.
- **FR-020h**: Because the OSK preview cannot be a selection surface (FR-020g), the studio MUST present **two visually distinct keyboard surfaces with two different verbs** — an editable schematic grid labelled for editing, and the live OSK labelled for testing (you type on it). They MUST NOT look alike or read as two ways to do the same thing. Mockup and rationale: [research.md](research.md) R3d.
- **FR-021**: The interaction design is **mouse-first**, with **complete** keyboard coverage — these are different claims and both hold. Click selects; hover reveals per-key add/`⋯` affordances; right-click opens the command menu; double-click follows a key's "Goes to" layer. Every one of those commands MUST also have a keyboard route (FR-020b), because keyboard *completeness* is an accessibility requirement ([docs/accessibility.md](../../docs/accessibility.md) rule 3) — but the pointer paths are first-class design targets, not fallbacks bolted on afterwards. **Drag-and-drop specifically** (reorder, resize) MUST remain a pointer *enhancement* over commands that exist independently, since drag has no good keyboard analogue.
- **FR-022**: The grid MUST render proportional geometry from the 100-unit model (`width ?? 100`, `pad ?? 15`) and MUST make a row's unused slack **visible**, with "Fill row" / "Even out row" offered as explicit actions.
- **FR-023**: The studio MUST NOT ship a device-photo presentation chooser; the live KeymanWeb OSK beside the grid is the rendering truth.
- **FR-024**: An author MUST be able to assign a character to an existing key, choosing the character from the inventory, a character/`U+` field, or the character map, with the keycap and id **proposed** (§3c).
- **FR-025**: Id minting MUST follow the policy in [contracts/key-id-policy.md](contracts/key-id-policy.md): `U_<HEX>` with no rule for a single-codepoint output; `T_*` plus a synthesized rule for multi-codepoint output, case triplication, or a **combining mark** (where a `U_` id would self-output before a guard could apply). `T_new_*` MUST NEVER be minted.
- **FR-026**: When a combining mark is assigned to a `T_*` key, the studio MUST propose a guard rule alongside the producing rule, emitted as a **contiguous guard-then-producing pair**, reusing an existing guard store when one matches and otherwise minting one under the `generated_*` convention.
- **FR-027**: Rule synthesis MUST be **semantically idempotent** — re-running MUST add nothing, and an equivalent hand-written rule MUST be detected and left untouched rather than duplicated.
- **FR-028**: An author MUST be able to rename a key id, with live validation (syntax, in-layer uniqueness, case collision, reserved prefixes) and complete reference fix-up across the layout, the rules, the node-id map, and the deletion overlay.
- **FR-029**: An author MUST be able to add and remove keys within a row. Deleting the last key in a row MUST prompt, defaulting to keeping the row.
- **FR-029a**: An author MUST be able to set a key's **type (`sp`)** across the full legal set (`0` character, `1` frame, `2` active frame, `8` deadkey-styled, `9` blank, `10` spacer). The studio MUST *propose* the appropriate value per context but MUST NOT remove the control. `sp` is an authoring mechanism, not an implementation detail — see [research.md](research.md) R3a.
- **FR-029b**: The studio MUST offer **suppressing** a key as a single compound action that both sets a non-interactive key type (spacer, or blank when a keycap-shaped hole is wanted) **and** neutralizes the id to a ruleless custom id, because `sp` alone does not stop rule matching.
- **FR-029f**: "Remove this key" MUST resolve to a choice between **three** outcomes, because predictability across layers and touchable area are **opposed goals that cannot both be maximized** (see [research.md](research.md) R3c):
  1. **Suppress in place** — positions preserved across layers, touchable area unchanged;
  2. **Remove and reflow** — the row closes up and its stretched final key absorbs the slack unevenly;
  3. **Remove and redistribute** — the freed width is shared across the remaining keys, converting removed keys into **genuinely larger touch targets**.

  Each option MUST state its trade-off. The studio MUST NOT hard-code one as globally correct.
- **FR-029g**: The studio MUST **propose** the outcome from the layer's kind, and MUST allow override:
  - a layer with a **casing-parallel or modifier twin** (shift / caps / rightalt variants of the same alpha layout) → propose **suppress**, because muscle memory across the twins is the dominant value;
  - a **standalone function layer** (numeric, symbol, an alt-script plane) with no positional correspondence to preserve → propose **remove and redistribute**, because simplicity and target size are the dominant value;
  - when the row exceeds the platform crowding limit (`phone: 10`, `tablet: 13` — [check-18-3-keys-per-row.ts](../../packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts)) → propose **remove and redistribute** regardless of layer kind, and say that the row is over the limit.
- **FR-029h**: The chosen approach SHOULD be applied **consistently within a layer**. A row that mixes suppressed and removed keys achieves neither predictability nor extra touch area, so the studio MUST surface the inconsistency rather than let it accumulate silently.
- **FR-029c**: A **half-done suppression** MUST be reported: a non-interactive key that kept a rule-bearing id is still live, and a neutralized id left on a producing key type is an invisible dead key.
- **FR-029d**: A layer-switching key MUST be marked **active (`sp:2`) on the layer it switches to** and `sp:1` elsewhere. The studio MUST propose this automatically from the key's `nextlayer` and its containing layer, MUST keep the value editable, and MUST report a diagnostic when the two disagree (see [research.md](research.md) R3b).
- **FR-029e**: A ruleless sentinel id used for suppression (e.g. `T_BLANK`) MUST NOT be reported as a dead key — this idiom is why the dead-key exemptions in [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) §5.1 exist.
- **FR-030**: Per-key `layer` (the modifier override) MUST be preserved through parse and emit so that keys legitimately sharing an id within a layer remain distinguishable and addressable. *(Locked-type change — see Needs resolution.)*
- **FR-031**: Every key-level edit MUST promote the key's provenance to `hand-set`, or re-propagation will silently overwrite it. Promotion MUST be **address-matched**, not id-matched, so a rename cannot miss and same-id keys on other layers are not promoted incidentally.
- **FR-032**: Edits MUST enter the existing undo stack as a new entry kind, one entry per committed edit, and MUST be cleared by the existing keep-all / restore-all / reset actions.
- **FR-033**: Key-level edits MUST reach the artifact through the **existing single-writer chain**, applied as a raw-JSON overlay in the same slot the current keycap-removal pass occupies, so preview and zip stay identical and Case B byte-preservation (R9) holds for untouched keys on both cases.
- **FR-034**: The editor MUST NOT require the author to know whether the layout is Case A or Case B, but MUST state the provenance honestly and MUST render whatever platforms exist.

### Functional Requirements — placement in the flow, and the live preview

- **FR-035**: Key-level editing MUST be a **mode of the existing touch step**, not a new step and not a post-lock step. The touch step gains a mode selector (by character / by key); the character-driven walk remains the default. Rationale and the full cost of the alternatives are in [research.md](research.md) R9.
- **FR-036**: On entering the touch step, when the effective layout contains keys with no reachable output **and** the inventory has unplaced characters, the studio MUST **propose** the by-key mode and route into it — so an imported keyboard is fixed up **before** the character walk, without a separate step. When that condition does not hold, the character walk MUST remain the default.
- **FR-036a**: The mode selector MUST behave as a **view toggle, not a branch**. Switching modes MUST be free and lossless in both directions: no confirmation step, no state discarded, no work to redo. Authors will not know which view they need until they have experimented, so mode choice MUST NOT be a commitment.
- **FR-036b**: Toggling MUST preserve **both** modes' in-progress state — the by-character draft (per-character assignments, resolved suggestions, bulk-applied flags) and the by-key edit overlay. Neither may be cleared as a side effect of a mode change.
- **FR-036c**: **Context MUST carry across the toggle in both directions**, so the two modes read as two lenses on one layout rather than two workflows: switching from a character to by-key MUST select and reveal the key(s) producing that character (or the candidate keys when it is unplaced); switching from a key to by-character MUST land on a character that key produces. The character→key lookup already exists in [enumerateTouchMethodsForChar](../../packages/engine/src/pattern-apply/enumerateTouchMethodsForChar.ts).
- **FR-036d**: Both modes MUST report **one shared set of progress figures**, derived from the same state and live in both views — "characters still unplaced" and "keys with no letter" are two projections of one truth. They MUST NOT be independently maintained counters that can disagree.
- **FR-036e**: **Either mode MUST be able to complete the step.** Continue is gated on coverage (FR-008), never on which view is active; an author MUST never have to switch modes in order to move on.
- **FR-036f**: A key-level edit that invalidates a by-character assignment MUST warn **at the moment of the edit**, naming the affected character — e.g. suppressing a key that carries a longpress assigned for `ɛ`. Deferring this to the Continue gate is too late to be actionable.
- **FR-036g**: Undo MUST remain **one chronological stack across both modes**, and the undo affordance MUST state what it is about to undo, since after a mode switch the next undo may target work done in the other view. A silent cross-mode undo reads as a defect.
- **FR-037**: The **live on-screen-keyboard preview MUST remain available throughout key-level editing**, updating on every committed edit. This is the capability Keyman Developer structurally lacks — its Design view is a schematic DOM mock over a device photo and loads no engine, so consequences are invisible until compile. The preview is the primary defence against an author producing an incoherent layout.
- **FR-038**: The preview MUST be **truthful for every edit this feature adds**. Specifically, the touch preview's VFS transform currently injects only the touch layout; it MUST also apply the physical assignments, or a synthesized `T_`-key rule would not type and the rule-bearing assignment path would appear to be a silent no-op.
- **FR-039**: The studio MUST make layout **coherence visible rather than merely legal**: row slack rendered (not printed as numbers), suppression offered ahead of deletion so geometry is preserved (FR-029b), and destructive classes rejected at edit time (FR-045) rather than reported after the fact.

### Functional Requirements — collateral, cross-layer deletion, and family coherence

- **FR-060**: Disabling or removing a key MUST enumerate its **linked outputs** and warn before the edit commits: the key's own output plus every longpress (`sk`), flick, and multitap sub-key it hosts, each named by the character it produces. Cameroon is the worked case — suppressing `T_0021` silently discards the `U_00A1` (`¡`) longpress beneath it, which the author never sees on the keycap.
- **FR-061**: The warning MUST distinguish **characters that become unreachable** from **characters still available elsewhere**, naming the surviving location for the latter. Deleting the apostrophe key when punctuation has moved to a symbol layer discards nothing in practice, and a warning that cannot tell those two cases apart will be dismissed unread.
- **FR-062**: Characters that lose their **last** mechanism MUST return to the unplaced worklist, be counted in the shared progress figures (FR-036d), and be offered for re-placement — not merely reported as lost.
- **FR-063**: The studio MUST model a **layer family**: the set of layers that are modifier variants of the same *plane*. A layer id decomposes into `[<plane>-]<modifier-combo>`, with an absent plane meaning the base alphabetic plane — so `default` / `shift` / `caps` / `rightalt-shift` are one family, and `symbol` / `symbol-caps` are another. [comboToTouchLayerId](../../packages/engine/src/pattern-apply/modifierCombos.ts) provides only the forward combo→id direction; **the inverse and the plane concept are new machinery** this feature must add.
- **FR-064**: An edit that breaks **positional parallelism within a family** MUST complain loudly — adding, removing, moving, or resizing a key on `shift` without the corresponding change on `default`, `caps`, `rightalt`, and the rest of that family. Parallel position across modifier variants is what makes a layout predictable (FR-029g), and it is the invariant an author cannot check by eye across eight layers.
- **FR-065**: Where a family-breaking edit is intended, the studio MUST offer to **apply it across the family** as the proposed resolution, showing every affected layer and its per-layer content first (the same key may carry a different character on `shift` than on `default`).
- **FR-066**: **Distinct planes are freeform.** Symbol, emoji, numeric, and alt-script planes MUST NOT be subject to cross-plane parallelism complaints — they are independent layouts, not variants of one. Parallelism within a plane's own modifier family (e.g. `symbol` vs `symbol-caps`) MAY be checked but MUST default to a softer severity than the alphabetic family's.
- **FR-067**: A layer id the decomposition **cannot parse MUST be treated as its own freeform plane**, never as a family member. Imported keyboards name layers arbitrarily — `gff_amharic` has 53 layers named after Ethiopic characters — and the safe failure mode is silence, not a wave of false parallelism complaints about a layout we do not understand.
- **FR-068**: **Frame and layer-switch keys are exempt from parallelism on the properties that must vary** — typically the bottom row, though the exemption is keyed on the key being a frame/layer-switch key rather than on a row index. For these keys, `sp`, `nextlayer`, `id`, and keycap `text` MAY legitimately differ across the family and MUST NOT be reported:
  - `sp` **must** alternate `1`/`2` by design (FR-029d) — the Shift key is active on `shift` and inactive on `default`;
  - `nextlayer` targets necessarily differ — from `default` you go *to* `shift`, from `shift` you come *back*;
  - the id and keycap may differ at the same position — Cameroon carries `T_LOWER` on `symbol`, `T_UPPER` on `symbol-caps`, and `T_CAPS` as a `K_SHIFT` multitap child, all doing the equivalent job.

  **Position and width remain parallel and MUST still be checked** for these keys — a Shift key that moves or resizes between layers is real drift, which is exactly what [check-18-4](../../packages/keyboard-lint/src/checks/check-18-4-control-key-drift.ts) already enforces for `K_BKSP`/`K_ENTER`. This is the property split that check would need before its `CONTROL_KEY_IDS` set could be widened to cover layer-switch keys (see [research.md](research.md) R3b).

### Functional Requirements — live diagnostics (US5)

- **FR-040**: The studio MUST surface, at edit time, the equivalents of Developer's `WARN_TouchLayoutCustomKeyNotDefined` (0x092, with its `nextlayer`/`sp` exemptions), `WARN_TouchLayoutMissingLayer` (0x091), `WARN_TouchLayoutUnidentifiedKey` (0x099), `WARN_TouchLayoutMissingRequiredKeys` (0x093), `WARN_TouchLayoutSpecialLabelOnNormalKey` (0x0A9), and `ERROR_TouchLayoutInvalidIdentifier` (0x05A), plus four checks Developer lacks: duplicate id within a layer, orphan `T_` rule, a modifier key not marked active on its own layer (FR-029d), and a half-done suppression (FR-029c).
- **FR-041**: Each diagnostic MUST offer at least one concrete fix action.
- **FR-042**: Diagnostics MUST be computed as **synchronous pure joins with no new timer** (Decision D3 — the 300 ms cycle remains the validation cycle's).
- **FR-043**: The corresponding Layer C checks MUST be added as **siblings of existing 18.x criteria rows**, adding **no** rows to `criteria.json` (the 148-row count is length-tested, and a prior addition was reverted for exactly this reason).
- **FR-044**: The engine MUST return **structured** findings and fix descriptors; all user-facing copy MUST be composed in the studio and localized, following the existing method-label pattern.
- **FR-045**: Validation that would create an invalid state MUST **reject the mutation** rather than emit a finding — notably a dead `T_` key MUST NOT be creatable, and an in-layer id collision MUST NOT be writable.

### Non-functional / conformance

- **FR-050**: New UI MUST conform to [docs/accessibility.md](../../docs/accessibility.md): semantic HTML, keyboard operability, programmatic labels, ARIA APG grid pattern, codepoint-derived accessible names for glyphs, and information never carried by colour alone.
- **FR-051**: All new strings MUST use the i18n id convention from [specs/046-i18n-localization](../046-i18n-localization/contracts/catalog-format.md) and land in the English catalog.
- **FR-052**: This feature MUST NOT introduce touch-first authoring or any reverse touch→physical derivation.

### Key Entities

- **Touch key rule binding** — one `.kmn` rule keyed on a touch key id, carrying the id as written, the modifier words from its context, its role (produces / guard / suppresses / transitions / opaque), and the characters it produces.
- **Touch key rule index** — bindings grouped by normalized id, plus observed spellings, the set of producing ids, and a count of opaque fragments that could conceal a rule.
- **Key edit overlay** — an address-keyed map of committed key-level edits, applied as a raw-JSON pass over the derived layout; the unit of undo and of persistence.
- **Key edit operation** — one add / remove / set / rename / sub-key / row / layer operation, addressed by the existing `touchKeyAddress` scheme, applied by two thin appliers (IR and raw-JSON) over one shared resolver.
- **Key grid view model** — the pure projection from layout plus overlay to rows of keys with proportional geometry, annotations, provenance, and diagnostics.
- **Reachability view** — the reachable set, the orphaned set, and the orphan bindings, distinct from and additive to the plain produced set.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On `sil_cameroon_qwerty`, all fourteen combining-mark characters carried by `T_*` keys read as covered, and the touch completion gate does not block on them. Today all fourteen are reported uncovered.
- **SC-002**: On `sil_cameroon_azerty`, the orphan `T_03B1` rule is reported exactly once, and `sil_cameroon_qwerty` produces **zero** dead-`T_`-key findings.
- **SC-003**: `docs/keyboard-facet-index.json` is byte-identical after regeneration — the feature moves no facet value.
- **SC-004**: An author can assign a character to an existing `T_*` key and see it type in the live preview, using only the keyboard, in under two minutes from reaching the touch stage.
- **SC-005**: An author can rename a `T_*` key that appears on three layers and is referenced by two rules, and nothing is orphaned: the emitted keyboard compiles clean and the character remains reachable.
- **SC-006**: On an import-adapt walk, editing one key leaves every other key and every platform-level field byte-identical to the shipped source file.
- **SC-007**: Every one of the eight diagnostics in FR-040 is reachable in the UI with a working fix, and none of them requires a compile to discover.
- **SC-008**: No key the studio creates is ever dead: it is impossible to reach the artifact with a `T_*` key that has no rule, no `nextlayer`, and a producing `sp` class.
- **SC-009**: The new grid passes an automated accessibility scan with no serious violations and is fully operable with no pointer events.
- **SC-010**: No new debounce timer exists anywhere in the feature.

---

## Assumptions

- The author has locked their physical layout; this feature is entered only from the touch stage. Desktop-first remains the only flow.
- Phone and tablet remain the platforms our own derivation targets, but an imported layout may carry `desktop` as well and must round-trip unharmed.
- The `.kmn` remains the sole home for touch key output rules; we do not introduce a second mechanism for giving a `T_*` key an output.
- Byte-preservation (R9) applies to `.keyman-touch-layout` only. The `.kmn` has its own emit path, and synthesized rules already travel it via existing assignment and mark-guard synthesis.
- The corpus at `../keyboards` (the `keyboard-studio/keyboards` fork) is the calibration source; the figures in this spec are measured against it and are expected to drift with the pin.
- Editing flicks, multitaps, hints, widths, rows, layers, and platform properties is **deferred to later increments** of this feature, not to Keyman Developer. The staging is in [research.md](research.md).

---

## Out of Scope

- **Touch-first authoring** and any **reverse touch→physical derivation** (spec.md §16, §14 Decision 6, constitution Art. VII). The physical layout remains the mandatory substrate.
- **A raw JSON / code view** of the touch layout. Developer offers one because it must; we ship a real compile and a downloadable package instead.
- **Free-text layer naming**, and platform or layer **deep-copy on add** (specs/008 §"layer ids are auto-derived"; the deep-copies are footguns).
- **A device-photo presentation chooser** — superseded by the live OSK.
- **Improving Keyman Developer's own converter or editor.** Unchanged from 035.
- **Multi-source merge** and **survey-editing opaque `RawKmnFragment` content** (spec.md §16).
- **Adding rows, layers, or platforms**, and **authoring flicks/multitaps in the grid** — deferred to later increments (rows and layers additionally require a declared-writes extension).
