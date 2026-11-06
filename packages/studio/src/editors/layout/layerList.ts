// layerList — which layers the Layout tab's selector offers, and how an added layer is checked
// (spec 113 FR-010, FR-010a). Pure: the pane keeps the session-added layers in state and
// hands them in.
//
// The list is the default layer, Shift, and every layer the starting-point keyboard or the
// working copy has a rule for. The author adds any other modifier combination explicitly; the
// studio never adds one on its own.

import { canonicalizeCombo, listLayers } from "@keyboard-studio/engine";
import type { KeyboardIR, LayerCombo, ModifierToken } from "@keyboard-studio/contracts";

/** The default (no modifier) layer's selector id. A combo token never spells this. */
export const DEFAULT_LAYER_KEY = "default";

const SHIFT_LAYER: LayerCombo = ["SHIFT"];

/** The stable selector id of a layer: `default`, or the canonical tokens joined (`SHIFT+RALT`). */
export function layerKey(layer: LayerCombo): string {
  return layer.length === 0 ? DEFAULT_LAYER_KEY : layer.join("+");
}

/**
 * The canonical form of a combination (deduplicated, in the engine's token order), or null when
 * the tokens cannot be combined (two from one family, such as Ctrl and LeftCtrl).
 */
export function canonicalLayer(tokens: readonly ModifierToken[]): LayerCombo | null {
  try {
    return canonicalizeCombo(tokens);
  } catch {
    return null;
  }
}

/**
 * Every layer to list, in order: default, Shift, the layers the starting-point keyboard and the
 * working copy use (starting point first), then the layers the author added this session. Each
 * layer appears once, however it was spelled.
 */
export function listAvailableLayers(
  startIr: KeyboardIR | null,
  workingIr: KeyboardIR | null,
  added: readonly LayerCombo[] = [],
): LayerCombo[] {
  const out: LayerCombo[] = [];
  const seen = new Set<string>();
  const push = (layer: LayerCombo): void => {
    const canon = canonicalLayer(layer) ?? layer;
    const key = layerKey(canon);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(canon);
  };
  push([]);
  push(SHIFT_LAYER);
  if (startIr !== null) listLayers(startIr).forEach(push);
  if (workingIr !== null) listLayers(workingIr).forEach(push);
  added.forEach(push);
  return out;
}

/**
 * True for an added layer that has no rule yet. It does not exist in the keyboard until a key is
 * set, so the tab says so. The default and Shift layers are always part of the list, never "unsaved".
 */
export function isUnsavedLayer(layer: LayerCombo, workingIr: KeyboardIR | null): boolean {
  const key = layerKey(layer);
  if (key === DEFAULT_LAYER_KEY || key === layerKey(SHIFT_LAYER)) return false;
  if (workingIr === null) return true;
  return !listLayers(workingIr).some((l) => layerKey(l) === key);
}

/** Ctrl or Alt (not AltGr) is part of the combination: with a letter key it is the host's shortcut. */
export function isSystemShortcutLayer(layer: LayerCombo): boolean {
  const w = new Set<string>(layer);
  const altgr = w.has("RALT") || (w.has("LCTRL") && w.has("LALT"));
  const ctrlOrAlt = ["CTRL", "LCTRL", "RCTRL", "ALT", "LALT"].some((m) => w.has(m));
  return ctrlOrAlt && !altgr;
}

/** The modifier families the "Add layer" dialog offers: at most one token from each. */
export const CTRL_FAMILY: readonly ModifierToken[] = ["CTRL", "LCTRL", "RCTRL"];
export const ALT_FAMILY: readonly ModifierToken[] = ["ALT", "LALT", "RALT"];
export const CAPS_FAMILY: readonly ModifierToken[] = ["CAPS", "NCAPS"];
