// A documentation page the opened keyboard lacks is offered as a "create" suggested fix
// (spec 111 "live files", FR-029/FR-041/FR-047, ruling 2026-11-16): accepting writes the
// page and its descriptor entry as one change (one undo record), undo restores both
// byte-for-byte, SC-010 holds for the page and the .kps, and the created page is then
// like any other (regeneration fixes, no longer a help gap). Copy is unchanged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { createVirtualFS, type StartKeyboard, type VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useDocsPreview } from "../hooks/useDocsPreview.ts";
import { useDocCreateFixes } from "../hooks/useDocCreateFixes.ts";
import { useDocRegenerationFixes } from "../hooks/useDocRegenerationFixes.ts";
import { OpenApplyHost, useApplyOnOpen, type ApplyOnOpen } from "../components/OpenApplyHost.tsx";
import { CriteriaScreen } from "../components/CriteriaScreen.tsx";
import { OpenUndoButton } from "../components/OpenUndoButton.tsx";
import { undoLastOpenApply } from "./openApply.ts";
import { applyDocCreate, docCreateFix, planDocCreate } from "./docCreateFix.ts";
import { docRegenerationFixes } from "./docRegenerationFix.ts";
import { deriveOpenHelpGaps } from "./openHelpGaps.ts";
import { readOpenDocText } from "./docsOpenCommit.ts";
import { readVfsText } from "./vfsText.ts";
import { expectSc010 } from "../test/openSc010.ts";

vi.mock("../hooks/usePreviewArtifact.ts", () => ({ usePreviewArtifact: () => ({ stage: { kind: "ready", keyboardId: "tiny" } }) }));
vi.mock("../hooks/useAuthoredCriteria.ts", () => ({ useAuthoredCriteria: () => ({ rows: [] }) }));
vi.mock("../hooks/useOpenRatchet.ts", () => ({ useOpenRatchet: () => null }));
vi.mock("../hooks/usePublishStepNav.ts", async (orig) => ({ ...(await orig<object>()), usePublishStepNav: () => {} }));
vi.mock("../criteria/CriteriaPage.tsx", () => ({ CriteriaPage: () => null }));
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
  getPatternByIdSync: () => undefined,
}));

const ID = "tiny";
const KPS_PATH = `source/${ID}.kps`;
const KMN = ["store(&NAME) 'Tiny'", "store(&VERSION) '10.0'", "", "begin Unicode > use(main)", "", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\n");
const KB = { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard;

const CRLF = "\r\n";
const file = (name: string, ext: string, description = ""): string =>
  [`    <File>`, `      <Name>${name}</Name>`, `      <Description>${description}</Description>`, `      <CopyLocation>0</CopyLocation>`, `      <FileType>${ext}</FileType>`, `    </File>`, ""].join(CRLF);
// A descriptor with a BOM, CRLF line endings and no documentation pages listed.
const KPS = `﻿${[
  `<?xml version="1.0" encoding="utf-8"?>`,
  `<Package>`,
  `  <Options>`,
  `    <LicenseFile>..\\LICENSE.md</LicenseFile>`,
  `    <FollowKeyboardVersion/>`,
  `  </Options>`,
  `  <Info>`,
  `    <Name URL="">Tiny</Name>`,
  `  </Info>`,
  `  <Files>`,
  ``,
].join(CRLF)}${file("..\\build\\tiny.kmx", ".kmx")}  </Files>${CRLF}</Package>${CRLF}`;

interface Case {
  label: string;
  member: "welcome-htm" | "readme-htm" | "readme-md" | "help-php";
  convention: "folder" | "flat" | null;
  path: string;
  ref: string;
  /** Pages that ship in a package are listed in the descriptor; the others are only created. */
  listed: boolean;
}
const CASES: Case[] = [
  { label: "welcome page, folder convention", member: "welcome-htm", convention: "folder", path: "source/welcome/welcome.htm", ref: "welcome\\welcome.htm", listed: true },
  { label: "welcome page, flat convention", member: "welcome-htm", convention: "flat", path: "source/welcome.htm", ref: "welcome.htm", listed: true },
  { label: "readme.htm", member: "readme-htm", convention: null, path: "source/readme.htm", ref: "readme.htm", listed: true },
  { label: "README.md", member: "readme-md", convention: null, path: "README.md", ref: "..\\README.md", listed: false },
  { label: "help page", member: "help-php", convention: null, path: `source/help/${ID}.php`, ref: `help\\${ID}.php`, listed: false },
];

let fetched: VirtualFS;
function open(mode: "open" | "copy" = "open", convention: "folder" | "flat" | null = null): void {
  const entries = [
    { path: `source/${ID}.kmn`, content: KMN, isBinary: false },
    { path: KPS_PATH, content: KPS, isBinary: false },
  ];
  fetched = createVirtualFS(entries);
  clearOpenSession();
  useDecisionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  const seed = { vfs: createVirtualFS(entries), ir: parseKmn(KMN, ID).ir };
  if (mode === "open") wc.instantiateFromExisting(KB, seed);
  else wc.instantiateFromStart(KB, seed);
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
  wc.setStartWelcomeConvention(convention);
}

const vfsNow = (): VirtualFS => useWorkingCopyStore.getState().startVfs!;
const textNow = (path: string): string | undefined => readVfsText(vfsNow(), path);
const fixFor = (member: string) => renderHook(() => useDocCreateFixes()).result.current.find((f) => f.id.startsWith(`docs:create:${member}:`));

let apply: ApplyOnOpen;
function Probe() {
  apply = useApplyOnOpen();
  return null;
}
function mount() {
  render(
    <I18nProvider i18n={i18n}>
      <OpenApplyHost><Probe /></OpenApplyHost>
    </I18nProvider>,
  );
}

const realReplace = useWorkingCopyStore.getState().replaceStartingPointFiles;
beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
});
afterEach(() => {
  cleanup();
  useWorkingCopyStore.setState({ replaceStartingPointFiles: realReplace });
});

describe("creating a missing documentation page on Open", () => {
  it("offers one create fix per absent page, with the page and the descriptor in the preview", () => {
    open();
    const fixes = renderHook(() => useDocCreateFixes()).result.current;
    expect(fixes.map((f) => f.action?.subject).sort()).toEqual(["help-php", "readme-htm", "readme-md", "welcome-htm"]);
    for (const f of fixes) {
      expect(f.kind).toBe("docs");
      expect(f.preview[0]!.before).toBe("");
      expect(f.preview[0]!.after).not.toBe("");
      // Only the pages that ship in a package change the descriptor.
      expect(f.preview.map((p) => p.file).includes(KPS_PATH)).toBe(f.action?.subject === "welcome-htm" || f.action?.subject === "readme-htm");
    }
    // Each is also what the Help step reports as a gap.
    expect([...deriveOpenHelpGaps({ vfs: vfsNow(), keyboardId: ID, baselineFindings: null })]).toEqual(expect.arrayContaining(["welcome-htm", "readme-htm", "readme-md", "help-php"]));
  });

  for (const c of CASES) {
    it(`${c.label}: writes the page and the descriptor entry as one undo record; undo is byte-identical; SC-010`, async () => {
      open("open", c.convention);
      mount();
      const fix = fixFor(c.member)!;
      expect(fix, "a create fix is offered").toBeDefined();
      expect(fix.preview[0]!.file).toBe(c.path);
      const kpsBefore = textNow(KPS_PATH)!;
      const recordsBefore = useOpenUndoStore.getState().records.length;

      let ok = false;
      await act(async () => {
        ok = await applyDocCreate(fix, apply);
      });
      expect(ok).toBe(true);

      // The page holds the generated text; the descriptor lists it in its own shape.
      expect(textNow(c.path)).toBe(fix.preview[0]!.after);
      const kpsAfter = textNow(KPS_PATH)!;
      expect(kpsAfter.startsWith("﻿")).toBe(true);
      if (!c.listed) expect(kpsAfter).toBe(kpsBefore);
      else {
        const withEntry = kpsBefore.replace(`  </Files>`, `${file(c.ref, c.path.slice(c.path.lastIndexOf(".")), `File ${c.ref.slice(c.ref.lastIndexOf("\\") + 1)}`)}  </Files>`);
        const license = `    <LicenseFile>..\\LICENSE.md</LicenseFile>`;
        expect(kpsAfter).toBe(
          c.member === "welcome-htm"
            ? withEntry.replace(license, `${license}${CRLF}    <WelcomeFile>${c.ref}</WelcomeFile>`)
            : withEntry.replace(license, `    <ReadMeFile>${c.ref}</ReadMeFile>${CRLF}${license}`),
        );
      }
      // One change, one undo record, worded for the creation.
      const records = useOpenUndoStore.getState().records;
      expect(records).toHaveLength(recordsBefore + 1);
      expect(records.at(-1)!.labelKey).toBe("docs-create");
      expect(Object.keys(records.at(-1)!.files).sort()).toEqual((c.listed ? [KPS_PATH, c.path] : [c.path]).sort());

      // The editor's file, the preview and the download agree on the page and the descriptor.
      await expectSc010({ fetched, id: ID }, [c.path, KPS_PATH], `create ${c.label}`);
      expect(readOpenDocText(c.member, ID, vfsNow(), c.convention)).toBe(fix.preview[0]!.after);

      // Created, so no longer offered or reported, and edited like any other page (FR-047).
      expect(fixFor(c.member)).toBeUndefined();
      expect(deriveOpenHelpGaps({ vfs: vfsNow(), keyboardId: ID, baselineFindings: null }).has(c.member)).toBe(false);
      expect(renderHook(() => useDocRegenerationFixes()).result.current.some((f) => f.id.startsWith(`docs:regenerate:${c.member}:`))).toBe(false);

      // Undo removes the page and restores the descriptor byte-for-byte.
      expect(undoLastOpenApply().ok).toBe(true);
      expect(vfsNow().get(c.path)).toBeUndefined();
      expect(textNow(KPS_PATH)).toBe(kpsBefore);
      expect(fixFor(c.member)).toBeDefined();
      await expectSc010({ fetched, id: ID }, [c.path, KPS_PATH], `undo create ${c.label}`);
    });
  }

  for (const member of ["welcome-htm", "help-php"] as const) {
    it(`${member}: the created page marks its generated sections, so reopening and regenerating changes nothing and never duplicates`, async () => {
      open();
      mount();
      const create = fixFor(member)!;
      expect(create.preview[0]!.after.split("ks:generated:start")).toHaveLength(2);
      await act(async () => {
        await applyDocCreate(create, apply);
      });
      const path = create.preview[0]!.file;
      const created = textNow(path)!;
      // Reopen: the file is now the start text, so the render is the inherited one.
      const wc = useWorkingCopyStore.getState();
      if (member === "welcome-htm") wc.setStartWelcomeHtmText(created);
      else wc.setStartHelpPhpText(created);
      const { result } = renderHook(() => ({ regen: useDocRegenerationFixes(), preview: useDocsPreview() }));
      expect(result.current.regen.filter((f) => f.id.startsWith(`docs:regenerate:${member}:`))).toEqual([]);
      // Even if a regeneration were applied, the generated text stays once.
      const rendered = member === "welcome-htm" ? result.current.preview.generated.welcomeHtm : result.current.preview.generated.helpPhp;
      const applied = docRegenerationFixes({ vfs: vfsNow(), keyboardId: ID, rendered: { [member]: rendered } });
      const finalText = applied[0]?.preview[0]!.after ?? created;
      expect(finalText.split("Characters on This Keyboard")).toHaveLength(created.split("Characters on This Keyboard").length);
    });
  }

  it("a failed apply writes nothing and the fix stays on offer", async () => {
    open();
    mount();
    const fix = fixFor("readme-htm")!;
    const kpsBefore = textNow(KPS_PATH);
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    let ok = true;
    await act(async () => {
      ok = await applyDocCreate(fix, apply);
    });
    expect(ok).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("could not be applied");
    expect(vfsNow().get("source/readme.htm")).toBeUndefined();
    expect(textNow(KPS_PATH)).toBe(kpsBefore);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(fixFor("readme-htm")).toBeDefined();
  });

  it("a page that appeared, or a descriptor that changed, after the preview is left alone", async () => {
    open();
    mount();
    const fix = fixFor("readme-md")!;
    useWorkingCopyStore.getState().replaceStartingPointFromText("README.md", "Mine.");
    let ok = true;
    await act(async () => {
      ok = await applyDocCreate(fix, apply);
    });
    expect(ok).toBe(false);
    expect(textNow("README.md")).toBe("Mine.");
    expect(useOpenUndoStore.getState().records).toHaveLength(0);

    const other = fixFor("readme-htm")!;
    useWorkingCopyStore.getState().replaceStartingPointFromText(KPS_PATH, `${textNow(KPS_PATH)}<!-- changed -->`);
    await act(async () => {
      ok = await applyDocCreate(other, apply);
    });
    expect(ok).toBe(false);
    expect(vfsNow().get("source/readme.htm")).toBeUndefined();
  });

  it("with no apply host nothing is written; a descriptor with no <Files> block still creates the page", async () => {
    open();
    expect(await applyDocCreate(fixFor("readme-md")!)).toBe(false);
    expect(vfsNow().get("README.md")).toBeUndefined();

    const bare = createVirtualFS([{ path: KPS_PATH, content: "<Package/>", isBinary: false }]);
    const readme = docCreateFix({ member: "readme-md", keyboardId: ID, vfs: bare, convention: null, generated: "# T\n" })!;
    expect(readme.preview.map((p) => p.file)).toEqual(["README.md"]);
  });

  it("a descriptor that cannot list the page withholds the fix and names the reason", () => {
    const base = (kps: string) => ({ member: "welcome-htm" as const, keyboardId: ID, vfs: createVirtualFS([{ path: KPS_PATH, content: kps, isBinary: false }]), convention: null, generated: "<p>x</p>" });
    const noFiles = planDocCreate(base("<Package><Options><WelcomeFile></WelcomeFile></Options></Package>"));
    expect(noFiles.fix).toBeNull();
    expect(noFiles.blocked!.reason).toBe("no <Files> block");
    const other = planDocCreate(base("<Package><Options><WelcomeFile>other.htm</WelcomeFile></Options><Files/></Package>"));
    expect(other.fix).toBeNull();
    expect(other.blocked!.reason).toBe("<WelcomeFile> already names other.htm");
  });

  it("the fix id follows the proposal", () => {
    const vfs = createVirtualFS([{ path: KPS_PATH, content: KPS, isBinary: false }]);
    const make = (generated: string) => docCreateFix({ member: "readme-md", keyboardId: ID, vfs, convention: null, generated })!;
    expect(make("a").id).toBe(make("a").id);
    expect(make("a").id).not.toBe(make("b").id);
  });

  it("Copy is unchanged: no create fixes and no write path", async () => {
    open("copy");
    expect(renderHook(() => useDocCreateFixes()).result.current).toEqual([]);
    const fix = docCreateFix({ member: "readme-md", keyboardId: ID, vfs: vfsNow(), convention: null, generated: "# T\n" })!;
    let called = false;
    expect(await applyDocCreate(fix, () => { called = true; return Promise.resolve({ status: "unchanged" }); })).toBe(false);
    expect(called).toBe(false);
    expect(vfsNow().get("README.md")).toBeUndefined();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});

describe("the Criteria screen's create fixes", () => {
  function mountScreen() {
    render(
      <I18nProvider i18n={i18n}>
        <OpenApplyHost><Probe /><CriteriaScreen /><OpenUndoButton /></OpenApplyHost>
      </I18nProvider>,
    );
  }
  const items = () => screen.queryAllByTestId("suggested-fix").filter((li) => /Create source\/readme\.htm/.test(li.textContent ?? ""));
  const acceptedCreates = () =>
    useDecisionLogStore.getState().record.entries.filter((e) => e.payload.kind === "decision" && e.payload.decisionId.startsWith("suggestion:docs:create:") && JSON.stringify(e.payload.value).includes("accepted"));

  it("accept creates the page, the fix is not shown again, and undo offers it again", async () => {
    open();
    mountScreen();
    expect(items()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Accept: Create source\/readme\.htm/ }));
    });
    expect(textNow("source/readme.htm")).toBeDefined();
    expect(acceptedCreates()).toHaveLength(1);
    expect(items()).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Undo: created documentation page/ }));
    });
    expect(vfsNow().get("source/readme.htm")).toBeUndefined();
    expect(items()).toHaveLength(1);
  });

  it("a failed apply leaves the fix visible and records no acceptance", async () => {
    open();
    mountScreen();
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Accept: Create source\/readme\.htm/ }));
    });
    expect(vfsNow().get("source/readme.htm")).toBeUndefined();
    expect(acceptedCreates()).toHaveLength(0);
    expect(items()).toHaveLength(1);
  });
});

describe("the Criteria screen shows why a blocked page is not offered", () => {
  it("lists the page and the reason where the fix would be, and offers no fix for it", () => {
    open();
    // A descriptor that already names another welcome file: the welcome page cannot be listed.
    useWorkingCopyStore.getState().replaceStartingPointFromText(KPS_PATH, KPS.replace("<FollowKeyboardVersion/>", "<WelcomeFile>other.htm</WelcomeFile>\r\n    <FollowKeyboardVersion/>"));
    render(
      <I18nProvider i18n={i18n}>
        <OpenApplyHost><Probe /><CriteriaScreen /></OpenApplyHost>
      </I18nProvider>,
    );
    expect(screen.getByTestId("criteria-doc-create-blocked").textContent).toContain("source/welcome/welcome.htm");
    expect(screen.getByTestId("criteria-doc-create-blocked").textContent).toContain("already names other.htm");
    expect(screen.queryAllByTestId("suggested-fix").some((li) => /Create source\/welcome\/welcome\.htm/.test(li.textContent ?? ""))).toBe(false);
  });
});
