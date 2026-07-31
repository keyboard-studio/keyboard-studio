# Contract: the shared case-pair proposal (studio UI)

**Feature**: [../spec.md](../spec.md) · **Data model**: [../data-model.md](../data-model.md)

This is the interface the three placement mechanisms share so FR-011 ("the interaction reads
identically regardless of mechanism") holds structurally rather than by convention. Consumers are
`MechanismGallery` (physical + S-02 dead key), `SequenceBuilderPanel` (S-03, via a callback into
MechanismGallery's hook), and `TouchGallery`.

## `useCasePairCompanion` — the hook

**Location**: `packages/studio/src/editors/assignLoop/casePairCompanion.ts`

```ts
function useCasePairCompanion(): {
  /** The pending proposal, or null. At most one at a time. */
  proposal: CasePairProposal | null;

  /**
   * Build and raise a proposal, or do nothing when the mechanism's
   * suppression conditions hold. Returns whether a proposal was raised.
   * The ONLY entry point — callers never construct a proposal literal.
   */
  propose: (input: CasePairProposalInput) => boolean;

  /** Clear without recording anything. */
  dismiss: () => void;

  /** Clear (the caller performs the record; see the apply contracts below). */
  clear: () => void;
};
```

### Behavioural contract

| Rule | Detail |
|---|---|
| **Single casing source** | `propose` calls `caseCounterpart(char, bcp47)` itself. Callers pass the placed character and never a counterpart. A `null` result, or `direction !== "toUpper"`, returns `false` and raises nothing. |
| **Locale** | `bcp47` is read from `useWorkingCopyStore((s) => s.identity?.bcp47)` inside the hook, normalizing `""` → `undefined` — the same normalization MechanismGallery does today (FR-009). Callers do not pass a locale. |
| **At most one** | A second `propose` while one is pending replaces it. |
| **Clear on character change** | The hook clears when the caller's current character changes (caller passes it, or calls `clear()` from its existing reset effect). |
| **Never applies** | The hook records nothing, ever. Confirm handlers live in the galleries, which own their apply paths (FR-001). |
| **Stale base** | Confirm handlers must verify the base object is still present before recording; if absent, `clear()` and record nothing (FR-008). |

`CasePairProposalInput` is the same discriminated union as `CasePairProposal` minus `counterpart` —
the hook supplies that field, so no caller can smuggle in a locally-derived capital.

## `CasePairProposalBanner` — the affordance

**Location**: `packages/studio/src/editors/assignLoop/CasePairProposalBanner.tsx`

```ts
interface CasePairProposalBannerProps {
  proposal: CasePairProposal;
  onConfirm: () => void;
  onDismiss: () => void;
}
```

| Rule | Detail |
|---|---|
| Structure | `role="note"`, one prompt line, Confirm + Dismiss buttons — the existing MechanismGallery banner (L2966–3050), lifted verbatim including its styling. |
| i18n | Keeps the shipped ids `editor.assignLoop.companion.ariaLabel`, `.prompt`, `.confirmButton`, `.declineButton`, `.confirmAriaLabel`, `.declineAriaLabel`. Ids are permanent handles — reuse, do not rename (spec §18 / i18n conventions). |
| Per-mechanism wording | The prompt names the parallel slot ("the shift layer of the same key" / "the uppercase combo" / "the shift layer"). New mechanism-specific ids are additive: `editor.assignLoop.companion.prompt.combo`, `.prompt.touch`. The physical id keeps its current message so its existing translations survive. |
| No new controls | No "apply to all", no third button (spec Out of scope: bulk actions). |

## Confirm contracts, per mechanism

Each gallery owns its record step and must apply it to **exactly** the raising placement.

### Physical (FR-003, FR-010) — unchanged behavior

Moved verbatim from `handleCompanionConfirm`:

- `capsHandling === true` → **replace** the base assignment (by index found via
  `indexOf(baseAssignment)`) with one combined `buildCasePairRuleLines(vkey, originalChar, counterpart,
  { capsHandling: true })` assignment. Two separately-emitted `[CAPS K_X]` lines would conflict,
  first-inserted silently winning (Layer-A Check #10).
- `capsHandling === false` → **append** a `buildShiftRuleLines(vkey, counterpart, { capsHandling: false
  })` assignment targeting `counterpart`.
- Suppressed entirely when `!shiftLayerAllowed` (mnemonic) — enforced at `propose` time, not confirm.

### Combo (FR-004)

Appends a parallel `MechanismRef` to the same assignment shape the source mechanism uses, with the
input side and output side both case-shifted through `caseCounterpart`:

- **S-02**: a `PATTERN_DEADKEY` ref with `triggerKey` / `deadkeyName` / `accentChar` unchanged,
  `baseLetters` = uppercased base letter, `accentedForms` = `counterpart`.
- **S-03**: a `PATTERN_SEQUENCE` ref appended to `char`'s sequence bucket via
  `partitionSequenceAssignment`, with `secondLetter` unchanged, `firstLetterOut` = uppercased content,
  `collapsedChar` = `counterpart`. The existing `(firstLetterOut, secondLetter)` dedup applies — an
  already-recorded parallel combo is a no-op, not a duplicate ref.
- The trigger / indicator is **never** case-shifted (see [../research.md](../research.md) R3).
- No proposal when the input side is not a single cased character with a non-null counterpart
  ([../research.md](../research.md) R4).

### Touch (FR-005)

Appends a touch ref for `counterpart` via `appendMechanismToChar`, carrying the same `hostKey` and
`layer: targetLayer` (`casePairTouchTarget(editingCombo, isComboInUse).layer`). Because the counterpart is a different
character, this creates its own `charTouch` entry and cannot interact with the source character's
`touch_inherited` exclusivity rules.

## Dismiss contract

`onDismiss` records nothing and clears. The proposal is not re-raised for that placement; a subsequent
*new* apply for the same character is a new placement and may raise a new proposal
([../research.md](../research.md) R9).

## Test surface

| Assertion | Where |
|---|---|
| `propose` returns `false` and raises nothing for caseless / self-mapping / multi-char-expansion input | `casePairCompanion.test.ts` |
| `propose` uses the identity bcp47 (`tr`: `i` → `İ`) | `casePairCompanion.test.ts` |
| Physical confirm: CAPS quad vs. append branches | `MechanismGallery.test.tsx` (existing cases must still pass) |
| Physical: mnemonic layout raises nothing | `MechanismGallery.test.tsx` (existing) |
| Combo confirm records the parallel ref; trigger/indicator unchanged | `MechanismGallery.test.tsx`, `SequenceBuilderPanel.test.tsx` |
| Multi-char sequence content raises nothing | `SequenceBuilderPanel.test.tsx` |
| Touch confirm records `layer: "shift"` for the counterpart | `TouchGallery.test.tsx` |
| Confirm applies to the raising placement when a character has multiple mechanisms | `MechanismGallery.test.tsx` |
| Stale base (removed before confirm) records nothing | `MechanismGallery.test.tsx` |
