// Spec 111 FR-001: the start screen offers New (leading) and Open, records the
// track New implies, guards an existing draft, and offers to continue a draft
// saved to the author's account.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

const navigateTo = vi.fn();
vi.mock("../lib/navigate.ts", () => ({ navigateTo: (...a: unknown[]) => navigateTo(...a) }));
vi.mock("./OpenKeyboardEntry.tsx", () => ({
  OpenKeyboardEntry: () => <section data-testid="open-entry" />,
}));
const token = { current: null as { accessToken: string } | null };
vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: () => ({ token: token.current }) }));
const loadServerDraftMeta = vi.fn();
vi.mock("../lib/serverDraftStore.ts", () => ({
  loadServerDraftMeta: (...a: unknown[]) => loadServerDraftMeta(...a),
}));
const draftMeta = { current: null as { label: string | null } | null };
vi.mock("../lib/draftPersistence.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/draftPersistence.ts")>()),
  loadDraftMeta: () => draftMeta.current,
}));

import { StartScreen } from "./StartScreen.tsx";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { hasVisited } from "../lib/firstVisit.ts";
import { START_ROUTE_NAV_STEP_ID, useStepNavStore } from "../stores/stepNavStore.ts";

beforeEach(() => {
  token.current = null;
  draftMeta.current = null;
  loadServerDraftMeta.mockReset().mockResolvedValue(null);
  useDecisionStore.getState().reset();
});

afterEach(() => {
  cleanup();
  navigateTo.mockClear();
  localStorage.clear();
});

describe("StartScreen", () => {
  it("leads with New, then Open", () => {
    render(<StartScreen />);
    const newBtn = screen.getByTestId("start-new");
    const open = screen.getByTestId("open-entry");
    expect(newBtn.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("New records the copy track and walks into the survey", () => {
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId("start-new"));
    expect(useDecisionStore.getState().decisions["authoring-track"]?.value).toBe("copy");
    expect(hasVisited()).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith("survey");
  });

  it("with a draft, offers to continue it and asks before New discards it", () => {
    draftMeta.current = { label: "Ewondo" };
    render(<StartScreen />);
    const forward = useStepNavStore.getState().entries[START_ROUTE_NAV_STEP_ID]?.spec.forward;
    expect(forward).toBeDefined();
    forward!.onClick();
    expect(navigateTo).toHaveBeenCalledWith("survey");
    navigateTo.mockClear();

    fireEvent.click(screen.getByTestId("start-new"));
    expect(navigateTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Start a new keyboard"));
    expect(useDecisionStore.getState().decisions["authoring-track"]?.value).toBe("copy");
    expect(navigateTo).toHaveBeenCalledWith("survey");
  });

  it("offers to continue a draft saved to the author's account", async () => {
    token.current = { accessToken: "t" };
    loadServerDraftMeta.mockResolvedValue({ label: "Cloud Bafut" });
    render(<StartScreen />);
    await waitFor(() => {
      const forward = useStepNavStore.getState().entries[START_ROUTE_NAV_STEP_ID]?.spec.forward;
      expect(forward).toBeDefined();
      expect(forward!.label).toContain("Cloud Bafut");
    });
  });
});
