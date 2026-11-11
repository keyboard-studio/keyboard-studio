// Group call graph (mapping rows 1.3-1.11; task T024).
//
// Entry points come from `IRHeader.entryPoints`. Edges come from typed `useGroup`
// outputs and from `match`/`nomatch` right-hand sides kept as `raw`, read through
// rawText.ts. The 1.4a/1.4b split of PostKeystroke rules is a later task: every
// reserved entry group is a single N group here.

import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { ruleLhsKind } from "@keyboard-studio/contracts";
import { parseUseCall } from "./rawText.js";

/** What a group is, for classification and lowering. */
export type GroupRole = "main" | "newContext" | "postKeystroke" | "unreachable";

export interface GroupFacts {
  group: IRGroup;
  /** Position in `ir.groups`. */
  ordinal: number;
  role: GroupRole;
  /** For a group reached from the main entry: reached on every keystroke path, or only some. */
  reach: "entry" | "every" | "some" | null;
  /** True when the group is reached from the main entry through a keystroke group (row 1.7). */
  calledFromKeystrokeGroup: boolean;
  /** Reserved entry group by name (row 1.3 / 1.4). */
  reserved: "newContext" | "postKeystroke" | null;
}

export interface CallGraph {
  entry: IRGroup | undefined;
  /** Main-role groups in call order (DFS from the entry, first call first). */
  order: IRGroup[];
  facts: Map<IRGroup, GroupFacts>;
}

const key = (name: string): string => name.toLowerCase();

/** Group names a rule calls, in output order. */
export function ruleCalls(rule: IRRule): string[] {
  const out: string[] = [];
  for (const el of rule.output) {
    if (el.kind === "useGroup") out.push(el.groupName);
    else if (el.kind === "raw") {
      const g = parseUseCall(el.text);
      if (g !== null) out.push(g);
    }
  }
  return out;
}

function groupCalls(g: IRGroup): string[] {
  const out: string[] = [];
  for (const r of g.rules) for (const c of ruleCalls(r)) if (!out.includes(c)) out.push(c);
  return out;
}

/**
 * Does every path through `caller` reach `target`? Paths are: each ordinary rule (plus the
 * `match` rules that fire after it), the `nomatch` rule, and the implicit default when there is
 * no `nomatch` rule.
 */
function reachesOnEveryPath(caller: IRGroup, target: string): boolean {
  const t = key(target);
  const calls = (r: IRRule): boolean => ruleCalls(r).some((c) => key(c) === t);
  const matchRules = caller.rules.filter((r) => ruleLhsKind(r) === "match");
  const nomatch = caller.rules.filter((r) => ruleLhsKind(r) === "nomatch");
  const ordinary = caller.rules.filter((r) => ruleLhsKind(r) === "input");
  const afterMatch = matchRules.some(calls);
  if (nomatch.length === 0 || !nomatch.some(calls)) return false;
  return ordinary.every((r) => calls(r) || afterMatch);
}

function reachable(ir: KeyboardIR, start: IRGroup | undefined): Set<IRGroup> {
  const seen = new Set<IRGroup>();
  const visit = (g: IRGroup | undefined): void => {
    if (g === undefined || seen.has(g)) return;
    seen.add(g);
    for (const c of groupCalls(g)) visit(ir.groups.find((x) => key(x.name) === key(c)));
  };
  visit(start);
  return seen;
}

export function buildCallGraph(ir: KeyboardIR): CallGraph {
  const byName = (n: string | undefined): IRGroup | undefined =>
    n === undefined ? undefined : ir.groups.find((g) => key(g.name) === key(n));
  const reservedOf = (g: IRGroup): GroupFacts["reserved"] =>
    key(g.name) === "newcontext" ? "newContext" : key(g.name) === "postkeystroke" ? "postKeystroke" : null;

  let entry = byName(ir.header.entryPoints?.main);
  if (entry === undefined) entry = ir.groups.find((g) => g.usingKeys && reservedOf(g) === null);

  // DFS in call order from the entry, tracking reach.
  const order: IRGroup[] = [];
  const reach = new Map<IRGroup, "entry" | "every" | "some">();
  const viaKeys = new Set<IRGroup>();
  const visit = (g: IRGroup, mode: "entry" | "every" | "some"): void => {
    const prev = reach.get(g);
    if (prev === undefined) {
      reach.set(g, mode);
      order.push(g);
    } else if (prev === "every" && mode === "some") reach.set(g, "some");
    else if (prev !== undefined) return;
    for (const c of groupCalls(g)) {
      const next = byName(c);
      if (next === undefined || next === entry || reservedOf(next) !== null) continue;
      if (g.usingKeys && next.usingKeys) viaKeys.add(next);
      const every = (mode === "entry" || mode === "every") && reachesOnEveryPath(g, c);
      if (reach.has(next) && (reach.get(next) === "some" || every)) continue;
      visit(next, every ? "every" : "some");
    }
  };
  if (entry !== undefined) visit(entry, "entry");

  const fromNew = reachable(ir, ir.groups.find((g) => reservedOf(g) === "newContext"));
  const fromPost = reachable(ir, ir.groups.find((g) => reservedOf(g) === "postKeystroke"));

  const facts = new Map<IRGroup, GroupFacts>();
  ir.groups.forEach((group, ordinal) => {
    const reserved = reservedOf(group);
    let role: GroupRole = "unreachable";
    if (reserved === "newContext") role = "newContext";
    else if (reserved === "postKeystroke") role = "postKeystroke";
    else if (reach.has(group)) role = "main";
    else if (fromNew.has(group)) role = "newContext";
    else if (fromPost.has(group)) role = "postKeystroke";
    facts.set(group, {
      group,
      ordinal,
      role,
      reach: reach.get(group) ?? null,
      calledFromKeystrokeGroup: viaKeys.has(group),
      reserved,
    });
  });
  return { entry, order, facts };
}
