// Carve-suppression behaviour compiler (spec 076, issue #1802,
// FR-019 / FR-020 / FR-021; ruling §§2–6, 10).
//
// Takes the PRE-carve IR (carved rules still present) plus the author's
// per-combination dispositions and returns a new IR in which every `block`
// disposition is rewritten in place to the shape-correct suppression verb,
// every `allow-host` disposition is removed (host fallback), and every
// emitted rule carries `ownedByBehaviour: "carve-suppression"`.
//
// The compiler is a pure function: the input IR is never mutated. Un-carve
// is the exact inverse via the recorded restorations (FR-021).
//
// Store-slot comboIds (`<storeNodeId>#<index>`) are T013's territory and are
// ignored here.

import type {
  CarveDisposition,
  ContextElement,
  IRRule,
  IRGroup,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";

/** The behaviour id stamped on every rule this compiler emits (FR-021). */
export const CARVE_SUPPRESSION_OWNER = "carve-suppression";

/**
 * Everything `restoreCarveSuppression` needs to undo one compiled change.
 * `index` is the rule's position in the ORIGINAL group; `originalRule` is
 * the pre-rewrite rule verbatim.
 */
export interface SuppressionRestoration {
  /** "rewritten" for block dispositions (and derived arming rewrites); "removed" for allow-host. */
  kind: "rewritten" | "removed";
  groupNodeId: string;
  /** Index in the original group.rules where the carved rule lived. */
  index: number;
  /** The original rule, verbatim, for restoration on un-carve. */
  originalRule: IRRule;
  /** True when the rewrite was derived (deadkey-arming rule), not disposition-driven. */
  derived?: boolean;
}

export interface CompileCarveSuppressionOptions {
  /** Append `beep` to the verb (A6 loud). Default false (soft): never bare `beep`. */
  loud?: boolean;
}

export interface CompileCarveSuppressionResult {
  ir: KeyboardIR;
  restorations: SuppressionRestoration[];
}

/**
 * The FR-020 verb table: the suppression verb is determined by the carved
 * rule's left-hand-side shape.
 *
 * - bare key (`+ [K_E]`, incl. modifiers) → `nul`: nothing matched to preserve.
 * - text-bearing context (`char`, `any()`, `notany()`, …) → `context`:
 *   `nul` would eat the matched text (FR-020 "Never" column).
 * - deadkey-only context (`dk(x) + [K_X]`) → `nul`: re-emitting the context
 *   would re-arm the deadkey — the leak we're closing.
 * - mixed text-plus-deadkey context → `context`: the text must survive.
 *
 * Anything not clearly bare-key or deadkey-only defaults to `context`
 * (preserve rather than destroy unknown matched content).
 */
function suppressionVerb(context: ContextElement[]): OutputElement[] {
  const nonVkey = context.filter((el) => el.kind !== "vkey");
  if (nonVkey.length === 0 && context.length > 0) {
    // Bare key (modifiers allowed): nothing matched to preserve.
    return [{ kind: "nul" }];
  }
  if (nonVkey.length > 0 && nonVkey.every((el) => el.kind === "deadkey")) {
    // Deadkey-only context: re-emitting would re-arm the deadkey.
    return [{ kind: "nul" }];
  }
  return [{ kind: "context", offset: 0 }];
}

/**
 * The deadkey id armed by a deadkey-arming rule (`+ [K_X] > dk(id)`:
 * bare-key LHS, single deadkey output), or undefined for any other shape.
 */
function armingDeadkeyId(rule: IRRule): number | undefined {
  if (rule.context.length === 0 || !rule.context.every((el) => el.kind === "vkey")) {
    return undefined;
  }
  if (rule.output.length !== 1 || rule.output[0]?.kind !== "deadkey") {
    return undefined;
  }
  return rule.output[0].id;
}

interface RuleLocation {
  groupNodeId: string;
  index: number;
  rule: IRRule;
}

function stampOwnership(rule: IRRule, output: OutputElement[]): IRRule {
  // FR-002: the two ownership markers are mutually exclusive on one rule.
  const { ownedByPattern: _dropped, ...rest } = rule;
  return { ...structuredClone(rest), output, ownedByBehaviour: CARVE_SUPPRESSION_OWNER };
}

/**
 * Compile carve suppression (FR-019/FR-020/FR-021).
 *
 * @param ir the PRE-carve IR (carved rules still present); never mutated.
 * @param dispositions per-combination decisions; `comboId` is the rule nodeId.
 * @param options `{ loud?: boolean }` — default soft.
 */
export function compileCarveSuppression(
  ir: KeyboardIR,
  dispositions: CarveDisposition[],
  options: CompileCarveSuppressionOptions = {},
): CompileCarveSuppressionResult {
  const loud = options.loud ?? false;
  const next: KeyboardIR = structuredClone(ir);
  const restorations: SuppressionRestoration[] = [];

  // Index the ORIGINAL rules: nodeId → location. First wins on duplicates.
  const ruleIndex = new Map<string, RuleLocation>();
  for (const group of ir.groups) {
    group.rules.forEach((rule, index) => {
      if (!ruleIndex.has(rule.nodeId)) {
        ruleIndex.set(rule.nodeId, { groupNodeId: group.nodeId, index, rule });
      }
    });
  }
  const nextGroups = new Map<string, IRGroup>(next.groups.map((g) => [g.nodeId, g]));

  const processed = new Set<string>();
  // nodeIds carrying a disposition this run — for the "last consumer carved" check.
  const carvedNodeIds = new Set<string>();

  const verbOutput = (rule: IRRule): OutputElement[] => {
    const verb = suppressionVerb(rule.context);
    return loud ? [...verb, { kind: "beep" }] : verb;
  };

  for (const disposition of dispositions) {
    const comboId = disposition.comboId;
    if (processed.has(comboId)) continue;
    const loc = ruleIndex.get(comboId);
    // Unknown comboIds (including T013's store-slot `<storeNodeId>#<index>`
    // ids, which never resolve to a rule) are ignored without crashing.
    if (!loc) continue;
    // FR-021: already-owned rules are never carve targets (idempotent recompile).
    if (loc.rule.ownedByBehaviour !== undefined) continue;
    processed.add(comboId);
    carvedNodeIds.add(comboId);

    const group = nextGroups.get(loc.groupNodeId);
    if (!group) continue;
    const at = group.rules.findIndex((r) => r.nodeId === comboId);
    if (at === -1) continue;

    if (disposition.disposition === "allow-host") {
      // Scenario 6: the combination falls through to the host layout —
      // no suppression rule emitted, but the removal is recorded for un-carve.
      group.rules.splice(at, 1);
      restorations.push({
        kind: "removed",
        groupNodeId: loc.groupNodeId,
        index: loc.index,
        originalRule: structuredClone(loc.rule),
      });
    } else {
      // Block: rewrite IN PLACE at the same group.rules index, keeping the
      // rule's shadowing position; LHS untouched.
      group.rules[at] = stampOwnership(loc.rule, verbOutput(loc.rule));
      restorations.push({
        kind: "rewritten",
        groupNodeId: loc.groupNodeId,
        index: loc.index,
        originalRule: structuredClone(loc.rule),
      });
    }
  }

  // Derived rewrites (FR-020): a deadkey-arming rule `+ [K_X] > dk(id)` whose
  // every consumer was carved this run is itself a leak (an armed key with no
  // consumers) and is rewritten to `> nul`. Untouched when any consumer
  // survives, when nothing ever consumed the deadkey, or when already owned.
  for (const group of ir.groups) {
    group.rules.forEach((rule, index) => {
      if (processed.has(rule.nodeId)) return;
      if (rule.ownedByBehaviour !== undefined) return;
      const armedId = armingDeadkeyId(rule);
      if (armedId === undefined) return;

      const consumers: string[] = [];
      for (const other of ir.groups) {
        for (const candidate of other.rules) {
          if (candidate.nodeId === rule.nodeId) continue;
          if (candidate.context.some((el) => el.kind === "deadkey" && el.id === armedId)) {
            consumers.push(candidate.nodeId);
          }
        }
      }
      if (consumers.length === 0) return;
      if (!consumers.every((c) => carvedNodeIds.has(c))) return;

      const nextGroup = nextGroups.get(group.nodeId);
      if (!nextGroup) return;
      const at = nextGroup.rules.findIndex((r) => r.nodeId === rule.nodeId);
      if (at === -1) return;
      nextGroup.rules[at] = stampOwnership(rule, loud ? [{ kind: "nul" }, { kind: "beep" }] : [{ kind: "nul" }]);
      processed.add(rule.nodeId);
      restorations.push({
        kind: "rewritten",
        groupNodeId: group.nodeId,
        index,
        originalRule: structuredClone(rule),
        derived: true,
      });
    });
  }

  return { ir: next, restorations };
}

/**
 * Un-carve (FR-021): the exact inverse of `compileCarveSuppression`.
 * Removed rules are re-inserted at their original indices (ascending, so
 * each insert lands at its recorded position); rewritten rules are replaced
 * by nodeId with their verbatim originals.
 */
export function restoreCarveSuppression(
  ir: KeyboardIR,
  restorations: readonly SuppressionRestoration[],
): KeyboardIR {
  const next: KeyboardIR = structuredClone(ir);

  const byGroup = new Map<string, SuppressionRestoration[]>();
  for (const restoration of restorations) {
    const list = byGroup.get(restoration.groupNodeId);
    if (list) list.push(restoration);
    else byGroup.set(restoration.groupNodeId, [restoration]);
  }

  for (const [groupNodeId, groupRestorations] of byGroup) {
    const group = next.groups.find((g) => g.nodeId === groupNodeId);
    if (!group) continue;
    const rules = [...group.rules];

    // Re-insert removals first, ascending by original index: after all
    // insertions every surviving rule sits at its original index again.
    const removed = groupRestorations
      .filter((r) => r.kind === "removed")
      .sort((a, b) => a.index - b.index);
    for (const restoration of removed) {
      rules.splice(Math.min(restoration.index, rules.length), 0, restoration.originalRule);
    }

    // Then swap rewritten rules back by nodeId (positions never moved).
    for (const restoration of groupRestorations.filter((r) => r.kind === "rewritten")) {
      const at = rules.findIndex((r) => r.nodeId === restoration.originalRule.nodeId);
      if (at !== -1) rules[at] = restoration.originalRule;
      else rules.splice(Math.min(restoration.index, rules.length), 0, restoration.originalRule);
    }

    group.rules = rules;
  }

  return next;
}
