// Shared script-facet join for the keyboard catalog producers (the dev-server
// localKeyboards Vite plugin and the postbuild build-keyboards-index script).
//
// The committed facet index (docs/keyboard-facet-index.json, spec 036) carries
// a content-derived `script` facet per keyboard — the authoritative answer to
// "which script does this base type?". The catalog producers join it here so
// BaseKeyboard.script is real data instead of a hardcoded "Latn", which made
// the base-resolution picker treat every base as Latin (script-match only ever
// fired for Latn targets).
//
// Resolution order per keyboard:
//   1. facet index `script` facet value (content-derived, e.g. "Arab"),
//   2. first four-letter script subtag among the .kps declared BCP47 tags
//      (declared metadata — same derivation as the engine's kps-parser),
//   3. "Latn" (the corpus-dominant default, matching kps-parser's default).

import * as fs from "node:fs";

// ISO 15924 code shape (Title case). Rejects non-script facet values such as
// the index's "undetermined" sentinel.
const ISO15924_RE = /^[A-Z][a-z]{3}$/;

const SCRIPT_SUBTAG_RE = /^[A-Za-z]{4}$/;

/**
 * Load the keyboard-id → ISO 15924 script map from the committed facet index.
 * Entries whose `script` facet is absent or not a script code (e.g.
 * "undetermined") are skipped. Returns an empty Map when the file is missing
 * or unparseable — callers warn and fall back to declared-tag derivation.
 *
 * @param {string} facetIndexPath Absolute path to docs/keyboard-facet-index.json.
 * @returns {Map<string, string>}
 */
export function loadFacetScripts(facetIndexPath) {
  const map = new Map();
  let index;
  try {
    index = JSON.parse(fs.readFileSync(facetIndexPath, "utf8"));
  } catch {
    return map;
  }
  const keyboards = index?.keyboards;
  if (keyboards === null || typeof keyboards !== "object") return map;
  for (const [id, entry] of Object.entries(keyboards)) {
    const value = entry?.facets?.script?.value;
    if (typeof value === "string" && ISO15924_RE.test(value)) {
      map.set(id, value);
    }
  }
  return map;
}

/**
 * Derive the script from a keyboard's declared BCP47 tags: the four-letter
 * script subtag of the first tag that carries one, normalised to Title case
 * (mirrors the engine's kps-parser derivation). Null when no tag declares one.
 *
 * @param {readonly string[]} languages Declared BCP47 tags from the .kps.
 * @returns {string | null}
 */
export function scriptFromDeclaredTags(languages) {
  for (const tag of languages) {
    for (const part of tag.split("-").slice(1)) {
      if (SCRIPT_SUBTAG_RE.test(part)) {
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      }
    }
  }
  return null;
}

/**
 * Resolve a keyboard's script: facet index first, declared BCP47 tags second,
 * "Latn" default last.
 *
 * @param {string} id Keyboard id.
 * @param {readonly string[]} languages Declared BCP47 tags from the .kps.
 * @param {Map<string, string>} facetScripts From {@link loadFacetScripts}.
 * @returns {string}
 */
export function resolveKeyboardScript(id, languages, facetScripts) {
  return facetScripts.get(id) ?? scriptFromDeclaredTags(languages) ?? "Latn";
}
