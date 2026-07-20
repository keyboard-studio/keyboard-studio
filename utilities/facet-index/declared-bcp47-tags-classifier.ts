/**
 * Declared-BCP47-tags classifier (spec 043 US3, T051) — declared-metadata
 * archetype with a content-derived cross-check.
 *
 * The set of BCP47 language tags the base's `.kps` declares (`<Languages>`), plus
 * a claim-vs-actual cross-check: when a declared tag carries an explicit script
 * subtag (e.g. `hi-Deva`) that disagrees with the base's dominant produced
 * script, or the `.kps` declares tags while the base produces no concrete script,
 * the mismatch is surfaced as an exception in `notes` (a corpus smell) — FR-033.
 * Feeds `source.declared-bcp47-tags`.
 *
 * The value (the declared tag set) is `declared-metadata`; the cross-check reads
 * the produced set (content) only to flag mismatches, never to change the value.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { extractScriptSubtag } from "../../packages/engine/src/base-browser/kps-parser.js";
import { readKpsPackage } from "./kps-reader.js";
import { deriveScriptContext, undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/**
 * Build the declared-tags categorization from the tag list. `crossCheck` gates
 * the claim-vs-actual comparison against the produced script — only the content
 * path (a parsed `.kmn` present) can honestly cross-check; the no-IR fallback
 * surfaces the tags without flagging a mismatch it cannot substantiate.
 */
function tagsCategorization(
  tags: string[],
  dominantScript: string | null,
  crossCheck: boolean,
  analyzedCoverage: number,
  analysisOutcome: Categorization["analysisOutcome"],
): Categorization {
  const sorted = [...new Set(tags)].sort();

  // Claim-vs-actual: an explicit script subtag disagreeing with the dominant
  // produced script is a mismatch; declared tags with no produced script at all
  // is also a mismatch. Only evaluated on the content path (crossCheck).
  const claimedScripts = new Set<string>();
  for (const tag of sorted) {
    const sub = extractScriptSubtag(tag);
    if (sub) claimedScripts.add(sub);
  }
  const mismatches: string[] = [];
  if (crossCheck) {
    if (dominantScript !== null) {
      for (const s of claimedScripts) {
        if (s !== dominantScript) mismatches.push(`${s}≠${dominantScript}`);
      }
    } else if (sorted.length > 0) {
      mismatches.push("tags declared but no concrete script produced");
    }
  }

  return {
    value: sorted,
    confidence: null,
    confidenceClass: "confident",
    provenanceTier: "declared-metadata",
    evidenceSize: sorted.length,
    analyzedCoverage,
    analysisOutcome,
    ...(mismatches.length > 0
      ? { notes: `claim-vs-actual mismatch: ${mismatches.join(", ")}` }
      : { notes: `${sorted.length} declared BCP47 tag(s)` }),
  };
}

/**
 * Content path: declared tags cross-checked against the produced dominant script.
 * Returns null when no tag is declared so the caller falls through to the
 * fallback. Never throws.
 */
export function classifyDeclaredBcp47Tags(
  ir: KeyboardIR,
  def: FacetDefinition,
  kb: ScannedKeyboard,
): Categorization | null {
  const tags = readKpsPackage(kb).languageTags;
  if (tags.length === 0) return null; // no declared tags — fall through.
  const dominantScript = deriveScriptContext(ir, def).scriptFamily;
  return tagsCategorization(tags, dominantScript, true, computeAnalyzedCoverage(ir), ir.raw.length > 0 ? "partially" : "fully");
}

/**
 * Fallback: no primary `.kmn` to cross-check against, or `parse()` threw. Still
 * surfaces the declared tags (declared-metadata) when the `.kps` has any; only a
 * base with no declared tag at all reads `undetermined`.
 */
export function declaredBcp47TagsFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;
  const tags = readKpsPackage(kb).languageTags;
  if (tags.length === 0) {
    return undeterminedFallback("no declared BCP47 tags in the .kps; declared-tags undetermined");
  }
  // No IR to cross-check — surface the declared tags without a mismatch flag.
  return tagsCategorization(tags, null, false, 1, "fully");
}
