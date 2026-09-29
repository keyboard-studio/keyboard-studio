/**
 * referenceHostLayouts — reference physical-layout data for host-leak demonstration
 * (spec 076, FR-023; issue #1802 amendments A3/A3.1).
 *
 * WHAT THIS IS
 * ------------
 * The studio runs in a browser and cannot see the typist's machine, so the
 * demonstrate-then-choose pattern FR-023 demands (carve gallery host-consequence
 * labels, test-pane host selector, and later the `swallowUndefined` undefined-key
 * demo) needs *some* concrete hosts to show. This module is that reference: five
 * static, versioned, auditable host layouts — US, US-International, AZERTY,
 * QWERTZ, UK English — keyed by key+modifiers generally (`{ key, modifiers } →
 * produced character`), NOT by carved combo, so the later `swallowUndefined`
 * phase reuses it unchanged for undefined keys (A3 uniformity: a carved combo
 * left to host fallback and an undefined key left to host fallback are the
 * same leak).
 *
 * SOURCE & EXTRACTION
 * -------------------
 * Curated from public keyboard-layout documentation: the Wikipedia "AltGr key"
 * article's per-layout tables (UK English and US-International AltGr layers,
 * verified 2026-09-28), Microsoft's United States-International usage guide
 * (RightAlt+vowel acute series, RightAlt+1=¡, RightAlt+/=¿, RightAlt+n=ñ,
 * RightAlt+z=æ, RightAlt+l=ø, RightAlt+d=ð, RightAlt+t=þ, RightAlt+s=ß,
 * RightAlt+w=å), and the long-stable public descriptions of the French AZERTY
 * and German QWERTZ layouts (base/shift rows and AltGr currency/symbol layer).
 * Compiled 2026-09-28. The motivating real-world case is a `sil_cameroon_qwerty`
 * deployment whose hosts include UK English, where AltGr+4 leaks € — a leak the
 * author never sees in the studio (A3).
 *
 * COVERAGE — READ BEFORE EXTENDING
 * --------------------------------
 * The maps cover the printable alphanumeric/punctuation rows (base + shift)
 * and the *notable leak combos* of each AltGr layer (currency signs, accented
 * vowels, ß/ñ/æ/ø/å/µ, brackets) — the cells the gallery actually demonstrates.
 * They are deliberately NOT exhaustive: Shift+AltGr positions, Ctrl combos,
 * and AltGr positions not listed here are UNMAPPED, and the lookup returns
 * `undefined` for them (unknown), never a guess. A demo cell that is unknown
 * must render as "unknown on this layout", not as silence. Extending a layer
 * is additive: add the cell, cite the source in the comment above the table.
 *
 * Keys are Keyman `K_` virtual-key ids (positional, US-named — the same ids the
 * IR's `vkey` context elements carry), so a carved combo's key+modifiers feed
 * the lookup directly. Frame keys (Backspace, Enter, Tab, Escape, Delete,
 * navigation) are never carved and are not mapped.
 *
 * Deadkeys are marked with the DEADKEY sentinel, not a character: on the host,
 * pressing that combo arms a deadkey rather than producing output — still a
 * leak (a carved deadkey left to host fallback would stay armed), so the demo
 * must say "deadkey", not show a letter.
 *
 * VERSIONING
 * ----------
 * REFERENCE_DATA_VERSION versions the layout tables; bump it whenever a cell
 * is added, corrected, or removed. REGION_LAYOUT_MAPPING_VERSION versions the
 * bcp47 region→layout mapping below; bump it whenever a region mapping is
 * added or changed. Update policy: corrections are welcome any time (cite the
 * source); new regions/hosts are additive and never renumber existing ids,
 * because persisted carve-decision metadata may reference host ids.
 */

export const REFERENCE_DATA_VERSION = 1;
export const REGION_LAYOUT_MAPPING_VERSION = 1;

export type HostLayoutId = "us" | "us-intl" | "azerty" | "qwertz" | "uk";

/** Stable display order for the five reference hosts. */
export const REFERENCE_HOST_IDS: readonly HostLayoutId[] = [
  "us",
  "us-intl",
  "azerty",
  "qwertz",
  "uk",
];

export interface HostLayoutMeta {
  id: HostLayoutId;
  /** Short label for selectors and table headers. */
  label: string;
  /** One-line description for the gallery caption context. */
  description: string;
}

export const HOST_LAYOUTS: Record<HostLayoutId, HostLayoutMeta> = {
  us: {
    id: "us",
    label: "US English",
    description: "Standard US QWERTY; no AltGr layer — RightAlt acts as Ctrl+Alt with no printable output.",
  },
  "us-intl": {
    id: "us-intl",
    label: "US International",
    description:
      "US-International QWERTY; deadkeys on ' \" ` ~ ^, accented vowels and symbols behind RightAlt.",
  },
  azerty: {
    id: "azerty",
    label: "AZERTY (French)",
    description: "French AZERTY; digits on shift, accented vowels on the number row, € behind AltGr+E.",
  },
  qwertz: {
    id: "qwertz",
    label: "QWERTZ (German)",
    description: "German QWERTZ; ß and dead ´/̂ on the number row, € behind AltGr+E, @ behind AltGr+Q.",
  },
  uk: {
    id: "uk",
    label: "UK English",
    description: "UK QWERTY; £ on Shift+3, € behind AltGr+4 — the motivating A3 leak.",
  },
};

/** Sentinel cell value: the combo arms a host deadkey instead of producing a character. */
export const DEADKEY = "deadkey" as const;

/** A reference cell: a produced character, the DEADKEY sentinel, or absent (unknown). */
export type HostCell = string | typeof DEADKEY;

export type HostLayer = "base" | "shift" | "altgr";

export interface HostLayoutData {
  base: Record<string, HostCell>;
  shift: Record<string, HostCell>;
  /** RightAlt / AltGr layer — the leak layer. Absent cells are unknown, not empty. */
  altgr: Record<string, HostCell>;
}

// ---------------------------------------------------------------------------
// US — no AltGr layer (documented above).
// ---------------------------------------------------------------------------

const US_BASE: Record<string, HostCell> = {
  K_BKQUOTE: "`",
  K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5",
  K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0",
  K_HYPHEN: "-", K_EQUAL: "=",
  K_Q: "q", K_W: "w", K_E: "e", K_R: "r", K_T: "t", K_Y: "y",
  K_U: "u", K_I: "i", K_O: "o", K_P: "p",
  K_LBRKT: "[", K_RBRKT: "]", K_BKSLASH: "\\",
  K_A: "a", K_S: "s", K_D: "d", K_F: "f", K_G: "g", K_H: "h",
  K_J: "j", K_K: "k", K_L: "l", K_COLON: ";", K_QUOTE: "'",
  K_Z: "z", K_X: "x", K_C: "c", K_V: "v", K_B: "b", K_N: "n",
  K_M: "m", K_COMMA: ",", K_PERIOD: ".", K_SLASH: "/",
};

const US_SHIFT: Record<string, HostCell> = {
  K_BKQUOTE: "~",
  K_1: "!", K_2: "@", K_3: "#", K_4: "$", K_5: "%",
  K_6: "^", K_7: "&", K_8: "*", K_9: "(", K_0: ")",
  K_HYPHEN: "_", K_EQUAL: "+",
  K_Q: "Q", K_W: "W", K_E: "E", K_R: "R", K_T: "T", K_Y: "Y",
  K_U: "U", K_I: "I", K_O: "O", K_P: "P",
  K_LBRKT: "{", K_RBRKT: "}", K_BKSLASH: "|",
  K_A: "A", K_S: "S", K_D: "D", K_F: "F", K_G: "G", K_H: "H",
  K_J: "J", K_K: "K", K_L: "L", K_COLON: ":", K_QUOTE: "\"",
  K_Z: "Z", K_X: "X", K_C: "C", K_V: "V", K_B: "B", K_N: "N",
  K_M: "M", K_COMMA: "<", K_PERIOD: ">", K_SLASH: "?",
};

// ---------------------------------------------------------------------------
// US-International — US base/shift with deadkeys; curated AltGr leak layer.
// Deadkeys: ' (K_QUOTE), " (shift K_QUOTE), ` (K_BKQUOTE), ~ (shift K_BKQUOTE),
// ^ (shift K_6). AltGr series per Microsoft's US-International usage guide.
// ---------------------------------------------------------------------------

const US_INTL_ALTGR: Record<string, HostCell> = {
  // RightAlt+1 = ¡, RightAlt+/ = ¿ (inverted punctuation)
  K_1: "¡",
  K_SLASH: "¿",
  // RightAlt+vowel = acute accent (a e i o u y)
  K_A: "á", K_E: "é", K_I: "í", K_O: "ó", K_U: "ú", K_Y: "ý",
  // RightAlt consonant series
  K_N: "ñ",   // RightAlt+n
  K_S: "ß",   // RightAlt+s
  K_Z: "æ",   // RightAlt+z
  K_L: "ø",   // RightAlt+l
  K_D: "ð",   // RightAlt+d (eth)
  K_T: "þ",   // RightAlt+t (thorn)
  K_W: "å",   // RightAlt+w (a-ring)
};

// ---------------------------------------------------------------------------
// AZERTY (French) — base/shift per public layout documentation; curated AltGr.
// The ^ key (K_LBRKT) and ¨ (shift K_LBRKT) are deadkeys. K_BKSLASH position
// (the extra 105th key) is intentionally unmapped: coverage gap, see header.
// ---------------------------------------------------------------------------

const AZERTY_BASE: Record<string, HostCell> = {
  K_BKQUOTE: "²",
  K_1: "&", K_2: "é", K_3: "\"", K_4: "'", K_5: "(",
  K_6: "-", K_7: "è", K_8: "_", K_9: "ç", K_0: "à",
  K_HYPHEN: ")", K_EQUAL: "=",
  K_Q: "a", K_W: "z", K_E: "e", K_R: "r", K_T: "t", K_Y: "y",
  K_U: "u", K_I: "i", K_O: "o", K_P: "p",
  K_LBRKT: DEADKEY, K_RBRKT: "$",
  K_A: "q", K_S: "s", K_D: "d", K_F: "f", K_G: "g", K_H: "h",
  K_J: "j", K_K: "k", K_L: "l", K_COLON: "m", K_QUOTE: "ù",
  K_Z: "w", K_X: "x", K_C: "c", K_V: "v", K_B: "b", K_N: "n",
  K_M: ",", K_COMMA: ";", K_PERIOD: ":", K_SLASH: "!",
};

const AZERTY_SHIFT: Record<string, HostCell> = {
  K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5",
  K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0",
  K_HYPHEN: "°", K_EQUAL: "+",
  K_Q: "A", K_W: "Z", K_E: "E", K_R: "R", K_T: "T", K_Y: "Y",
  K_U: "U", K_I: "I", K_O: "O", K_P: "P",
  K_LBRKT: DEADKEY, K_RBRKT: "*",
  K_A: "Q", K_S: "S", K_D: "D", K_F: "F", K_G: "G", K_H: "H",
  K_J: "J", K_K: "K", K_L: "L", K_COLON: "?", K_QUOTE: "%",
  K_Z: "W", K_X: "X", K_C: "C", K_V: "V", K_B: "B", K_N: "N",
  K_M: "?", K_COMMA: ".", K_PERIOD: "/", K_SLASH: "§",
};

const AZERTY_ALTGR: Record<string, HostCell> = {
  // The classic French AltGr number-row series
  K_2: "~",   // AltGr+é
  K_7: "`",   // AltGr+è
  K_9: "^",   // AltGr+ç
  K_0: "@",   // AltGr+à
  K_HYPHEN: "]", // AltGr+)
  K_E: "€",   // AltGr+e — the French euro leak
};

// ---------------------------------------------------------------------------
// QWERTZ (German) — base/shift per public layout documentation; curated AltGr.
// ^ (K_BKQUOTE) and ´ (K_EQUAL) are deadkeys on base; ° (shift K_BKQUOTE) and
// ` (shift K_EQUAL) likewise on shift. Note the Y/Z positional swap.
// ---------------------------------------------------------------------------

const QWERTZ_BASE: Record<string, HostCell> = {
  K_BKQUOTE: DEADKEY, // ^ dead
  K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5",
  K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0",
  K_HYPHEN: "ß", K_EQUAL: DEADKEY, // ´ dead
  K_Q: "q", K_W: "w", K_E: "e", K_R: "r", K_T: "t",
  K_Z: "y", // positional swap
  K_U: "u", K_I: "i", K_O: "o", K_P: "p",
  K_LBRKT: "ü", K_RBRKT: "+", K_BKSLASH: "#",
  K_A: "a", K_S: "s", K_D: "d", K_F: "f", K_G: "g", K_H: "h",
  K_J: "j", K_K: "k", K_L: "l", K_COLON: "ö", K_QUOTE: "ä",
  K_Y: "z", // positional swap
  K_X: "x", K_C: "c", K_V: "v", K_B: "b", K_N: "n",
  K_M: "m", K_COMMA: ",", K_PERIOD: ".", K_SLASH: "-",
};

const QWERTZ_SHIFT: Record<string, HostCell> = {
  K_BKQUOTE: "°",
  K_1: "!", K_2: "\"", K_3: "§", K_4: "$", K_5: "%",
  K_6: "&", K_7: "/", K_8: "(", K_9: ")", K_0: "=",
  K_HYPHEN: "?", K_EQUAL: DEADKEY, // ` dead
  K_Q: "Q", K_W: "W", K_E: "E", K_R: "R", K_T: "T",
  K_Z: "Y",
  K_U: "U", K_I: "I", K_O: "O", K_P: "P",
  K_LBRKT: "Ü", K_RBRKT: "*", K_BKSLASH: "'",
  K_A: "A", K_S: "S", K_D: "D", K_F: "F", K_G: "G", K_H: "H",
  K_J: "J", K_K: "K", K_L: "L", K_COLON: "Ö", K_QUOTE: "Ä",
  K_Y: "Z",
  K_X: "X", K_C: "C", K_V: "V", K_B: "B", K_N: "N",
  K_M: "M", K_COMMA: ";", K_PERIOD: ":", K_SLASH: "_",
};

const QWERTZ_ALTGR: Record<string, HostCell> = {
  K_Q: "@",   // AltGr+Q
  K_E: "€",   // AltGr+E — the German euro leak (A3 example)
  K_M: "µ",   // AltGr+M
  K_7: "{", K_8: "[", K_9: "]", K_0: "}", // bracket series
  K_HYPHEN: "\\", // AltGr+ß
  K_RBRKT: "~",   // AltGr++
};

// ---------------------------------------------------------------------------
// UK English — US base/shift with £/¬/#/~ differences; curated AltGr layer.
// AltGr cell values per the Wikipedia "AltGr key" UK table (verified
// 2026-09-28). The motivating A3 leak: AltGr+4 = €.
// ---------------------------------------------------------------------------

const UK_BASE: Record<string, HostCell> = {
  ...US_BASE,
  K_BKQUOTE: "`",
  K_BKSLASH: "#",
};

const UK_SHIFT: Record<string, HostCell> = {
  ...US_SHIFT,
  K_2: "\"",   // UK: " on Shift+2
  K_3: "£",    // UK: £ on Shift+3
  K_BKQUOTE: "¬",
  K_QUOTE: "@", // UK: @ on Shift+'
  K_BKSLASH: "~",
};

const UK_ALTGR: Record<string, HostCell> = {
  K_4: "€", // THE A3 leak: AltGr+4 on UK English
  K_7: "{", K_8: "[", K_9: "]", K_0: "}", // bracket series
  K_HYPHEN: "\\",
  // AltGr vowel series
  K_A: "á", K_E: "é", K_I: "í", K_O: "ó", K_U: "ú",
  K_S: "ß",
  K_M: "µ",
  K_C: "ç",
};

export const REFERENCE_HOSTS: Record<HostLayoutId, HostLayoutData> = {
  us: { base: US_BASE, shift: US_SHIFT, altgr: {} },
  "us-intl": {
    base: { ...US_BASE, K_QUOTE: DEADKEY, K_BKQUOTE: DEADKEY },
    shift: { ...US_SHIFT, K_QUOTE: DEADKEY, K_BKQUOTE: DEADKEY, K_6: DEADKEY },
    altgr: US_INTL_ALTGR,
  },
  azerty: { base: AZERTY_BASE, shift: AZERTY_SHIFT, altgr: AZERTY_ALTGR },
  qwertz: { base: QWERTZ_BASE, shift: QWERTZ_SHIFT, altgr: QWERTZ_ALTGR },
  uk: { base: UK_BASE, shift: UK_SHIFT, altgr: UK_ALTGR },
};

// ---------------------------------------------------------------------------
// Lookup — key+modifiers, generally (reused by carve demo now, swallowUndefined
// later). Unknown cells return undefined: the demo must say "unknown", never
// guess.
// ---------------------------------------------------------------------------

const RALT_TOKENS = new Set(["RALT", "RIGHTALT"]);
const SHIFT_TOKENS = new Set(["SHIFT", "LSHIFT", "RSHIFT"]);
const CTRL_TOKENS = new Set(["CTRL", "LCTRL", "RCTRL"]);
const ALT_TOKENS = new Set(["ALT", "LALT"]);

/**
 * Canonicalize raw IR modifier tokens to the reference layer they address.
 * RightAlt (or Ctrl+Alt, which Windows treats as AltGr) selects the AltGr
 * leak layer; Shift selects the shift layer; anything else is base.
 * Shift+AltGr positions are not separately mapped — they resolve to the
 * AltGr layer (documented coverage limit, see header).
 */
export function canonicalHostLayer(modifiers: readonly string[]): HostLayer {
  const mods = new Set(modifiers.map((m) => m.toUpperCase()));
  const hasRalt = [...mods].some((m) => RALT_TOKENS.has(m));
  const hasCtrl = [...mods].some((m) => CTRL_TOKENS.has(m));
  const hasAlt = [...mods].some((m) => ALT_TOKENS.has(m));
  if (hasRalt || (hasCtrl && hasAlt)) return "altgr";
  if ([...mods].some((m) => SHIFT_TOKENS.has(m))) return "shift";
  return "base";
}

/**
 * What would the given host layout produce for this key+modifier combo?
 * Returns the character, the DEADKEY sentinel (combo arms a host deadkey),
 * or undefined when the reference data does not cover the cell.
 */
export function lookupHostOutput(
  host: HostLayoutId,
  key: string,
  modifiers: readonly string[] = [],
): HostCell | undefined {
  const layer = canonicalHostLayer(modifiers);
  return REFERENCE_HOSTS[host][layer][key];
}

// ---------------------------------------------------------------------------
// likelyHostLayouts — FR-023 resolution order (A3.1).
//
//  1. The author's `layout_family` answer (values from
//     packages/studio/src/survey/questions/reserve/layout_family.ts:
//     "qwerty" | "qwertz" | "azerty" | "non-roman" | blank). A coarse
//     "qwerty" is refined by bcp47 region where the region selects within
//     the QWERTY family (qwerty + en-GB → UK English); a region that
//     contradicts the answered family (qwerty + de-DE) does NOT override
//     the answer — the author knows their community. "non-roman" carries
//     no discriminating signal among the five Latin reference hosts, so it
//     falls through to the default set (documented limitation).
//  2. `likelyHostLayouts(bcp47[])` — the versioned region→layout mapping
//     below — when the question is unanswered (or holds an unknown value).
//  3. All five reference hosts when no signal exists.
//
// The same resolution drives disposition defaulting and the later
// swallowUndefined defaults — one likely-host answer, used everywhere.
// ---------------------------------------------------------------------------

/** Answer values of the `layout_family` survey question (see module above). */
export type LayoutFamilyAnswer = "qwerty" | "qwertz" | "azerty" | "non-roman";

/**
 * Versioned region→layout mapping (REGION_LAYOUT_MAPPING_VERSION).
 * Keyed by bcp47 region subtag (uppercased). Approximations are marked:
 * - CH (Swiss German QWERTZ differs slightly from German QWERTZ)
 * - CA → US: Canadian ENGLISH typists overwhelmingly use the US layout.
 *   French-Canadian typists use the distinct CSA layout, which is NOT in the
 *   reference set — so fr-CA gets no region answer (falls back to all five
 *   hosts) rather than a wrong US answer. CSA is additive later, never a
 *   silent redesign (see header).
 */
const REGION_TO_HOST: Record<string, HostLayoutId> = {
  US: "us",
  CA: "us",
  GB: "uk",
  IE: "uk",
  DE: "qwertz",
  AT: "qwertz",
  CH: "qwertz",
  FR: "azerty",
  BE: "azerty",
};

/** First 2-letter bcp47 subtag after the language = the region. */
function regionOf(tag: string): string | undefined {
  const parts = tag.split("-");
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part && /^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return undefined;
}

/** The language subtag (first component) of a bcp47 tag, lowercased. */
function languageOf(tag: string): string {
  return (tag.split("-")[0] ?? "").toLowerCase();
}

export function likelyHostLayouts(
  bcp47: string[],
  layoutFamilyAnswer?: string,
): HostLayoutId[] {
  const family = (layoutFamilyAnswer ?? "").trim().toLowerCase();

  // (1) The author's answer is primary.
  if (family === "qwertz") return ["qwertz"];
  if (family === "azerty") return ["azerty"];
  if (family === "qwerty") {
    // Coarse answer: refine by bcp47 only where the region selects WITHIN
    // the QWERTY family (en-GB → UK English). Never let a region override
    // the answered family.
    const regions = bcp47.map(regionOf);
    if (regions.includes("GB") || regions.includes("IE")) return ["uk"];
    return ["us"];
  }
  // "non-roman" and unknown values fall through to bcp47 inference, then
  // the default set: neither discriminates among the five reference hosts.

  // (2) Language-tag-derived likely hosts.
  const seen = new Set<HostLayoutId>();
  for (const tag of bcp47) {
    const region = regionOf(tag);
    // fr-CA: French-Canadian typists use CSA, not US — and CSA is not in the
    // reference set, so no region answer (falls back to all five below)
    // rather than a wrong US answer.
    if (region === "CA" && languageOf(tag) === "fr") continue;
    const host = region ? REGION_TO_HOST[region] : undefined;
    if (host) seen.add(host);
  }
  if (seen.size > 0) return [...seen];

  // (3) No signal: all five reference hosts.
  return [...REFERENCE_HOST_IDS];
}

// ---------------------------------------------------------------------------
// Shared copy + selector constants (wording owned by T019; the constant keeps
// every surface honest by construction).
// ---------------------------------------------------------------------------

/**
 * Honesty caption for every host-consequence surface (gallery rows, test-pane
 * selector, review panel). The shown layouts are the studio's best guess at
 * the typists' machines, not sight of them.
 */
export const HOST_GUESS_CAPTION =
  "Shown layouts are the studio's best guess at your typists' machines, not sight of them.";

/** The test-pane host selector always offers a "blocked" entry alongside the likely hosts. */
export const BLOCKED_HOST_ID = "blocked" as const;
