// ISO position → Keyman vkey mapping for the CLDR legacy (43.1) importer
// (issue #2599).
//
// CLDR legacy keyboards key their maps by ISO position (`iso="D01"`), rows
// E/D/C/B/A, columns counted from the left starting at 1 (row E starts at 00).
// The table below is grounded in the exporter's scan-code position tables
// (`ldml-export/lower/positions.ts`, spec 108 research R6): the CLDR grid and
// the scan-code grid count the same physical keys in the same order, so a
// CLDR position and a scan-code cell in the same (row, column) name the same
// vkey. Cross-checked against real 43.1 files (de/en/fr windows, de android):
//   - E00–E12, D01–D12, C01–C12, B00–B10, A03 occur in those files.
//   - B00 is the 102nd key (`K_oE2`) — German `<` left of Z.
//   - The backslash vkey `K_BKSLASH` is the 13th top-row key on the US form
//     (`D13`) and the 12th home-row key on the ISO form (`C12`); both spellings
//     map here because a file describes one physical form. A file that lists
//     both positions for the same modifier set is a collision — the importer
//     reports it and the first map wins.
// Positions with no Keyman equivalent on a desktop form are absent from this
// table and are reported as skipped by the importer, never silently dropped:
//   - A00/A01/A02/A04/A05 (space-row neighbours — touch-only positions),
//   - B12 (occurs only in Android 600dpi tablet files — touch-only),
//   - C13 (occurs nowhere in the 43.1 corpus).
// B11/E13 are form-dependent and live in isoToVkey, not here.

/**
 * Keyman vkey for a CLDR ISO position, or undefined when the position has no
 * desktop-form equivalent (touch-only or form-extra positions — see above).
 *
 * Two positions are form-dependent (corpus survey, 2026-11-08, all 576
 * files): `B11` is the ABNT2 extra key (`K_oC1`) on `pt` files and the JIS
 * extra key (`K_oE1`) on `ja` files — same scan code (0x73), different vkey
 * names on different regional forms; `E13` is the JIS number-row extra
 * (`K_oE0`) and occurs only on `ja` files. Pass `form` for those; without
 * it they are unmapped.
 */
export function isoToVkey(
  iso: string,
  form?: "abnt2" | "jis",
): string | undefined {
  const upper = iso.toUpperCase();
  if (upper === "B11") {
    return form === "abnt2" ? "K_oC1" : form === "jis" ? "K_oE1" : undefined;
  }
  if (upper === "E13") {
    return form === "jis" ? "K_oE0" : undefined;
  }
  return ISO_TO_VKEY[upper];
}

/**
 * Regional hardware form for a CLDR locale tag (`pt-…` → ABNT2, `ja-…` →
 * JIS), used only for the form-dependent positions above. Any other locale
 * is form-neutral.
 */
export function formForLocale(locale: string): "abnt2" | "jis" | undefined {
  const base = locale.split("-")[0]?.toLowerCase();
  if (base === "pt") return "abnt2";
  if (base === "ja") return "jis";
  return undefined;
}

const ISO_TO_VKEY: Readonly<Record<string, string>> = {
  // Number row: E00 grave, E01–E10 digits, E11 hyphen, E12 equals.
  E00: "K_BKQUOTE",
  E01: "K_1",
  E02: "K_2",
  E03: "K_3",
  E04: "K_4",
  E05: "K_5",
  E06: "K_6",
  E07: "K_7",
  E08: "K_8",
  E09: "K_9",
  E10: "K_0",
  E11: "K_HYPHEN",
  E12: "K_EQUAL",
  // Top letter row.
  D01: "K_Q",
  D02: "K_W",
  D03: "K_E",
  D04: "K_R",
  D05: "K_T",
  D06: "K_Y",
  D07: "K_U",
  D08: "K_I",
  D09: "K_O",
  D10: "K_P",
  D11: "K_LBRKT",
  D12: "K_RBRKT",
  D13: "K_BKSLASH",
  // Home row.
  C01: "K_A",
  C02: "K_S",
  C03: "K_D",
  C04: "K_F",
  C05: "K_G",
  C06: "K_H",
  C07: "K_J",
  C08: "K_K",
  C09: "K_L",
  C10: "K_COLON",
  C11: "K_QUOTE",
  C12: "K_BKSLASH",
  // Bottom row: B00 is the ISO 102nd key.
  B00: "K_oE2",
  B01: "K_Z",
  B02: "K_X",
  B03: "K_C",
  B04: "K_V",
  B05: "K_B",
  B06: "K_N",
  B07: "K_M",
  B08: "K_COMMA",
  B09: "K_PERIOD",
  B10: "K_SLASH",
  // Space row: only the spacebar itself has a desktop vkey.
  A03: "K_SPACE",
};

/** The ISO rows in display order (top to bottom), for touch-row synthesis. */
export const ISO_ROWS_IN_ORDER: readonly string[] = ["E", "D", "C", "B", "A"];

// ---------------------------------------------------------------------------
// `modifiers` attribute expansion (TR35 syntax, issue #2599 ruling §6)
// ---------------------------------------------------------------------------

/**
 * One concrete modifier set from a `modifiers` attribute, as KMN modifier
 * words in canonical order (SHIFT, CTRL/LCTRL/RCTRL, ALT/LALT/RALT, CAPS).
 * `skipped` names alternatives that could not be expressed (e.g. any
 * alternative containing `cmd`, which has no KMN equivalent).
 */
export interface ExpandedModifiers {
  sets: string[][];
  skipped: string[];
}

/** Map one CLDR modifier token to its KMN word, or null when unmappable. */
function cldrModifierToKmn(token: string): string | null {
  switch (token) {
    case "shift":
    case "shiftL":
    case "shiftR":
      return "SHIFT";
    case "caps":
      return "CAPS";
    case "ctrl":
      return "CTRL";
    case "ctrlL":
      return "LCTRL";
    case "ctrlR":
      return "RCTRL";
    case "alt":
      return "ALT";
    case "altL":
    case "optL":
      return "LALT";
    case "altR":
    case "opt":
    case "optR":
      // macOS Option ≡ right Alt on the desktop half (ruling §6). Android `opt`
      // keyMaps never reach this function — they are touch symbol layers.
      return "RALT";
    default:
      return null;
  }
}

/** Canonical KMN modifier order (matches the codec's bracket spelling). */
const MODIFIER_ORDER: readonly string[] = [
  "SHIFT",
  "LCTRL",
  "RCTRL",
  "CTRL",
  "LALT",
  "RALT",
  "ALT",
  "CAPS",
];

/**
 * Expand a CLDR `modifiers` attribute value into concrete KMN modifier sets.
 *
 * TR35 syntax: space-separated alternatives; each alternative is a `+`-joined
 * combination; a trailing `?` marks a token optional. `undefined` (no
 * attribute) is the base layer — one empty set. Optional tokens are dropped:
 * a KMN rule with no caps flag fires in both caps states, so `caps?` adds no
 * constraint. An alternative containing an unmappable token (`cmd`, ...) is
 * skipped whole and named in `skipped`.
 */
export function expandModifiers(modifiers: string | undefined): ExpandedModifiers {
  if (modifiers === undefined || modifiers.trim() === "") {
    return { sets: [[]], skipped: [] };
  }
  const sets: string[][] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const alternative of modifiers.trim().split(/\s+/)) {
    const words: string[] = [];
    let unmappable = false;
    for (const rawToken of alternative.split("+")) {
      const token = rawToken.endsWith("?") ? rawToken.slice(0, -1) : rawToken;
      // An optional token adds no constraint — it is simply absent from the
      // emitted set (see the docstring). A REQUIRED token must map.
      if (rawToken.endsWith("?")) continue;
      const word = cldrModifierToKmn(token);
      if (word === null) {
        unmappable = true;
        break;
      }
      if (!words.includes(word)) words.push(word);
    }
    if (unmappable) {
      skipped.push(alternative);
      continue;
    }
    words.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
    const key = words.join(" ");
    if (!seen.has(key)) {
      seen.add(key);
      sets.push(words);
    }
  }
  return { sets, skipped };
}
