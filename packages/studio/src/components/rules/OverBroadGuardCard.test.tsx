// Tests for OverBroadGuardCard (spec 082 FR-022): the over-broad guard is
// rendered as a QUESTION, never an error — Keep records the author's intent
// (never re-ask), Narrow selects the guard's family for editing (full
// narrowing UI is a follow-up, noted honestly).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { OverBroadGuardCard } from "./OverBroadGuardCard.tsx";
import type { OverBroadGuard } from "./guardAnalysis.ts";
import { familyOfRule, groupRules } from "./ruleFamilies.ts";
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

  it("Narrow selects the guard's family and notes the follow-up", () => {
    render(<OverBroadGuardCard guard={GUARD} />);
    fireEvent.click(screen.getByTestId("overbroad-guard-narrow-guard-1"));
    const rules = useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
    const family = familyOfRule(groupRules(rules), "guard-1");
    expect(family).toBeDefined();
    expect(useRulesStepUiStore.getState().selectedFamilyId).toBe(family?.id);
    // The stub is honest: full narrowing UI is a follow-up.
    expect(screen.getByTestId("overbroad-guard-narrowed-guard-1").textContent).toMatch(
      /follow-up/i,
    );
  });
});
