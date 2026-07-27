// keyboard-base bridge (spec 036 US2, FR-014..017c, D8/D10/D12).
//
// Joins Glottolog relatedness to real keyboards: given a target language with
// no keyboard, returns ranked candidate bases — the target's own keyboard
// (direct), then same-family + same-script relatives (genealogical), then the
// caller's existing script-based fallback. One entry per keyboard, never a
// wrong-script candidate.
//
// The function is PURE with injected dependencies (research.md D8): the caller
// (studio base-resolution) supplies the langtags-backed `resolveLanguage` and
// the base-browser phonebook, so this package keeps its contracts-only edge and
// never imports engine/studio. Relatedness itself is internal — it reads the
// checked-in generated index via `relatedIsoCodes`/`byIso639p3` (offline, pure).
//
// See contracts/keyboard-base-bridge-api.md and data-model.md.

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { byIso639p3 } from "./catalog.js";
import { relatedIsoCodes } from "./index.js";
import type { Iso639P3, KeyboardBaseCandidate, Script } from "./types.js";

export type { KeyboardBaseCandidate } from "./types.js";

/** The target language the caller wants a base keyboard for. */
export interface BridgeTarget {
  /** BCP47 tag of the target language, e.g. `"byn"`, `"hi-Latn"`. */
  bcp47: string;
}

/** Result of resolving a BCP47 tag to its ISO 639-3 + chosen ISO 15924 script. */
export interface ResolvedLanguage {
  iso639p3?: Iso639P3;
  script?: Script;
}

/** Injected dependencies (D8) — supplied by the studio consumer. */
export interface BridgeDeps {
  /**
   * Langtags-backed resolver. Returns a tag's ISO 639-3 and its (chosen) ISO
   * 15924 script. Injected so glottolog never imports engine (D5/D8). The bridge
   * calls it for the target AND for every declared tag in `languagesById`, so it
   * MUST accept any BCP47 tag, not only the target.
   */
  resolveLanguage(bcp47: string): ResolvedLanguage | null;
  /** Phonebook map: keyboard id → the BCP47 tags it declares. */
  languagesById: Readonly<Record<string, readonly string[]>>;
  /**
   * OPTIONAL. The existing script-based fallback (studio's `suggestBases`),
   * injected to supply Tier 2 candidates. When omitted, Tier 2 is skipped and
   * only direct + genealogical candidates are returned.
   */
  scriptFallback?(target: {
    script: string;
    bcp47?: string;
  }): ReadonlyArray<{ keyboardId: string }>;
  /** OPTIONAL resolver keyboardId → BaseKeyboard, to populate `candidate.base`. */
  getBase?(keyboardId: string): BaseKeyboard | undefined;
}

/** Options for {@link findKeyboardBaseCandidates}. */
export interface BridgeOptions {
  /** Opt-in cap on the number of results; default: no cap (D9). */
  maxResults?: number;
}

/** A related ISO code carrying its rank + genealogical distance to the target. */
interface RelatedLink {
  iso639p3: Iso639P3;
  glottocode: string;
  /** Genealogical distance (edges to nearest common ancestor); smaller = closer. */
  distance: number;
  /** Position in the closest-first relatedness ordering; the ranking key. */
  order: number;
}

/** Tier precedence for the final ordering (direct < genealogical < fallback). */
const TIER_RANK: Record<KeyboardBaseCandidate["tier"], number> = {
  direct: 0,
  genealogical: 1,
  "script-fallback": 2,
};

/**
 * Ranked candidate base keyboards for a target language with no keyboard.
 *
 * Behaviour (contracts/keyboard-base-bridge-api.md):
 *  1. Resolve the target. With no script, script coincidence cannot be enforced
 *     → `[]` (never guesses).
 *  2. **Direct** — a keyboard declaring the target's own language AND script.
 *  3. **Genealogical** — a keyboard declaring a same-script relative (closest
 *     relatives ranked first; wrong-script relatives excluded, FR-017b/D12).
 *  4. **Script-fallback** — `deps.scriptFallback`'s same-script keyboards not
 *     already surfaced above (ranked last).
 *  5. One entry per keyboard (FR-016a), attributed to its closest supported
 *     relative; other supported relatives go into `alsoSupports`.
 *  6. Ordering: direct → genealogical (by closeness) → script-fallback; ties by
 *     `keyboardId`.
 *  7. `[]` only when every tier is empty (FR-015). Pure: no I/O; identical
 *     input ⇒ identical output.
 */
export function findKeyboardBaseCandidates(
  target: BridgeTarget,
  deps: BridgeDeps,
  opts: BridgeOptions = {},
): KeyboardBaseCandidate[] {
  const resolved = deps.resolveLanguage(target.bcp47);
  // No script ⇒ cannot enforce script coincidence ⇒ never guess (FR-017b).
  if (!resolved || !resolved.script) return [];
  const targetScript = resolved.script;
  const targetIso = resolved.iso639p3;

  // Closest-first related-ISO index, keyed by ISO (first occurrence = closest,
  // since relatedIsoCodes is already ordered closest-first). Empty when the
  // target carries no ISO — genealogical matching then has nothing to key on.
  const relatedByIso = new Map<Iso639P3, RelatedLink>();
  if (targetIso !== undefined) {
    let order = 0;
    for (const r of relatedIsoCodes(targetIso)) {
      const iso = r.languoid.iso639p3;
      if (iso === undefined || iso === targetIso) continue;
      if (relatedByIso.has(iso)) continue;
      relatedByIso.set(iso, {
        iso639p3: iso,
        glottocode: r.languoid.glottocode,
        distance: r.pathLength,
        order: order++,
      });
    }
  }

  // The target's own glottocode (for a direct candidate's closestRelative).
  const targetGlottocode =
    targetIso !== undefined ? byIso639p3(targetIso)[0]?.glottocode : undefined;

  const candidates: KeyboardBaseCandidate[] = [];
  const surfaced = new Set<string>();

  // --- Direct + genealogical tiers, from the phonebook -----------------------
  // Deterministic keyboard order (sorted ids) so ties resolve stably.
  const keyboardIds = Object.keys(deps.languagesById).sort((a, b) =>
    a.localeCompare(b),
  );
  for (const keyboardId of keyboardIds) {
    const tags = deps.languagesById[keyboardId] ?? [];
    let isDirect = false;
    let best: RelatedLink | null = null;
    const also = new Set<Iso639P3>();

    for (const tag of tags) {
      const rl = deps.resolveLanguage(tag);
      // Script coincidence is mandatory (FR-017b): a declared tag on a different
      // script never contributes, even for the target's own language.
      if (!rl || rl.script !== targetScript) continue;
      const iso = rl.iso639p3;
      if (iso === undefined) continue;

      if (targetIso !== undefined && iso === targetIso) {
        isDirect = true;
        continue;
      }
      const link = relatedByIso.get(iso);
      if (!link) continue;
      if (best === null) {
        best = link;
      } else if (link.order < best.order) {
        also.add(best.iso639p3);
        best = link;
      } else if (link.iso639p3 !== best.iso639p3) {
        also.add(link.iso639p3);
      }
    }

    if (!isDirect && best === null) continue; // no link on the target script

    surfaced.add(keyboardId);
    const base = deps.getBase?.(keyboardId);
    if (isDirect) {
      // A direct keyboard also covering relatives keeps them in alsoSupports.
      if (best !== null) also.add(best.iso639p3);
      candidates.push({
        keyboardId,
        tier: "direct",
        script: targetScript,
        closestRelative:
          targetIso !== undefined
            ? {
                iso639p3: targetIso,
                glottocode: targetGlottocode ?? "",
                distance: 0,
              }
            : null,
        alsoSupports: sortedIso(also),
        ...(base !== undefined ? { base } : {}),
      });
    } else if (best !== null) {
      candidates.push({
        keyboardId,
        tier: "genealogical",
        script: targetScript,
        closestRelative: {
          iso639p3: best.iso639p3,
          glottocode: best.glottocode,
          distance: best.distance,
        },
        alsoSupports: sortedIso(also),
        ...(base !== undefined ? { base } : {}),
      });
    }
  }

  // --- Script-fallback tier (Tier 2), only if the caller injected it ---------
  if (deps.scriptFallback) {
    const fallback = deps.scriptFallback({
      script: targetScript,
      ...(target.bcp47 !== undefined ? { bcp47: target.bcp47 } : {}),
    });
    for (const { keyboardId } of fallback) {
      if (surfaced.has(keyboardId)) continue; // already a stronger candidate
      surfaced.add(keyboardId);
      const base = deps.getBase?.(keyboardId);
      candidates.push({
        keyboardId,
        tier: "script-fallback",
        script: targetScript,
        closestRelative: null,
        alsoSupports: [],
        ...(base !== undefined ? { base } : {}),
      });
    }
  }

  // --- Ordering: direct → genealogical (by closeness) → fallback; ties by id -
  candidates.sort((a, b) => {
    const tierDelta = TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (tierDelta !== 0) return tierDelta;
    // Within genealogical, closer relative first (smaller distance). direct and
    // script-fallback carry no ordering signal beyond the tie-break.
    const da = a.closestRelative?.distance ?? 0;
    const db = b.closestRelative?.distance ?? 0;
    if (a.tier === "genealogical" && da !== db) return da - db;
    return a.keyboardId.localeCompare(b.keyboardId);
  });

  if (opts.maxResults !== undefined) {
    return candidates.slice(0, Math.max(0, opts.maxResults));
  }
  return candidates;
}

/** Deduplicated, glottocode-independent ISO list in deterministic order. */
function sortedIso(set: ReadonlySet<Iso639P3>): readonly Iso639P3[] {
  return [...set].sort((a, b) => a.localeCompare(b));
}
