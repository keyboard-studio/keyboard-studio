# Quickstart: validating the uppercase-counterpart suggestion

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Contracts**:
[case-pair-proposal.md](contracts/case-pair-proposal.md),
[touch-layer-targeting.md](contracts/touch-layer-targeting.md)

Runnable checks that prove the feature end-to-end. Each maps to a success criterion.

## Prerequisites

```
node --version      # must be >= 22.19.0 (see CLAUDE.md)
pnpm install
pnpm build          # runs prebuild (langtags/SLDR/exemplar codegen) first
```

The sibling `../keyboards` checkout is not required for these checks.

## 1. Engine: the casing primitive is untouched

```
pnpm --filter @keyboard-studio/engine test src/character-discovery/casePair.test.ts
```

**Expected**: all existing cases pass, unmodified. This feature adds no case to `casePair.ts`
(spec Out of scope). If this file's diff is non-empty, the "single casing source" invariant
([data-model.md](data-model.md) §Invariants 1) has been violated.

## 2. Engine: touch-layer targeting — SC-002's foundation

```
pnpm --filter @keyboard-studio/engine test src/pattern-apply/applyTouchAssignments.test.ts
pnpm --filter @keyboard-studio/engine test src/pattern-apply/applyTouchAssignmentsToRawJson.test.ts
```

**Expected**:
- Every **pre-existing** case passes with no edit to its input fixtures — that is the
  absent-`layer` === `"default"` compatibility guarantee, and it is the single most important
  regression signal in this feature.
- New cases: `layer: "shift"` lands on the shift layer with the default layer byte-identical; an
  unknown layer warns and skips without throwing and **without** falling back to `default`; two
  mechanisms on one character targeting different layers both apply.

## 3. Studio: the shared proposal hook

```
pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/casePairCompanion.test.ts
```

**Expected** (SC-001 suppression half, SC-004):
- Caseless input (`ا`, `क`), self-mapping (`ĸ` U+0138), and multi-character expansions (`ß`, `ﬃ`)
  raise **no** proposal.
- An uppercase input raises no proposal (lowercase→uppercase only).
- With identity `bcp47: "tr"`, `i` proposes `İ` — not `I`.
- A malformed `bcp47` degrades to locale-insensitive mapping rather than throwing.

## 4. Studio: all three mechanisms raise the proposal — SC-001, SC-003, SC-005

```
pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/MechanismGallery.test.tsx
pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/SequenceBuilderPanel.test.tsx
pnpm --filter @keyboard-studio/studio test src/editors/assignLoop/TouchGallery.test.tsx
```

**Expected**:
- **SC-005 (no regression)**: every existing MechanismGallery companion case passes without edits —
  the CAPS quad branch, the non-CAPS append branch, and the mnemonic-layout suppression.
- **SC-001**: a lowercase cased letter placed via physical key, dead key, sequence, and touch each
  raise one proposal for the capital on the casing-parallel slot.
- **SC-003**: confirming records exactly one uppercase placement; dismissing records nothing; a
  character carrying two mechanisms confirms against the placement that raised the proposal, not the
  other one; a proposal whose base assignment was removed before confirm records nothing.
- Multi-character sequence content (`ng`) raises no proposal.

## 5. Manual walkthrough — the reported defect, gone (SC-002)

```
pnpm dev            # engine watch + studio Vite dev server
```

Then, in the studio:

1. Instantiate a working copy on a **non-mnemonic** Latin base and reach the mechanism gallery with a
   lowercase cased letter in the inventory (e.g. `θ`, or `á`).
2. **Physical**: place it on a base-layer key via the swap method. The green case-pair banner offers the
   capital on that key's shift layer. Confirm → the capital is recorded on the shift layer, nothing
   else changes. Repeat and dismiss → nothing recorded.
3. **Dead key**: place an accented lowercase letter via the dead-key method. The banner offers the
   parallel combo. Confirm, then inspect the emitted rules in the preview pane: the **trigger key is
   unchanged** and the **base letter** is the capital — `dk(acute) + A > Á`. A shifted accent key here
   is the failure mode ([research.md](research.md) R3).
4. **Touch**: advance to the touch gallery with a decomposable accented lowercase letter (`á`).
   - The lowercase placement targets the **default** layer's key.
   - A separate banner offers `Á`; confirm it.
   - Inspect the generated `.keyman-touch-layout`: `á` is on the `default` layer's `K_A`, `Á` is on the
     `shift` layer's `K_A`. Neither is on the other's layer.
5. **The inverse case** (the half the spec did not describe, and the one that can regress — see
   [research.md](research.md) R5): place an accented **uppercase** letter (`Á`) directly. It must land
   on the `shift` layer, not `default`.
6. **Caseless**: place an Arabic or Devanagari letter on any of the three mechanisms. No banner appears.

## 6. Repo gates

```
pnpm typecheck
pnpm -r test
pnpm lint
```

`pnpm lint` includes `content-i18n-lint` and `i18n-catalog-lint`; new banner message ids must be
extracted into `packages/studio/src/locales/en/messages.po` in the same change, or the catalog lint
fails. Reused ids (`editor.assignLoop.companion.*`) must keep their existing English messages —
changing the wording of a shipped id orphans its translations.

## Done when

| Criterion | Proven by |
|---|---|
| SC-001 consistency across mechanisms | §3, §4, §5 steps 2–4, 6 |
| SC-002 touch casing defect gone | §2, §5 steps 4–5 |
| SC-003 independently confirmable, identity-tracked | §4 |
| SC-004 locale-sensitive casing | §3 |
| SC-005 no physical-key regression | §1, §2 existing cases, §4 existing cases |
