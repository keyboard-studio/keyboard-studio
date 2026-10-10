// OutputScreen — the PR panel's blocked reason comes from outputBlockers (spec
// 094 C6).
//
// Before C6 the panel received `outputBlocked = touchStale || coverageBlocked`,
// so an attribution or licence block fell through to the panel's generic
// "compile not complete" text even though compile was ready. The panel is
// stubbed to capture its props; the real usePreviewArtifact gate runs against
// the real working-copy store.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";

const READY_STAGE: Stage = {
  kind: "ready",
  compileResult: { diagnostics: [] },
  jsBlobUrl: "blob:test",
  vfs: createVirtualFS([]),
  scaffoldWarnings: [],
  keyboardId: "test",
} as unknown as Stage;

vi.mock("../hooks/useKeyboardArtifact.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useKeyboardArtifact.ts")>()),
  useKeyboardArtifact: () => ({ stage: READY_STAGE, retry: vi.fn(), recompile: vi.fn() }),
}));

const jumpToLocation = vi.fn();
vi.mock("../lib/jumpToLocation.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jumpToLocation.ts")>()),
  jumpToLocation: (...args: unknown[]) => jumpToLocation(...args),
}));

const panelProps = vi.fn();
vi.mock("./PickerPane.tsx", () => ({ PickerPane: () => null }));
vi.mock("./SignUpPanel.tsx", () => ({ SignUpPanel: () => null }));
vi.mock("./ManagedPRSubmitPanel.tsx", () => ({
  ManagedPRSubmitPanel: (props: unknown) => {
    panelProps(props);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function lastPanelProps(): { canSubmit: boolean; outputBlocked: boolean; outputBlockedReason?: string } {
  const calls = panelProps.mock.calls;
  return calls[calls.length - 1]![0] as { canSubmit: boolean; outputBlocked: boolean; outputBlockedReason?: string };
}

describe("OutputScreen — PR panel blocked reason", () => {
  it("names the missing attribution instead of 'compile not complete'", async () => {
    seedInstantiatedWorkingCopy([]);
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const props = lastPanelProps();
    expect(props.canSubmit).toBe(false);
    expect(props.outputBlocked).toBe(true);
    expect(props.outputBlockedReason).toMatch(/author and a copyright holder/);
  });

  it("names the stale touch layout ahead of attribution", async () => {
    seedInstantiatedWorkingCopy([]);
    useWorkingCopyStore.setState({ staleSteps: new Set(["touch"]) });
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    expect(lastPanelProps().outputBlockedReason).toMatch(/touch layout is out of date/);
  });

  it("passes no blocked reason when nothing blocks", async () => {
    seedInstantiatedWorkingCopy([], { attributed: true });
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const props = lastPanelProps();
    expect(props.canSubmit).toBe(true);
    expect(props.outputBlocked).toBe(false);
    expect(props.outputBlockedReason).toBeUndefined();
  });
});

describe("OutputScreen — blocker Open buttons (spec 094 FR-004)", () => {
  it("opens the Touch step from the stale-touch banner, returning to Output", async () => {
    seedInstantiatedWorkingCopy([], { attributed: true });
    useWorkingCopyStore.setState({ staleSteps: new Set(["touch"]) });
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    fireEvent.click(screen.getByTestId("output-open-touch"));
    expect(jumpToLocation).toHaveBeenCalledWith({ route: "survey", step: "touch" }, { returnTo: { route: "output" } });
  });

  it("opens the language step from the attribution banner, returning to Output", async () => {
    seedInstantiatedWorkingCopy([]);
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    fireEvent.click(screen.getByTestId("output-open-identity"));
    expect(jumpToLocation).toHaveBeenCalledWith({ route: "survey", step: "identity" }, { returnTo: { route: "output" } });
  });

  it("offers no Open button while nothing blocks", async () => {
    seedInstantiatedWorkingCopy([], { attributed: true });
    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    expect(screen.queryByTestId("output-open-touch")).toBeNull();
    expect(screen.queryByTestId("output-open-identity")).toBeNull();
  });
});
