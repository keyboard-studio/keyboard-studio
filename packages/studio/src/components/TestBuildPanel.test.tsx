// TestBuildPanel (spec 094 T026, FR-006..FR-009, FR-011).

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useTestingStore } from "../stores/testingStore.ts";
import type { TestBuild } from "../lib/draftTypes.ts";
import { TestBuildPanel, type TestBuildPanelProps } from "./TestBuildPanel.tsx";

const CLEAR_GATE: TestBuildPanelProps["gate"] = {
  touchStale: false,
  coverageBlocked: false,
  licenseUnparseable: false,
  attributionMissing: false,
  stageReady: true,
};

/** Stands in for usePreviewArtifact.handleMakeTestBuild: records on success only. */
function makeBuild(fingerprint: string, changedSections: string[] = []) {
  return vi.fn(async (): Promise<TestBuild | null> =>
    useTestingStore.getState().recordBuild({ version: "2.3.1", fingerprint, decisionCursor: 0, changedSections }),
  );
}

function renderPanel(overrides: Partial<TestBuildPanelProps> = {}) {
  return render(
    <TestBuildPanel
      gate={CLEAR_GATE}
      nextTestVersion="2.3.1"
      busy={false}
      onMakeTestBuild={makeBuild("a".repeat(64))}
      {...overrides}
    />,
  );
}

const button = () => screen.getByTestId("make-test-build") as HTMLButtonElement;

afterEach(() => {
  cleanup();
  useTestingStore.getState().reset();
});

describe("TestBuildPanel", () => {
  it("is enabled exactly when the installable download is", () => {
    renderPanel();
    expect(button().disabled).toBe(false);
    cleanup();
    renderPanel({ gate: { ...CLEAR_GATE, attributionMissing: true } });
    expect(button().disabled).toBe(true);
  });

  it("gives the first blocker as its accessible name when disabled", () => {
    renderPanel({ gate: { ...CLEAR_GATE, touchStale: true, attributionMissing: true } });
    expect(button().getAttribute("aria-label")).toMatch(/touch layout is out of date/);
  });

  it("is disabled with its own reason when no test version fits, while the download stays available", () => {
    renderPanel({ nextTestVersion: null });
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-label")).toMatch(/no room for a test version/);
  });

  it("a failed build records nothing (FR-011)", async () => {
    renderPanel({ onMakeTestBuild: vi.fn(async () => null) });
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.queryByTestId("test-build-list")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("lists a successful build with its number, version and changes, and announces it", async () => {
    const onMake = vi
      .fn<() => Promise<TestBuild | null>>()
      .mockImplementationOnce(makeBuild("a".repeat(64)))
      .mockImplementationOnce(makeBuild("b".repeat(64), ["rules", "source"]));
    renderPanel({ onMakeTestBuild: onMake });

    await act(async () => {
      fireEvent.click(button());
    });
    await act(async () => {
      fireEvent.click(button());
    });

    const list = screen.getByTestId("test-build-list");
    expect(list.textContent).toMatch(/Build 1 \(version 2\.3\.1\)/);
    expect(list.textContent).toMatch(/First build/);
    expect(list.textContent).toMatch(/Build 2 .*Changed: Rules and Source edited directly/);
    expect(screen.getByRole("status").textContent).toBe("Test build 2 downloaded.");
  });

  it("shows 'Same as build N' for a rebuild with no edit", async () => {
    const onMake = makeBuild("f".repeat(64));
    renderPanel({ onMakeTestBuild: onMake });
    await act(async () => {
      fireEvent.click(button());
    });
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.getByTestId("test-build-list").textContent).toMatch(/Same as build 1/);
  });

  it("is read-only when the project is submitted", () => {
    act(() => {
      useTestingStore.getState().recordBuild({ version: "2.3.1", fingerprint: "a".repeat(64), decisionCursor: 0, changedSections: [] });
      useTestingStore.getState().markFrozen();
    });
    renderPanel();
    expect(button().disabled).toBe(true);
    expect(screen.getByTestId("test-build-panel").textContent).toMatch(/submitted/);
    expect(screen.getByTestId("test-build-list")).toBeTruthy();
  });
});

describe("TestBuildPanel — tester reports (spec 094 T037)", () => {
  it("shows the reports section only once a build exists", async () => {
    renderPanel();
    expect(screen.queryByTestId("tester-reports")).toBeNull();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.getByTestId("tester-reports")).toBeTruthy();
  });
});

describe("TestBuildPanel — accessible name when enabled", () => {
  it("names the next build and its version", () => {
    renderPanel();
    expect(button().getAttribute("aria-label")).toBe("Make test build 1, version 2.3.1, and download it");
  });
});
