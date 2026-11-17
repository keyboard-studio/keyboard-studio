// commitDocPagesOnOpen: a Documentation-step edit on Open is a live write into the page's own
// file (spec 111 FR-041/FR-043, SC-010 for the four pages): one undo record per page, the
// editor seed, the preview and the download read the same file, and the decision keeps only names.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useDocsPreview } from "../hooks/useDocsPreview.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { undoLastOpenApply } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { commitDocPagesOnOpen, commitDocPagesThroughSeam, openDocPath, type ApplyDocChange } from "./docsOpenCommit.ts";
import { applyOpenChange } from "./openApply.ts";
import { completeHtmlStep } from "./htmlStepCompletion.ts";
import type { EditableDocMember } from "./authoredDocs.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN = ["store(&NAME) 'Tiny'", "store(&VERSION) '10.0'", "", "begin Unicode > use(main)", "", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const KPS = "<Package><Keyboards><Keyboard><Languages><Language ID=\"bas\">Basaa</Language></Languages></Keyboard></Keyboards></Package>\r\n";
const PATHS: Record<EditableDocMember, string> = {
  "welcome-htm": "source/welcome/welcome.htm",
  "readme-htm": "source/readme.htm",
  "readme-md": "README.md",
  "help-php": `source/help/${ID}.php`,
};
const ORIGINAL: Record<EditableDocMember, string> = {
  "welcome-htm": "<html><body><p>Welcome file.</p></body></html>",
  "readme-htm": "<html><body><p>Details file.</p></body></html>",
  "readme-md": "# Tiny\n\nReadme file.\n",
  "help-php": "<?php $pagename = 'tiny'; ?>\n<p>Help file.</p>\n",
};
const MEMBERS = Object.keys(PATHS) as EditableDocMember[];

function open(mode: "open" | "copy" = "open"): void {
  const vfs = createVirtualFS([
    { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: KPS, isBinary: false },
    ...MEMBERS.map((m) => ({ path: PATHS[m], content: ORIGINAL[m], isBinary: false })),
  ]);
  const kb = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["bas"] } as StartKeyboard;
  clearOpenSession();
  useDecisionStore.getState().reset();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  const seed = { vfs, ir: parseKmn(KMN, ID).ir };
  if (mode === "open") wc.instantiateFromExisting(kb, seed);
  else wc.instantiateFromStart(kb, seed);
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}

const host: ApplyDocChange = (c) => Promise.resolve(applyOpenChange(c));
const commit = async (edits: Partial<Record<EditableDocMember, string>>, applyOnOpen: ApplyDocChange = host) => {
  const wc = useWorkingCopyStore.getState();
  const r = await commitDocPagesOnOpen({ edits, keyboardId: ID, startVfs: wc.startVfs, convention: wc.startWelcomeConvention, applyOnOpen });
  return r.written;
};
const fileNow = (m: EditableDocMember): string => readVfsText(useWorkingCopyStore.getState().startVfs!, PATHS[m])!;

describe("a documentation page on Open is written into its file", () => {
  for (const member of MEMBERS) {
    it(`${member}: editor seed, preview and download agree on the file (SC-010)`, async () => {
      open();
      const edited = `${ORIGINAL[member]}\nEDITED-${member}\n`;
      expect(await commit({ [member]: edited })).toEqual([member]);
      expect(fileNow(member)).toBe(edited);
      expect(useWorkingCopyStore.getState()[authoredField(member)]).toBeNull();
      const { result } = renderHook(() => useDocsPreview());
      expect(previewOf(result.current, member)).toBe(edited);
      const projected = await projectWorkingCopyForOutput();
      expect(readVfsText(projected!.vfs, PATHS[member])).toBe(edited);
    });
  }

  it("one undo record per page; undo restores the file", async () => {
    open();
    expect(await commit({ "welcome-htm": "<p>W2</p>", "readme-md": "R2" })).toEqual(["welcome-htm", "readme-md"]);
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.labelKey === "docs-edit")).toBe(true);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileNow("readme-md")).toBe(ORIGINAL["readme-md"]);
    expect(fileNow("welcome-htm")).toBe("<p>W2</p>");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(fileNow("welcome-htm")).toBe(ORIGINAL["welcome-htm"]);
  });

  it("an unchanged page writes nothing and records nothing", async () => {
    open();
    expect(await commit({ "welcome-htm": ORIGINAL["welcome-htm"] })).toEqual([]);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(useDecisionStore.getState().decisions["welcome-htm"]).toBeUndefined();
  });

  it("the welcome-htm decision holds only the page names", () => {
    open();
    completeHtmlStep({ welcomeHtm: "<p>W2</p>" });
    completeHtmlStep({ helpPhp: "<?php ?>\n<p>H2</p>" });
    const d = useDecisionStore.getState().decisions["welcome-htm"];
    expect(d?.value).toEqual({ pages: ["welcome-htm", "help-php"] });
    expect(JSON.stringify(d?.value)).not.toContain("W2");
    expect(useWorkingCopyStore.getState().authoredWelcomeHtm).toBeNull();
  });

  it("Copy keeps the held authored text and the full decision", () => {
    open("copy");
    completeHtmlStep({ welcomeHtm: "<p>W2</p>" });
    expect(useWorkingCopyStore.getState().authoredWelcomeHtm).toBe("<p>W2</p>");
    expect(useDecisionStore.getState().decisions["welcome-htm"]?.value).toEqual({ welcomeHtm: "<p>W2</p>" });
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});

describe("refusals, absent pages and the flat convention", () => {
  it("a refused write is reported, nothing is recorded, and the file is unchanged", async () => {
    open();
    const refuse: ApplyDocChange = () => Promise.resolve({ status: "failed", reason: "no" });
    const wc = useWorkingCopyStore.getState();
    const r = await commitDocPagesOnOpen({ edits: { "readme-md": "R2" }, keyboardId: ID, startVfs: wc.startVfs, convention: null, applyOnOpen: refuse });
    expect(r).toEqual({ written: [], refused: ["readme-md"] });
    expect(fileNow("readme-md")).toBe(ORIGINAL["readme-md"]);
    expect(useDecisionStore.getState().decisions["welcome-htm"]).toBeUndefined();
  });

  it("a page with no file is not created on Open", async () => {
    open();
    const vfs = useWorkingCopyStore.getState().startVfs!;
    const next = createVirtualFS(vfs.entries().filter((e) => e.path !== "source/readme.htm"));
    useWorkingCopyStore.setState({ startVfs: next });
    const seen: unknown[] = [];
    const spy: ApplyDocChange = (c) => {
      seen.push(c);
      return host(c);
    };
    const r = await commit({ "readme-htm": "<p>new</p>" }, spy);
    expect(r).toEqual([]);
    expect(seen).toEqual([]);
    expect(useWorkingCopyStore.getState().startVfs!.get("source/readme.htm")).toBeUndefined();
    expect(commitDocPagesThroughSeam({ edits: { "readme-htm": "x" }, keyboardId: ID, startVfs: next, convention: null }).written).toEqual([]);
  });

  it("a flat-convention welcome page is read and written at the flat path", async () => {
    open();
    const vfs = useWorkingCopyStore.getState().startVfs!;
    const flat = createVirtualFS(
      vfs.entries().map((e) => (e.path === "source/welcome/welcome.htm" ? { ...e, path: "source/welcome.htm" } : e)),
    );
    useWorkingCopyStore.setState({ startVfs: flat, startWelcomeConvention: "flat" });
    expect(openDocPath("welcome-htm", ID, flat, "flat")).toBe("source/welcome.htm");
    expect(await commit({ "welcome-htm": "<p>flat</p>" })).toEqual(["welcome-htm"]);
    const after = useWorkingCopyStore.getState().startVfs!;
    expect(readVfsText(after, "source/welcome.htm")).toBe("<p>flat</p>");
    expect(after.get("source/welcome/welcome.htm")).toBeUndefined();
    const { result } = renderHook(() => useDocsPreview());
    expect(result.current.welcomeHtm).toBe("<p>flat</p>");
    const projected = await projectWorkingCopyForOutput();
    expect(readVfsText(projected!.vfs, "source/welcome.htm")).toBe("<p>flat</p>");
  });
});

function authoredField(m: EditableDocMember) {
  return ({ "welcome-htm": "authoredWelcomeHtm", "readme-htm": "authoredReadmeHtm", "readme-md": "authoredReadmeMd", "help-php": "authoredHelpPhp" } as const)[m];
}
function previewOf(p: ReturnType<typeof useDocsPreview>, m: EditableDocMember): string {
  return ({ "welcome-htm": p.welcomeHtm, "readme-htm": p.readmeHtm, "readme-md": p.readmeMd, "help-php": p.helpPhp })[m];
}
