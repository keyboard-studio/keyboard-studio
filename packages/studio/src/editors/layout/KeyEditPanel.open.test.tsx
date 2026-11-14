// KeyEditPanel on a keyboard opened for update (spec 111 T082a): the confirm writes the source file,
// the panel and the pane read the file's own model, and the pane's own undo is not offered.

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attributeLayer, parseKmn } from "@keyboard-studio/engine";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { undoLastOpenApply } from "../../lib/openApply.ts";
import { buildDesktopGridViewModel } from "./desktopGridViewModel.ts";
import { KeyEditPanel } from "./KeyEditPanel.tsx";
import { LayoutPane } from "./LayoutPane.tsx";
import { selectLayoutIr } from "./layoutIr.ts";

const ID = "kop";
const KMN = ["store(&NAME) 'kop'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_N] > 'n'", ""].join("\r\n");
const KB = { id: ID, path: "release/k/kop", script: "Latn", targets: ["desktop"], displayName: "Kop", version: "1.0", languages: ["en"] } as StartKeyboard;

beforeEach(() => {
  useOpenUndoStore.getState().clear();
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  const vfs = createVirtualFS([
    { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact(`blob:${ID}`, ID));
});
afterEach(cleanup);

describe("KeyEditPanel on Open", () => {
  it("confirm writes the file; the layout model is the file's parse; undo restores it", () => {
    const ir = selectLayoutIr(useWorkingCopyStore.getState())!;
    const cell = buildDesktopGridViewModel({ layer: [], cells: attributeLayer(ir, [], ["K_N"]), state: "ready" }).cells.find((c) => c.vkey === "K_N")!;
    render(<KeyEditPanel cell={cell} onViewInCode={vi.fn()} />);
    fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value: "ŋ" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    const s = useWorkingCopyStore.getState();
    expect(readVfsText(s.startVfs!, `source/${ID}.kmn`)).toContain("U+014B");
    expect(selectLayoutIr(s)).toBe(s.startIr);
    expect(attributeLayer(selectLayoutIr(s)!, [], ["K_N"])[0]?.plain?.output).toBeDefined();
    expect(undoLastOpenApply().ok).toBe(true);
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, `source/${ID}.kmn`)).toBe(KMN);
  });

  it("the Layout pane offers no undo of its own on Open", () => {
    render(<LayoutPane onViewInCode={vi.fn()} />);
    expect(screen.queryByTestId("layout-undo")).toBeNull();
  });
});
