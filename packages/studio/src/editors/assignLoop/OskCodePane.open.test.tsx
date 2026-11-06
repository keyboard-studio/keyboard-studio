// Open mode (spec 111 FR-009): the OSK Code tab shows the .kvks file's own text.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { parseKvks } from "@keyboard-studio/engine";
import { OskCodePane } from "./OskCodePane.tsx";

vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));

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

const KVKS = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<visualkeyboard>\n  <header><version>10.0</version><kbdname>kb</kbdname></header>\n  <encoding name=\"unicode\" fontname=\"Arial\" fontsize=\"10\"><layer shift=\"\"><key vkey=\"K_A\">a</key></layer></encoding>\n</visualkeyboard>\n";

beforeEach(() => {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kvks", KVKS, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});

describe("OskCodePane on Open", () => {
  it("shows the file text and writes an Apply back verbatim", () => {
    const onApply = vi.fn();
    render(<OskCodePane kvks={parseKvks(KVKS)} onApply={onApply} />);
    expect((screen.getByTestId("mock-editor") as HTMLTextAreaElement).value).toBe(KVKS);
    const edited = KVKS.replace("version>10.0", "version>10.0 ");
    typeInto(edited);
    fireEvent.click(screen.getByTestId("osk-code-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(vfsText("source/kb.kvks")).toBe(edited);
  });
});
