// @keyboard-studio/glottolog — public catalog + relatedness surface (spec 036).
//
// A local, offline, pinned copy of Glottolog's classification tree plus the
// relatedness API that turns "language X has no keyboard" into "here are close
// relatives of X, ranked by closeness". All functions are synchronous, pure,
// and offline over the checked-in generated index (FR-006); every function is
// total (unknown/empty input → null/[], never throws).
//
// The keyboard-base bridge (US2) lands on the ./bridge subpath in a later phase.

export type {
  Glottocode,
  Iso639P3,
  Script,
  LanguoidLevel,
  LanguoidRecord,
  Languoid,
  RelatednessOptions,
  RelatednessResult,
  KeyboardBaseCandidate,
} from "./types.js";

export { getLanguoid, byIso639p3, ancestors } from "./catalog.js";
export { relatedLanguages } from "./relatedness.js";

import { byIso639p3 } from "./catalog.js";
import { compareRelatedness, isCloser, relatedLanguages } from "./relatedness.js";
import type {
  Glottocode,
  Iso639P3,
  RelatednessOptions,
  RelatednessResult,
} from "./types.js";

/**
 * ISO-in → ISO-out relatedness (FR-011a, D4). Resolves `iso` permissively,
 * unions {@link relatedLanguages} across every matched glottocode, deduplicates
 * by glottocode keeping the closest distance, and drops results with no ISO
 * 639-3 code (they cannot back a keyboard). This is what the bridge consumes.
 *
 * Never throws: an unknown/unmapped ISO yields `[]`.
 */
export function relatedIsoCodes(
  iso: Iso639P3,
  opts: RelatednessOptions = {}
): RelatednessResult[] {
  const targets = byIso639p3(iso);
  if (targets.length === 0) return [];

  // Cap only after the union — passing maxResults per-glottocode would truncate
  // before we have merged every match (D9). Cutoff/level filters do pass through.
  const innerOpts: RelatednessOptions = {
    ...(opts.minSharedDepth !== undefined
      ? { minSharedDepth: opts.minSharedDepth }
      : {}),
    ...(opts.levels !== undefined ? { levels: opts.levels } : {}),
  };

  // The input's own glottocodes are the target itself — never a "relative".
  const inputCodes = new Set<Glottocode>(targets.map((t) => t.glottocode));

  const best = new Map<Glottocode, RelatednessResult>();
  for (const t of targets) {
    for (const r of relatedLanguages(t.glottocode, innerOpts)) {
      if (r.languoid.iso639p3 === undefined) continue; // cannot back a keyboard
      if (inputCodes.has(r.languoid.glottocode)) continue;
      const existing = best.get(r.languoid.glottocode);
      if (!existing || isCloser(r, existing)) {
        best.set(r.languoid.glottocode, r);
      }
    }
  }

  const out = [...best.values()].sort(compareRelatedness);
  if (opts.maxResults !== undefined) {
    return out.slice(0, Math.max(0, opts.maxResults));
  }
  return out;
}
