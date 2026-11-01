/**
 * Full-tag lookups over every langtags tagset (not only the bare-subtag
 * defaults in ./index.ts): resolve a BCP47 tag to the fully specified
 * lang-Script-Region form langtags says it is equivalent to, list the
 * scripts langtags records for a language, and list a macrolanguage's
 * member languages.
 *
 * Generated data: ./generated/tagsets.ts (scripts/codegen-langtags.mjs).
 * The lookup maps are built on first use, so importing ./index.ts for the
 * defaults alone does not pay for them.
 */

import { tagsets } from "./generated/tagsets.js";

/** What langtags says a tag is equivalent to. */
export interface LangtagResolution {
  /** The fully specified equivalent, e.g. `"fr-Latn-BF"`. */
  full: string;
  /** The script subtag of `full`, e.g. `"Latn"`. */
  script: string;
}

interface Tagset {
  full: string;
  regions: ReadonlySet<string>;
}

let byEquivalent: Map<string, Tagset> | undefined;
let scriptsByLang: Map<string, Set<string>> | undefined;
let membersByMacro: Map<string, Set<string>> | undefined;

const REGION = /^(?:[a-z]{2}|\d{3})$/i;
const SCRIPT = /^[a-z]{4}$/i;

function splitFull(full: string): { lang: string; script: string; region: string } {
  const [lang = "", script = "", region = ""] = full.split("-");
  return { lang, script, region };
}

function load(): Map<string, Tagset> {
  if (byEquivalent !== undefined) return byEquivalent;
  byEquivalent = new Map();
  scriptsByLang = new Map();
  membersByMacro = new Map();
  for (const [tag, full, equivalents, regions, macrolang] of tagsets) {
    const set: Tagset = {
      full,
      regions: new Set(regions === "" ? [] : regions.split(" ")),
    };
    const keys = [tag, full, ...(equivalents === "" ? [] : equivalents.split(" "))];
    for (const key of keys) {
      const k = key.toLowerCase();
      if (!byEquivalent.has(k)) byEquivalent.set(k, set);
    }
    const { lang, script } = splitFull(full);
    const l = lang.toLowerCase();
    const scripts = scriptsByLang.get(l) ?? new Set<string>();
    scripts.add(script);
    scriptsByLang.set(l, scripts);
    if (macrolang !== "") {
      const m = macrolang.toLowerCase();
      const members = membersByMacro.get(m) ?? new Set<string>();
      members.add(l);
      membersByMacro.set(m, members);
    }
  }
  return byEquivalent;
}

/**
 * Resolve a tag (case-insensitive) to its langtags equivalent, or `null`
 * when langtags does not know it. A tag is known when it is a tagset's
 * tag, full form, or listed equivalent, or when it is one of those (with
 * no region) plus a region the tagset lists as also using it — `fr-BF`
 * resolves to `fr-Latn-BF` because `fr` lists BF.
 */
export function resolveLangtag(tag: string): LangtagResolution | null {
  const index = load();
  const key = tag.trim().toLowerCase();
  const exact = index.get(key);
  if (exact !== undefined) {
    return { full: exact.full, script: splitFull(exact.full).script };
  }
  const parts = key.split("-");
  const region = parts.pop();
  if (region === undefined || parts.length === 0 || !REGION.test(region)) {
    return null;
  }
  // The prefix must carry no region of its own (fr-CA-BF is not a tag).
  if (parts.slice(1).some((p) => REGION.test(p))) return null;
  const prefix = index.get(parts.join("-"));
  if (prefix === undefined || !prefix.regions.has(region.toUpperCase())) {
    return null;
  }
  const { lang, script } = splitFull(prefix.full);
  return { full: `${lang}-${script}-${region.toUpperCase()}`, script };
}

/** The scripts langtags records for a language subtag (sorted), or []. */
export function langtagsScripts(lang: string): readonly string[] {
  load();
  return [...(scriptsByLang?.get(lang.toLowerCase()) ?? [])].sort();
}

/**
 * The member language subtags langtags lists for a macrolanguage subtag
 * (sorted), or [] when it is not one — `qu` lists `qub`, `qud`, ...
 */
export function macrolanguageMembers(lang: string): readonly string[] {
  load();
  return [...(membersByMacro?.get(lang.toLowerCase()) ?? [])].sort();
}

/** True when a subtag is shaped like a script subtag (`Latn`). */
export function isScriptSubtag(subtag: string): boolean {
  return SCRIPT.test(subtag);
}

/** True when a subtag is shaped like a region subtag (`NG`, `419`). */
export function isRegionSubtag(subtag: string): boolean {
  return REGION.test(subtag);
}
