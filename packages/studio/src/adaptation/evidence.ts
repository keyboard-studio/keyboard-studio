// AdaptationEvidence — the injected, mockable input to firing-condition
// evaluation (spec 038, research Decision 3; contract §1).
//
// This is the seam that lets the whole feature be authored and unit-tested
// against a MOCKED facet index today. The live provider (which assembles this
// bundle from docs/keyboard-facet-index.json for a target language + base) is an
// explicit follow-up feature and deliberately not implemented here. Everything
// downstream (firing, posture) takes this bundle as data, so tests construct it
// directly — mirroring the glottolog-bridge / classifier injected-deps
// convention (Decision 2).

/**
 * A snapshot of the classified facet evidence for one (target language, base)
 * pair. Not persisted — assembled on demand from the facet index (036/037).
 * Every field carries the tier that produced it so §3c chips can name it.
 */
export interface AdaptationEvidence {
  /** The confirmed target script (BCP47 subtag), from `il_target_script`. */
  targetScript: string;

  /**
   * The base keyboard's script distribution — script subtag → share (sums ≈ 1).
   * From the `script` keyboard-facet.
   */
  baseScriptDistribution: Record<string, number>;

  /**
   * How related-language keyboards spread across scripts — script → keyboard
   * count. From `lineage/siblings` crossed with the index.
   */
  siblingScriptSpread: Record<string, number>;

  /** The base's Latin sub-profile (null when the base is not Latin). */
  latinSubProfile: "plain" | "extended" | "ipa" | null;

  /**
   * The base's input-method strategy fingerprint — recognized-strategy shares
   * plus an unrecognized `residue` (037 FR-012). From `strategy-fingerprint`.
   */
  strategyFingerprint: { distribution: Record<string, number>; residue: number };

  /** Device categories the base actually ships. From the `target-mix` facet. */
  baseTargetMix: Array<"desktop" | "touch" | "web">;

  /** Device categories the author declared for THIS keyboard (env.device-mix). */
  statedDeviceMix: Array<"desktop" | "touch" | "web">;

  /** The provenance tier that produced these values (the weakest wins). */
  provenanceTier: "content-derived" | "declared-metadata" | "language-default";
}

/**
 * Provider seam. The live implementation (follow-up feature) reads the committed
 * facet index; tests and the current studio inject a mock. Kept as an interface
 * so the firing/posture surfaces never import an index path.
 */
export interface AdaptationEvidenceProvider {
  /** Assemble the evidence bundle for a (target language, base keyboard) pair. */
  evidenceFor(targetLanguage: string, baseId: string): AdaptationEvidence;
}

/**
 * [key, share] of the largest entry in a distribution (["", 0] when empty).
 * Shared by firing.ts (script classification) and posture.ts (default posture)
 * so both readings of "what dominates this distribution" agree by construction.
 */
export function dominantEntry(dist: Record<string, number>): [string, number] {
  let best: [string, number] = ["", 0];
  for (const [key, share] of Object.entries(dist)) {
    if (share > best[1]) best = [key, share];
  }
  return best;
}
