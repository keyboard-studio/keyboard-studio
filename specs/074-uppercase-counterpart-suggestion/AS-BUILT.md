# Spec 074 Uppercase Counterpart Suggestion: as built

**Status:** Retired 2026-09-29. Shipped in PR #1411 (squash `3f0c715b`, 2026-07-28), with the touch-layer routing and host-key label fixes in #1423 (`e3fe7b68`) and the manual QA close-out in #1654 (`6c4bd2ba`). Tasks: 55/55 complete.
**Full docs:** [specs/_archive/074-uppercase-counterpart-suggestion/](../_archive/074-uppercase-counterpart-suggestion/) (spec, plan, tasks, research, data-model, quickstart, both contracts). Not read by default.
**Pinned here:** [contracts/case-pair-proposal.md](contracts/case-pair-proposal.md) and [data-model.md](data-model.md) (cited by `@see` comments in `casePairCompanion.ts`, `casePairCompanion.test.ts`, `CasePairProposalBanner.tsx`; no non-spec doc links them).

## What shipped
- When an author places a lowercase cased letter, the studio proposes the uppercase counterpart; one tap confirms, one dismisses. It reads the same across all four placement mechanisms.
- Physical key: capital goes to the Shift or Caps slot of the same key (behaviour moved verbatim from the old MechanismGallery banner).
- Combo mechanisms: S-02 dead key and S-03 sequence get a parallel combo, and the RAlt-layer mechanism gets a counterpart on the Shift+RAlt slot of the same key.
- Touch: the proposed capital lands on the correct touch layer, and suggestion-Accept carries an explicit layer. Host-key labels are case-correct.

## Public contracts
- `packages/studio/src/editors/assignLoop/casePairCompanion.ts`: `useCasePairCompanion()` returns `{ proposal, propose, dismiss, clear }`; `propose(input)` is the only way to raise a proposal and calls `caseCounterpart(char, bcp47)` itself, so no caller supplies a counterpart. Types `CasePairProposal`, `CasePairProposalInput`, `CasePairCombo` (`DeadkeyCombo`, `SequenceCombo`). The mechanism union includes physical, combo, touch and `"ralt-layer"`.
- `CasePairProposalBanner.tsx` (`role="note"`, Confirm and Dismiss). Reuses the i18n ids `editor.assignLoop.companion.*`; mechanism wording ids are additive (`.prompt.combo`, `.prompt.touch`, `.prompt.raltLayer`).
- Touch `layer` slot: `MechanismRef.slotValues.layer` (a touch layer id such as `"default"`, `"shift"`). Absent means `"default"`, so old data is byte-identical. No `packages/contracts` type change. Producer: `buildTouchMechanismRef` (`TouchGallery.tsx:620`) via `touchLayerForChar` (`packages/engine/src/pattern-apply/touchLayer.ts:67`).
- Appliers `applyTouchAssignments` and `applyTouchAssignmentsToRawJson` (`packages/engine/src/pattern-apply/`) resolve the layer per mechanism; a missing target layer warns `[touch-apply] target layer "<id>" not found ...` and skips only that mechanism, never falling back to default.
- Casing source: `caseCounterpart` in `packages/engine/src/character-discovery/casePair.ts`. Physical rules: `buildCasePairRuleLines` in `pattern-apply/shiftRules.ts`.
- `hostKeyShortLabel(keyId, layer)` (`TouchGallery.tsx:352`) uppercases the keycap when the layer id includes shift or caps. Stored `slotValues.hostKey` stays the vkey name.

## Key decisions
- One hook and one banner for all mechanisms, so uniformity is structural (FR-011); one casing source, `caseCounterpart` (R1).
- For combos the case-shifted element is the base or content letter, not the dead-key trigger (an accent key has no case). Both the input side and the output side must shift (R3).
- No combo proposal when the input side is not a single cased character, because `ng` has two defensible capitalizations (R4).
- Touch had no layer concept at all; the `layer` slot plus applier changes are one capability serving FR-005 and FR-006 (R5, R7).
- Proposals are transient per apply: cleared on confirm, dismiss, or character change; a new apply legitimately re-raises (R9).
- CAPS logic on the physical path is untouched: caps-handling keys replace the base assignment with one combined rule quad, others append a shift assignment (Layer A check #10 forbids two `[CAPS K_X]` lines) (R10).

## Gotchas and limits
- Touch targets have since grown compound layers: the banner names its target via `targetLayerLabel` because a flattened layer id cannot be labelled back.
- `hostKeyShortLabel` deliberately leaves alt, ctrl, rightalt, rightctrl, leftctrl and ncaps layer ids without a case rule.
- Phone platform only; tablet is out of scope. No bulk "apply to all" control.

## Divergences from the spec
- Spec FR-004 and US2 say the parallel combo shifts the "trigger"; code shifts the base/content letter, as research R3 corrected.
- Spec FR-005 and FR-006 are treated as one missing capability (touch layer), not two separate fixes (R5).
- The banner prompt for touch is no longer always "the shift layer" (see `targetLayerLabel`, `casePairCompanion.ts`).

## Follow-ups and open issues
- Test files were split by concern in #1824 (`MechanismGallery.*.test.tsx`, `TouchGallery.*.test.tsx`); the archived tasks cite the old single-file paths.
- docs/spec-signoff.md:106 records the 2026-07-28 spec amendment; it is history and stays as written.
