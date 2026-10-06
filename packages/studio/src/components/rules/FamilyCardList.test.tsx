// Tests for FamilyCardList (spec 082 FR-018): collapsible family cards with
// the three group actions — Test this group, Bundle as pack, Disable group.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { FamilyCardList } from "./FamilyCardList.tsx";
import { groupRules } from "./ruleFamilies.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";
import { useRulesStepUiStore } from "../../stores/rulesStepUiStore.ts";

function guardRule(nodeId: string, vkey: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: vkey, modifiers: [] },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

function seedIr(): void {
  const ir = {
    origin: "scaffolded",
    header: {
      keyboardId: "t",
      name: "t",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [guardRule("guard-1", "K_C"), guardRule("guard-2", "K_E")],
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
  useWorkingCopyStore.getState().setIR(ir);
}

function familyIdOf(memberNodeId: string): string {
  const ir = useWorkingCopyStore.getState().ir!;
  const family = groupRules(ir.groups.flatMap((g) => g.rules)).find((f) =>
    f.memberIds.includes(memberNodeId),
  )!;
  return family.id;
}

beforeEach(() => {
  seedIr();
  // scrollIntoView is not implemented in the test DOM.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  useGuardIntentStore.getState().resetForTest();
  useRulesStepUiStore.getState().resetForTest();
  vi.restoreAllMocks();
});

describe("FamilyCardList", () => {
  it("renders one card per family with name, count, and samples", () => {
    render(<FamilyCardList />);
    const familyId = familyIdOf("guard-1");
    const card = screen.getByTestId(`family-card-${familyId}`);
    expect(within(card).getByText("2 rules")).toBeTruthy();
    // Sample KMN rows are shown collapsed.
    expect(card.textContent).toContain("any(diablock)");
  });

  it("expanding a card shows all member rules and records the intent signal", () => {
    render(<FamilyCardList />);
    const familyId = familyIdOf("guard-1");
    fireEvent.click(screen.getByTestId(`family-card-expand-${familyId}`));
    const members = screen.getByTestId(`family-card-members-${familyId}`);
    expect(within(members).getAllByText(/any\(diablock\)/).length).toBe(2);
    // FR-020: opening the card signals intent for guard suggestions.
    expect(useGuardIntentStore.getState().openedFamilyIds.has(familyId)).toBe(true);
  });

  it("Disable group toggles the working-copy disabled set and shows the badge", () => {
    render(<FamilyCardList />);
    const familyId = familyIdOf("guard-1");
    fireEvent.click(screen.getByTestId(`family-card-disable-${familyId}`));
    expect(useWorkingCopyStore.getState().disabledFamilyIds.has(familyId)).toBe(true);
    expect(screen.getByTestId(`family-card-disabled-badge-${familyId}`)).toBeTruthy();
    expect(
      screen.getByTestId(`family-card-disable-${familyId}`).textContent,
    ).toContain("Enable group");

    fireEvent.click(screen.getByTestId(`family-card-disable-${familyId}`));
    expect(useWorkingCopyStore.getState().disabledFamilyIds.has(familyId)).toBe(false);
    expect(screen.queryByTestId(`family-card-disabled-badge-${familyId}`)).toBeNull();
  });

  it("Bundle as pack selects the family in the builder store", () => {
    render(<FamilyCardList />);
    const familyId = familyIdOf("guard-1");
    fireEvent.click(screen.getByTestId(`family-card-bundle-${familyId}`));
    expect(useRulesStepUiStore.getState().bundleFamilyId).toBe(familyId);
  });

  it("Test this group scrolls to and focuses the demo pane", () => {
    // A minimal demo pane surface for the scroll/focus targets.
    const pane = document.createElement("section");
    pane.setAttribute("data-testid", "rules-demo-pane");
    const input = document.createElement("input");
    input.setAttribute("data-testid", "rules-demo-input");
    pane.appendChild(input);
    document.body.appendChild(pane);

    render(<FamilyCardList />);
    const familyId = familyIdOf("guard-1");
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId(`family-card-test-${familyId}`));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(document.activeElement).toBe(input);
    vi.useRealTimers();

    pane.remove();
  });

  it("renders nothing when the working copy has no IR", () => {
    useWorkingCopyStore.getState().clearIR();
    const { container } = render(<FamilyCardList />);
    expect(container.textContent).toBe("");
  });
});
