// Hardware key positions for the LDML export (spec 108, research R6).
//
// For each predefined hardware form (us, iso, jis, abnt2) this holds the
// main-block rows, each cell pairing a Keyman K_* vkey with its scan code. The
// shape (row count, cells per row, scan-code order) mirrors Keyman's
// scanCodes-implied.xml; positions.test.ts checks that. Rows and columns are
// zero-based; the last row is the spacebar. Frame keys are not part of any form.

export type LdmlForm = "us" | "iso" | "jis" | "abnt2";

export const LDML_FORMS: readonly LdmlForm[] = ["us", "iso", "jis", "abnt2"];

export interface KeyCell {
  readonly vkey: string;
  /** Scan code, as two uppercase hex digits (the spelling in scanCodes-implied.xml). */
  readonly scan: string;
}

export interface KeyPosition {
  readonly row: number;
  readonly column: number;
}

/** The key id LDML uses for the spacebar. */
export const SPACE_KEY_ID = "space";

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

const POSITIONS: Record<LdmlForm, ReadonlyMap<string, KeyPosition>> = (() => {
  const out = {} as Record<LdmlForm, ReadonlyMap<string, KeyPosition>>;
  for (const form of LDML_FORMS) {
    const m = new Map<string, KeyPosition>();
    FORM_ROWS[form].forEach((cells, row) => {
      cells.forEach((cell, column) => m.set(cell.vkey, { row, column }));
    });
    out[form] = m;
  }
  return out;
})();

/** The row and column of vkey on form, or undefined when the form has no such key. */
export function vkeyPosition(form: LdmlForm, vkey: string): KeyPosition | undefined {
  return POSITIONS[form].get(vkey);
}

/** Every main-block vkey on any form, in the table's spelling. */
export const MAIN_BLOCK_VKEYS: ReadonlySet<string> = new Set(
  LDML_FORMS.flatMap((f) => FORM_ROWS[f].flatMap((row) => row.map((cell) => cell.vkey))),
);
