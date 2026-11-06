// baseFallbackCells — what a picked base keyboard types at a position the working copy has
// no rule for (spec 113 FR-014; contracts/attribution.md "Studio: base fallback join").
//
// Joins spec 109's enumerator of unhandled positions (engine) with the reference base
// keyboard data (`referenceBaseLayouts.lookupHostOutput`) for each keyboard the author
// picked, primary first. The simulator's built-in US fallback is never consulted: typists'
// computers differ, so a position with no reference data is "unknown", not a guess.

import { enumerateUnhandledPositions } from "@keyboard-studio/engine";
import type { PositionState } from "@keyboard-studio/engine";
import type { KeyboardIR, LayerCombo } from "@keyboard-studio/contracts";
import { DEADKEY, lookupHostOutput } from "../../lib/referenceBaseLayouts.ts";
import type { WindowsLayout } from "../../lib/windowsLayouts.ts";

/** What one base keyboard types at a position. */
export type BaseFallbackResult =
  | { kind: "character"; text: string }
  /** The base keyboard arms a deadkey there (the reference data carries no display character). */
  | { kind: "deadkey" }
  /** No reference data for this base keyboard, or the layer is outside none/shift/altgr/shiftAltgr. */
  | { kind: "unknown" }
  /** Ctrl or Alt with a letter, without AltGr: the host's shortcut, not a typed character. */
  | { kind: "system-shortcut" };

/** One picked base keyboard's answer for a position. */
export interface BaseFallbackEntry {
  /** The picked Windows layout's catalog id. */
  baseId: string;
  /** Author-facing name of the picked layout. */
  baseName: string;
  /** True for the first picked base keyboard: its answer is the one the cell shows. */
  primary: boolean;
  result: BaseFallbackResult;
}

/** The base-keyboard fallback at one key and layer. */
export interface BaseFallbackDetail {
  vkey: string;
  layer: LayerCombo;
  /** The primary base keyboard's answer (`unknown` when none is picked). */
  outcome: BaseFallbackResult;
  /** The text the cell shows: the primary base keyboard's character, otherwise null. */
  display: string | null;
  /** Every picked base keyboard, in pick order (primary first). */
  entries: BaseFallbackEntry[];
  /**
   * A "Do nothing" class policy covers this key but the compiled keyboard does not enforce it
   * (spec 109 `swallowUndefined` is not built): the cell shows the base character and says so.
   */
  policyNotInEffect: boolean;
}

/** The modifier words the reference tables are keyed by, for each of the four base states. */
const STATE_MODIFIERS: Record<PositionState, readonly string[]> = {
  none: [],
  shift: ["SHIFT"],
  altgr: ["RALT"],
  shiftAltgr: ["RALT", "SHIFT"],
};

/** The base-keyboard state a layer maps to, or null when it is outside the four states. */
export function layerBaseState(layer: LayerCombo): PositionState | null {
  const w = new Set(layer.map((m) => m.toUpperCase()));
  const shift = w.delete("SHIFT");
  let altgr = false;
  if (w.has("RALT") && w.size === 1) altgr = true;
  else if (w.has("LCTRL") && w.has("LALT") && w.size === 2) altgr = true;
  else if (w.size !== 0) return null;
  return altgr ? (shift ? "shiftAltgr" : "altgr") : shift ? "shift" : "none";
}

/** Ctrl or Alt (not AltGr) with a letter key: a system shortcut on the host. */
function isSystemShortcut(vkey: string, layer: LayerCombo): boolean {
  if (!/^K_[A-Z]$/i.test(vkey)) return false;
  const w = new Set(layer.map((m) => m.toUpperCase()));
  const altgr = w.has("RALT") || (w.has("LCTRL") && w.has("LALT"));
  const ctrlOrAlt = ["CTRL", "LCTRL", "RCTRL", "ALT", "LALT"].some((m) => w.has(m));
  return ctrlOrAlt && !altgr;
}

function resultFor(base: WindowsLayout, vkey: string, layer: LayerCombo): BaseFallbackResult {
  if (isSystemShortcut(vkey, layer)) return { kind: "system-shortcut" };
  const state = layerBaseState(layer);
  if (state === null || base.host === undefined) return { kind: "unknown" };
  const cell = lookupHostOutput(base.host, vkey, STATE_MODIFIERS[state]);
  if (cell === undefined) return { kind: "unknown" };
  return cell === DEADKEY ? { kind: "deadkey" } : { kind: "character", text: cell };
}

export interface BaseFallbackOptions {
  /** True for keys a "Do nothing" class policy covers (the policy is not yet in effect). */
  policyDoNothing?: (vkey: string) => boolean;
}

/** The fallback detail for one key and layer, from the picked base keyboards (primary first). */
export function baseFallbackFor(
  vkey: string,
  layer: LayerCombo,
  bases: readonly WindowsLayout[],
  opts: BaseFallbackOptions = {},
): BaseFallbackDetail {
  const entries: BaseFallbackEntry[] = bases.map((b, i) => ({
    baseId: b.id,
    baseName: b.name,
    primary: i === 0,
    result: resultFor(b, vkey, layer),
  }));
  const outcome: BaseFallbackResult =
    entries[0]?.result ??
    (isSystemShortcut(vkey, layer) ? { kind: "system-shortcut" } : { kind: "unknown" });
  const display = outcome.kind === "character" ? outcome.text : null;
  const policyNotInEffect =
    opts.policyDoNothing?.(vkey) === true && (outcome.kind === "character" || outcome.kind === "deadkey");
  return { vkey, layer, outcome, display, entries, policyNotInEffect };
}

/**
 * The fallback detail for every position of `vkeys` in `layer` that the working copy does not
 * handle. For a layer in the four base states the positions come from the shared enumerator
 * (`enumerateUnhandledPositions`); for any other layer the enumerator has no coverage data, so
 * every key is returned and the caller keeps only the cells attribution marks `unhandled`.
 */
export function baseFallbackCells(
  ir: KeyboardIR,
  vkeys: readonly string[],
  layer: LayerCombo,
  bases: readonly WindowsLayout[],
  opts: BaseFallbackOptions = {},
): Map<string, BaseFallbackDetail> {
  const state = layerBaseState(layer);
  const out = new Map<string, BaseFallbackDetail>();
  const wanted =
    state === null
      ? vkeys
      : enumerateUnhandledPositions(ir, vkeys)
          .filter((p) => p.state === state)
          .map((p) => p.vkey);
  for (const vkey of wanted) out.set(vkey, baseFallbackFor(vkey, layer, bases, opts));
  return out;
}
