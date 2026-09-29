# Feature Specification: Keyboard output picture

**Feature Branch**: `084-keyboard-output-picture`

**Created**: 2026-09-29

**Status**: Draft (terminology check against the #1810 glossary pending, required before `/speckit-plan`)

**Governing specs**: [specs/076-rule-behaviours](../076-rule-behaviours/spec.md) (FR-005 `swallowUndefined`, FR-019–FR-023 carve dispositions, amendment A3 uniform leak-handling), [specs/040-desktop-base-layout-fallthrough](../040-desktop-base-layout-fallthrough/spec.md) (fall-through facets), [specs/051-carve-orthography-trim](../051-carve-orthography-trim/spec.md) (produced set), [specs/077-base-decisions](../077-base-decisions/spec.md) (knowledgeable consent). Architecture: spec.md §5a (the IR is the source of truth) and §3c (defaults-first, propose-then-confirm).

**Input**: User description: "Keyboard output picture: everything your keyboard can output on a typist's machine is the combination of three layers — the starting point, your keyboard, and the overlay of the likely base keyboards. Whatever the base keyboard produces that your keyboard does not override will occur. Derive a handling set of the combos that leak, marking those newly opened by the author's carve versus those already leaking in the starting point." Refined by the product lead: "Underlying keyboard defines which physical buttons exist. Keyman's selected base KB determines fallback characters, the template keyboard determines some changes, some of which are changed to complete the target keyboard."

## Terminology

This spec follows the direction in issue #1810 and the product lead's four-part model. Until #1810 lands a glossary, these are the terms:

| Term | Meaning | Keyman equivalent | Code today |
|---|---|---|---|
| **Underlying keyboard** | The physical hardware. It decides which buttons exist, for example whether there is a 102nd key (`K_oE2`, present on ISO boards, absent on ANSI US boards). | none (hardware) | none |
| **Base keyboard** | The OS layout selected in Keyman, which supplies the fallback character for every keystroke Keyman does not handle (for example Windows "United Kingdom"). | Base keyboard / base layout | `host`, `hostLayout`, `referenceHostLayouts` |
| **Likely base keyboards** | The base keyboards the author's typists probably use, resolved by the spec 076 FR-023 order. | none | `likelyHostLayouts` |
| **Template keyboard** (starting point) | The keyboard the working copy was instantiated from: the keyboard you copied (Track 1), or the current released version of your keyboard (Track 2). It supplies a set of changes over the base keyboard. #1810 proposes "the keyboard you copied" for Track 1 and retiring "template"; the glossary decides. | Copied project / previous version | `baseIr`, `baseVfs` (known misnomer, #1810) |
| **Your keyboard** (target keyboard) | The template keyboard's changes, some altered, plus the author's own edits and carves, which together complete the keyboard being designed. | Keyboard | working copy |
| **Combo** | One physical key plus one modifier state (for example AltGr+4). | Key + modifiers | vkey + modifiers |
| **Leak** | Output a base keyboard produces for a combo your keyboard leaves undefined. | Pass-through to the base keyboard | host leak |

The copied keyboard is never called the "base keyboard" in this spec, its UI or its code comments.

## Background

A Keyman keyboard only handles the keystrokes its rules match. On desktop, every other keystroke passes through to the base keyboard, and the typist gets whatever that layout produces. So what a typist actually gets is **everything the base keyboard produces that your keyboard does not override**.

Today the studio shows the author only what your keyboard's rules produce. Spec 076 demonstrates host leaks one carved combo at a time. Spec 040 models leaked characters against a single fixed US layout. No surface shows the whole picture, so:

- an author who carves a character cannot see that the freed key now types something else on their typists' machines;
- `swallowUndefined` (076 FR-005) has no list of the combos it must close;
- disposition defaults cannot use the likely base keyboards, even though 076 FR-023 requires it.

The output picture combines four layers into one derived view:

1. **Underlying keyboard**: which physical keys exist, and so which combos a typist can press at all.
2. **Base keyboard**: the fallback character each likely base keyboard produces on each combo.
3. **Template keyboard**: what typists got before the author's changes.
4. **Your keyboard**: what the author has defined, blocked or removed.

A combo on a key the underlying keyboard does not have cannot leak, whatever the base keyboard data says. v1 does not know the typists' hardware, so it assumes every key exists (FR-001a) and labels leaks on keys that some boards lack.

The **handling set** is the part of the picture that needs a decision: combos where your keyboard defines nothing and at least one likely base keyboard produces output.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what each key really types (Priority: P1)

The author sees one grid for the desktop layout. Each combo shows either your keyboard's output or, where your keyboard defines nothing, what each likely base keyboard produces there.

**Why this priority**: This is the foundation every other story reads from. It is also the first time the author can see output that isn't in the keyboard source.

**Independent Test**: Load `sil_cameroon_qwerty` with UK English among the likely base keyboards. Confirm that AltGr+4, which the keyboard does not define, shows `€` for UK English, and that a combo the keyboard defines shows the keyboard's output with no leak.

**Acceptance Scenarios**:

1. **Given** your keyboard defines RALT+A as `ɛ`, **When** the author views the output picture, **Then** RALT+A shows `ɛ` from your keyboard and no leak.
2. **Given** your keyboard does not define AltGr+4 and UK English is a likely base keyboard, **When** the author views the picture, **Then** AltGr+4 shows `€` labelled with UK English.
3. **Given** a likely base keyboard's tables have no entry for a combo, **When** the combo is undefined in your keyboard, **Then** the picture shows it as "unknown on this base keyboard", never as safe or empty.
4. **Given** a likely base keyboard arms a deadkey on a combo your keyboard leaves undefined, **When** the author views it, **Then** the combo shows as "deadkey on this base keyboard", not as a character.

---

### User Story 2 - Know what a carve opens up (Priority: P1)

After carving, the author sees every combo the carve freed that now leaks on at least one likely base keyboard. Each comes with the per-base-keyboard output and whether the typist loses something they had in the starting point.

**Why this priority**: This is the decision the carve step exists for. Without it the author allows or blocks keys blind (spec 077 knowledgeable consent).

**Independent Test**: Carve `ɛ` from `sil_cameroon_qwerty`. Confirm the handling set lists RALT+A as newly opened, with "was `ɛ`, now `á` on UK English". Confirm a combo that was already undefined in the starting point is listed as already leaking, not newly opened.

**Acceptance Scenarios**:

1. **Given** the starting point defines RALT+A as `ɛ` and the author carves `ɛ`, **When** RALT+A becomes undefined, **Then** the handling set lists it as newly opened, showing the starting-point output and each likely base keyboard's leak.
2. **Given** a combo undefined in both the starting point and your keyboard, **When** it leaks on a likely base keyboard, **Then** the handling set lists it as already leaking.
3. **Given** a carved combo leaks on no likely base keyboard, **When** the handling set is built, **Then** the combo is not presented as needing an allow/block decision, because both choices type nothing.
4. **Given** the author sets a combo to block, **When** the suppression rule is in place, **Then** the combo leaves the handling set, because your keyboard now defines it.

---

### User Story 3 - Close every leak, AltGr included (Priority: P2)

The closed-keyboard behaviour (`swallowUndefined`, 076 FR-005) takes its list of combos from the handling set. That covers every AltGr and Shift+AltGr leak, whether or not your keyboard uses AltGr anywhere.

**Why this priority**: 076 FR-005 cannot be completed without an enumerated leak list. The RALT-only-if-used gating in 076 lets real leaks through, such as AltGr+4 = `€` on UK English for a keyboard that never binds RALT.

**Independent Test**: For a keyboard that binds no AltGr combo, with UK English likely, confirm the closed-keyboard behaviour covers AltGr+4 and the other UK AltGr leaks.

**Acceptance Scenarios**:

1. **Given** your keyboard binds no RALT combo and UK English is likely, **When** the closed-keyboard behaviour is accepted, **Then** AltGr+4 is suppressed.
2. **Given** a combo has an `allow-host` disposition, **When** the closed-keyboard behaviour recomputes, **Then** that combo stays open (076 FR-005 amendment).

---

### User Story 4 - The test pane types like the typist's machine (Priority: P2)

When the author types an undefined combo in the test pane, the output comes from the base keyboard selected in the test pane's selector, not from a fixed US layout.

**Why this priority**: Today the simulator always falls through to US. So the test pane can contradict the output picture and the host-consequence labels next to it.

**Independent Test**: Select UK English in the test pane, type AltGr+4 on a keyboard that doesn't define it, and confirm `€` is produced.

**Acceptance Scenarios**:

1. **Given** UK English is selected, **When** the author types undefined AltGr+4, **Then** the test pane shows `€`.
2. **Given** US English is selected, **When** the author types undefined AltGr+4, **Then** the test pane shows nothing.

---

### User Story 5 - Facets see the likely base keyboards (Priority: P3)

The spec 040 fall-through facets use the likely base keyboards instead of a single fixed US layout.

**Why this priority**: This removes the last consumer of the fixed-US assumption. It is lower priority because the facets are internal signals, not an authoring decision.

**Independent Test**: For a keyboard with AZERTY as the only likely base keyboard, confirm the fall-through facet reports AZERTY leaks, not US ones.

**Acceptance Scenarios**:

1. **Given** AZERTY is the only likely base keyboard, **When** the fall-through facets are computed, **Then** they reflect AZERTY's output for undefined combos.

---

### Edge Cases

- **Missing physical key:** a base keyboard defines output on a key some underlying keyboards lack, for example UK English's 102nd key, which an ANSI board doesn't have. v1 keeps the combo in the handling set (FR-001a) and labels it as applying only where the key exists.
- **Likely base keyboards disagree:** UK English produces `€` on AltGr+4 and US English produces nothing. The combo is in the handling set because at least one leaks, and each base keyboard's output is shown separately.
- **Context-dependent definitions:** your keyboard defines a combo only after a deadkey or other context. The combo counts as defined only where the rule is unconditional. Otherwise it is marked uncertain and shown as such, never silently treated as closed.
- **Opaque rules:** a rule is preserved as an opaque fragment (`RawKmnFragment`), for example one with an `if()` or `platform()` guard, and it may define the combo. The combo is marked uncertain, never assumed undefined.
- **AltGr reaching the base keyboard as Ctrl+Alt:** on Windows, AltGr arrives as Ctrl+Alt. A combo counts as defined only if your keyboard's rules catch it however the key arrives.
- **No signal:** there is no `layout_family` answer and no language tag. The likely set is the reference set (076 FR-023), and the UI says it is a guess.
- **Non-Latin languages:** the likely set is still Latin base keyboards. Region inference for non-Latin languages is an open question on PR #1854 and out of scope here; this spec consumes whatever set the resolver returns.
- **Touch:** touch layouts have no base keyboard layer. Touch output comes only from the touch layout, and the picture does not apply to it.
- **The starting point changes:** in Track 2, a new released version is picked up. The newly-opened versus already-leaking split is recomputed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST derive the output picture for the desktop layout of your keyboard: every printable key that exists on the likely underlying keyboards, frame keys excluded (as 076 FR-005), on four modifier layers: none, Shift, AltGr, Shift+AltGr.
- **FR-001a**: In v1, the underlying keyboard MUST be assumed to have every key any likely base keyboard maps (the union of ANSI and ISO keys, including the 102nd key `K_oE2`). Every such combo can therefore enter the handling set. The UI MUST say that a leak on a key some boards lack, such as the 102nd key, applies only where the typist's hardware has that key. Inferring or asking for the physical form factor is deferred. (Clarified 2026-09-29: assume the union.)
- **FR-002**: For each combo, the picture MUST classify your keyboard's handling as exactly one of:
  - **defined**, with the output kind: character, deadkey, suppressed (`nul`), re-emitted context, or beep;
  - **undefined**;
  - **uncertain**: the combo is defined only under a context, or possibly by an opaque fragment.
- **FR-003**: For every combo your keyboard leaves undefined or uncertain, the picture MUST show, for each likely base keyboard, one of: the character it produces, "deadkey", "nothing", or "unknown" when the reference data has no entry.
- **FR-004**: The likely base keyboards MUST be resolved by the existing 076 FR-023 order (`layout_family` answer, then language-tag region, then the reference set). The provenance of the resolution MUST be shown with the picture.
- **FR-005**: The **handling set** MUST be the combos where your keyboard is undefined or uncertain and at least one likely base keyboard produces a character or a deadkey. Each entry carries the per-base-keyboard outputs.
- **FR-006**: Each handling-set entry MUST be marked **newly opened** if the starting point defines the combo and your keyboard does not, or **already leaking** if neither defines it. A newly opened entry MUST show the starting point's output.
- **FR-007**: A combo whose only per-base-keyboard values are "nothing" or "unknown" MUST NOT be presented as safe. "Unknown" entries MUST be visible as unknown.
- **FR-008**: The handling set MUST include AltGr and Shift+AltGr leaks whether or not your keyboard binds any AltGr combo. This amends 076 FR-005, which includes RALT combos only if the IR already uses RALT. 076 MUST be updated to point here.
- **FR-009**: A combo MUST count as defined only if your keyboard catches it however the base keyboard delivers it, including AltGr arriving as Ctrl+Alt on Windows.
- **FR-010**: The picture and handling set MUST be derived views of your keyboard, the starting point and the likely base keyboards. Nothing new is persisted; the existing carve dispositions, the `layout_family` answer and the base keyboard data version are the only stored inputs. The views MUST update whenever your keyboard, the carve overlay or the likely set changes. They MUST NOT add a second validation debounce timer (decision D3), because they produce no diagnostics.
- **FR-011**: Carve disposition defaults (076 FR-022/FR-023) MUST use the handling set:
  - a carved combo not in the handling set MUST NOT be presented as needing a decision;
  - defaults for combos in the handling set MUST take the likely base keyboards into account, as 076 FR-023 already requires.
- **FR-012**: The "Review removed keys" panel (076 FR-023) MUST list the handling set. Newly opened entries come first, then already-leaking entries, each with per-base-keyboard outputs.
- **FR-013**: The closed-keyboard behaviour (`swallowUndefined`, 076 FR-005) MUST take its combo list from the handling set, minus combos the author set to `allow-host`.
- **FR-014**: The test pane MUST produce the selected base keyboard's output for undefined combos, instead of a fixed US layout.
- **FR-015**: The spec 040 fall-through facets MUST use the likely base keyboards instead of a single fixed US layout.
- **FR-016**: The picture MUST NOT be offered for touch layouts. Touch has no base keyboard layer.
- **FR-017**: Base keyboard data MUST describe Windows only in v1, and the UI MUST say so ("on Windows"). Base keyboard data MUST remain generated from the Keyman basic keyboards (`scripts/codegen-host-layouts.mjs`), never hand-edited, with the existing staleness test.
- **FR-018**: All user-facing text and spec prose for this feature MUST use the Terminology table above. The copied keyboard MUST NOT be called the base keyboard.
- **FR-019**: The feature MUST NOT add a survey step. It reuses the existing `layout_family` question (constitution principle IX). If planning finds a new confirmation surface is needed, the plan MUST add it as a manifest entry.

### Key Entities *(include if feature involves data)*

- **Output picture**: for each combo on the desktop layout, your keyboard's handling (defined, undefined or uncertain) and, where not defined, each likely base keyboard's output. It is derived, never stored.
- **Handling set**: the subset of the picture that leaks on at least one likely base keyboard. Each entry has the combo, per-base-keyboard outputs, newly-opened or already-leaking status, and the starting-point output for newly opened entries.
- **Likely base keyboard set**: the resolved base keyboards with their provenance (answer, region or reference set). This already exists (076 FR-023).
- **Base keyboard data**: per-base-keyboard, per-layer combo outputs for Windows, generated from the Keyman basic keyboards and versioned. This already exists (PR #1854).
- **Underlying keyboard key set**: the physical keys that exist. In v1 it is assumed to be the union of every key the likely base keyboards map (FR-001a). Per-form-factor key sets (ANSI, ISO) are deferred.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the `sil_cameroon_qwerty` regression fixture with UK English likely, every AltGr combo the keyboard leaves undefined appears in the handling set with the Windows UK output. That includes AltGr+4 = `€`.
- **SC-002**: Across a fixture set of at least 20 corpus keyboards, zero combos your keyboard unconditionally defines appear in the handling set (no false leaks).
- **SC-003**: Across the same fixture set, every combo marked "undefined" matches, when simulated with the selected base keyboard, that base keyboard's output in the reference data (no missed leaks among mapped cells).
- **SC-004**: After a carve, an author can see every newly opened leak and its per-base-keyboard outputs from the carve step, without leaving it, in one view.
- **SC-005**: The picture and handling set update within the same interaction as the edit that changed them, with no added delay beyond the existing validation cycle.
- **SC-006**: The test pane's output for an undefined combo agrees with the output picture for the selected base keyboard in 100% of fixture cases.

## Assumptions

- The desktop platform in v1 is Windows. On macOS and Linux, Keyman is believed to pass unhandled keystrokes to the OS layout too, but those layouts carry more AltGr characters, and their behaviour has not been verified. Supporting them is an open research question for a later version, not part of this spec.
- KeymanWeb only approximates a base keyboard, since the browser reports its own key events. The picture describes desktop Keyman, and the web test pane uses the selected base keyboard's table as a stand-in.
- The five reference base keyboards (US, US-International, French AZERTY, German QWERTZ, UK English) are enough for v1. Adding more, such as Swiss or Belgian, means adding their basic keyboards to the codegen, with no spec change.
- Already-leaking combos are handled mainly through the closed-keyboard behaviour (076 FR-005), and newly opened combos through per-combo carve dispositions (076 FR-022). This spec feeds both. It does not change how either asks the author.
- The existing `layout_family` answer and language tags are the only signals for the likely set.
- The typists' hardware is unknown, so v1 assumes every key exists (FR-001a). This slightly overstates leaks for typists on ANSI boards, and the UI labels the affected keys.
- The live validator currently checks the starting point's source rather than your keyboard, a pre-existing issue found during this investigation. It is tracked separately and not addressed here.
- Whether a block rule written for RALT also catches AltGr arriving as Ctrl+Alt on Windows is unverified. Planning MUST confirm it with a compiler or simulator test (FR-009).
