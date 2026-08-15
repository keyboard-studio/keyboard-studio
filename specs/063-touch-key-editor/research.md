# Research: streamlining Keyman Developer's touch layout builder

Companion to [spec.md](spec.md). This document records (1) what Developer's touch editor actually is, (2) the field-by-field streamlining judgement, (3) the corpus measurements behind the spec's calibration, and (4) the increment staging.

Paths prefixed `keyman/` are relative to the sibling `../keyman` checkout; unprefixed paths are this repo.

---

## R1. Where Developer's touch editor lives

| Concern | Location |
|---|---|
| Canonical TS types | `keyman/common/web/types/src/keyman-touch-layout/keyman-touch-layout-file.ts` |
| JSON Schema — read (loose, legacy-tolerant) | `keyman/common/schemas/keyman-touch-layout/keyman-touch-layout.spec.json` |
| JSON Schema — write ("clean") | `keyman/common/schemas/keyman-touch-layout/keyman-touch-layout.clean.spec.json` |
| Reader / writer | `keyman/developer/src/common/web/utils/src/types/keyman-touch-layout/keyman-touch-layout-file-{reader,writer}.ts` |
| Delphi object model + validator | `keyman/developer/src/tike/oskbuilder/TouchLayout.pas`, `TouchLayoutDefinitions.pas` |
| The editor itself (HTML/JS) | `keyman/developer/src/tike/xml/layoutbuilder/` |
| Compile-time validation | `keyman/developer/src/kmc-kmn/src/kmw-compiler/validate-layout-file.ts` |
| Message codes | `keyman/developer/src/kmc-kmn/src/compiler/kmn-compiler-messages.ts`, `.../kmw-compiler/kmw-compiler-messages.ts` |
| `T_` id → VKDictionary | `keyman/developer/src/kmcmplib/src/Compiler.cpp` (`GetVKCode`, `BuildVKDictionary`) |
| Runtime defaults / render | `keyman/web/src/engine/keyboard/src/keyboards/activeLayout.ts`, `defaultLayouts.ts` |

Architecture: a Delphi frame (`UframeTouchLayoutBuilder.pas`) hosts a **CEF browser** pointed at Developer's internal HTTP server, which serves an XSL-transformed page running a jQuery editor. Editor→Delphi commands travel over a fake navigation (`location.href = 'keyman:command?…'`); every edit re-serializes the whole layout and POSTs it back. Undo is whole-document JSON snapshots, 100 deep.

**Two schemas, and the Delphi model agrees with neither.** Read with the loose spec (numeric strings tolerated, `row.id` either type); write with the clean spec (strict numbers, `sp` enum `[0,1,2,8,9,10]`). But the writer's `compile()` path converts `pad`/`sp`/`width` *back to strings* and stringifies `row.id` for KeymanWeb, while `TouchLayoutDefinitions.pas` types `row.id` as `TJSONString` — so a canonical clean file fails Delphi validation. Our own reader/emitter pair already navigates this correctly (`parseTouchLayout.ts` normalizes, `parse-touch.ts` re-stringifies).

**`sp:0`, `width:0`, `pad:0` are indistinguishable from absent** — the runtime applies defaults with `||=`, and the writer deletes zeros. Anything we emit must not rely on an explicit zero.

**`dk` is dead.** Present in the loose schema and the Delphi model, absent from the current TS type and the clean schema, never used for anything. Ignore it. **This verdict is about `dk` specifically, not a claim that every loose-schema field was audited with equal care** — the subkey `default` field (R4) is a loose-schema field that is very much alive on the wire and was initially missed in this pass.

---

## R2. The `sp` enum — and our defect

`keyman/common/web/types/src/keyman-touch-layout/keyman-touch-layout-file.ts:106-129`:

```
normal=0, special=1, specialActive=2,
customSpecial=3, customSpecialActive=4,   // KeymanWeb runtime private use — never in a file
deadkey=8,   // "A styling signal to indicate that the key may have 'deadkey' type behaviour."
blank=9,     // "A key which is rendered as a blank keycap, blocks any interaction"
spacer=10    // "Renders the key only as a gap or spacer, blocks any interaction"
```

The **"blocks any interaction"** set is therefore `{9, 10}`. Our `SPACER_SP_VALUES` in [packages/contracts/src/touch-coverage.ts](../../packages/contracts/src/touch-coverage.ts) is `{8, 10}` — wrong in both directions:

- `sp:8` keys are **interactive and carry real text** (`{"id":"K_COLON","text":";","sp":8}`; `arabic_w_o_dots` has an `sp:8` key with text `الإعراب`). We discard 997 corpus keys as spacers.
- `sp:9` keys are non-interactive blanks. We credit 804 of them.

Corpus distribution across `keyboards/release`: `sp:0` 2,999 · `sp:1` 24,267 · `sp:2` 1,653 · **`sp:8` 997** · **`sp:9` 804** · `sp:10` 6,513.

This also decodes Developer's 0x092 exemption: it warns about a rule-less custom key only when `sp ∈ {normal(0), deadkey(8)}`, because those are exactly the classes where a custom key is *expected* to produce output via a rule. Our corrected predicate makes that exemption expressible.

Three call sites move: `touch-coverage.ts` (`collectKeyChars`), `check-18-3-keys-per-row.ts`, and `applyTouchAssignmentsToRawJson.ts` (`isBlankPlaceholder`). Isolate this in its own change with a keys-per-row recount — the blast radius is small and asymmetric (the 804 keys losing credit have no `text`; the 997 gaining it are genuinely interactive), but it moves a shared predicate.

Separately, `TouchKeyIR.sp`'s doc comment in [keyboard-ir.ts](../../packages/contracts/src/keyboard-ir.ts) says "8 spacer" and must be corrected to match upstream.

---

## R3. Field-by-field streamlining verdict

### The rule that generates these verdicts *(read before changing any of them)*

An earlier draft of this document cut Developer's six `sp` values to three and was reversed on author direction (R3a). The failure was not the individual call but the absence of a stated rule, so here it is:

> **Mechanism is kept; ceremony is cut.**
>
> **Mechanism** = anything that changes what the keyboard *does* — every value the file format can express. Keep all of it and add a *proposed default*. §3c "defaults are the product" licenses **proposing** a value, never **removing** the ability to set one. If a verdict makes something the format can express unreachable in our UI, the verdict is wrong.
>
> **Ceremony** = what the author must know, remember, and keep in sync to operate the tool. Cut freely.

Four cuts follow from that rule, and they are the only legitimate kinds:

1. **Collapse duplicate input surfaces.** Two boxes for typing one value is ceremony (Text + Text Unicode; Hint + Hint Unicode). One field that accepts either form loses nothing.
2. **Change presentation, not reach.** Presets up front with numeric entry under Advanced (width, padding). Every value stays reachable at Developer's own bounds.
3. **Remove workarounds for gaps Developer has and we do not.** The device-photo chooser exists because Developer has no live OSK; the raw JSON view exists because its editor validates nothing; `T_new_<n>` exists because it has no proposal engine; the templates and KVK import exist because it cannot derive from `.kmn` rules. Fix the cause and the workaround is not a loss.
4. **Drop what violates a locked decision of ours.** Free-text layer names (specs/008 — layer ids are auto-derived), and platform/layer deep-copy on add (silently duplicates a layer's whole key set).

And one addition that is not subtraction, and is where most of the value is: **make compound edits single actions.** Suppression is two fields in Developer that must agree (R3a); active-modifier typing is a field you must remember (R3b); assigning a letter spans a keycap, an id, and a `.kmn` rule across two files and two tools. Each becomes one action with a proposal, and a disagreement between the halves becomes a finding rather than a compile-time surprise.

Scored against that rule, the inspector below keeps **11 of 13 fields**, merges 2 pure duplicates, and drops **no capability at all**; everything genuinely dropped is outside the inspector and falls under cut 3 or 4. Deferred items (flicks, multitap, rows, layers — R8) are a schedule statement, not a capability statement.



Developer's key inspector has thirteen fields. Verdicts, with reasons.

| Developer field | Verdict | Reason / replacement |
|---|---|---|
| **Keycap Value** — dropdown of "Text" plus ~40 `*Special*` PUA labels | **SIMPLIFY** | A special label is a *consequence* of a key's role, not an independent choice. Offer a narrow system-key picker (Shift, Backspace, Enter, Space, Numeric, Symbol) that appears **only** when the key is a frame key. This makes `WARN_TouchLayoutSpecialLabelOnNormalKey` (0x0A9) structurally impossible rather than deferring it to compile. |
| **Text** | **KEEP** (as "Keycap") | With glyph preview and codepoint label. Proposed from the assigned character; never blank. |
| **Text Unicode** — a second box, bidirectionally synced | **MERGE** | One field accepting a character *or* `U+025B`, with a live reflection line. `lib/charInput.ts`'s `reflectCharInput` and its localized "Type a character directly, or a Unicode value like U+00E9" copy already ship in `KeyPickerField.tsx`. Reuse; do not rebuild two synced boxes. |
| **Hint** | **DERIVE**, override behind Advanced | Platform `defaultHint` decides the family. **Keep Developer's one genuinely good idea**: the field's *placeholder shows the inferred hint*, so the author sees what they would get without an override. |
| **Hint Unicode** | **DROP** | Subsumed by the merged character/`U+` field. |
| **Key Type** — six `sp` values | **KEEP, all of them, with a proposed default** | Corrected 2026-08-03 on author direction — see R3a. `sp` is a real authoring control, not a detail to hide: suppressing a key on an alt layer by setting it to **spacer** is an active idiom, and **blank (9) vs spacer (10) is a distinction authors use deliberately**. Expose the full legal set `{0, 1, 2, 8, 9, 10}` with plain-language labels and a *proposed* value per context; never remove the option. `specialActive` (2) gets a proposal (a frame key on the layer it switches *to*) rather than being derived away, which still defuses Developer's footgun without taking the control. |
| **Modifier** (`key.layer`) | **DERIVE / read-only** | The most confusing field in Developer, and for us it is *computable*: our layer ids are auto-derived from modifier combos (`comboToTouchLayerId`, specs/008 §3c), so the modifier a key should send is the combo its layer flattens from — **unless the key itself carries a per-key `layer` override**, which supersedes the containing layer for the derived "Sends:" line (`TouchKeyIR.layer` exists for exactly these 11,593 corpus keys, R4). Show it as a read-only "**Sends:** Shift+K_Q (from the Shift layer)" line, placed visually far from Next Layer. See R4 — the field must still round-trip even though we do not let authors set it. |
| **ID** — free text, maxlength 64, VK autocomplete, **zero validation** | **KEEP but invert** | This is the §3c anti-pattern. Replace the always-live text box with the current id in mono plus a **Rename…** action whose field is **pre-filled with the proposed id** and validated live. The VK-name table survives as *validation data* (a `K_` id must be a real VK name), not as a substitute for validation. |
| **Padding Left** | **SIMPLIFY** | "Gap before this key" in half-key steps (none / ½ / 1), plus "Insert spacer key" — which is what `pad` is usually emulating. Numeric entry survives under Advanced. |
| **Width** | **SIMPLIFY** | Segmented presets (½ · 1 · 1½ · 2 · Fill row), drag-resize as enhancement, and a visible row-slack bar. Advanced keeps numeric entry within Developer's 10–500 bounds so nothing is unreachable. |
| **Next Layer** | **KEEP** | Dropdown of the platform's layers with friendly labels (never raw ids), plus "(none)", with a live dangling-target check. |
| **Gesture Type** (sub-key, read-only) | **KEEP** as a heading | Not a field. |
| **Default selection** (longpress only) | **KEEP** | A real decision with no defensible auto-answer beyond "first". |
| per-key `font` / `fontsize` (in the format; Developer hides them) | **DROP** | Stay hidden. |

### R3a — Key suppression: `sp` plus a ruleless id, and why it is not deletion

Recorded from author direction (2026-08-03). This is the idiom that corrects the Key Type row above, and it is a **compound** edit with three distinct jobs. Getting one half right and the other wrong is a silent defect, which is why the studio must offer it as one action rather than as two fields.

**1. `sp` hides the key.** To suppress a key that should not output on an alt layer, set its key type to **spacer** (`sp:10`) — or **blank** (`sp:9`) when a keycap-shaped hole is wanted rather than a gap. Both "block any interaction" per the upstream enum (R2). This is the *rendering and interactivity* half.

**2. A ruleless id stops the output.** Independently, neutralize the id — the author's convention is `T_BLANK`, deliberately left undefined (no `.kmn` rule) "so that it doesn't trigger the underlying key." This is the *output* half, and `sp` does not do it. Three mechanisms have to miss for a key to be truly silent, and a ruleless custom id is what makes all three miss:

- **No rule can match.** Nothing is keyed on `T_BLANK`, so no `.kmn` rule fires. A key that kept its original id (say `K_Q` on a `rightalt` layer) would still match whatever `[RALT K_Q]` rule the keyboard defines — which is precisely the "underlying key" being triggered.
- **`forUnicodeKeynames` misses**, because the id is not a `U_` id ([contracts/key-id-policy.md](contracts/key-id-policy.md) §1a).
- **`forBaseKeys` misses**, because a custom id's code is ≥256 (VKDictionary-interned) and therefore outside every `Codes.keyCodes` range that function tests.

Worth knowing precisely: `forBaseKeys` (`keyman/web/src/engine/keyboard/src/defaultRules.ts:189-202`) *also* self-limits to the default and shift layers — any other modifier state returns `null` with the log *"KMW only defines default key output for the 'default' and 'shift' layers!"*. So on a correctly-modifier-tagged alt layer the base fall-through is not the exposure; **rule matching is**. The id neutralization is doing real work regardless, and it is the half that does not depend on the layer being tagged as the author expects.

**3. Hiding preserves geometry — this is why it is not deletion.** Suppressing a key in place keeps the row's key count and widths, so **the remaining keys stay in their expected positions**. Deleting the key would reflow the row and move every key after it, and because the last key in a row is stretched to consume the remainder (see "Geometry, for the record" below), a deletion also silently resizes the row's final key.

This is the same conclusion our own engine already reached internally: `applyDesktopModifications` mints inert `T_removed_<n>` placeholders expressly "so row geometry stays stable", and the carve and touch-method deletion passes neutralize ids to `T_carved_*` / `T_touchdel_*`. **The engine already implements the author's idiom programmatically; the studio simply never exposed it.** Exposing it is most of the work.

**Design consequences.**

- **Suppression is one of three outcomes, not the default — see R3c.** It is the right answer for casing-parallel and modifier twin layers, where muscle memory is the dominant value. On a standalone function layer, removal with width redistribution is the right answer, because suppression buys predictability the author does not need at the cost of touch area they do. US4's "leave a full-width spacer" is therefore the *proposal* for a twin layer, not a global default.
- **Suppression sets both halves in one action**, and the diagnostics must treat a half-done suppression as a finding: a spacer-class key that kept a rule-bearing id is still live, and a neutralized id left at `sp:0` is an invisible dead key.
- **A ruleless `T_BLANK` is legitimate, not a defect.** The dead-`T_`-key check already exempts sentinel ids and blank/spacer classes ([contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) §5.1) — this idiom is exactly why those exemptions exist, and Cameroon's 70 `T_BLANK` sites are the attested precedent.
- **The `isSpacerKeyClass` fix matters more than it first appeared.** If authors distinguish blank (9) from spacer (10), a predicate that reads `{8, 10}` mishandles both ends of the idiom: it credits blank keys as producing their keycap text (Cameroon's `T_BLANK` sites carry `" "`, so a space is spuriously credited) while treating interactive deadkey-styled keys as inert.

### R3c — Predictability versus touchable area: an opposed pair, not a default

Recorded from author direction (2026-08-03), correcting R3a's stronger claim that suppression should be the default offer whenever a key is unwanted. The author's own framing: *"my method of blank keys is a solution to improve predictability across layers, but does not give more touchable space"* — and *"some users will want to remove keys to make touch layers simpler."*

These are **two legitimate goals that trade off directly**, and no single default serves both:

| Goal | Mechanism | Positions across layers | Touchable area |
|---|---|---|---|
| **Predictability** | suppress in place (blank / spacer + ruleless id) | preserved | **unchanged** — the layer stays as dense as its busiest sibling |
| **Simplicity / touchability** | remove, then **redistribute** the freed width | deliberately changed | **increased, evenly** |
| *(neither, usually)* | remove and reflow — Developer's plain delete | keys shift left | marginal and **uneven**: only the row's stretched final key grows |

That third row is worth naming explicitly because it is Developer's only removal behaviour and it is usually the worst of the three: positions move *and* the freed space lands lopsidedly on one key, because the last key in a row absorbs the remainder (see "Geometry, for the record"). Converting removed keys into usable touch area requires a deliberate redistribute step — which is why "Even out row" must be offered *as part of* removal rather than as an unrelated tidy-up action.

**The proposal is derivable from layer kind**, which is what keeps this defaults-first rather than a bare question:

- A layer with a **casing-parallel or modifier twin** — the shift / caps / rightalt variants of one alpha layout — is where muscle memory lives. A character's key should be in the same place whether or not Shift is engaged. Propose **suppress**. The concept already exists in `casePairTouchTarget`'s "casing-parallel layer" ([touchBehavior.ts](../../packages/studio/src/editors/assignLoop/touchBehavior.ts)), and modifier-layer detection exists in [touch-layout.ts](../../utilities/facet-index/touch-layout.ts) (`modifierLayerIds`, `hasSymbolLayer`).
- A **standalone function layer** — numeric, symbol, an alt-script plane — has no positional correspondence to preserve, so density is pure cost. Propose **remove and redistribute**.
- **Crowding overrides layer kind.** `MAX_KEYS = { phone: 10, tablet: 13 }` in [check-18-3-keys-per-row.ts](../../packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts) is the existing threshold, and Developer's own docs advise ten keys per row as the small-device maximum. A row over its limit should be offered redistribution regardless, with the reason stated.

**Consistency within a layer matters more than which option is chosen.** A row with three suppressed keys and two removed ones gets neither benefit: positions have already shifted, so predictability is gone, and the freed area was only partly reclaimed. The studio should surface that mixture rather than let it accumulate — this is a coherence finding in the FR-039 sense, not a correctness one.

**Consequence for R3a.** Suppression remains the mechanism whose *two halves* must be set together, and it remains the right answer for modifier twins. It is no longer claimed as the universal default. Deletion is a first-class outcome, not a fallback.

### R3f — Layer families, and the collateral of removing a key

Author direction (2026-08-03), and it supersedes R3c's looser "layer kind" heuristic with a real structural model: *"complain loudly if the user tries to make a change to one layer that conflicts with the placement of keys on other similar layers (shift, Caps, RAlt, Alt, Ctrl, RAlt Ctrl, etc.) but symbol or emoji layers are likely to be freeform."*

**The grid is not editing one layer. It is editing a family of parallel layers.** A layer id decomposes as `[<plane>-]<modifier-combo>`, absent plane meaning the base alphabetic plane:

| Plane | Family members (Cameroon) |
|---|---|
| alphabetic | `default`, `shift`, `caps`, `rightalt`, `rightalt-shift`, `rightalt-caps` |
| symbol | `symbol`, `symbol-caps` |

Parallelism is expected **within** a family and not **across** planes. That is precisely the invariant the author's blank-key method exists to protect, and the one thing an author cannot verify by eye across eight layers — which is why it earns a loud complaint rather than a quiet hint.

**This is new machinery.** [modifierCombos.ts](../../packages/engine/src/pattern-apply/modifierCombos.ts) gives only the forward direction: `comboToTouchLayerId(tokens)` emits `"rightalt-shift"` or `"default"`. There is **no inverse and no plane concept** — `symbol-caps` is not something `comboToTouchLayerId` can produce, since `symbol` is not a `ModifierToken`. The decomposition, the family grouping, and the parallelism comparison all have to be built.

**Fail silent on layouts we do not understand.** An unparseable layer id becomes its own freeform plane, never a family member (FR-067). Imported keyboards name layers arbitrarily — `gff_amharic` has 53 layers named after Ethiopic consonants, `fv_southern_carrier` has 35 — and a decomposition that guessed at those would emit a wave of false complaints. Silence is the correct failure mode for a heuristic that drives a *loud* warning.

#### The bottom-row exception makes the check property-scoped

Author direction: *"sometimes the modifier keys will change appropriately on the bottom row."* Correct, and it means parallelism cannot be compared key-wholesale. For frame and layer-switch keys, some properties **must** vary across the family:

| Property | Across a family | Why |
|---|---|---|
| `sp` | **varies by design** | `1`/`2` alternation — the Shift key is active on `shift`, inactive on `default` (R3b) |
| `nextlayer` | **varies by design** | from `default` you go *to* `shift`; from `shift` you come *back* |
| `id`, keycap `text` | **may vary** | Cameroon uses `T_LOWER` on `symbol`, `T_UPPER` on `symbol-caps`, `T_CAPS` as a `K_SHIFT` multitap child — equivalent jobs, different ids at the same position |
| **position, width** | **must stay parallel** | a Shift key that moves or resizes between layers is real drift |

So the exemption is **property-scoped, not key-scoped**, and it is keyed on the key being a frame/layer-switch key rather than on a row index (the bottom row is a convention, not a rule). This is also exactly the property split [check-18-4](../../packages/keyboard-lint/src/checks/check-18-4-control-key-drift.ts) would need before its `CONTROL_KEY_IDS` could be widened past `K_BKSP`/`K_ENTER` — see the latent-trap note in R3b.

#### Collateral: what a removal actually discards

A key is a small tree, and the keycap shows only its root. Removing or suppressing it discards the key's own output **plus every longpress, flick, and multitap sub-key beneath it** — outputs the author cannot see on the grid. Cameroon is the worked case: suppressing `T_0021` also destroys the `U_00A1` (`¡`) longpress under it, and `T_003F` hides `U_00BF` (`¿`) the same way.

Two refinements that decide whether the warning gets read or dismissed:

1. **Separate "becomes unreachable" from "still available elsewhere"** (FR-061). The author's own example — deleting the apostrophe key because punctuation now lives on a symbol layer — discards nothing in practice. A warning that cannot tell that from real loss trains the author to click through it. Coverage already knows the difference; the warning must use it.
2. **Re-place, don't just report** (FR-062). Characters that lose their *last* mechanism return to the unplaced worklist, count toward the shared progress figures (FR-036d), and are offered for placement. "These letters will need to be re-placed" is a workflow obligation, not a notice.

#### Cross-layer deletion

Removing the apostrophe key means removing it from every layer of its family, not clicking through six layers. So removal MUST offer family-wide scope as the *proposed* action (FR-065), first showing every affected layer with its per-layer content — the same position may hold a different character on `shift` than on `default`, and the collateral differs per layer too.

### R3b — Modifier keys must be marked active on their own layer

Recorded from author direction (2026-08-03). A layer-switching key must carry **`sp:2` (specialActive)** on the layer it switches *to*, and `sp:1` (special) elsewhere. The Shift key on the `shift` layer is active; the Shift key on `default` is not. This is what makes the OSK show the engaged modifier as engaged.

Cameroon is the attested example: the symbol layer's "back to letters" key is `{"id":"T_LOWER","text":"*abc*","sp":2,"nextlayer":"default"}` — `sp:2` because the symbol layer is the one it is currently *on*, while the same logical key is `sp:1` where it is merely a way in.

**This is a derivable rule, and it stays a proposal rather than a derivation.** The relationship (`key.nextlayer === containing layer` ⇒ active) is computable, so the studio should:

1. **Propose** `sp:2` automatically when a frame key is placed on the layer it targets, and `sp:1` otherwise — so the author never has to think about it and Developer's worst footgun is defused by default;
2. **Keep the field editable** (R3a's correction), because `sp` is an authoring control;
3. **Report a live diagnostic** when the two disagree — a frame key whose `nextlayer` names its own containing layer but which is not `sp:2`, or the converse. This is new; Developer has no such check.

**Interaction with check 18.4 — a latent trap, not a present bug.** Verified against [check-18-4-control-key-drift.ts](../../packages/keyboard-lint/src/checks/check-18-4-control-key-drift.ts): that check compares `sp`, width, and position for the same control key across layers using a strict `base.sp !== geometry.sp`, and its documented design decision is that *"asymmetric sp/width IS drift"*. It does **not** false-fire on the modifier alternation today, because its scope is `CONTROL_KEY_IDS = {K_BKSP, K_ENTER}` — neither of which is a layer-switching key, so both legitimately hold constant `sp` across layers.

The trap is for a future extension. Widening `CONTROL_KEY_IDS` to cover layer-switch keys such as `K_SHIFT` — plausible, and arguably desirable for width and position consistency — would make the strict comparison fire on **every correctly-authored `sp:1`/`sp:2` pair**. If that widening ever happens, the `sp` comparison must first be taught to treat the active/inactive pair as equivalent while still catching genuine drift. Left as a note here so the next person to touch that check finds it.

### Surrounding UI

| Developer feature | Verdict | Reason |
|---|---|---|
| **Character map drag-and-drop** onto a key, deriving `U_xxxx` from the dropped char | **ADOPT** — and promote | The best interaction in Developer's editor and the direct answer to "assign letters to keys". In Developer it is an easter egg gated on the key still being named `T_new_*` or Ctrl being held; for us the derived `U_<HEX>` id becomes the **default proposal**. Layer it over a keyboard-complete path — our `CharacterMapPane` cells gain an "assign to selected key" action. |
| **Row metrics readout** ("N keys / K width / P padding / T total") | **ADOPT and improve** | Developer prints numbers and warns about nothing. Render the slack **visibly** as a hatched strip and offer "Fill row" / "Even out row". |
| **Presentation / device-photo chooser** (5 device images) | **DROP** | Developer needs a device photo because it has no live OSK. We render the real KeymanWeb OSK beside the grid; the grid is a schematic editing surface and the OSK is the truth. |
| **Floating "wedge" add/delete buttons** | **REPLACE** | Pointer-only and unlabelable. A per-key command menu plus cell shortcuts (Insert / Shift+Insert / Delete / Alt+Arrow), with drag as enhancement. |
| **Delete last key in a row ⇒ silently delete the row** | **CHANGE** | Prompt, defaulting to keeping the row. `applyTouchAssignmentsToRawJson`'s positional-fallback promotion depends on sibling layers staying positionally aligned; silent row deletion breaks that. |
| **Templates** (basic / latin / traditional) + merge-by-id | **DROP** | Superseded by our scaffolder and the 035 seed-source fork. |
| **"Import from On Screen"** — derives touch from the `.kvk`/`.kvks`, *not* from `.kmn` rules | **DROP** | Superseded by `scaffoldTouchLayout`, which derives from the rules — strictly more informed. Note for the record: **no feature in Developer reads `.kmn` rules to synthesize a touch layout.** |
| **Platform add/remove**, add = deep-copy of current | **DROP** | Deep-copy is a footgun. Render the platforms that exist. |
| **Layer add/remove/rename**, add = deep-copy, name = **free text** | **DROP for v1** | specs/008 §~98: *"Layer ids are auto-derived, not author-typed (§3c)… there is no user naming step."* The one legitimate naming case — an author-added non-modifier plane — arrives in Increment 3 with a hinted default, never a blank id. Also note Developer's rename fix-up has a latent bug: it iterates `key.flick` with `forEach` although `flick` is an object, so flick sub-keys are missed. Do not reproduce it. |
| **Code (raw JSON) view** | **DROP** | Developer needs it as an escape hatch from its own unvalidated editor. We ship a real compile and a downloadable package. |
| **Undo** — whole-document snapshots, 100 deep, coalesced per focus session | **ADOPT the coalescing, not the mechanism** | Commit-on-blur/Enter reproduces the useful behaviour; our overlay is small and pure, so a per-edit inverse is cheaper and exact. |

### R3d — The proposed UI, mouse-first

**The problem to solve first: two keyboard-shaped surfaces.** The OSK preview is a KeymanWeb iframe and **cannot be made selectable** — a click there types the key (FR-020g). So an editable representation has to exist *alongside* it, which means the author sees two pictures of the same keyboard. Developer never had this problem because it had only a mock; we have a mock *and* a true renderer.

Resolved by giving them different verbs, different headers, and deliberately different visual treatment:

- **EDIT KEYS** — the schematic grid. Flat, shows key ids and diagnostic badges, click to select. This is where things change.
- **PREVIEW** — the real OSK, rendered as the end user sees it. Already interactive; **you type on it to test**. It is never a selection surface.

By-key mode replaces the touch step's left pane; the existing right-pane OSK stays where it is.

```
┌ TOUCH ──────────────────────────────────────────────────────────────────────┐
│  ○ By character   ● By key                                   [ Continue → ] │
├────────────┬─────────────────────────────────────────────┬──────────────────┤
│ LAYERS     │ EDIT KEYS · rightalt                        │ PREVIEW          │
│            │                                             │                  │
│ default  ✓ │  ┌────┬────┬────┬────┬────┬────┬────┐       │ ┌──────────────┐ │
│ shift    ✓ │  │ ə  │ ɛ  │ ɔ  │ ŋ  │    │    │    │       │ │  (real OSK)  │ │
│▸rightalt 12│  │U_259│U_25B│U_254│U_14B│T_BL│T_BL│T_BL│    │ │              │ │
│ caps     ✓ │  └────┴────┴────┴────┴────┴────┴────┘       │ │ type here to │ │
│ symbol   3 │  ┌────┬────┬────┬────┬────┬────┐            │ │ test it      │ │
│            │  │ ◌̀ •│ ◌́ •│ ◌̂ •│ ◌̃ •│ ⚠  │    │  <- hover │ └──────────────┘ │
│ FIND       │  └────┴────┴────┴──┬─┴────┴────┘     shows   │   phone ▾        │
│ [ ɛ      ] │                 (+)⋯(+)               (+)⋯   │                  │
│            │                                             │                  │
│ ☑ no letter│  ┌─ SELECTED KEY ──────────────────────┐    │                  │
│    (12)    │  │ Keycap  [ɛ      ]  ɛ  U+025B        │    │                  │
│ ☐ suppressed│ │ Id       U_025B         [ Rename… ] │    │                  │
│            │  │ Type    [ Character key    ▾ ]      │    │                  │
│            │  │ Goes to [ (none)           ▾ ]      │    │                  │
│            │  │ Sends:  RAlt + K_E  (from rightalt) │    │                  │
│            │  │ ⚠ types nothing  [ Assign… ][ Fix ] │    │                  │
│            │  └─────────────────────────────────────┘    │                  │
└────────────┴─────────────────────────────────────────────┴──────────────────┘
```

**Mouse-first action inventory** (keyboard equivalents in R3e):

| Mouse | Result |
|---|---|
| Click a layer in the left rail | Grid shows that layer; the badge counts keys needing attention |
| **Click a key** | Selects it — selection ring on the key, inspector below populates |
| **Hover a key** | Reveals `(+)` on each edge (add before / after) and `⋯`; tooltip gives the id and what the key types |
| **Right-click a key** | Context menu: Assign a character… · Rename id… · Suppress · Remove… · Add key before/after · Duplicate |
| **Double-click** a key that has a "Goes to" layer | Navigates to that layer — Developer's behaviour, kept because it is genuinely good |
| Drag a key | Reorder within the row |
| Drag a key's right edge | Resize width, live, with the row slack updating |
| Click **Assign a character…** | Opens the panel: inventory characters as clickable chips, the character map, and a type-it field |
| Click a `⚠` badge | Scrolls the inspector to that finding, with its fix button |
| Type on the **preview** | Tests the keyboard. Selects nothing. |

**The left rail is the find surface.** Ticking `☑ no letter (12)` dims everything else in the grid, so the US2 worklist becomes twelve highlighted keys to click through in order. This is why find-by-value (FR-020e) is not a convenience: on an 8-layer, 394-key layout it is the main way an author reaches the key they mean.

**Hover-revealed `(+)`/`⋯` is Developer's wedge idea, kept deliberately.** The wedges were the right *mouse* affordance; their faults were being the only route and being unlabeled. A right-click menu plus keyboard shortcuts fix both without giving up the fast path.

### R3e — Selecting a key

Developer's selection model is pointer-first: click a key, and floating wedge buttons reposition themselves around it. Its only non-spatial route is a "Press any key to select it on the keyboard" dialog that matches the pressed physical key against the standard VK table — clever for a desktop-shaped layout, useless for a `T_`-keyed one. There is no find, no filter, and no keyboard navigation of the grid itself.

Our model, per FR-020a-g:

- **One Tab stop** via roving tabindex (`CharScrollStrip`'s `hasSelectedVisible` pattern). Several hundred keys must not mean several hundred Tab stops — [docs/accessibility.md](../../docs/accessibility.md) rule 3 requires the ARIA APG grid pattern for exactly this reason, and names the existing character-map grid as already audited against it.
- **Selection separate from editing.** Arrows and clicks move selection with focus staying in the grid; Enter/F2 enters the inspector; Escape returns. Avoids the trap where arrowing away from a half-typed field silently discards it.
- **Geometry-based vertical navigation.** The load-bearing detail: rows have unequal key counts *and* unequal widths, so index-clamping puts the caret somewhere the author is not looking. Land on the key whose horizontal span contains the current centre — computable from the `padPct`/`widthPct` the view model already carries for rendering.
- **No wrap across layers**; a layer selector switches, and the selected row/column position is **held across the switch** so comparing a key across `default`/`shift`/`caps` is one action. That doubles as the verification that a twin layer's predictability (R3c) actually holds.
- **Find by value.** The gap spatial navigation leaves: in the Cameroon flow the author knows *"the key that types `ɛ`"* or *"`T_0300`"*, not a grid coordinate, and 394 keys across 8 layers make arrowing unreasonable. A filter by id / by produced character / by "no assigned output" is likely the *most-used* selection route, not a convenience — and the third filter is precisely the US2 worklist. `enumerateTouchMethodsForChar` already implements the character→key lookup.

Two constraints worth stating so nobody designs against them:

- **`[role="grid"]` must join `SKIP_SELECTOR`** in [useCharCycleKeys.ts](../../packages/studio/src/editors/assignLoop/useCharCycleKeys.ts) (verified absent: the list is `input, textarea, select, [contenteditable], [role="listbox"], [role="combobox"], [aria-expanded="true"]`). That hook lives at the pane level and eats ArrowLeft/ArrowRight from its whole subtree otherwise.
- **No click-to-select from the OSK preview.** It is a KeymanWeb iframe; a click there types the key. Highlighting the corresponding grid cell from a preview interaction is not available, and the reverse direction (grid selection → preview) is the only one that works.

**Sub-key selection is deferred to Increment 2.** Longpress, multitap, and flick entries are nested keys and need a second-level selection model (Developer used three tabbed panes below the grid). Increment 1 *displays* them as per-key annotations and reaches their deletion through the existing per-method path, which already exists in the gallery.

### Validation: the largest single gain

Developer's editor validates **essentially nothing** — no id syntax check, no duplicate-id detection, no overfull-row warning, no dangling-`nextlayer` check, and no "`T_` key has no rule" check (the editor cannot see the `.kmn`). Everything is deferred to compile. Every one of those is a **pure synchronous join** available to us at edit time.

| Keyman message | Code | Our treatment |
|---|---|---|
| `ERROR_TouchLayoutInvalidIdentifier` | `SevError\|0x05A` | Live; blocks the mutation |
| `WARN_TouchLayoutCustomKeyNotDefined` | `SevWarn\|0x092` | Live — **the Cameroon diagnostic**; needs the R5 join |
| `WARN_TouchLayoutMissingLayer` | `SevWarn\|0x091` | Live; fix = repoint or remove |
| `WARN_TouchLayoutUnidentifiedKey` | `SevWarn\|0x099` | Live |
| `WARN_TouchLayoutMissingRequiredKeys` | `SevWarn\|0x093` | Live; per layer, `K_LOPT`/`K_BKSP`/`K_ENTER` |
| `WARN_TouchLayoutSpecialLabelOnNormalKey` | `SevWarn\|0x0A9` | Structurally prevented; still checked on import — see version-gating note below |
| version gates (multi-codepoint `U_` → KM15; flick/multitap → KM17) | Hint/Info | Live, informational |
| *(Developer has none)* duplicate id within a layer | — | New |
| *(Developer has none)* orphan `T_` rule | — | New |
| *(Developer has none)* modifier key not marked active on its own layer (R3b) | — | New |
| *(Developer has none)* half-done suppression — spacer-class key that kept a rule-bearing id, or a neutralized id left at `sp:0` (R3a) | — | New |

**0x0A9 is target-version-gated upstream.** `validate-layout-file.ts` only warns when it cannot verify a minimum Keyman version of 14 (`!verifyAndSetMinimumRequiredKeymanVersion14()`) — a keyboard whose target version already permits bumping to 14+ gets no warning (`TransformSpecialKeys14` then handles the pre-14 client case via `CSpecialText14Map` at compile time, silently). Since the studio targets current Keyman rather than a pinned pre-14 floor, the warning path is the one that actually fires for anything we produce, so "checked on import" above means exactly this path, not the silent-transform path.

Developer's own id regex, which we adopt (tightening `U_` to grouped hex so it agrees with `decodeUnicodeKeyId`):

```
/^((K_[A-Z0-9_?]+)|(T_\S+)|(U_[0-9A-F_]+))$/
```

`K_` ids must resolve against one of three tables in `keyman/developer/src/kmc-kmn/src/kmw-compiler/keymanweb-key-codes.ts` — `VKeyNames`, `KeymanWebTouchStandardKeyNames` (`K_LOPT`, `K_ROPT`, `K_NUMERALS`, `K_SYMBOLS`, `K_CURRENCIES`, `K_UPPER`, `K_LOWER`, `K_ALPHA`, `K_SHIFTED`, `K_ALTGR`, `K_TABBACK`, `K_TABFWD`, codes 50001-50012), and `KMWAdditionalKeyNames`. `U_` codepoints must lie in `[0x20,0x7F] ∪ [0xA0,0x10FFFF]`.

**Reserved ids we must never mint:** `T_new_*` (Developer's auto-mint — 34 dead instances shipped in the corpus), `T_removed_*` (our `applyDesktopModifications` placeholder), `T_carved_*` (our carve cascade), `T_touchdel_*` (our touch-method deletion), and the private-use `T_*_MT_SHIFT_TO_{SHIFT,CAPS,DEFAULT}` triple KeymanWeb injects as the default Shift multitap (`PRIVATE_USE_IDS` in `keyman/common/web/types/src/keyman-touch-layout/keyman-touch-layout-file.ts`). **Correction:** the literal `*` in these ids does **not** violate either id regex above (`T_\S+` upstream, `T_[^\s\]]+` ours both accept a non-whitespace `*`) — the odd form is a TS-typing convenience, not a validator-exclusion trick. Rejecting them therefore needs an **exact-match blocklist** against `PRIVATE_USE_IDS`, not a regex exclusion (see [contracts/key-id-policy.md](contracts/key-id-policy.md) §3 item 6).

### Geometry, for the record

`keyman/web/src/engine/keyboard/src/keyboards/activeLayout.ts:96-105`: `DEFAULT_PAD=15`, `DEFAULT_RIGHT_MARGIN=15`, `DEFAULT_KEY_WIDTH=100`. Layout is proportional: sum `width + pad` per row, take the widest row plus the right margin as the total, convert everything to fractions — and **the last key in each row is stretched to consume the remainder**, which is why a spacer key is the documented way to leave visible slack at the right edge. Developer's docs contradict themselves on the pad default (5% in the file-format reference, 15% in the editor help); the code says 15 units.

---

## R4. The per-key `layer` field — the one contract change worth making

The wire format allows a per-key `layer`, which overrides the *modifier state used to evaluate the rule*, independently of `nextlayer` (which switches the displayed layer). Our IR drops it: `RawKey` in [parseTouchLayout.ts](../../packages/contracts/src/parseTouchLayout.ts) maps `nextlayer` and not `layer`, and [parse-touch.ts](../../packages/engine/src/codec/parse-touch.ts) never emits it.

**A second, confirmed silent drop of the same class: the subkey `default` field (longpress preselect).** `keyman-touch-layout-file-writer.ts` special-cases it on write (`if(Object.hasOwn(key, 'default') && (<any>key).default === false) delete (<any>key).default;` — only an explicit `false` is stripped, so a `true` is a real, intentional wire value), and `parseTouchLayout.ts`'s `convertKey` has zero hits for it — it is silently dropped on read, the same defect shape as `layer`. It was live in the wire format and initially missed in this audit's first pass over the loose-schema fields; the `dk` verdict below (genuinely dead) should not be read as implying every loose-schema field got equal scrutiny. Fold `default` into the same §18 sign-off recommendation as `layer` — see [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) §7, which now covers both.

Classifying every within-layer duplicate key id across the corpus:

| Cause | Occurrences |
|---|---|
| Disambiguated by a per-key `layer` override | **11,593** |
| Sentinel / auto ids (`T_SPACER`, `T_BLANK`, `T_NUL`, `T_new_*`) | 2,310 |
| **Genuinely ambiguous (a real author defect)** | **1,170** |
| Spacer-class | 11 |

The idiom, from `adiga_danef` (`phone`/`numeric`): `{"id":"K_2","text":"2"}` in one row and `{"id":"K_2","text":"@","layer":"shift"}` in another. Legitimate, common, and invisible to us.

Consequences of the gap: Case A silently collapses 11,593 corpus keys into indistinguishable duplicates; a duplicate-id check run on `TouchLayoutIR` would report ~13,900 findings of which ~1,170 are real; and the studio could add a key that `touchKeyAddress` cannot stably address — the exact ambiguity that file documents as unaddressable.

**Recommendation: add `TouchKeyIR.layer?: string` and `default?: boolean` together.** Both additive and optional (absent ⇒ no override / not preselected), so together they are still a minor bump under the 0ver convention — the same shape as the `provenance` addition recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md). Both must land in **one** commit across `keyboard-ir.ts`, the zod mirror, the `_TouchKeyIRGuard` drift guard, `parseTouchLayout.ts`'s key conversion, and `parse-touch.ts`'s key emission, with §18 sign-off.

Authors do not *set* this field in Increment 1 (R3 marks Modifier read-only); we preserve it so imported keyboards round-trip and the duplicate check is implementable.

**If declined:** run the duplicate-id check against raw JSON inside `keyboard-lint` (which already has the VFS and its own parser) and record the Case A fidelity loss as a known limitation. The addressing hole remains, mitigated only by rejecting new collisions at edit time.

---

## R5. Why the join must exist, and what it must not credit

`kmcmplib` interns an unknown `[NAME]` vkey into the VKDictionary (`Compiler.cpp` `GetVKCode`, case-**insensitively**, names capped at 80 chars), joins them space-separated into `TSS_VKDICTIONARY`, and `kmw-compiler` emits that as `this.KVKD=`. `validate-layout-file.ts` then splits `KVKD` and does `FDictionary.indexOf(FId) < 0` — case-**sensitively**. So a `T_alpha` key against a `[T_ALPHA]` rule compiles correctly but warns. We join case-insensitively (matching the compiler) and report the mismatch as a hint (matching Developer's observable behaviour).

The codec shapes the join must key on, verified in [codec/parse.ts](../../packages/engine/src/codec/parse.ts):

| Source | IR shape |
|---|---|
| `[T_0300]` | `{kind:"vkey", name:"T_0300", modifiers:[]}` |
| `[SHIFT T_030D]` | `{kind:"vkey", …, modifiers:["SHIFT"]}` |
| the internal `+` of a guard rule | `{kind:"raw", text:"+"}` — only a *leading* `+` is stripped |
| `> context` | `{kind:"raw", text:"context"}` |
| `> nul` | `{kind:"raw", text:"nul"}` |
| `> BEEP` | `{kind:"beep"}` |

`OutputElement` has no `context` member, so role classification reads raw text. **Do not** add one — it touches a locked union with a round-trip emitter for no functional gain.

The role taxonomy and its rationale are in [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md). The load-bearing point: Cameroon's guard-first idiom

```
any(diablock) + [T_0300] > context     c swallow the mark after punctuation/digit/space
+ [T_0300] > U+0300
```

means a naive "collect the outputs of every rule keyed on this id" would credit the guard as producing something. It produces nothing — it re-emits the pre-context. Classifying `> context` as a distinct role handles the whole idiom without special-casing the store name.

---

## R6. Cameroon, as the worked example

`../keyboards/release/sil/sil_cameroon_qwerty/` — author Matthew Lee, v6.1.2, OSK font Andika Afr. One platform (`tablet` only — **no `phone` block**), 8 layers × 5 rows, 394 top-level keys (479 key objects including 77 `sk` and 8 `multitap`; zero flicks). Layers are a 2×2×2 cross product: {base, shift/caps} × {plain, rightalt} × {alpha, symbol}. `shift` is one-shot (its keys carry `nextlayer:"default"`); `caps` is the latched twin, entered via a **multitap on `K_SHIFT`** whose second tap is `T_CAPS`.

26 distinct `T_` ids. The naming convention is **semantic-by-codepoint, never sequential**: `T_<UPPERCASE-HEX of the codepoint it emits>`, so the id and the rule body restate each other and are trivially cross-checkable (`+ [T_0300] > U+0300`). Mnemonics are reserved for outputs that are not a single codepoint: `T_FCFA` → `'FCFA'`, `T_CAM` → `nul` plus `nextlayer:"rightalt"`, and the ruleless UI keys `T_BLANK` / `T_CAPS` / `T_LOWER` / `T_UPPER`.

Fourteen combining-mark keys use the guard-first idiom, six of them SHIFT-doubled (`+ [SHIFT T_030D] > U+030D`). Their keycaps are `◌` + the mark — which is exactly what defeats our current coverage `text` fallback.

A **two-tier design** worth noting: the keycap belongs to a `T_` rule but its longpresses are ruleless `U_` keys. `T_0021` (`!`) carries `sk: [{id:"U_00A1", text:"¡"}]`; `T_003F` carries `U_00BF`. So the `U_`-by-default policy in [contracts/key-id-policy.md](contracts/key-id-policy.md) matches what a skilled author already does.

**Dead keys (in the layout, no rule): `T_BLANK`, `T_CAPS`, `T_LOWER`, `T_UPPER`** — all four are pure layer/UI keys handled by KeymanWeb's `nextlayer`/`sp` machinery. Intentional, not a defect, and exactly what the 0x092 exemptions exist to excuse. **Orphan rules: none** in QWERTY.

The **AZERTY sibling carries a genuine defect**: `sil_cameroon_azerty.kmn:343-344` has both `any(diablock) + [T_03B1] > context` and `+ [T_03B1] > U+03B1`, while the layout carries `U_03B1` instead. The author swapped the key to a self-outputting `U_` id and **silently lost the diablock guard**. That is why the orphan-rule check's payoff is not "you have a dead rule" but "you lost a behaviour you asked for" — and it is the strongest argument for the combining-mark clause in the id policy. (AZERTY also has a *commented-out* rule at line 316, `c + [T_UPPER] > layer('default')`, which a naive grep for `\[T_…\]` miscounts as live.)

### Range of `T_` conventions across the corpus

| Keyboard | Shape | Distinct `T_` | `T_` rules | Convention |
|---|---|---|---|---|
| `sil_cameroon_qwerty` | tablet, 8×5, 394 keys | 26 | 22 | hex-codepoint + mnemonic |
| `gff_amharic` | phone 53 layers, tablet 44 | 41 | 27 | mixed hex + word-mnemonic; layer ids are Ethiopic characters, one per consonant |
| `sil_senegal_bda_azerty` | phone, 8×4, 288 keys | 67 | 167 | long descriptive snake_case (`T_a_acute`, `T_saltillo`, `T_eng`) |
| `fv_southern_carrier` | tablet, 35 layers, 1258 keys | **226** | 94 | syllable-mnemonic (`T_BA`, `T_CHOO`) — `T_` as the *primary* character mechanism |
| `triqui_itunyoso` | phone, 9×4, 284 keys | 72 | **291** | tone-number + digraph, heavy CAPS/NCAPS triplication |
| `sil_yi` | tablet, 47 layers, 2256 keys | 47 | **0** | all 47 ids ruleless — pure layer plumbing |

Cameroon sits usefully in the middle. The extremes matter for design: `sil_yi` proves a layout can be entirely ruleless (so "`T_` with no rule" must be a *warning* with exemptions, never an error), and `triqui_itunyoso` proves the case-triplication clause of the id policy is load-bearing.

---

## R7. Corpus-wide `T_` usage

829 of 962 `.keyman-touch-layout` files contain at least one `T_` id, and 3,721 distinct `T_` ids exist overall — but the head of the histogram is structural, not linguistic: `T_SPACER` 4,175 · `T_NUL` 2,261 · `T_null` 1,398 · `T_BEEP` 956 · `T_WWA` 612 · `T_BLANK` 256 · `T_CAPS` 226. Only **242 of 1,045 `.kmn` files reference a `T_` vkey at all**. The ~23% with real `T_` rules are this feature's population; the rest use `T_` purely as filler.

Defect calibration over the 863 keyboards shipping both artifacts is in [spec.md](spec.md) §"Corpus calibration". The figures are why the new Layer C checks are **warnings with exemption sets**, not errors: without the exemptions the duplicate-id check alone would emit ~13,900 findings.

---

## R8. Increment staging

### Increment 1 — the user's stated minimum

The join and the arithmetic (US1), assigning a letter to an existing key (US2), redefining `T_` ids (US3), adding and removing keys within a row (US4), and the id-family diagnostics. Grid geometry is **read-only** in this increment.

Engine/contracts, in dependency order:

1. The rule join in contracts, plus the shared `isPlusSeparator` move it needs — additive, zero behaviour change.
2. The `isSpacerKeyClass` correction — isolated, with a keys-per-row recount.
3. The coverage fix: the join threaded through `computeTouchCoverage` and all three callers, plus the additive U+25CC strip.
4. The reachability view, adopted **only** by the scaffolded-scope inventory check; the facet index regenerated and asserted unchanged.
5. The new Layer C checks with their exemption sets, calibrated against the corpus **before** the tool can create new instances of what they detect.
6. Rule synthesis (`ensure` / `remove` / `rename`), including the guard-store proposal and the contiguous guard-then-producing emission.
7. The key-edit operation type, its address parser, and the two thin appliers (IR and raw-JSON) over one shared resolver — defended by a twin-equivalence test rather than by discipline.

Studio: the key grid, cell, navigation hook, streamlined inspector, assign panel, rename dialog, and diagnostics panel; the key-edit overlay in the working-copy store with its undo kind and persistence; the overlay applied as a new pass in the single-writer projection chain so preview and zip stay identical.

Two easy-to-miss studio details:

- **The touch preview must apply physical assignments.** `TouchGallery`'s own VFS transform injects only the touch layout, so a newly synthesized `.kmn` rule would not type in the preview — making the rule-bearing assignment option a silent no-op on screen.
- **The grid's arrow keys will be eaten.** `useCharCycleKeys` is attached at the pane level and consumes ArrowLeft/ArrowRight from anywhere in its subtree unless the target matches its skip selector; `[role="grid"]` must be added to that list. The module's own doc comment mandates this for new arrow-consuming widgets.

### Increment 2

Width and pad presets, the slack bar, "Fill row" / "Even out row", spacer insertion; longpress and multitap authoring in the grid (reusing the existing gallery mechanism path — never a second writer); hint override; the full diagnostics table including re-surfacing checks 18.1-18.5; drag-reorder and drag-resize as pointer enhancements.

### Increment 3

Rows (add / remove / move) — which needs the declared-writes extension and row-id stability; an author-added non-modifier plane with a hinted default name (specs/008's single legitimate naming case); the platform panel (`displayUnderlying`, `defaultHint`); the flick compass.

### Explicitly never

Device-photo presentation chooser · free-text layer names · platform or layer deep-copy · a raw Code/JSON view · Developer's zero-validation id box · `T_new_*`.

---

## R9. Placement in the step flow

**Recommendation: a second *mode* of the existing `touch` step, not a new manifest step.** A segmented control in the touch step header — **By character** (today's loop, default) / **By key** (the new grid) — with the grid in its own directory and composed by `TouchGallery`, which retains ownership of the step.

Why:

- **Zero invariant churn.** A new step would need a new `ActiveStepId` in *two* deliberately-duplicated closed unions, a new exhaustive `advance` case, `expectedBackTarget`/`performManifestBack` branches, a `FULL_LAYOUT_IDS` allowlist edit (which throws in both directions and is asserted by its own test), history-sanitization reasoning, a dashboard/flow-map entry, and a new reducer case.
- **The off-spine model is the wrong shape.** `project_name` and `touch_seed_source` are forks that *precede* their join target. A fine-tune surface is entered *from* touch and returns *to* touch — a sub-mode, not a fork. And `expectedBackTarget("touch")` already hard-returns `touch_seed_source`, a spec-035-mandated meaning a sibling step would muddy.
- **Single-writer survives.** The reducer's touch case is the only place `buildTouchLayoutJson` runs. A separate step would need its own writer.
- A step placed *after* the touch lock would be editing a locked surface.

### "Before the character walk" and "inside the touch step" are not in conflict

The natural question is whether key-level editing happens *during* the touch gallery or *before* it. For an imported keyboard the answer wants to be "before" — the keys already exist and merely lack letters, so walking characters first asks the wrong question. But "before" does not require a separate step. The mode selector plus the intro proposal (below) gives the ordering inside the existing step:

```
enter touch step  ->  seed resolved (Case A reseed / Case B import-adapt)
                  ->  intro proposal, only when the condition holds:
                      "This keyboard has N keys with no letter assigned"
                  ->  BY KEY       fix the key inventory: assign letters,
                                   suppress unused keys, rename ids, set types
                                   (live OSK + diagnostics throughout)
                  ->  BY CHARACTER walk whatever inventory characters remain unplaced
                  ->  Continue     coverage gate (FR-008)
```

For a Case B import the author lands in by-key first and never wastes character-walk effort on keys that already exist. For a Case A reseed the character walk stays the default and by-key is the escape hatch. Same step, same writer, same preview pane, no manifest churn.

### The preview is the mess-prevention mechanism, and Developer could not have it

Verified: `builder.xsl` loads only Sentry plus the editor's own modules — **no KeymanWeb engine**. Developer's Design view is a bespoke DOM rendering over a device photo (`builder.prepareLayer`), so nothing in that editor shows real engine behaviour; seeing it means compiling and moving to a different surface. That, not a weak field set, is why freeform key editing in Developer feels hazardous: consequences are invisible until compile.

Our touch step already renders the real KeymanWeb OSK in its right pane (`OSKFrame` + `useKeyboardArtifact`), so the preview is inherited rather than built. The design consequence is that it must stay **truthful**: the transform currently injects only the touch layout, so a synthesized `T_`-key rule would not type (FR-038). A preview that silently omits the feature's own edits is worse than no preview.

The full mess-prevention set, for the record: live preview (FR-037) · a layer-kind-aware proposal among suppress / reflow / redistribute so the geometry consequence is chosen deliberately rather than stumbled into (FR-029f-h, R3c) · visible row slack (FR-039) · destructive classes rejected at edit time rather than reported (FR-045) · byte-preservation so a small edit stays small (FR-033) · per-edit undo (FR-032) · the coverage gate at Continue (FR-008 via US5).

### Two lenses, not two workflows

Author direction (2026-08-03): *"I don't think the user will know what they want to do until they play with it a bit."* That settles the character of the mode selector — it is a **view toggle, never a fork**. An author who must commit to a mode before understanding the problem will pick wrong, and any friction on the return trip converts that wrong pick into abandoned work.

Consequences, specified as FR-036a-g:

- **Free and lossless both ways.** No confirm, nothing discarded, nothing to redo. Both modes' drafts (`touchDraft` for the character walk, the key-edit overlay for the grid) persist across the toggle. Both already persist through the draft store, so the requirement is mostly *not* to wire a reset to the mode change — worth stating because that is exactly the tidy-up someone adds later.
- **Context carries in both directions.** From character `ɛ` to by-key, reveal and select the key(s) producing it (or the candidates when unplaced); from a key back to by-character, land on a character it produces. This is what makes the two views lenses on one layout instead of parallel workflows, and `enumerateTouchMethodsForChar` already implements the harder direction.
- **One set of numbers.** "Characters still unplaced" and "keys with no letter" are two projections of the same state, both live. Independently maintained counters that can disagree would make both untrustworthy.
- **Either mode completes the step.** Continue is gated on coverage, not on the active view.

Two subtleties that only appear once toggling is free:

- **Cross-mode invalidation must warn immediately.** Assign `ɛ` to a longpress on `K_E` in the character walk, then suppress `K_E` in the grid: the FR-008 gate catches it at Continue, which is far too late to be actionable. The suppression needs to name the affected character at the moment of the edit — which means the key-level diagnostics must see the by-character assignments, not just the layout.
- **Undo is one chronological stack, and must say so.** After a mode switch the next undo may target work from the other view. That is the correct behaviour for a single working copy, but only if the affordance names what it will undo; a silent cross-mode undo reads as a bug.

**The exploration surface already exists.** The OSK preview is live in both modes and is typed on, so the loop is: poke the preview, notice something wrong, fix it in whichever view fits, poke again — available from the moment the step opens, before any mode decision. That, rather than the toggle itself, is what lets an author discover what they want.

**But do not hide the mode.** The Cameroon case is a primary flow for imported keyboards, so resolve the tension by *proposing* the mode rather than promoting it to a step: on entering the touch stage, if the layout has keys with no reachable output **and** the inventory has unplaced characters, the intro surface leads with "This keyboard has N keys with no letter assigned — assign letters to keys →" and routes into By-key mode. The character-driven walk stays the default product for reseeded keyboards; the by-key route becomes the default *offer* for imported ones. Cost: one additive session field.

### A note on the declared-writes guard

`applyMutatePatch`'s containment check compares only the **common prefix** and accepts containment in either direction, and its leaf collection treats an array as a leaf. So a patch at `touchLayout.platforms` already passes against the existing `TOUCH_WRITES` declaration — meaning row and layer rewrites would pass M3 **today**. The work Increment 3 needs is therefore *declaration honesty* (adding explicit row/layer paths), not an enforcement unlock, and nobody should treat M3 as the row-level guard.

**Correction (T126, measured 2026-08-05).** This section originally added: "What is genuinely **not** authorized is a leaf at `touchLayout.platforms[i].layers[j].id`, which any new-layer patch necessarily writes." That is **false**, and the T126 conformance test in [projectWorkingCopyVfs.test.ts](../../packages/studio/src/lib/projectWorkingCopyVfs.test.ts) now pins the real behaviour: `collectLeafPaths` stops at the `platforms` **array**, so no leaf below `touchLayout.platforms` is ever collected and **nothing** beneath it can be refused — a patch adding a whole new layer, id and all, passes M3. What M3 actually catches is a leaf on an **undeclared sibling** (e.g. `touchLayout.displayUnderlying`, or a top-level `groups`). The guard is real, but its granularity stops at the declared array, one level coarser than this note claimed.

Increment 1 does not go through `applyMutatePatch` for layout edits at all — the overlay is a raw-JSON pass at projection time, which is what gives Case B byte-preservation for free on both cases. Its only IR writes are the provenance promotion and the optional synthesized rule.

---

## R10. Plan-phase findings — where the code disagrees with this document

Recorded during `/speckit.plan` (2026-08-04) from a direct read of the attachment points. Everything above was written from the spec side; this section is written from the code side, and it corrects the places where the two disagree. **Where R10 contradicts an earlier section of this document or a named FR, R10 is the later measurement and wins**; each entry names what must change.

### R10.1 The touch preview bypasses the projection chain entirely (FR-038)

**Finding.** [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) builds its own `vfsTransform` (~line 1654) that does exactly one thing: `vfs.set(source/<id>.keyman-touch-layout, touchLayoutJson)`. It never calls `projectWorkingCopyVfs`. So the touch step's OSK preview today shows **no carve projection, no identity rewrite, and no keycap labels** — it is a touch-layout-only view. Three of the five `VfsTransform` call sites (`usePreviewArtifact`, `StudioShell`, `MechanismGallery`) go through `useWorkingCopyTransform` and therefore through the chain; `TouchGallery` and `TouchSeedSourcePanel` do not.

**And the obvious fix is wrong.** Routing `TouchGallery` at `useWorkingCopyTransform` as-is would *regress* the preview: that hook reads the **store's** `touchLayoutJson`, which is written only by the reducer at step commit ([reducer.ts](../../packages/studio/src/steps/reducer.ts) lines 406/420/425), whereas the gallery's local value is a live in-progress memo recomputed on every edit. The store field is stale-until-Continue by design.

**Decision.** Give `useWorkingCopyTransform` an **optional live-layout override** (the in-progress `touchLayoutJson` plus the key-edit overlay) and have `TouchGallery` consume the hook with that override in place of its local transform. One projection implementation, live freshness preserved, and the incidental divergence above closes as a side effect. The override must also be folded into the hook's primitive memo key (its dep array is primitive-keyed — `deletedKey`, `assignmentsKey`, … — so a new overlay that is not in that key will not refresh the preview).

**Rejected.** (a) Consume the store field — regresses the live preview to last-committed. (b) Extend the gallery's local transform to apply the overlay itself — a second partial writer, precisely what FR-033's single-writer requirement exists to prevent.

### R10.2 The working IR never reaches the artifact — so rule synthesis needs its own pass

**Finding, and it invalidates a stated assumption.** [spec.md](spec.md) §Assumptions says *"synthesized rules already travel [the `.kmn` emit path] via existing assignment and mark-guard synthesis."* Half of that is false. `store.ir` — the working IR, written through `setWorkingIR` ([workingCopyStore.ts](../../packages/studio/src/stores/workingCopyStore.ts):798) — is **never emitted into the artifact**. `projectWorkingCopyVfs` takes `baseIr` and mutates the VFS's `.kmn` through passes (`applyAssignmentsToVfs`, the carve passes, and step 4's `parseKmn` → `resetIdentity` → `emitKmn`, which parses *from the VFS*). That step-4 call is the only `emitKmn` in the projection. Assignments reach the artifact because `applyAssignmentsToVfs` is a VFS pass; **`applyMarkGuards` does not**, because it only calls `setWorkingIR` ([reducer.ts](../../packages/studio/src/steps/reducer.ts):357).

**Decision.** Rule synthesis lands as its own **projection pass** beside the touch-layout overlay — parse the VFS `.kmn`, apply `ensure` / `remove` / `rename` through the engine API, re-emit — so both halves of a key edit reach preview and zip through the one chain. Writing synthesized rules to the working IR alone would make US2's rule-bearing assignment path a silent no-op in the artifact: exactly the failure FR-038 was written to prevent, one layer deeper than FR-038 describes it.

**Out of scope, recorded so it is not mistaken for a 058 regression:** mark-guard synthesis not reaching the artifact is a pre-existing gap in spec 046's seam, not something this feature introduces or fixes. It wants its own `bug(studio)` issue.

### R10.3 `DurableDraft` must NOT be version-bumped (corrects FR-033c)

**Finding.** FR-033c says the overlay joins the persisted shape *"with the `DurableDraft` version bump that implies"*. The repo's ratified precedent is the opposite. `DRAFT_VERSION = 1` ([draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts):74) and VR-1 **discards** a version-mismatched draft — it never migrates. Both prior additive fields (`phaseBDraft`, `decisionRecord` in [draftTypes.ts](../../packages/studio/src/lib/draftTypes.ts)) landed as **optional fields with a tolerant fallback read and no bump**, with the recorded reason: a bump *"would throw away every existing author's in-progress keyboard … the wrong trade by a wide margin."*

**Decision.** Add the key-edit overlay and the mode-selector state as optional fields with tolerant reads in `prepareWorkingCopySnapshot`; `DRAFT_VERSION` stays `1`. FR-033c's parenthetical is superseded.

**Also corrected:** there is no `PersistedFields` type. The type FR-033c means is **`WorkingCopySnapshot`** ([persistWorkingCopy.ts](../../packages/studio/src/lib/persistWorkingCopy.ts):88), derived as `Omit<WorkingCopyData, …>`, so a new field is compiler-forced through `snapshotWorkingCopyData` / `prepareWorkingCopySnapshot` / `applyWorkingCopySnapshot` in lockstep. A new **action** must additionally be added to `WorkingCopyData`'s `Omit` list, and any new `Set` or `Map` re-created in all four reset paths (`INITIAL_STATE`, `reset`, `instantiateFromBase`, `instantiateFromExisting`).

### R10.4 There is no ARIA grid in this codebase, and our own a11y doc says there is

**Finding.** `role="grid"`, `role="gridcell"`, `aria-colindex`, `aria-rowindex`, and `aria-activedescendant` have **zero occurrences** anywhere in `packages/`. The "character-map grid" that [docs/accessibility.md](../../docs/accessibility.md) (rule 3, and the APG reference line) names as *audited against the APG grid pattern* is [CharacterMapPane.tsx](../../packages/studio/src/survey/CharacterMapPane.tsx) — a flex-wrap of plain `<button>` cells with `aria-label` / `aria-pressed`, **no roles, no roving tabindex, and every cell its own Tab stop**. It is a good accessible *button group*; it is not a grid, and it is not a template for one.

**Decision.** Build the grid from the APG grid pattern directly. The two idioms worth copying are both in [CharScrollStrip.tsx](../../packages/studio/src/editors/assignLoop/parts/CharScrollStrip.tsx): the roving-tabindex fallback (`hasSelectedVisible`, ~lines 253-256 and 355-369 — `isTabbable = isSelected || (!hasSelectedVisible && index === 0)`) for FR-020a, and the **selection-centred** window (`MAX_VISIBLE_CHIPS = 300`, ~lines 66 and 239-248 — a `useMemo`, deliberately not stateful, so unrelated re-renders do not reset scroll) for FR-020j. Also worth copying: that strip has *no* keydown handler of its own, and its focus-follow effect feature-detects `scrollIntoView` (jsdom lacks it) and only calls `.focus()` when focus is already inside the strip.

**And correct the doc.** `docs/accessibility.md` makes a conformance claim about our own code that the code does not support. Fix it in this feature — either by narrowing the claim to the widgets that genuinely are audited (`SelectMenu`, `MultiSelect`, `RadioGroup`) or by pointing the grid row at the new grid once it lands. A false conformance claim in the house a11y rules is worse than a missing one.

### R10.5 Six helpers are private or absent — lifting them is prerequisite work, not tidy-up

Each of these is named in a contract document as though it exists or is reachable. None is.

| Needed | Actual state | Consequence |
|---|---|---|
| `isPlusSeparator` in contracts | Exported from [engine/src/shared/rule-shape.ts](../../packages/engine/src/shared/rule-shape.ts):24, **structurally typed** (no IR import) | Pure move into contracts, re-exported from its engine home; no call site changes. The structural typing is what makes it free. |
| `extractRuleVkey` | **Private**, [modifierCombos.ts](../../packages/engine/src/pattern-apply/modifierCombos.ts):445 — and it does **not** filter plus-separators | The join's §2.1 rule ("first vkey after filtering plus-separators") is *stronger* than the existing implementation. Write the join's own; do not assume parity. |
| `entryGroupOf` | **Private**, [mark-guards.ts](../../packages/engine/src/pattern-apply/mark-guards.ts):51 | Must be lifted before synthesis can resolve the entry group. |
| `insertBeforeTerminalRules` | **Private**, mark-guards.ts:61, no sibling anywhere | The join contract's "lifted to a shared location so the two synthesizers cannot diverge" is a required task. |
| `TOUCH_LAYER_PRECEDENCE_ORDER` | **Private**, modifierCombos.ts:326 | Export it rather than re-deriving the order in the decomposition. |
| A touch-key address **parser** | **Does not exist** — only the three builders ([touchKeyAddress.ts](../../packages/engine/src/pattern-apply/touchKeyAddress.ts):39/44/55) | Net-new, and it belongs beside the builders so format and parser cannot drift. |

Two related traps. `TouchLayoutIR.nodeIds` is minted for main keys and `sk` sub-keys **only** — never `multitap` or `flick` ([parseTouchLayout.ts](../../packages/contracts/src/parseTouchLayout.ts):221/224) — so an operation addressing a multitap or flick node cannot resolve through `nodeIds` and must go through the address resolver. And `NodeIdMinter` restarts its per-kind counter on **every call** (`engine/src/shared/node-ids.ts`), so ids are deterministic per invocation but not stable across passes — which is why the applier-twin test compares modulo node ids.

### R10.6 The decomposition cannot be a true inverse

**Finding.** `comboToTouchLayerId` is **not injective**: its private `TOUCH_ID_FRAGMENT` table maps both `ALT` and `LALT` to the fragment `"alt"` (modifierCombos.ts:279). So no function can recover the original token set from a layer id string.

**Decision.** The decomposition returns a **canonical** token set (`"alt"` maps back to `ALT`), documented as canonical-not-round-trip. This is sufficient for FR-063: family grouping keys on plane plus canonical token set, and a family's members are the ids sharing a plane — a question the canonical form answers exactly. [contracts/layer-families.md](contracts/layer-families.md) §2's "recovers `{ plane, tokens }`" should be read as canonical tokens.

### R10.7 Smaller corrections, for accuracy

- **`TouchLayerIR` / `TouchPlatformIR` do not exist.** `TouchLayoutIR`'s platforms, layers, and rows are inline anonymous types ([keyboard-ir.ts](../../packages/contracts/src/keyboard-ir.ts)); only `TouchKeyIR` and `TouchLayoutIR` are named. New code that wants to name a layer must destructure or introduce the alias deliberately.
- **`computeTouchCoverage` has no options bag today** — it is strictly `(layout, inventory)`, two positional arguments, at all four call sites. The join threads in as an optional **third** argument.
- **`SPACER_SP_VALUES` is module-private with exactly one read.** The `{8,10}` to `{9,10}` correction is one line plus three `isSpacerKeyClass` consumers: [check-18-3-keys-per-row.ts](../../packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts) (the recount), and `isBlankPlaceholder` in [applyTouchAssignmentsToRawJson.ts](../../packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts) — where the correction makes the "is this slot free" answer *stricter* about `sp:8` and *looser* about `sp:9`, changing placeholder-promotion behaviour. That file's existing test is the canary for the recount.
- **Fold the join into the engine wrapper between the coverage call and `augmentWithComposable`** ([touchCoverage.ts](../../packages/engine/src/pattern-apply/touchCoverage.ts), ~lines 55-57) — so a mark credited by the join then feeds composability, which is the compounding the join contract asks for.
- **`lintContext.ts` is the lint registry** — there is no registry class. A new check is three manual edits (import, invocation, re-export) plus a `LintContext` field if it needs new input. `_shared.ts`'s `walkTouchKeys` does **not** descend into `sk` / `multitap` / `flick`, so the dead-key check must descend itself.
- **0x05A placement.** The nearest precedent is [validator/checks/identifiers.ts](../../packages/engine/src/validator/checks/identifiers.ts) (`KM_ERROR_INVALID_IDENTIFIER`, `layer: "A"`, runs inside the debounce path). Per FR-040, author-typed ids are handled by edit-time rejection with no finding at all; imported ids get a new function in [layer-a-prime.ts](../../packages/engine/src/validator/layer-a-prime.ts) spread into `runImportFidelityParseChecks`, coded `KM_ERROR_*` per that file's own namespace rule. Nothing is added to Layer C.
- **`useCharCycleKeys`'s allowlist needs two entries, not one.** FR-020f names `[role="grid"]`. The mode selector is an APG **tabs** pattern (FR-035) and a tab strip consumes ArrowLeft / ArrowRight too; `[role="tablist"]` is equally absent from that enumerated list. Both go in, or the pane handler swallows the arrows of both new widgets.
