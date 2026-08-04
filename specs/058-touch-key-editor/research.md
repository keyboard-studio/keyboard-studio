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

**`dk` is dead.** Present in the loose schema and the Delphi model, absent from the current TS type and the clean schema, never used for anything. Ignore it.

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
| **Modifier** (`key.layer`) | **DERIVE / read-only** | The most confusing field in Developer, and for us it is *computable*: our layer ids are auto-derived from modifier combos (`comboToTouchLayerId`, specs/008 §3c), so the modifier a key should send is the combo its layer flattens from. Show it as a read-only "**Sends:** Shift+K_Q (from the Shift layer)" line, placed visually far from Next Layer. See R4 — the field must still round-trip even though we do not let authors set it. |
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

- **Suppress is the default offer, deletion is secondary.** When an author wants a key gone, propose suppression (hide in place, geometry preserved) and offer true removal as the explicit alternative with its reflow consequence stated. This also makes US4's "leave a full-width spacer" default consistent rather than a special case.
- **Suppression sets both halves in one action**, and the diagnostics must treat a half-done suppression as a finding: a spacer-class key that kept a rule-bearing id is still live, and a neutralized id left at `sp:0` is an invisible dead key.
- **A ruleless `T_BLANK` is legitimate, not a defect.** The dead-`T_`-key check already exempts sentinel ids and blank/spacer classes ([contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) §5.1) — this idiom is exactly why those exemptions exist, and Cameroon's 70 `T_BLANK` sites are the attested precedent.
- **The `isSpacerKeyClass` fix matters more than it first appeared.** If authors distinguish blank (9) from spacer (10), a predicate that reads `{8, 10}` mishandles both ends of the idiom: it credits blank keys as producing their keycap text (Cameroon's `T_BLANK` sites carry `" "`, so a space is spuriously credited) while treating interactive deadkey-styled keys as inert.

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

### Validation: the largest single gain

Developer's editor validates **essentially nothing** — no id syntax check, no duplicate-id detection, no overfull-row warning, no dangling-`nextlayer` check, and no "`T_` key has no rule" check (the editor cannot see the `.kmn`). Everything is deferred to compile. Every one of those is a **pure synchronous join** available to us at edit time.

| Keyman message | Code | Our treatment |
|---|---|---|
| `ERROR_TouchLayoutInvalidIdentifier` | `SevError\|0x05A` | Live; blocks the mutation |
| `WARN_TouchLayoutCustomKeyNotDefined` | `SevWarn\|0x092` | Live — **the Cameroon diagnostic**; needs the R5 join |
| `WARN_TouchLayoutMissingLayer` | `SevWarn\|0x091` | Live; fix = repoint or remove |
| `WARN_TouchLayoutUnidentifiedKey` | `SevWarn\|0x099` | Live |
| `WARN_TouchLayoutMissingRequiredKeys` | `SevWarn\|0x093` | Live; per layer, `K_LOPT`/`K_BKSP`/`K_ENTER` |
| `WARN_TouchLayoutSpecialLabelOnNormalKey` | `SevWarn\|0x0A9` | Structurally prevented; still checked on import |
| version gates (multi-codepoint `U_` → KM15; flick/multitap → KM17) | Hint/Info | Live, informational |
| *(Developer has none)* duplicate id within a layer | — | New |
| *(Developer has none)* orphan `T_` rule | — | New |
| *(Developer has none)* modifier key not marked active on its own layer (R3b) | — | New |
| *(Developer has none)* half-done suppression — spacer-class key that kept a rule-bearing id, or a neutralized id left at `sp:0` (R3a) | — | New |

Developer's own id regex, which we adopt (tightening `U_` to grouped hex so it agrees with `decodeUnicodeKeyId`):

```
/^((K_[A-Z0-9_?]+)|(T_\S+)|(U_[0-9A-F_]+))$/
```

`K_` ids must resolve against one of three tables in `keyman/developer/src/kmc-kmn/src/kmw-compiler/keymanweb-key-codes.ts` — `VKeyNames`, `KeymanWebTouchStandardKeyNames` (`K_LOPT`, `K_ROPT`, `K_NUMERALS`, `K_SYMBOLS`, `K_CURRENCIES`, `K_UPPER`, `K_LOWER`, `K_ALPHA`, `K_SHIFTED`, `K_ALTGR`, `K_TABBACK`, `K_TABFWD`, codes 50001-50012), and `KMWAdditionalKeyNames`. `U_` codepoints must lie in `[0x20,0x7F] ∪ [0xA0,0x10FFFF]`.

**Reserved ids we must never mint:** `T_new_*` (Developer's auto-mint — 34 dead instances shipped in the corpus), `T_removed_*` (our `applyDesktopModifications` placeholder), `T_carved_*` (our carve cascade), `T_touchdel_*` (our touch-method deletion), and the private-use `T_*_MT_SHIFT_TO_{SHIFT,CAPS,DEFAULT}` triple KeymanWeb injects as the default Shift multitap (these deliberately violate the id pattern so authors cannot collide with them).

### Geometry, for the record

`keyman/web/src/engine/keyboard/src/keyboards/activeLayout.ts:96-105`: `DEFAULT_PAD=15`, `DEFAULT_RIGHT_MARGIN=15`, `DEFAULT_KEY_WIDTH=100`. Layout is proportional: sum `width + pad` per row, take the widest row plus the right margin as the total, convert everything to fractions — and **the last key in each row is stretched to consume the remainder**, which is why a spacer key is the documented way to leave visible slack at the right edge. Developer's docs contradict themselves on the pad default (5% in the file-format reference, 15% in the editor help); the code says 15 units.

---

## R4. The per-key `layer` field — the one contract change worth making

The wire format allows a per-key `layer`, which overrides the *modifier state used to evaluate the rule*, independently of `nextlayer` (which switches the displayed layer). Our IR drops it: `RawKey` in [parseTouchLayout.ts](../../packages/contracts/src/parseTouchLayout.ts) maps `nextlayer` and not `layer`, and [parse-touch.ts](../../packages/engine/src/codec/parse-touch.ts) never emits it.

Classifying every within-layer duplicate key id across the corpus:

| Cause | Occurrences |
|---|---|
| Disambiguated by a per-key `layer` override | **11,593** |
| Sentinel / auto ids (`T_SPACER`, `T_BLANK`, `T_NUL`, `T_new_*`) | 2,310 |
| **Genuinely ambiguous (a real author defect)** | **1,170** |
| Spacer-class | 11 |

The idiom, from `adiga_danef` (`phone`/`numeric`): `{"id":"K_2","text":"2"}` in one row and `{"id":"K_2","text":"@","layer":"shift"}` in another. Legitimate, common, and invisible to us.

Consequences of the gap: Case A silently collapses 11,593 corpus keys into indistinguishable duplicates; a duplicate-id check run on `TouchLayoutIR` would report ~13,900 findings of which ~1,170 are real; and the studio could add a key that `touchKeyAddress` cannot stably address — the exact ambiguity that file documents as unaddressable.

**Recommendation: add `TouchKeyIR.layer?: string`.** Additive and optional (absent ⇒ no override), so it is a minor bump under the 0ver convention — the same shape as the `provenance` addition recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md). It must land in **one** commit across `keyboard-ir.ts`, the zod mirror, the `_TouchKeyIRGuard` drift guard, `parseTouchLayout.ts`'s key conversion, and `parse-touch.ts`'s key emission, with §18 sign-off.

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

The full mess-prevention set, for the record: live preview (FR-037) · suppress-before-delete so geometry never reflows (FR-029b) · visible row slack (FR-039) · destructive classes rejected at edit time rather than reported (FR-045) · byte-preservation so a small edit stays small (FR-033) · per-edit undo (FR-032) · the coverage gate at Continue (FR-008 via US5).

**But do not hide the mode.** The Cameroon case is a primary flow for imported keyboards, so resolve the tension by *proposing* the mode rather than promoting it to a step: on entering the touch stage, if the layout has keys with no reachable output **and** the inventory has unplaced characters, the intro surface leads with "This keyboard has N keys with no letter assigned — assign letters to keys →" and routes into By-key mode. The character-driven walk stays the default product for reseeded keyboards; the by-key route becomes the default *offer* for imported ones. Cost: one additive session field.

### A note on the declared-writes guard

`applyMutatePatch`'s containment check compares only the **common prefix** and accepts containment in either direction, and its leaf collection treats an array as a leaf. So a patch at `touchLayout.platforms` already passes against the existing `TOUCH_WRITES` declaration — meaning row and layer rewrites would pass M3 **today**. The work Increment 3 needs is therefore *declaration honesty* (adding explicit row/layer paths), not an enforcement unlock, and nobody should treat M3 as the row-level guard. What is genuinely **not** authorized is a leaf at `touchLayout.platforms[i].layers[j].id`, which any new-layer patch necessarily writes.

Increment 1 does not go through `applyMutatePatch` for layout edits at all — the overlay is a raw-JSON pass at projection time, which is what gives Case B byte-preservation for free on both cases. Its only IR writes are the provenance promotion and the optional synthesized rule.
