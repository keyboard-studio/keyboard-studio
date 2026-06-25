// Ranked base-keyboard list for the ARIA combobox picker.
//
// Context tiers (ctxTier — lower = better match to the author's (language, script) target):
//   0 — script equals target.script AND target's primary language subtag is in the
//       base's declared languages (best contextual fit)
//   1 — script match only
//   2 — language match but script differs, ONLY when target.bcp47 has no explicit
//       script subtag (hasExplicitScriptSubtag guard per spec §8/§9 decoupling)
//   3 — no contextual match (or target not provided → all bases land here)
//
// Query tiers (queryTier — lower = stronger text match, applied when query !== ""):
//   0 — exact id === q  OR  script.toLowerCase() === q
//   1 — some languages tag equals q  OR  its primarySubtag equals q
//   2 — id.startsWith(q)  OR  displayName.toLowerCase().startsWith(q)
//   3 — id.includes(q)  OR  displayName.toLowerCase().includes(q)
//   4 — matched only via script/language substring (not id/displayName)
//
// Exact-script-match deliberately floods the top of tier 0/1 (AC#1).
// The function is pure and total — no throws.

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { primarySubtag, hasExplicitScriptSubtag, type SuggestTarget } from "./suggestBase.ts";

export interface RankedBase {
  base: BaseKeyboard;
  matchRanges?: { field: "displayName" | "id"; start: number; end: number }[];
}

export function rankBases(
  bases: readonly BaseKeyboard[],
  query: string,
  target?: SuggestTarget,
  languagesById?: Record<string, readonly string[]>,
): RankedBase[] {
  const targetScript = target?.script;
  const targetBcp47 = target?.bcp47;
  // A target with primary subtag `und` (e.g. `und-fonipa` IPA) never reaches ctxTier 0 by
  // design — real bases declare concrete languages, so IPA/undetermined targets correctly
  // fall to script-match (tier 1) or no-match (tier 3).
  const targetLang = targetBcp47 !== undefined ? primarySubtag(targetBcp47) : undefined;
  const explicitScript =
    targetBcp47 !== undefined ? hasExplicitScriptSubtag(targetBcp47) : false;

  function ctxTier(base: BaseKeyboard): number {
    if (targetScript === undefined) return 3;
    // Exact ISO-15924 string equality is intentional: paired/related codes (e.g. Hans/Hant,
    // Qaag/Mymr) deliberately do NOT cross-match — that is a data-tagging concern, not ranking.
    const scriptMatch = base.script === targetScript;
    const langs = languagesById?.[base.id] ?? base.languages ?? [];
    const languageDeclared =
      targetLang !== undefined &&
      langs.some((tag) => primarySubtag(tag) === targetLang);
    if (scriptMatch && languageDeclared) return 0;
    if (scriptMatch) return 1;
    if (languageDeclared && !explicitScript) return 2;
    return 3;
  }

  const trimmed = query.trim();

  // ---- Empty query: return all sorted by ctxTier then id ----
  if (trimmed === "") {
    const sorted = bases.slice().sort((a, b) => {
      const tierDiff = ctxTier(a) - ctxTier(b);
      if (tierDiff !== 0) return tierDiff;
      return a.id.localeCompare(b.id);
    });
    return sorted.map((base) => ({ base }));
  }

  // ---- Non-empty query ----
  const q = trimmed.toLowerCase();

  // Compute first hit matchRange for a base.
  function matchRange(base: BaseKeyboard): { field: "displayName" | "id"; start: number; end: number } | undefined {
    const dn = base.displayName.toLowerCase();
    const idx = dn.indexOf(q);
    if (idx !== -1) return { field: "displayName", start: idx, end: idx + q.length };
    const idIdx = base.id.toLowerCase().indexOf(q);
    if (idIdx !== -1) return { field: "id", start: idIdx, end: idIdx + q.length };
    return undefined;
  }

  // Returns queryTier (0–4) or -1 if no match.
  function queryTier(base: BaseKeyboard): number {
    const idLc = base.id.toLowerCase();
    const dnLc = base.displayName.toLowerCase();
    const scriptLc = base.script.toLowerCase();
    const langs = languagesById?.[base.id] ?? base.languages ?? [];

    // tier 0: exact id or exact script
    if (idLc === q || scriptLc === q) return 0;
    // tier 1: exact language tag or exact primary subtag
    if (langs.some((tag) => tag.toLowerCase() === q || primarySubtag(tag) === q)) return 1;
    // tier 2: id or displayName prefix
    if (idLc.startsWith(q) || dnLc.startsWith(q)) return 2;
    // tier 3: id or displayName substring
    if (idLc.includes(q) || dnLc.includes(q)) return 3;
    // tier 4: script or language substring match only
    if (scriptLc.includes(q) || langs.some((tag) => tag.toLowerCase().includes(q))) return 4;
    // no match
    return -1;
  }

  const results: Array<{ base: BaseKeyboard; qTier: number; cTier: number; range: ReturnType<typeof matchRange> }> = [];

  for (const base of bases) {
    const qTier = queryTier(base);
    if (qTier === -1) continue;
    // Tier-4 matches only on script/language substring — no id/displayName range to highlight.
    const range = qTier < 4 ? matchRange(base) : undefined;
    results.push({ base, qTier, cTier: ctxTier(base), range });
  }

  results.sort((a, b) => {
    if (a.qTier !== b.qTier) return a.qTier - b.qTier;
    if (a.cTier !== b.cTier) return a.cTier - b.cTier;
    return a.base.id.localeCompare(b.base.id);
  });

  return results.map(({ base, range }) => {
    const rb: RankedBase = { base };
    if (range !== undefined) rb.matchRanges = [range];
    return rb;
  });
}
