/**
 * The minimal BCP 47 tag for a language choice, measured against the pinned
 * langtags: a tag names only what is not already a default (spec 115 R2).
 *
 * The lookup key is (canonical language, variants, private use) taken from
 * `parseBcp47` — never `resolveLangtag`'s string fallback. The dialect tagset is
 * used when there is one, else the bare language's tagset; its `full` form gives
 * the default script and region.
 */

import { formatBcp47, parseBcp47, type Bcp47Parts } from "@keyboard-studio/contracts";
import { defaultsIndex } from "./generated/index.js";
import { tagsets } from "./generated/tagsets.js";

export interface TagChoice {
  /** Any form (`cat`, `CA`); canonicalised. */
  language: string;
  script?: string;
  region?: string;
  variants?: string[];
  privateUse?: string[];
  /** Carried through untouched. */
  extensions?: Bcp47Parts["extensions"];
}

type Row = (typeof tagsets)[number];

let byTag: Map<string, Row> | undefined;
let byFull: Map<string, Row> | undefined;

function load(): { byTag: Map<string, Row>; byFull: Map<string, Row> } {
  if (byTag === undefined || byFull === undefined) {
    byTag = new Map();
    byFull = new Map();
    for (const row of tagsets) {
      const t = row[0].toLowerCase();
      const f = row[1].toLowerCase();
      if (!byTag.has(t)) byTag.set(t, row);
      if (!byFull.has(f)) byFull.set(f, row);
    }
  }
  return { byTag, byFull };
}

/** The `[script, region]` a tagset's full form implies; the language-script-region head only. */
function defaultsOf(row: Row): { script: string; region: string } {
  const parts = parseBcp47(row[1]);
  if (!parts.ok) return { script: "", region: "" };
  return { script: parts.parts.script ?? "", region: parts.parts.region ?? "" };
}

function canonicalLanguage(language: string): string {
  const key = language.toLowerCase();
  const code = (defaultsIndex as Record<string, { code?: string } | undefined>)[key]?.code;
  return code !== undefined && code !== "" ? code : key;
}

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function minimalTag(choice: TagChoice): string {
  const maps = load();
  const lang = canonicalLanguage(choice.language);
  const variants = (choice.variants ?? []).map((v) => v.toLowerCase());
  const privateUse = (choice.privateUse ?? []).map((v) => v.toLowerCase());
  const extensions = choice.extensions ?? [];
  const script = choice.script !== undefined && choice.script !== "" ? titleCase(choice.script) : undefined;
  const region = choice.region !== undefined && choice.region !== "" ? choice.region.toUpperCase() : undefined;

  const dialectKey = [lang, ...variants, ...(privateUse.length > 0 ? ["x", ...privateUse] : [])].join("-");
  // A fully specified choice that is itself a tagset's full form is that tagset.
  if (extensions.length === 0 && script !== undefined && region !== undefined) {
    const whole = formatBcp47({ language: lang, extlang: [], script, region, variants, extensions: [], privateUse });
    const hit = maps.byFull.get(whole.toLowerCase());
    if (hit !== undefined) return hit[0];
  }
  const row = maps.byTag.get(dialectKey.toLowerCase()) ?? maps.byTag.get(lang);

  const compose = (s: string | undefined, r: string | undefined): string =>
    formatBcp47({
      language: lang,
      extlang: [],
      ...(s !== undefined && s !== "" ? { script: s } : {}),
      ...(r !== undefined && r !== "" ? { region: r } : {}),
      variants,
      extensions,
      privateUse,
    });

  // No langtags tagset for this language: there is no default to omit.
  if (row === undefined) return compose(script, region);

  const def = defaultsOf(row);
  const fullScript = script ?? def.script;
  const fullRegion = region ?? def.region;

  if (extensions.length === 0) {
    const full = formatBcp47({
      language: lang,
      extlang: [],
      ...(fullScript !== "" ? { script: fullScript } : {}),
      ...(fullRegion !== "" ? { region: fullRegion } : {}),
      variants,
      extensions: [],
      privateUse,
    });
    const exact = maps.byFull.get(full.toLowerCase());
    if (exact !== undefined) return exact[0];
  }

  return compose(
    fullScript.toLowerCase() === def.script.toLowerCase() ? undefined : fullScript,
    fullRegion.toUpperCase() === def.region.toUpperCase() ? undefined : fullRegion,
  );
}

/** The minimal form of an existing tag, or `null` when it is not well-formed. */
export function minimalTagOf(tag: string): string | null {
  const parsed = parseBcp47(tag.trim());
  if (!parsed.ok) return null;
  const p = parsed.parts;
  if (p.grandfathered !== undefined) return formatBcp47(p);
  return minimalTag({
    language: p.language,
    ...(p.script !== undefined ? { script: p.script } : {}),
    ...(p.region !== undefined ? { region: p.region } : {}),
    variants: p.variants,
    privateUse: p.privateUse,
    extensions: p.extensions,
  });
}
