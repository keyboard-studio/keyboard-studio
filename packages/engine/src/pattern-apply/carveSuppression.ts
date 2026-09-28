// Carve-suppression behaviour compiler (spec 076, issue #1802,
// FR-019 / FR-020 / FR-021; ruling §§2–6, 10).
//
// Takes the PRE-carve IR (carved rules AND carved store slots still present)
// plus the author's per-combination dispositions and returns a new IR in which
// every `block` disposition is rewritten in place to the shape-correct
// suppression verb (or, for store slots, suppressed via a synthesized guard
// rule), every `allow-host` disposition is removed (host fallback), and every
// emitted rule carries `ownedByBehaviour: "carve-suppression"`.
//
// The compiler is a pure function: the input IR is never mutated. Un-carve
// is the exact inverse via the recorded restorations (FR-021).
//
// Store slots are addressed by `<storeNodeId>#<index>` comboIds (T013). The
// slot removal itself is the carve pipeline's job (`applyStoreSlotRemovals`);
// this compiler only synthesizes the guard rules. It MUST therefore see the
// pre-removal IR — the selector char is read from the store, and is
// unrecoverable once the slot is dropped (a T015 composition constraint).

import type {
  CarveDisposition,
  ContextElement,
  IRRule,
  IRGroup,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";
import { parseSlotId } from "./slotId.js";
import { analyzeStores } from "./applyStoreSlotRemovals.js";

/** The behaviour id stamped on every rule this compiler emits (FR-021). */
export const CARVE_SUPPRESSION_OWNER = "carve-suppression";

/**
 * The nodeId prefix for guard rules synthesized for one store slot (T013):
 * `gen-carve-guard-<storeNodeId>-<itemsIndex>-<ruleNodeId>-<occurrence>`.
 * Exported for the FR-005 swallow-set seam (T014): a slot combo is covered
 * iff a behaviour-owned rule carries this prefix.
 */
export function slotGuardNodeIdPrefix(storeNodeId: string, itemsIndex: number): string {
  return `gen-carve-guard-${storeNodeId}-${itemsIndex}-`;
}

/**
 * Everything `restoreCarveSuppression` needs to undo one compiled change.
 *
 * - `"rewritten"` / `"removed"`: rule dispositions (and derived arming
 *   rewrites). `index` is the rule's position in the ORIGINAL group;
 *   `originalRule` is the pre-rewrite rule verbatim.
 * - `"guard"`: a synthesized store-slot guard rule (T013). There is no
 *   original rule — the guard is purely additive — so restoration removes the
 *   rule identified by `synthesizedNodeId`. The slot itself was never touched
 *   by this compiler (removal is the carve pipeline's job), so "restoring the
 *   slot" is a no-op here; the pipeline's own un-carve restores slot content.
 */
export interface SuppressionRestoration {
  /** "rewritten" for block dispositions (and derived arming rewrites); "removed" for allow-host; "guard" for synthesized slot guards. */
  kind: "rewritten" | "removed" | "guard";
  groupNodeId: string;
  /** Index in the original group.rules where the carved rule lived (for "guard": the insertion index). */
  index: number;
  /** The original rule, verbatim, for restoration on un-carve. Absent for "guard". */
  originalRule?: IRRule;
  /** The synthesized guard's nodeId, for removal on un-carve. Set only for "guard". */
  synthesizedNodeId?: string;
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
 * T013: synthesize guard rules for `block` store-slot dispositions.
 *
 * A carved store slot has no per-key rule to rewrite — the coordinated drop
 * removes the row everywhere. Suppression is via synthesized guard rules
 * (ruling §5, spec scenario 5): for each rule whose context consumes the
 * carved store via `any()`, one guard per `any()` occurrence reproduces the
 * paired rule's LHS with that occurrence replaced by the carved selector
 * char (e.g. `dk(003b) any(dkf003b) > index(dkt003b, 2)` carving "é" yields
 * `dk(003b) "e" > context`), placed immediately ahead of the paired rule so
 * it shadows it for exactly the carved character. The verb follows the
 * FR-020 shape table on the guard's context (always `context` in practice:
 * the substituted char makes deadkey-only/bare-key shapes impossible).
 *
 * Interior `nul` store padding stays forbidden: guards are RULES, never store
 * entries — this function never touches `ir.stores`.
 *
 * `allow-host` slot dispositions are a deliberate no-op here (no guard, no
 * restoration): the slot stays removed and the combination falls through to
 * the host. The slot removal itself is always the carve pipeline's job.
 *
 * Runs BEFORE rule dispositions so guard placement sees the pre-disposition
 * layout; paired rules are located by nodeId in the working copy. Rules
 * already carrying `ownedByBehaviour` are never guard anchors (they are not
 * author content and not carve targets, FR-021). Guard nodeIds are
 * deterministic (`gen-carve-guard-…`) so a recompile skips already-emitted
 * guards (idempotent).
 */
function compileSlotGuards(
  ir: KeyboardIR,
  nextGroups: Map<string, IRGroup>,
  dispositions: CarveDisposition[],
  loud: boolean,
  ruleIndex: Map<string, RuleLocation>,
  processed: Set<string>,
): SuppressionRestoration[] {
  const restorations: SuppressionRestoration[] = [];

  // Rule nodeIds take precedence over slot ids: a rule whose nodeId happens
  // to parse as `<id>#<digits>` is a rule disposition, not a slot.
  const slotDispositions = dispositions.filter((d) => {
    if (processed.has(d.comboId)) return false;
    if (ruleIndex.has(d.comboId)) return false;
    return parseSlotId(d.comboId) !== null;
  });
  if (slotDispositions.length === 0) return restorations;

  // Lazily built once: the pairing graph resolves which stores are
  // positionally tied to the carved store (coordinated drop targets).
  let analysis: ReturnType<typeof analyzeStores> | undefined;

  for (const disposition of slotDispositions) {
    const comboId = disposition.comboId;
    processed.add(comboId);
    // allow-host on a slot: no guard. The slot removal is the carve
    // pipeline's job; this compiler changes nothing and records nothing.
    if (disposition.disposition === "allow-host") continue;

    const slot = parseSlotId(comboId);
    if (!slot) continue;
    const store = ir.stores.find((s) => s.nodeId === slot.storeNodeId);
    if (!store) continue;
    const slotItem = store.items[slot.itemsIndex];
    // Only char slots can be guarded (a guard substitutes the carved char
    // into the paired rule's LHS). Non-char slots are ignored, not crashed on.
    if (!slotItem || slotItem.kind !== "char") continue;

    if (!analysis) analysis = analyzeStores(ir);
    const pairSet = analysis.pairSets.get(store.name) ?? new Set([store.name]);

    // Selector char per paired store: the char at the carved index in each
    // positionally-tied store (the coordinated drop splices the same index
    // everywhere, so each peer contributes its own selector char).
    const selectorChars = new Map<string, string>();
    for (const name of pairSet) {
      const peer = analysis.storeByName.get(name);
      const item = peer?.items[slot.itemsIndex];
      if (item?.kind === "char") selectorChars.set(name, item.value);
    }
    if (selectorChars.size === 0) continue;

    // Paired rules: unowned rules whose context consumes a paired store via
    // any(). One guard per any() occurrence (each occurrence is an
    // independent match position for the carved char).
    for (const group of ir.groups) {
      const nextGroup = nextGroups.get(group.nodeId);
      if (!nextGroup) continue;
      group.rules.forEach((rule, originalIndex) => {
        if (rule.ownedByBehaviour !== undefined) return;
        const occurrences: number[] = [];
        rule.context.forEach((el, contextIdx) => {
          if (el.kind === "any" && selectorChars.has(el.storeRef)) occurrences.push(contextIdx);
        });
        occurrences.forEach((contextIdx, occNum) => {
          const anyEl = rule.context[contextIdx];
          if (!anyEl || anyEl.kind !== "any") return;
          const selectorChar = selectorChars.get(anyEl.storeRef);
          if (selectorChar === undefined) return;

          const guardNodeId =
            `${slotGuardNodeIdPrefix(slot.storeNodeId, slot.itemsIndex)}${rule.nodeId}-${occNum}`;
          // Idempotent recompile: never emit the same guard twice.
          if (nextGroup.rules.some((r) => r.nodeId === guardNodeId)) return;

          const guardContext: ContextElement[] = rule.context.map((el, idx) =>
            idx === contextIdx ? { kind: "char", value: selectorChar } : el,
          );
          const verb = suppressionVerb(guardContext);
          const guard: IRRule = {
            nodeId: guardNodeId,
            context: guardContext,
            output: loud ? [...verb, { kind: "beep" }] : verb,
            ownedByBehaviour: CARVE_SUPPRESSION_OWNER,
          };

          // Immediately ahead of the paired rule (its shadowing position).
          // Defensive fallback: the paired rule is guaranteed present here
          // (rule dispositions run after this pass), but if it ever is not,
          // land at its original index, clamped.
          const at = nextGroup.rules.findIndex((r) => r.nodeId === rule.nodeId);
          const insertAt = at === -1 ? Math.min(originalIndex, nextGroup.rules.length) : at;
          nextGroup.rules.splice(insertAt, 0, guard);
          restorations.push({
            kind: "guard",
            groupNodeId: group.nodeId,
            index: insertAt,
            synthesizedNodeId: guardNodeId,
          });
        });
      });
    }
  }

  return restorations;
}

/**
 * Compile carve suppression (FR-019/FR-020/FR-021).
 *
 * @param ir the PRE-carve IR (carved rules AND carved store slots still
 *           present); never mutated. For slots this is load-bearing: the
 *           guard's selector char is read from the store and is
 *           unrecoverable once `applyStoreSlotRemovals` has dropped it.
 * @param dispositions per-combination decisions; `comboId` is the rule
 *           nodeId, or `<storeNodeId>#<index>` for a store slot (T013).
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

  // T013 first: store-slot guard synthesis runs before rule dispositions so
  // guard placement sees the pre-disposition layout. Slot comboIds are marked
  // processed so the rule loop below skips them.
  restorations.push(
    ...compileSlotGuards(ir, nextGroups, dispositions, loud, ruleIndex, processed),
  );

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
 * Synthesized guard rules are removed by nodeId first (they were purely
 * additive, so removing them restores the layout the other steps expect);
 * removed rules are re-inserted at their original indices (ascending, so
 * each insert lands at its recorded position); rewritten rules are replaced
 * by nodeId with their verbatim originals.
 *
 * The slot itself is untouched here — this compiler never removed it (that
 * is the carve pipeline's job, and its un-carve restores slot content).
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

    // Remove synthesized guards first, by nodeId: they were inserted
    // additively, so their removal restores the pre-guard layout that the
    // original-index bookkeeping below was recorded against.
    for (const restoration of groupRestorations.filter((r) => r.kind === "guard")) {
      if (restoration.synthesizedNodeId === undefined) continue;
      const at = rules.findIndex((r) => r.nodeId === restoration.synthesizedNodeId);
      if (at !== -1) rules.splice(at, 1);
    }

    // Re-insert removals first, ascending by original index: after all
    // insertions every surviving rule sits at its original index again.
    const removed = groupRestorations
      .filter((r) => r.kind === "removed")
      .sort((a, b) => a.index - b.index);
    for (const restoration of removed) {
      if (restoration.originalRule === undefined) continue;
      rules.splice(Math.min(restoration.index, rules.length), 0, restoration.originalRule);
    }

    // Then swap rewritten rules back by nodeId (positions never moved).
    for (const restoration of groupRestorations.filter((r) => r.kind === "rewritten")) {
      if (restoration.originalRule === undefined) continue;
      const at = rules.findIndex((r) => r.nodeId === restoration.originalRule!.nodeId);
      if (at !== -1) rules[at] = restoration.originalRule;
      else rules.splice(Math.min(restoration.index, rules.length), 0, restoration.originalRule);
    }

    group.rules = rules;
  }

  return next;
}
