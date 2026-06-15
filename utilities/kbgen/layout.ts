// Base layout model. Milestone 1 ships US QWERTY; the engine only ever talks to
// this through getLayout()/keyForChar(), so adding a different base (an Arabic 101
// layout, Tamil InScript, ...) later is a matter of adding another entry here.

// A layout is rows of keys. Each key has a Keyman virtual-key id (K_*), the
// character it produces unshifted (`lower`) and shifted (`upper`), and its grid
// position (row index 1..3, col index 0-based) used for tablet/desktop emission.
// The number row (row 0) lives in the numeric touch layer, not the letter grid.

export interface KeyEntry {
  key: string;
  lower: string;
  upper: string;
  row: number;
  col: number;
}

export interface Layout {
  id: string;
  name: string;
  rows: [string, string, string][][];
  keys: KeyEntry[];
  byChar: Map<string, KeyEntry>;
  byKey: Map<string, KeyEntry>;
}

const QWERTY: { id: string; name: string; rows: [string, string, string][][] } = {
  id: "us",
  name: "US QWERTY",
  rows: [
    // row 1
    [
      ["K_Q", "q", "Q"], ["K_W", "w", "W"], ["K_E", "e", "E"], ["K_R", "r", "R"],
      ["K_T", "t", "T"], ["K_Y", "y", "Y"], ["K_U", "u", "U"], ["K_I", "i", "I"],
      ["K_O", "o", "O"], ["K_P", "p", "P"],
    ],
    // row 2
    [
      ["K_A", "a", "A"], ["K_S", "s", "S"], ["K_D", "d", "D"], ["K_F", "f", "F"],
      ["K_G", "g", "G"], ["K_H", "h", "H"], ["K_J", "j", "J"], ["K_K", "k", "K"],
      ["K_L", "l", "L"],
    ],
    // row 3
    [
      ["K_Z", "z", "Z"], ["K_X", "x", "X"], ["K_C", "c", "C"], ["K_V", "v", "V"],
      ["K_B", "b", "B"], ["K_N", "n", "N"], ["K_M", "m", "M"],
    ],
  ],
};

export function getLayout(id?: string): Layout {
  if (id && id !== "us" && id !== "qwerty") {
    throw new Error(`Unknown base layout "${id}" (milestone 1 supports only "us"/"qwerty")`);
  }
  return buildIndex(QWERTY);
}

// Flatten the rows into lookup structures the rest of the engine uses.
function buildIndex(layout: { id: string; name: string; rows: [string, string, string][][] }): Layout {
  const keys: KeyEntry[] = [];
  const byChar = new Map<string, KeyEntry>();
  const byKey = new Map<string, KeyEntry>();
  layout.rows.forEach((row, r) => {
    row.forEach(([key, lower, upper], c) => {
      const entry: KeyEntry = { key, lower, upper, row: r + 1, col: c };
      keys.push(entry);
      byKey.set(key, entry);
      byChar.set(lower, entry);
      byChar.set(upper, entry);
    });
  });
  return { id: layout.id, name: layout.name, rows: layout.rows, keys, byChar, byKey };
}

// Map a single character to the key that produces it on the base layout, or null.
export function keyForChar(layout: Layout, ch: string): KeyEntry | null {
  return layout.byChar.get(ch) ?? null;
}
