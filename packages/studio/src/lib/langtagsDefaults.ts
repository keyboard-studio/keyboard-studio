// Lazy loader for the engine langtags slim index.
//
// Dynamic import() ensures the langtags chunk is NOT part of the initial app
// payload (FR-011/SC-005). The import is memoized after first load so it is
// a one-time async load per session — never a per-keystroke fetch and never
// a second debounce timer (decision D3).
//
// Exports:
//   loadLangtags()         — idempotent lazy load; resolves the module once.
//   searchLanguages(query) — search by code/name/autonym; empty query → [].
//   defaultsFor(code)      — look up a language code; returns null if unknown.
//   scriptToTargetOption() — map ISO-15924 → il_target_script option value.

import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";
import { regionCodeToName } from "./iso3166Names.ts";

// ---------------------------------------------------------------------------
// Internal state — a single promise for the module, memoized after first call.
// A module-scoped promise (not a singleton object) is acceptable: it is
// immutable after first assignment and carries no mutable state — its only
// effect is to cache the import resolution.
// ---------------------------------------------------------------------------

type LangtagsModule = {
  getLanguageDefaults: (subtag: string) => LanguageDefaults | null;
  listLanguages: () => readonly LanguageSummary[];
  lookupByName: (query: string) => readonly LanguageSummary[];
};

let _modulePromise: Promise<LangtagsModule> | null = null;

/**
 * Lazily import the engine langtags module.
 *
 * Idempotent: calling multiple times returns the same promise (and the same
 * resolved module) without triggering a second dynamic import.
 */
export function loadLangtags(): Promise<LangtagsModule> {
  if (_modulePromise === null) {
    _modulePromise = (import("@keyboard-studio/engine/langtags") as Promise<LangtagsModule>).catch(
      (err: unknown) => {
        // Reset the memo so a subsequent call can retry. The success path remains
        // memoized (one load per session); only rejections clear the slot.
        _modulePromise = null;
        throw err;
      },
    );
  }
  return _modulePromise;
}

// ---------------------------------------------------------------------------
// Per-call helpers — each call goes through the cached module promise.
// All return safe fallbacks ([] / null) when the module has not loaded yet,
// so callers never block and the UI never crashes.
// ---------------------------------------------------------------------------

/**
 * Search languages by code, English name, or autonym.
 *
 * Returns [] for an empty query (matches engine contract C9).
 * Returns [] synchronously if the module is not yet loaded.
 */
export async function searchLanguages(
  query: string,
): Promise<readonly LanguageSummary[]> {
  if (!query) return [];
  const mod = await loadLangtags();
  return mod.lookupByName(query);
}

/**
 * Look up the default orthography record for a language subtag (case-insensitive).
 *
 * Returns null when the subtag is not in the dataset (contract C5).
 * Returns null synchronously if the module is not yet loaded.
 */
export async function defaultsFor(
  code: string,
): Promise<LanguageDefaults | null> {
  if (!code) return null;
  const mod = await loadLangtags();
  return mod.getLanguageDefaults(code);
}

// ---------------------------------------------------------------------------
// Region name helper
// ---------------------------------------------------------------------------

/**
 * Convert an ISO 3166-1 alpha-2 region code to an English country name for
 * display in the region survey question.
 *
 * The region question asks for a COUNTRY NAME (e.g. "Nigeria"), not a code
 * (e.g. "NG"). This helper maps the code from LanguageDefaults.defaultRegion
 * to the name the user expects to see.
 *
 * Returns undefined when:
 *   - `code` is undefined or empty (LanguageDefaults.defaultRegion absent)
 *   - The code is not in the ISO 3166-1 alpha-2 map (e.g. a UN M.49 numeric)
 *
 * In either case the caller should NOT seed the region field (FR-009).
 *
 * @param code - ISO 3166-1 alpha-2 or UN M.49 code from LanguageDefaults, e.g. "NG".
 * @returns English country name, e.g. "Nigeria", or `undefined`.
 */
export function regionNameFor(code: string | undefined): string | undefined {
  return regionCodeToName(code);
}

// ---------------------------------------------------------------------------
// Script mapping
// ---------------------------------------------------------------------------

/**
 * Map an ISO-15924 script subtag to the corresponding `il_target_script`
 * option value.
 *
 * The mapping covers the scripts present in il_target_script.ts that have a
 * dedicated option. The romanization-Latn and fonipa entries are NOT proposed
 * here — they are user-only choices (spec §8/§9 decoupling). Scripts that
 * have no dedicated il_target_script option return null rather than "other",
 * so callers can distinguish "no proposal" from a real mapping — seeding
 * "other" for a Bengali or Thai user would be worse than no proposal at all.
 *
 * @param defaultScript - ISO-15924 script subtag from LanguageDefaults.
 * @returns A value from the il_target_script options list, or null when the
 *   script has no dedicated option (caller should leave the field unseeded).
 */
export function scriptToTargetOption(
  defaultScript: string | undefined,
): string | null {
  switch (defaultScript) {
    case "Latn": return "Latn";
    case "Deva": return "Deva";
    case "Arab": return "Arab";
    case "Hebr": return "Hebr";
    case "Cyrl": return "Cyrl";
    case "Grek": return "Grek";
    case "Geor": return "Geor";
    case "Armn": return "Armn";
    case "Ethi": return "Ethi";
    case "Hani": return "Hani";
    case "Hang": return "Hang";
    default:     return null;
  }
}
