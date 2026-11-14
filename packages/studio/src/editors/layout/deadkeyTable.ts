// deadkeyTable -- one deadkey's combination table as the Layout tab shows it (spec 117 US3,
// FR-028, FR-029). Pure: derived from the working IR and the static attribution of each layer.
//
// Two row shapes feed one table:
//   - fan-out rows (spec 083's `dk(x) + any(bases) > index(outs, 2)`): keyed by the base
//     character, shown with the key that types it (MSKLC-style);
//   - keystroke-keyed rows (`dk(x) + [K_E] > ...`): keyed by key and layer. A row that uses a
//     store outside the fan-out shape is read-only with its reason.

import type { DeadkeyInfo, KeyboardIR, LayerCombo, LayoutOutput } from "@keyboard-studio/contracts";
import { attributeLayer } from "@keyboard-studio/engine";
import type { ReadOnlyReason, RowAttribution } from "@keyboard-studio/engine";
import { DESKTOP_VKEYS } from "./useLayoutAttribution.ts";

export interface FanoutRow {
  /** The position in both fan-out stores (what `remove-pair` / `insert-pair` take). */
  index: number;
  base: string;
  result: string;
  /** The first key and layer that types the base character, or null when no listed layer does. */
  typedBy: { vkey: string; layer: LayerCombo } | null;
}

export interface KeystrokeRow {
  vkey: string;
  layer: LayerCombo;
  ruleNodeId: string;
  /** The result as text (a deadkey shows as `dk(id)`; nothing as the empty string). */
  result: string;
  nothing: boolean;
  editable: boolean;
  readOnlyReason?: ReadOnlyReason;
  /** The id of the deadkey this row's result starts, when the row chains. */
  followsDeadkeyId: string | null;
}

export interface DeadkeyTable {
  /** The id as the keyboard names it in contexts (`0001`). */
  deadkeyId: string;
  info: DeadkeyInfo;
  fanout: FanoutRow[];
  keystroke: KeystrokeRow[];
  /** No combinations at all, of either shape. */
  empty: boolean;
}

export function hexId(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/** The id a context or output uses for this deadkey: hex for a numeric id, the name otherwise. */
export function deadkeyRefOf(info: DeadkeyInfo): string | null {
  return info.id !== null ? hexId(info.id) : (info.name ?? null);
}

function sameRef(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function resultText(output: RowAttribution["output"]): { text: string; nothing: boolean; follows: string | null } {
  if (output === null) return { text: "", nothing: false, follows: null };
  if (Array.isArray(output)) {
    const parts = output as ReadonlyArray<{ kind: "text"; text: string } | { kind: "deadkey"; deadkeyId: string }>;
    let follows: string | null = null;
    const text = parts
      .map((p) => {
        if (p.kind === "text") return p.text;
        follows ??= p.deadkeyId;
        return `dk(${p.deadkeyId})`;
      })
      .join("");
    return { text, nothing: false, follows };
  }
  const single = output as LayoutOutput | { kind: "nul" };
  if (single.kind === "text") return { text: single.text, nothing: false, follows: null };
  if (single.kind === "deadkey") return { text: `dk(${single.deadkeyId})`, nothing: false, follows: single.deadkeyId };
  return { text: "", nothing: true, follows: null };
}

export function buildDeadkeyTable(ir: KeyboardIR, info: DeadkeyInfo, layers: readonly LayerCombo[]): DeadkeyTable | null {
  const ref = deadkeyRefOf(info);
  if (ref === null) return null;

  const attributed = layers.map((layer) => ({ layer, cells: attributeLayer(ir, layer, DESKTOP_VKEYS) }));

  const typedBy = new Map<string, { vkey: string; layer: LayerCombo }>();
  const keystroke: KeystrokeRow[] = [];
  for (const { layer, cells } of attributed) {
    for (const cell of cells) {
      const plain = cell.plain?.output;
      if (plain !== null && plain !== undefined && !Array.isArray(plain) && "kind" in plain && plain.kind === "text") {
        if (!typedBy.has(plain.text)) typedBy.set(plain.text, { vkey: cell.vkey, layer });
      }
      for (const row of cell.rows) {
        const only = row.context.length === 1 ? row.context[0] : undefined;
        if (only?.kind !== "deadkey" || !sameRef(only.deadkeyId, ref)) continue;
        if (row.shape === "deadkey-fanout") continue;
        const r = resultText(row.output);
        keystroke.push({
          vkey: cell.vkey,
          layer,
          ruleNodeId: row.ruleNodeId,
          result: r.text,
          nothing: r.nothing,
          editable: row.editable,
          ...(row.readOnlyReason !== undefined ? { readOnlyReason: row.readOnlyReason } : {}),
          followsDeadkeyId: r.follows,
        });
      }
    }
  }

  const fanout: FanoutRow[] = [];
  const bases = info.baseStore === null ? undefined : ir.stores.find((s) => s.name === info.baseStore)?.items;
  const outs = info.outputStore === null ? undefined : ir.stores.find((s) => s.name === info.outputStore)?.items;
  if (bases !== undefined && outs !== undefined) {
    const n = Math.min(bases.length, outs.length);
    for (let index = 0; index < n; index++) {
      const b = bases[index];
      const o = outs[index];
      if (b?.kind !== "char" || o?.kind !== "char") continue;
      fanout.push({ index, base: b.value, result: o.value, typedBy: typedBy.get(b.value) ?? null });
    }
  }

  return { deadkeyId: ref, info, fanout, keystroke, empty: fanout.length === 0 && keystroke.length === 0 };
}
