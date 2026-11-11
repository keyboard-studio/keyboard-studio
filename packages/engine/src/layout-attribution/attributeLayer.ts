// Per-key attribution of one desktop layer (spec 117 FR-012 / FR-013 / FR-014,
// research R4; contracts/attribution.md). Static: reads the IR only. The studio
// then verifies the editable results against the compiled artifact (`verifyCells`).

import { US_BASE_LAYOUT } from "@keyboard-studio/contracts";
import type { KeyboardIR, LayerCombo, LayoutBecomes, LayoutOutput } from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY, isFrameKey } from "../layout-chart/geometry.js";
import { sameLayer } from "../layout-ops/ruleMatch.js";
import type { ClassifiedRule } from "./entryRules.js";
import { classifyEntryRules } from "./entryRules.js";
import { findShadowedRules } from "./findShadowedRules.js";
import { isMnemonic } from "./isMnemonic.js";
import type { KeyCellAttribution, ReadOnlyReason, RowAttribution } from "./types.js";

function toRow(c: ClassifiedRule, override?: { editable: false; reason: ReadOnlyReason }): RowAttribution {
  const { cls } = c;
  const reason = override?.reason ?? cls.readOnlyReason;
  // A `{context, output}` literal is the FR-037 rule-literal selector's
  // trigger, and this is a RowAttribution, not a rule — so `output` rides
  // in a spread instead of sitting beside `context` in one literal.
  const row: Omit<RowAttribution, "output"> = {
    ruleNodeId: c.nodeId,
    shape: cls.shape,
    context: cls.context,
    editable: override === undefined && cls.editable,
    ...(reason !== undefined && (override !== undefined || !cls.editable) ? { readOnlyReason: reason } : {}),
    provenance: cls.provenance,
    ...(cls.authorEdit !== undefined ? { authorEdit: cls.authorEdit } : {}),
  };
  return { ...row, output: cls.output };
}

const FRAME_VKEYS: ReadonlySet<string> = new Set(DESKTOP_ISO_GEOMETRY.filter((k) => k.frame).map((k) => k.id));

/** Keys drawn on the grid but outside the editable layout block (Backspace, Tab, Enter, Shift, arrows ...). */
function isFrame(vkey: string): boolean {
  return FRAME_VKEYS.has(vkey) || isFrameKey(vkey);
}

function demote(row: RowAttribution, reason: ReadOnlyReason): RowAttribution {
  if (!row.editable) return row;
  const { readOnlyReason: _drop, ...rest } = row;
  void _drop;
  return { ...rest, editable: false, readOnlyReason: reason };
}

function plainText(output: LayoutOutput | LayoutBecomes | null): string | null {
  if (output === null || !("kind" in output)) return null;
  return output.kind === "text" ? output.text : null;
}

/**
 * Attribute every key in `vkeys` for `layer`. Only the entry group (the one `begin Unicode`
 * uses) is read; opaque fragments inside it count as possibly firing first.
 *
 * Plain behaviour (FR-013): the key's first context-free rule. Later context-free rules on
 * the key are `never-fires` rows once an unconditional rule has matched. A context-free
 * rule that cannot be edited and sits before the plain rule makes the plain read-only; a
 * read-only contextual row never does.
 */
export function attributeLayer(ir: KeyboardIR, layer: LayerCombo, vkeys: readonly string[]): KeyCellAttribution[] {
  const rules = classifyEntryRules(ir);
  const shadowed = new Map(findShadowedRules(ir).map((s) => [s.ruleNodeId, s.shadowedBy]));
  const mnemonic = isMnemonic(ir);
  const fanouts = rules.filter((r) => r.cls.fanout !== undefined);

  return vkeys.map((vkey): KeyCellAttribution => {
    if (isFrame(vkey)) return { vkey, layer, plain: null, rows: [], unhandled: false, frame: true };

    const here = rules.filter((r) => r.cls.keys.some((k) => k.vkey === vkey && sameLayer(k.layer, layer)));
    const contextFree = here.filter((r) => r.cls.contextFree);
    const contextual = here.filter((r) => !r.cls.contextFree);

    let plain: RowAttribution | null = null;
    const rows: RowAttribution[] = [];
    let blocker: ClassifiedRule | null = null; // first read-only context-free rule seen before the plain rule
    let shadowing = false; // an unconditional context-free rule has been seen

    for (const r of contextFree) {
      if (shadowing) {
        rows.push(toRow(r, { editable: false, reason: "never-fires" }));
        continue;
      }
      if (r.cls.editable && plain === null) {
        plain =
          blocker === null
            ? toRow(r)
            : toRow(r, { editable: false, reason: blocker.cls.readOnlyReason ?? "conditional" });
      } else {
        blocker ??= r;
        rows.push(toRow(r));
      }
      if (r.cls.alwaysMatches) shadowing = true;
    }
    if (plain === null && rows.length > 0 && contextFree.length > 0) {
      // No editable plain rule: the first context-free rule stands for the plain behaviour.
      const firstId = contextFree[0]!.nodeId;
      const at = rows.findIndex((x) => x.ruleNodeId === firstId);
      if (at >= 0) plain = rows.splice(at, 1)[0]!;
    }

    for (const r of contextual) {
      const by = shadowed.get(r.nodeId);
      rows.push(by !== undefined ? toRow(r, { editable: false, reason: "never-fires" }) : toRow(r));
    }

    // Deadkey tables in the studio's own shape: one row per base character this key types.
    // The character the key types: its plain rule's text, or for an unhandled key the US base
    // character (the simulator's base layout; none and shift layers only).
    let text = plainText(plain?.output ?? null);
    if (text === null && plain === null && !mnemonic) {
      const base = layer.length === 0 ? US_BASE_LAYOUT.get(vkey) : sameLayer(layer, ["SHIFT"]) ? US_BASE_LAYOUT.get(`S+${vkey}`) : undefined;
      text = base ?? null;
    }
    if (text !== null) {
      for (const f of fanouts) {
        const table = f.cls.fanout!;
        const index = table.pairs.findIndex((p) => p.base === text);
        if (index < 0) continue;
        // The row is reachable only through the key's plain behaviour: if that is read-only, so is the row.
        const row = toRow(f, plain === null || plain.editable ? undefined : { editable: false, reason: plain.readOnlyReason ?? "later-group-change" });
        rows.push({
          ...row,
          output: [{ kind: "text", text: table.pairs[index]!.result }],
          fanoutIndex: index,
        });
      }
    }

    const cell: KeyCellAttribution = { vkey, layer, plain, rows, unhandled: plain === null, frame: false };
    if (!mnemonic) return cell;
    return {
      ...cell,
      plain: cell.plain === null ? null : demote(cell.plain, "mnemonic"),
      rows: cell.rows.map((row) => demote(row, "mnemonic")),
    };
  });
}
