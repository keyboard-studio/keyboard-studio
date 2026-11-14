// uncodedLanguage — a tag and a script for a language that has no ISO 639-3 code
// (spec 115 R15, FR-043 to FR-046). Glottolog knows 759 such languages and 314
// dialects of them. The tag is private use, `qaa[-REGION]-x-<language>[-<dialect>]`;
// the script is proposed from the closest coded relatives, else the country,
// else Latin, and always says where it came from (Article X).

import { relatedLanguages } from "@keyboard-studio/glottolog";
import { getLoadedLangtags } from "../../lib/langtagsDefaults.ts";
import { privateUseSlug } from "../privateUseSlug.ts";

export interface UncodedTagInput {
  languageName: string;
  dialectName?: string;
  countries: string[];
  chosenRegion?: string;
}

/** `qaa`, a region when exactly one country (or the author chose one), `-x-` and the name slugs. */
export function proposeUncodedTag(input: UncodedTagInput): string {
  const region = input.chosenRegion ?? (input.countries.length === 1 ? input.countries[0] : undefined);
  const parts = ["qaa"];
  if (region !== undefined && region !== "") parts.push(region.toUpperCase());
  parts.push("x", privateUseSlug(input.languageName, "language"));
  if (input.dialectName !== undefined && input.dialectName.trim() !== "") {
    parts.push(privateUseSlug(input.dialectName, "dialect"));
  }
  return parts.join("-");
}

export type ScriptSource = "relatives" | "country" | "fallback";

export interface UncodedScriptProposal {
  script: string;
  source: ScriptSource;
  /** The ISO codes (relatives) or country codes the script was read from; empty for the fallback. */
  basis: string[];
}

/** The data the proposal reads, injectable so it can be tested without the full indexes. */
export interface ScriptEnvironment {
  /** ISO 639-3 codes of coded relatives, grouped closest tier first. */
  relativeTiers: (glottocode: string) => string[][];
  /** The langtags default script of a language, by ISO or subtag. */
  defaultScript: (iso: string) => string | undefined;
  /** The default scripts of the langtags languages spoken in a country, one entry per language. */
  scriptsInCountry: (country: string) => string[];
}

function mostCommon(scripts: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const s of scripts) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [s, n] of counts) {
    // Ties go to the alphabetically first script so the proposal is deterministic.
    if (n > bestCount || (n === bestCount && best !== undefined && s < best)) {
      best = s;
      bestCount = n;
    }
  }
  return best;
}

let sharedEnvironment: ScriptEnvironment | null = null;

/** The environment over the real Glottolog catalog and the loaded langtags index (built once, then shared). */
export function defaultScriptEnvironment(): ScriptEnvironment {
  if (sharedEnvironment === null) sharedEnvironment = buildScriptEnvironment();
  return sharedEnvironment;
}

function buildScriptEnvironment(): ScriptEnvironment {
  let byCountry: Map<string, string[]> | null = null;
  const countryIndex = (): Map<string, string[]> => {
    const mod = getLoadedLangtags();
    // Without the langtags module there is nothing to index yet: do not cache the empty answer.
    if (mod === null) return new Map();
    if (byCountry === null) {
      byCountry = new Map();
      {
        for (const s of mod.listLanguages()) {
          const d = mod.getLanguageDefaults(s.code);
          if (d === null || d.defaultScript === undefined) continue;
          const regions = new Set<string>([...(d.defaultRegion !== undefined ? [d.defaultRegion] : []), ...d.regions, ...(d.regionVariants ?? []).map((v) => v.region)]);
          for (const r of regions) {
            const list = byCountry.get(r) ?? [];
            list.push(d.defaultScript);
            byCountry.set(r, list);
          }
        }
      }
    }
    return byCountry;
  };
  return {
    relativeTiers: (glottocode) => {
      const tiers = new Map<number, string[]>();
      for (const r of relatedLanguages(glottocode)) {
        const iso = r.languoid.iso639p3;
        if (iso === undefined) continue;
        const list = tiers.get(r.sharedSubgroupDepth) ?? [];
        list.push(iso);
        tiers.set(r.sharedSubgroupDepth, list);
      }
      return [...tiers.entries()].sort((a, b) => b[0] - a[0]).map(([, isos]) => isos);
    },
    defaultScript: (iso) => getLoadedLangtags()?.getLanguageDefaults(iso)?.defaultScript,
    scriptsInCountry: (country) => countryIndex().get(country.toUpperCase()) ?? [],
  };
}

/**
 * A script for a language with no langtags entry, never blank (FR-046): the most
 * common default script among the closest tier of coded relatives that has one;
 * else the most common among the languages of its countries; else Latin.
 */
export function proposeScriptForUncoded(
  input: { glottocode?: string; countries: string[] },
  env: ScriptEnvironment = defaultScriptEnvironment(),
): UncodedScriptProposal {
  if (input.glottocode !== undefined && input.glottocode !== "") {
    for (const tier of env.relativeTiers(input.glottocode)) {
      const scripts = tier.flatMap((iso) => {
        const s = env.defaultScript(iso);
        return s === undefined ? [] : [s];
      });
      const best = mostCommon(scripts);
      if (best !== undefined) {
        return { script: best, source: "relatives", basis: tier.filter((iso) => env.defaultScript(iso) === best) };
      }
    }
  }
  const countryScripts = input.countries.flatMap((c) => env.scriptsInCountry(c));
  const fromCountry = mostCommon(countryScripts);
  if (fromCountry !== undefined) return { script: fromCountry, source: "country", basis: [...input.countries] };
  return { script: "Latn", source: "fallback", basis: [] };
}
