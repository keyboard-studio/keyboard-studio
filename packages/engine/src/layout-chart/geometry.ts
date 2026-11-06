/**
 * geometry — the fixed physical-grid table the desktop layout chart draws
 * against (spec 080 T047, research R2).
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

// ---------------------------------------------------------------------------
// Hardware form tables (shared with the LDML export)
// ---------------------------------------------------------------------------

/** The predefined hardware forms the LDML export targets. */
export type LdmlForm = "us" | "iso" | "jis" | "abnt2";

export interface KeyCell {
  readonly vkey: string;
  /** Scan code, as two uppercase hex digits (the spelling in scanCodes-implied.xml). */
  readonly scan: string;
}

const c = (vkey: string, scan: string): KeyCell => ({ vkey, scan });

const NUMBER_ROW: readonly KeyCell[] = [
  c("K_BKQUOTE", "29"), c("K_1", "02"), c("K_2", "03"), c("K_3", "04"), c("K_4", "05"),
  c("K_5", "06"), c("K_6", "07"), c("K_7", "08"), c("K_8", "09"), c("K_9", "0A"),
  c("K_0", "0B"), c("K_HYPHEN", "0C"), c("K_EQUAL", "0D"),
];
const TOP_LETTERS: readonly KeyCell[] = [
  c("K_Q", "10"), c("K_W", "11"), c("K_E", "12"), c("K_R", "13"), c("K_T", "14"),
  c("K_Y", "15"), c("K_U", "16"), c("K_I", "17"), c("K_O", "18"), c("K_P", "19"),
  c("K_LBRKT", "1A"), c("K_RBRKT", "1B"),
];
const HOME_LETTERS: readonly KeyCell[] = [
  c("K_A", "1E"), c("K_S", "1F"), c("K_D", "20"), c("K_F", "21"), c("K_G", "22"),
  c("K_H", "23"), c("K_J", "24"), c("K_K", "25"), c("K_L", "26"), c("K_COLON", "27"),
  c("K_QUOTE", "28"),
];
const BOTTOM_LETTERS: readonly KeyCell[] = [
  c("K_Z", "2C"), c("K_X", "2D"), c("K_C", "2E"), c("K_V", "2F"), c("K_B", "30"),
  c("K_N", "31"), c("K_M", "32"), c("K_COMMA", "33"), c("K_PERIOD", "34"), c("K_SLASH", "35"),
];
const BACKSLASH = c("K_BKSLASH", "2B");
const SPACE_ROW: readonly KeyCell[] = [c("K_SPACE", "39")];

export const FORM_ROWS: Readonly<Record<LdmlForm, readonly (readonly KeyCell[])[]>> = {
  us: [NUMBER_ROW, [...TOP_LETTERS, BACKSLASH], HOME_LETTERS, BOTTOM_LETTERS, SPACE_ROW],
  iso: [
    NUMBER_ROW,
    TOP_LETTERS,
    [...HOME_LETTERS, BACKSLASH],
    [c("K_oE2", "56"), ...BOTTOM_LETTERS],
    SPACE_ROW,
  ],
  abnt2: [
    NUMBER_ROW,
    TOP_LETTERS,
    [...HOME_LETTERS, BACKSLASH],
    [c("K_oE2", "56"), ...BOTTOM_LETTERS, c("K_oC1", "73")],
    SPACE_ROW,
  ],
  jis: [
    [...NUMBER_ROW, c("K_oE0", "7D")],
    TOP_LETTERS,
    [...HOME_LETTERS, BACKSLASH],
    [...BOTTOM_LETTERS, c("K_oE1", "73")],
    SPACE_ROW,
  ],
};

/**
 * Keys that exist only on some forms. A rule on one of these, exported to a form
 * without the key, has no position there.
 */
export const FORM_ONLY_KEYS: Readonly<Record<string, readonly LdmlForm[]>> = {
  K_oE2: ["iso", "abnt2"],
  K_oC1: ["abnt2"],
  K_oE0: ["jis"],
  K_oE1: ["jis"],
};

const FRAME_KEY_PATTERN =
  /^K_(F([1-9]|1\d|2[0-4])|NP[A-Z0-9_]*|NUMLOCK|SCROLL|PAUSE|LEFT|RIGHT|UP|DOWN|HOME|END|PGUP|PGDN|INS|DEL|ENTER|TAB|ESC)$/;

/** True for a key outside the layout block (TR35 non-goal; mapping row 2.5). */
export function isFrameKey(vkey: string): boolean {
  return FRAME_KEY_PATTERN.test(vkey);
}

// ---------------------------------------------------------------------------
// ISO desktop grid (Layout tab)
// ---------------------------------------------------------------------------

/** One key on the ISO desktop grid — a {@link DesktopGeometryKey} that also says whether the key sits outside the editable layout block. */
export interface DesktopIsoGeometryKey extends DesktopGeometryKey {
  /** True for keys that are not part of the layout block (Backspace, Tab, Enter, Caps, Shift, arrows): drawn, but never edited as layout cells. */
  readonly frame: boolean;
}

/** Row index of the space row in {@link DESKTOP_ISO_GEOMETRY}. */
export const DESKTOP_ISO_ROW_SPACE = 4;
export const DESKTOP_ISO_ROW_COUNT = 5;

const ISO_LAYOUT_BLOCK_VKEYS: ReadonlySet<string> = new Set(
  FORM_ROWS.iso.flatMap((row) => row.map((cell) => cell.vkey)),
);

/** Lay one row out left to right from `[id, width]` pairs. */
function isoRow(row: number, keys: readonly (readonly [string, number])[]): DesktopIsoGeometryKey[] {
  let x = 0;
  return keys.map(([id, width]) => {
    const key: DesktopIsoGeometryKey = {
      id,
      row,
      x,
      width,
      frame: isFrameKey(id) || !ISO_LAYOUT_BLOCK_VKEYS.has(id),
    };
    x += width;
    return key;
  });
}

/**
 * The ISO desktop grid: the same five physical rows as the `iso` hardware form
 * (number, top, home, bottom with `K_oE2`, space). ISO Enter is drawn on the top
 * row at the right edge (as a single-row cell; the real key is two rows tall), and
 * the home row's final slot is the ISO `K_BKSLASH` key, so the home row ends at
 * 13.75. The number, top, and bottom rows span {@link DESKTOP_GEOMETRY_WIDTH}.
 */
export const DESKTOP_ISO_GEOMETRY: readonly DesktopIsoGeometryKey[] = [
  ...isoRow(DESKTOP_ROW_NUMBER, [
    ["K_BKQUOTE", 1], ["K_1", 1], ["K_2", 1], ["K_3", 1], ["K_4", 1], ["K_5", 1], ["K_6", 1],
    ["K_7", 1], ["K_8", 1], ["K_9", 1], ["K_0", 1], ["K_HYPHEN", 1], ["K_EQUAL", 1], ["K_BKSP", 2],
  ]),
  ...isoRow(DESKTOP_ROW_TOP, [
    ["K_TAB", 1.5], ["K_Q", 1], ["K_W", 1], ["K_E", 1], ["K_R", 1], ["K_T", 1], ["K_Y", 1],
    ["K_U", 1], ["K_I", 1], ["K_O", 1], ["K_P", 1], ["K_LBRKT", 1], ["K_RBRKT", 1], ["K_ENTER", 1.5],
  ]),
  ...isoRow(DESKTOP_ROW_HOME, [
    ["K_CAPS", 1.75], ["K_A", 1], ["K_S", 1], ["K_D", 1], ["K_F", 1], ["K_G", 1], ["K_H", 1],
    ["K_J", 1], ["K_K", 1], ["K_L", 1], ["K_COLON", 1], ["K_QUOTE", 1], ["K_BKSLASH", 1],
  ]),
  ...isoRow(DESKTOP_ROW_BOTTOM, [
    ["K_SHIFT", 1.25], ["K_oE2", 1], ["K_Z", 1], ["K_X", 1], ["K_C", 1], ["K_V", 1], ["K_B", 1],
    ["K_N", 1], ["K_M", 1], ["K_COMMA", 1], ["K_PERIOD", 1], ["K_SLASH", 1], ["K_RSHIFT", 2.75],
  ]),
  // The modifier keys either side of the spacebar are not modelled; the bar sits at its physical offset.
  { id: "K_SPACE", row: DESKTOP_ISO_ROW_SPACE, x: 3.75, width: 6.25, frame: false },
];
