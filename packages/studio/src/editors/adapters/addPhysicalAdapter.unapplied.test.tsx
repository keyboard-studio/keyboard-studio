// Leaving the Code tab with unapplied text asks first (spec 111 FR-046); the tab bar runs the switch at once otherwise.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../../test/renderWithI18n.tsx";
import { AddPhysicalAdapter } from "./addPhysicalAdapter.tsx";
import { useUnappliedText } from "../../hooks/useUnappliedText.ts";
import { useUnappliedTextStore } from "../../stores/unappliedTextStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { UnappliedTextDialog } from "../../components/UnappliedTextDialog.tsx";

const pane = vi.hoisted(() => ({ dirty: true, applied: vi.fn(), discarded: vi.fn() }));

vi.mock("../assignLoop/MechanismGallery.tsx", () => ({ MechanismGallery: () => <div data-testid="mock-gallery" /> }));
vi.mock("../assignLoop/KmnCodePane.tsx", () => ({
  KmnCodePane: () => {
    useUnappliedText({
      label: "the keyboard source",
      hasUnapplied: () => pane.dirty,
      apply: () => {
        pane.applied();
        pane.dirty = false;
        return Promise.resolve(true);
      },
      discard: () => pane.discarded(),
    });
    return <div data-testid="mock-code-pane" />;
  },
}));
vi.mock("../layout/LayoutPane.tsx", () => ({ LayoutPane: () => <div data-testid="mock-layout-pane" /> }));
vi.mock("../../hooks/usePlacementPriors.ts", () => ({ usePlacementPriors: () => undefined }));
vi.mock("../../lib/mechanismStepCompletion.ts", () => ({ completePhysicalLayoutStep: vi.fn() }));

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };

beforeEach(() => {
  pane.dirty = true;
  pane.applied.mockClear();
  pane.discarded.mockClear();
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kps", "<Package/>", false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});
afterEach(() => {
  cleanup();
  useUnappliedTextStore.setState({ handles: new Map(), asking: null });
  useWorkingCopyStore.getState().reset();
});

const goToCode = async () => {
  fireEvent.click(screen.getByTestId("editor-view-tab-code"));
  await screen.findByTestId("mock-code-pane");
};
const selected = (tab: string) => screen.getByTestId(`editor-view-tab-${tab}`).getAttribute("aria-selected") === "true";

describe("AddPhysicalAdapter tab switch with unapplied Code text", () => {
  it("asks before leaving the Code tab and stays on Keep editing", async () => {
    render(<><AddPhysicalAdapter onComplete={vi.fn()} /><UnappliedTextDialog /></>);
    await goToCode();
    fireEvent.click(screen.getByTestId("editor-view-tab-layout"));
    expect(screen.getByTestId("unapplied-text-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("unapplied-text-cancel"));
    await waitFor(() => expect(screen.queryByTestId("unapplied-text-dialog")).toBeNull());
    expect(selected("code")).toBe(true);
  });

  it("Apply then switches to the chosen tab", async () => {
    render(<><AddPhysicalAdapter onComplete={vi.fn()} /><UnappliedTextDialog /></>);
    await goToCode();
    fireEvent.click(screen.getByTestId("editor-view-tab-layout"));
    fireEvent.click(screen.getByTestId("unapplied-text-apply"));
    await waitFor(() => expect(selected("layout")).toBe(true));
    expect(pane.applied).toHaveBeenCalledTimes(1);
  });

  it("Discard switches and drops the text", async () => {
    render(<><AddPhysicalAdapter onComplete={vi.fn()} /><UnappliedTextDialog /></>);
    await goToCode();
    fireEvent.click(screen.getByTestId("editor-view-tab-assign"));
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(selected("assign")).toBe(true));
    expect(pane.discarded).toHaveBeenCalledTimes(1);
  });

  it("switches at once when nothing is unapplied", async () => {
    pane.dirty = false;
    render(<><AddPhysicalAdapter onComplete={vi.fn()} /><UnappliedTextDialog /></>);
    await goToCode();
    fireEvent.click(screen.getByTestId("editor-view-tab-layout"));
    expect(screen.queryByTestId("unapplied-text-dialog")).toBeNull();
    expect(selected("layout")).toBe(true);
  });
});
