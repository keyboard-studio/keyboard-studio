// Hardware key positions for the LDML export (spec 108, research R6).
//
// For each predefined hardware form (us, iso, jis, abnt2) this holds the
// main-block rows, each cell pairing a Keyman K_* vkey with its scan code. The
// shape (row count, cells per row, scan-code order) mirrors Keyman's
// scanCodes-implied.xml; positions.test.ts checks that. Rows and columns are
// zero-based; the last row is the spacebar. Frame keys are not part of any form.

import { FORM_ONLY_KEYS, FORM_ROWS, isFrameKey, type KeyCell, type LdmlForm } from "../../layout-chart/geometry.js";

export const LDML_FORMS: readonly LdmlForm[] = ["us", "iso", "jis", "abnt2"];

export interface KeyPosition {
  readonly row: number;
  readonly column: number;
}

/** The key id LDML uses for the spacebar. */
export const SPACE_KEY_ID = "space";

// The form tables live in layout-chart/geometry.ts (one copy); re-exported here for the export code.
export { FORM_ONLY_KEYS, FORM_ROWS, isFrameKey };
export type { KeyCell, LdmlForm };

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
