// OutputRedirect — the `#output` route is a redirect, not a screen
// (spec 113, #2540). The route token is kept, but the route now sends the
// author into the Trial/Publish tail: no project → `#start`, walk finished
// → Publish, otherwise → Trial.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { navigateTo } from "../lib/navigate.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";
import { OutputRedirect } from "./OutputRedirect.tsx";

vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

const navigateToMock = navigateTo as ReturnType<typeof vi.fn>;

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OutputRedirect", () => {
  it("with no project: navigates to #start and advances nowhere", () => {
    render(<OutputRedirect />);
    expect(navigateToMock).toHaveBeenCalledWith("start");
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
  });

  it("mid-walk: advances to Trial (the tail's start) and navigates to #survey", () => {
    seedInstantiatedWorkingCopy([]);
    useSurveySessionStore.setState({ activeStepId: "mechanisms" });
    render(<OutputRedirect />);
    const session = useSurveySessionStore.getState();
    expect(session.activeStepId).toBe("trial");
    // The forward primitive pushes the step being left onto the Back stack,
    // so Back from Trial returns the author to where they were.
    expect(session.history).toContain("mechanisms");
    expect(navigateToMock).toHaveBeenCalledWith("survey");
  });

  it("walk finished (done): advances to Publish, where the release lives", () => {
    seedInstantiatedWorkingCopy([]);
    useSurveySessionStore.setState({ activeStepId: "done" });
    render(<OutputRedirect />);
    expect(useSurveySessionStore.getState().activeStepId).toBe("publish");
    expect(navigateToMock).toHaveBeenCalledWith("survey");
  });

  it("already standing on Trial: does not advance again, still navigates to #survey", () => {
    seedInstantiatedWorkingCopy([]);
    useSurveySessionStore.setState({ activeStepId: "trial", history: [] });
    render(<OutputRedirect />);
    const session = useSurveySessionStore.getState();
    expect(session.activeStepId).toBe("trial");
    expect(session.history).toHaveLength(0);
    expect(navigateToMock).toHaveBeenCalledWith("survey");
  });
});
