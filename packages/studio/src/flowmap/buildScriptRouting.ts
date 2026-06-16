// Derive the §9 script → routing-group table from the survey's own data.
//
// The script choices come from identity_lite's `il_target_script` options; each
// is run through the same scriptAxes helpers the engine uses (normalizeTargetScript,
// routingGroupOf, scriptClassOf), and the "not yet supported" gate is read back
// out of that question's own branching (a script is gated when its branch lands
// on a `notice` node). Nothing here is hand-typed per script, so adding a script
// option to the YAML adds a row to the map.

import { parseFlow } from "../survey/loadFlow.ts";
import type { FlowGotoRule, FlowQuestion } from "../survey/types.ts";
import {
  normalizeTargetScript,
  routingGroupOf,
  scriptClassOf,
  type ScriptRoutingGroup,
} from "../lib/scriptAxes.ts";
import type { ScriptClass } from "@keyboard-studio/contracts";
import { ruleTarget } from "./flowUtils.ts";

export interface ScriptRoutingRow {
  /** Raw il_target_script option value (e.g. "Latn", "romanization-Latn"). */
  value: string;
  /** Human label from the YAML option. */
  label: string;
  /** Normalized BCP47 script subtag. */
  script: string;
  /** "fonipa" when the option is IPA. */
  variant?: "fonipa";
  /** A2 script class (§7.1). */
  scriptClass: ScriptClass;
  /** Script-derived routing group (§9); undefined when the script is gated. */
  routingGroup: ScriptRoutingGroup | null;
  /** True when this script routes to the "not yet supported" stub. */
  gated: boolean;
}

const ID_TARGET_SCRIPT = "il_target_script";

/** Minimal matcher for the `value == 'X'` (optionally `or`-joined) condition form. */
function conditionMatches(condition: string | undefined, value: string): boolean {
  if (condition === undefined) return true; // a default/fallthrough rule
  return condition.split(" or ").some((clause) => {
    const m = clause.trim().match(/^value\s*==\s*'([^']*)'$/);
    return m !== null && m[1] === value;
  });
}

/** Resolve the goto target id for a given answer value, mirroring resolveNext. */
function resolveGoto(next: FlowQuestion["next"], value: string): string | null {
  if (next === undefined || next === null) return null;
  if (typeof next === "string") return next;
  for (const rule of next as FlowGotoRule[]) {
    if (conditionMatches(rule.condition, value)) return ruleTarget(rule);
  }
  return null;
}

/**
 * Build the script-routing table from the identity-lite flow YAML.
 * @param raw the `?raw` identity_lite.yaml source.
 */
export function buildScriptRouting(raw: string): ScriptRoutingRow[] {
  const flow = parseFlow(raw);
  const byId = new Map(flow.questions.map((q) => [q.id, q]));
  const target = byId.get(ID_TARGET_SCRIPT);
  if (target === undefined || !Array.isArray(target.options)) return [];

  return target.options.map((opt) => {
    const { script, variant } = normalizeTargetScript(opt.value);
    const gotoId = resolveGoto(target.next, opt.value);
    const gated = gotoId !== null && byId.get(gotoId)?.type === "notice";

    const row: ScriptRoutingRow = {
      value: opt.value,
      label: opt.label,
      script,
      scriptClass: scriptClassOf(script),
      routingGroup: gated ? null : routingGroupOf(script),
      gated,
    };
    if (variant !== undefined) row.variant = variant;
    return row;
  });
}
