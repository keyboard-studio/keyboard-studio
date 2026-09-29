// referenceHosts/data — hand-verified reference tables: what a virtual
// key (+modifiers) does on each of the five reference host layouts.
//
// HONESTY CONTRACT (load-bearing): every entry below is a behaviour the
// author of this table is confident about. Anything not in a table is NOT
// "the same as US" by default — it resolves to "no data" (see
// referenceHosts.ts), except where a host explicitly declares a fallback.
// A wrong confident-sounding row is worse than an honest gap.
//
// Key format: "K_QUOTE" for the bare key, "SHIFT+K_QUOTE" with modifiers
// (modifiers sorted, upper-cased). Only SHIFT is tabled — CTRL/ALT combos
// are host- and application-dependent and always resolve to "no data".

import type { ReferenceHostName } from "./types.ts";

/** What a key does on a host: types a character, or is itself a host deadkey. */
export type HostBehaviour =
  | { kind: "types"; char: string }
  | { kind: "deadkey"; purpose: string };

const entry = (key: string, behaviour: HostBehaviour, ...modifiers: string[]): [string, HostBehaviour] => [
  [...modifiers.map((m) => m.toUpperCase()).sort(), key.toUpperCase()].join("+"),
  behaviour,
];

const types = (char: string): HostBehaviour => ({ kind: "types", char });
const deadkey = (purpose: string): HostBehaviour => ({ kind: "deadkey", purpose });

/** A–Z letters: bare types lowercase, SHIFT types uppercase. */
function letterRows(
  mapping: Record<string, string>,
): Array<[string, HostBehaviour]> {
  const rows: Array<[string, HostBehaviour]> = [];
  for (const [vkey, lower] of Object.entries(mapping)) {
    rows.push(entry(vkey, types(lower)));
    rows.push(entry(vkey, types(lower.toUpperCase()), "SHIFT"));
  }
  return rows;
}

const US_LETTERS: Record<string, string> = {
  K_Q: "q", K_W: "w", K_E: "e", K_R: "r", K_T: "t", K_Y: "y", K_U: "u",
  K_I: "i", K_O: "o", K_P: "p", K_A: "a", K_S: "s", K_D: "d", K_F: "f",
  K_G: "g", K_H: "h", K_J: "j", K_K: "k", K_L: "l", K_Z: "z", K_X: "x",
  K_C: "c", K_V: "v", K_B: "b", K_N: "n", K_M: "m",
};

// ---------------------------------------------------------------------------
// US — the baseline ANSI layout.
// ---------------------------------------------------------------------------
const us = new Map<string, HostBehaviour>([
  ...letterRows(US_LETTERS),
  entry("K_1", types("1")), entry("K_1", types("!"), "SHIFT"),
  entry("K_2", types("2")), entry("K_2", types("@"), "SHIFT"),
  entry("K_3", types("3")), entry("K_3", types("#"), "SHIFT"),
  entry("K_4", types("4")), entry("K_4", types("$"), "SHIFT"),
  entry("K_5", types("5")), entry("K_5", types("%"), "SHIFT"),
  entry("K_6", types("6")), entry("K_6", types("^"), "SHIFT"),
  entry("K_7", types("7")), entry("K_7", types("&"), "SHIFT"),
  entry("K_8", types("8")), entry("K_8", types("*"), "SHIFT"),
  entry("K_9", types("9")), entry("K_9", types("("), "SHIFT"),
  entry("K_0", types("0")), entry("K_0", types(")"), "SHIFT"),
  entry("K_HYPHEN", types("-")), entry("K_HYPHEN", types("_"), "SHIFT"),
  entry("K_EQUAL", types("=")), entry("K_EQUAL", types("+"), "SHIFT"),
  entry("K_LBRKT", types("[")), entry("K_LBRKT", types("{"), "SHIFT"),
  entry("K_RBRKT", types("]")), entry("K_RBRKT", types("}"), "SHIFT"),
  entry("K_BKSLASH", types("\\")), entry("K_BKSLASH", types("|"), "SHIFT"),
  entry("K_COLON", types(";")), entry("K_COLON", types(":"), "SHIFT"),
  entry("K_QUOTE", types("'")), entry("K_QUOTE", types('"'), "SHIFT"),
  entry("K_BKQUOTE", types("`")), entry("K_BKQUOTE", types("~"), "SHIFT"),
  entry("K_COMMA", types(",")), entry("K_COMMA", types("<"), "SHIFT"),
  entry("K_PERIOD", types(".")), entry("K_PERIOD", types(">"), "SHIFT"),
  entry("K_SLASH", types("/")), entry("K_SLASH", types("?"), "SHIFT"),
  entry("K_SPACE", types("space")),
]);

// ---------------------------------------------------------------------------
// UK English — same letters; the differences are on digits and punctuation.
// ---------------------------------------------------------------------------
const uk = new Map<string, HostBehaviour>([
  ...letterRows(US_LETTERS),
  entry("K_1", types("1")), entry("K_1", types("!"), "SHIFT"),
  entry("K_2", types("2")), entry("K_2", types('"'), "SHIFT"),
  entry("K_3", types("3")), entry("K_3", types("£"), "SHIFT"),
  entry("K_4", types("4")), entry("K_4", types("$"), "SHIFT"),
  entry("K_5", types("5")), entry("K_5", types("%"), "SHIFT"),
  entry("K_6", types("6")), entry("K_6", types("^"), "SHIFT"),
  entry("K_7", types("7")), entry("K_7", types("&"), "SHIFT"),
  entry("K_8", types("8")), entry("K_8", types("*"), "SHIFT"),
  entry("K_9", types("9")), entry("K_9", types("("), "SHIFT"),
  entry("K_0", types("0")), entry("K_0", types(")"), "SHIFT"),
  entry("K_HYPHEN", types("-")), entry("K_HYPHEN", types("_"), "SHIFT"),
  entry("K_EQUAL", types("=")), entry("K_EQUAL", types("+"), "SHIFT"),
  entry("K_LBRKT", types("[")), entry("K_LBRKT", types("{"), "SHIFT"),
  entry("K_RBRKT", types("]")), entry("K_RBRKT", types("}"), "SHIFT"),
  // UK ISO: the key left of Enter types #/~.
  entry("K_BKSLASH", types("#")), entry("K_BKSLASH", types("~"), "SHIFT"),
  entry("K_COLON", types(";")), entry("K_COLON", types(":"), "SHIFT"),
  entry("K_QUOTE", types("'")), entry("K_QUOTE", types("@"), "SHIFT"),
  // UK ISO: the top-left key types `/¬.
  entry("K_BKQUOTE", types("`")), entry("K_BKQUOTE", types("¬"), "SHIFT"),
  entry("K_COMMA", types(",")), entry("K_COMMA", types("<"), "SHIFT"),
  entry("K_PERIOD", types(".")), entry("K_PERIOD", types(">"), "SHIFT"),
  entry("K_SLASH", types("/")), entry("K_SLASH", types("?"), "SHIFT"),
  entry("K_SPACE", types("space")),
]);

// ---------------------------------------------------------------------------
// Intl (US International) — US plus five host deadkeys. Everything else is
// the US behaviour, which this host declares as an explicit fallback.
// ---------------------------------------------------------------------------
const intlDeadkeys = new Map<string, HostBehaviour>([
  entry("K_QUOTE", deadkey("acute — ' then a vowel types á")),
  entry("K_QUOTE", deadkey("diaeresis — \" then a vowel types ä"), "SHIFT"),
  entry("K_BKQUOTE", deadkey("grave — ` then a vowel types à")),
  entry("K_BKQUOTE", deadkey("tilde — ~ then n types ñ"), "SHIFT"),
  entry("K_6", deadkey("circumflex — ^ then a vowel types â"), "SHIFT"),
]);

// ---------------------------------------------------------------------------
// AZERTY (French) — letters move, digits need Shift, ^/¨ are host deadkeys.
// ---------------------------------------------------------------------------
const azerty = new Map<string, HostBehaviour>([
  ...letterRows({
    K_Q: "a", K_W: "z", K_E: "e", K_R: "r", K_T: "t", K_Y: "y", K_U: "u",
    K_I: "i", K_O: "o", K_P: "p", K_A: "q", K_S: "s", K_D: "d", K_F: "f",
    K_G: "g", K_H: "h", K_J: "j", K_K: "k", K_L: "l", K_Z: "w", K_X: "x",
    K_C: "c", K_V: "v", K_B: "b", K_N: "n",
  }),
  // Top-left key: superscript-two.
  entry("K_BKQUOTE", types("²")),
  // Digits live on Shift; the bare row is punctuation.
  entry("K_1", types("&")), entry("K_1", types("1"), "SHIFT"),
  entry("K_2", types("é")), entry("K_2", types("2"), "SHIFT"),
  entry("K_3", types('"')), entry("K_3", types("3"), "SHIFT"),
  entry("K_4", types("'")), entry("K_4", types("4"), "SHIFT"),
  entry("K_5", types("(")), entry("K_5", types("5"), "SHIFT"),
  entry("K_6", types("-")), entry("K_6", types("6"), "SHIFT"),
  entry("K_7", types("è")), entry("K_7", types("7"), "SHIFT"),
  entry("K_8", types("_")), entry("K_8", types("8"), "SHIFT"),
  entry("K_9", types("ç")), entry("K_9", types("9"), "SHIFT"),
  entry("K_0", types("à")), entry("K_0", types("0"), "SHIFT"),
  entry("K_HYPHEN", types(")")), entry("K_HYPHEN", types("°"), "SHIFT"),
  entry("K_EQUAL", types("=")), entry("K_EQUAL", types("+"), "SHIFT"),
  // ^ is a host deadkey (circumflex); Shift+^ is ¨ (diaeresis deadkey).
  entry("K_LBRKT", deadkey("circumflex — ^ then a vowel types â")),
  entry("K_LBRKT", deadkey("diaeresis — ¨ then a vowel types ä"), "SHIFT"),
  entry("K_RBRKT", types("$")),
  entry("K_COLON", types("m")), entry("K_COLON", types("M"), "SHIFT"),
  entry("K_QUOTE", types("ù")), entry("K_QUOTE", types("%"), "SHIFT"),
  entry("K_BKSLASH", types("*")), entry("K_BKSLASH", types("μ"), "SHIFT"),
  entry("K_M", types(",")), entry("K_M", types("?"), "SHIFT"),
  entry("K_COMMA", types(";")), entry("K_COMMA", types("."), "SHIFT"),
  entry("K_PERIOD", types(":")), entry("K_PERIOD", types("/"), "SHIFT"),
  entry("K_SLASH", types("!")), entry("K_SLASH", types("§"), "SHIFT"),
  entry("K_SPACE", types("space")),
]);

// ---------------------------------------------------------------------------
// QWERTZ (German) — y/z swap, umlauts on the right hand, ^ and ´ deadkeys.
// ---------------------------------------------------------------------------
const qwertz = new Map<string, HostBehaviour>([
  ...letterRows({
    ...US_LETTERS,
    K_Y: "z",
    K_Z: "y",
  }),
  entry("K_1", types("1")), entry("K_1", types("!"), "SHIFT"),
  entry("K_2", types("2")), entry("K_2", types('"'), "SHIFT"),
  entry("K_3", types("3")), entry("K_3", types("§"), "SHIFT"),
  entry("K_4", types("4")), entry("K_4", types("$"), "SHIFT"),
  entry("K_5", types("5")), entry("K_5", types("%"), "SHIFT"),
  entry("K_6", types("6")), entry("K_6", types("&"), "SHIFT"),
  entry("K_7", types("7")), entry("K_7", types("/"), "SHIFT"),
  entry("K_8", types("8")), entry("K_8", types("("), "SHIFT"),
  entry("K_9", types("9")), entry("K_9", types(")"), "SHIFT"),
  entry("K_0", types("0")), entry("K_0", types("="), "SHIFT"),
  entry("K_HYPHEN", types("ß")), entry("K_HYPHEN", types("?"), "SHIFT"),
  // ´ is a host deadkey (acute); Shift+´ is ` (grave deadkey).
  entry("K_EQUAL", deadkey("acute — ´ then a vowel types á")),
  entry("K_EQUAL", deadkey("grave — ` then a vowel types à"), "SHIFT"),
  // ^ is a host deadkey (circumflex).
  entry("K_BKQUOTE", deadkey("circumflex — ^ then a vowel types â")),
  entry("K_BKQUOTE", types("°"), "SHIFT"),
  entry("K_LBRKT", types("ü")), entry("K_LBRKT", types("Ü"), "SHIFT"),
  entry("K_RBRKT", types("+")), entry("K_RBRKT", types("*"), "SHIFT"),
  entry("K_BKSLASH", types("#")), entry("K_BKSLASH", types("'"), "SHIFT"),
  entry("K_COLON", types("ö")), entry("K_COLON", types("Ö"), "SHIFT"),
  entry("K_QUOTE", types("ä")), entry("K_QUOTE", types("Ä"), "SHIFT"),
  entry("K_COMMA", types(",")), entry("K_COMMA", types(";"), "SHIFT"),
  entry("K_PERIOD", types(".")), entry("K_PERIOD", types(":"), "SHIFT"),
  entry("K_SLASH", types("-")), entry("K_SLASH", types("_"), "SHIFT"),
  entry("K_SPACE", types("space")),
]);

/** Per-host tables. Intl carries its deadkeys separately: everything else
 * falls back to the US table explicitly (declared below, not by default). */
export const HOST_TABLES: Record<ReferenceHostName, ReadonlyMap<string, HostBehaviour>> = {
  US: us,
  "UK English": uk,
  Intl: intlDeadkeys,
  AZERTY: azerty,
  QWERTZ: qwertz,
};

/**
 * Hosts that explicitly fall back to another host's table for keys they do
 * not table themselves. Intl = US plus its five deadkeys; that fallback is
 * declared here, in the open, so "no data" stays the default everywhere
 * else.
 */
export const HOST_FALLBACKS: Partial<Record<ReferenceHostName, ReferenceHostName>> = {
  Intl: "US",
};
