// The shipped documentation describes the keyboard that ships.
//
// A removal (carve) is applied by projectWorkingCopyVfs, at output time; the
// store's working IR keeps the removed rules. The welcome page, the help page,
// the README facts and the layout charts must therefore be built from the
// PROJECTED model — otherwise they teach keys the shipped .kmn no longer has
// (found in a hand test: an Ewondo copy of Cameroon QWERTY whose welcome page
// listed "æ AltGr + f" after AltGr+f had been removed).
//
// Like serializeWorkingCopy.carve-keycaps.test.ts, this exercises the REAL
// projection and asserts on the bundle handed to the zip service.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeStartKeyboard } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { serializeWorkingCopy } from "./serializeWorkingCopy.ts";
import type { VirtualFS } from "@keyboard-studio/contracts";

let capturedVfs: VirtualFS | null = null;
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => async (vfs: VirtualFS) => {
    capturedVfs = vfs;
    return new Uint8Array([9, 9, 9]);
  }),
  getPatternLibraryService: vi.fn(() => ({ getById: vi.fn(async () => undefined) })),
}));

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&TARGETS) 'windows'",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [RALT K_F] > U+00E6",
  "+ [RALT K_N] > U+014B",
  "",
].join("\n");

const KVKS = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
</layer>
<layer shift="RA">
<key vkey="K_F">æ</key>
<key vkey="K_N">ŋ</key>
</layer>
</encoding>
</visualkeyboard>`;

function text(path: string): string {
  const entry = capturedVfs!.get(path);
  if (entry === undefined) throw new Error(`${path} is not in the bundle`);
  return entry.content as string;
}

describe("serializeWorkingCopy — shipped docs describe the projected keyboard", () => {
  beforeEach(async () => {
    capturedVfs = null;
    useWorkingCopyStore.getState().reset();
    const { ir } = parseKmn(KMN, "test_kb");
    const vfs = createVirtualFS([
      { path: "source/test_kb.kmn", content: KMN, isBinary: false },
      { path: "source/test_kb.kvks", content: KVKS, isBinary: false },
    ]);
    const base = makeStartKeyboard({
      id: "test_kb",
      path: "release/test/test_kb",
      script: "Latn",
      targets: ["windows"],
      displayName: "Test KB",
      version: "1.0",
      sourceUrl: "https://example.invalid/test_kb",
      languages: ["en"],
    });
    useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir });
    const aeRule = ir.groups
      .flatMap((g) => g.rules)
      .find((r) => r.output.some((o) => o.kind === "char" && o.value === "æ"));
    if (aeRule === undefined) throw new Error("fixture rule for æ not found");
    useWorkingCopyStore.getState().deleteNode(aeRule.nodeId);

    const result = await serializeWorkingCopy();
    expect(result).not.toBeNull();
    // Precondition: the projection really removed it from the shipped .kmn.
    expect(text("source/test_kb.kmn")).not.toMatch(/U\+00E6|æ/i);
  });

  it("the welcome page's typing guide omits the removed character and keeps the kept one", () => {
    const welcome = text("source/welcome/welcome.htm");
    expect(welcome).not.toContain("U+00E6");
    expect(welcome).toContain("U+014B");
  });

  it("the help page's typing guide omits the removed character", () => {
    const help = text("source/help/test_kb.php");
    expect(help).not.toContain("U+00E6");
    expect(help).toContain("U+014B");
  });

  it("README.md's character list omits the removed character", () => {
    const readme = text("README.md");
    const letters = readme.split("\n").find((l) => l.startsWith("- Letters:"));
    expect(letters).toBeDefined();
    expect(letters).not.toContain("æ");
    expect(letters).toContain("ŋ");
  });

  it("the desktop layout charts no longer show the removed character", () => {
    const charts = capturedVfs!
      .list()
      .filter((p) => /^source\/welcome\/ks-layout-desktop-.*\.svg$/.test(p));
    expect(charts.length).toBeGreaterThan(0);
    const svg = charts.map(text).join("\n");
    expect(svg).not.toContain("æ");
    expect(svg).toContain("ŋ");
  });
});

// ---------------------------------------------------------------------------
// Documentation-step overrides (specs/html-editor): an edit made on the
// Documentation step must survive into the serialized download — the defect
// PR #2481 shipped, where HtmlEditor's { html } landed nowhere. Untouched
// members keep exactly their generated text.
// ---------------------------------------------------------------------------

type AuthoredOverride = {
  authoredWelcomeHtm?: string;
  authoredReadmeHtm?: string;
  authoredReadmeMd?: string;
  authoredHelpPhp?: string;
};

async function runSerializeWithOverrides(track: "copy" | "adapt", authored: AuthoredOverride) {
  capturedVfs = null;
  useWorkingCopyStore.getState().reset();
  const { ir } = parseKmn(KMN, "test_kb");
  const vfs = createVirtualFS([
    { path: "source/test_kb.kmn", content: KMN, isBinary: false },
    { path: "source/test_kb.kvks", content: KVKS, isBinary: false },
  ]);
  const base = makeStartKeyboard({
    id: "test_kb",
    path: "release/test/test_kb",
    script: "Latn",
    targets: ["windows"],
    displayName: "Test KB",
    version: "1.0",
    sourceUrl: "https://example.invalid/test_kb",
    languages: ["en"],
  });
  if (track === "copy") {
    useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir });
  } else {
    useWorkingCopyStore.getState().instantiateFromExisting(base, { vfs, ir });
  }
  useWorkingCopyStore.setState({
    authoredWelcomeHtm: authored.authoredWelcomeHtm ?? null,
    authoredReadmeHtm: authored.authoredReadmeHtm ?? null,
    authoredReadmeMd: authored.authoredReadmeMd ?? null,
    authoredHelpPhp: authored.authoredHelpPhp ?? null,
  });
  const result = await serializeWorkingCopy();
  expect(result).not.toBeNull();
  return {
    welcome: text("source/welcome/welcome.htm"),
    readme: text("README.md"),
    readmeHtm: text("source/readme.htm"),
    help: text("source/help/test_kb.php"),
  };
}

describe("serializeWorkingCopy — Documentation step overrides survive into the download", () => {
  it.each(["copy", "adapt"] as const)(
    "an authored welcome edit ships on the %s track, untouched members stay generated",
    async (track) => {
      const baseline = await runSerializeWithOverrides(track, {});
      const edited = await runSerializeWithOverrides(track, {
        authoredWelcomeHtm:
          "<!DOCTYPE html><html><head><title>Test KB</title></head><body><p>AUTHORED-WELCOME-MARKER</p></body></html>",
      });
      expect(edited.welcome).toContain("AUTHORED-WELCOME-MARKER");
      expect(baseline.welcome).not.toContain("AUTHORED-WELCOME-MARKER");
      // Untouched members are byte-identical to the generated render.
      expect(edited.readme).toBe(baseline.readme);
      expect(edited.readmeHtm).toBe(baseline.readmeHtm);
      expect(edited.help).toBe(baseline.help);
    },
  );

  it("an authored README.md ships on the copy track instead of the regenerated one", async () => {
    const edited = await runSerializeWithOverrides("copy", {
      authoredReadmeMd: "# Test KB\n\nAUTHORED-README-MARKER\n",
    });
    expect(edited.readme).toContain("AUTHORED-README-MARKER");
    expect(edited.readme).not.toContain("- Letters:");
  });

  it("an authored help .php ships on the copy track instead of the regenerated one", async () => {
    const edited = await runSerializeWithOverrides("copy", {
      authoredHelpPhp: "<?php $pagename = 'test_kb'; ?>\n<p>AUTHORED-HELP-MARKER</p>\n",
    });
    expect(edited.help).toContain("AUTHORED-HELP-MARKER");
  });
});

// A flat-convention base (pre-076 `source/welcome.htm`): an authored welcome
// edit ships at the one path this production carries the page — the folder
// path on copy (FR-002 removes the flat copy), the carried flat file on Open
// (spec 111 FR-010 regenerates nothing) — and never at both.
// ---------------------------------------------------------------------------

const FLAT_KPS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  "  <Info>",
  '    <Name URL="">Test KB</Name>',
  '    <Version URL="">1.0</Version>',
  "  </Info>",
  "  <Files>",
  "    <File><Name>welcome.htm</Name></File>",
  "  </Files>",
  "</Package>",
  "",
].join("\n");

const FLAT_WELCOME = "<!DOCTYPE html><html><head><title>Test KB</title></head><body><p>CARRIED-FLAT</p></body></html>";
const AUTHORED_FLAT_WELCOME =
  "<!DOCTYPE html><html><head><title>Test KB</title></head><body><p>AUTHORED-WELCOME-MARKER</p></body></html>";

async function runFlatBase(track: "copy" | "open") {
  capturedVfs = null;
  useWorkingCopyStore.getState().reset();
  const { ir } = parseKmn(KMN, "test_kb");
  const vfs = createVirtualFS([
    { path: "source/test_kb.kmn", content: KMN, isBinary: false },
    { path: "source/test_kb.kvks", content: KVKS, isBinary: false },
    { path: "source/welcome.htm", content: FLAT_WELCOME, isBinary: false },
    ...(track === "open" ? [{ path: "source/test_kb.kps", content: FLAT_KPS, isBinary: false }] : []),
  ]);
  const base = makeStartKeyboard({
    id: "test_kb",
    path: "release/test/test_kb",
    script: "Latn",
    targets: ["windows"],
    displayName: "Test KB",
    version: "1.0",
    sourceUrl: "https://example.invalid/test_kb",
    languages: ["en"],
  });
  if (track === "copy") {
    useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir });
  } else {
    useWorkingCopyStore.getState().instantiateFromExisting(base, { vfs, ir });
  }
  useWorkingCopyStore.setState({ startWelcomeConvention: "flat", authoredWelcomeHtm: AUTHORED_FLAT_WELCOME });
  const result = await serializeWorkingCopy();
  expect(result).not.toBeNull();
  return capturedVfs!;
}

describe("serializeWorkingCopy — authored welcome on a flat-convention base", () => {
  it("copy: the edit ships at the folder path and the flat page is not in the output", async () => {
    const out = await runFlatBase("copy");
    expect(text("source/welcome/welcome.htm")).toContain("AUTHORED-WELCOME-MARKER");
    expect(out.get("source/welcome.htm")).toBeUndefined();
  });

  it("open: the edit replaces the carried flat page and no folder page is created", async () => {
    const out = await runFlatBase("open");
    expect(text("source/welcome.htm")).toContain("AUTHORED-WELCOME-MARKER");
    expect(text("source/welcome.htm")).not.toContain("CARRIED-FLAT");
    expect(out.get("source/welcome/welcome.htm")).toBeUndefined();
  });
});
