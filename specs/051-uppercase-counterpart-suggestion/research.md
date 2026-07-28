# Phase 0 Research: Suggest the uppercase counterpart when a lowercase cased letter is placed

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-07-27

This document resolves every unknown the spec left implicit, by reading the code the feature attaches
to. Three of the resolutions **correct a premise in the spec**; those are called out explicitly so
`/speckit-tasks` and the implementing crew do not inherit the wrong mental model.

---

## R1 — Where the reference implementation actually lives (and what it commits us to)

**Decision**: Generalize the existing physical-key companion by **extracting** its state + banner into a
shared hook and component, rather than copying its shape into two more galleries.

**Findings**:

- The shipping companion is entirely local to
  [MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx):
  - `pendingCompanion` state (~L1651) — `{ originalChar, counterpart, vkey, capsHandling, baseAssignment }`.
  - Raised inside `handleApply`'s `method === "swap"` branch (~L2075–2102), gated on
    `effectiveLayer === "base" && shiftLayerAllowed` and `counterpart.direction === "toUpper"`.
  - Resolved by `handleCompanionConfirm` / `handleCompanionDecline` (~L2177–2258).
  - Rendered as an inline `role="note"` banner (~L2966–3050) with i18n ids
    `editor.assignLoop.companion.*`.
- `caseCounterpart` is imported directly from the engine (L73) alongside `isMnemonicLayout`,
  `planShiftAssignment`, `buildShiftRuleLines`, `buildBaseRuleLines`, `buildCasePairRuleLines`.
- `identityBcp47` comes from `useWorkingCopyStore((s) => s.identity?.bcp47)` and is normalized
  (`"" → undefined`) before being passed to `caseCounterpart` — FR-009's "existing bcp47 plumbing".

**Rationale**: FR-011 requires the three mechanisms to present *the same* affordance. Three
independently-written banners is precisely the drift class the repo already guards against elsewhere
(the `isSequenceAssignmentForChar` hoist in
[SequenceBuilderPanel.tsx](../../packages/studio/src/editors/assignLoop/SequenceBuilderPanel.tsx) L70–86
exists for the same reason). One hook + one banner makes FR-011 structural instead of aspirational,
and makes FR-002 ("no second casing path") impossible to violate by construction.

**Alternatives rejected**:
- *Copy the pattern into each gallery* — three divergent copies of the identity-tracking guard
  (FR-008), which is the P1 defect the existing comment at L1643–1650 was written to prevent.
- *Put the proposal in the engine* — the proposal is UI state (pending/confirm/dismiss); the engine
  already owns the pure parts (`caseCounterpart`, the rule builders). Nothing to move.

---

## R2 — The combo/dead-key mechanism is **two** call sites, not one

**Decision**: FR-004 is implemented at **both** apply paths, feeding the one shared proposal state.

**Findings**: the spec's Related section names only `SequenceBuilderPanel`, but the combo/dead-key
family is split across two files:

| Mechanism | Pattern | Where applied | slotValues |
|---|---|---|---|
| Dead key (S-02) | `PATTERN_DEADKEY` | `MechanismGallery.handleApply`, `method === "deadkey"` (~L1973–2023) | `triggerKey`, `deadkeyName`, `baseLetters`, `accentedForms`, `accentChar` |
| Sequence (S-03) | `PATTERN_SEQUENCE` | `SequenceBuilderPanel.handleApply` (~L228–276) | `firstLetterOut`, `secondLetter`, `collapsedChar` |

`SequenceBuilderPanel` is rendered *inside* MechanismGallery's right pane and already calls back via
`onApplied`, so it can raise a proposal into MechanismGallery's shared hook without a second banner.

**Rationale**: leaving the dead-key branch out would satisfy the spec's Related list while failing
FR-004's own wording ("a combo **or dead-key** sequence") and SC-001 ("**any** of the three
mechanisms").

---

## R3 — What "case-shifted trigger" means per mechanism (**corrects the spec**)

**Decision**: the case-shifted element is the **base/content letter**, not the dead-key trigger.

**Findings**: FR-004 and US2 say "the case-shifted (uppercase) **trigger**". For a dead key that is
wrong and would produce a broken rule — the trigger is an accent key (`;`, `´`), which has no case.
The parallel combo is:

- **S-02 dead key**: same `triggerKey` / `deadkeyName` / `accentChar`; `baseLetters` → its uppercase
  counterpart; `accentedForms` → the uppercase counterpart of the output.
  `dk(acute) + a → á` therefore pairs with `dk(acute) + A → Á`.
- **S-03 sequence**: same `secondLetter` (the indicator — an unshifted physical key by construction,
  see the `charToVkey` gate at L210); `firstLetterOut` → case-shifted; `collapsedChar` → the uppercase
  counterpart.
  `a + ´ → á` therefore pairs with `A + ´ → Á`.

The author *does* press Shift to type the uppercase base letter, so the interaction the spec describes
is preserved — it is the emitted slot values that differ from a literal reading. **Both** the input
side and the output side must case-shift through `caseCounterpart`; a parallel combo whose input
uppercases but whose output does not is a silent wrong-output bug.

**Rationale**: keeping the spec's literal wording would emit a rule keyed on a shifted accent key,
which is not what any Keyman keyboard does and is not what the issue asked for.

---

## R4 — Multi-character sequence content has no confident case shift

**Decision**: raise **no** parallel-combo proposal when the combo's input side is not a single cased
character. Concretely: S-03 `firstLetterOut` must be exactly one character with a non-null
`caseCounterpart`; S-02 `baseLetters` likewise.

**Findings**: `SEQ_CONTENT_RESOLVE_OPTIONS` is deliberately `multiToken: true` and **not**
`singleGrapheme` — content may legitimately span graphemes (a digraph collapse, e.g. `ng`), per the
domain note at L113–115. `"ng"` has two defensible capitalizations (`Ng`, `NG`) and the choice is
orthography-specific, not derivable.

**Rationale**: this is the same rule FR-002 already sets for characters — no confident counterpart,
no suggestion. Extending "confident" from the output character to the whole combo keeps one
consistent silence condition instead of inventing a heuristic.

**Alternatives rejected**:
- *Title-case the content (`ng` → `Ng`)* — picks one of two answers with no evidence; for an
  all-caps-digraph orthography it is silently wrong, and a wrong default is worse than no default
  (spec §3c: "no default is a defect" argues for a *correct* default, not a guessed one).
- *Offer both `Ng` and `NG`* — turns a one-tap confirm into a disambiguation dialog, contradicting
  FR-011's "reads identically regardless of mechanism".

---

## R5 — Touch placement has **no layer concept at all** (**corrects the spec**)

**Decision**: FR-005 and FR-006 are not two independent fixes — they are one missing capability. Touch
mechanism refs must gain an optional `layer` slot value, and both engine appliers must honour it.

**Findings**:

- Touch mechanism refs are built by `buildTouchMechanismRef`
  ([TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) L222–250) with
  slotValues `{ hostKey, char }` (plus `direction` for flick). **No layer field exists.**
- `applyTouchAssignments`
  ([applyTouchAssignments.ts](../../packages/engine/src/pattern-apply/applyTouchAssignments.ts))
  hardcodes the phone platform's `"default"` layer (L66–77, L263–276) and returns every other layer by
  reference.
- `applyTouchAssignmentsToRawJson`
  ([applyTouchAssignmentsToRawJson.ts](../../packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts))
  does the same — "We only look in the `default` layer per the spec" (L88–99), and warns only when the
  host key is in no platform's default layer (L139).
- In the scaffolded layout, a key's `id` is the **vkey** (`K_A`) in *both* the `default` and `shift`
  layers; only `text` differs
  ([scaffoldTouchLayout.ts](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts) `buildLetterKey`,
  `resolveKeyText` — `layerId === "shift" ? fallback[1] : fallback[0]`). A bare `hostKey: "K_A"` is
  therefore **layer-ambiguous**, and both appliers resolve the ambiguity to `default`.

**Consequence for FR-006 — the reported defect is real but mis-described.** The spec says accented
lowercase letters "get suggested onto the uppercase (shift-layer) key". They do not: `K_A` resolves to
the default layer, so a lowercase `á` already lands on the lowercase key. What is actually broken is
that `K_${base.toUpperCase()}` (TouchGallery L1194) is **case-blind in the other direction** — an
accented *uppercase* `Á` derives the identical `K_A` and is also placed on the default (lowercase)
layer, where it does not belong. Case is currently *unrepresentable* in a touch placement. `K_A` is a
vkey name, not an uppercase letter, so the `.toUpperCase()` call itself is correct and stays.

FR-006 is therefore implemented as: **derive the layer from the placed letter's case** — lowercase →
`default`, uppercase → `shift` — and carry it on the ref. That satisfies the requirement's intent
(a lowercase letter is never placed on the uppercase key) and simultaneously fixes the inverse case
the spec did not notice. SC-002's measurement ("zero cases of accented lowercase suggested onto the
uppercase key") holds trivially and is extended in [quickstart.md](quickstart.md) with the uppercase
half, which is the one that can actually regress.

**Rationale**: without a layer on the ref there is nowhere for FR-005's uppercase placement to go —
confirming the proposal would append a second mechanism that the applier folds into the *same* default
layer key, producing two characters on one key instead of a case pair. The layer slot is the minimum
change that makes FR-005 expressible.

**Alternatives rejected**:
- *Encode the layer in `hostKey` (e.g. `shift:K_A`)* — silently breaks every existing host-key
  consumer (`promoteOnManualEdit`, `extractMechanismHostKey`, the raw-JSON key lookup) and smuggles
  structure into a field documented as a resolved vkey.
- *Place the uppercase on the desktop shift layer and let `propagateDesktopLayersToTouch` carry it* —
  the touch gallery runs in Phase E, after desktop propagation; the propagation would not re-run, and
  it would make a touch-only author's confirm silently do nothing.

---

## R6 — "The layer currently being edited" does not exist yet either

**Decision**: introduce an explicit `editingLayer` value in TouchGallery, fixed to `"default"` for v1,
with the parallel target resolved by a shared `casePairTouchLayer(editingLayer)` helper.

**Findings**: TouchGallery has no layer selector, no layer state, and no layer in its assignment model
— it edits the phone `default` layer implicitly, because that is the only layer the appliers touch
(R5). FR-005's "shift/caps layer corresponding to the layer currently being edited" therefore has
exactly one instance today: `default → shift`.

**Rationale**: naming the concept now (one helper, one value) means the day a layer selector lands,
FR-005 keeps working by widening the helper's mapping rather than by rewriting the proposal. Hardcoding
the string `"shift"` inline at the proposal site would have to be hunted down instead. The layer id
vocabulary (`default`, `shift`, `caps`, …) is already established by `comboToTouchLayerId`
([modifierCombos](../../packages/engine/src/pattern-apply/modifierCombos.ts)) — the helper matches it
rather than inventing names.

**Out of scope, recorded**: the `caps` layer. `comboToTouchLayerId(["CAPS"])` is `"caps"`, but the
scaffolder emits only `default` / `shift` / `numeric` for phone, so a `caps` target would resolve to a
layer that does not exist. The applier warns and skips (R7) rather than inventing one.

---

## R7 — Contract for a layer that does not exist in the layout

**Decision**: unknown/absent target layer → **warn and skip that mechanism**, never throw, never fall
back to `default`.

**Findings**: both appliers already establish exactly this idiom — missing phone platform, missing
default layer, and unknown host key each push a `[touch-apply]` / `[touch-apply-raw]` warning and skip
(applyTouchAssignments L66–77, L118; raw-JSON L139). The functions are documented as never throwing.

**Rationale**: falling back to `default` would put an uppercase letter on the lowercase key — the exact
defect FR-006 exists to remove — and would do so invisibly. Skipping with a warning keeps the failure
attributable, and matches the existing contract so no caller has to learn a new error mode.

---

## R8 — No locked-schema change, and no content-team file change

**Decision**: the `layer` addition is a **slot value**, not a schema field. Article I is not engaged.

**Findings**:

- `MechanismRef.slotValues` is `Record<string, string> | undefined`
  ([assignmentMap.ts](../../packages/contracts/src/assignmentMap.ts) L51). Adding a key is data, not a
  type change; `Pattern`, `Criterion`, and their zod mirrors are untouched.
- The touch gallery's refs are **code-applied, not YAML-substituted**: `buildTouchMechanismRef` emits
  `{ hostKey, char }`, whereas [multitap.yaml](../../content/patterns/touch/multitap.yaml) declares
  `hostKey` + `multitapList`. The names already diverge, and `applyTouchAssignments` dispatches on
  `patternId` in code. There is no `longpress-alternates.yaml` at all. So no
  `content/patterns/touch/*.yaml` edit is required — the change stays inside the Engine team's boundary
  (Article VI).
- `mergeAssignments` keys on `(modality, scope, target)`
  ([assignmentMap.ts](../../packages/contracts/src/assignmentMap.ts) `assignmentKey`). The uppercase
  counterpart is a **different `target`**, so a confirmed proposal can never last-wins-clobber the
  lowercase placement it was raised from. Same for TouchGallery's `charTouch` map, which is keyed by
  character.

---

## R9 — Re-raise semantics (FR-007)

**Decision**: the proposal stays **transient per apply** — raised at apply time, cleared on confirm,
dismiss, or character change. A *new* apply for the same character legitimately raises a new proposal.

**Findings**: `pendingCompanion` is already transient, and the two galleries track resolution
differently — MechanismGallery clears the state, TouchGallery keeps a persistent
`suggestionResolved` set (L1228–1230) for its *placement* suggestion card, which is a different object
(it is offered before an apply, not after one).

**Rationale**: FR-007 forbids re-raising "for that placement". A second apply *is* a second placement,
so re-raising is correct there; and the transient model needs no new persistence, so no per-character
dismissal state can go stale. Reusing TouchGallery's `suggestionResolved` set for the case-pair
proposal would conflate the two and cause an accepted placement suggestion to suppress the case-pair
proposal that should follow it.

---

## R10 — CAPS interaction stays exactly as-is on the physical path

**Decision**: no change to the CAPS logic; the extracted hook carries `capsHandling` through unchanged.

**Findings**: `handleCompanionConfirm` has two branches — CAPS-handling keys **replace** the base
assignment with one combined `buildCasePairRuleLines` quad (because two separately-emitted `[CAPS K_X]`
lines would conflict, first-inserted silently winning under Layer-A Check #10), non-CAPS keys **append**
a `buildShiftRuleLines` assignment. The reasoning is documented at
[shiftRules.ts](../../packages/engine/src/pattern-apply/shiftRules.ts) L154–174.

**Rationale**: FR-003 and SC-005 both say "preserved" / "no regression". This branch is subtle, correct,
and Layer-A-load-bearing; the extraction must move it verbatim, not re-derive it. Neither the combo nor
the touch mechanism has a CAPS analogue, so `capsHandling` is physical-only in the shared type.

---

## Resolved unknowns summary

| # | Unknown | Resolution |
|---|---|---|
| R1 | How to share behavior across three galleries | Extract hook + banner; do not copy |
| R2 | Which file owns the combo mechanism | Two: MechanismGallery (S-02) + SequenceBuilderPanel (S-03) |
| R3 | What "case-shifted trigger" means | The **base/content letter**, not the accent trigger (spec corrected) |
| R4 | Multi-char sequence content | No proposal — not a confident case shift |
| R5 | How touch targets a layer | It cannot today; add a `layer` slot value + teach both appliers (spec's defect description corrected) |
| R6 | "Layer currently being edited" | New explicit `editingLayer`, `"default"` in v1, via one mapping helper |
| R7 | Missing target layer | Warn + skip, never fall back to `default` |
| R8 | Locked-contract impact | None — slot value, not schema; no content-team file |
| R9 | Re-raise semantics | Transient per apply; do not reuse `suggestionResolved` |
| R10 | CAPS branch | Moved verbatim, physical-only |

No **NEEDS CLARIFICATION** items remain.
