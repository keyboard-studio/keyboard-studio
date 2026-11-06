// Spec 111 T021: the Open tools menu shows only on Open and reaches every optional screen.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { OpenToolsMenu } from "./OpenToolsMenu.tsx";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { openMenuScreens } from "../survey/questions/registry.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";

vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

function setTrack(value: "copy" | "adapt"): void {
  useDecisionStore.setState({
    decisions: {
      "authoring-track": { id: "authoring-track", value, provenance: "asked", step: "track" },
    } as unknown as DecisionSet,
  });
}

describe("OpenToolsMenu", () => {
  afterEach(() => {
    cleanup();
    useDecisionStore.setState({ decisions: {} as DecisionSet });
  });

  it("renders nothing on Copy", () => {
    setTrack("copy");
    const { container } = render(<OpenToolsMenu />);
    expect(container.textContent).toBe("");
  });

  it("on Open lists one entry per menu screen and advances to the chosen one", () => {
    setTrack("adapt");
    const advance = vi.spyOn(useSurveySessionStore.getState(), "advance");
    render(<OpenToolsMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getAllByRole("button").length).toBe(openMenuScreens.length + 1);
    fireEvent.click(screen.getByRole("button", { name: "Remove characters" }));
    expect(advance).toHaveBeenCalledWith("carve");
  });
});
