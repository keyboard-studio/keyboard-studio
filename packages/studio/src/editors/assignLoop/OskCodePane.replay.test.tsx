// Defect (f): the OSK Code tab's Apply replaces the file through the replay wrapper.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn, parseKvks } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
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

// Regression: the editor must replace the file through the replay wrapper.
const replaySpy = vi.hoisted(() => vi.fn());
vi.mock("../../lib/replaceStartingPoint.ts", async (importActual) => {
  const actual = await importActual<typeof import("../../lib/replaceStartingPoint.ts")>();
  return {
    ...actual,
    replaceStartingPointAndReplay: (...args: Parameters<typeof actual.replaceStartingPointAndReplay>) => {
      replaySpy(...args);
      return actual.replaceStartingPointAndReplay(...args);
    },
  };
});

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };
const KVKS = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<visualkeyboard>\n  <header><version>10.0</version><kbdname>kb</kbdname></header>\n  <encoding name=\"unicode\" fontname=\"Arial\" fontsize=\"10\"><layer shift=\"\"><key vkey=\"K_A\">a</key></layer></encoding>\n</visualkeyboard>\n";

beforeEach(() => {
  replaySpy.mockClear();
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.kvks", KVKS, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});
afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
});

describe("OskCodePane replay wrapper", () => {
  it("Apply replaces the .kvks through replaceStartingPointAndReplay", () => {
    render(<OskCodePane kvks={parseKvks(KVKS)} onApply={vi.fn()} />);
    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: KVKS.replace("version>10.0", "version>10.0 ") },
    });
    fireEvent.click(screen.getByTestId("osk-code-apply"));
    expect(replaySpy).toHaveBeenCalledWith("source/kb.kvks", expect.any(String));
  });
});
