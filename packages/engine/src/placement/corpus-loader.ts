import type { PlacementMap, PlacementEntry, PlacementCandidate } from "@keyboard-studio/contracts";
import type { PlacementPriorsJSON } from "./model.js";
import { isStandardKey } from "./filters.js";

/**
 * The MAJOR version of `placement-priors.json` this loader understands
 * (placement-priors v2). `corpusPriorsToPlacementMap` fails closed on a
 * mismatch rather than silently misreading a shape it does not understand —
 * see `PlacementPriorsJSON`'s versioning note in model.ts.
 */
const SUPPORTED_MAJOR_VERSION = 2;

/** Parse the leading MAJOR component of a semver-style version string. */
function majorVersionOf(version: string): number | null {
  const m = /^(\d+)\./.exec(version);
  if (!m) return null;
  const major = m[1];
  return major !== undefined ? parseInt(major, 10) : null;
}

/**
 * Minimum number of independent keyboards that must agree on a placement
 * before it is eligible to appear as a gallery suggestion.
 * A single-keyboard signal is noise; require at least 2.
 */
const MIN_PRIOR_COUNT = 2;

/**
 * NCAPS (NumLock-equivalent modifier) is idiomatic in Myanmar/Ethiopic
 * keyboards but is not a modifier a Latin-script keyboard author would use.
 * Exclude any candidate that requires NCAPS to be in any modifier position.
 */
function hasNcapsModifier(modifiers: string[]): boolean {
  return modifiers.includes("NCAPS");
}

/**
 * Coarse mechanism CLASS a candidate belongs to, for the class-retention
 * policy below: `"direct"` (S-01/S-08) is one class; `"deadkey"` and
 * `"store-index"` (both S-02) are pooled into a single `"deadkeyFamily"`
 * class — they are the two `.kmn` shapes the same S-02 strategy card can
 * take, not two independent mechanisms. `"opaque"` candidates never reach
 * `placement-priors.json` (see `emitPlacementMap`/`deadkey.ts`), so they have
 * no class here.
 */
type MechClass = "direct" | "deadkeyFamily";

function mechClassOf(mechanism: PlacementCandidate["mechanism"]): MechClass | null {
  if (mechanism === "direct") return "direct";
  if (mechanism === "deadkey" || mechanism === "store-index") return "deadkeyFamily";
  return null;
}

/**
 * Class-retention policy (P0 fix): `MIN_PRIOR_COUNT` alone can strip EVERY
 * candidate of a mechanism class (`"direct"` vs the deadkey/store-index
 * family) for a codepoint, even though the raw corpus DID attest that class
 * — e.g. a well-attested S-02 deadkey candidate alongside a single-keyboard
 * S-08 RALT candidate. Silently dropping the RALT candidate regresses a
 * placement the v1 seeder used to suggest.
 *
 * Given `eligible` (candidates that already pass the standard-key / NCAPS
 * shape filters, priorCount not yet applied) and `qualified` (the same list
 * after the `priorCount >= MIN_PRIOR_COUNT` filter), return the additional
 * candidates to retain: for each mechanism class attested in `eligible` but
 * with zero survivors in `qualified`, the single best (highest `priorCount`,
 * ties broken by `eligible`'s existing order) candidate of that class.
 *
 * Does not fire for a class that already has a `qualified` survivor — the
 * policy exists to prevent total loss of a class, not to pad an
 * already-represented one.
 */
function retainedByClass(
  eligible: PlacementCandidate[],
  qualified: PlacementCandidate[],
): PlacementCandidate[] {
  const retained: PlacementCandidate[] = [];
  for (const cls of ["direct", "deadkeyFamily"] as const) {
    const classEligible = eligible.filter((c) => mechClassOf(c.mechanism) === cls);
    if (classEligible.length === 0) continue;
    const hasSurvivor = qualified.some((c) => mechClassOf(c.mechanism) === cls);
    if (hasSurvivor) continue;
    const best = classEligible.reduce((a, b) => (b.priorCount > a.priorCount ? b : a));
    retained.push(best);
  }
  return retained;
}

/**
 * Convert a PlacementPriorsJSON (corpus-extracted, keyed by 4-char hex)
 * into the PlacementMap shape that MechanismGallery accepts.
 *
 * Confidence renormalization: renormalize per-codepoint so confidence =
 * priorCount / totalCount (fraction of keyboards that chose this placement
 * for this character). The gallery's suggestion threshold (> 0.5, strictly)
 * fires only when one placement has a strict majority of corpus votes.
 *
 * Candidates with priorCount < MIN_PRIOR_COUNT are stripped before
 * renormalization so single-keyboard outliers cannot win by tie-breaking.
 *
 * **Fails closed on a MAJOR version mismatch** (placement-priors v2): a
 * `placement-priors.json` whose `version` MAJOR component this loader does
 * not recognise throws immediately, rather than silently misreading a shape
 * it doesn't understand (e.g. a future v3 rename/removal).
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 * @see packages/contracts/src/placementMap.ts (PlacementMap shape)
 */
export function corpusPriorsToPlacementMap(priors: PlacementPriorsJSON): PlacementMap {
  const major = majorVersionOf(priors.version);
  if (major === null || major !== SUPPORTED_MAJOR_VERSION) {
    throw new Error(
      `placement-priors.json major version mismatch: this loader supports ` +
        `${SUPPORTED_MAJOR_VERSION}.x.x, got "${priors.version}". Regenerate ` +
        `placement-priors.json with the current supportability-scanner, or ` +
        `update corpus-loader.ts if this is an intentional format bump.`,
    );
  }

  const entries: PlacementEntry[] = [];

  for (const [hexKey, entry] of Object.entries(priors.entries)) {
    if (entry.placements.length === 0) continue;

    // Drop ASCII (U+0000–U+007F): those characters are already on the keyboard
    // and do not need placement suggestions.
    const cp = parseInt(hexKey, 16);
    if (cp <= 0x007f) continue;

    // Drop non-physical keys and NCAPS candidates (priorCount is checked
    // separately below, per the class-retention policy).
    const eligible = entry.placements.filter(
      (c) => isStandardKey(c.vkey) && !hasNcapsModifier(c.modifiers),
    );
    if (eligible.length === 0) continue;

    // Drop single-keyboard outliers.
    const qualified = eligible.filter((c) => c.priorCount >= MIN_PRIOR_COUNT);

    // Class-retention (P0 fix): a mechanism class attested in `eligible` that
    // lost ALL its candidates to the MIN_PRIOR_COUNT filter keeps its single
    // best candidate, so a low-support-but-corpus-attested mechanism (e.g. an
    // S-08 RALT candidate alongside a well-attested S-02 deadkey one) doesn't
    // vanish entirely — see `retainedByClass`.
    const retained = retainedByClass(eligible, qualified);
    const survivors = [...qualified, ...retained];
    if (survivors.length === 0) continue;

    // Sort by priorCount descending.
    const sorted = [...survivors].sort((a, b) => b.priorCount - a.priorCount);

    // Per-codepoint renormalization: confidence = priorCount / totalCount,
    // where totalCount is the sum of `qualified` (genuinely-attested)
    // priorCounts only — a `retained` candidate never dilutes the confidence
    // of the class(es) that actually cleared MIN_PRIOR_COUNT. A strict
    // majority (> 0.5) is required by the gallery threshold, so a suggestion
    // fires only when one placement has more corpus votes than all other
    // QUALIFIED others combined.
    //
    // A `retained` candidate's own confidence is scored relative to
    // MIN_PRIOR_COUNT instead (priorCount / MIN_PRIOR_COUNT, capped at 1) —
    // it reflects how close its low support came to the qualifying bar,
    // deliberately never inflated to parity with a qualified candidate's
    // renormalized confidence (which is always 1 when it is the codepoint's
    // sole qualified candidate).
    const retainedSet = new Set(retained);
    const qualifiedTotalCount = qualified.reduce((sum, c) => sum + c.priorCount, 0);
    const renormalized = sorted.map((c) => ({
      ...c,
      confidence: retainedSet.has(c)
        ? Math.min(1, c.priorCount / MIN_PRIOR_COUNT)
        : qualifiedTotalCount > 0
          ? c.priorCount / qualifiedTotalCount
          : 0,
    }));

    entries.push({
      codepoint: `U+${hexKey.toUpperCase().padStart(4, "0")}`,
      candidates: renormalized,
    });
  }

  return {
    entries,
    pinnedPriorsVersion: priors.version,
    ...(priors.touch !== undefined ? { touch: priors.touch } : {}),
  };
}
