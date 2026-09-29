/**
 * referenceHostLayouts — reference physical-layout data for host-leak demonstration
 * (spec 076, FR-023; amendments A3/A3.1).
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
 * SOURCE
 * ------
 * Generated, not curated: scripts/codegen-host-layouts.mjs derives every cell
 * from the Keyman "basic" keyboards in the keyboards corpus
 * (release/basic/basic_kbdus, basic_kbdusx, basic_kbdfr, basic_kbdgr,
 * basic_kbduk), which reproduce the Windows OS layouts rule by rule. The
 * output is committed at ./generated/hostLayouts.generated.json with the
 * corpus commit and a SHA-256 of each source keyboard; the codegen test fails
 * when the committed tables no longer match the corpus. Never hand-edit a
 * cell; fix the source or the script and regenerate. The motivating
 * real-world case is a `sil_cameroon_qwerty` deployment whose hosts include
 * UK English, where AltGr+4 leaks € — a leak the author never sees in the
 * studio (A3).
 *
 * These are WINDOWS layouts. Mac and Linux layouts often carry more AltGr
 * characters (Linux `gb`, for example, puts { [ ] } on AltGr+7..0, which
 * Windows UK does not), so a cell here describes a Windows typist only.
 *
 * COVERAGE
 * --------
 * Four layers per host, exactly as the basic keyboard defines them: base,
 * Shift, AltGr (RightAlt, or Ctrl+Alt) and Shift+AltGr. A key the basic
 * keyboard does not define on a layer is UNMAPPED and the lookup returns
 * `undefined` (unknown), never a guess. Ctrl combos and frame keys
 * (Backspace, Enter, Tab, Escape, Delete, navigation) are not mapped.
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
 * REFERENCE_DATA_VERSION versions the layout tables; bump it whenever a
 * regeneration changes a cell. REGION_LAYOUT_MAPPING_VERSION versions the
 * bcp47 region→layout mapping below; bump it whenever a region mapping is
 * added or changed. Update policy: corrections are welcome any time (cite the
 * source); new regions/hosts are additive and never renumber existing ids,
 * because persisted carve-decision metadata may reference host ids.
 */

import generatedHostLayouts from "./generated/hostLayouts.generated.json";

export const REFERENCE_DATA_VERSION = 2;
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

export type HostLayer = "base" | "shift" | "altgr" | "shiftAltgr";

export interface HostLayoutData {
  base: Record<string, HostCell>;
  shift: Record<string, HostCell>;
  /** RightAlt / AltGr layer — the leak layer. Absent cells are unknown, not empty. */
  altgr: Record<string, HostCell>;
  /** Shift+AltGr layer. Absent cells are unknown, not empty. */
  shiftAltgr: Record<string, HostCell>;
}

// ---------------------------------------------------------------------------
// Tables — generated from the basic keyboards (see header). Keys are
// upper-cased Keyman virtual-key ids.
// ---------------------------------------------------------------------------

export const REFERENCE_HOSTS: Record<HostLayoutId, HostLayoutData> = generatedHostLayouts.hosts;

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
 * leak layer, or the Shift+AltGr layer when Shift is also held; Shift alone
 * selects the shift layer; anything else is base.
 */
export function canonicalHostLayer(modifiers: readonly string[]): HostLayer {
  const mods = new Set(modifiers.map((m) => m.toUpperCase()));
  const hasRalt = [...mods].some((m) => RALT_TOKENS.has(m));
  const hasCtrl = [...mods].some((m) => CTRL_TOKENS.has(m));
  const hasAlt = [...mods].some((m) => ALT_TOKENS.has(m));
  const hasShift = [...mods].some((m) => SHIFT_TOKENS.has(m));
  if (hasRalt || (hasCtrl && hasAlt)) return hasShift ? "shiftAltgr" : "altgr";
  return hasShift ? "shift" : "base";
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
  // Tables use upper-cased ids (K_OE2); the IR keeps Keyman's spelling (K_oE2).
  return REFERENCE_HOSTS[host][layer][key.toUpperCase()];
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
