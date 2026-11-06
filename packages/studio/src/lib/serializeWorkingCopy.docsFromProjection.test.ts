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
