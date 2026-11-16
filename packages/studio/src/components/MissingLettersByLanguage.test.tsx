// Spec 111 FR-018a: missing expected letters are grouped by the language that
// expects them, and a language can be dropped from the keyboard instead.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

import { groupMissingByLanguage, MissingLettersByLanguage } from "./MissingLettersByLanguage.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import "../lib/openApply.ts";
import { undoLastOpenApply } from "../lib/openApply.ts";
import { clearOpenSession } from "../stores/openUndoStore.ts";
import { readVfsText } from "../lib/vfsText.ts";

const sources = { "è": ["ht"], "ā": ["to"], "ʻ": ["to", "uz"] };

describe("groupMissingByLanguage", () => {
  it("lists each missing letter under every language that expects it, in list order", () => {
    expect(groupMissingByLanguage(["ʻ", "è", "ā"], sources, ["en", "ht", "to", "uz"])).toEqual([
      { tag: "ht", chars: ["è"] },
      { tag: "to", chars: ["ʻ", "ā"] },
      { tag: "uz", chars: ["ʻ"] },
    ]);
  });
});

describe("MissingLettersByLanguage", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().setIdentity({
      languages: [{ tag: "en", name: "English" }, { tag: "ht", name: "Haitian" }, { tag: "to", name: "Tongan" }],
    });
  });
  afterEach(cleanup);

  it("names the language and removes it from the keyboard's list", async () => {
    render(<MissingLettersByLanguage missing={["è", "ā"]} sourcesByChar={sources} />);
    expect(screen.getByTestId("missing-letters-to").textContent).toContain("Tongan (to)");

    fireEvent.click(screen.getByRole("button", { name: /Remove Tongan \(to\)/ }));

    await waitFor(() => {
      const tags = (useWorkingCopyStore.getState().identity?.languages ?? []).map((l) => l.tag);
      expect(tags).toEqual(["en", "ht"]);
    });
    const recorded = useDecisionStore.getState().decisions["language-list"]?.value as { tag: string }[];
    expect(recorded.map((l) => l.tag)).toEqual(["en", "ht"]);
  });

  it("offers an Add button per letter when the host routes adds, and none otherwise", () => {
    const added: string[] = [];
    const { unmount } = render(<MissingLettersByLanguage missing={["è", "ā"]} sourcesByChar={sources} onAdd={(c) => added.push(c)} />);
    fireEvent.click(screen.getByRole("button", { name: /Add ā to the keyboard/ }));
    expect(added).toEqual(["ā"]);
    unmount();
    render(<MissingLettersByLanguage missing={["è"]} sourcesByChar={sources} />);
    expect(screen.queryByRole("button", { name: /Add è/ })).toBeNull();
  });
});

describe("MissingLettersByLanguage on a keyboard opened for update", () => {
  afterEach(cleanup);

  it("Remove language writes the .kps, keeps the decision as the record, and undo restores the list", async () => {
    const kmn = ["store(&NAME) 'T'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
    const kps = [
      "<Package>\r\n  <Keyboards>\r\n    <Keyboard>\r\n      <Name>T</Name>\r\n",
      "      <Languages>\r\n        <Language ID=\"en\">English</Language>\r\n        <Language ID=\"to\">Tongan</Language>\r\n      </Languages>\r\n",
      "    </Keyboard>\r\n  </Keyboards>\r\n</Package>\r\n",
    ].join("");
    const vfs = createVirtualFS([
      { path: "source/t.kmn", content: kmn, isBinary: false },
      { path: "source/t.kps", content: kps, isBinary: false },
    ]);
    clearOpenSession();
    useDecisionStore.getState().reset();
    const wc = useWorkingCopyStore.getState();
    wc.reset();
    wc.instantiateFromExisting(
      { id: "t", path: "release/t/t", script: "Latn", targets: ["desktop"], displayName: "T", version: "1.0", languages: ["en"] } as StartKeyboard,
      { vfs, ir: parseKmn(kmn, "t").ir },
    );
    const tagsOf = () => (useWorkingCopyStore.getState().identity?.languages ?? []).map((l) => l.tag);
    expect(tagsOf()).toEqual(["en", "to"]);

    render(<MissingLettersByLanguage missing={["ā"]} sourcesByChar={{ "ā": ["to"] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove English|Remove Tongan/ }));

    const file = () => readVfsText(useWorkingCopyStore.getState().startVfs!, "source/t.kps")!;
    await waitFor(() => expect(file()).not.toContain("Tongan"));
    expect(file()).toContain("English");
    expect(tagsOf()).toEqual(["en"]);
    const recorded = useDecisionStore.getState().decisions["language-list"]?.value as { tag: string }[];
    expect(recorded.map((l) => l.tag)).toEqual(["en"]);

    expect(undoLastOpenApply().ok).toBe(true);
    expect(file()).toBe(kps);
    expect(tagsOf()).toEqual(["en", "to"]);
  });
});
