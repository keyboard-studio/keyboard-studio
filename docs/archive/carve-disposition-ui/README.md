# Archived: carve-gallery Allow/Block disposition UI (spec 076)

Archived 2026-09-29. Files here are renamed `*.txt` so tsc, ESLint, vitest, depcruise and
lingui extraction never see them (`docs/` is outside every scan root; `.txt` guards against
future globbing).

## What was removed from the carve gallery

- Per-row `DispositionControl` (Allow / Block / provenance label) - source in
  `DispositionControl.tsx.txt`.
- "Review removed keys (N)" header button and `ReviewRemovedKeysDialog` (`ReviewRemovedKeys.tsx.txt`).
- `CarvedHostConsequences` expanded row in the selected-character pane, `CarveHostSelector`
  (never mounted in live UI), `carveDispositionCopy.ts` (`DISPOSITION_COPY`, `hostOutcomeText`
  lives in `CarvedHostConsequences`), `carvedCombo.ts` (shared row type).
- The gallery-level `LayoutFamilyQuestion` band (the component file itself is still live in
  `packages/studio/src/editors/carve/`; the question moves to its own spine step before carve).
- Tests: co-located `*.test.tsx.txt`, `CarveGalleryV2.removed-tests.tsx.txt` (T025 + T016 cases
  cut from `CarveGalleryV2.test.tsx`), and the e2e `carve-disposition-flows.spec.ts.txt`.
- JSX mount snippets: see git history of `CarveGalleryV2.tsx` (commit that adds this archive).

## Why

User feedback: "the 'which keyboard layout does your community use' and the following popups
are entirely inappropriate during the carve gallery: 'Do your typists expect a character on this
key? Allow / Block / Key does something, but output varies by computer. / bulk default'. ... I
think the 'Do your typists...' question is a poor attempt at managing fallback characters. That
needs to go elsewhere." Then: "remove it for now to an archive file so we can reconsider it."

## Spec clauses it implemented

spec 076 FR-022 (T016 per-row control), FR-023 (T017 review panel, T018 host selector, T019
expanded consequence row, T025 layout_family question in the gallery). T020 (touch keycap
consequence, `TouchKeepInertControl`) was not part of this removal and is not mounted.

## Still live

- Store: `carveDispositions`, `closedKeyboardCard`, `prefillCarveDispositions`,
  `bulkDispositionDefault` in `workingCopyStore.ts`. The gallery still runs the pre-fill effect,
  so every carved combo gets a bulk-default disposition (deadkey carves -> block).
- Engine carve suppression reads those dispositions unchanged; contracts untouched.
- `LayoutFamilyQuestion.tsx`, `lib/layoutFamily.ts`, `lib/referenceHostLayouts.ts`.

## How to restore

1. `git mv` each `X.tsx.txt` back to `packages/studio/src/editors/carve/X.tsx` (e2e spec to
   `packages/studio/e2e/`; `carvedCombo.ts.txt` / `carveDispositionCopy.ts.txt` likewise).
2. Paste `DispositionControl.tsx.txt` back into `CarveGalleryV2.tsx` (needs
   `bulkDispositionDefault`, `CarveDispositionValue/Provenance` imports, `DISPOSITION_COPY`),
   add back the `sparseLatinOverlay` / `deadkeyComboIds` props on `RecommendedGroupCard`, render
   `<DispositionControl comboIds={recommendedRowIds(row)} .../>` under each row's
   `CharacterCellButton`, and re-add the `reviewOpen` state, `carvedCombos` memo
   (`resolveCarvedCombos`), header button, dialog mount and `CarvedHostConsequences` mount
   (see `git log -p` on `CarveGalleryV2.tsx`).
3. Restore the removed test cases from `CarveGalleryV2.removed-tests.tsx.txt`.
