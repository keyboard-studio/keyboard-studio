// Tests for the Assign | Code | Layout tab bar in addPhysicalAdapter.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { AddPhysicalAdapter } from "./addPhysicalAdapter.tsx";

vi.mock("../assignLoop/MechanismGallery.tsx", () => ({
  MechanismGallery: (props: { onBack?: () => void }) => (
    <div data-testid="mock-gallery">
      <button type="button" onClick={props.onBack}>Back</button>
    </div>
  ),
}));
vi.mock("../assignLoop/KmnCodePane.tsx", () => ({
  KmnCodePane: (props: { revealNodeId?: string }) => (
    <div data-testid="mock-code-pane" data-reveal={props.revealNodeId ?? ""} />
  ),
}));
vi.mock("../layout/LayoutPane.tsx", () => ({
  LayoutPane: (props: { onViewInCode: (nodeId: string) => void }) => (
    <div data-testid="mock-layout-pane">
      <button type="button" data-testid="mock-view-in-code" onClick={() => props.onViewInCode("n42")}>
        view in code
      </button>
    </div>
  ),
}));
vi.mock("../../hooks/usePlacementPriors.ts", () => ({
  usePlacementPriors: () => undefined,
}));
vi.mock("../../lib/mechanismStepCompletion.ts", () => ({
  completePhysicalLayoutStep: vi.fn(),
}));

afterEach(cleanup);

function tab(name: "assign" | "code" | "layout"): HTMLButtonElement {
  return screen.getByTestId(`editor-view-tab-${name}`) as HTMLButtonElement;
}

function renderAdapter() {
  return render(<AddPhysicalAdapter onComplete={vi.fn()} />);
}

describe("AddPhysicalAdapter tab bar", () => {
  it("renders three tabs in order, Assign selected", () => {
    renderAdapter();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((el) => el.textContent)).toEqual(["Assign", "Code", "Layout"]);
    expect(tab("assign").getAttribute("aria-selected")).toBe("true");
    expect(tab("code").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByTestId("mock-gallery")).toBeTruthy();
  });

  it("uses a roving tabindex: only the selected tab is a tab stop", () => {
    renderAdapter();
    expect(tab("assign").tabIndex).toBe(0);
    expect(tab("code").tabIndex).toBe(-1);
    expect(tab("layout").tabIndex).toBe(-1);
    fireEvent.click(tab("layout"));
    expect(tab("assign").tabIndex).toBe(-1);
    expect(tab("layout").tabIndex).toBe(0);
  });

  it("links each tab to its tabpanel through aria-controls / aria-labelledby", () => {
    renderAdapter();
    for (const name of ["assign", "code", "layout"] as const) {
      const controls = tab(name).getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      const panel = document.getElementById(controls as string);
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab(name).id);
    }
  });

  it("moves and selects with Arrow keys, wrapping, and Home / End", () => {
    renderAdapter();
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(tab("code").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("code"));
    fireEvent.keyDown(list, { key: "End" });
    expect(tab("layout").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(tab("assign").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(tab("layout").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "Home" });
    expect(tab("assign").getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the Assign gallery mounted and Back available on the Code tab", async () => {
    renderAdapter();
    const gallery = screen.getByTestId("mock-gallery");
    fireEvent.click(tab("code"));
    const pane = await waitFor(() => screen.getByTestId("mock-code-pane"));
    expect(pane.getAttribute("data-reveal")).toBe("");
    expect(screen.getByTestId("mock-gallery")).toBe(gallery);
  });

  it("passes Back through to the editor step while Code is active", async () => {
    const onBack = vi.fn();
    render(<AddPhysicalAdapter onComplete={vi.fn()} onBack={onBack} />);
    fireEvent.click(tab("code"));
    fireEvent.click(within(screen.getByTestId("mock-gallery")).getByRole("button", {
      name: "Back",
      hidden: true,
    }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the Layout panel mounted, hidden, after leaving it", async () => {
    renderAdapter();
    expect(screen.queryByTestId("mock-layout-pane")).toBeNull();
    fireEvent.click(tab("layout"));
    const pane = await screen.findByTestId("mock-layout-pane");
    expect(screen.getByTestId("editor-view-panel-layout").hidden).toBe(false);
    fireEvent.click(tab("assign"));
    expect(screen.getByTestId("mock-layout-pane")).toBe(pane);
    expect(screen.getByTestId("editor-view-panel-layout").hidden).toBe(true);
  });

  it("switches to the Code tab with the node revealed when the Layout pane asks to view in code", async () => {
    renderAdapter();
    fireEvent.click(tab("layout"));
    fireEvent.click(await screen.findByTestId("mock-view-in-code"));
    expect(tab("code").getAttribute("aria-selected")).toBe("true");
    expect(tab("layout").getAttribute("aria-selected")).toBe("false");
    const code = await waitFor(() => screen.getByTestId("mock-code-pane"));
    expect(code.getAttribute("data-reveal")).toBe("n42");
  });

  it("clears the reveal when the Code tab is later picked by hand", async () => {
    renderAdapter();
    fireEvent.click(tab("layout"));
    fireEvent.click(await screen.findByTestId("mock-view-in-code"));
    await waitFor(() => screen.getByTestId("mock-code-pane"));
    fireEvent.click(tab("assign"));
    fireEvent.click(tab("code"));
    const code = await waitFor(() => screen.getByTestId("mock-code-pane"));
    expect(code.getAttribute("data-reveal")).toBe("");
  });
});

describe("AddPhysicalAdapter review flags (spec 117 US8)", () => {
  it("puts the review-flag count in the Code tab's name and shows the list there; flags do not gate anything", async () => {
    const { useDecisionStore } = await import("../../stores/decisionStore.ts");
    useDecisionStore.getState().reset();
    useDecisionStore.getState().record({
      id: "kmn-edits",
      value: {
        entries: [{ seq: 1, at: 0, op: "code-apply", changes: [], overrides: [{ change: 0, owner: "layout-tab" }] }],
      },
      provenance: "asked",
    });
    renderAdapter();
    expect(tab("code").textContent).toBe("Code (1)");
    fireEvent.click(tab("code"));
    expect(await screen.findByTestId("kmn-code-review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revert" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View in code" })).toBeTruthy();
    useDecisionStore.getState().reset();
  });
});
