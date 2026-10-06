// FullStepPage — the scroll container for document-style `layout: "full"`
// steps. StepHost wraps every full-layout step in a fixed
// `height: 100%; overflow: hidden` shell, so the step root itself must be the
// vertical scroller or tall content is clipped (the Rules and Deadkeys steps
// were). These tests pin that contract for the wrapper and for both steps.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { FullStepPage } from "./FullStepPage.tsx";
import { DeadkeySurface } from "../editors/deadkey/DeadkeySurface.tsx";
import RulesStep from "../survey/rules/RulesStep.tsx";

// The Rules regions have their own suites; stub them so this test exercises
// only the step's page chrome.
vi.mock("./rules/DemoPane.tsx", () => ({ DemoPane: () => <div data-testid="demo-stub" /> }));
vi.mock("./rules/RuleListMount.tsx", () => ({ RuleListMount: () => null }));
vi.mock("./rules/GuardSuggestions.tsx", () => ({ GuardSuggestions: () => null }));
vi.mock("./rules/RuleBuilderMount.tsx", () => ({ RuleBuilderMount: () => null }));

afterEach(cleanup);

function expectScrollContainer(el: HTMLElement) {
  expect(el.style.height).toBe("100%");
  expect(el.style.overflowY).toBe("auto");
  expect(el.style.boxSizing).toBe("border-box");
  // Themed: background and text come from --app-* tokens, never literals.
  expect(el.style.background).toContain("var(--app-bg)");
  expect(el.style.color).toContain("var(--app-text)");
}

describe("FullStepPage", () => {
  it("is a full-height vertical scroll container", () => {
    render(
      <FullStepPage testId="page">
        <p>content</p>
      </FullStepPage>,
    );
    expectScrollContainer(screen.getByTestId("page"));
  });

  it("pads the content column clear of the journey footer", () => {
    render(
      <FullStepPage testId="page">
        <p>content</p>
      </FullStepPage>,
    );
    const column = screen.getByTestId("page").firstElementChild as HTMLElement;
    expect(column.style.padding).toContain("--studio-footer-h");
  });
});

describe("full-layout steps render inside FullStepPage", () => {
  it("Rules step root scrolls", () => {
    render(<RulesStep onComplete={() => {}} />);
    expectScrollContainer(screen.getByTestId("rules-step"));
  });

  it("Deadkeys step root scrolls (no working copy state)", () => {
    render(<DeadkeySurface onComplete={() => {}} />);
    expectScrollContainer(screen.getByTestId("deadkey-step"));
  });
});
