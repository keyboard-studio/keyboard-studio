// ---------------------------------------------------------------------------
// Shared BCP47 helpers — a single canonical place for tag parsing so engine
// and studio consumers use the same logic instead of near-identical private
// copies (see scriptSubtagOf's docstring for the callers this replaces).
// ---------------------------------------------------------------------------

import type { LanguageDefaults } from "../langtags";

/**
 * Explicit ISO 15924 script subtag of a BCP47 tag (e.g. the "Latn" in
 * "az-Latn"), title-cased, read via `parseBcp47`. The script is only ever read
 * from its grammatical slot (after the language and any extlang, before the
 * region), never past a variant, extension singleton or private-use subtag, so
 * "lif-x-Deva" and "en-u-co-phon" yield `undefined`. Malformed tags yield
 * `undefined`.
 *
 * Single canonical implementation; it replaced near-identical loops in the
 * engine's characterMap.ts and suggestMissing.ts and the studio's suggestStart.ts.
 *
 * @param tag  Full BCP47 tag, e.g. "az-Latn" or "hi".
 */
export function scriptSubtagOf(tag: string): string | undefined {
  const r = parseBcp47(tag);
  return r.ok ? r.parts.script : undefined;
}

/**
 * The region subtag of a BCP47 tag (alpha-2 or 3-digit M.49), uppercased, read
 * via `parseBcp47`. Never read past a variant, extension or private-use
 * subtag, so "en-x-001" yields `undefined`. Malformed tags yield `undefined`.
 */
export function regionSubtagOf(tag: string): string | undefined {
  const r = parseBcp47(tag);
  return r.ok ? r.parts.region : undefined;
}

/**
 * Resolves the ISO 15924 script code for a BCP47 tag: an explicit script
 * subtag (`scriptSubtagOf`) wins; otherwise falls back to the langtags
 * default script for the tag's primary language subtag.
 *
 * The langtags lookup is a caller-supplied accessor rather than a direct
 * import, because callers reach that data through very different paths —
 * engine's characterMap.ts imports it eagerly; the studio lazy-loads a
 * separate chunk it deliberately keeps out of the initial bundle
 * (FR-011/SC-005) — and this helper must not force either loading strategy.
 * Pass `null`/`undefined` from the accessor to mean "unknown or not yet
 * loaded"; this function does not distinguish the two, since neither can
 * contribute a script.
 *
 * Single canonical algorithm — was previously duplicated (with the same
 * explicit-wins-else-langtags-default logic) in engine's characterMap.ts
 * (`resolveScript`) and studio's irToCarveNodes.ts (`targetScriptIsLatin`).
 * Callers that need a Latin/non-Latin verdict rather than the raw script
 * code (e.g. studio's fail-open-to-Latin behavior on an absent tag or an
 * unloaded module) apply that interpretation on top of this function's
 * result themselves — it is caller-specific, not part of the shared algorithm.
 *
 * @param bcp47 Full BCP47 tag, or null/undefined/empty for "no tag known".
 * @param getLanguageDefaults Accessor returning the langtags default record
 *   for a primary subtag (case-insensitive), or null/undefined if unknown or
 *   not yet loaded.
 * @returns The ISO 15924 script code, or undefined if it cannot be resolved.
 */
export function resolveEffectiveScript(
  bcp47: string | null | undefined,
  getLanguageDefaults: (primarySubtag: string) => LanguageDefaults | null | undefined,
): string | undefined {
  if (!bcp47) return undefined;
  const explicit = scriptSubtagOf(bcp47);
  if (explicit !== undefined) return explicit;
  const primary = bcp47.split("-")[0] ?? "";
  return getLanguageDefaults(primary)?.defaultScript;
}

// ---------------------------------------------------------------------------
// Structured BCP47 tag types (spec 115, data-model.md "Bcp47Parts"). Types
// only; `parseBcp47` / `formatBcp47` are implemented separately.
// ---------------------------------------------------------------------------

/** One extension: a singleton (not `x`) and its subtags (each 2-8 alphanumerics). */
export interface Bcp47Extension {
  singleton: string;
  subtags: string[];
}

/** The parsed form of a BCP47 tag. Produced by `parseBcp47`, consumed by `formatBcp47`. */
export interface Bcp47Parts {
  /** 2-3 letters, or 4-8 (registered long form); lowercase on format. */
  language: string;
  /** Up to 3 extlang subtags, 3 letters each. */
  extlang: string[];
  /** 4 letters; title case on format. */
  script?: string;
  /** 2 letters or 3 digits; uppercase on format. */
  region?: string;
  /** Each 5-8 alphanumerics or a digit + 3 alphanumerics; no case-insensitive duplicates; lowercase. */
  variants: string[];
  /** Extensions; no repeated singleton. */
  extensions: Bcp47Extension[];
  /** Subtags after `-x-`; each 1-8 alphanumerics; lowercase. */
  privateUse: string[];
  /** Set only for the irregular registered tags (e.g. `i-klingon`). */
  grandfathered?: string;
}

/** Why `parseBcp47` rejected a tag. */
export type Bcp47ParseErrorReason =
  | "empty"
  | "bad-language"
  | "bad-subtag"
  | "out-of-order"
  | "duplicate-variant"
  | "duplicate-singleton"
  | "empty-extension"
  | "bad-private-use";

/** Failure branch of `parseBcp47`'s result. `at` is the offending subtag index. */
export interface Bcp47ParseError {
  ok: false;
  reason: Bcp47ParseErrorReason;
  at: number;
}

/** Result of `parseBcp47`. */
export type Bcp47ParseResult = { ok: true; parts: Bcp47Parts } | Bcp47ParseError;

// ---------------------------------------------------------------------------
// Parser (spec 115, contracts/bcp47-parser.md, research R1). Pure functions, no
// data imports, so this module stays safe for /api bundling.
// ---------------------------------------------------------------------------

/** Irregular grandfathered tags (RFC 5646 section 2.2.8), lowercase. */
const IRREGULAR_GRANDFATHERED: ReadonlySet<string> = new Set([
  "en-gb-oed", "i-ami", "i-bnn", "i-default", "i-enochian", "i-hak", "i-klingon",
  "i-lux", "i-mingo", "i-navajo", "i-pwn", "i-tao", "i-tay", "i-tsu",
  "sgn-be-fr", "sgn-be-nl", "sgn-ch-de",
]);

const ALPHA = /^[A-Za-z]+$/;
const ALNUM = /^[A-Za-z0-9]+$/;
const DIGIT = /^[0-9]+$/;

function fail(reason: Bcp47ParseErrorReason, at: number): Bcp47ParseError {
  return { ok: false, reason, at };
}

function isVariantSubtag(s: string): boolean {
  if (!ALNUM.test(s)) return false;
  if (s.length >= 5 && s.length <= 8) return true;
  return s.length === 4 && /^[0-9]/.test(s);
}

/**
 * Parses a BCP47 tag into its parts, or reports why it is not well-formed.
 * Syntax only (RFC 5646 section 2.1): no registry lookup. Language, script,
 * region, variants, extensions and private use are normalized to their
 * canonical case; variant order is kept as written. `at` is the index of the
 * offending hyphen-separated subtag.
 */
export function parseBcp47(tag: string): Bcp47ParseResult {
  if (tag === "") return fail("empty", 0);
  const subtags = tag.split("-");
  const lower = tag.toLowerCase();

  if (IRREGULAR_GRANDFATHERED.has(lower)) {
    return {
      ok: true,
      parts: { language: "", extlang: [], variants: [], extensions: [], privateUse: [], grandfathered: lower },
    };
  }

  const parts: Bcp47Parts = { language: "", extlang: [], variants: [], extensions: [], privateUse: [] };
  let i = 0;

  const first = subtags[0] ?? "";
  if (first.toLowerCase() !== "x") {
    if (!ALPHA.test(first) || first.length < 2 || first.length > 8) {
      return fail("bad-language", 0);
    }
    parts.language = first.toLowerCase();
    i = 1;
    // Extlang: only after a 2-3 letter language; up to three 3-letter subtags.
    if (first.length <= 3) {
      while (parts.extlang.length < 3) {
        const s = subtags[i];
        if (s !== undefined && s.length === 3 && ALPHA.test(s)) {
          parts.extlang.push(s.toLowerCase());
          i++;
        } else break;
      }
    }
    let s = subtags[i];
    if (s !== undefined && s.length === 4 && ALPHA.test(s)) {
      parts.script = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      i++;
    }
    s = subtags[i];
    if (s !== undefined && ((s.length === 2 && ALPHA.test(s)) || (s.length === 3 && DIGIT.test(s)))) {
      parts.region = s.toUpperCase();
      i++;
    }
    const seen = new Set<string>();
    for (; i < subtags.length; i++) {
      const v = subtags[i] ?? "";
      if (!isVariantSubtag(v)) break;
      const lv = v.toLowerCase();
      if (seen.has(lv)) return fail("duplicate-variant", i);
      seen.add(lv);
      parts.variants.push(lv);
    }
    const singletons = new Set<string>();
    while (i < subtags.length) {
      const sing = (subtags[i] ?? "").toLowerCase();
      if (sing.length !== 1 || sing === "x" || !ALNUM.test(sing)) break;
      if (singletons.has(sing)) return fail("duplicate-singleton", i);
      singletons.add(sing);
      const ext: Bcp47Extension = { singleton: sing, subtags: [] };
      const at = i;
      i++;
      while (i < subtags.length) {
        const e = subtags[i] ?? "";
        if (e.length < 2 || e.length > 8 || !ALNUM.test(e)) break;
        ext.subtags.push(e.toLowerCase());
        i++;
      }
      if (ext.subtags.length === 0) return fail("empty-extension", at);
      parts.extensions.push(ext);
    }
  }

  if (i < subtags.length) {
    const s = subtags[i] ?? "";
    if (s.toLowerCase() !== "x") {
      // A region-shaped subtag that arrives after the region slot (or after
      // variants) is out of order; anything else is simply not a valid subtag.
      const regionShaped = (s.length === 2 && ALPHA.test(s)) || (s.length === 3 && DIGIT.test(s));
      return fail(regionShaped && parts.language !== "" ? "out-of-order" : "bad-subtag", i);
    }
    const start = i;
    i++;
    if (i >= subtags.length) return fail("bad-private-use", start);
    for (; i < subtags.length; i++) {
      const p = subtags[i] ?? "";
      if (p.length < 1 || p.length > 8 || !ALNUM.test(p)) return fail("bad-private-use", i);
      parts.privateUse.push(p.toLowerCase());
    }
  }

  return { ok: true, parts };
}

/**
 * Canonical string form of parsed parts: language lowercase, script title
 * case, region uppercase, everything else lowercase, in grammar order. Only
 * changes case; never reorders variants or drops a subtag.
 */
export function formatBcp47(parts: Bcp47Parts): string {
  if (parts.grandfathered !== undefined) return parts.grandfathered;
  const out: string[] = [];
  if (parts.language !== "") out.push(parts.language.toLowerCase());
  for (const e of parts.extlang) out.push(e.toLowerCase());
  if (parts.script !== undefined) out.push(parts.script.charAt(0).toUpperCase() + parts.script.slice(1).toLowerCase());
  if (parts.region !== undefined) out.push(parts.region.toUpperCase());
  for (const v of parts.variants) out.push(v.toLowerCase());
  for (const e of parts.extensions) out.push(e.singleton.toLowerCase(), ...e.subtags.map((t) => t.toLowerCase()));
  if (parts.privateUse.length > 0) out.push("x", ...parts.privateUse.map((t) => t.toLowerCase()));
  return out.join("-");
}

/** True exactly when `parseBcp47(tag)` succeeds. */
export function isWellFormedBcp47(tag: string): boolean {
  return parseBcp47(tag).ok;
}
