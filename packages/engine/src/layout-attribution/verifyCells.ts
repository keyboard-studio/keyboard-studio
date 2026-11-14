// Verification pass (spec 117 FR-013, research R4): an editable plain or row whose
// simulated output differs from its own output is changed by a later rule or group, so it
// is demoted to read-only (`later-group-change`). Pure: the caller runs `simulateEach`
// (empty seed for plain, the row's context as the seed for a row) and passes the steps in.

import type { LayerCombo, LayoutBecomes, LayoutContext, LayoutOutput } from "@keyboard-studio/contracts";
import type { SimulationStep } from "@keyboard-studio/contracts";
import { contextKeys, sameLayer } from "../layout-ops/ruleMatch.js";
import type { KeyCellAttribution, RowAttribution } from "./types.js";

/** One simulated keystroke: the key, layer and context it was seeded with, and what the simulator did. */
export interface CellStep {
  vkey: string;
  layer: LayerCombo;
  /** What was seeded before the keystroke; absent or `[]` for the plain behaviour. */
  context?: LayoutContext;
  step: SimulationStep;
}

/**
 * Optional check that the rule which fired is the row's own rule (the studio maps the
 * compiled ordinal back to an IR rule through `firedRuleMapping`). `false` demotes.
 */
export type FiredRuleCheck = (step: SimulationStep, ruleNodeId: string) => boolean;

function expected(output: LayoutOutput | LayoutBecomes): { text: string; deadkeys: number } {
  if (!Array.isArray(output)) {
    const o = output as LayoutOutput;
    if (o.kind === "text") return { text: o.text, deadkeys: 0 };
    if (o.kind === "deadkey") return { text: "", deadkeys: 1 };
    return { text: "", deadkeys: 0 };
  }
  let text = "";
  let deadkeys = 0;
  for (const el of output as LayoutContext) {
    if (el.kind === "text") text += el.text;
    else deadkeys += 1;
  }
  return { text, deadkeys };
}

/**
 * True when the step matches what the row says it produces. Deadkey identities are not
 * compared: the compiler numbers named deadkeys, so only their count is checkable.
 */
function stepMatches(row: RowAttribution, step: SimulationStep): boolean {
  if (row.output === null) return true;
  const want = expected(row.output);
  return step.outputAfter === want.text && step.pendingDeadkeys.length === want.deadkeys;
}

function demoted(row: RowAttribution): RowAttribution {
  const { readOnlyReason: _drop, ...rest } = row;
  void _drop;
  return { ...rest, editable: false, readOnlyReason: "later-group-change" };
}

function check(row: RowAttribution, cell: KeyCellAttribution, steps: readonly CellStep[], fired?: FiredRuleCheck): RowAttribution {
  if (!row.editable) return row;
  const rowKeys = contextKeys(row.context);
  const hit = steps.find(
    (s) =>
      s.vkey === cell.vkey &&
      sameLayer(s.layer, cell.layer) &&
      (() => {
        const k = contextKeys(s.context ?? []);
        return k.length === rowKeys.length && k.every((x, i) => x === rowKeys[i]);
      })(),
  );
  // No step for this row: it stays as the static pass left it.
  if (hit === undefined) return row;
  if (!stepMatches(row, hit.step)) return demoted(row);
  if (fired !== undefined && !fired(hit.step, row.ruleNodeId)) return demoted(row);
  return row;
}

export function verifyCells(
  cells: readonly KeyCellAttribution[],
  steps: readonly CellStep[],
  firedRuleIs?: FiredRuleCheck,
): KeyCellAttribution[] {
  return cells.map((cell) => {
    if (cell.frame) return cell;
    return {
      ...cell,
      plain: cell.plain === null ? null : check(cell.plain, cell, steps, firedRuleIs),
      rows: cell.rows.map((row) => check(row, cell, steps, firedRuleIs)),
    };
  });
}
