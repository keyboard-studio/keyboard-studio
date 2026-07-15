/**
 * Script classifier (spec 036 T015) — content-derived script categorization
 * from a keyboard's produced-character set.
 *
 * Maps every concretely-scripted character in `buildProducedSet(ir)` to its
 * ISO 15924 script via the pinned UCD lookup (utilities/facet-index/ucd),
 * using a two-pass content-derived attribution (linguist-corrected; replaces
 * the earlier "exactly one script in the extension set" heuristic):
 *
 *  - Pass 1 (attestation): tally only EXCLUSIVE-Script characters — a
 *    concrete (non-Common/Inherited) `Script` value AND no
 *    Script_Extensions set at all — into the histogram. This establishes the
 *    set of scripts the keyboard's content ATTESTS, with their base weights.
 *  - Pass 2 (apportionment): every SHARED character (one carrying a defined
 *    Script_Extensions set, regardless of its own primary Script value —
 *    e.g. an Arabic-Indic digit whose primary is Arab but whose extension
 *    set also names Thaa/Yezi) has its weight of 1 split evenly across only
 *    the scripts in its extension set that are ALREADY attested from pass 1.
 *    A shared character whose extension set intersects no attested script is
 *    NEUTRAL — dropped — because apportioning it would invent attestation
 *    for a script the content never exclusively produced.
 *  - Common (Zyyy) / Inherited (Zinh) characters with no Script_Extensions
 *    are always neutral (no evidence, dropped). Neither literal value ever
 *    becomes a histogram key.
 *
 * Distribution keys still sum to ~1 (each character contributes a total
 * weight of exactly 1, whether wholly in pass 1 or apportioned in pass 2).
 *
 * Internal weighting/thresholds here are an MVP that proves the artifact
 * shape (spec 036 scope note); finer apportionment tuning is spec 037's job.
 *
 * Not wired here: `script.yaml`'s `subProfiles.latin` and the generated
 * `latinProfileOf()` lookup (ucd/generated/scriptLookup.ts) exist so a future
 * facet can classify Latin sub-profile (plain/extended/ipa), but this
 * classifier never populates `Categorization.subProfile` — reserved for spec
 * 037, not a gap in 036's scope (only the `script` facet's dominant-value +
 * distribution ships here).
 */

import { buildProducedSet } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { scriptOf, scriptExtensionsOf } from "./ucd/generated/scriptLookup.js";
import { mapImportStatus, computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";

// The special ISO-15924 pseudo-scripts that are NOT concrete script evidence and
// so are never histogram-eligible (they are excluded from script.yaml's closed
// limits.values). Zyyy (Common) / Zinh (Inherited) carry no script evidence on
// their own; Zzzz (Unknown, `scriptOf`'s @missing default for an unranged/PUA
// codepoint) and Zxxx (Unwritten) are the absence of a concrete script. Emitting
// any of these as a distribution key would fail the build-time limits check (X1),
// which is the point — they are dropped here rather than diluting a distribution.
const NEUTRAL_SCRIPTS = new Set(["Zyyy", "Zinh", "Zzzz", "Zxxx"]);

/** Confidence-class thresholds on the dominant value's distribution share. */
function classifyConfidence(dominantShare: number): ConfidenceClass {
  if (dominantShare >= 0.9) return "confident";
  if (dominantShare >= 0.5) return "mixed";
  return "undetermined";
}

/**
 * Content-derived script categorization, or `null` when the produced set has
 * no concretely-scripted output (empty keyboard, or Common/Inherited-only
 * output such as pure digits/punctuation) — the caller falls through to
 * `deriveScriptFallback` (fallback.ts) in that case.
 */
export function classifyScript(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every code this emits is a concrete Scripts.txt script (neutrals dropped),
  // which is within script.yaml's closed limits.values by construction; the build-time
  // limits check (validate.ts, X1) is the enforcing gate on that invariant.

  const produced = buildProducedSet(ir);
  const histogram = new Map<string, number>();
  const attested = new Set<string>();
  const sharedCodepoints: number[] = [];
  let evidenceSize = 0;

  // Pass 1: exclusive-Script characters (concrete primary, no
  // Script_Extensions at all) establish the attested-scripts set.
  for (const ch of produced) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;

    const extensions = scriptExtensionsOf(cp);
    if (extensions !== undefined) {
      // Shared character — deferred to pass 2 regardless of its own primary
      // Script value.
      sharedCodepoints.push(cp);
      continue;
    }

    const primary = scriptOf(cp);
    if (NEUTRAL_SCRIPTS.has(primary)) continue; // Zyyy/Zinh, unshared: no evidence.

    histogram.set(primary, (histogram.get(primary) ?? 0) + 1);
    attested.add(primary);
    evidenceSize += 1;
  }

  // Pass 2: apportion each shared character's weight only across the scripts
  // in its extension set that are already attested from pass 1.
  for (const cp of sharedCodepoints) {
    const extensions = scriptExtensionsOf(cp)!;
    const matched = extensions.filter((s) => attested.has(s));
    if (matched.length === 0) continue; // intersects no attested script: neutral.

    const weight = 1 / matched.length;
    for (const script of matched) {
      histogram.set(script, (histogram.get(script) ?? 0) + weight);
    }
    evidenceSize += 1;
  }

  if (evidenceSize === 0 || histogram.size === 0) return null;

  const total = [...histogram.values()].reduce((a, b) => a + b, 0);
  const distribution: Record<string, number> = {};
  for (const [script, count] of histogram) {
    distribution[script] = count / total;
  }

  let dominantScript = "";
  let dominantCount = -1;
  for (const [script, count] of histogram) {
    if (count > dominantCount) {
      dominantScript = script;
      dominantCount = count;
    }
  }

  // TODO(037): thread the real opaque signal from `ParseResult.opaqueFeatures`
  // instead of re-deriving it from `ir.raw.length` here. Doing so now would
  // widen `classifyScript`'s pinned signature (KeyboardIR -> ParseResult),
  // which also touches `ClassifierPair` in build-index.ts and every test
  // fixture that calls `classifyScript(ir, def)` directly — deferred as
  // out-of-scope for this pass.
  const status = ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;

  return {
    value: dominantScript,
    distribution,
    confidence: null, // the distribution carries the likelihood
    confidenceClass: classifyConfidence(dominantCount / total),
    provenanceTier: "content-derived",
    evidenceSize,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: mapImportStatus(status),
  };
}
