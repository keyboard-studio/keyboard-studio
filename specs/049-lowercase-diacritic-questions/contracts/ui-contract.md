# Contract: identifiers for lowercase-only diacritic questions

The exact identifiers consumers and tests code against. Signatures reuse existing primitives; the only
new symbol is one engine helper. No `@keyboard-studio/contracts` type changes.

## Existing primitive reused (unchanged)

```ts
// packages/engine/src/character-discovery/casePair.ts  (already exported via @keyboard-studio/engine)
export function caseCounterpart(
  char: string,
  bcp47?: string,
): { counterpart: string; direction: "toUpper" | "toLower" } | null;
```

## Studio helpers — shared casing fold (FR-006 source of truth)

Added to `packages/studio/src/survey/charNormUtils.ts`, consumed by both the character step
(`PhaseB.tsx`, refactored from its inline `hiddenUppers`) and the marks step (`MarksSeriesStep.tsx`).

```ts
/** Uppercase bases whose lowercase counterpart is also present in `bases`. */
export function hiddenUppercaseBases(bases: string[], bcp47?: string): Set<string>;

/** `bases` with the hidden uppercases removed (order preserved) — the displayed choice list. */
export function lowercaseBaseView(bases: string[], bcp47?: string): string[];

/** Count of shown lowercase bases that have a present uppercase counterpart (the affordance count). */
export function casedBaseCount(bases: string[], bcp47?: string): number;
```

- Caseless / uppercase-only-without-lowercase input ⇒ `hiddenUppercaseBases` is empty,
  `lowercaseBaseView` returns `bases` unchanged, `casedBaseCount` is `0` (FR-004, SC-003).

## Engine helper — uppercase attachment expansion (FR-002 / US2)

New file `packages/engine/src/marks/case-fold.ts`, re-exported from `packages/engine/src/index.ts`.

```ts
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";

/**
 * Additively expand a per-mark/per-base attachment map so every checked cased base also checks its
 * uppercase counterpart when that counterpart is present in `alphabet.bases`. Reuses `caseCounterpart`;
 * introduces no new casing rule. Never clears an existing check (FR-007). Returns a new map.
 */
export function expandCaseCounterpartAttachments(
  alphabet: ConfirmedAlphabet,
  attachments: Record<string, Record<string, boolean>>,
  bcp47?: string,
): Record<string, Record<string, boolean>>;
```

## Component contract (unchanged surface)

`AttachmentStation` props are unchanged; the *values* passed change:

- `bases` ← `lowercaseBaseView(gate.alphabet.bases, bcp47)` (was `gate.alphabet.bases`).
- `casePairCount` ← `casedBaseCount(...)` (was `deriveCaseCounterparts(...).size`).
- Before `buildPlacementWorklist`, `MarksSeriesStep` passes `attachments` through
  `expandCaseCounterpartAttachments(...)`.

Test hooks unchanged: `data-testid="marks-attachment"`, `attachment-row-<U+xxxx>`, i18n id
`survey.marks.attachment.casePairsNote`.
