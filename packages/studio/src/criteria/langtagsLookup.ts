// langtagsLookup — the lazy langtags / Glottolog lookups shared by the
// foreign judge and the authored criteria assembly.
//
// Both hosts need the same two lookups for the language-tag reviewer
// context (reviewerSource.ts): the bare-subtag defaults + full-tag
// resolution from the engine's langtags data, and the constructed /
// natural answer per ISO 639-3 from Glottolog. Each is a dynamic import
// (the data is chunked, not bundled into the first paint) that resolves
// to undefined when unavailable — a missing lookup degrades the context
// lines, never the verdicts, so a failed import is a quiet undefined,
// not an error.
//
// Kept here, not in judgeForeign.ts, so the authored path
// (useAuthoredCriteria) can load the same lookups without importing the
// whole foreign assembly.

import type { LangtagsLookup } from "./reviewerSource.ts";
import type {
  ConlangLookup,
  LangtagsTagLookup,
} from "./languageTags.ts";

/**
 * The langtags lookups — bare-subtag name/script/region and the full-tag
 * resolution — or undefined when unavailable.
 */
export async function loadLangtagsLookup(): Promise<
  { defaults: LangtagsLookup; tags: LangtagsTagLookup } | undefined
> {
  try {
    const mod = await import("@keyboard-studio/engine/langtags");
    return {
      defaults: (subtag) => {
        const d = mod.getLanguageDefaults(subtag);
        if (d === null) return null;
        return {
          ...(d.englishName !== undefined ? { name: d.englishName } : {}),
          ...(d.defaultScript !== undefined ? { script: d.defaultScript } : {}),
          ...(d.defaultRegion !== undefined ? { region: d.defaultRegion } : {}),
        };
      },
      tags: {
        resolve: mod.resolveLangtag,
        scripts: mod.langtagsScripts,
        iso639_3: (lang) => mod.getLanguageDefaults(lang)?.iso639_3,
        members: mod.macrolanguageMembers,
      },
    };
  } catch {
    return undefined;
  }
}

/** Glottolog's "Artificial Language" pseudo-family. */
export const ARTIFICIAL_LANGUAGE_FAMILY = "arti1236";

/** Glottolog's constructed/natural answer per ISO 639-3, or undefined. */
export async function loadConlangLookup(): Promise<ConlangLookup | undefined> {
  try {
    const mod = await import("@keyboard-studio/glottolog");
    return (iso) => {
      const hits = mod.byIso639p3(iso);
      if (hits.length === 0) return null;
      return hits.some((l) => l.familyId === ARTIFICIAL_LANGUAGE_FAMILY)
        ? "constructed"
        : "natural";
    };
  } catch {
    return undefined;
  }
}
