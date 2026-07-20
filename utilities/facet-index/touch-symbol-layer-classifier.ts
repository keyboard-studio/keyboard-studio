/**
 * Touch symbol-layer classifier (spec 041 US2, T026) — touch-layout evidence.
 *
 * `valueType: enum`, values ∈ {present, absent}: whether the keyboard's
 * `.keyman-touch-layout` defines a dedicated symbol layer (a layer whose id
 * carries "symbol", the Keyman convention, reachable via a layer-switch key).
 * Read from the touch layout's layer list directly (FR-021), independent of the
 * desktop `.kmn`. A keyboard with no touch layout is `notApplicable` (FR-022).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { notApplicableMeasurement } from "./measurement.js";
import { readTouchLayout, hasSymbolLayer, touchCategorization } from "./touch-layout.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const NO_TOUCH = "no .keyman-touch-layout; touch-symbol-layer not applicable";

function deriveTouchSymbolLayer(kb: ScannedKeyboard): Categorization {
  const model = readTouchLayout(kb);
  if (model === null) return notApplicableMeasurement(NO_TOUCH);

  const value = hasSymbolLayer(model) ? "present" : "absent";
  return touchCategorization({ value, evidenceSize: 1, consistency: 1 });
}

export function classifyTouchSymbolLayer(
  ir: KeyboardIR,
  def: FacetDefinition,
  kb: ScannedKeyboard,
): Categorization | null {
  void ir;
  void def;
  return deriveTouchSymbolLayer(kb);
}

export function touchSymbolLayerFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;
  return deriveTouchSymbolLayer(kb);
}
