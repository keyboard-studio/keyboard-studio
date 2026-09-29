// End-to-end serialization regression for issue #1803.
//
// Unlike serializeWorkingCopy.test.ts (which mocks projectWorkingCopyVfs),
// this file exercises the REAL projection: a group-level carve is serialized
// through serializeWorkingCopy, and the test asserts on the `.kvks` INSIDE
// the output bundle (the VFS handed to the zip service) — the `.kvks` the
// author actually downloads must match the `.kmn` it ships with.
//
// AC#4: a letter removal covered end-to-end through serialization, asserting
// the .kvks in the output bundle.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeBaseKeyboard } from "@keyboard-studio/contracts/fixtures";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { serializeWorkingCopy } from "./serializeWorkingCopy.ts";
import type { VirtualFS } from "@keyboard-studio/contracts";

// Capture the projected VFS the serializer hands to the zip service — that
// VFS *is* the output bundle.
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
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "",
  "group(extra) using keys",
  "+ [K_Q] > 'q'",
  "+ [SHIFT K_Q] > 'Q'",
  "",
].join("\n");

const KVKS = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
<key vkey="K_Q">q</key>
</layer>
<layer shift="S">
<key vkey="K_Q">Q</key>
</layer>
</encoding>
</visualkeyboard>`;

describe("serializeWorkingCopy — carved keycaps in the output bundle (#1803)", () => {
  beforeEach(() => {
    capturedVfs = null;
    useWorkingCopyStore.getState().reset();
  });

  it("a group-level carve blanks its keycaps in the bundled .kvks on every layer, matching the bundled .kmn", async () => {
    const { ir } = parseKmn(KMN, "test_kb");
    const vfs = createVirtualFS([
      { path: "source/test_kb.kmn", content: KMN, isBinary: false },
      { path: "source/test_kb.kvks", content: KVKS, isBinary: false },
    ]);
    const base = makeBaseKeyboard({
      id: "test_kb",
      path: "release/test/test_kb",
      script: "Latn",
      targets: ["windows"],
      displayName: "Test KB",
      version: "1.0",
      sourceUrl: "https://example.invalid/test_kb",
      languages: ["en"],
    });
    useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir });
    const extraGroup = ir.groups.find((g) => g.name === "extra");
    if (extraGroup === undefined) throw new Error("fixture group 'extra' not found");
    useWorkingCopyStore.getState().deleteNode(extraGroup.nodeId);

    const result = await serializeWorkingCopy();

    expect(result).not.toBeNull();
    expect(capturedVfs).not.toBeNull();

    // The .kmn in the bundle lost the carved group's rules.
    const kmn = capturedVfs!.get("source/test_kb.kmn")?.content as string;
    expect(kmn).not.toContain("[K_Q]");
    expect(kmn).toContain("[K_A]");

    // The .kvks in the bundle blanks the carved keycaps on EVERY layer while
    // the kept keycap and the layer structure survive.
    const kvks = capturedVfs!.get("source/test_kb.kvks")?.content as string;
    expect(kvks).toContain('<key vkey="K_A">a</key>');
    expect(kvks).toContain('<key vkey="K_Q"></key>');
    expect(kvks).not.toContain(">q</key>");
    expect(kvks).not.toContain(">Q</key>");
    expect(kvks.match(/<layer\b/g)).toHaveLength(2);
  });
});
