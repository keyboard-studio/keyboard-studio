// Inheritance-posture builder (spec 038 US2; contract §2).
//
// The per-facet keep/propose/discard answer set for a session's confirmed base.
// ONE posture entry governs MANY downstream proposal sites for that facet — the
// en-masse lever (FR-005). Pure builder, mirroring buildPrefillRows in
// Prefill.tsx: unit-testable, no React, no side effects.
//
// A skipped step yields all-`default` entries (US2 sc.4) — never blank. An
// individual proposal-site override is LOCAL: it does not mutate the
// PostureEntry (the override rides on the proposal, and its chip reflects it);
// that locality lives in the consuming surface, so this module never exposes a
// posture-entry mutator.

import type { AdaptationEvidence } from "./evidence.ts";
import { dominantEntry } from "./evidence.ts";
import { TRUST_POLICY_DEFAULTS } from "./trustPolicy.ts";

export type PostureFacet = "script" | "input-strategies" | "device-targets" | "script-conventions";

export interface PostureEntry {
  facet: PostureFacet;
  posture: "keep" | "propose" | "discard";
  source: "default" | "confirmed" | "overridden";
  /** The fingerprint/evidence that prefilled this entry (the §3c provenance). */
  provenance: string;
}

export interface InheritancePosture {
  /** The confirmed base; posture is per-base and re-fires on a base switch. */
  baseId: string;
  entries: PostureEntry[];
}

/** Sorted "a, b, c" device list for stable provenance strings. */
function fmtMix(mix: readonly string[]): string {
  return [...mix].sort().join(", ") || "none";
}

/**
 * Build the default posture from the evidence. Every facet gets an entry with
 * `source: "default"` and a sensible §3c posture — never blank, so a skipped
 * step is a full set of defaults the author can accept en masse.
 */
export function buildPosture(evidence: AdaptationEvidence, baseId: string): InheritancePosture {
  const { distribution, residue } = evidence.strategyFingerprint;
  const hasFingerprint = residue < 1 && Object.keys(distribution).length > 0;
  const [domScript, domShare] = dominantEntry(evidence.baseScriptDistribution);
  const deviceMatch = sameSet(evidence.baseTargetMix, evidence.statedDeviceMix);

  const entries: PostureEntry[] = [
    {
      facet: "script",
      // Re-derive for the chosen target unless the base is at or above the same
      // single-script threshold classifyBaseScript (firing.ts) uses — the two
      // paths must agree on what counts as "cleanly single-script".
      posture: domShare >= TRUST_POLICY_DEFAULTS.singleScriptThreshold ? "keep" : "propose",
      source: "default",
      provenance: `base script: ${domScript || "unknown"} (${Math.round(domShare * 100)}% of rules)`,
    },
    {
      facet: "input-strategies",
      posture: hasFingerprint ? "keep" : "propose",
      source: "default",
      provenance: hasFingerprint
        ? `base strategy fingerprint (${Math.round((1 - residue) * 100)}% recognized)`
        : "no recognized strategy fingerprint in the base",
    },
    {
      facet: "device-targets",
      posture: deviceMatch ? "keep" : "propose",
      source: "default",
      provenance: `base ships ${fmtMix(evidence.baseTargetMix)}; you target ${fmtMix(evidence.statedDeviceMix)}`,
    },
    {
      facet: "script-conventions",
      posture: "propose",
      source: "default",
      provenance: `base neutral-residue conventions (${evidence.provenanceTier})`,
    },
  ];
  return { baseId, entries };
}

/**
 * The en-masse read (FR-005): return the entry governing a facet. One entry, one
 * read, many proposal sites. Falls back to a synthesized default entry if the
 * posture is missing that facet (buildPosture always supplies all four).
 */
export function postureFor(posture: InheritancePosture, facet: PostureFacet): PostureEntry {
  const found = posture.entries.find((e) => e.facet === facet);
  if (found !== undefined) return found;
  return { facet, posture: "propose", source: "default", provenance: "no evidence" };
}

/**
 * Reconcile a posture across a mid-session base switch: entries whose evidence
 * (provenance) changed reset to `default`; entries whose evidence is unchanged
 * keep their prior posture + source (Edge case: mid-session base switch).
 */
export function reconcilePostureOnBaseSwitch(
  prev: InheritancePosture,
  evidence: AdaptationEvidence,
  newBaseId: string,
): InheritancePosture {
  const rebuilt = buildPosture(evidence, newBaseId);
  const entries = rebuilt.entries.map((fresh) => {
    const before = prev.entries.find((e) => e.facet === fresh.facet);
    // Unchanged evidence + an author decision worth preserving → keep it.
    if (before !== undefined && before.provenance === fresh.provenance && before.source !== "default") {
      return { ...fresh, posture: before.posture, source: before.source };
    }
    return fresh;
  });
  return { baseId: newBaseId, entries };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
