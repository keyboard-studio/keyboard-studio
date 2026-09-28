// hostLayouts — the Track A demo pane's host-layout reference (spec 082 FR-003;
// 1802 amendments A1/A2/A3).
//
// The blocking demonstration needs to show, per keystroke, what the key would
// have done WITHOUT the keyboard's rules — i.e. what the HOST computer would
// have typed. The simulator's DefaultOutputRules only know the US base
// layout, so the pane carries a small static reference for the selector's
// layouts.
//
// This module is keyed by KEY+MODIFIERS generally (not by carved combos or
// demo rows): `hostCharFor(layoutId, vkey, modifiers)` answers "what does
// this host layout emit for this physical key press" for any caller. The
// later `swallowUndefined` phase reuses this module unchanged for undefined
// keys (1802 A3 uniformity principle).
//
// DEMO DATA — marked as such wherever it surfaces. These tables are
// approximate (unshifted + shifted + AltGr characters for a curated set of
// physical keys) and exist only to make the allow/block tradeoff visible.
// They are not the OS's real layout tables and must never feed a compile or
// a test vector.
//
// A3: the reference set is five + blocked (UK English joined after the
// AltGr+4 = € leak), and the DEMO set is per-keyboard likely hosts via
// `likelyHostLayouts(bcp47[])` — a versioned region→layout mapping,
// defaulting to the five with no language signal. The caption stays honest:
// best guess, not sight.
//
// A2 framing (supersedes the old "Allow means unpredictable; Block means
// predictable" slogan): the allow/block choice is a tradeoff, not a verdict,
// and each option states its own risk:
//   Allow — "key always does something, but what it does varies by computer"
//           (unpredictable).
//   Block — "key does nothing everywhere" (predictable) but "a dead key if
//           the typist expected a character there" (inaccessible).
// The prompt asks the ONE question only the author can answer: "do your
// typists expect a character on this key?"

export type HostLayoutId = "us" | "intl" | "azerty" | "qwertz" | "uk" | "blocked";

/** Which modifier layers a host key press carries. */
export interface HostKeyModifiers {
  shift?: boolean;
  /** Right-Alt / AltGr layer (the €-leak layer: AltGr+4 on UK English). */
  altGr?: boolean;
}

export interface HostLayout {
  id: HostLayoutId;
  /** Short label for the selector, e.g. "US". */
  label: string;
  /** One-line description of what this host layout represents. */
  blurb: string;
  /**
   * Physical key → character this host layout emits, unshifted. Only the
   * curated demo subset is present; unknown keys fall back to the US table.
   */
  keys: Readonly<Record<string, string>>;
  /** Shifted variants; unknown keys fall back to `keys`. */
  shiftKeys: Readonly<Record<string, string>>;
  /**
   * AltGr (right-Alt) layer; unknown keys yield `null` (no honest fallback —
   * AltGr is a distinct layer, not a shifted variant).
   */
  altGrKeys: Readonly<Record<string, string>>;
}

/** Marker the pane renders next to the selector: this is demo data. */
export const HOST_LAYOUTS_DEMO_NOTE =
  "Host layouts are approximate demo data for the blocking demonstration — not your operating system's real layout tables.";

/**
 * Honesty caption for the likely-hosts default (1802 A3): the shown layouts
 * are derived from language tags, never observed.
 */
export const LIKELY_HOSTS_NOTE =
  "Our best guess from the keyboard's language tags — not sight of your typists' machines. On other layouts these keys may do something else entirely.";

/** The US base table every other layout's unknown keys fall back to. */
const US_KEYS: Readonly<Record<string, string>> = {
  K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5",
  K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0",
  K_HYPHEN: "-", K_EQUAL: "=",
  K_Q: "q", K_W: "w", K_E: "e", K_R: "r", K_T: "t", K_Y: "y",
  K_U: "u", K_I: "i", K_O: "o", K_P: "p",
  K_LBRKT: "[", K_RBRKT: "]", K_BKSLASH: "\\",
  K_A: "a", K_S: "s", K_D: "d", K_F: "f", K_G: "g", K_H: "h",
  K_J: "j", K_K: "k", K_L: "l",
  K_COLON: ";", K_QUOTE: "'",
  K_Z: "z", K_X: "x", K_C: "c", K_V: "v", K_B: "b",
  K_N: "n", K_M: "m",
  K_COMMA: ",", K_PERIOD: ".", K_SLASH: "/",
  K_BKQUOTE: "`", K_SPACE: " ",
};

const US_SHIFT_KEYS: Readonly<Record<string, string>> = {
  K_1: "!", K_2: "@", K_3: "#", K_4: "$", K_5: "%",
  K_6: "^", K_7: "&", K_8: "*", K_9: "(", K_0: ")",
  K_HYPHEN: "_", K_EQUAL: "+",
  K_Q: "Q", K_W: "W", K_E: "E", K_R: "R", K_T: "T", K_Y: "Y",
  K_U: "U", K_I: "I", K_O: "O", K_P: "P",
  K_A: "A", K_S: "S", K_D: "D", K_F: "F", K_G: "G", K_H: "H",
  K_J: "J", K_K: "K", K_L: "L",
  K_Z: "Z", K_X: "X", K_C: "C", K_V: "V", K_B: "B", K_N: "N", K_M: "M",
  K_LBRKT: "{", K_RBRKT: "}", K_BKSLASH: "|",
  K_COLON: ":", K_QUOTE: '"',
  K_COMMA: "<", K_PERIOD: ">", K_SLASH: "?",
  K_BKQUOTE: "~",
};

const EMPTY: Readonly<Record<string, string>> = {};

export const HOST_LAYOUTS: readonly HostLayout[] = [
  {
    id: "us",
    label: "US",
    blurb: "Standard US layout — the baseline the simulator itself uses.",
    keys: US_KEYS,
    shiftKeys: US_SHIFT_KEYS,
    altGrKeys: EMPTY,
  },
  {
    id: "intl",
    label: "US International",
    blurb: "US International — `'` and `\"` are dead keys waiting for a second press.",
    keys: {
      ...US_KEYS,
      // Dead-key positions: the host emits nothing until the next keystroke.
      K_QUOTE: "´ (dead)",
      K_BKQUOTE: "` (dead)",
      K_COLON: ";",
    },
    shiftKeys: {
      ...US_SHIFT_KEYS,
      K_QUOTE: "¨ (dead)",
      K_6: "ˆ (dead)",
    },
    altGrKeys: {
      K_1: "¡",
      K_SLASH: "¿",
      K_N: "ñ",
    },
  },
  {
    id: "azerty",
    label: "AZERTY",
    blurb: "French AZERTY — A/Q and Z/W swap, digits need Shift.",
    keys: {
      ...US_KEYS,
      K_Q: "a", K_W: "z", K_A: "q", K_Z: "w",
      K_1: "&", K_2: "é", K_3: '"', K_4: "'", K_5: "(",
      K_6: "§", K_7: "è", K_8: "!", K_9: "ç", K_0: "à",
      K_M: ",", K_COMMA: ";", K_PERIOD: ":", K_SLASH: "!",
      K_COLON: "m",
      K_LBRKT: "^ (dead)", K_RBRKT: "$",
    },
    shiftKeys: {
      ...US_SHIFT_KEYS,
      K_Q: "A", K_W: "Z", K_A: "Q", K_Z: "W",
      K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5",
      K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0",
    },
    altGrKeys: {
      K_0: "@",
    },
  },
  {
    id: "qwertz",
    label: "QWERTZ",
    blurb: "German QWERTZ — Y/Z swap, umlauts on the right-hand punctuation keys.",
    keys: {
      ...US_KEYS,
      K_Y: "z", K_Z: "y",
      K_HYPHEN: "ß", K_LBRKT: "ü", K_COLON: "ö", K_QUOTE: "ä",
      K_EQUAL: "´ (dead)", K_BKQUOTE: "^ (dead)",
    },
    shiftKeys: {
      ...US_SHIFT_KEYS,
      K_Y: "Z", K_Z: "Y",
      K_HYPHEN: "?", K_LBRKT: "Ü", K_COLON: "Ö", K_QUOTE: "Ä",
    },
    altGrKeys: {
      // The €-leak layer (1802 A3): AltGr+E is the German Euro key.
      K_E: "€",
      K_Q: "@",
      K_7: "{",
      K_8: "[",
      K_9: "]",
      K_0: "}",
      K_HYPHEN: "\\",
      K_EQUAL: "~",
    },
  },
  {
    id: "uk",
    label: "UK English",
    blurb: "UK English — £ on Shift+3, \" on Shift+2, and the AltGr+4 = € leak.",
    keys: {
      ...US_KEYS,
      K_BKQUOTE: "`",
      K_QUOTE: "'",
      K_BKSLASH: "#",
    },
    shiftKeys: {
      ...US_SHIFT_KEYS,
      K_2: '"',
      K_3: "£",
      K_4: "$",
      K_QUOTE: "@",
      K_BKQUOTE: "¬",
      K_BKSLASH: "~",
    },
    altGrKeys: {
      // The motivating A3 leak: AltGr+4 types € on UK English hosts.
      K_4: "€",
      K_BKQUOTE: "¦",
    },
  },
  {
    id: "blocked",
    label: "Blocked",
    blurb: "A host where undefined keys emit nothing at all — the strictest case.",
    keys: EMPTY,
    shiftKeys: EMPTY,
    altGrKeys: EMPTY,
  },
];

const LAYOUT_BY_ID: Readonly<Record<HostLayoutId, HostLayout>> = {
  us: HOST_LAYOUTS[0]!,
  intl: HOST_LAYOUTS[1]!,
  azerty: HOST_LAYOUTS[2]!,
  qwertz: HOST_LAYOUTS[3]!,
  uk: HOST_LAYOUTS[4]!,
  blocked: HOST_LAYOUTS[5]!,
};

export function hostLayoutById(id: HostLayoutId): HostLayout {
  return LAYOUT_BY_ID[id];
}

/**
 * What the selected host layout would emit for one physical key press —
 * the "fall-through" preview for the blocking demonstration.
 *
 * Keyed by key+modifiers generally (1802 A3): `shift` selects the shifted
 * layer, `altGr` the AltGr layer. Returns `""` when the host emits nothing
 * (the `blocked` layout, or a dead-key position whose note names the dead
 * key instead), and `null` when this demo table has no entry — the caller
 * falls back to the US table for plain keys, and treats a missing AltGr
 * entry as unknown (AltGr is a distinct layer with no honest fallback).
 */
export function hostCharFor(
  layoutId: HostLayoutId,
  vkey: string,
  modifiers?: HostKeyModifiers,
): string | null {
  if (layoutId === "blocked") return "";
  const layout = hostLayoutById(layoutId);
  if (modifiers?.altGr === true) {
    const altGr = layout.altGrKeys[vkey];
    return altGr ?? null;
  }
  if (modifiers?.shift === true) {
    const shifted = layout.shiftKeys[vkey];
    if (shifted !== undefined) return shifted;
  }
  const unshifted = layout.keys[vkey];
  if (unshifted !== undefined) return unshifted;
  // Unknown key: fall back to the US table (demo-data honesty — the pane
  // notes the tables are approximate).
  if (modifiers?.shift === true) {
    const usShifted = US_SHIFT_KEYS[vkey];
    if (usShifted !== undefined) return usShifted;
  }
  const us = US_KEYS[vkey];
  return us ?? null;
}

// ---------------------------------------------------------------------------
// likelyHostLayouts — per-keyboard likely hosts (1802 A3).
//
// The demo set is not a fixed five: the keyboard's BCP47 language tags
// resolve through a VERSIONED region→layout mapping to the physical layouts
// its typists likely have. With no language signal (no tags, or tags with
// no region the mapping knows), the default is the five reference hosts.
// "blocked" is never a likely host — the pane appends it as a demonstration
// mode after the likely set.
//
// Bump HOST_LAYOUT_MAPPING_VERSION whenever REGION_TO_HOST_LAYOUTS changes
// so cached demo sets can be invalidated.
// ---------------------------------------------------------------------------

/** Version of the region→layout mapping below. Bump on any change. */
export const HOST_LAYOUT_MAPPING_VERSION = 1;

/** The five reference hosts — the no-signal default (A3: "five + blocked"). */
export const DEFAULT_HOST_LAYOUTS: readonly HostLayoutId[] = ["us", "intl", "azerty", "qwertz", "uk"];

/**
 * BCP47 region subtag (uppercase alpha-2 / numeric-3) → likely host layouts,
 * most likely first. v1: a small hand-built table; deliberately conservative —
 * unknown regions contribute nothing and the default five apply.
 */
const REGION_TO_HOST_LAYOUTS: Readonly<Record<string, readonly HostLayoutId[]>> = {
  US: ["us", "intl"],
  CA: ["us", "intl"],
  GB: ["uk", "us"],
  IE: ["uk", "us"],
  FR: ["azerty", "us"],
  BE: ["azerty", "us"],
  MC: ["azerty", "us"],
  DE: ["qwertz", "uk"],
  AT: ["qwertz", "uk"],
  CH: ["qwertz", "azerty", "us"],
  LI: ["qwertz", "us"],
  LU: ["qwertz", "azerty", "us"],
};

/** Extract the BCP47 region subtag (`en-US` → `US`, `ha-Latn` → null). */
export function regionSubtagOf(bcp47: string): string | null {
  const subtags = bcp47.split("-");
  for (let i = 1; i < subtags.length; i++) {
    const s = subtags[i]!;
    if (/^[A-Za-z]{2}$/.test(s) || /^[0-9]{3}$/.test(s)) {
      return s.toUpperCase();
    }
  }
  return null;
}

/**
 * The host layouts a keyboard's typists likely have, from its BCP47 language
 * tags. Order: most likely first, deduplicated across tags. Empty / regionless
 * / unknown-region input yields the five reference hosts.
 *
 * No author question is asked for this (A3.4): the caller applies the result
 * silently as the selector's default and ordering; the author can still pick
 * any reference layout by hand.
 */
export function likelyHostLayouts(bcp47: readonly string[]): HostLayoutId[] {
  const seen = new Set<HostLayoutId>();
  const ordered: HostLayoutId[] = [];
  for (const tag of bcp47) {
    const region = regionSubtagOf(tag);
    if (region === null) continue;
    const layouts = REGION_TO_HOST_LAYOUTS[region];
    if (layouts === undefined) continue;
    for (const id of layouts) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  return ordered.length > 0 ? ordered : [...DEFAULT_HOST_LAYOUTS];
}

/** Answer values of the existing `layout_family` regional-keyboard question. */
export type LayoutFamilyAnswer = "qwerty" | "qwertz" | "azerty" | "non-roman";

/**
 * Resolve the demo set of likely hosts (1802 A3.1).
 *
 * The existing `layout_family` answer is the PRIMARY input when present —
 * the author told us which physical layout their community uses. BCP47
 * region inference is the FALLBACK (blank / unanswered / "non-roman", for
 * which a regional family says nothing about host layouts). With no signal
 * at all, the five reference hosts.
 *
 * An answered family puts its layout first, then the rest of the five in
 * reference order (kept for contrast and manual switching — the selector
 * always offers every reference layout plus "blocked").
 */
export function resolveLikelyHosts(input: {
  layoutFamily?: LayoutFamilyAnswer | null;
  bcp47?: readonly string[] | null;
}): HostLayoutId[] {
  const { layoutFamily, bcp47 } = input;
  if (layoutFamily === "qwertz" || layoutFamily === "azerty") {
    return [layoutFamily, ...DEFAULT_HOST_LAYOUTS.filter((id) => id !== layoutFamily)];
  }
  if (layoutFamily === "qwerty") {
    const qwertyFirst: HostLayoutId[] = ["us", "intl", "uk"];
    return [...qwertyFirst, ...DEFAULT_HOST_LAYOUTS.filter((id) => !qwertyFirst.includes(id))];
  }
  // "non-roman", blank, or unanswered: the family says nothing about host
  // layouts — fall back to BCP47 region inference, then the five.
  return likelyHostLayouts(bcp47 ?? []);
}

// ---------------------------------------------------------------------------
// A2 tradeoff copy — each option states its own risk; the prompt asks the
// one question only the author can answer.
// ---------------------------------------------------------------------------

/** The one question only the author can answer (1802 A2). */
export const ALLOW_BLOCK_QUESTION = "Do your typists expect a character on this key?";

/** Allow, in its own risk terms (A2): always does something; what varies by computer. */
export const ALLOW_RISK_COPY =
  "Allow — the key always does something, but what it does varies by computer.";

/** Block, in its own risk terms (A2): nothing everywhere; a dead key if a character was expected. */
export const BLOCK_RISK_COPY =
  "Block — the key does nothing on every computer, but it is a dead key if your typists expected a character there.";
