// PublishHandover (spec 094 T038, FR-016, FR-017).

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useTestingStore } from "../stores/testingStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { PublishHandover } from "./PublishHandover.tsx";

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

function entry(entryId: string, stepId: string) {
  return {
    entryId,
    stepId,
    payload: { kind: "survey-answer" as const, questionId: "q", answerType: "text" as const, value: "x" },
    provenance: { agency: "hand-set" as const },
    recordedAt: 1,
    supersedes: null,
  };
}

function seedEntries(stepIds: string[]) {
  useDecisionLogStore.setState({
    record: {
      format: "keyboard-studio.decision-record",
      version: 2,
      keyboardId: "test_kbd",
      entries: stepIds.map((s, i) => entry(`e${i}`, s)),
      truncated: null,
    },
  });
}

function recordBuild(fingerprint: string, decisionCursor: number) {
  useTestingStore.getState().recordBuild({ version: "2.3.1", fingerprint, decisionCursor, changedSections: [] });
}

function renderHandover(fingerprint: string | null) {
  const computeFingerprint = vi.fn(async () => fingerprint);
  render(
    <PublishHandover computeFingerprint={computeFingerprint}>
      <div data-testid="submit-panel">submit</div>
    </PublishHandover>,
  );
  return computeFingerprint;
}

async function open() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("publish-handover-open"));
  });
}

afterEach(() => {
  cleanup();
  useTestingStore.getState().reset();
  useDecisionLogStore.getState().reset();
});

describe("PublishHandover", () => {
  it("renders the submit panel exactly as today when no test build exists", () => {
    const computeFingerprint = renderHandover(FP_A);
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
    expect(screen.queryByTestId("publish-handover")).toBeNull();
    expect(computeFingerprint).not.toHaveBeenCalled();
  });

  it("puts a 'Testing done, publish' step before the submit panel once a build exists", () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);
    expect(screen.getByTestId("publish-handover")).toBeTruthy();
    expect(screen.getByTestId("publish-handover-open").textContent).toMatch(/Testing done, publish/);
    expect(screen.queryByTestId("submit-panel")).toBeNull();
  });

  it("says nothing changed when the fingerprint matches the last build", async () => {
    recordBuild(FP_B, 0);
    recordBuild(FP_A, 0);
    const computeFingerprint = renderHandover(FP_A);
    await open();
    expect(computeFingerprint).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("publish-handover-changes").textContent).toMatch(/No changes since test build 2/);
  });

  it("lists the sections changed since the last build when the fingerprint differs", async () => {
    seedEntries(["identity"]);
    recordBuild(FP_A, 1);
    seedEntries(["identity", "rules", "touch", "rules"]);
    renderHandover(FP_B);
    await open();
    const text = screen.getByTestId("publish-handover-changes").textContent ?? "";
    expect(text).toMatch(/Changed since test build 1/);
    expect(text).toMatch(/Rules/);
    expect(text).toMatch(/Touch/);
    expect(text).not.toMatch(/No changes/);
  });

  it("names a direct source edit when the files changed but no decision was recorded", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_B);
    await open();
    expect(screen.getByTestId("publish-handover-changes").textContent).toMatch(/Source edited directly/);
  });

  it("lists open reports, and confirming reveals the submit panel without them blocking", async () => {
    recordBuild(FP_A, 0);
    const testing = useTestingStore.getState();
    const open1 = testing.addReport({ text: "Shift+A types the wrong letter", foundInBuild: 1 });
    const fixed = testing.addReport({ text: "Help page typo", foundInBuild: 1 });
    expect(open1).not.toBeNull();
    useTestingStore.getState().setReportStatus(fixed!.reportId, "fixed", 0);

    renderHandover(FP_A);
    await open();
    const list = screen.getByTestId("publish-handover-reports");
    expect(list.textContent).toMatch(/Shift\+A types the wrong letter/);
    expect(list.textContent).not.toMatch(/Help page typo/);
    expect(screen.queryByTestId("submit-panel")).toBeNull();

    const confirm = screen.getByTestId("publish-handover-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
  });

  it("moves focus through the hand-over: heading, back to the opener, then the revealed submit panel", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);

    await open();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Before you publish" }));

    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-handover-cancel"));
    });
    expect(document.activeElement).toBe(screen.getByTestId("publish-handover-open"));

    await open();
    await act(async () => {
      fireEvent.click(screen.getByTestId("publish-handover-confirm"));
    });
    const revealed = screen.getByTestId("publish-handover-revealed");
    expect(revealed.getAttribute("aria-label")).toBe("Submit your keyboard");
    expect(document.activeElement).toBe(revealed);
    expect(revealed.contains(screen.getByTestId("submit-panel"))).toBe(true);
  });

  it("says when there are no open reports", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);
    await open();
    expect(screen.queryByTestId("publish-handover-reports")).toBeNull();
    expect(screen.getByTestId("publish-handover").textContent).toMatch(/No open reports/);
  });

  it("asks again after a new build is made", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);
    await open();
    fireEvent.click(screen.getByTestId("publish-handover-confirm"));
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
    act(() => recordBuild(FP_B, 0));
    expect(screen.queryByTestId("submit-panel")).toBeNull();
    expect(screen.getByTestId("publish-handover-open")).toBeTruthy();
  });

  it("keeps the submit panel mounted while a submission is in flight, even as new builds arrive (#2050)", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);
    await open();
    fireEvent.click(screen.getByTestId("publish-handover-confirm"));
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
    // A submission starts; a new test build lands mid-submit.
    act(() => useTestingStore.getState().setSubmitInFlight(true));
    act(() => recordBuild(FP_B, 0));
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
    expect(screen.queryByTestId("publish-handover-open")).toBeNull();
  });

  it("keeps the panel visible after the submit settles so its outcome is never dropped (#2050)", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);
    await open();
    fireEvent.click(screen.getByTestId("publish-handover-confirm"));
    act(() => useTestingStore.getState().setSubmitInFlight(true));
    act(() => recordBuild(FP_B, 0));
    // The submit settles (error path): the panel stays on screen with the
    // outcome instead of falling back to the confirm step.
    act(() => useTestingStore.getState().setSubmitInFlight(false));
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
    expect(screen.queryByTestId("publish-handover-open")).toBeNull();
  });

  it("shows the submit panel directly once the project is submitted (frozen)", () => {
    recordBuild(FP_A, 0);
    useTestingStore.setState({ frozen: true });
    renderHandover(FP_A);
    expect(screen.getByTestId("submit-panel")).toBeTruthy();
    expect(screen.queryByTestId("publish-handover")).toBeNull();
  });

  it("is a labelled region with a status announcement for the check result", async () => {
    recordBuild(FP_A, 0);
    renderHandover(FP_A);
    expect(screen.getByRole("region", { name: /Publish after testing/ })).toBeTruthy();
    await open();
    expect(screen.getByRole("status").textContent).toMatch(/No changes since test build 1/);
  });
});
