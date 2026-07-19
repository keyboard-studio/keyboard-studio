/**
 * Desktop combo-mechanism classifier (spec 041 US1, T012) — rule-structure,
 * histogram archetype (like `strategy-fingerprint`, it carries a `distribution`,
 * not a single-value consistency).
 *
 * Distribution over {direct-key, modifier-key, deadkey, context-match,
 * os-compose} — each mechanism's share of the keyboard's keystroke rules
 * (FR-011). Per rule, first matching mechanism wins:
 *   - `deadkey`       — a deadkey appears in the rule's context or output;
 *   - `modifier-key`  — the matched key carries a chord modifier (CTRL/ALT/…),
 *                       i.e. a modifier-key combination (SHIFT/CAPS excluded —
 *                       those are base/shift layers, not compose chords);
 *   - `context-match` — the rule matches prior context (`context`/`any`/
 *                       `index`/`notany`);
 *   - `direct-key`    — a plain key producing output directly.
 * `os-compose` has no rule-structure signal (delegation is invisible to the
 * .kmn), so it simply never appears in the distribution.
 */

import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { mapImportStatus, computeAnalyzedCoverage } from "./outcome.js";
import { undeterminedFallback } from "./measurement.js";
import { eachRule, isKeystrokeRule } from "./ir-scan.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const CHORD_MODIFIERS = new Set(["CTRL", "LCTRL", "RCTRL", "ALT", "LALT", "RALT", "ALTGR"]);
const CONFIDENT_DOMINANT_SHARE = 0.8;

function mechanismOf(rule: IRRule): string {
  const hasDeadkey =
    rule.context.some((el) => el.kind === "deadkey") || rule.output.some((el) => el.kind === "deadkey");
  if (hasDeadkey) return "deadkey";
  const hasChord = rule.context.some(
    (el) => el.kind === "vkey" && el.modifiers.some((m) => CHORD_MODIFIERS.has(m)),
  );
  if (hasChord) return "modifier-key";
  // context-match: the rule matches something BEYOND the triggering key — a
  // preceding char/deadkey literal, a context()/any()/index()/notany() ref. A
  // `baselayout(...)` element is layout-scoping, not a compose context, so it
  // does not by itself make a rule context-match.
  const hasVkey = rule.context.some((el) => el.kind === "vkey");
  const hasContextPrefix = rule.context.some((el) => el.kind !== "vkey" && el.kind !== "baselayout");
  if (hasVkey && hasContextPrefix) return "context-match";
  return "direct-key";
}

function classifyConfidence(dominantShare: number): ConfidenceClass {
  if (dominantShare === 0) return "undetermined";
  return dominantShare >= CONFIDENT_DOMINANT_SHARE ? "confident" : "mixed";
}

export function classifyDesktopComboMechanism(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;

  const counts = new Map<string, number>();
  let total = 0;
  for (const { rule } of eachRule(ir)) {
    if (!isKeystrokeRule(rule)) continue;
    const mech = mechanismOf(rule);
    counts.set(mech, (counts.get(mech) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return null; // no keystroke rules — fall through

  const distribution: Record<string, number> = {};
  let dominant = "";
  let dominantShare = 0;
  for (const mech of [...counts.keys()].sort()) {
    const share = counts.get(mech)! / total;
    distribution[mech] = share;
    if (share > dominantShare) {
      dominant = mech;
      dominantShare = share;
    }
  }

  const status = ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;
  return {
    value: dominant,
    distribution,
    confidence: null, // the distribution carries the likelihood
    confidenceClass: classifyConfidence(dominantShare),
    provenanceTier: "content-derived",
    evidenceSize: total,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: mapImportStatus(status),
  };
}

export function desktopComboMechanismFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no keystroke rules; desktop-combo-mechanism undetermined");
}
