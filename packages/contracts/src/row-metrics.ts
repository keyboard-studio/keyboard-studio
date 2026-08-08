/**
 * row-metrics — the ONE statement of what a touch-layout row measures, and the
 * ONE table of how many interactive keys a platform's row may carry
 * (spec 061 T019; FR-013, FR-014, research D6).
 *
 * ## Why this lives in contracts and not in engine
 *
 * tasks.md T019 names `packages/engine/src/pattern-apply/rowMetrics.ts` as this
 * module's home and T022 asks `@keymanapp/keyboard-lint`'s check 18.3 to read
 * the threshold table from it. Those two sentences cannot both be honoured with
 * the table in engine: `.dependency-cruiser.cjs`'s `lint-not-to-engine` rule
 * forbids Layer C importing engine at all, so an engine-homed table would fail
 * `pnpm lint` the moment the check imported it.
 *
 * Contracts is the only package Layer C, engine and the studio can all reach —
 * the same forced placement `touch-key-diagnostics.ts` and `touch-key-rule-join.ts`
 * already have, for exactly the same reason and documented in exactly the same
 * terms. `packages/engine/src/pattern-apply/rowMetrics.ts` re-exports every
 * symbol below, so T019's "export it from the engine index, the studio's only
 * sanctioned door" holds unchanged; the studio never imports this file directly.
 *
 * ## The threshold table had three copies. This is now the only one.
 *
 * Before this module the phone-10 / tablet-13 pair was written out in:
 *
 *   1. `keyboard-lint/src/checks/check-18-3-keys-per-row.ts` — the original,
 *      the calibrated one, and the reason the numbers are what they are;
 *   2. `studio/.../keyGrid/RemoveKeyDialog.tsx` — restated with a comment
 *      admitting the duplication and asking a future reader to keep them in
 *      sync by hand.
 *
 * A third copy inside the new edit-time diagnostic is what research D6 set out
 * to prevent. Both existing copies now import from here, so "the thresholds the
 * hygiene check uses" and "the thresholds the editor complains at" are the same
 * two numbers by construction rather than by diligence.
 *
 * `desktop` is deliberately absent, not set to Infinity: check 18.3 has no rule
 * for it, and a platform with no entry is *unruled*, which
 * {@link platformMaxKeysPerRow} expresses as `undefined`. Writing a sentinel
 * number would make "no rule" and "a very large rule" indistinguishable at every
 * call site.
 *
 * ## Declared widths, not rendered ones (FR-015)
 *
 * Every total here sums a key's DECLARED `width`/`pad` (defaulted), never the
 * width it happens to render at. That distinction is the whole of FR-015: the
 * last key of a row renders stretched to the layer maximum, so its rendered
 * width exceeds its declared one, and a metrics readout that quietly reported
 * the rendered figure would make the declared width look wrong. The row totals
 * below are therefore what the AUTHOR wrote, which is the only figure an author
 * can act on.
 */

import { isSpacerKeyClass } from "./touch-coverage";

// ---------------------------------------------------------------------------
// Geometry defaults
// ---------------------------------------------------------------------------

/**
 * Default key width (percent-like units) when `TouchKeyIR.width` is absent.
 *
 * The studio's `keyGridViewModel.ts` originated these two constants and still
 * re-exports them under the same names, so no existing import site moved. They
 * live here now because the engine-side appliers (spec 061 T021) must write the
 * same defaults a newly added key is measured against, and an applier cannot
 * import the studio.
 */
export const DEFAULT_KEY_WIDTH_PCT = 100;

/** Default left padding (percent-like units) when `TouchKeyIR.pad` is absent. */
export const DEFAULT_KEY_PAD_PCT = 15;

// ---------------------------------------------------------------------------
// The threshold table
// ---------------------------------------------------------------------------

/**
 * Maximum interactive keys per row, by touch platform id — the single source
 * for check 18.3 (`KM_WARN_TOUCH_KEYS_PER_ROW`), the edit-time
 * `TOUCH_KEY_ROW_CROWDED` finding, and the remove dialog's crowding proposal.
 *
 * Read it through {@link platformMaxKeysPerRow} rather than indexing directly,
 * so an unknown platform id resolves to "unruled" in one place.
 */
export const PLATFORM_MAX_KEYS_PER_ROW: Readonly<Record<string, number>> = {
  phone: 10,
  tablet: 13,
  // desktop: no rule — see the module doc.
};

/** The platform's per-row maximum, or `undefined` when the platform is unruled. */
export function platformMaxKeysPerRow(platform: string): number | undefined {
  return PLATFORM_MAX_KEYS_PER_ROW[platform];
}

// ---------------------------------------------------------------------------
// Counting and measuring
// ---------------------------------------------------------------------------

/**
 * The geometry a row metric needs from a key. Structurally satisfied by both
 * `TouchKeyIR` and the studio's `KeyGridCellViewModel` — deliberately, so the
 * engine-side diagnostic and the studio-side readout measure through one
 * function instead of two that agree today.
 */
export interface RowMetricKey {
  readonly sp?: number | undefined;
  readonly width?: number | undefined;
  readonly pad?: number | undefined;
}

/**
 * Interactive keys in a row — everything except the blank (`sp:9`) and spacer
 * (`sp:10`) classes, via the canonical {@link isSpacerKeyClass} predicate and
 * never a local literal set.
 *
 * Using the predicate is what makes the all-blank-row edge case correct without
 * a special case: a row of nothing but spacers counts zero interactive keys and
 * therefore can never exceed any maximum, however many spacers it holds.
 */
export function countInteractiveRowKeys(keys: readonly RowMetricKey[]): number {
  return keys.filter((key) => !isSpacerKeyClass(key.sp)).length;
}

/**
 * What one row measures. `platformMaxKeys` and `overMaximumBy` are both absent
 * on an unruled platform, and `overMaximumBy` is absent on a ruled platform the
 * row is within — so a consumer testing `overMaximumBy !== undefined` is asking
 * exactly "is this row crowded", with no threshold arithmetic of its own.
 */
export interface RowMetrics {
  /** Non-spacer keys — the count the platform maximum applies to. */
  readonly interactiveKeyCount: number;
  /** Sum of declared `width` across every key, spacers included (they occupy space). */
  readonly keyWidthTotal: number;
  /** Sum of declared `pad` across every key. */
  readonly padTotal: number;
  /** `keyWidthTotal + padTotal` — the row's declared extent. */
  readonly rowTotal: number;
  /** Absent when the platform is unruled. */
  readonly platformMaxKeys?: number;
  /** `interactiveKeyCount - platformMaxKeys` when positive; absent otherwise. */
  readonly overMaximumBy?: number;
}

/**
 * Measure one row against its platform.
 *
 * Pure and allocation-light: a single pass, no I/O, no throw — so it is safe to
 * call inside the studio's existing 300 ms validation `useMemo` (decision D3,
 * FR-039) without introducing a timer of its own.
 */
export function computeRowMetrics(
  keys: readonly RowMetricKey[],
  platform: string,
): RowMetrics {
  let keyWidthTotal = 0;
  let padTotal = 0;
  for (const key of keys) {
    keyWidthTotal += key.width ?? DEFAULT_KEY_WIDTH_PCT;
    padTotal += key.pad ?? DEFAULT_KEY_PAD_PCT;
  }

  const interactiveKeyCount = countInteractiveRowKeys(keys);
  const platformMaxKeys = platformMaxKeysPerRow(platform);
  const overBy =
    platformMaxKeys === undefined ? 0 : interactiveKeyCount - platformMaxKeys;

  return {
    interactiveKeyCount,
    keyWidthTotal,
    padTotal,
    rowTotal: keyWidthTotal + padTotal,
    ...(platformMaxKeys !== undefined ? { platformMaxKeys } : {}),
    ...(overBy > 0 ? { overMaximumBy: overBy } : {}),
  };
}
