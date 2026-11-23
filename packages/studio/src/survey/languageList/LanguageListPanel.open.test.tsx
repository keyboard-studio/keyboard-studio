// Spec 111 FR-041/FR-042 on the Languages step: a commit on Open writes the .kps and
// the list shown is the file's (undo included); a failed write changes nothing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../../test/renderWithI18n.tsx";
import { LanguageListRenderer } from "./LanguageListPanel.tsx";
import { GalleryStepContext } from "../../steps/galleryHost.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { clearOpenSession } from "../../stores/openUndoStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import * as openApply from "../../lib/openApply.ts";

const KMN = ["store(&NAME) 'T'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const KPS = [
  "<Package>\r\n  <Keyboards>\r\n    <Keyboard>\r\n      <Name>T</Name>\r\n",
  "      <Languages>\r\n        <Language ID=\"en\">English</Language>\r\n        <Language ID=\"to\">Tongan</Language>\r\n      </Languages>\r\n",
  "    </Keyboard>\r\n  </Keyboards>\r\n</Package>\r\n",
].join("");

function open(): void {
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
}

/** Stand-in for the gallery host: `value` is the recorded decision, `onChange` records it. */
function Harness() {
  const decision = useDecisionStore((s) => s.decisions["language-list"]);
  return (
    <GalleryStepContext.Provider value={{ onComplete: () => undefined }}>
      <LanguageListRenderer
        value={decision?.value as { tag: string; name?: string }[] | undefined}
        onChange={(v) =>
          useDecisionStore.getState().record({
            id: "language-list", value: v, provenance: "asked", at: 0,
          } as never)
        }
      />
    </GalleryStepContext.Provider>
  );
}

const file = () => readVfsText(useWorkingCopyStore.getState().startVfs!, "source/t.kps")!;

describe("Languages step on Open", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("after Undo the panel shows the file's list, not the recorded decision", async () => {
    open();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Remove to/ }));
    await waitFor(() => expect(file()).not.toContain("Tongan"));
    await waitFor(() => expect(screen.queryByText(/Tongan/)).toBeNull());
    expect(openApply.undoLastOpenApply().ok).toBe(true);
    expect(file()).toBe(KPS);
    await waitFor(() => expect(screen.getByText(/Tongan \(to\)/)).toBeTruthy());
  });

  it("a failed write records no decision and leaves identity and file alone", async () => {
    open();
    vi.spyOn(openApply, "applyOpenChange").mockReturnValue({ status: "failed", reason: "mock" });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Remove to/ }));
    await waitFor(() => expect(openApply.applyOpenChange).toHaveBeenCalled());
    // The host owns the notice for a failed apply; the panel adds none.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useDecisionStore.getState().decisions["language-list"]).toBeUndefined();
    expect((useWorkingCopyStore.getState().identity?.languages ?? []).map((l) => l.tag)).toEqual(["en", "to"]);
    expect(file()).toBe(KPS);
  });

  it("with no readable .kps it says so, keeps the add form's text, and records nothing", async () => {
    open();
    useWorkingCopyStore.setState({
      startVfs: createVirtualFS([
        { path: "source/t.kmn", content: KMN, isBinary: false },
        { path: "source/t.kps", content: new Uint8Array([1]), isBinary: true },
      ]),
    });
    render(<Harness />);
    const tagField = screen.getByLabelText(/Language tag/) as HTMLInputElement;
    fireEvent.change(tagField, { target: { value: "ewo" } });
    fireEvent.click(screen.getByRole("button", { name: /Add language/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(tagField.value).toBe("ewo");
    expect(useDecisionStore.getState().decisions["language-list"]).toBeUndefined();
  });

  it("clears the add form once the language is written", async () => {
    open();
    render(<Harness />);
    const tagField = screen.getByLabelText(/Language tag/) as HTMLInputElement;
    fireEvent.change(tagField, { target: { value: "ewo" } });
    fireEvent.click(screen.getByRole("button", { name: /Add language/ }));
    await waitFor(() => expect(file()).toContain('ID="ewo"'));
    await waitFor(() => expect(tagField.value).toBe(""));
  });
});
