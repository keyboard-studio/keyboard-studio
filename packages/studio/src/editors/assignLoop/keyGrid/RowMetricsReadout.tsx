// RowMetricsReadout — what one row of the key grid measures, stated in the
// author's own numbers (spec 065 T025; FR-013, FR-014, FR-015, FR-037).
//
// ## What replaced what
//
// Spec 063 drew a row's unused width as a diagonal HATCH at the end of the row
// (`key-grid-row-slack-<rowIndex>`) — decorative, deliberately never a printed
// number. ADR 0002 withdrew that: the last key of a row now stretches to fill
// the remainder, exactly as KeymanWeb renders it, so there is no hatch left to
// draw and the gap has become a property of the last key rather than of the row.
// FR-013 asks for the information the hatch was gesturing at to be given
// PLAINLY instead: four numbers, printed, per row.
//
// This component occupies the row-actions strip
// (`key-grid-row-actions-<rowIndex>`) that "Fill row" / "Even out row" used to
// share. That container is retained rather than rebuilt because spec 063 SC-009
// made it a `role="row"` with an inner `role="gridcell"` — a bare `<div>` there
// fails axe's `aria-required-children` at CRITICAL impact on the grid itself.
// FR-038 forbids regressing that fix, so this readout renders INSIDE the
// existing gridcell and introduces no new grid child of its own.
//
// ## Declared, not rendered (FR-015)
//
// Every figure comes from `RowMetrics`, which sums DECLARED `width`/`pad`. The
// last key renders wider than its declared width — that is the stretch — so a
// readout quoting rendered widths would show a total that never matches what the
// author typed, and would make their own numbers look wrong. The distinction is
// stated to the author rather than left implicit: the width figure is labelled
// as declared, and the key property panel (T035) carries the same wording on its
// width field.
//
// ## The crowding complaint (FR-014)
//
// Rendered here, beside the numbers that explain it, rather than on a cell:
// crowding is a property of a ROW, and no single key is at fault. It is
// non-blocking and says so — `TOUCH_KEY_ROW_CROWDED` is a `warning` nothing
// gates on, and its detail copy tells the author they may leave it alone.
//
// The threshold is never restated here. `metrics.overMaximumBy` is present
// exactly when the row is over its platform's maximum, computed by the shared
// `computeRowMetrics` from the one table Layer C's check 18.3 also reads
// (contracts' `row-metrics.ts`, research D6). This component performs no
// threshold arithmetic at all, so it cannot drift from the hygiene check.
//
// ## No second validation cycle (FR-039)
//
// Nothing here validates. `metrics` arrives already computed on the row view
// model, which is built inside the existing 300 ms cycle (decision D3). This
// component reads it and prints it.

import { useLingui } from "@lingui/react/macro";
import type { RowMetrics } from "@keyboard-studio/engine";
import { TEXT_DIM, FONT } from "../../../lib/galleryTheme.ts";

export interface RowMetricsReadoutProps {
  /** 0-based, matching the view model; displayed +1, matching `aria-rowindex`. */
  readonly rowIndex: number;
  readonly metrics: RowMetrics;
}

/**
 * Round to at most one decimal place, then drop a trailing `.0`.
 *
 * Declared widths are usually whole numbers, but `remove` with the
 * "redistribute" outcome divides a freed width across the remaining keys, which
 * produces genuine fractions (`applyKeyEditsToLayout.ts`'s
 * `redistributeFreedWidth`). Printing those at full float precision would put
 * `133.33333333333331` in front of an author; rounding to a whole number would
 * make two visibly different rows read as identical. One decimal is the
 * granularity that shows the difference without showing the float.
 */
function formatUnits(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function RowMetricsReadout({ rowIndex, metrics }: RowMetricsReadoutProps) {
  const { t } = useLingui();
  const isCrowded = metrics.overMaximumBy !== undefined;

  return (
    <div
      data-testid={`key-grid-row-metrics-${rowIndex}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: FONT,
        fontSize: 11,
        color: TEXT_DIM,
      }}
    >
      <span>
        {t({
          id: "editor.assignLoop.keyGrid.rowMetrics.keys",
          message: `${metrics.interactiveKeyCount} keys`,
        })}
      </span>
      <span
        // "Declared" is load-bearing, not a hedge: the last key of this row
        // renders wider than the figure beside this word (FR-015).
        title={t({
          id: "editor.assignLoop.keyGrid.rowMetrics.width.title",
          message:
            "The widths you set. The last key in a row is drawn wider than this, stretching to match the widest row.",
        })}
      >
        {t({
          id: "editor.assignLoop.keyGrid.rowMetrics.width",
          message: `${formatUnits(metrics.keyWidthTotal)} declared width`,
        })}
      </span>
      <span>
        {t({
          id: "editor.assignLoop.keyGrid.rowMetrics.padding",
          message: `${formatUnits(metrics.padTotal)} padding`,
        })}
      </span>
      <span>
        {t({
          id: "editor.assignLoop.keyGrid.rowMetrics.total",
          message: `${formatUnits(metrics.rowTotal)} total`,
        })}
      </span>
      {isCrowded && (
        <span
          data-testid={`key-grid-row-crowded-${rowIndex}`}
          // Not `role="alert"`: this is ambient, re-rendered on every debounce
          // cycle for as long as the row stays crowded, and an assertive live
          // region firing on each cycle would talk over the author mid-edit.
          // The selected cell's own aria-live announcement (findingCopy.ts's
          // `findingAnnouncement`) is where a diagnostic gets spoken.
          style={{ color: "var(--app-warning-text)", fontWeight: 600 }}
        >
          {/* The word "Crowded" carries the signal; the amber is decoration
              only, so colour is never the sole carrier (accessibility rule 7). */}
          {t({
            id: "editor.assignLoop.keyGrid.rowMetrics.crowded",
            message: `Crowded — ${metrics.overMaximumBy} over the ${metrics.platformMaxKeys} that fit comfortably. You can leave it.`,
          })}
        </span>
      )}
    </div>
  );
}
