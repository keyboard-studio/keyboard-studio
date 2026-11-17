// RulesStep on a basic keyboard opened for update: the rules are shown and can
// be tried, but nothing that writes a rule is offered, and Continue records
// nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { completeRulesStep } from "../../lib/mechanismStepCompletion.ts";
import { STANDALONE_STEP_ID, useStepNavStore } from "../../stores/stepNavStore.ts";
import RulesStep from "./RulesStep.tsx";

const basic = vi.hoisted(() => ({ open: false }));

vi.mock("../../hooks/useBasicKeyboardOpen.ts", () => ({ useBasicKeyboardOpen: () => basic.open }));
vi.mock("../../lib/mechanismStepCompletion.ts", () => ({ completeRulesStep: vi.fn() }));
// The regions have their own suites; stubs record what the step hands them.
vi.mock("../../components/rules/DemoPane.tsx", () => ({ DemoPane: () => <div data-testid="demo-stub" /> }));
vi.mock("../../components/rules/RuleListMount.tsx", () => ({
  RuleListMount: (props: { readOnly?: boolean }) => (
    <div data-testid="rule-list-stub" data-read-only={String(props.readOnly === true)} />
  ),
}));
vi.mock("../../components/rules/GuardSuggestions.tsx", () => ({
  GuardSuggestions: () => <div data-testid="guard-suggestions-stub" />,
}));
vi.mock("../../components/rules/RuleBuilderMount.tsx", () => ({
  RuleBuilderMount: () => <div data-testid="rule-builder-stub" />,
}));

function clickContinue(): void {
  useStepNavStore.getState().entries[STANDALONE_STEP_ID]?.spec.forward?.onClick();
}

beforeEach(() => {
  vi.mocked(completeRulesStep).mockClear();
});
afterEach(() => {
  cleanup();
  basic.open = false;
});

describe("RulesStep — basic keyboard opened for update", () => {
  it("shows the demo and a read-only rule list, without guard suggestions or the builder", () => {
    basic.open = true;
    render(<RulesStep onComplete={vi.fn()} />);
    expect(screen.getByTestId("rules-read-only").textContent).toContain("match the Windows layout");
    expect(screen.getByTestId("demo-stub")).toBeTruthy();
    expect(screen.getByTestId("rule-list-stub").getAttribute("data-read-only")).toBe("true");
    expect(screen.queryByTestId("guard-suggestions-stub")).toBeNull();
    expect(screen.queryByTestId("rule-builder-stub")).toBeNull();
  });

  it("continues without recording a rule set", () => {
    basic.open = true;
    const onComplete = vi.fn();
    render(<RulesStep onComplete={onComplete} />);
    clickContinue();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(completeRulesStep).not.toHaveBeenCalled();
  });

  it("any other keyboard: every region, and Continue records the rule set", () => {
    const onComplete = vi.fn();
    render(<RulesStep onComplete={onComplete} />);
    expect(screen.queryByTestId("rules-read-only")).toBeNull();
    expect(screen.getByTestId("rule-list-stub").getAttribute("data-read-only")).toBe("false");
    expect(screen.getByTestId("guard-suggestions-stub")).toBeTruthy();
    expect(screen.getByTestId("rule-builder-stub")).toBeTruthy();
    clickContinue();
    expect(completeRulesStep).toHaveBeenCalledTimes(1);
  });
});
