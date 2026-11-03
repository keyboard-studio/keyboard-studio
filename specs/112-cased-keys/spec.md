# Feature Specification: Caps Lock and `&CasedKeys`

**Feature Branch**: `km/casedkeys-criterion`

**Created**: 2026-11-03

**Status**: Draft

**Input**: Unify the cased-keys work: spec 106 User Story 5 (caps handling as a decision on Copy, a simplification offer on Adapt), criterion 7.28 (already implemented on this branch), and spec 111's first upgrade pair (cased keys on Open). One spec owns Caps Lock behaviour on desktop and touch, for both paths.

**Absorbs**: [specs/106-consistent-keyboard-output](../106-consistent-keyboard-output/spec.md) User Story 5, FR-050–FR-055 and tasks T042–T051. None of it was built (verified 2026-11-03: no `capsHandling` module, all tasks unchecked). Spec 106 keeps a pointer here.

**Feeds**: [specs/111-open-existing-keyboard](../111-open-existing-keyboard/spec.md) User Story 6 (upgrade pairs). The cased-keys pair's fixer is defined here (FR-008).

## Why

- **The setting is silent.** On Copy, the scaffolder inserts `&CasedKeys` without the author seeing a choice (spec 106 E7).
- **Coverage is too narrow.** It covers `[K_A]..[K_Z]` (or the AZERTY list), so a cased pair on another key, such as `ŋ`/`Ŋ` on a punctuation key or on the AltGr plane, stays lowercase under Caps Lock. That's a half-cased keyboard.
- **Existing keyboards in the repository are worse off.** Upstream basic_kbdus and about 405 corpus keyboards produce cased letters without declaring `&CasedKeys`. Some have per-key CAPS/NCAPS rules; some have nothing, so Caps Lock does nothing.
- **Touch layouts vary.** Some have no caps layer, some can't reach it, and some carry an incomplete one.

## Vocabulary

- **Cased keyboard**: a keyboard that produces at least one letter with distinct upper- and lower-case forms.
- **Case pair on a key**: a key whose unshifted and shifted outputs on the same modifier plane (base/Shift, or RAlt/Shift+RAlt) are case counterparts of each other.
- **Simplification**: replacing per-key CAPS/NCAPS rules with a `&CasedKeys` declaration.
- **Copy**, **Open**, **copied keyboard**, **starting point**: as in spec 111. Open replaces Adapt.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The criterion flags cased keyboards without `&CasedKeys` (Priority: P1)

The criteria check reports a keyboard that produces cased letters but doesn't declare `&CasedKeys`. Keyboards with no cased letters, and mnemonic layouts, are exempt.

**Why this priority**: it's the detection every other story relies on. **Already implemented** on this branch as criterion 7.28 (`KM_LINT_CASEDKEYS_MISSING`). It remains to merge, with the studio test counts green once main builds again.

**Independent Test**: the corpus run already recorded (921 keyboards: 405 fail, 330 caseless, 35 mnemonic, 151 declare it). Upstream basic_kbdus fails; the curated fork copy passes.

**Acceptance Scenarios**:

1. **Given** a keyboard producing cased letters with no `&CasedKeys`, **When** criteria run, **Then** 7.28 fails, naming an example letter.
2. **Given** a caseless or mnemonic keyboard, **When** criteria run, **Then** 7.28 passes and says why it doesn't apply.

---

### User Story 2 - Caps handling is a visible choice when copying (Priority: P1)

On Copy, the author sees how Caps Lock will behave. For a cased alphabet the choice defaults to cased keys, covering every key with a case pair, not just A–Z. A caseless alphabet skips the question.

**Why this priority**: every new keyboard is affected, and a half-cased Caps Lock is a top complaint (spec 106 E7).

**Independent Test**: copy-path fixtures for QWERTY and AZERTY, one with `ŋ`/`Ŋ` on a non-letter key (base/Shift and RAlt/Shift+RAlt), and one caseless.

**Acceptance Scenarios**:

1. **Given** a cased alphabet on Copy, **When** the layout screen is reached, **Then** caps handling is pre-set to cased keys (shown as a default), covering the layout family's letter keys **plus** every key with a case pair on any plane the keyboard uses.
2. **Given** a key that gains a case pair later (an assignment), **When** the keyboard is produced, **Then** that key is in `&CasedKeys`.
3. **Given** a caseless alphabet, **When** the layout screen is reached, **Then** the question is not asked and no `&CasedKeys` is written.
4. **Given** a letter placed on a key inside the cased set whose counterpart is in the alphabet, **When** it is placed, **Then** the counterpart placement is pre-accepted (visible, dismissible).
5. **Given** the author chooses explicit rules or none, **When** the keyboard is produced, **Then** no `&CasedKeys` is written and 7.28 reports it, so the choice is visible to the reviewer.

---

### User Story 3 - Opened keyboards are offered the upgrade, safely (Priority: P2)

When an author opens an existing cased keyboard (spec 111) that lacks `&CasedKeys`, the 7.28 finding carries a suggested fix:
- **CAPS/NCAPS rules:** replace them with a `&CasedKeys` declaration. This is offered only when Caps Lock behaviour is provably unchanged, or changes only by making Caps Lock work on keys where it did nothing.
- **No caps handling at all:** add the declaration.

**Why this priority**: upgrading existing keyboards is the reason Open exists, but nothing may change behaviour silently.

**Independent Test**: upstream basic_kbdus (CAPS/NCAPS rules), a keyboard with no caps handling, and a keyboard whose CAPS rules do something `&CasedKeys` can't express.

**Acceptance Scenarios**:

1. **Given** an opened keyboard with CAPS/NCAPS rules, **When** the fix is previewed, **Then** it shows the declaration added and the CAPS rules removed, plus a per-key comparison of outputs under {none, Shift, Caps, Shift+Caps}.
2. **Given** a comparison where every key's output is identical, **When** the author accepts, **Then** the `.kmn` changes only in the declaration and the removed rules, and 7.28 passes.
3. **Given** a comparison where some key would change in a way other than gaining a working Caps Lock, **When** the finding loads, **Then** the fix is withheld, and the finding says which keys and why. The author may still edit by hand.
4. **Given** a keyboard with no caps handling, **When** the fix is previewed, **Then** the comparison shows only keys gaining an uppercase output under Caps.
5. **Given** a keyboard that mixes `&CasedKeys` and CAPS rules, **When** it loads, **Then** it is treated as declared, and the leftover CAPS rules are reported for the author to review.

---

### User Story 4 - Caps Lock works on touch (Priority: P2)

A cased keyboard's touch layout has a caps layer, reachable by double-tapping Shift on the default layer. It carries every cased letter from the default layer in its uppercase form, and its keys don't switch layers after a keystroke. Where an opened keyboard's touch layout lacks this, the finding offers a fix.

**Why this priority**: upstream basic keyboards don't implement Caps on mobile. The physical and touch behaviour should match.

**Independent Test**: a generated Copy keyboard, upstream basic_kbdus (no caps layer), and a keyboard with a caps layer that's missing letters.

**Acceptance Scenarios**:

1. **Given** a Copy keyboard with a cased alphabet, **When** the touch layout is produced, **Then** it has a caps layer reached by double-tapping Shift. That layer has the uppercase of every cased letter on default, and no caps-layer key carries a layer switch.
2. **Given** an opened keyboard whose touch layout has no caps layer, **When** criteria run, **Then** a finding reports it, with a suggested fix that adds the layer and the double-tap.
3. **Given** a caps layer missing some letters, **When** criteria run, **Then** the finding lists them, with a fix that adds them.

---

### Edge Cases

- **The keyboard's own case rules differ from the standard pairing** (e.g. Turkish dotted/dotless i). Case pairs come from the language-aware counterpart lookup, so `i`/`İ` is a pair for Turkish, not `i`/`I`.
- **A key whose shifted output is a different letter, not the uppercase** (e.g. `ŋ` / `Ɲ` on purpose). It's not a case pair and is not added to the set.
- **Keys with deadkeys or rules on the shifted plane.** The comparison runs on actual outputs, including deadkey and context results, so a rule-driven uppercase counts.
- **CAPS rules that do something else** (e.g. Caps Lock switches to a numeric row). The fix is withheld with the reason (Story 3, scenario 3).
- **A mnemonic layout.** Exempt from 7.28; no offer.
- **A caseless keyboard with an embedded Latin fallback** (e.g. digits and a few Latin letters). It counts as cased if it produces cased letters; the author may choose none on Copy, and 7.28 reports it for the reviewer.
- **`&VERSION` below 14.0.** Adding `&CasedKeys` raises the file-format version to at least 14.0, as the scaffolder already ensures, and the fix preview shows that change.

## Requirements *(mandatory)*

### Functional Requirements

**Detection**

- **FR-001**: Criterion 7.28 MUST fail when a non-mnemonic keyboard produces a cased letter and declares no `&CasedKeys` (implemented).
- **FR-002**: Criterion 7.28 MUST additionally report keys that carry a case pair on a used plane but are missing from a declared `&CasedKeys`, as a warning on the same criterion.
- **FR-003**: A touch criterion MUST report a cased keyboard whose touch layout lacks a caps layer reachable by double-tapping Shift, lacks any cased letter's uppercase there, or has caps-layer keys with a layer switch. New criteria row; content owns the wording.

**Copy**

- **FR-004**: A caps-handling decision (cased keys / explicit rules / none) MUST exist on the layout screen, declared through the decision registry. It requires the character inventory and the Windows layout (absorbs 106 FR-050).
- **FR-005**: It MUST be proposed only when the confirmed alphabet has a case pair; otherwise it is not asked and resolves to none (absorbs 106 FR-051).
- **FR-006**: On Copy it MUST default to cased keys. The key set is the layout family's letter keys, plus every key with a case pair on any plane the keyboard uses. The declaration MUST be derived when the keyboard is produced, not inserted silently by the scaffolder (absorbs 106 FR-052).
- **FR-007**: The case-pair counterpart placement MUST be pre-accepted (visible, dismissible) when the key is in the cased set and the counterpart is in the alphabet (absorbs 106 FR-054).

**Open (spec 111 upgrade pair)**

- **FR-008**: On Open, the 7.28 fix MUST be: add `&CasedKeys` with the FR-006 key set, raise `&VERSION` to at least 14.0 if lower, and remove the CAPS/NCAPS conditions it replaces. It is applied as a precise text change (spec 111 FR-008).
- **FR-009**: The fix MUST be offered only when a per-key output comparison under {none, Shift, Caps, Shift+Caps} shows no difference other than keys gaining their uppercase under Caps. Otherwise it MUST be withheld with the keys and reason (absorbs 106 FR-053).
- **FR-010**: The fix preview MUST show the text change and the per-key comparison. The fix applies only on acceptance (spec 111 FR-024).

**Touch**

- **FR-011**: Copy touch layouts for cased keyboards MUST have the caps layer described in FR-003 (absorbs 106 FR-055).
- **FR-012**: On Open, the FR-003 finding MUST offer a fix that adds the missing layer, double-tap or letters, as a patch to the existing layout (spec 111 FR-008).

### Key Entities

- **Caps-handling decision**: mode (cased keys / explicit rules / none) plus the derived key set. Copy only; on Open the keyboard's own declaration is the state.
- **Cased key set**: keys (with plane) whose outputs form a case pair, plus the layout family's letter keys.
- **Caps comparison**: per key, outputs under {none, Shift, Caps, Shift+Caps} before and after a change, with the verdict (identical / gains uppercase only / differs).

## Success Criteria *(mandatory)*

- **SC-001**: On the corpus, 7.28 classifies every keyboard as fail, pass (declared), or not applicable (caseless or mnemonic), with no parse errors (baseline already recorded: 405 / 151 / 330 / 35).
- **SC-002**: Copy keyboards with a cased alphabet ship `&CasedKeys` covering 100% of keys with a case pair, including non-letter and AltGr keys (fixture with `ŋ`/`Ŋ`).
- **SC-003**: Accepting the upgrade on upstream basic_kbdus passes 7.28, compiles with zero warnings, and changes only the declaration, `&VERSION` (if raised) and the removed CAPS conditions.
- **SC-004**: No offered fix changes any key's output except by adding its uppercase under Caps, across every corpus keyboard that receives an offer.
- **SC-005**: Every Copy keyboard with a cased alphabet has a touch caps layer that passes FR-003.

## Assumptions

- The code survey for the Copy side is spec 106's [research R7](../106-consistent-keyboard-output/research.md#r7-caps-us5): module shape, the projection step, the `caseCounterpart` seam, and the scaffolder call to remove.
- Case pairs use the existing language-aware counterpart lookup (`caseCounterpart`). Output comparison uses the existing keyboard simulator, which already models the Caps state.
- The scaffolder's existing `stripCapsRules`, `removeCapsContextElements` and `ensureCasedKeysStore` are reused. Only the silent insertion on Copy moves into the produced output (FR-006).
- Story 3 needs spec 111's text-patch projection and suggested-fix surface (111 Phases 0–2). Until then, Story 3 is testable at the engine level only.
- The 7.28 implementation on this branch merges first (Story 1). Its studio tests were green before the rebase onto `5e1fb741`, whose engine build is broken on main (missing `osk/complete-osk-step.js`).

## Supersedes / amends

- [specs/106-consistent-keyboard-output](../106-consistent-keyboard-output/spec.md): User Story 5, FR-050–FR-055 and Phase 7 tasks T042–T051 move here. Spec 106 keeps a one-line pointer in their place.
- [specs/111-open-existing-keyboard](../111-open-existing-keyboard/spec.md) T044: the cased-keys fixer is FR-008/FR-009 here (comparison-gated), not a bare `stripCapsRules` + `ensureCasedKeysStore`.
