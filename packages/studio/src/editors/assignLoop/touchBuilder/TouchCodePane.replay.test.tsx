// Defect (f): the touch Code tab's Apply replaces the file through the replay wrapper.

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

// Regression: the editor must replace the file through the replay wrapper.
const replaySpy = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/replaceStartingPoint.ts", async (importActual) => {
  const actual = await importActual<typeof import("../../../lib/replaceStartingPoint.ts")>();
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
const LAYOUT = JSON.stringify({ phone: { font: "Tahoma", layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] } }, null, 2);

beforeEach(() => {
  replaySpy.mockClear();
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  vfs.set("source/kb.keyman-touch-layout", LAYOUT, false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
});
afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
});

describe("TouchCodePane replay wrapper", () => {
  it("Apply replaces the touch layout through replaceStartingPointAndReplay", () => {
    render(<TouchCodePane layout={parseTouchLayoutString(LAYOUT)} />);
    fireEvent.change(screen.getByTestId("mock-editor"), {
      target: { value: LAYOUT.replace('"a"', '"b"') },
    });
    fireEvent.click(screen.getByTestId("touch-code-apply"));
    expect(replaySpy).toHaveBeenCalledWith("source/kb.keyman-touch-layout", expect.any(String));
  });
});
