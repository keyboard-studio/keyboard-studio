// Open mode (spec 111 FR-043): the preview projects the working copy's CURRENT
// files, not the copy fetched at open, and places a `.kmn` change the way the
// download does. Copy mode is unchanged. Real projection, no engine mocks.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard, type VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "./useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";

vi.mock("../lib/services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN =
  "store(&NAME) 'Kb'\nstore(&VERSION) '10.0'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n";
const KVKS = "<visualkeyboard>original</visualkeyboard>";
const KPS = "<Package><Keyboards><Keyboard><Version>1.0</Version></Keyboard></Keyboards></Package>\n";
const KB: StartKeyboard = {
  id: "kb",
  path: "release/k/kb",
  script: "Latn",
  targets: ["windows"],
  displayName: "Kb",
  version: "1.0",
};
const KMN_PATH = "source/kb.kmn";

function files(): Array<{ path: string; content: string; isBinary: boolean }> {
  return [
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: "source/kb.kvks", content: KVKS, isBinary: false },
    { path: "source/kb.kps", content: KPS, isBinary: false },
    { path: "source/welcome/welcome.htm", content: "<p>original</p>", isBinary: false },
  ];
}

function seed(track: "open" | "copy"): void {
  const vfs = createVirtualFS(files());
  const ir = parseKmn(KMN, "kb").ir;
  const wc = useWorkingCopyStore.getState();
  if (track === "open") wc.instantiateFromExisting(KB, { vfs, ir });
  else wc.instantiateFromStart(KB, { vfs, ir });
}

/** The preview as the artifact hook runs it: onto a fresh copy of the fetched (pristine) files. */
function preview(): VirtualFS {
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: "kb" }));
  const fetched = createVirtualFS(files());
  result.current!(fetched, "kb");
  return fetched;
}

function text(vfs: VirtualFS, path: string): string | undefined {
  const c = vfs.get(path)?.content;
  return typeof c === "string" ? c : undefined;
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("useWorkingCopyTransform on Open", () => {
  it("shows a .kmn text edit verbatim with no carve or rule edit", () => {
    seed("open");
    const edited = "c the author's comment\n" + KMN.replace("+ [K_B] > 'b'", "+   [K_B]   >   'b'");
    expect(useWorkingCopyStore.getState().replaceStartingPointFromText(KMN_PATH, edited).ok).toBe(true);
    expect(text(preview(), KMN_PATH)).toBe(edited);
  });

  it("shows a .kvks edit", () => {
    seed("open");
    useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kvks", "<visualkeyboard>edited</visualkeyboard>");
    expect(text(preview(), "source/kb.kvks")).toBe("<visualkeyboard>edited</visualkeyboard>");
  });

  it("shows a documentation edit written as the doc regeneration fix writes it", () => {
    seed("open");
    useWorkingCopyStore.getState().replaceStartingPointFromText("source/welcome/welcome.htm", "<p>regenerated</p>");
    expect(text(preview(), "source/welcome/welcome.htm")).toBe("<p>regenerated</p>");
  });

  it("keeps a file only the fetched copy holds (overlay, not replace)", () => {
    seed("open");
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: "kb" }));
    const fetched = createVirtualFS(files());
    fetched.set("source/extra.txt", "fetched-only", false);
    result.current!(fetched, "kb");
    expect(text(fetched, "source/extra.txt")).toBe("fetched-only");
  });

  it("projects the same .kmn as the download for a session with one carve removal", async () => {
    seed("open");
    const wc = useWorkingCopyStore.getState();
    const ruleId = wc.startIr!.groups[0]!.rules[0]!.nodeId;
    wc.deleteNode(ruleId);
    const previewKmn = text(preview(), KMN_PATH)!;
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const outputKmn = projected!.vfs.get(KMN_PATH)?.content as string;
    // The download also stamps the bumped version; the preview shows the opened one.
    const strip = (s: string) => s.split("\n").filter((l) => !/&KEYBOARDVERSION|&VERSION/.test(l)).join("\n");
    expect(strip(previewKmn)).toBe(strip(outputKmn));
    expect(previewKmn).toContain("[K_A] > nul");
  });
});

describe("useWorkingCopyTransform on Copy", () => {
  it("ignores the store's starting point and projects onto the fetched files", () => {
    seed("copy");
    useWorkingCopyStore.setState({
      startVfs: createVirtualFS([{ path: "source/kb.kvks", content: "<edited/>", isBinary: false }]),
    });
    const out = preview();
    expect(text(out, "source/kb.kvks")).toBe(KVKS);
    expect(text(out, KMN_PATH)).toBe(KMN);
  });
});
