// Spec 111 FR-041/FR-042: when the apply on Open does not write, Remove language
// records no decision and changes no identity; the author is told.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../test/renderWithI18n.tsx";
import { applyOpenChange as applyMock } from "../lib/openApply.ts";
import { MissingLettersByLanguage } from "./MissingLettersByLanguage.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { clearOpenSession } from "../stores/openUndoStore.ts";
import { readVfsText } from "../lib/vfsText.ts";

vi.mock("../lib/openApply.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/openApply.ts")>()),
  applyOpenChange: vi.fn(() => ({ status: "failed", reason: "mock" })),
}));

const KMN = ["store(&NAME) 'T'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const KPS = [
  "<Package>\r\n  <Keyboards>\r\n    <Keyboard>\r\n      <Name>T</Name>\r\n",
  "      <Languages>\r\n        <Language ID=\"en\">English</Language>\r\n        <Language ID=\"to\">Tongan</Language>\r\n      </Languages>\r\n",
  "    </Keyboard>\r\n  </Keyboards>\r\n</Package>\r\n",
].join("");

describe("MissingLettersByLanguage when the apply fails on Open", () => {
  afterEach(cleanup);

  it("changes neither the decision, the identity nor the .kps (the host says so)", async () => {
    const vfs = createVirtualFS([
      { path: "source/t.kmn", content: KMN, isBinary: false },
      { path: "source/t.kps", content: KPS, isBinary: false },
    ]);
    clearOpenSession();
    useDecisionStore.getState().reset();
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(
      { id: "t", path: "release/t/t", script: "Latn", targets: ["desktop"], displayName: "T", version: "1.0", languages: ["en"] } as StartKeyboard,
      { vfs, ir: parseKmn(KMN, "t").ir },
    );
    render(<MissingLettersByLanguage missing={["ā"]} sourcesByChar={{ "ā": ["to"] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(applyMock).toHaveBeenCalled());
    // The host owns the notice for a failed apply; this component adds none.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useDecisionStore.getState().decisions["language-list"]).toBeUndefined();
    expect((useWorkingCopyStore.getState().identity?.languages ?? []).map((l) => l.tag)).toEqual(["en", "to"]);
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, "source/t.kps")).toBe(KPS);
  });
});
