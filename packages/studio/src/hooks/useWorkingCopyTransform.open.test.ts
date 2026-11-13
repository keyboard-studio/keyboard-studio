// Open mode (spec 111 FR-043): the preview projects the working copy's CURRENT
// files, not the copy fetched at open, and places a `.kmn` change the way the
// download does. Copy mode is unchanged. Real projection, no engine mocks.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
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

function seed(track: "open" | "copy", seedFiles = files()): void {
  const vfs = createVirtualFS(seedFiles);
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

/** Same as the hook-driven preview, for a pristine copy the caller supplies. */
function previewOnto(fetched: VirtualFS): { vfs: VirtualFS; warnings: string[] } {
  const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: "kb" }));
  const { warnings } = result.current!(fetched, "kb");
  return { vfs: fetched, warnings };
}

const strip = (s: string): string =>
  s.split("\n").filter((l) => !/&KEYBOARDVERSION|&VERSION/.test(l)).join("\n");

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

describe("useWorkingCopyTransform on Open: rule edits and the splice path", () => {
  const EDITED_KMN =
    "c the author's comment\n" +
    "store(&NAME) 'Kb'\nstore(&VERSION) '10.0'\nbegin Unicode > use(main)\ngroup(main) using keys\n" +
    "+   [K_A]   >   'x'   c odd spacing kept\n" +
    "+ [K_B] > 'b'\n";

  it("shows a changed RULE verbatim with no carve edit", () => {
    seed("open");
    expect(useWorkingCopyStore.getState().replaceStartingPointFromText(KMN_PATH, EDITED_KMN).ok).toBe(true);
    expect(text(preview(), KMN_PATH)).toBe(EDITED_KMN);
  });

  it("splices a carve into the edited file, leaving untouched lines, comments and formatting as written", () => {
    seed("open");
    const wc = useWorkingCopyStore.getState();
    expect(wc.replaceStartingPointFromText(KMN_PATH, EDITED_KMN).ok).toBe(true);
    const kRuleB = useWorkingCopyStore.getState().startIr!.groups[0]!.rules[1]!.nodeId;
    useWorkingCopyStore.getState().deleteNode(kRuleB);
    const out = text(preview(), KMN_PATH)!;
    expect(out).toContain("c the author's comment\n");
    expect(out).toContain("+   [K_A]   >   'x'   c odd spacing kept\n");
    expect(out).toContain("[K_B] > nul");
    expect(out).not.toContain("+ [K_B] > 'b'");
  });
});

describe("useWorkingCopyTransform on Open: file kinds and restored drafts", () => {
  it("projects the same .kmn as the download when the keyboard has no .kps", async () => {
    seed("open", files().filter((f) => f.path !== "source/kb.kps"));
    const edited = "c note\n" + KMN;
    useWorkingCopyStore.getState().replaceStartingPointFromText(KMN_PATH, edited);
    const ruleId = useWorkingCopyStore.getState().startIr!.groups[0]!.rules[0]!.nodeId;
    useWorkingCopyStore.getState().deleteNode(ruleId);
    const previewKmn = text(previewOnto(createVirtualFS(files().filter((f) => f.path !== "source/kb.kps"))).vfs, KMN_PATH)!;
    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    expect(strip(previewKmn)).toBe(strip(projected!.vfs.get(KMN_PATH)?.content as string));
  });

  it("keeps a binary entry byte-for-byte with its binary flag", () => {
    const font = new Uint8Array([0, 1, 2, 250, 255]);
    seed("open", [...files(), { path: "source/f.ttf", content: font, isBinary: true }]);
    const out = previewOnto(createVirtualFS(files())).vfs.get("source/f.ttf");
    expect(out?.isBinary).toBe(true);
    expect(Array.from(out?.content as Uint8Array)).toEqual(Array.from(font));
  });

  it("shows an edited touch layout exactly as the author wrote it", () => {
    const touchPath = "source/kb.keyman-touch-layout";
    const original = '{"phone":{"font":"x","layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"a"}]}]}]}}';
    seed("open", [...files(), { path: touchPath, content: original, isBinary: false }]);
    const authored = '{"phone":{"font":"x","layer":[{"id":"default","row":[{"id":1,"key":[{"id":"K_A","text":"z"}]}]}]}}';
    expect(useWorkingCopyStore.getState().replaceStartingPointFromText(touchPath, authored).ok).toBe(true);
    const pristine = createVirtualFS([...files(), { path: touchPath, content: original, isBinary: false }]);
    expect(text(previewOnto(pristine).vfs, touchPath)).toBe(authored);
  });

  it("yields the edited files on the first call for a restored draft (pristine fetch, edited store)", () => {
    seed("open");
    useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kvks", "<visualkeyboard>draft</visualkeyboard>");
    const firstCall = previewOnto(createVirtualFS(files())).vfs;
    expect(text(firstCall, "source/kb.kvks")).toBe("<visualkeyboard>draft</visualkeyboard>");
  });

  it("re-runs the preview when a store file changes (the transform identity changes)", () => {
    seed("open");
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: "kb" }));
    const before = result.current;
    expect(before).not.toBeNull();
    act(() => {
      useWorkingCopyStore.getState().replaceStartingPointFromText("source/kb.kvks", "<visualkeyboard>edited</visualkeyboard>");
    });
    expect(result.current).not.toBeNull();
    expect(result.current).not.toBe(before);
  });
});

describe("useWorkingCopyTransform on Open: an unplaceable change", () => {
  it("previews the reformatted text and warns without claiming the author agreed", () => {
    seed("open");
    // A rule the starting point holds with no resolvable source line cannot be
    // spliced out of the text; the carve of it is unplaceable.
    const wc = useWorkingCopyStore.getState();
    const startIr = wc.startIr!;
    const group = startIr.groups[0]!;
    const noSpan = { ...group.rules[0]!, sourceLine: undefined };
    const patched = { ...startIr, groups: [{ ...group, rules: [noSpan, ...group.rules.slice(1)] }, ...startIr.groups.slice(1)] };
    useWorkingCopyStore.setState({ startIr: patched, ir: patched });
    useWorkingCopyStore.getState().deleteNode(noSpan.nodeId);
    const { vfs, warnings } = previewOnto(createVirtualFS(files()));
    expect(text(vfs, KMN_PATH)).toContain("[K_A] > nul");
    const open = warnings.filter((w) => w.startsWith("[open]"));
    expect(open).toHaveLength(1);
    expect(open[0]).toContain("the preview shows it reformatted");
    expect(open[0]).not.toContain("agreement");
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
