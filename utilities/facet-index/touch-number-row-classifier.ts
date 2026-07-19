/**
 * Touch number-row classifier (spec 041 US2, T025) — touch-layout evidence.
 *
 * `valueType: enum`, values ∈ {absent, digits, letters, mixed}: whether the
 * keyboard's `.keyman-touch-layout` shows a dedicated number-row slot and what it
 * carries. Read from the touch layout directly (FR-021), independent of the
 * desktop `.kmn`.
 *
 * The slot detection + digit/letter classification live in touch-layout.ts
 * (`classifyNumberRow`, unit-tested there); this classifier is the thin
 * registration wrapper that maps "no touch layout" to `notApplicable` (FR-022)
 * and otherwise surfaces the single classified value at consistency 1.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { notApplicableMeasurement } from "./measurement.js";
import { readTouchLayout, classifyNumberRow, touchCategorization } from "./touch-layout.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const NO_TOUCH = "no .keyman-touch-layout; touch-number-row not applicable";

function deriveTouchNumberRow(kb: ScannedKeyboard): Categorization {
  const model = readTouchLayout(kb);
  if (model === null) return notApplicableMeasurement(NO_TOUCH);

  const value = classifyNumberRow(model);
  return touchCategorization({ value, evidenceSize: 1, consistency: 1 });
}

export function classifyTouchNumberRow(
  ir: KeyboardIR,
  def: FacetDefinition,
  kb: ScannedKeyboard,
): Categorization | null {
  void ir;
  void def;
  return deriveTouchNumberRow(kb);
}

export function touchNumberRowFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;
  return deriveTouchNumberRow(kb);
}
