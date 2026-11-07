// casePartner -- the case partner the Layout tab proposes alongside an edit (spec 113 FR-020a).
//
// Typing a lowercase letter on the default layer usually means its capital belongs on the Shift
// layer of the same key, and the reverse. The partner of a layer is the same combination with
// Shift toggled (default <-> Shift, AltGr <-> Shift+AltGr, and so on, Caps Lock layers
// included). The partner text is the Unicode SIMPLE case mapping of the text: a single code
// point that maps to a single code point. Anything else (no mapping, a full mapping such as
// the German sharp s, several characters) proposes nothing.
//
// Pure: it reads the IR and the recorded edits, never a store.

import type { KeyboardIR, KmnEdit, LayerCombo, ModifierToken } from "@keyboard-studio/contracts";
import { attributeLayer } from "@keyboard-studio/engine";

export type CasePartnerResult =
  | { kind: "offer"; vkey: string; layer: LayerCombo; text: string }
  | { kind: "none"; reason: "no-mapping" | "unchanged" | "declined" | "read-only" | "same-as-current" };

/** The layer with Shift toggled; token order is kept stable (SHIFT first). */
export function pairedLayer(layer: LayerCombo): LayerCombo {
  const has = layer.includes("SHIFT");
  const rest = layer.filter((t) => t !== "SHIFT");
  return (has ? rest : (["SHIFT", ...rest] as ModifierToken[])) as LayerCombo;
}

/** Unicode simple case mapping of one code point, or null when it has none. */
export function simpleCaseMap(text: string, toUpper: boolean): string | null {
  const cps = [...text];
  if (cps.length !== 1) return null;
  const mapped = toUpper ? text.toUpperCase() : text.toLowerCase();
  if ([...mapped].length !== 1 || mapped === text) return null;
  return mapped;
}

function sameLayer(a: LayerCombo, b: LayerCombo): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

export function casePartnerFor(params: {
  ir: KeyboardIR;
  vkey: string;
  layer: LayerCombo;
  text: string;
  entries?: readonly KmnEdit[];
}): CasePartnerResult {
  const { ir, vkey, layer, text, entries = [] } = params;
  const partnerLayer = pairedLayer(layer);
  // Shifted layers hold the capital; the unshifted partner is the lowercase form.
  const mapped = simpleCaseMap(text, !layer.includes("SHIFT"));
  if (mapped === null) return { kind: "none", reason: "no-mapping" };

  const declined = entries.some(
    (e) => e.op === "decline-case-partner" && e.vkey === vkey && sameLayer(e.layer, layer),
  );
  if (declined) return { kind: "none", reason: "declined" };

  const cell = attributeLayer(ir, partnerLayer, [vkey])[0];
  if (cell === undefined || cell.frame || (cell.plain !== null && !cell.plain.editable)) {
    return { kind: "none", reason: "read-only" };
  }
  const current = cell.plain?.output;
  if (current !== null && current !== undefined && "kind" in current && current.kind === "text" && current.text === mapped) {
    return { kind: "none", reason: "same-as-current" };
  }
  return { kind: "offer", vkey, layer: partnerLayer, text: mapped };
}
