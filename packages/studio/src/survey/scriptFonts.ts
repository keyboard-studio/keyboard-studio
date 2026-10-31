// scriptFonts — script-driven glyph font loading for scripts the three
// Phase B base fonts do not cover (Part 2 of the per-script fonts work.
// Pick 1: the mechanism plus Arab / Ethi / Syrc / Tibt. Pick 2: Deva,
// Beng, Guru, Gujr, Orya, Taml, Telu, Knda, Mlym, Sinh, Mymr, Thai,
// Laoo, Khmr).
//
// Mechanism (Option A): the session's scripts are resolved deterministically
// from data the repo already ships — the target language's ISO 15924 script
// (explicit BCP47 script subtag, else the langtags default script via
// contracts' resolveEffectiveScript) UNION the imported base keyboard's
// language-tag scripts. Each resolved script that has a registry face gets
// its family appended to the glyph font stack (see useGlyphFontStack.ts).
//
// Delivery (Option C technique): faces are NOT static fonts.css rules. A
// face is vendored as a woff2 under public/fonts/ and injected on demand via
// the FontFace API the first time a session needs its script, so authors
// whose scripts are already covered never fetch these files. Fonts are
// self-hosted (spec 095) — no external font service is ever contacted.
//
// Ready-gate contract (consumed by fontSupport.ts): a face's load is
// ACTIVELY triggered with a probe character from its range (never left to
// lazy layout), fontSupport defers measurement of characters in a pending
// face's range (returns "supported", uncached), and cached measurements
// for stacks naming a face's family are invalidated when that face settles,
// so no measurement taken before the load resolved can stick.
//
// Registry maintenance: hand-written. The repo's codegen pattern
// (exemplars / langtags artifacts) generates DATA tables from upstream
// datasets; a script-to-face registry entry also carries a vendoring
// decision (which subset file, which probe), so a generator would need
// this same list as its input and would save nothing at this size.
// Revisit if the remaining long-tail scripts land. Ranges below are
// exactly the unicode-range
// of the vendored subset file (what fonts.googleapis.com served for the
// family's script subset, mirrored per the spec 095 vendoring pass), so the
// FontFace descriptor and the coverage check can never drift apart.

import { resolveEffectiveScript } from "@keyboard-studio/contracts";
import type { LanguageDefaults } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ScriptFontFaceDef {
  /** ISO 15924 script code, e.g. "Arab". */
  readonly script: string;
  /** CSS font-family name the face is registered under. */
  readonly family: string;
  /** Vendored woff2 file name under public/fonts/. */
  readonly file: string;
  /** Codepoint ranges the vendored subset covers (inclusive pairs). */
  readonly ranges: readonly (readonly [number, number])[];
  /** A character inside `ranges` with a real glyph in the face — the load
   * probe: the FontFaceSet load trigger with this text forces the subset
   * file to download. */
  readonly probe: string;
}

export const SCRIPT_FONT_REGISTRY: readonly ScriptFontFaceDef[] = [
  {
    script: "Arab",
    family: "Noto Naskh Arabic",
    file: "noto-naskh-arabic-400-arabic.woff2",
    probe: "ا", // U+0627 ARABIC LETTER ALEF
    ranges: [
      [0x0600, 0x06ff], [0x0750, 0x077f], [0x0870, 0x0891], [0x0897, 0x08e1],
      [0x08e3, 0x08ff], [0x200c, 0x200e], [0x2010, 0x2011], [0x204f, 0x204f],
      [0x2e41, 0x2e41], [0xfb50, 0xfdff], [0xfe70, 0xfe74], [0xfe76, 0xfefc],
      [0x102e0, 0x102fb], [0x10e60, 0x10e7e], [0x10ec2, 0x10ec7],
      [0x10ec9, 0x10eee], [0x10ef0, 0x10eff], [0x1ee00, 0x1ee03],
      [0x1ee05, 0x1ee1f], [0x1ee21, 0x1ee22], [0x1ee24, 0x1ee24],
      [0x1ee27, 0x1ee27], [0x1ee29, 0x1ee32], [0x1ee34, 0x1ee37],
      [0x1ee39, 0x1ee39], [0x1ee3b, 0x1ee3b], [0x1ee42, 0x1ee42],
      [0x1ee47, 0x1ee47], [0x1ee49, 0x1ee49], [0x1ee4b, 0x1ee4b],
      [0x1ee4d, 0x1ee4f], [0x1ee51, 0x1ee52], [0x1ee54, 0x1ee54],
      [0x1ee57, 0x1ee57], [0x1ee59, 0x1ee59], [0x1ee5b, 0x1ee5b],
      [0x1ee5d, 0x1ee5d], [0x1ee5f, 0x1ee5f], [0x1ee61, 0x1ee62],
      [0x1ee64, 0x1ee64], [0x1ee67, 0x1ee6a], [0x1ee6c, 0x1ee72],
      [0x1ee74, 0x1ee77], [0x1ee79, 0x1ee7c], [0x1ee7e, 0x1ee7e],
      [0x1ee80, 0x1ee89], [0x1ee8b, 0x1ee9b], [0x1eea1, 0x1eea3],
      [0x1eea5, 0x1eea9], [0x1eeab, 0x1eebb], [0x1eef0, 0x1eef1],
    ],
  },
  {
    script: "Ethi",
    family: "Noto Sans Ethiopic",
    file: "noto-sans-ethiopic-400-ethiopic.woff2",
    probe: "ሀ", // U+1200 ETHIOPIC SYLLABLE HA
    ranges: [
      [0x030e, 0x030e], [0x1200, 0x1399], [0x2d80, 0x2dde], [0xab01, 0xab2e],
      [0x1e7e0, 0x1e7e6], [0x1e7e8, 0x1e7eb], [0x1e7ed, 0x1e7ee],
      [0x1e7f0, 0x1e7fe],
    ],
  },
  {
    script: "Syrc",
    family: "Noto Sans Syriac",
    file: "noto-sans-syriac-400-syriac.woff2",
    probe: "ܐ", // U+0710 SYRIAC LETTER ALAPH
    ranges: [
      [0x0303, 0x0304], [0x0307, 0x0308], [0x030a, 0x030a], [0x0320, 0x0320],
      [0x0323, 0x0325], [0x032d, 0x032e], [0x0330, 0x0331], [0x060c, 0x060c],
      [0x061b, 0x061c], [0x061f, 0x061f], [0x0621, 0x0621], [0x0640, 0x0640],
      [0x064b, 0x0655], [0x0660, 0x066c], [0x0670, 0x0670], [0x0700, 0x074f],
      [0x0860, 0x086a], [0x1df8, 0x1df8], [0x1dfa, 0x1dfa], [0x200c, 0x200f],
      [0x25cc, 0x25cc], [0x2670, 0x2671],
    ],
  },
  {
    script: "Tibt",
    family: "Noto Serif Tibetan",
    file: "noto-serif-tibetan-400-tibetan.woff2",
    probe: "ཀ", // U+0F40 TIBETAN LETTER KA
    ranges: [
      [0x0f00, 0x0fff], [0x200c, 0x200d], [0x25cc, 0x25cc], [0x3008, 0x300b],
    ],
  },
  // Deva: the base Noto Sans stack happens to carry a Devanagari subset,
  // but under the Charis SIL and Andika selections the script fell through
  // to the generic family and the OS. The full Noto Sans Devanagari family
  // is vendored so the script is covered under every font selection.
  {
    script: "Deva",
    family: "Noto Sans Devanagari",
    file: "noto-sans-devanagari-400-devanagari.woff2",
    probe: "अ", // U+0905 DEVANAGARI LETTER A
    ranges: [
      [0x0900, 0x097f], [0x1cd0, 0x1cf4], [0x1cf7, 0x1cf9], [0x200c, 0x200d],
      [0x20a8, 0x20a8], [0x20b9, 0x20b9], [0x20f0, 0x20f0], [0x25cc, 0x25cc],
      [0xa830, 0xa839], [0xa8e0, 0xa8ff], [0x11b00, 0x11b0a],
    ],
  },
  {
    script: "Beng",
    family: "Noto Sans Bengali",
    file: "noto-sans-bengali-400-bengali.woff2",
    probe: "অ", // U+0985 BENGALI LETTER A
    ranges: [
      [0x0951, 0x0952], [0x0964, 0x0965], [0x0980, 0x09fe], [0x1cd0, 0x1cd0],
      [0x1cd2, 0x1cd2], [0x1cd5, 0x1cd6], [0x1cd8, 0x1cd8], [0x1ce1, 0x1ce1],
      [0x1cea, 0x1cea], [0x1ced, 0x1ced], [0x1cf2, 0x1cf2], [0x1cf5, 0x1cf7],
      [0x200c, 0x200d], [0x20b9, 0x20b9], [0x25cc, 0x25cc], [0xa8f1, 0xa8f1],
      [0x11df0, 0x11df1],
    ],
  },
  {
    script: "Guru",
    family: "Noto Sans Gurmukhi",
    file: "noto-sans-gurmukhi-400-gurmukhi.woff2",
    probe: "ਅ", // U+0A05 GURMUKHI LETTER A
    ranges: [
      [0x0951, 0x0952], [0x0964, 0x0965], [0x0a01, 0x0a76], [0x200c, 0x200d],
      [0x20b9, 0x20b9], [0x25cc, 0x25cc], [0x262c, 0x262c], [0xa830, 0xa839],
    ],
  },
  {
    script: "Gujr",
    family: "Noto Sans Gujarati",
    file: "noto-sans-gujarati-400-gujarati.woff2",
    probe: "અ", // U+0A85 GUJARATI LETTER A
    ranges: [
      [0x0951, 0x0952], [0x0964, 0x0965], [0x0a80, 0x0aff], [0x200c, 0x200d],
      [0x20b9, 0x20b9], [0x25cc, 0x25cc], [0xa830, 0xa839],
    ],
  },
  {
    script: "Orya",
    family: "Noto Sans Oriya",
    file: "noto-sans-oriya-400-oriya.woff2",
    probe: "ଅ", // U+0B05 ORIYA LETTER A
    ranges: [
      [0x0951, 0x0952], [0x0964, 0x0965], [0x0b01, 0x0b77], [0x1cda, 0x1cda],
      [0x1cf2, 0x1cf2], [0x200c, 0x200d], [0x20b9, 0x20b9], [0x25cc, 0x25cc],
    ],
  },
  {
    script: "Taml",
    family: "Noto Sans Tamil",
    file: "noto-sans-tamil-400-tamil.woff2",
    probe: "அ", // U+0B85 TAMIL LETTER A
    ranges: [
      [0x0964, 0x0965], [0x0b82, 0x0bfa], [0x200c, 0x200d], [0x20b9, 0x20b9],
      [0x25cc, 0x25cc],
    ],
  },
  {
    script: "Telu",
    family: "Noto Sans Telugu",
    file: "noto-sans-telugu-400-telugu.woff2",
    probe: "అ", // U+0C05 TELUGU LETTER A
    ranges: [
      [0x0951, 0x0952], [0x0964, 0x0965], [0x0b83, 0x0b83], [0x0c00, 0x0c7f],
      [0x1cd5, 0x1cd6], [0x1cd8, 0x1cd8], [0x1cda, 0x1cda], [0x1cf2, 0x1cf2],
      [0x200c, 0x200d], [0x25cc, 0x25cc],
    ],
  },
  {
    script: "Knda",
    family: "Noto Sans Kannada",
    file: "noto-sans-kannada-400-kannada.woff2",
    probe: "ಅ", // U+0C85 KANNADA LETTER A
    ranges: [
      [0x0951, 0x0952], [0x0964, 0x0965], [0x0b83, 0x0b83], [0x0c80, 0x0cf3],
      [0x1cd0, 0x1cd0], [0x1cd2, 0x1cd3], [0x1cda, 0x1cda], [0x1cf2, 0x1cf2],
      [0x1cf4, 0x1cf4], [0x200c, 0x200d], [0x20b9, 0x20b9], [0x25cc, 0x25cc],
      [0xa830, 0xa835],
    ],
  },
  {
    script: "Mlym",
    family: "Noto Sans Malayalam",
    file: "noto-sans-malayalam-400-malayalam.woff2",
    probe: "അ", // U+0D05 MALAYALAM LETTER A
    ranges: [
      [0x0307, 0x0307], [0x0323, 0x0323], [0x0951, 0x0952], [0x0964, 0x0965],
      [0x0b83, 0x0b83], [0x0d00, 0x0d7f], [0x1cda, 0x1cda], [0x1cf2, 0x1cf2],
      [0x200c, 0x200d], [0x20b9, 0x20b9], [0x25cc, 0x25cc], [0xa830, 0xa832],
    ],
  },
  {
    script: "Sinh",
    family: "Noto Sans Sinhala",
    file: "noto-sans-sinhala-400-sinhala.woff2",
    probe: "අ", // U+0D85 SINHALA LETTER AYANNA
    ranges: [
      [0x0964, 0x0965], [0x0d81, 0x0df4], [0x1cf2, 0x1cf2], [0x200c, 0x200d],
      [0x25cc, 0x25cc], [0x111e1, 0x111f4],
    ],
  },
  {
    script: "Mymr",
    family: "Padauk",
    file: "padauk-400-myanmar.woff2",
    probe: "က", // U+1000 MYANMAR LETTER KA
    ranges: [
      [0x1000, 0x109f], [0x200c, 0x200d], [0x25cc, 0x25cc], [0xa92e, 0xa92e],
      [0xa9e0, 0xa9fe], [0xaa60, 0xaa7f], [0x116d0, 0x116e3],
    ],
  },
  {
    script: "Thai",
    family: "Noto Sans Thai",
    file: "noto-sans-thai-400-thai.woff2",
    probe: "ก", // U+0E01 THAI CHARACTER KO KAI
    ranges: [
      [0x02d7, 0x02d7], [0x0303, 0x0303], [0x0331, 0x0331], [0x0e01, 0x0e5b],
      [0x200c, 0x200d], [0x25cc, 0x25cc],
    ],
  },
  {
    script: "Laoo",
    family: "Noto Sans Lao",
    file: "noto-sans-lao-400-lao.woff2",
    probe: "ກ", // U+0E81 LAO LETTER KO
    ranges: [
      [0x0e81, 0x0edf], [0x200c, 0x200d], [0x25cc, 0x25cc],
    ],
  },
  {
    script: "Khmr",
    family: "Noto Sans Khmer",
    file: "noto-sans-khmer-400-khmer.woff2",
    probe: "ក", // U+1780 KHMER LETTER KA
    ranges: [
      [0x1780, 0x17ff], [0x19e0, 0x19ff], [0x200c, 0x200d], [0x25cc, 0x25cc],
    ],
  },
];

const REGISTRY_BY_SCRIPT = new Map(SCRIPT_FONT_REGISTRY.map((def) => [def.script, def]));

/** The registry face for an ISO 15924 script, or undefined when the script
 * has no vendored face (already covered by the base stack, or a later pick). */
export function scriptFontForScript(script: string): ScriptFontFaceDef | undefined {
  return REGISTRY_BY_SCRIPT.get(script);
}

/** True when `codePoint` falls inside the face's vendored ranges. */
export function scriptFontCovers(def: ScriptFontFaceDef, codePoint: number): boolean {
  return def.ranges.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

/** The registry face covering the FIRST codepoint of `char`, if any. First
 * codepoint is the right key: display strings are a base char plus optional
 * combining marks (exempt from support detection) or a dotted-circle prefix
 * whose base char follows — callers passing a prefixed string should pass
 * the bare char; CharacterMapPane does. */
export function scriptFontCovering(char: string): ScriptFontFaceDef | undefined {
  if (char === "") return undefined;
  const cp = char.codePointAt(0);
  if (cp === undefined) return undefined;
  return SCRIPT_FONT_REGISTRY.find((def) => scriptFontCovers(def, cp));
}

/** CSS `unicode-range` descriptor value for the face, derived from `ranges`
 * so the injected @font-face and the coverage data share one source. */
export function unicodeRangeOf(def: ScriptFontFaceDef): string {
  const fmt = (cp: number) => cp.toString(16).toUpperCase().padStart(4, "0");
  return def.ranges
    .map(([lo, hi]) => (lo === hi ? `U+${fmt(lo)}` : `U+${fmt(lo)}-${fmt(hi)}`))
    .join(", ");
}

// ---------------------------------------------------------------------------
// Session script resolution (Option A)
// ---------------------------------------------------------------------------

/**
 * The session's registry scripts: the union of the target language's
 * effective script and the base keyboard's language-tag scripts (plus the
 * base's declared primary script, for bases whose package declares no
 * language list), restricted to scripts that have a registry face and
 * returned in registry order for a deterministic stack string.
 *
 * `getLanguageDefaults` is the caller's langtags accessor — sync, returning
 * null when the langtags chunk has not loaded yet (the caller re-runs this
 * once it lands; an unresolved script simply contributes nothing yet, never
 * a guessed family).
 */
export function resolveSessionScripts(
  targetBcp47: string,
  baseLanguageTags: readonly string[],
  getLanguageDefaults: (primarySubtag: string) => LanguageDefaults | null | undefined,
  basePrimaryScript?: string,
): string[] {
  const found = new Set<string>();
  const consider = (script: string | undefined) => {
    if (script !== undefined && REGISTRY_BY_SCRIPT.has(script)) found.add(script);
  };
  consider(resolveEffectiveScript(targetBcp47, getLanguageDefaults));
  for (const tag of baseLanguageTags) {
    consider(resolveEffectiveScript(tag, getLanguageDefaults));
  }
  consider(basePrimaryScript);
  return SCRIPT_FONT_REGISTRY.filter((def) => found.has(def.script)).map((def) => def.script);
}

// ---------------------------------------------------------------------------
// Stack composition
// ---------------------------------------------------------------------------

/** Generic family keywords that terminate a CSS font stack. A script family
 * appended AFTER one of these would never be reached (a generic always
 * "matches"), so script families are inserted before the trailing generic. */
const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-rounded", "ui-monospace", "emoji",
  "math", "fangsong",
]);

/**
 * Append the families for `scripts` (registry scripts, any order) to a CSS
 * font stack, inserted before a trailing generic family when the stack ends
 * in one. Scripts without a registry face contribute nothing; the result is
 * deterministic (registry order) and unchanged when `scripts` is empty.
 */
export function appendScriptFamilies(stack: string, scripts: readonly string[]): string {
  const wanted = new Set(scripts);
  const families = SCRIPT_FONT_REGISTRY.filter((def) => wanted.has(def.script)).map(
    (def) => `'${def.family}'`,
  );
  if (families.length === 0) return stack;
  const parts = stack.split(",").map((p) => p.trim()).filter((p) => p !== "");
  const last = parts[parts.length - 1];
  if (last !== undefined && GENERIC_FAMILIES.has(last.toLowerCase())) {
    parts.splice(parts.length - 1, 0, ...families);
    return parts.join(", ");
  }
  return [...parts, ...families].join(", ");
}

// ---------------------------------------------------------------------------
// On-demand face loading (Option C delivery) + the ready-gate surface
// ---------------------------------------------------------------------------

export type ScriptFontLoadState = "idle" | "loading" | "loaded" | "failed" | "unavailable";

const loadStates = new Map<string, ScriptFontLoadState>();
const changeSubscribers = new Set<(script: string) => void>();

export function getScriptFontLoadState(script: string): ScriptFontLoadState {
  return loadStates.get(script) ?? "idle";
}

/**
 * Subscribe to face-settle events (loaded OR failed). The callback receives
 * the script whose face settled. Returns an unsubscribe function.
 * fontSupport uses this to invalidate cached measurements for stacks naming
 * the settled family; useFontSupportChecker uses it to force the re-render
 * that re-measures for real.
 */
export function onScriptFontsChanged(cb: (script: string) => void): () => void {
  changeSubscribers.add(cb);
  return () => {
    changeSubscribers.delete(cb);
  };
}

interface FontFaceApi {
  FontFaceCtor: typeof FontFace;
  fonts: FontFaceSet;
}

/** The FontFace API surface, read lazily at call time (never at module
 * load) so tests can stub it and non-browser environments degrade to
 * "unavailable" instead of throwing. */
function fontFaceApi(): FontFaceApi | null {
  if (typeof document === "undefined") return null;
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  const ctor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (
    fonts === undefined ||
    typeof fonts.add !== "function" ||
    typeof fonts.load !== "function" ||
    typeof ctor !== "function"
  ) {
    return null;
  }
  return { FontFaceCtor: ctor, fonts };
}

function settle(script: string, state: ScriptFontLoadState): void {
  loadStates.set(script, state);
  // Copy before iterating: a subscriber may unsubscribe during its own call.
  for (const cb of [...changeSubscribers]) cb(script);
}

/**
 * Actively load the vendored face for each given registry script that has
 * not been requested yet: construct the FontFace with the registry's
 * unicode-range, add it to document.fonts, and trigger the FontFaceSet
 * load for the probe character so the subset file downloads immediately
 * rather than when some layout happens to need it. Idempotent per script;
 * a failed load is
 * terminal for the session (state "failed" — measurement proceeds against
 * the browser's own fallback rather than gating forever).
 */
export function ensureScriptFontsLoaded(scripts: Iterable<string>): void {
  for (const script of scripts) {
    const def = REGISTRY_BY_SCRIPT.get(script);
    if (def === undefined) continue;
    if ((loadStates.get(script) ?? "idle") !== "idle") continue;
    const api = fontFaceApi();
    if (api === null) {
      loadStates.set(script, "unavailable");
      continue;
    }
    try {
      const face = new api.FontFaceCtor(def.family, `url("/fonts/${def.file}") format("woff2")`, {
        unicodeRange: unicodeRangeOf(def),
        display: "swap",
      });
      api.fonts.add(face);
      loadStates.set(script, "loading");
      // FontFaceSet.load(font, text) is the active trigger: it forces the
      // matching face to fetch its file for the probe text (a character
      // from the script's range), rather than waiting for a layout that
      // happens to need it. An empty resolution means no face matched the
      // probe — registry data at fault — which is a failed load, not a
      // silent success.
      void api.fonts.load(`16px "${def.family}"`, def.probe).then(
        (faces) => settle(script, faces.length > 0 ? "loaded" : "failed"),
        () => settle(script, "failed"),
      );
    } catch {
      settle(script, "failed");
    }
  }
}

/**
 * The ready-gate query fontSupport makes per character: the registry face
 * covering `char` whose load is still pending AND whose family the given
 * stack actually names — or undefined when measurement may proceed. A face
 * still "idle" (its family reached a stack before any ensure call) is
 * triggered here, so the gate and the trigger can never drift apart.
 */
export function pendingScriptFontFor(char: string, fontStack: string): ScriptFontFaceDef | undefined {
  const def = scriptFontCovering(char);
  if (def === undefined) return undefined;
  if (!fontStack.includes(def.family)) return undefined;
  const state = loadStates.get(def.script) ?? "idle";
  if (state === "loading") return def;
  if (state === "idle") {
    ensureScriptFontsLoaded([def.script]);
    return (loadStates.get(def.script) ?? "idle") === "loading" ? def : undefined;
  }
  return undefined;
}
