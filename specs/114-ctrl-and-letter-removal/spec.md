# Feature Specification: Ctrl rules and removing needed letters

**Feature Branch**: `114-ctrl-and-letter-removal`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Owner rulings of 2026-11-05 and 2026-11-06 on raw Ctrl and on removing letters, first recorded in spec 111 as FR-035..FR-040 with tasks T070-T077, moved here so they can be planned on their own.

**Moved from**: [specs/111-open-existing-keyboard](../111-open-existing-keyboard/spec.md) FR-035..FR-040 and tasks T070-T077. Spec 111 keeps a pointer here and does not reuse those numbers. Each requirement below names the spec 111 number it replaces.

**Builds on**: spec 111's Open walk (Upgrades is followed by Mechanisms; upgrade criteria are criterion-and-fixer pairs, spec 111 FR-025 and FR-034) and spec 111 FR-030 (Copy is unchanged except where it shares a rule with Open; these rules are such exceptions).

## Why

- **Raw Ctrl is unreliable.** Keyman core matches unsided `CTRL` on either Ctrl key (core `kmx_modifiers.cpp`). On a Mac, Control maps to `CTRL` and Command is never a keyboard modifier, so Ctrl content collides with shortcuts on every platform. The Keyman team does not want new keyboards typing on raw Ctrl.
- **It is common in the corpus.** In `release/`, 131 keyboards type something on unsided Ctrl. 31 of them have output no other key produces: on the number row (18 keyboards, mostly ZWJ, ZWNJ, LRM, RLM and ₹), letters (11, mostly Arabic-script), punctuation (13) and Space (5, all special spaces).
- **`CTRL ALT` is a different case.** Unsided `CTRL ALT` matches AltGr as Windows reports it (Left Ctrl + Right Alt) and also a plain left Ctrl+Alt, so in practice it is AltGr, not raw Ctrl.
- **Removing letters is silent.** An author can carve (Copy) or remove (Open) a letter that a listed language needs. Nothing tells them the keyboard no longer covers that language.

## Vocabulary

- **Raw Ctrl**: a rule whose modifiers include unsided `CTRL` and no Alt (`ALT`, `LALT`, `RALT`).
- **Needed letter**: a character in a listed language's main CLDR/SLDR exemplar set (the main tier only). Composed and decomposed forms count as the same character.
- **Copy**, **Open**, **copied keyboard**, **starting point**, **inventory**, **Mechanisms gallery**: as in spec 111.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Raw Ctrl is reported and its characters move back to the gallery (Priority: P1)

An author opens a keyboard that types letters, numbers or punctuation on raw Ctrl. Review and Upgrades report it, recommend moving the content off Ctrl, and warn that the keyboard may not be accepted if it stays. Accepting the fix removes those Ctrl rules and puts their characters back in the inventory, unplaced, so the Mechanisms step that follows lets the author give each one a new key.

**Why this priority**: it is the Keyman team's ruling and the only story that changes keyboards already in the repository.

**Independent Test**: open ewe (accented vowels on Ctrl+1-9) and accept the fix. The Ctrl rules are gone, the vowels appear unplaced in the Mechanisms gallery, and Review no longer reports raw Ctrl. Open sil_bunong (thin space on Ctrl+Space): nothing is reported.

**Acceptance Scenarios**:

1. **Given** an opened non-`basic_*` keyboard with raw Ctrl rules on letter, number or punctuation keys, **When** criteria run, **Then** one finding reports them, recommends moving off Ctrl, and warns the keyboard may not be accepted.
2. **Given** that finding, **When** the author accepts its fix, **Then** exactly those rules are removed from the source text and every character they typed that no other rule types is added to the inventory as unplaced.
3. **Given** a character that a raw Ctrl rule and another rule both type, **When** the fix is accepted, **Then** it is not added to the inventory again.
4. **Given** a keyboard whose only raw Ctrl rules are on Space, or a `basic_*` keyboard, **When** criteria run, **Then** nothing is reported.

---

### User Story 2 - No new Ctrl content or layers on either path (Priority: P1)

Neither path lets an author place new content on Ctrl or add a Ctrl layer the keyboard does not already have. A copied `basic_*` keyboard keeps its Ctrl rules, unless the characters they type are carved.

**Why this priority**: without it, User Story 1's fix would be undone by the galleries, and Copy would keep producing keyboards that fail it.

**Independent Test**: copy a `basic_*` keyboard with Ctrl rules (basic_kbdurdu): they survive, and no gallery offers a Ctrl placement. Carve a character typed on Ctrl: its Ctrl rule goes with its other rules.

**Acceptance Scenarios**:

1. **Given** either path, **When** the author places a character in the Mechanisms or Touch gallery, **Then** no Ctrl plane or Ctrl layer is offered.
2. **Given** a keyboard with no Ctrl touch layer, **When** the author uses the touch layer editor, **Then** it cannot add one.
3. **Given** a Copy from a `basic_*` keyboard with Ctrl rules, **When** the author carves none of their characters, **Then** the output keeps those rules unchanged.
4. **Given** that Copy, **When** the author carves a character typed on Ctrl, **Then** its Ctrl rules are removed with its other rules.

---

### User Story 3 - Removing a needed letter warns (Priority: P2)

On both paths, removing a character that a listed language needs shows a warning naming the language or languages. The author can dismiss it and keep the removal.

**Why this priority**: it protects language coverage, but the removal stays the author's call.

**Independent Test**: Copy basic_kbdfr for French and carve `é`: the warning names French. Dismiss it: `é` stays removed.

**Acceptance Scenarios**:

1. **Given** a carve on Copy, or the Remove tool or a gallery deletion on Open, **When** the removed character is a needed letter, **Then** a warning names each listed language that needs it.
2. **Given** that warning, **When** the author dismisses it, **Then** the removal stands.
3. **Given** a removed character in decomposed form whose composed form is needed (or the reverse), **When** it is removed, **Then** the warning still shows.

---

### User Story 4 - Sided Ctrl gets an advisory (Priority: P3)

`LCTRL` and `RCTRL` rules are allowed. Review shows an advisory that an Alt-based placement is preferred.

**Independent Test**: a keyboard with an `RCTRL` rule shows the advisory and no failing finding.

---

### User Story 5 - Unsided `CTRL ALT` upgrades to `RALT` (Priority: P3, proposed, awaiting the owner)

A keyboard written with unsided `CTRL ALT` for AltGr is offered an upgrade to `RALT`. Because mixing sided and unsided modifiers is not allowed, it converts every unsided Alt/Ctrl rule in the keyboard. It is withheld unless a before/after simulation shows every AltGr key types the same.

Also proposed: a touch upgrade renaming the 11 `basic_*` touch `ctrl` / `shift-ctrl` layers that carry the keyboard's RALT content to `rightalt` / `rightalt-shift` (and basic_kbdth0's to `leftctrl`), with their `nextlayer` references. This is a touch-only change, so it is allowed under the frozen `basic_*` physical layouts.

**Independent Test**: to be set when the owner rules.

### Edge Cases

- A Ctrl rule on an ASCII digit that types the same digit the base keyboard would is not content on Ctrl; it is not reported (a likely false positive in the census).
- esperanto_sava_eujao is a likely false positive in the census; planning checks it against the final rule.
- A keyboard with both raw Ctrl and `CTRL ALT` rules: User Story 1 reports only the raw Ctrl ones.
- Open for planning, not yet ruled: whether a raw Ctrl rule outside the main key group (a deadkey or context group) is reported, and whether the removal warning repeats for a character the author already chose to remove.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(was spec 111 FR-035)*: Outside `basic_*` keyboards, a rule on unsided `CTRL` (without Alt) on a letter, number or punctuation key MUST be reported, recommending that it move off Ctrl and warning that the keyboard may not be accepted if it stays. Ctrl+Space (special spaces) is not reported. `basic_*` keyboards keep their Ctrl content and are never reported.
- **FR-002** *(was FR-036)*: The fix MUST remove those Ctrl rules (a text splice) and return each character they typed to the inventory as unplaced, so the Mechanisms gallery, which follows Upgrades in the Open walk, is where the author gives it a new key. A character also typed elsewhere is not re-added.
- **FR-003** *(was FR-037)*: On Copy, and in the Open galleries, no new content MAY be placed on a Ctrl layer, and no Ctrl layer MAY be added (physical or touch) where the keyboard has none. Existing Ctrl content on a copied `basic_*` keyboard is kept, unless the characters it types are carved: carving a character removes its Ctrl rules with its other rules.
- **FR-004** *(was FR-038)*: `LCTRL` / `RCTRL` are allowed, with an advisory that an Alt-based placement is preferred.
- **FR-005** *(was FR-039; proposed, awaiting the owner)*: Unsided `CTRL ALT` is AltGr in practice, so it is not raw Ctrl. It is offered an upgrade to `RALT` that converts every unsided Alt/Ctrl rule in the keyboard (mixing sided and unsided modifiers is not allowed), withheld unless a before/after simulation shows every AltGr key types the same.
- **FR-006** *(was FR-040)*: On both paths, removing a character that a listed language needs (its main CLDR/SLDR exemplar set; carve on Copy, the Remove tool and gallery deletions on Open) MUST show a warning naming the language or languages that need it. The warning is dismissable: the author can keep the removal. Composed and decomposed forms count as the same character.
- **FR-007** *(was task T075; proposed, awaiting the owner)*: The 11 `basic_*` touch `ctrl` / `shift-ctrl` layers that carry the keyboard's RALT content MAY be offered a rename to `rightalt` / `rightalt-shift` (basic_kbdth0's to `leftctrl`), with their `nextlayer` references updated.
- **FR-008**: The criterion and the advisory (FR-001, FR-004) MUST be rows in `packages/contracts/data/criteria.json` with keyboard-lint checks, and the fixes (FR-002, FR-005) upgrade pairs, as spec 111 FR-025 requires of every upgrade.

### Key Entities

- **Raw Ctrl finding**: the rules reported by FR-001, each with its key, plane and the characters it types.
- **Needed-letter set**: the union of the listed languages' main exemplar sets, normalised so composed and decomposed forms match, with each character mapped to the languages that need it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Run over `release/`, the raw Ctrl criterion reports every keyboard in the census with Ctrl-only output on letters, numbers or punctuation, and none whose only raw Ctrl is on Space. Each remaining difference from the census is explained.
- **SC-002**: After accepting the fix on ewe, the criterion passes and every character the removed rules typed is in the inventory exactly once.
- **SC-003**: The Copy golden walk (basic_kbdfr) output is unchanged.
- **SC-004**: A Copy from basic_kbdurdu with nothing carved keeps every Ctrl rule.
- **SC-005**: No gallery or touch editor action on either path produces a new rule or touch key on a Ctrl plane or layer.
- **SC-006**: Every removal of a needed letter on either path shows the warning; no removal of a character outside the needed-letter set does.

## Constitution impact

- **Article II**: the FR-002 fix and the carve change are IR-computed edits placed as text splices, as spec 111 established for Open.
- **Article VI**: engine owns the splice, gallery restrictions and the warning UI; content owns the criterion rows, finding and advisory wording.
- **Article X**: every fix is a suggestion the author accepts; the removal warning never blocks.

## Planning notes (carried from spec 111 tasks T070-T077)

- Criterion row and keyboard-lint check for FR-001 (was T070).
- Upgrade pair for FR-002, registered in `packages/studio/src/criteria/upgradePairs.ts` (was T071).
- Gallery and touch layer editor restrictions for FR-003 on both paths (was T072).
- Advisory criterion for FR-004 (was T073).
- FR-005 upgrade with a before/after AltGr simulation (was T074; awaiting the owner).
- FR-007 touch rename (was T075; proposed).
- Check carve's rule removal covers CTRL planes; test with basic_kbdurdu (was T076).
- The FR-006 warning reuses `useCarveNeededSet` and the Open exemplar union rather than a new lookup (was T077).

## Assumptions

- The census numbers come from `release/` in the keyboard-studio/keyboards fork as of 2026-11-05.
- Spec 111's Open walk (Upgrades before Mechanisms) and its upgrade-pair registry are on the branch this spec builds on.
- FR-005 and FR-007 are not planned for implementation until the owner rules; planning may stub their criteria rows.
