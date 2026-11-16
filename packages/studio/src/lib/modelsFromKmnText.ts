// The one preparation of the models an opened keyboard's `.kmn` text yields,
// shared by a live apply (`replaceStartingPointFiles`) and a draft restore
// (`withOpenRestoreRules`) so the two cannot drift. Pure: no store access.

import type { KeyboardIR, RemovalCapability, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  NOT_A_KEYBOARD_SOURCE_MESSAGE,
  classifyRemovalCapabilities,
  deriveFacets,
  isKeyboardSource,
  parseKmn,
  parseTouchLayout,
  recognizePatterns,
} from "@keyboard-studio/engine";

export type ModelsFromKmnText =
  | { ok: true; ir: KeyboardIR; capabilities: Map<string, RemovalCapability> }
  | { ok: false; error: string };

/**
 * Parse, pattern-recognize, attach the touch layout, classify and derive facets,
 * in the order instantiation uses. `touchText`: the touch file's text, `null`
 * when it is gone (no layout), `undefined` when unchanged (keep `priorTouchLayout`).
 */
export function modelsFromKmnText(
  kmnText: string,
  keyboardId: string,
  touchText: string | null | undefined,
  priorTouchLayout: TouchLayoutIR | undefined,
): ModelsFromKmnText {
  let parsedIr: KeyboardIR;
  try {
    parsedIr = parseKmn(kmnText, keyboardId).ir;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!isKeyboardSource(parsedIr)) return { ok: false, error: NOT_A_KEYBOARD_SOURCE_MESSAGE };
  // Recognition first (the classifier reads `ownedByPattern`), then the touch layout.
  let recognized = recognizePatterns(parsedIr).ir;
  if (touchText === undefined) {
    if (priorTouchLayout !== undefined) recognized = { ...recognized, touchLayout: priorTouchLayout };
  } else if (touchText !== null) {
    try {
      recognized = { ...recognized, touchLayout: parseTouchLayout(touchText) };
    } catch {
      // An unreadable layout leaves ir.touchLayout undefined, as at instantiation.
    }
  }
  return { ok: true, capabilities: classifyRemovalCapabilities(recognized), ir: deriveFacets(recognized) };
}
