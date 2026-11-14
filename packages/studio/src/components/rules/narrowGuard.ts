// narrowGuard — spec 082 FR-022 "Narrow this guard" (IR-level).
//
// An over-broad guard blocks a mark after characters the orthography says
// are valid bases. Rather than mutating the shared guard store (which other
// marks' guards read), Narrow inserts a precise exception rule immediately
// BEFORE the over-broad guard rule, in the same group: the exception matches
// the same key chord (blocked character + the guard's exact vkey/modifiers)
// and emits the blocked character + the mark, so that one mark/key pair is
// allowed while the guard still blocks everything else.
//
// Insert order is load-bearing: the exception must come before the guard —
// the first matching rule wins. Verified empirically against the Cameroon
// fixture (2026-09-29): exception-before-guard wins for the excepted base,
// exception-after-guard loses.
//
// The exception re-emits the blocked character because the matched context
// is replaced: context "blockedChar + '+' + vkey" → output
// "blockedChar + markChar".

import {
  makeRule,
  ruleConditions,
  ruleHasNulContext,
  ruleKeystroke,
  rulePreContext,
} from "@keyboard-studio/contracts";
import type {
  ContextElement,
  IRRule,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";
import type { OverBroadGuard } from "@keyboard-studio/engine/kmAssist";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { undoLastOpenApply } from "../../lib/openApply.ts";
import type { ApplyOnOpen } from "../OpenApplyHost.tsx";
import { familyOfRule, groupRules } from "./ruleFamilies.ts";

/**
 * Build the exception rule for an over-broad guard (pure). Returns null when
 * the guard rule's context has no `any(store)` element to except from —
 * narrowing an unrecognized shape would be a guess, so the caller reports
 * the card as stale instead.
 */
export function buildNarrowException(
  guard: OverBroadGuard,
  guardRule: IRRule,
): IRRule | null {
  // Guard rules are `using keys` rules (`any(store) + key > context`).
  const group = { usingKeys: true };
  // Replace the first `any()` (head, then pre-context, then keystroke: source order).
  let replaced = false;
  const swapFirstAny = (el: ContextElement): ContextElement => {
    if (!replaced && el.kind === "any") {
      replaced = true;
      return { kind: "raw", text: guard.blockedChar };
    }
    return { ...el };
  };
  const conditions = ruleConditions(guardRule).map(swapFirstAny);
  const preContext = rulePreContext(guardRule, group).map(swapFirstAny);
  const guardKeystroke = ruleKeystroke(guardRule, group);
  const keystroke = guardKeystroke === undefined ? undefined : swapFirstAny(guardKeystroke);
  if (!replaced) return null;
  const output: OutputElement[] = [
    { kind: "raw", text: guard.blockedChar + guard.markChar },
  ];
  return makeRule(
    {
      nodeId: crypto.randomUUID(),
      nulContext: ruleHasNulContext(guardRule),
      conditions,
      preContext,
      ...(keystroke !== undefined ? { keystroke } : {}),
      output,
      rulesStepAdded: true,
    },
    group,
  );
}

/** Locate the guard rule's group and index in the working IR. */
function findGuardRule(
  ir: KeyboardIR,
  guardRuleId: string,
): { groupNodeId: string; index: number } | null {
  for (const group of ir.groups) {
    const index = group.rules.findIndex((r) => r.nodeId === guardRuleId);
    if (index !== -1) return { groupNodeId: group.nodeId, index };
  }
  return null;
}

export interface NarrowOutcome {
  /** The minted exception rule's nodeId. */
  ruleId: string;
  /** The guard family's id (undefined when the rule is in no family). */
  familyId: string | undefined;
}

/**
 * Narrow the over-broad guard: insert the exception rule immediately before
 * the guard rule through the normal working-copy path (`setWorkingIR` —
 * reversible, part of the saved draft). Records the durable narrowed
 * disposition (the question is never re-asked) and pushes a narrow-undo
 * record. Returns null when the guard rule is gone or has an unrecognized
 * shape — the card should report stale, not guess.
 */
/** The IR with the exception inserted immediately before its guard, or null when stale. */
function planNarrow(
  guard: OverBroadGuard,
): { ir: KeyboardIR; nextIr: KeyboardIR; exception: IRRule } | null {
  const { ir } = useWorkingCopyStore.getState();
  if (ir === null) return null;
  const found = findGuardRule(ir, guard.guardRuleId);
  if (found === null) return null;
  const group = ir.groups.find((g) => g.nodeId === found.groupNodeId);
  const guardRule = group?.rules[found.index];
  const exception = guardRule === undefined ? null : buildNarrowException(guard, guardRule);
  if (exception === null) return null;
  const nextIr: KeyboardIR = {
    ...ir,
    groups: ir.groups.map((g) =>
      g.nodeId === found.groupNodeId
        ? {
            ...g,
            rules: [
              ...g.rules.slice(0, found.index),
              exception,
              ...g.rules.slice(found.index),
            ],
          }
        : g,
    ),
  };
  return { ir, nextIr, exception };
}

/**
 * Open (spec 111 live files): the same Narrow, written into the opened
 * keyboard's file when applied. The exception is inserted before its guard in
 * the IR handed to the apply, whose splice anchors on the nearest rule it
 * shares with the file, so it lands before the guard in the text too. Nothing
 * is held as an overlay; the intent store keeps the question (not a rule id,
 * which the re-read shifts). `undoId` names the apply's undo step.
 */
export async function narrowOverBroadGuardOnOpen(
  guard: OverBroadGuard,
  applyOnOpen: ApplyOnOpen,
): Promise<(NarrowOutcome & { undoId?: string }) | null> {
  const plan = planNarrow(guard);
  if (plan === null) return null;
  const { ir, nextIr, exception } = plan;
  const families = groupRules(ir.groups.flatMap((g) => g.rules));
  const family = familyOfRule(families, guard.guardRuleId);
  const result = await applyOnOpen({ kind: "ir", nextIr });
  if (result.status !== "applied") return null;
  const intent = useGuardIntentStore.getState();
  if (family !== undefined) intent.noteFamilyEdited(family.id);
  intent.noteQuestionNarrowed(guard.question);
  return {
    ruleId: exception.nodeId,
    familyId: family?.id,
    ...(result.undoId !== undefined ? { undoId: result.undoId } : {}),
  };
}

/** Open: undo a Narrow written to the file, only while it is still the latest applied change. */
export function undoNarrowOnOpen(undoId: string, question: string): boolean {
  const last = useOpenUndoStore.getState().records.at(-1);
  if (last === undefined || last.id !== undoId) return false;
  const undone = undoLastOpenApply();
  if (!undone.ok) return false;
  useGuardIntentStore.getState().liftQuestionNarrowed(question);
  return true;
}

export function narrowOverBroadGuard(guard: OverBroadGuard): NarrowOutcome | null {
  const plan = planNarrow(guard);
  if (plan === null) return null;
  const { ir, nextIr, exception } = plan;
  useWorkingCopyStore.getState().setWorkingIR(nextIr);

  const families = groupRules(ir.groups.flatMap((g) => g.rules));
  const family = familyOfRule(families, guard.guardRuleId);
  const intent = useGuardIntentStore.getState();
  if (family !== undefined) {
    // Narrowing CREATES a rule in the guard family — the FR-020 edited signal.
    intent.noteFamilyEdited(family.id);
  }
  intent.noteGuardNarrowed(guard.question, exception.nodeId);
  return { ruleId: exception.nodeId, familyId: family?.id };
}

/**
 * Undo the most recent Narrow: remove the inserted exception rule from the
 * working IR and lift the narrowed disposition so the question may surface
 * again. Returns the undone rule id, or null when the stack is empty.
 */
export function undoNarrow(): string | null {
  const intent = useGuardIntentStore.getState();
  const record = intent.popNarrowUndo();
  if (record === undefined) return null;
  const { ir, setWorkingIR } = useWorkingCopyStore.getState();
  if (ir !== null) {
    setWorkingIR({
      ...ir,
      groups: ir.groups.map((g) => ({
        ...g,
        rules: g.rules.filter((r) => r.nodeId !== record.ruleId),
      })),
    });
  }
  return record.ruleId;
}
