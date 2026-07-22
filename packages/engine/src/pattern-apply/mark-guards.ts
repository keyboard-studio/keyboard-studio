// Mark guards (spec 046, US8): the two generated behaviors that make the
// attachment matrix LOAD-BEARING on the produced keyboard, both derived from
// the marks-series worklist (the same tables as everything else — R5):
//
//   1. BLOCKING (FR-021, the minimal A6 pull-forward): every base × mark pair
//      left unchecked at the attachment station gets a swallow rule — if the
//      decomposed sequence ever forms, the mark is silently removed, so no
//      ordinary key sequence reaches the composed result. Implemented as a
//      generated non-using-keys guard group entered via `match > use(...)`
//      from the entry group (the standard KMN post-processing idiom), so it
//      works regardless of which keys the gallery later assigns.
//
//   2. STEPWISE BACKSPACE UNWRAP (the design-note recipe): under the
//      ready-made output form, each composed unit pairs with its one-mark-
//      shorter predecessor in a generated store pair, and one
//      `any(from) + [K_BKSP] > index(to,1)` rule peels marks step by step.
//      (Under base-plus-mark output the peel is native — one code point per
//      backspace — so no rules are generated.)
//
// Pure IR → IR: never touches raw .kmn text; generated nodes carry
// `generated_marks_` name prefixes so they are recognizable and re-runs
// replace rather than duplicate (idempotent).

import type {
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  PlacementWorklist,
} from "@keyboard-studio/contracts";

export const MARKS_GUARD_GROUP = "generated_marks_guard";
export const MARKS_UNWRAP_FROM_STORE = "generated_marks_unwrap_from";
export const MARKS_UNWRAP_TO_STORE = "generated_marks_unwrap_to";

export interface MarkGuardsResult {
  ir: KeyboardIR;
  blockingRuleCount: number;
  unwrapPairCount: number;
  /**
   * Set when an existing match rule already ends with a `use(...)` to a
   * group other than the marks guard group — kmcmplib allows only one
   * trailing `use()` per rule, so chaining a second hop would break that
   * foreign rule. The guard hop is skipped (the foreign rule is left
   * untouched) rather than silently reordering someone else's use() chain.
   */
  guardHopSkipped?: boolean;
}

/** The entry group: the first using-keys group (KMN's begin target). */
function entryGroupOf(groups: IRGroup[]): IRGroup | undefined {
  return groups.find((g) => g.usingKeys && !g.readonly);
}

/**
 * Insert a rule immediately before the first match/nomatch rule in the
 * group, or append if there is none. kmcmplib requires match/nomatch rules
 * to be last in a group, so any newly generated ordinary rule must land
 * before them, not after.
 */
function insertBeforeTerminalRules(rules: IRRule[], rule: IRRule): IRRule[] {
  const idx = rules.findIndex((r) => r.matchKind === "match" || r.matchKind === "nomatch");
  if (idx === -1) return [...rules, rule];
  return [...rules.slice(0, idx), rule, ...rules.slice(idx)];
}

/**
 * Whether an output element is a `use(...)` group transition targeting
 * `groupName` — either the structured `{kind:"useGroup"}` node (what this
 * module and the parser's non-match `use()` path emit) or the `{kind:"raw"}`
 * node the parser produces for `match > use(...)` / `nomatch > use(...)`
 * lines (see codec/parse.ts's match/nomatch case, which preserves the RHS
 * verbatim as raw text rather than parsing it structurally).
 */
function isUseGroupOutputFor(el: { kind: string; groupName?: string; text?: string }, groupName: string): boolean {
  if (el.kind === "useGroup") return el.groupName === groupName;
  if (el.kind === "raw") return el.text?.trim() === `use(${groupName})`;
  return false;
}

/** Whether an output element is any `use(...)` group transition (structured or raw). */
function isAnyUseGroupOutput(el: { kind: string; text?: string }): boolean {
  if (el.kind === "useGroup") return true;
  if (el.kind === "raw") return /^use\([^)]*\)$/.test(el.text?.trim() ?? "");
  return false;
}

function buildGuardGroup(worklist: PlacementWorklist): IRGroup | null {
  if (worklist.blockedCombinations.length === 0) return null;
  const rules: IRRule[] = worklist.blockedCombinations.map((pair, i) => ({
    nodeId: `gen-marks-block-${i + 1}`,
    context: [
      { kind: "char", value: pair.base },
      { kind: "char", value: pair.mark },
    ],
    output: [{ kind: "char", value: pair.base }],
    trailingComment: "generated: blocked combination (marks series)",
  }));
  return {
    nodeId: "gen-marks-guard-group",
    name: MARKS_GUARD_GROUP,
    usingKeys: false,
    rules,
    readonly: false,
  };
}

function buildUnwrap(
  worklist: PlacementWorklist,
  outputForm: "ready-made" | "base-plus-mark",
): { stores: IRStore[]; rule: IRRule } | null {
  if (outputForm !== "ready-made") return null;
  // Composed units: single code point with a canonical mark decomposition.
  const pairs: { from: string; to: string }[] = [];
  for (const unit of worklist.ownLetterUnits) {
    if ([...unit].length !== 1) continue;
    const nfd = [...unit.normalize("NFD")];
    if (nfd.length < 2) continue;
    // One-mark-shorter predecessor, re-composed (é̂ -> é -> e).
    const to = nfd.slice(0, -1).join("").normalize("NFC");
    pairs.push({ from: unit, to });
  }
  if (pairs.length === 0) return null;
  const stores: IRStore[] = [
    {
      nodeId: "gen-marks-unwrap-from",
      name: MARKS_UNWRAP_FROM_STORE,
      items: pairs.map((p) => ({ kind: "char" as const, value: p.from })),
      isSystem: false,
    },
    {
      nodeId: "gen-marks-unwrap-to",
      name: MARKS_UNWRAP_TO_STORE,
      items: pairs.map((p) => ({ kind: "char" as const, value: p.to })),
      isSystem: false,
    },
  ];
  const rule: IRRule = {
    nodeId: "gen-marks-unwrap-rule",
    context: [
      { kind: "any", storeRef: MARKS_UNWRAP_FROM_STORE },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_BKSP", modifiers: [] },
    ],
    output: [{ kind: "index", storeRef: MARKS_UNWRAP_TO_STORE, offset: 1 }],
    trailingComment: "generated: stepwise backspace unwrap (marks series)",
  };
  return { stores, rule };
}

/**
 * Apply the mark guards to a working-copy IR. Idempotent: previously
 * generated guard groups/stores/rules (recognized by their names/nodeIds) are
 * replaced, never duplicated. A worklist with nothing to block and nothing to
 * unwrap returns the IR unchanged (same reference).
 */
export function applyMarkGuards(
  ir: KeyboardIR,
  worklist: PlacementWorklist,
  outputForm: "ready-made" | "base-plus-mark",
): MarkGuardsResult {
  const guardGroup = buildGuardGroup(worklist);
  const unwrap = buildUnwrap(worklist, outputForm);
  if (guardGroup === null && unwrap === null) {
    return { ir, blockingRuleCount: 0, unwrapPairCount: 0 };
  }

  // Strip any previously generated artifacts (idempotent re-run). Never
  // mutates a rule object shared with the input IR — every rule that needs
  // changing is rebuilt as a new object.
  const groups = ir.groups
    .filter((g) => g.name !== MARKS_GUARD_GROUP)
    .map((g) => ({
      ...g,
      rules: g.rules
        .filter(
          (r) =>
            r.nodeId !== "gen-marks-unwrap-rule" &&
            !(r.matchKind === "match" && r.nodeId === "gen-marks-guard-hop"),
        )
        .map((r) =>
          r.output.some((o) => isUseGroupOutputFor(o, MARKS_GUARD_GROUP))
            ? {
                ...r,
                output: r.output.filter((o) => !isUseGroupOutputFor(o, MARKS_GUARD_GROUP)),
              }
            : r,
        ),
    }));
  const stores = ir.stores.filter(
    (s) => s.name !== MARKS_UNWRAP_FROM_STORE && s.name !== MARKS_UNWRAP_TO_STORE,
  );

  const entry = entryGroupOf(groups);
  let guardHopSkipped = false;

  if (unwrap !== null && entry !== undefined) {
    stores.push(...unwrap.stores);
    entry.rules = insertBeforeTerminalRules(entry.rules, unwrap.rule);
  }

  if (guardGroup !== null && entry !== undefined) {
    // Enter the guard group after every entry-group rule fires: extend the
    // existing `match` rule when one exists, otherwise add one.
    const existingMatchIndex = entry.rules.findIndex((r) => r.matchKind === "match");
    if (existingMatchIndex !== -1) {
      const existingMatch = entry.rules[existingMatchIndex]!;
      const alreadyHasHop = existingMatch.output.some((o) =>
        isUseGroupOutputFor(o, MARKS_GUARD_GROUP),
      );
      const lastOutput = existingMatch.output[existingMatch.output.length - 1];
      const endsWithForeignUseGroup =
        lastOutput !== undefined &&
        isAnyUseGroupOutput(lastOutput) &&
        !isUseGroupOutputFor(lastOutput, MARKS_GUARD_GROUP);
      if (alreadyHasHop) {
        // Already present from a previous run — nothing to do.
      } else if (endsWithForeignUseGroup) {
        // The rule already ends in a use() to some other group; kmcmplib
        // allows only one trailing use() per rule. Leave the foreign rule
        // untouched rather than chaining a second hop after it.
        guardHopSkipped = true;
      } else {
        const updatedMatch: IRRule = {
          ...existingMatch,
          output: [...existingMatch.output, { kind: "useGroup", groupName: MARKS_GUARD_GROUP }],
        };
        entry.rules = entry.rules.map((r, i) => (i === existingMatchIndex ? updatedMatch : r));
      }
    } else {
      entry.rules = [
        ...entry.rules,
        {
          nodeId: "gen-marks-guard-hop",
          matchKind: "match",
          context: [],
          output: [{ kind: "useGroup", groupName: MARKS_GUARD_GROUP }],
          trailingComment: "generated: marks-series guard hop",
        },
      ];
    }
  }

  return {
    ir: {
      ...ir,
      stores,
      groups: guardGroup !== null ? [...groups, guardGroup] : groups,
    },
    blockingRuleCount: guardGroup?.rules.length ?? 0,
    unwrapPairCount: unwrap !== null ? unwrap.stores[0]?.items.length ?? 0 : 0,
    ...(guardHopSkipped ? { guardHopSkipped: true } : {}),
  };
}
