// Mark guards (spec 071, US8): the two generated behaviors that make the
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
//   2. STEPWISE BACKSPACE UNWRAP (the design-note recipe): when the
//      recorded backspace answer is `peel` under the ready-made output
//      form, each composed unit pairs with its one-mark-shorter
//      predecessor in a generated store pair, and one
//      `any(from) + [K_BKSP] > index(to,1)` rule peels marks step by step.
//      (Under base-plus-mark output the peel is native — one code point per
//      backspace — so no rules are generated.)
//
//   3. WHOLE-STACK BACKSPACE (issue #2302; spec 071 amendment 2026-10-19 —
//      the R7 family the AS-BUILT flagged as net-new): when the recorded
//      backspace answer is `whole-stack` under the base-plus-mark output
//      form, one rule per reachable base+marks sequence (every attested
//      stack and each of its emitted prefixes) deletes the whole sequence
//      on a single backspace press. (Under ready-made output the whole-
//      stack clear is native — the letter is one character — so no rules
//      are generated.)
//
// Backspace behaviour is its OWN recorded answer (contracts'
// `BackspaceBehaviour`), interrelated with the output form yet
// independent of it: generation fires only for the pairing the emitted
// text does not already produce natively. Callers that pass no answer
// get the historical default `peel` — under ready-made that reproduces
// the pre-#2302 always-unwrap behaviour for completions recorded before
// the answer existed.
//
// Pure IR → IR: never touches raw .kmn text; generated nodes carry
// `generated_marks_` name prefixes so they are recognizable and re-runs
// replace rather than duplicate (idempotent).

import type {
  AttestedStack,
  BackspaceBehaviour,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  PlacementWorklist,
} from "@keyboard-studio/contracts";

// The entry-group choice and the terminal-rule constraint are shared with
// touch-rule synthesis (spec 063) — see ir-insert.ts's module doc for why they
// are not private to this module any more.
import {
  entryGroupOf,
  insertBeforeTerminalRules,
  insertBlockBeforeTerminalRules,
} from "./ir-insert.js";
// The composed-unit -> one-mark-shorter pairing is shared with spec 062 US4's
// backspace-unwrap generator — see mark-decomposition.ts's module doc.
import { oneMarkShorterPair, type OneMarkShorterPair } from "./mark-decomposition.js";

export const MARKS_GUARD_GROUP = "generated_marks_guard";
export const MARKS_UNWRAP_FROM_STORE = "generated_marks_unwrap_from";
export const MARKS_UNWRAP_TO_STORE = "generated_marks_unwrap_to";
export const MARKS_WHOLESTACK_RULE_PREFIX = "gen-marks-wholestack-rule-";

export interface MarkGuardsResult {
  ir: KeyboardIR;
  blockingRuleCount: number;
  unwrapPairCount: number;
  /** Whole-stack deletion rules generated (base-plus-mark + `whole-stack` only). */
  wholeStackRuleCount: number;
  /**
   * Set when an existing match rule already ends with a `use(...)` to a
   * group other than the marks guard group — kmcmplib allows only one
   * trailing `use()` per rule, so chaining a second hop would break that
   * foreign rule. The guard hop is skipped (the foreign rule is left
   * untouched) rather than silently reordering someone else's use() chain.
   */
  guardHopSkipped?: boolean;
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
  backspace: BackspaceBehaviour,
): { stores: IRStore[]; rule: IRRule } | null {
  // Peel under ready-made is the generated pairing; under base-plus-mark
  // the peel is native, and `whole-stack` under ready-made is native too
  // (the single character clears whole) — both generate nothing.
  if (outputForm !== "ready-made" || backspace !== "peel") return null;
  // Composed units: single code point with a canonical mark decomposition.
  // One-mark-shorter predecessor, re-composed (é̂ -> é -> e) — shared with
  // context-variants.ts's addBackspaceUnwrap (spec 062 US4).
  const pairs = [...worklist.ownLetterUnits]
    .map((unit) => oneMarkShorterPair(unit))
    .filter((p): p is OneMarkShorterPair => p !== undefined);
  if (pairs.length === 0) return null;
  const stores: IRStore[] = [
    {
      nodeId: "gen-marks-unwrap-from",
      name: MARKS_UNWRAP_FROM_STORE,
      items: pairs.map((p) => ({ kind: "char" as const, value: p.unit })),
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
 * The base+marks sequences a whole-stack backspace press must clear, in
 * the order their rules must be tried: longest first, so a multi-mark
 * stack clears in one press instead of matching its own shorter prefix's
 * rule. Every attested stack contributes itself and each emitted prefix
 * (base + first k marks) — a typist passes through the prefixes while
 * building the stack, and each is a complete on-screen sequence in its
 * own right. A sequence is reachable only when none of its base×mark
 * pairs is blocked (the worklist's blocked combinations); prefixes of a
 * reachable stack are nested, so the first blocked pair ends the run.
 * Plain base letters (no marks) are deliberately absent: they carry no
 * rule and backspace keeps its native one-character behaviour for them.
 */
function wholeStackSequences(
  worklist: PlacementWorklist,
  stacks: readonly AttestedStack[],
): string[] {
  const blocked = new Set(
    worklist.blockedCombinations.map((b) => `${b.base}\u0000${b.mark}`),
  );
  const sequences = new Set<string>();
  for (const stack of stacks) {
    for (let k = 1; k <= stack.marks.length; k++) {
      const prefix = stack.marks.slice(0, k);
      if (prefix.some((m) => blocked.has(`${stack.base}\u0000${m}`))) break;
      sequences.add(stack.base + prefix.join(""));
    }
  }
  return [...sequences].sort(
    (a, b) => [...b].length - [...a].length || (a < b ? -1 : a > b ? 1 : 0),
  );
}

function buildWholeStack(
  worklist: PlacementWorklist,
  outputForm: "ready-made" | "base-plus-mark",
  backspace: BackspaceBehaviour,
  stacks: readonly AttestedStack[],
): IRRule[] {
  // Whole-stack under base-plus-mark is the generated pairing; every
  // other combination is native (see buildUnwrap's note).
  if (outputForm !== "base-plus-mark" || backspace !== "whole-stack") return [];
  return wholeStackSequences(worklist, stacks).map((sequence, i) => ({
    nodeId: `${MARKS_WHOLESTACK_RULE_PREFIX}${i + 1}`,
    context: [
      ...[...sequence].map((ch) => ({ kind: "char" as const, value: ch })),
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_BKSP", modifiers: [] },
    ],
    output: [{ kind: "nul" }],
    trailingComment: "generated: whole-stack backspace (marks series)",
  }));
}

/**
 * Apply the mark guards to a working-copy IR. Idempotent: previously
 * generated guard groups/stores/rules (recognized by their names/nodeIds) are
 * replaced, never duplicated. A worklist with nothing to block and nothing to
 * unwrap returns the IR unchanged (same reference).
 *
 * `backspace` is the recorded backspace answer (issue #2302); it defaults
 * to `"peel"`, the historical behaviour for completions recorded before
 * the answer existed. `stacks` is the confirmed alphabet's attested-stack
 * list — the whole-stack generator's source table (the same tables as
 * everything else, R5); it is consulted only for the base-plus-mark +
 * `whole-stack` pairing.
 */
export function applyMarkGuards(
  ir: KeyboardIR,
  worklist: PlacementWorklist,
  outputForm: "ready-made" | "base-plus-mark",
  backspace: BackspaceBehaviour = "peel",
  stacks: readonly AttestedStack[] = [],
): MarkGuardsResult {
  const guardGroup = buildGuardGroup(worklist);
  const unwrap = buildUnwrap(worklist, outputForm, backspace);
  const wholeStackRules = buildWholeStack(worklist, outputForm, backspace, stacks);

  // Whether the input IR already carries any previously generated artifact
  // that the strip below would remove. Checked before stripping so a
  // worklist with nothing to block/unwrap can still tell "genuinely nothing
  // to do" (return the IR unchanged, same reference) apart from "there was a
  // previous run's guard/unwrap that must be torn down" — otherwise a
  // worklist that regresses from blocked pairs to none would leave stale
  // guards behind (D-6).
  const hadPriorArtifacts =
    ir.groups.some((g) => g.name === MARKS_GUARD_GROUP) ||
    ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE || s.name === MARKS_UNWRAP_TO_STORE) ||
    ir.groups.some((g) =>
      g.rules.some(
        (r) =>
          r.nodeId === "gen-marks-unwrap-rule" ||
          r.nodeId.startsWith(MARKS_WHOLESTACK_RULE_PREFIX) ||
          (r.matchKind === "match" && r.nodeId === "gen-marks-guard-hop") ||
          r.output.some((o) => isUseGroupOutputFor(o, MARKS_GUARD_GROUP)),
      ),
    );

  if (guardGroup === null && unwrap === null && wholeStackRules.length === 0 && !hadPriorArtifacts) {
    return { ir, blockingRuleCount: 0, unwrapPairCount: 0, wholeStackRuleCount: 0 };
  }

  // Strip any previously generated artifacts (idempotent re-run, and the
  // block->none regression above). Never
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
            !r.nodeId.startsWith(MARKS_WHOLESTACK_RULE_PREFIX) &&
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

  if (wholeStackRules.length > 0 && entry !== undefined) {
    // One contiguous block, longest sequence first (buildWholeStack's
    // ordering) — the block helper's contract, not a loop's accident.
    entry.rules = insertBlockBeforeTerminalRules(entry.rules, wholeStackRules);
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
    wholeStackRuleCount: wholeStackRules.length,
    ...(guardHopSkipped ? { guardHopSkipped: true } : {}),
  };
}
