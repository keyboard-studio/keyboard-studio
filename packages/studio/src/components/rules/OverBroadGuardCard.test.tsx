// Tests for OverBroadGuardCard (spec 082 FR-022): the over-broad guard is
// rendered as a QUESTION, never an error — Keep records the author's intent
// (never re-ask); Narrow inserts a precise exception rule before the guard
// (never mutating the shared store) with Undo and a durable disposition.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { OverBroadGuardCard } from "./OverBroadGuardCard.tsx";
import type { OverBroadGuard } from "./guardAnalysis.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";
import { useRulesStepUiStore } from "../../stores/rulesStepUiStore.ts";

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
      { nodeId: "g1", name: "main", usingKeys: true, rules: [diablockRule("guard-1", "K_E")], readonly: false },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
  useWorkingCopyStore.getState().setIR(ir);
}

beforeEach(() => {
  seedIr();
});

afterEach(() => {
  cleanup();
  useGuardIntentStore.getState().resetForTest();
  useRulesStepUiStore.getState().resetForTest();
});

describe("OverBroadGuardCard", () => {
  it("renders the engine's question as a question, not an error", () => {
    render(<OverBroadGuardCard guard={GUARD} />);
    expect(screen.getByText(GUARD.question)).toBeTruthy();
    // Not an error: no alert role, no error styling hook.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByTestId("overbroad-guard-guard-1").getAttribute("aria-label"),
    ).toBe("Guard question");
  });

  it("Keep records the author's intent so the guard is never re-asked", () => {
    render(<OverBroadGuardCard guard={GUARD} />);
    fireEvent.click(screen.getByTestId("overbroad-guard-keep-guard-1"));
    expect(useGuardIntentStore.getState().keptGuardRuleIds.has("guard-1")).toBe(true);
  });

  it("Narrow inserts the exception before the guard rule, records the disposition, and offers Undo", () => {
    render(<OverBroadGuardCard guard={GUARD} />);
    fireEvent.click(screen.getByTestId("overbroad-guard-narrow-guard-1"));

    // The exception rule lands immediately before the guard rule.
    const rules = useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
    expect(rules).toHaveLength(2);
    expect(rules[1].nodeId).toBe("guard-1");
    const exception = rules[0];
    expect(exception.context).toEqual([
      { kind: "raw", text: "e" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_E", modifiers: ["RALT"] },
    ]);
    // The durable disposition: the question is never re-asked.
    expect(useGuardIntentStore.getState().narrowedGuardQuestions.has(GUARD.question)).toBe(true);
    expect(screen.getByTestId("overbroad-guard-narrowed-guard-1").textContent).toMatch(
      /Narrowed/,
    );

    // Undo removes the exception rule and lifts the disposition.
    fireEvent.click(screen.getByTestId("overbroad-guard-undo-guard-1"));
    const after = useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
    expect(after.map((r) => r.nodeId)).toEqual(["guard-1"]);
    expect(useGuardIntentStore.getState().narrowedGuardQuestions.has(GUARD.question)).toBe(
      false,
    );
    expect(screen.getByTestId("overbroad-guard-undone-guard-1")).toBeTruthy();
  });

  it("Narrow on a stale guard reports stale instead of guessing", () => {
    render(
      <OverBroadGuardCard
        guard={{ ...GUARD, guardRuleId: "no-such-rule" }}
      />,
    );
    fireEvent.click(screen.getByTestId("overbroad-guard-narrow-no-such-rule"));
    expect(screen.getByTestId("overbroad-guard-stale-no-such-rule")).toBeTruthy();
    const rules = useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
    expect(rules).toHaveLength(1);
  });
});
