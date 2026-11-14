// TouchGallery on a keyboard opened for update (spec 111 phase 16, S2a): the key grid, builder and preview read the touch FILE; an unreadable file makes the grid read-only.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { commitTouchOpOnOpen } from "./touchOpenCommit.ts";
import { undoLastOpenApply } from "../../lib/openApply.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { touchKeyAddress } from "@keyboard-studio/contracts";
import { capturedVfsTransformRef } from "../../test/touchGallery/mocks.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { installTouchGalleryHooks } from "../../test/touchGallery/harness.ts";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
    await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
  ),
);
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../components/OskModeToggle.tsx", () => import("../../test/touchGallery/mocks.tsx"));
// The Code tab's Monaco chain cannot load under vitest's module runner:
// monacoSetup's `?worker` imports are resolved by Vite's worker plugin,
// which never runs for externalized deps in the test environment (the
// production build resolves them — vite.config.ts sets worker.format "es"
// in anticipation). These suites render the real TouchGallery, which
// lazy-loads the real TouchCodePane, so both the worker wiring and the
// Editor component are stubbed here; the pane's own suite
// (touchBuilder/TouchCodePane.test.tsx) mocks @monaco-editor/react
// directly with a functional stand-in.
vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));
vi.mock("@monaco-editor/react", () => ({
  default: () => null,
}));

installTouchGalleryHooks();

beforeAll(async () => {
  await import("./touchBuilder/TouchCodePane.tsx");
}, 60000);

const TOUCH = JSON.stringify(
  { phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }] }] }] } },
  null,
  2,
);

function seedOpen(touch: string): void {
  useOpenUndoStore.getState().clear();
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    { path: "source/basic_kbdus.kps", content: "<Package/>", isBinary: false },
    { path: "source/basic_kbdus.keyman-touch-layout", content: touch, isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: ["中"] });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useDecisionStore.getState().record({ id: "touch-seed-source", value: "import-adapt", provenance: "asked", step: "touch_seed_source" });
}

function previewTouchText(): string | undefined {
  const fn = capturedVfsTransformRef.current;
  if (fn === null) throw new Error("no transform captured");
  const vfs = createVirtualFS(useWorkingCopyStore.getState().startVfs!.entries());
  fn(vfs, "basic_kbdus");
  return readVfsText(vfs, "source/basic_kbdus.keyman-touch-layout");
}

describe("TouchGallery on a keyboard opened for update", () => {
  it("the character view's preview keeps a key-grid edit that is already in the file, with an in-progress assignment laid over it", async () => {
    seedOpen(TOUCH);
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });
    await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_A");
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
    await waitFor(() => {
      expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries).toHaveLength(1);
    });
    await act(async () => {
      commitTouchOpOnOpen(
        { op: { kind: "set", address: touchKeyAddress("phone", "default", "K_B"), fields: { text: "ɛ" } } },
        "touch layout edit",
      );
    });
    // Character view is showing; the preview has the edit AND the placed 中.
    expect(screen.getByTestId("touch-mode-tab-character").getAttribute("aria-selected")).toBe("true");
    const withBoth = previewTouchText()!;
    expect(withBoth).toContain("ɛ");
    expect(withBoth).toContain("中");
    await act(async () => {
      expect(undoLastOpenApply().ok).toBe(true);
    });
    const afterUndo = previewTouchText()!;
    expect(afterUndo).not.toContain("ɛ");
    expect(afterUndo).toContain("中");
  });

  it("an unreadable touch file makes the key grid read-only with a notice, and nothing is written", async () => {
    const bad = '{"phone": {"layer": [';
    seedOpen(bad);
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-mode-tab-key"));
    });
    expect(screen.getByTestId("touch-open-unreadable").textContent).toMatch(/cannot be read/);
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, "source/basic_kbdus.keyman-touch-layout")).toBe(bad);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});
