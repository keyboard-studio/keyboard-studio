// FacetTransformPanel narrow-viewport tests (mobile adaptation, Phase 5).
//
// The diff tables can exceed 390px with long before/after values: narrow
// viewports wrap them in a horizontal scroll container. Desktop renders the
// bare table.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { FacetTransformPanel } from "./FacetTransformPanel.tsx";
import type { TransformProposal } from "@keyboard-studio/engine";

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

function makeProposal(): TransformProposal {
  return {
    kind: "proposal",
    transitionId: { facetId: "flick", fromValue: "off", toValue: "on" },
    transformImpactClass: "behavior-preserving",
    measurement: {} as never,
    affectedSites: [],
    implications: [],
    previewKind: "source-diff",
    preview: {
      previewKind: "source-diff",
      sourceDiff: [
        { role: "flick-north", before: "a".repeat(100), after: "b".repeat(100) },
      ],
    },
    status: "proposed",
    migrationRuleId: "test-rule",
    namedLosses: [],
  } as TransformProposal;
}

function renderPanel(): void {
  render(
    <FacetTransformPanel
      proposal={makeProposal()}
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
}

beforeEach(() => {
  setViewport(1280, 800);
});

afterEach(() => {
  cleanup();
  setViewport(1280, 800);
});

describe("FacetTransformPanel — narrow viewport", () => {
  it("wraps the diff table in a scroll container at 390px", () => {
    setViewport(390, 844);
    renderPanel();

    const table = screen.getByRole("table");
    const wrapper = table.parentElement!;
    expect(wrapper.style.overflowX).toBe("auto");
  });

  it("renders the bare table at 1280px", () => {
    setViewport(1280, 800);
    renderPanel();

    const table = screen.getByRole("table");
    const wrapper = table.parentElement!;
    expect(wrapper.style.overflowX).toBe("");
  });
});
