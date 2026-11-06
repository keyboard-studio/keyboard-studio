// Open mode (spec 111 FR-009, research R7): the touch Code tab shows the file's
// own text and Apply replaces the file, even for a structural change.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { TouchCodePane } from "./TouchCodePane.tsx";

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
});

const LAYOUT = JSON.stringify({ phone: { font: "Tahoma", layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] } }, null, 2);

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.keyman-touch-layout", LAYOUT, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});

describe("TouchCodePane on Open", () => {
  it("applies a structural change that Copy would refuse", () => {
    render(<TouchCodePane layout={parseTouchLayoutString(LAYOUT)} />);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(LAYOUT);
    const edited = JSON.stringify({ phone: { font: "Tahoma", layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }, { id: "shift", row: [{ id: 1, key: [{ id: "K_A", text: "A" }] }] }] } }, null, 2);
    typeInto(edited);
    fireEvent.click(screen.getByTestId("touch-code-apply"));
    expect(screen.queryByTestId("touch-code-apply-error")).toBeNull();
    expect(vfsText("source/kb.keyman-touch-layout")).toBe(edited);
  });
});
