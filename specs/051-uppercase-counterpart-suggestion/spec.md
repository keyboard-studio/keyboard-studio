# Feature Specification: Suggest the uppercase counterpart when a lowercase cased letter is placed

**Feature Branch**: `051-uppercase-counterpart-suggestion`

**Created**: 2026-07-28

**Status**: Draft

**Input**: Issue #1356 — "feat(studio): suggest uppercase counterparts when a lowercase cased letter is placed"

## Why this exists

When an author places a **lowercase** cased letter, its **uppercase** counterpart almost always belongs on the
casing-parallel slot — the Shift/Caps version of the same physical key, the uppercase-triggered form of the same
combo, or the shift/caps layer of the same touch layer. Leaving the author to remember and re-place the capital by
hand is a defaults gap: per the defaults-first principle (spec v1.3.1 §3c, "Defaults are the product",
propose-then-confirm), the studio should **surface the pairing** as a suggestion the author confirms or dismisses —
never a silent auto-insert.

Half of this already exists. The **physical-key / shift-layer** case-pair companion is built and shipping in
[MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx) (`pendingCompanion`,
propose-then-confirm, driven by the engine's `caseCounterpart` primitive
[casePair.ts](../../packages/engine/src/character-discovery/casePair.ts) and applied via `planShiftAssignment` /
`buildCasePairRuleLines`). This feature makes that same behavior **consistent across all three placement
mechanisms** — physical key, cased combo / dead-key sequence, and touch keyboard — so a lowercase placement in any of
the three raises the same independently confirmable/dismissable proposal for its capital.

It also fixes a related casing defect the extension exposes: the **touch** gallery currently does not distinguish
lowercase from uppercase when it picks a placement. For a decomposable accented lowercase letter (e.g. `á`) it derives
a long-press host from the NFD base and uppercases it into a vkey (`K_${base.toUpperCase()}` in
[TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) ~L1194) without choosing the
default-vs-shift **layer** by the letter's case — so accented lowercase letters get suggested onto the uppercase
(shift-layer) key rather than the lowercase (default-layer) key. Placement must be case-correct before a parallel
"add the uppercase on the shift layer" suggestion can mean anything.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Physical key: capital proposed on Shift/Caps of the same key (Priority: P1)

An author places a lowercase cased letter on a physical base-layer key. The studio proposes adding its uppercase
counterpart to the **Shift / Caps** version of that *same* key, and the author confirms or dismisses it.

**Why this priority**: This is the already-shipping baseline behavior; US1 pins it down as the reference the other two
mechanisms must match, and guards it against regression while the shared logic is generalized.

**Independent Test**: Assign a lowercase cased letter (e.g. `θ`) to a physical key on a non-mnemonic keyboard; confirm
the case-pair companion prompt offers the uppercase (`Θ`) on that key's shift layer, that confirming records exactly
the assignment the prompt was raised for, and that dismissing records nothing extra.

**Acceptance Scenarios**:

1. **Given** a lowercase cased letter placed on a base-layer physical key, **When** the placement is applied, **Then**
   a propose-then-confirm suggestion offers its uppercase counterpart on the Shift/Caps of the same key.
2. **Given** that suggestion, **When** the author confirms, **Then** the uppercase is recorded on the shift layer of
   that key and nothing else changes.
3. **Given** that suggestion, **When** the author dismisses, **Then** no uppercase assignment is made and the author
   is not re-prompted for that placement.
4. **Given** a mnemonic keyboard (where a SHIFT-flagged rule would double-apply shift), **When** a lowercase letter is
   placed, **Then** no shift-layer case-pair suggestion is raised (existing `shiftLayerAllowed` gate).

---

### User Story 2 - Cased combo / dead-key: uppercase trigger → uppercase output (Priority: P1)

An author produces a lowercase cased letter via a combo or dead-key sequence (e.g. a dead key followed by a base
letter yields the accented lowercase). The studio proposes a **parallel combo** whose **uppercase input** produces the
**uppercase output** (uppercase trigger → uppercase result), independently confirmable.

**Why this priority**: Combos/dead keys are a first-class placement mechanism (`SequenceBuilderPanel`); without the
parallel-combo suggestion the author gets the lowercase accented form but silently loses the capital, which is the
exact gap the issue calls out.

**Independent Test**: Build a dead-key/combo sequence that outputs a lowercase cased letter with a single-character
uppercase counterpart; confirm a parallel proposal is offered whose trigger is the case-shifted input and whose output
is the uppercase counterpart, that confirming records that parallel combo, and that dismissing records nothing.

**Acceptance Scenarios**:

1. **Given** a combo/dead-key sequence that outputs a lowercase cased letter, **When** the sequence is applied, **Then**
   a suggestion offers the parallel combo (uppercase-shifted trigger → uppercase output).
2. **Given** that suggestion, **When** the author confirms, **Then** the parallel uppercase combo is recorded alongside
   the lowercase combo.
3. **Given** a combo whose output has no confident single-character uppercase counterpart (caseless, or a
   multi-character expansion), **When** the sequence is applied, **Then** no parallel-combo suggestion is raised.

---

### User Story 3 - Touch keyboard: capital proposed on the shift/caps layer of the edited layer (Priority: P1)

An author places a lowercase cased letter on a touch layer. The studio proposes adding its uppercase counterpart to
the **shift / caps layer corresponding to the layer currently being edited**, independently confirmable — and the
lowercase placement itself lands on the correct (default, not shift) layer.

**Why this priority**: Touch is the third mechanism the issue requires, and it carries the pre-existing casing defect:
today the touch suggestion does not pick the layer by the letter's case, so accented lowercase letters are proposed on
the uppercase key. Both must be fixed together, or a "parallel uppercase on shift" suggestion sits on top of an
already-miscased placement.

**Independent Test**: On a touch layer, place a lowercase decomposable accented letter (e.g. `á`); confirm (a) the
lowercase long-press/host suggestion targets the **default** layer's key, not the shift layer, and (b) a separate
propose-then-confirm suggestion offers the uppercase counterpart (`Á`) on the shift/caps layer of the layer being
edited.

**Acceptance Scenarios**:

1. **Given** a lowercase cased letter placed on the default touch layer, **When** the placement is suggested/applied,
   **Then** its host is on the default layer, and a separate suggestion offers the uppercase counterpart on the
   corresponding shift/caps layer.
2. **Given** a decomposable accented lowercase letter (e.g. `á`), **When** the touch suggestion is computed, **Then**
   the lowercase long-press host is derived for the lowercase (default-layer) key — not silently promoted to the
   uppercase-layer key.
3. **Given** the uppercase suggestion, **When** the author confirms, **Then** the uppercase is placed on the
   shift/caps layer of the currently-edited layer; **When** dismissed, nothing is placed.
4. **Given** a caseless touch letter (no counterpart), **When** it is placed, **Then** no uppercase-layer suggestion
   is raised.

---

### Edge Cases

- **No confident counterpart.** A lowercase letter with no single-character uppercase counterpart — caseless scripts
  (Arabic, Devanagari), self-mapping letters (e.g. U+0138 ĸ), or multi-character expansions (`ß`→`SS`, `ﬃ`→`FFI`) —
  raises **no** suggestion. `caseCounterpart` already returns `null` in every one of these cases; this feature must not
  add a second, looser casing path.
- **Author places the uppercase directly.** Placing an uppercase cased letter does not trigger a "propose the
  lowercase" suggestion in v1 — the issue is scoped to lowercase→uppercase. (The engine primitive is bidirectional;
  the reverse direction is deliberately out of scope, see Out of scope.)
- **Counterpart already placed.** If the uppercase counterpart is already produced on the parallel slot (shift key /
  uppercase combo / shift layer), no redundant suggestion is raised.
- **Suggestion already resolved.** A confirmed or dismissed suggestion is not re-raised for the same placement
  (mechanisms already track resolved suggestions per character — `pendingCompanion` clear-on-resolve,
  `suggestionResolved`).
- **Locale-specific casing.** Turkic `i`→`İ` (dotted capital I) must be respected when the working-copy identity
  supplies a BCP47 tag (`caseCounterpart(char, bcp47)`), consistent with the physical-key companion's existing bcp47
  plumbing. Any casing that is genuinely ambiguous beyond the locale-tag mechanism already in place is left as a
  follow-up (see Assumptions / Out of scope).
- **Titlecase letters raise nothing (verified benign).** A directly-placed titlecase letter (e.g. `ǅ` U+01C5 LATIN
  CAPITAL LETTER D WITH SMALL LETTER Z WITH CARON) matches `\p{Lt}`, not `\p{Ll}`/`\p{Lu}`, so `caseCounterpart`
  returns `null` and no case-pair suggestion fires for it at all — same as any other caseless input. Its only
  observable effect is that FR-006's `\p{Lu}` layer test does not classify it as uppercase, so a direct titlecase
  placement lands on the touch default layer; this is benign, not a defect, and needs no suppression.
- **Orthographically-unicameral, Unicode-bicameral scripts.** `caseCounterpart` itself suppresses only what its
  Unicode-property guards can see (§ "No confident counterpart" above); it has no notion of which Unicode case
  mappings are actually used as a shift-key pairing in ordinary orthography versus a stylistic alternate. The sharp
  case is **Georgian Mkhedruli/Mtavruli**: `caseCounterpart` maps Mkhedruli ა U+10D0 -> Mtavruli Ⴀ U+1C90 and
  ბ U+10D1 -> Ბ U+1C91 (Unicode 11.0 gave Mkhedruli a formal uppercase), but standard Georgian orthography does not
  case-alternate — Mtavruli is a headers/inscriptions register, not the Shift companion of everyday Mkhedruli. The
  corpus confirms it: the one Georgian keyboard, `basic_kbdgeo`, maps every `[SHIFT K_x]` to the identical codepoint
  as its base rule, and the facet classifier independently labels it `casing: "caseless"`,
  `caps-handling: notApplicable`. **v1 decision:** the primitive stays unchanged (it is a pure Unicode fact, per Out
  of scope below), but the studio's `casePairCompanion.ts` — the one caller that turns a counterpart into an authored
  proposal — suppresses the suggestion specifically for Georgian, via a named `isOrthographicallyUnicameral`
  predicate keyed on `\p{Script=Georgian}` (covering Mkhedruli, Mtavruli, Asomtavruli, and Nuskhuri uniformly). No
  Mtavruli capital is ever proposed for a Mkhedruli placement. Cherokee (e.g. ꭰ U+AB70 <-> Ꭰ U+13A0) is nominally
  bicameral in Unicode the same way, but its everyday-use convention is less settled and there is no comparable
  corpus keyboard demonstrating a caseless Shift layer, so it is **not** suppressed and remains a known accepted v1
  gap — see Out of scope. Propose-then-confirm (FR-001/FR-007) is the mitigation for that remaining gap: nothing is
  auto-inserted, and the author dismisses the noise.
- **Multiple mechanisms per character.** A character may carry several assignments; confirming a suggestion must apply
  to exactly the placement that raised it (the physical-key path already captures the raising assignment by object
  identity in `pendingCompanion.baseAssignment` — the parallel-combo and touch paths must be equally precise).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an author places a **lowercase** cased letter that has a confident single-character uppercase
  counterpart, the studio MUST raise a **propose-then-confirm** suggestion for its uppercase counterpart — never a
  silent auto-insert (spec §3c).
- **FR-002**: Cased-pair detection MUST use the engine's existing `caseCounterpart` primitive
  ([casePair.ts](../../packages/engine/src/character-discovery/casePair.ts)) as the single source of truth; no new or
  parallel casing logic is introduced. A `null` result MUST suppress the suggestion.
- **FR-003 (physical key)**: For a lowercase letter placed on a base-layer physical key, the suggested target MUST be
  the **Shift/Caps** version of that same key (existing `pendingCompanion` behavior, preserved).
- **FR-004 (combo / dead-key)**: For a lowercase letter produced by a combo or dead-key sequence, the suggestion MUST
  offer a **parallel combo**: the case-shifted (uppercase) trigger producing the uppercase counterpart as output.
- **FR-005 (touch)**: For a lowercase letter placed on a touch layer, the suggestion MUST offer the uppercase
  counterpart on the **shift/caps layer corresponding to the layer currently being edited**.
- **FR-006 (touch placement casing fix)**: The touch gallery's placement/host derivation MUST select the
  default-vs-shift **layer** according to the placed letter's case. A lowercase (including decomposable accented
  lowercase) letter MUST NOT be suggested onto the uppercase (shift-layer) key.
- **FR-007**: Each suggestion MUST be **independently confirmable and dismissable**; confirming records the uppercase
  on the parallel slot, dismissing records nothing, and a resolved suggestion MUST NOT be re-raised for that placement.
- **FR-008**: Confirming a suggestion MUST apply to exactly the placement that raised it, even when the character
  carries multiple mechanism assignments (identity-tracked, not target/index-scanned).
- **FR-009**: Case derivation MUST respect locale-specific casing when the working-copy identity supplies a BCP47 tag
  (e.g. `tr` → `i`/`İ`), reusing the existing bcp47 plumbing rather than adding a new one.
- **FR-010**: The suggestion MUST NOT fire where the parallel slot cannot legitimately host the pair — notably the
  existing mnemonic-layout gate for shift-layer targeting (`shiftLayerAllowed`) MUST continue to suppress the
  physical-key suggestion.
- **FR-011**: The three mechanisms MUST present the suggestion through the same propose-then-confirm affordance
  (Accept/Deny) the galleries already use, so the interaction reads identically regardless of mechanism.

### Key Entities *(include if feature involves data)*

- **Case-pair suggestion**: a proposed uppercase placement raised in response to a confirmed lowercase placement,
  carrying the originating character, its uppercase counterpart, the parallel target (shift key / uppercase combo /
  shift layer), and the identity of the placement that raised it. Confirmed → recorded on the parallel slot;
  dismissed → discarded.
- **Parallel combo**: for the combo/dead-key mechanism, the uppercase-triggered counterpart of a lowercase-producing
  combo (uppercase trigger → uppercase output).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Placing a lowercase cased letter with a single-character uppercase counterpart via **any** of the three
  mechanisms raises a case-pair suggestion for its capital on the casing-parallel slot; placing one with no confident
  counterpart raises none. (Consistency across mechanisms — the core of the issue.)
- **SC-002**: On the touch gallery, a decomposable accented **lowercase** letter is suggested/placed on the **default**
  layer key, and its uppercase counterpart on the **shift** layer — zero cases of accented lowercase suggested onto the
  uppercase key across the test samples (the reported defect, gone).
- **SC-003**: Every suggestion is independently confirmable/dismissable; confirming applies to exactly the raising
  placement (verified with a character carrying multiple mechanisms), and a resolved suggestion is never re-raised.
- **SC-004**: Locale-sensitive casing holds (`tr`: `i`→`İ`) wherever the identity supplies a BCP47 tag, across all
  three mechanisms.
- **SC-005**: No regression to the existing physical-key/shift-layer companion (US1 scenarios all still pass,
  including the mnemonic-layout suppression).

## Assumptions

- `caseCounterpart` (engine) is the sole cased-pair mechanism; its existing guards (single code point, `\p{Ll}`/`\p{Lu}`
  only, one-to-one, locale-aware) define exactly when a suggestion can fire. No looser fallback is added. Those guards
  are Unicode-general-category tests, not orthographic-convention tests — they say nothing about whether a script's
  Unicode case mapping is actually used as a Shift-key pairing in ordinary use, so "can fire" and "should read as a
  useful pairing to this author" are not the same claim. The Georgian case (see Edge Cases above) is where that gap is
  wide enough to warrant an explicit, corpus-evidenced suppression in the studio's proposal hook rather than being
  left to propose-then-confirm alone.
- The three galleries already expose a shared Accept/Deny propose-then-confirm affordance and per-character
  resolved-suggestion tracking; this feature routes the new suggestions through those, rather than inventing a new UI.
- The working-copy identity's BCP47 tag is the locale source for casing, matching the physical-key companion's current
  bcp47 plumbing.
- Recording an uppercase placement on the parallel slot uses each mechanism's existing apply path
  (`planShiftAssignment` / `buildCasePairRuleLines` for shift; the combo apply path in `SequenceBuilderPanel` for the
  parallel combo; the touch apply path for the shift-layer placement) — no new output/codec construct.

## Out of scope

- **Uppercase→lowercase** direction (placing a capital and proposing its lowercase). The engine primitive is
  bidirectional but the issue scopes v1 to lowercase→uppercase.
- Locale-specific casing beyond the existing BCP47-tag mechanism — genuinely ambiguous or context-sensitive casing is a
  follow-up per the issue's open question, not v1.
- Any change to the `caseCounterpart` primitive itself, or to the marks-series `deriveCaseCounterparts`
  (that path stays as-is; this feature is about placement-time suggestions, not mark attachments; the primitive
  remains a pure Unicode fact and carries no script-aware suppression list, per its own docstring).
- A general script-aware suppression list for every script that is bicameral in Unicode but not in ordinary
  orthography. Georgian is suppressed (see Edge Cases above), on direct corpus evidence
  (`basic_kbdgeo`'s caseless Shift layer). Cherokee and any other script in this class are **not** suppressed and
  remain accepted v1 noise, mitigated by propose-then-confirm; widening the suppression list is a follow-up, done
  only on comparable corpus evidence, not a hunch.
- CJK/Ethiopic and other caseless scripts (no case pairs to propose) and any out-of-scope items from spec §16.
- Bulk "add all capitals" actions — each proposal remains an independent per-placement confirm.

## Related

- Issue #1356 — this feature.
- [MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx) — the shipping
  physical-key / shift-layer case-pair companion (`pendingCompanion`) this generalizes.
- [SequenceBuilderPanel.tsx](../../packages/studio/src/editors/assignLoop/SequenceBuilderPanel.tsx) — the combo /
  dead-key placement path the parallel-combo suggestion attaches to.
- [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) — the touch placement path that
  needs the case-aware layer fix (FR-006) and the shift-layer suggestion (FR-005).
- [casePair.ts](../../packages/engine/src/character-discovery/casePair.ts) — the `caseCounterpart` primitive (FR-002);
  its header states the invariant that any new uppercase placement route through it rather than a fresh `toUpperCase()`.
- [shiftRules.ts](../../packages/engine/src/pattern-apply/shiftRules.ts) — `buildCasePairRuleLines` /
  `planShiftAssignment` / `isMnemonicLayout` / `keyHasCapsHandling`, the physical-key case-pair apply path (FR-003, FR-010).
- [patternIds.ts](../../packages/studio/src/editors/assignLoop/patternIds.ts) — `PATTERN_DEADKEY` (S-02),
  `PATTERN_SEQUENCE` (S-03), `PATTERN_SWAP` (S-01), `PATTERN_RALT` (S-08); the combo/dead-key mechanism ids (FR-004).
- [scaffoldTouchLayout.ts](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts) /
  [propagateDesktopLayersToTouch.ts](../../packages/engine/src/pattern-apply/propagateDesktopLayersToTouch.ts) —
  the `default`/`shift`/`caps` touch-layer model and `comboToTouchLayerId` mapping the touch suggestion targets (FR-005).
- [spec 047](../047-alphabet-inventory-categories/spec.md), [spec 049](../049-lowercase-diacritic-questions/spec.md) —
  the "Your alphabet" / diacritic-question casing convention the issue's cased-pair note refers to; spec 049 FR-002/FR-003
  set the same "route through `caseCounterpart`, no second casing path" invariant this feature follows.
