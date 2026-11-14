/**
 * Supersede rule for the `kmn-edits` log (spec 117, ruling 10 "on a key the most recent edit
 * wins"; research R15).
 *
 * The replay applies Layout-tab entries first and Code-tab (`code-apply`) entries last, so a
 * code change would beat a later Layout-tab edit on the same key. This rule restores "most recent
 * wins": a change inside a `code-apply` entry is SUPERSEDED, and skipped, when a Layout-tab entry
 * with a HIGHER `seq` targets the same thing. A superseded change is not a miss (it raises no "no
 * longer fits" flag). The other changes of the same entry still apply.
 *
 * "Targets the same", per Layout-tab op (a Layout entry is read from the raw log, before
 * `normaliseKmnEdits`, so a `clear-key` that spent earlier `set-key`s still counts):
 *   - `set-key` / `clear-key` (vkey, layer): the code change touches a context-free rule on exactly
 *     that vkey + modifier SET. "Touches" means the change's `at.keystroke` names that key, or the
 *     rule it inserts (`node`), removes (`old`) or replaces (`old` and `node`) is such a rule.
 *   - `set-row` / `remove-row` (vkey, layer, context): the same, but the rule must be the
 *     contextual row with exactly that context (`ruleOnSlot`). `at.keystroke` names only a
 *     context-free single-key rule, so it never matches a row.
 *   - `decline-case-partner` and `review-kept` have no IR effect and supersede nothing.
 *   - Changes that touch no rule (stores, groups, begin, header) are never superseded.
 * Deadkey lifecycle ops are not `kmn-edits` entries (they replay at projection step 1.8, before
 * every entry), so they are not part of this relation.
 *
 * The one place this relation is defined; `replayKmnEdits` is its only caller, and the studio's
 * projection and live model both go through `replayKmnEdits`.
 */

import type { CodeEdit, IRChange, IRNode, IRRule, KmnEdit, LayoutOperation } from "@keyboard-studio/contracts";
import { contextKeys, ruleOnSlot, sameLayer } from "./ruleMatch.js";

type Targeting = Extract<LayoutOperation, { op: "set-key" | "clear-key" | "set-row" | "remove-row" }>;

function isTargeting(e: KmnEdit): e is Targeting {
  return e.op === "set-key" || e.op === "clear-key" || e.op === "set-row" || e.op === "remove-row";
}

function isRuleNode(node: IRNode): node is IRRule {
  return "context" in node;
}

/** The rules a change touches (never an anchor's neighbour: `at.text` of an insert is the previous sibling). */
function touchedRules(change: IRChange): IRRule[] {
  switch (change.change) {
    case "insert":
      return isRuleNode(change.node) ? [change.node] : [];
    case "remove":
      return isRuleNode(change.old) ? [change.old] : [];
    case "replace":
      return [change.old, change.node].filter(isRuleNode);
    default:
      return [];
  }
}

function changeTouchedBy(change: IRChange, op: Targeting): boolean {
  const isKeyOp = op.op === "set-key" || op.op === "clear-key";
  const ctx = isKeyOp ? [] : contextKeys(op.context);
  if (isKeyOp && (change.change === "insert" || change.change === "remove" || change.change === "replace")) {
    const ks = change.at.keystroke;
    if (ks !== undefined && ks.vkey === op.vkey && sameLayer(ks.modifiers, op.layer)) return true;
  }
  return touchedRules(change).some((rule) => ruleOnSlot(rule, op.vkey, op.layer, ctx));
}

/** Indexes (into `entry.changes`) of the changes a later Layout-tab entry supersedes. */
export function supersededChangeIndexes(entry: CodeEdit, entries: readonly KmnEdit[]): Set<number> {
  const later = entries.filter((e): e is Targeting => e.seq > entry.seq && isTargeting(e));
  const out = new Set<number>();
  if (later.length === 0) return out;
  entry.changes.forEach((change, index) => {
    if (later.some((op) => changeTouchedBy(change, op))) out.add(index);
  });
  return out;
}
