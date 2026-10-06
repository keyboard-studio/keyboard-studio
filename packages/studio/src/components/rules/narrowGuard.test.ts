// Tests for narrowGuard (spec 082 FR-022): IR-level Narrow inserts a precise
// exception rule immediately BEFORE the over-broad guard rule (insert order
// is load-bearing — the first matching rule wins), with a durable narrowed
// disposition and undo.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import type { OverBroadGuard } from "@keyboard-studio/engine/kmAssist";
import {
  buildNarrowException,
  narrowOverBroadGuard,
  undoNarrow,
} from "./narrowGuard.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";

const GUARD: OverBroadGuard = {
  markKey: "K_E",
  markChar: "́",
  blockedChar: "e",
  guardRuleId: "guard-1",
  question:
    "You block the acute key after 'e', but your orthography says acute combines with e. Intentional?",
};

function diablockRule(nodeId: string, vkey: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: vkey, modifiers: ["RALT"] },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

function seedIr(): void {
  const ir = {
    origin: "scaffolded",
    header: { keyboardId: "t", name: "t", bcp47: [], copyright: "", version: "1.0", targets: [], storeDirectives: [] },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [diablockRule("plain-1", "K_A"), diablockRule("guard-1", "K_E")],
        readonly: false,
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
  useWorkingCopyStore.getState().setIR(ir);
}

function workingRules(): IRRule[] {
  return useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
}

beforeEach(() => {
  seedIr();
});

afterEach(() => {
  useGuardIntentStore.getState().resetForTest();
});

describe("buildNarrowException", () => {
  it("excepts the blocked char: raw(blockedChar) + raw('+') + the guard's exact vkey, output re-emits blockedChar + mark", () => {
    const exception = buildNarrowException(GUARD, diablockRule("guard-1", "K_E"))!;
    expect(exception.context).toEqual([
      { kind: "raw", text: "e" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_E", modifiers: ["RALT"] },
    ]);
    expect(exception.output).toEqual([{ kind: "raw", text: "é" }]);
    // A fresh node id, not the guard's.
    expect(exception.nodeId).not.toBe("guard-1");
    expect(exception.nodeId.length).toBeGreaterThan(0);
  });

  it("returns null when the guard rule has no any(store) element to except from", () => {
    const rule: IRRule = {
      nodeId: "guard-1",
      context: [{ kind: "vkey", name: "K_E", modifiers: ["RALT"] }],
      output: [{ kind: "raw", text: "context" }],
    };
    expect(buildNarrowException(GUARD, rule)).toBeNull();
  });
});

describe("narrowOverBroadGuard", () => {
  it("inserts the exception immediately BEFORE the guard rule, in the same group", () => {
    const outcome = narrowOverBroadGuard(GUARD)!;
    const rules = workingRules();
    expect(rules.map((r) => r.nodeId)).toEqual(["plain-1", outcome.ruleId, "guard-1"]);
    // The shared guard store rule is untouched.
    expect(rules.find((r) => r.nodeId === "guard-1")!.context[0]).toEqual({
      kind: "any",
      storeRef: "diablock",
    });
  });

  it("records the durable narrowed disposition and pushes an undo record", () => {
    const outcome = narrowOverBroadGuard(GUARD)!;
    const intent = useGuardIntentStore.getState();
    expect(intent.narrowedGuardQuestions.has(GUARD.question)).toBe(true);
    expect(intent.narrowUndoStack).toEqual([
      { ruleId: outcome.ruleId, question: GUARD.question },
    ]);
  });

  it("signals the guard family as edited (FR-020)", () => {
    narrowOverBroadGuard(GUARD);
    expect(useGuardIntentStore.getState().editedFamilyIds.size).toBeGreaterThan(0);
  });

  it("returns null when the guard rule is gone (stale analysis)", () => {
    expect(
      narrowOverBroadGuard({ ...GUARD, guardRuleId: "no-such-rule" }),
    ).toBeNull();
    expect(workingRules().map((r) => r.nodeId)).toEqual(["plain-1", "guard-1"]);
    expect(useGuardIntentStore.getState().narrowedGuardQuestions.size).toBe(0);
  });
});

describe("undoNarrow", () => {
  it("removes the exception rule and lifts the narrowed disposition", () => {
    const outcome = narrowOverBroadGuard(GUARD)!;
    expect(undoNarrow()).toBe(outcome.ruleId);
    expect(workingRules().map((r) => r.nodeId)).toEqual(["plain-1", "guard-1"]);
    const intent = useGuardIntentStore.getState();
    expect(intent.narrowedGuardQuestions.has(GUARD.question)).toBe(false);
    expect(intent.narrowUndoStack).toEqual([]);
  });

  it("is LIFO across two narrows", () => {
    const first = narrowOverBroadGuard(GUARD)!;
    const secondGuard: OverBroadGuard = {
      ...GUARD,
      blockedChar: "o",
      guardRuleId: "guard-1",
      question: GUARD.question + " (o)",
    };
    const second = narrowOverBroadGuard(secondGuard)!;
    expect(workingRules()).toHaveLength(4);

    expect(undoNarrow()).toBe(second.ruleId);
    expect(workingRules().map((r) => r.nodeId)).toEqual([
      "plain-1",
      first.ruleId,
      "guard-1",
    ]);
    expect(undoNarrow()).toBe(first.ruleId);
    expect(workingRules().map((r) => r.nodeId)).toEqual(["plain-1", "guard-1"]);
  });

  it("returns null when the stack is empty and changes nothing", () => {
    expect(undoNarrow()).toBeNull();
    expect(workingRules().map((r) => r.nodeId)).toEqual(["plain-1", "guard-1"]);
  });
});
