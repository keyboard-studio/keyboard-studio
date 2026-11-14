// Whether a new "after ..." context can be typed at all (spec 117 FR-029a): can some listed
// layer type each character, and produce each deadkey, the context is made of? Static: reads the IR.

import { US_BASE_LAYOUT } from "@keyboard-studio/contracts";
import type { KeyboardIR, LayerCombo, LayoutContext } from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY } from "../layout-chart/geometry.js";
import { sameLayer } from "../layout-ops/ruleMatch.js";
import { attributeLayer } from "./attributeLayer.js";

const VKEYS: readonly string[] = DESKTOP_ISO_GEOMETRY.map((k) => k.id);

/**
 * True when every character of `context`'s text and every deadkey in it is typeable on at least
 * one of `layers`: a key's literal output, a key the keyboard does not handle (the base keyboard
 * types its US character on the none and shift layers), or the result of a contextual row (the
 * author reaches it by typing that row). A deadkey is typeable when a key on a listed layer
 * produces it. A false answer is a warning for the author, not a block.
 */
export function isContextReachable(ir: KeyboardIR, layers: readonly LayerCombo[], context: LayoutContext): boolean {
  if (context.length === 0) return true;
  const chars = new Set<string>();
  const deadkeys = new Set<string>();
  const addOutput = (out: unknown): void => {
    if (out === null || out === undefined) return;
    if (Array.isArray(out)) {
      for (const el of out as Array<{ kind: string; text?: string; deadkeyId?: string }>) addOutput(el);
      return;
    }
    const o = out as { kind?: string; text?: string; deadkeyId?: string };
    if (o.kind === "text" && o.text !== undefined) for (const c of Array.from(o.text)) chars.add(c);
    else if (o.kind === "deadkey" && o.deadkeyId !== undefined) deadkeys.add(o.deadkeyId.toLowerCase());
  };
  for (const layer of layers) {
    for (const cell of attributeLayer(ir, layer, VKEYS)) {
      if (cell.frame) continue;
      addOutput(cell.plain?.output);
      for (const row of cell.rows) addOutput(row.output);
      if (cell.plain === null && cell.unhandled) {
        const base = layer.length === 0 ? US_BASE_LAYOUT.get(cell.vkey) : sameLayer(layer, ["SHIFT"]) ? US_BASE_LAYOUT.get(`S+${cell.vkey}`) : undefined;
        if (base !== undefined) for (const c of Array.from(base)) chars.add(c);
      }
    }
  }
  return context.every((el) =>
    el.kind === "text" ? Array.from(el.text).every((c) => chars.has(c)) : deadkeys.has(el.deadkeyId.toLowerCase()),
  );
}
