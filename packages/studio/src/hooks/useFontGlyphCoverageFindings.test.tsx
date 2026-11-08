// useFontGlyphCoverageFindings — issue #2593: the 18.13 warning rides
// the shared findings array (StudioShell merge) as a memoised compute
// over the working copy's VFS + IR; nothing here can block output.

import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useFontGlyphCoverageFindings } from "./useFontGlyphCoverageFindings.ts";

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

const KMN = [
  "store(&NAME) 'Demo'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'ɛ'",
].join("\n");

const KPS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  "  <Files>",
  '    <File><Name>..\\source\\FixtureSans.ttf</Name><Description></Description><FileType>.ttf</FileType></File>',
  "  </Files>",
  "</Package>",
].join("\n");

/**
 * A minimal font whose format-4 cmap covers only A–Z (plus the
 * 0xFFFF sentinel) — the same shape as the §18.13 assembly fixture.
 */
function azFont(): Uint8Array {
  const cmapSub: number[] = [
    0, 4, 0, 32, 0, 0, 0, 4, 0, 4, 0, 1, 0, 0,
    0, 0x5a, 0xff, 0xff, 0, 0, 0, 0x41, 0xff, 0xff,
    0, 0, 0, 1, 0, 0, 0, 0,
  ];
  const cmapTable: number[] = [
    0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12, ...cmapSub,
  ];
  const u32 = (n: number): number[] => [
    (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff,
  ];
  return new Uint8Array([
    0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
    0x63, 0x6d, 0x61, 0x70, 0, 0, 0, 0,
    ...u32(28), ...u32(cmapTable.length),
    ...cmapTable,
  ]);
}

function irTypingEpsilon() {
  return makeTestIR([
    {
      nodeId: "g1",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "r1",
          context: [],
          output: [{ kind: "char", value: "ɛ" }],
        },
      ],
    },
  ]);
}

function instantiate(ir = irTypingEpsilon(), withFont = true) {
  const entries: Array<{ path: string; content: string | Uint8Array; isBinary: boolean }> = [
    { path: `source/${basicKbdus.id}.kmn`, content: KMN, isBinary: false },
    { path: `source/${basicKbdus.id}.kps`, content: KPS, isBinary: false },
  ];
  if (withFont) {
    entries.push({ path: "source/FixtureSans.ttf", content: azFont(), isBinary: true });
  }
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(basicKbdus, { vfs: createVirtualFS(entries), ir });
}

describe("useFontGlyphCoverageFindings", () => {
  it("returns the shared empty array before instantiation", () => {
    const { result, rerender } = renderHook(() => useFontGlyphCoverageFindings());
    expect(result.current).toEqual([]);
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("warns when the packaged font lacks a glyph for a typed character", () => {
    instantiate();
    const { result } = renderHook(() => useFontGlyphCoverageFindings());
    expect(result.current).toHaveLength(1);
    const [finding] = result.current;
    expect(finding?.code).toBe("KM_LINT_FONT_GLYPH_COVERAGE");
    expect(finding?.severity).toBe("warning");
    expect(finding?.layer).toBe("C");
    expect(finding?.message).toContain("U+025B");
    expect(finding?.message).toContain("FixtureSans.ttf");
  });

  it("stays silent when no packaged font is in the VFS", () => {
    instantiate(irTypingEpsilon(), false);
    const { result } = renderHook(() => useFontGlyphCoverageFindings());
    expect(result.current).toEqual([]);
  });

  it("stays silent when the font covers everything typed", () => {
    const ir = makeTestIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value: "A" }],
          },
        ],
      },
    ]);
    instantiate(ir);
    const { result } = renderHook(() => useFontGlyphCoverageFindings());
    expect(result.current).toEqual([]);
  });
});
