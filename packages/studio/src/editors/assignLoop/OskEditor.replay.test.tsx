// Defect (f): OskEditor edits and undo replace the .kvks through the replay wrapper.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { OskEditor } from "./OskEditor.tsx";

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

describe("OskEditor replay wrapper", () => {
  it("an edit replaces the .kvks through replaceStartingPointAndReplay", () => {
    render(<OskEditor onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "Include 102nd key (ISO)" }));
    expect(replaySpy).toHaveBeenCalledWith("source/kb.kvks", expect.any(String));
  });
});
