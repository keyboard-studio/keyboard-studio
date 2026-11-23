// The copyright holder and the project link on Open are live writes (spec 111
// FR-041/FR-042/FR-012, SC-010 for the .kmn and .kps): one files change and one
// undo record per answer, preview and download read the same files, off Open the
// answers stay overlays.

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { undoLastOpenApply } from "./openApply.ts";
import { journalDecisionWrite } from "./decisionJournal.ts";
import { applyPatchToWorkingCopy } from "./applyPatchToWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";
import { buildOpenIdentityChange, commitOpenProjectLink, openNoticeFor } from "./openIdentityCommit.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KPS_PATH = `source/${ID}.kps`;
const KMN = [
  "﻿store(&NAME) 'Tiny'",
  "store(&COPYRIGHT) '(c) Old Holder'",
  "store(&VERSION) '10.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "",
].join("\r\n");
const KPS = [
  "﻿<Package>\r\n",
  "  <Info>\r\n    <Name URL=\"\">Tiny</Name>\r\n    <Copyright URL=\"\">(c) Old Holder</Copyright>\r\n",
  "    <WebSite URL=\"https://old.example\">https://old.example</WebSite>\r\n",
  "    <Description URL=\"\">Mine.</Description>\r\n  </Info>\r\n",
  "  <Keyboards>\r\n    <Keyboard>\r\n      <Name>Tiny</Name>\r\n      <Version>1.0</Version>\r\n",
  "      <Languages>\r\n        <Language ID=\"bas\">Basaa</Language>\r\n      </Languages>\r\n",
  "    </Keyboard>\r\n  </Keyboards>\r\n</Package>\r\n",
].join("");

const withoutVersion = (s: string): string =>
  s.replace(/<Version[^>]*>[^<]*<\/Version>/g, "<Version/>").split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

function open(mode: "open" | "copy" = "open", kps: string | Uint8Array = KPS): void {
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: KPS_PATH, content: kps, isBinary: typeof kps !== "string" },
  ]);
  const kb = {
    id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
    displayName: "Tiny", version: "1.0", languages: ["bas"],
  } as StartKeyboard;
  clearOpenSession();
  useDecisionStore.getState().reset?.();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  const seed = { vfs, ir: parseKmn(KMN, ID).ir };
  if (mode === "open") wc.instantiateFromExisting(kb, seed);
  else wc.instantiateFromStart(kb, seed);
  wc.setFallbackPolicy("pass-through");
}

const read = (path: string): string => readVfsText(useWorkingCopyStore.getState().startVfs!, path)!;
const holder = (copyrightHolder: string) => ({ attribution: { authorName: "Author", copyrightHolder } });
const answerLink = (url: string, provenance: "asked" | "extracted" = "asked") => {
  useDecisionStore.getState().record({ id: "help-project-url", value: url, provenance });
  return commitOpenProjectLink();
};

describe("copyright holder on Open writes the .kmn and .kps now", () => {
  it("one change, one undo record; only the two notice lines change; undo is byte-identical", () => {
    open();
    const result = applyPatchToWorkingCopy(holder("New Holder"), []);
    expect(result?.status).toBe("applied");
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.labelKey).toBe("copyright");
    expect(read(KMN_PATH)).toBe(KMN.replace("'(c) Old Holder'", `'(c) New Holder'`));
    expect(read(KPS_PATH)).toBe(KPS.replace("(c) Old Holder", `(c) New Holder`));
    expect(read(KMN_PATH).startsWith("﻿")).toBe(true);
    expect(useWorkingCopyStore.getState().attribution?.copyrightHolder).toBe("New Holder");
    expect(undoLastOpenApply().ok).toBe(true);
    expect(read(KMN_PATH)).toBe(KMN);
    expect(read(KPS_PATH)).toBe(KPS);
  });

  it("a holder the files already name changes nothing and records no undo step", () => {
    open();
    expect(applyPatchToWorkingCopy(holder("Old Holder"), [])?.status).toBe("unchanged");
    expect(read(KMN_PATH)).toBe(KMN);
    expect(read(KPS_PATH)).toBe(KPS);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("inserts the store when the .kmn has none, at the conventional place", () => {
    open();
    const noStore = KMN.replace("store(&COPYRIGHT) '(c) Old Holder'\r\n", "");
    const vfs = useWorkingCopyStore.getState().startVfs!;
    vfs.set(KMN_PATH, noStore);
    applyPatchToWorkingCopy(holder("New Holder"), []);
    expect(read(KMN_PATH).split("\r\n").slice(0, 3)).toEqual([
      "﻿store(&NAME) 'Tiny'",
      `store(&COPYRIGHT) 'Copyright © New Holder'`,
      "store(&VERSION) '10.0'",
    ]);
  });

  it("leaves LICENSE.md as it is and keeps the other .kps content", () => {
    open();
    useWorkingCopyStore.getState().startVfs!.set("LICENSE.md", "MIT (c) Old Holder");
    applyPatchToWorkingCopy(holder("New Holder"), []);
    expect(read("LICENSE.md")).toBe("MIT (c) Old Holder");
    expect(read(KPS_PATH)).toContain("<WebSite URL=\"https://old.example\">");
    expect(read(KPS_PATH)).toContain("<Language ID=\"bas\">Basaa</Language>");
  });

  it("preview and download read the written files, apart from the version", async () => {
    open();
    applyPatchToWorkingCopy(holder("New Holder"), []);
    const { result } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ID }));
    const fetched = createVirtualFS([
      { path: KMN_PATH, content: KMN, isBinary: false },
      { path: KPS_PATH, content: KPS, isBinary: false },
    ]);
    result.current!(fetched, ID);
    const projected = await projectWorkingCopyForOutput();
    for (const path of [KMN_PATH, KPS_PATH]) {
      expect(withoutVersion(readVfsText(fetched, path)!)).toBe(withoutVersion(read(path)));
      expect(withoutVersion(String(projected?.vfs.get(path)?.content))).toBe(withoutVersion(read(path)));
    }
  });

  it("Copy keeps the overlay and writes no file", () => {
    open("copy");
    expect(applyPatchToWorkingCopy(holder("New Holder"), [])).toBeUndefined();
    expect(read(KMN_PATH)).toBe(KMN);
    expect(read(KPS_PATH)).toBe(KPS);
    expect(useWorkingCopyStore.getState().attribution?.copyrightHolder).toBe("New Holder");
  });

  it("with no readable .kps nothing is written or recorded, and the overlay is not kept", () => {
    open("open", new Uint8Array([1, 2, 3]));
    const result = applyPatchToWorkingCopy(holder("New Holder"), []);
    expect(result?.status).toBe("failed");
    expect(read(KMN_PATH)).toBe(KMN);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(useWorkingCopyStore.getState().attribution).toBeNull();
  });
});

describe("project link on Open writes the .kps <WebSite> now", () => {
  it("sets it in place with one undo record, and undo is byte-identical", () => {
    open();
    expect(answerLink("https://new.example")?.status).toBe("applied");
    expect(useOpenUndoStore.getState().records[0]?.labelKey).toBe("project-link");
    expect(read(KPS_PATH)).toBe(KPS.replaceAll("https://old.example", "https://new.example"));
    expect(read(KMN_PATH)).toBe(KMN);
    expect(undoLastOpenApply().ok).toBe(true);
    expect(read(KPS_PATH)).toBe(KPS);
  });

  it("clearing the link removes the element; undo puts it back", () => {
    open();
    expect(answerLink("")?.status).toBe("applied");
    expect(read(KPS_PATH)).toBe(KPS.replace(/    <WebSite[^\r]*\r\n/, ""));
    expect(undoLastOpenApply().ok).toBe(true);
    expect(read(KPS_PATH)).toBe(KPS);
  });

  it("an unchanged link, or a proposal the author never confirmed, leaves the descriptor alone", () => {
    open();
    expect(answerLink("https://old.example")?.status).toBe("unchanged");
    useDecisionStore.getState().reset?.();
    expect(commitOpenProjectLink()).toBeUndefined();
    expect(answerLink("https://proposal.example", "extracted")).toBeUndefined();
    expect(answerLink("", "extracted")).toBeUndefined();
    expect(read(KPS_PATH)).toBe(KPS);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("is written from its own decision, with no help-docs patch (a blank welcome paragraph)", () => {
    open();
    expect(useWorkingCopyStore.getState().helpDocs).toBeNull();
    expect(answerLink("https://new.example\nhttps://new.example/help")?.status).toBe("applied");
    expect(read(KPS_PATH)).toBe(KPS.replaceAll("https://old.example", "https://new.example"));
  });

  it("preview and download read the written .kps, apart from the version", async () => {
    open();
    answerLink("https://new.example");
    const projected = await projectWorkingCopyForOutput();
    expect(withoutVersion(String(projected?.vfs.get(KPS_PATH)?.content))).toBe(withoutVersion(read(KPS_PATH)));
  });

  it("Copy keeps the overlay (through the help-docs patch) and writes no file", () => {
    open("copy");
    expect(applyPatchToWorkingCopy({ helpDocs: { description: "d", usageTips: [], projectHomeUrl: "https://new.example" } }, [])).toBeUndefined();
    expect(commitOpenProjectLink()).toBeUndefined();
    expect(read(KPS_PATH)).toBe(KPS);
    expect(useWorkingCopyStore.getState().helpDocs?.projectHomeUrl).toBe("https://new.example");
  });

  it("a failed write takes back the link decision and drops only the link from the help-docs overlay", () => {
    open("open", new Uint8Array([1, 2, 3]));
    applyPatchToWorkingCopy(
      { helpDocs: { description: "d", usageTips: ["t"], credits: "c", projectHomeUrl: "https://new.example", projectHelpUrl: "https://new.example/h" } },
      [],
    );
    journalDecisionWrite(["help-project-url"]);
    expect(answerLink("https://new.example")?.status).toBe("failed");
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(useDecisionStore.getState().decisions["help-project-url"]).toBeUndefined();
    const help = useWorkingCopyStore.getState().helpDocs;
    expect(help).toMatchObject({ description: "d", usageTips: ["t"], credits: "c" });
    expect(help?.projectHomeUrl).toBeUndefined();
    expect(help?.projectHelpUrl).toBeUndefined();
  });
});

describe("copyright notice years on Open (injectable now)", () => {
  const NOW = new Date("2026-06-01T00:00:00Z");
  const notice = (existing: string | undefined) => openNoticeFor(existing, "New Holder", "Copyright © New Holder", NOW);

  it("keeps the start year and extends the end to the current year", () => {
    expect(notice("© 2017-2025 Old")).toBe("© 2017-2026 New Holder");
    expect(notice("© 2017 Old")).toBe("© 2017-2026 New Holder");
    expect(notice("Copyright © 2017–2025 Old")).toBe("Copyright © 2017–2026 New Holder");
    expect(notice("© 2026 Old")).toBe("© 2026 New Holder");
  });

  it("keeps the file's prefix style and a year-less notice year-less", () => {
    expect(notice("© Old")).toBe("© New Holder");
    expect(notice("Copyright © Old")).toBe("Copyright © New Holder");
    expect(notice("(c) 2020 Old")).toBe("(c) 2020-2026 New Holder");
    expect(notice("Old")).toBe("New Holder");
  });

  it("leaves a notice that already names the holder (whole words, normalised), and falls back when there is none", () => {
    expect(notice("© 2017-2025 NEW  holder.")).toBeUndefined();
    expect(notice("© 2017 New Holders Inc")).toBe("© 2017-2026 New Holder");
    expect(notice(undefined)).toBe("Copyright © New Holder");
  });

  it("is decided per file: the .kmn and .kps can carry different notices", () => {
    open();
    const vfs = useWorkingCopyStore.getState().startVfs!;
    vfs.set(KMN_PATH, KMN.replace("'(c) Old Holder'", "'© 2017-2025 Old Holder'"));
    vfs.set(KPS_PATH, KPS.replace("(c) Old Holder", "© 2020 Old Holder"));
    const built = buildOpenIdentityChange({ holder: "New Holder", fallbackNotice: "x" }, NOW);
    if (!("change" in built) || built.change.kind !== "files") throw new Error("expected a files change");
    expect(built.change.files[KMN_PATH]).toContain("store(&COPYRIGHT) '© 2017-2026 New Holder'");
    expect(built.change.files[KPS_PATH]).toContain("<Copyright URL=\"\">© 2020-2026 New Holder</Copyright>");
  });

  it("reads a double-quoted .kmn store, and keeps the descriptor change when the .kmn is missing", () => {
    open();
    const vfs = useWorkingCopyStore.getState().startVfs!;
    vfs.set(KMN_PATH, KMN.replace("'(c) Old Holder'", "\"© 2017 Old Holder\""));
    const built = buildOpenIdentityChange({ holder: "New Holder", fallbackNotice: "x" }, NOW);
    if (!("change" in built) || built.change.kind !== "files") throw new Error("expected a files change");
    expect(built.change.files[KMN_PATH]).toContain("store(&COPYRIGHT) '© 2017-2026 New Holder'");
    vfs.delete(KMN_PATH);
    const noKmn = buildOpenIdentityChange({ holder: "New Holder", fallbackNotice: "x" }, NOW);
    if (!("change" in noKmn) || noKmn.change.kind !== "files") throw new Error("expected a files change");
    expect(Object.keys(noKmn.change.files)).toEqual([KPS_PATH]);
  });

  it("names the real cause when the descriptor cannot take the write", () => {
    open("open", "<Package/>");
    const built = buildOpenIdentityChange({ websiteUrl: "https://x.example" }, NOW);
    expect("reason" in built && built.reason).toContain("<Info>");
  });
});
