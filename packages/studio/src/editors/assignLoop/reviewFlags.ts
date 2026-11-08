// reviewFlags -- what the Code tab asks the author to review (spec 113 US8, FR-063).
//
// Pure. A flag is raised for: (a) a Code-tab entry that overrode another editor's work and has
// no `ReviewKept` for it, (b) an entry change that no longer finds its anchor on replay, and
// (c) a rule a Code-tab entry inserted that another rule in its group now shadows. A `ReviewKept`
// entry targeting a seq clears every flag of that seq. Flags never block completion or download.

import { findShadowedRules } from "@keyboard-studio/engine";
import type { CodeEdit, IRChange, KeyboardIR, KmnEdit, KmnEditsValue, OwnerRef } from "@keyboard-studio/contracts";

export interface ReplayMissLike {
  readonly seq: number;
  readonly reason: string;
}

export type ReviewFlag =
  | { kind: "overrode"; seq: number; owners: OwnerRef["owner"][]; changes: number }
  | { kind: "missed"; seq: number; reason: string }
  | { kind: "shadowed"; seq: number | null; ruleNodeId: string; shadowedBy: string };

/** A node's content without its identity or source position, so a stored change can be matched to a live rule. */
function contentKey(node: unknown): string {
  return JSON.stringify(node, (key, v: unknown) => (key === "nodeId" || key === "authorEdit" || key === "sourceLine" ? undefined : v));
}

function insertedRuleKeys(changes: readonly IRChange[]): string[] {
  const keys: string[] = [];
  for (const c of changes) {
    if (c.change === "insert" || c.change === "replace") keys.push(contentKey(c.node));
  }
  return keys;
}

function codeEdits(entries: readonly KmnEdit[]): CodeEdit[] {
  return entries.filter((e): e is CodeEdit => e.op === "code-apply");
}

/** The latest Code-tab entry that inserted or replaced `ruleNode`, or null. */
function entryFor(entries: readonly KmnEdit[], ruleNode: unknown): CodeEdit | null {
  const key = contentKey(ruleNode);
  const edits = codeEdits(entries);
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    if (e !== undefined && insertedRuleKeys(e.changes).includes(key)) return e;
  }
  return null;
}

/** The node id of a live rule that a flag's entry put there, so "view in code" can reveal it. */
export function nodeIdForFlag(flag: ReviewFlag, value: KmnEditsValue | undefined, ir: KeyboardIR | null): string | undefined {
  if (flag.kind === "shadowed") return flag.ruleNodeId;
  if (value === undefined || ir === null) return undefined;
  const entry = codeEdits(value.entries).find((e) => e.seq === flag.seq);
  if (entry === undefined) return undefined;
  const keys = new Set(insertedRuleKeys(entry.changes));
  for (const group of ir.groups) {
    const hit = group.rules.find((r) => r.authorEdit === "code-tab" && keys.has(contentKey(r)));
    if (hit !== undefined) return hit.nodeId;
  }
  return undefined;
}

export function reviewFlags(
  value: KmnEditsValue | undefined,
  misses: readonly ReplayMissLike[],
  ir: KeyboardIR | null,
): ReviewFlag[] {
  if (value === undefined) return [];
  const kept = new Set<number>();
  for (const e of value.entries) if (e.op === "review-kept") kept.add(e.target);
  const flags: ReviewFlag[] = [];
  for (const e of codeEdits(value.entries)) {
    if (e.overrides.length === 0 || kept.has(e.seq)) continue;
    flags.push({ kind: "overrode", seq: e.seq, owners: [...new Set(e.overrides.map((o) => o.owner))], changes: e.changes.length });
  }
  for (const m of misses) {
    if (!kept.has(m.seq)) flags.push({ kind: "missed", seq: m.seq, reason: m.reason });
  }
  if (ir !== null) {
    for (const hit of findShadowedRules(ir)) {
      const rule = ir.groups.flatMap((g) => g.rules).find((r) => r.nodeId === hit.ruleNodeId);
      if (rule === undefined || rule.authorEdit !== "code-tab") continue;
      const entry = entryFor(value.entries, rule);
      if (entry !== null && kept.has(entry.seq)) continue;
      flags.push({ kind: "shadowed", seq: entry?.seq ?? null, ruleNodeId: hit.ruleNodeId, shadowedBy: hit.shadowedBy });
    }
  }
  return flags;
}
