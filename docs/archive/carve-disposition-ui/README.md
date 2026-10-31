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

## Final disposition (as built)

The design is [specs/076-rule-behaviours/fallback-surface-design.md](../../../specs/076-rule-behaviours/fallback-surface-design.md)
(section 4); the as-built record is the amendment in
[specs/076-rule-behaviours/AS-BUILT.md](../../../specs/076-rule-behaviours/AS-BUILT.md). The per-carve
override (FR-019) is retired: one keyboard-wide `fallbackPolicy` replaces the per-combo
`carveDispositions` store and the closed-keyboard card.

| Piece | Final disposition | Where it lives now |
|---|---|---|
| `DispositionControl.tsx.txt` | Retired, not restored | - |
| `ReviewRemovedKeys.tsx.txt` | Adapted: "Review carved keys", no disposition column or verdict | `packages/studio/src/editors/carve/ReviewCarvedKeys.tsx` (button in the carve gallery status strip) |
| `CarvedHostConsequences.tsx.txt` | Adapted: `hostOutcomeText` reused for the global policy summary; per-row mount retired | `packages/studio/src/lib/carvedCombo.ts` (`hostOutcomeText`), table in `editors/fallback/FallbackPolicySection.tsx` |
| `CarveHostSelector.tsx.txt` | Retired | - |
| `carveDispositionCopy.ts.txt` | Adapted: the A2 principle (each option states its own risk) carries forward; Allow/Block copy retired | Copy inline in `FallbackPolicySection.tsx` (lingui ids `fallback.*`); standing rule enforced by `editors/fallback/retiredSlogan.test.ts` |
| `carvedCombo.ts.txt` | Adapted: comboId -> display row, disposition fields dropped | `packages/studio/src/lib/carvedCombo.ts` (`resolveCarvedCombos`) |
| `*.test.tsx.txt`, `CarveGalleryV2.removed-tests.tsx.txt` | Disposition tests retired; review-panel coverage adapted | `CarveGalleryV2.test.tsx` (review button, no fallback controls), `FallbackPolicySection.test.tsx` |
| `carve-disposition-flows.spec.ts.txt` | Retired | New e2e `packages/studio/e2e/fallback-policy.spec.ts` |

## Still live

- Engine carve suppression (`compileCarveSuppression`) is unchanged and still consumes
  `CarveDisposition` records, now generated from the policy by `dispositionsForFallbackPolicy`.
  The deadkey backstop (deadkey carves always suppress) and the behaviour-covered exclusion in
  `isInSwallowSet` stand.
- `LayoutFamilyQuestion.tsx`, `lib/layoutFamily.ts`, `lib/referenceBaseLayouts.ts`.

## Gone from the store

`carveDispositions`, `closedKeyboardCard`, `prefillCarveDispositions`, `setCarveDisposition`,
`pruneCarveDispositions`, `getCarveDispositions`, `bulkDispositionDefault` and
`isSparseLatinOverlayTarget`. Old drafts migrate on load (`survey/carve/fallbackPolicyMigration.ts`).

## How to restore

Not applicable: the per-row control is retired by decision, not parked. The archived files stay
as the historical record of what shipped and what the feedback rejected.
