// OskEditor on a keyboard opened with its descriptor (spec 111 "live files", FR-041/FR-045):
// a Visual commit goes through the apply seam (one undo record, only that key's element
// changes), the toggles write the header flags, and the editor has no Undo of its own.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { undoLastOpenApply } from "../../lib/openApply.ts";
import { OskEditor } from "./OskEditor.tsx";

vi.mock("../../components/OpenUndoButton.tsx", () => ({ OpenUndoButton: () => null }));

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };
const KVKS =
  '<?xml version="1.0" encoding="UTF-8"?>\n<visualkeyboard>\n  <header><version>10.0</version><kbdname>kb</kbdname><flags><usealtgr/></flags></header>\n' +
  '  <encoding name="unicode" fontname="Arial" fontsize="10"><!-- c -->\n    <layer shift=""><key vkey="K_A" chars="a">a</key><key vkey="K_B">b</key></layer>\n  </encoding>\n</visualkeyboard>\n';

const fileText = (): string | undefined => {
  const c = useWorkingCopyStore.getState().startVfs?.get("source/kb.kvks")?.content;
  return typeof c === "string" ? c : undefined;
};

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kps", "<Package/>", false);
  vfs.set("source/kb.kvks", KVKS, false);
  clearOpenSession();
  useWorkingCopyStore.getState().reset();
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});
afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
});

describe("OskEditor on Open (live files)", () => {
  it("a Visual label commit goes through the seam; the editor has no Undo of its own; undo is byte-identical", async () => {
    render(<OskEditor onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    expect(screen.queryByTestId("osk-undo")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^Key K_B/ })[0]!);
    fireEvent.change(screen.getByLabelText("Display label"), { target: { value: "β" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply label" }));
    await waitFor(() => expect(fileText()).toBe(KVKS.replace(">b</key>", ">β</key>")));
    expect(useOpenUndoStore.getState().records.at(-1)!.labelKey).toBe("osk");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(KVKS);
  });

  it("the 102nd-key toggle writes the header flag; undo is byte-identical", async () => {
    render(<OskEditor onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    fireEvent.click(screen.getByLabelText("Include 102nd key (ISO)"));
    await waitFor(() => expect(fileText()).toBe(KVKS.replace("<usealtgr/>", "<usealtgr/><key102/>")));
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(KVKS);
  });

  it("the display-underlying toggle writes the header flag; undo is byte-identical", async () => {
    render(<OskEditor onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    fireEvent.click(screen.getByLabelText("Display underlying characters"));
    await waitFor(() => expect(fileText()).toBe(KVKS.replace("<usealtgr/>", "<usealtgr/><displayunderlying/>")));
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileText()).toBe(KVKS);
  });
});
