// Adapter over vendored CLDR exemplar characters (UTS #35 / LDML). The exemplar set is
// the authoritative answer to "which characters does this language actually write" --
// it drives BOTH key availability (a base key whose letter isn't an exemplar is free)
// and, optionally, the special-character inventory itself (the non-ASCII exemplars).
//
// Data is per-locale data/cldr/<locale>.json (fetch-data.ts). Returns null if absent.

import fs from "fs";
import path from "node:path";
import { pkgRoot } from "../pkg-root.js";

function exemplarString(locale: string): string | null {
  const file = path.join(pkgRoot(), "data", "cldr", `${locale}.json`);
  let j: unknown;
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null) return null;
  const main = (j as Record<string, unknown>)["main"];
  if (typeof main !== "object" || main === null) return null;
  const localeData = (main as Record<string, unknown>)[locale];
  if (typeof localeData !== "object" || localeData === null) return null;
  const characters = (localeData as Record<string, unknown>)["characters"];
  if (typeof characters !== "object" || characters === null) return null;
  const ch = (characters as Record<string, unknown>)["exemplarCharacters"];
  return typeof ch === "string" ? ch : null;
}

export interface ExemplarResult {
  raw: string;
  used: Set<string>;
  digraphs: string[];
  specials: string[];
}

// Minimal UnicodeSet parser for the "[a b ɓ ... {sh} {ts} ... a-z]" exemplar syntax.
// Returns { used:Set<char single>, digraphs:[str], specials:[char non-ASCII single] }.
export function parseUnicodeSet(str: string): { used: Set<string>; digraphs: string[]; specials: string[] } {
  const used = new Set<string>();
  const digraphs: string[] = [];
  let s = str.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === undefined) continue;
    if (c === " ") continue;
    if (c === "\\") {
      const n = chars[++i];
      if (n) used.add(n);
      continue;
    }
    if (c === "{") {
      // multi-char exemplar, e.g. {sh}
      let g = "";
      while (i + 1 < chars.length && chars[i + 1] !== "}") g += chars[++i];
      i++; // skip '}'
      digraphs.push(g);
      for (const gc of g) used.add(gc);
      continue;
    }
    // range a-z
    if (chars[i + 1] === "-" && chars[i + 2] && chars[i + 2] !== " ") {
      const start = c.codePointAt(0);
      const endChar = chars[i + 2];
      const end = endChar !== undefined ? endChar.codePointAt(0) : undefined;
      if (start !== undefined && end !== undefined) {
        for (let cp = start; cp <= end; cp++) used.add(String.fromCodePoint(cp));
      }
      i += 2;
      continue;
    }
    used.add(c);
  }
  const specials = [...used].filter((ch) => (ch.codePointAt(0) ?? 0) > 0x7f && /\p{L}/u.test(ch));
  return { used, digraphs, specials };
}

// Load exemplars for a locale. specials include uppercase variants where they differ.
export function loadExemplars(locale: string): ExemplarResult | null {
  const str = exemplarString(locale);
  if (!str) return null;
  const parsed = parseUnicodeSet(str);
  const specials = new Set(parsed.specials);
  for (const ch of parsed.specials) {
    const up = ch.toUpperCase();
    if (up !== ch && [...up].length === 1) specials.add(up);
  }
  return { raw: str, used: parsed.used, digraphs: parsed.digraphs, specials: [...specials] };
}
