/**
 * Touch combo-mechanism classifier (spec 041 US2, T024) — touch-layout evidence.
 *
 * `valueType: histogram`, values ∈ {key, layer, longpress, flick, multitap}: the
 * distribution of mechanisms the keyboard's `.keyman-touch-layout` uses to expose
 * a character to a touch typist. Read from the touch layout directly (FR-021), it
 * is independent of the desktop `.kmn` recognizer.
 *
 * Starter reading (documented): every touch key is bucketed by the affordance it
 * offers — a longpress popup (`sk`), a flick, a multitap, a layer switch
 * (`nextlayer`), or, failing all of those, a direct character key. The
 * distribution is the share of each mechanism over those occurrences; the
 * dominant mechanism is the reported `value` and `consistency` is its share. A
 * keyboard with no touch layout is `notApplicable` (FR-022, AS-1) — never a
 * forced value.
 *
 * Both `classify` and the fallback delegate to one derivation so a keyboard whose
 * desktop `.kmn` failed to parse (IR unavailable → the shell skips `classify`)
 * still gets its touch facet from the layout artifact.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { notApplicableMeasurement, CONFIDENT_CONSISTENCY } from "./measurement.js";
import { readTouchLayout, comboMechanismCounts, touchCategorization } from "./touch-layout.js";
import type { TouchComboMechanism } from "./touch-layout.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const NO_TOUCH = "no .keyman-touch-layout; touch-combo-mechanism not applicable";

function deriveTouchComboMechanism(kb: ScannedKeyboard): Categorization {
  const model = readTouchLayout(kb);
  if (model === null) return notApplicableMeasurement(NO_TOUCH);

  const counts = comboMechanismCounts(model);
  const entries = (Object.entries(counts) as Array<[TouchComboMechanism, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0].localeCompare(b[0])); // lexicographic order for determinism (FR-006)
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return notApplicableMeasurement("touch layout has no classifiable keys");

  const distribution: Record<string, number> = {};
  let dominant = "";
  let dominantShare = 0;
  for (const [mech, n] of entries) {
    const share = n / total;
    distribution[mech] = share;
    if (share > dominantShare) {
      dominant = mech;
      dominantShare = share;
    }
  }

  const confidenceClass: ConfidenceClass = dominantShare >= CONFIDENT_CONSISTENCY ? "confident" : "mixed";
  return touchCategorization({
    value: dominant,
    distribution,
    evidenceSize: total,
    consistency: dominantShare,
    confidenceClass,
  });
}

export function classifyTouchComboMechanism(
  ir: KeyboardIR,
  def: FacetDefinition,
  kb: ScannedKeyboard,
): Categorization | null {
  void ir;
  void def;
  return deriveTouchComboMechanism(kb);
}

export function touchComboMechanismFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;
  return deriveTouchComboMechanism(kb);
}
