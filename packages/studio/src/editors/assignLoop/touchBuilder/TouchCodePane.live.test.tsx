// Live Open (spec 111 FR-041, phase 16 S2a): the touch Code tab applies through the
// apply seam: one undo record, byte-identical undo, parse errors still refused.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { TouchCodePane } from "./TouchCodePane.tsx";
import { useOpenUndoStore } from "../../../stores/openUndoStore.ts";
import { undoLastOpenApply } from "../../../lib/openApply.ts";

vi.mock("./monacoSetup.ts", () => ({}));

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  return {
    default: function MockEditor(props: {
      value?: string;
      onChange?: (value: string | undefined) => void;
    }) {
      return React.createElement("textarea", {
        "data-testid": "mock-editor",
        value: props.value ?? "",
        onChange: (e: { target: { value: string } }) => props.onChange?.(e.target.value),
      });
    },
  };
});

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };

function vfsText(path: string): string | undefined {
  const c = useWorkingCopyStore.getState().startVfs?.get(path)?.content;
  return typeof c === "string" ? c : undefined;
}
function typeInto(value: string): void {
  fireEvent.change(screen.getByTestId("mock-editor"), { target: { value } });
}
afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
  useOpenUndoStore.getState().clear();
});

const LAYOUT = JSON.stringify({ phone: { font: "Tahoma", layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] } }, null, 2);

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kps", "<Package/>", false);
  vfs.set("source/kb.keyman-touch-layout", LAYOUT, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});

describe("TouchCodePane on a keyboard opened for update", () => {
  it("applies through the seam: one undo record, undo restores the bytes", async () => {
    render(<TouchCodePane layout={parseTouchLayoutString(LAYOUT)} />);
    const edited = LAYOUT.replace('"text": "a"', '"text": "ɛ"');
    typeInto(edited);
    fireEvent.click(screen.getByTestId("touch-code-apply"));
    await waitFor(() => expect(vfsText("source/kb.keyman-touch-layout")).toBe(edited));
    expect(screen.queryByTestId("touch-code-apply-error")).toBeNull();
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]!.labelKey).toBe("code-view");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(vfsText("source/kb.keyman-touch-layout")).toBe(LAYOUT);
  });

  it("still refuses text that is not JSON, writing nothing", async () => {
    render(<TouchCodePane layout={parseTouchLayoutString(LAYOUT)} />);
    typeInto('{"phone": ');
    fireEvent.click(screen.getByTestId("touch-code-apply"));
    expect(vfsText("source/kb.keyman-touch-layout")).toBe(LAYOUT);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});
