// panelGrid — the compact label/control geometry the key-mode detail column is
// built from (spec 065; issue #1530 complaint "the key panel is not visible
// alongside the keyboard").
//
// ## Why this exists
//
// `KeyPropertyPanel` and the `KeyInspector` it composes both used a stack of
// `{ label above, value below }` rows with an explanatory sentence under each.
// Read on its own that is a friendly form; stacked twenty deep beside a
// keyboard it is a column two screens tall, so the panel and the grid could
// never be on screen together — and a property panel you have to scroll away
// from the key you are editing is the defect, not a style preference.
//
// Keyman Developer's own key-properties pane is the reference: labels in a
// narrow right-aligned column, controls in the column beside them, one short
// row each. This module is that geometry, shared so the two components' rows
// line up as one table rather than two similar-looking lists.
//
// ## Why a shared style object and not a shared <Row> component
//
// The label and the control are SIBLINGS in one grid, not a wrapped pair — that
// is what makes the labels align. A `<Row>` component returning a fragment
// would work, but it would also have to forward `htmlFor`/`aria-describedby`
// wiring for every control shape (text field, dropdown, plain text, button
// group) and would end up a worse `<label>`. Exporting the geometry and letting
// each call site place its own two children keeps the a11y wiring where the
// control is.
//
// ## Hints are revealed by focus, never removed
//
// The per-field explanations stay in the DOM at all times and stay referenced
// by `aria-describedby`, so a screen-reader user hears them exactly as before.
// They are only VISUALLY collapsed until the field they describe has focus —
// which is when a sighted author is actually reading them. See
// {@link visuallyHiddenUnless}.

import type { CSSProperties } from "react";
import { TEXT_DIM, FONT } from "../../../lib/galleryTheme.ts";

/**
 * The two-column geometry: a narrow label column and a control column that
 * takes the rest. `minmax(0, 1fr)` on the control column (not a bare `1fr`) so
 * a long value or a wide dropdown trigger shrinks instead of forcing the whole
 * panel wider than its container.
 *
 * The same declaration is used by every panel in the detail column so the
 * columns land in the same place in each — see this module's doc for why that
 * is a shared constant rather than a shared component.
 */
export const PANEL_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(68px, 38%) minmax(0, 1fr)",
  columnGap: 8,
  rowGap: 5,
  alignItems: "center",
};

/** A heading or note that spans both columns. */
export const PANEL_SPAN_STYLE: CSSProperties = { gridColumn: "1 / -1" };

/** The label column's text: small, dim, right-aligned against its control. */
export const PANEL_LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  color: TEXT_DIM,
  fontFamily: FONT,
  textAlign: "right",
  alignSelf: "center",
};

/** A section heading inside a panel grid (e.g. "Properties", "Size"). */
export const PANEL_SECTION_STYLE: CSSProperties = {
  ...PANEL_SPAN_STYLE,
  fontSize: 10,
  color: TEXT_DIM,
  fontFamily: FONT,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: 4,
};

/** Small print in the control column — a hint, a note, a reason. */
export const PANEL_HINT_STYLE: CSSProperties = {
  fontSize: 11,
  color: TEXT_DIM,
  fontFamily: FONT,
  lineHeight: 1.35,
};

/**
 * Collapse an element visually while leaving it in the accessibility tree and
 * in the DOM, so an `aria-describedby` pointing at it keeps working.
 *
 * The standard clip-rect recipe (as used by `KeyGrid.tsx`'s own live region),
 * applied conditionally: pass `visible: true` and the element renders normally.
 * A hint must never be *removed* from the DOM to hide it — that would silently
 * drop the description a control still claims to have.
 */
export function visuallyHiddenUnless(visible: boolean): CSSProperties {
  if (visible) return {};
  return {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
  };
}
