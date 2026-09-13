/**
 * geometry — the fixed physical-grid table the desktop layout chart draws
 * against (spec 076 T047, research R2).
 *
 * `KvksIR` carries labels but no coordinates, and the IR-rule fallback carries
 * neither, so a fixed ANSI/ISO-style grid stands in for the physical keyboard
 * every hand-drawn corpus chart already simplifies down to: four rows (number,
 * top, top-most-letter/QWERTY, home, bottom), one entry per `K_`-named virtual
 * key. Units are key-widths (`1` = one standard 1u key); a renderer multiplies
 * by its own pixel scale, never bakes pixels in here.
 *
 * Deliberately RTL-agnostic: this is a description of PHYSICAL hardware, which
 * does not mirror for a right-to-left script the way an on-screen touch layout
 * can (spec 063's `direction`-aware `keyGridViewModel.ts` has no analogue
 * here) — there is exactly one declaration order, always read left-to-right in
 * this table regardless of the keyboard's own text direction.
 */

/** One key's position on the fixed desktop grid. */
export interface DesktopGeometryKey {
  /** The `K_`-named virtual key this slot renders (matches `IRRule` vkey context / `KvksIR` `vkey`). */
  readonly id: string;
  /** 0 = number row, 1 = top (QWERTY) row, 2 = home row, 3 = bottom row. */
  readonly row: number;
  /** Left edge, in key-width units. */
  readonly x: number;
  /** Width, in key-width units. */
  readonly width: number;
}

export const DESKTOP_ROW_NUMBER = 0;
export const DESKTOP_ROW_TOP = 1;
export const DESKTOP_ROW_HOME = 2;
export const DESKTOP_ROW_BOTTOM = 3;
export const DESKTOP_ROW_COUNT = 4;

/**
 * The fixed ANSI/ISO-style desktop grid. Every row's declared widths sum to
 * the same total extent ({@link DESKTOP_GEOMETRY_WIDTH}) so the chart's four
 * rows visually align, matching a real keyboard's staggered-but-flush rows.
 */
export const DESKTOP_GEOMETRY: readonly DesktopGeometryKey[] = [
  // Row 0 — number row (extent: 13 + 2 = 15).
  { id: "K_BKQUOTE", row: DESKTOP_ROW_NUMBER, x: 0, width: 1 },
  { id: "K_1", row: DESKTOP_ROW_NUMBER, x: 1, width: 1 },
  { id: "K_2", row: DESKTOP_ROW_NUMBER, x: 2, width: 1 },
  { id: "K_3", row: DESKTOP_ROW_NUMBER, x: 3, width: 1 },
  { id: "K_4", row: DESKTOP_ROW_NUMBER, x: 4, width: 1 },
  { id: "K_5", row: DESKTOP_ROW_NUMBER, x: 5, width: 1 },
  { id: "K_6", row: DESKTOP_ROW_NUMBER, x: 6, width: 1 },
  { id: "K_7", row: DESKTOP_ROW_NUMBER, x: 7, width: 1 },
  { id: "K_8", row: DESKTOP_ROW_NUMBER, x: 8, width: 1 },
  { id: "K_9", row: DESKTOP_ROW_NUMBER, x: 9, width: 1 },
  { id: "K_0", row: DESKTOP_ROW_NUMBER, x: 10, width: 1 },
  { id: "K_HYPHEN", row: DESKTOP_ROW_NUMBER, x: 11, width: 1 },
  { id: "K_EQUAL", row: DESKTOP_ROW_NUMBER, x: 12, width: 1 },
  { id: "K_BKSP", row: DESKTOP_ROW_NUMBER, x: 13, width: 2 },

  // Row 1 — top row (extent: 13.5 + 1.5 = 15).
  { id: "K_TAB", row: DESKTOP_ROW_TOP, x: 0, width: 1.5 },
  { id: "K_Q", row: DESKTOP_ROW_TOP, x: 1.5, width: 1 },
  { id: "K_W", row: DESKTOP_ROW_TOP, x: 2.5, width: 1 },
  { id: "K_E", row: DESKTOP_ROW_TOP, x: 3.5, width: 1 },
  { id: "K_R", row: DESKTOP_ROW_TOP, x: 4.5, width: 1 },
  { id: "K_T", row: DESKTOP_ROW_TOP, x: 5.5, width: 1 },
  { id: "K_Y", row: DESKTOP_ROW_TOP, x: 6.5, width: 1 },
  { id: "K_U", row: DESKTOP_ROW_TOP, x: 7.5, width: 1 },
  { id: "K_I", row: DESKTOP_ROW_TOP, x: 8.5, width: 1 },
  { id: "K_O", row: DESKTOP_ROW_TOP, x: 9.5, width: 1 },
  { id: "K_P", row: DESKTOP_ROW_TOP, x: 10.5, width: 1 },
  { id: "K_LBRKT", row: DESKTOP_ROW_TOP, x: 11.5, width: 1 },
  { id: "K_RBRKT", row: DESKTOP_ROW_TOP, x: 12.5, width: 1 },
  { id: "K_BKSLASH", row: DESKTOP_ROW_TOP, x: 13.5, width: 1.5 },

  // Row 2 — home row (extent: 12.75 + 2.25 = 15).
  { id: "K_CAPS", row: DESKTOP_ROW_HOME, x: 0, width: 1.75 },
  { id: "K_A", row: DESKTOP_ROW_HOME, x: 1.75, width: 1 },
  { id: "K_S", row: DESKTOP_ROW_HOME, x: 2.75, width: 1 },
  { id: "K_D", row: DESKTOP_ROW_HOME, x: 3.75, width: 1 },
  { id: "K_F", row: DESKTOP_ROW_HOME, x: 4.75, width: 1 },
  { id: "K_G", row: DESKTOP_ROW_HOME, x: 5.75, width: 1 },
  { id: "K_H", row: DESKTOP_ROW_HOME, x: 6.75, width: 1 },
  { id: "K_J", row: DESKTOP_ROW_HOME, x: 7.75, width: 1 },
  { id: "K_K", row: DESKTOP_ROW_HOME, x: 8.75, width: 1 },
  { id: "K_L", row: DESKTOP_ROW_HOME, x: 9.75, width: 1 },
  { id: "K_COLON", row: DESKTOP_ROW_HOME, x: 10.75, width: 1 },
  { id: "K_QUOTE", row: DESKTOP_ROW_HOME, x: 11.75, width: 1 },
  { id: "K_ENTER", row: DESKTOP_ROW_HOME, x: 12.75, width: 2.25 },

  // Row 3 — bottom row (extent: 12.25 + 2.75 = 15).
  { id: "K_SHIFT", row: DESKTOP_ROW_BOTTOM, x: 0, width: 2.25 },
  { id: "K_Z", row: DESKTOP_ROW_BOTTOM, x: 2.25, width: 1 },
  { id: "K_X", row: DESKTOP_ROW_BOTTOM, x: 3.25, width: 1 },
  { id: "K_C", row: DESKTOP_ROW_BOTTOM, x: 4.25, width: 1 },
  { id: "K_V", row: DESKTOP_ROW_BOTTOM, x: 5.25, width: 1 },
  { id: "K_B", row: DESKTOP_ROW_BOTTOM, x: 6.25, width: 1 },
  { id: "K_N", row: DESKTOP_ROW_BOTTOM, x: 7.25, width: 1 },
  { id: "K_M", row: DESKTOP_ROW_BOTTOM, x: 8.25, width: 1 },
  { id: "K_COMMA", row: DESKTOP_ROW_BOTTOM, x: 9.25, width: 1 },
  { id: "K_PERIOD", row: DESKTOP_ROW_BOTTOM, x: 10.25, width: 1 },
  { id: "K_SLASH", row: DESKTOP_ROW_BOTTOM, x: 11.25, width: 1 },
  { id: "K_RSHIFT", row: DESKTOP_ROW_BOTTOM, x: 12.25, width: 2.75 },
];

/** Widest row extent (in key-width units) across {@link DESKTOP_GEOMETRY} — every row sums to this. */
export const DESKTOP_GEOMETRY_WIDTH = 15;
