import { describe, it, expect } from "vitest";
import { buildImportAttributionBlock } from "./import-attribution.js";
import { ImportStatus } from "@keyboard-studio/contracts";
import type { ImportReport } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(
  status: ImportStatus,
  opaqueFeatureInventory: Array<{ feature: string; count: number }> = [],
): ImportReport {
  return {
    keyboardId: "cm_qwerty",
    status,
    parseErrors: [],
    opaqueFeatureInventory,
    recognizedRatio: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildImportAttributionBlock", () => {
  it("produces the ## Import attribution heading", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).toContain("## Import attribution");
  });

  it("includes the source path in a code span", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).toContain("`release/c/cm_qwerty`");
  });

  it("includes '(commit unknown)' when sourceSha is omitted", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).toContain("(commit unknown)");
  });

  it("includes the pinned SHA when sourceSha is provided", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      sourceSha: "abc1234",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).toContain("(commit abc1234)");
    expect(block).not.toContain("unknown");
  });

  it("Clean status + no opaque features — status line is 'Clean', opaque line is 'none'", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).toContain("Round-trip status: Clean");
    expect(block).toContain("Opaque features: none");
  });

  it("CleanWithOpaque + two inventory entries (counts 1+3) — status shows total 4", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.CleanWithOpaque, [
        { feature: "if-option-store", count: 1 },
        { feature: "call-return", count: 3 },
      ]),
    });
    expect(block).toContain("Round-trip status: CleanWithOpaque (4 opaque features)");
  });

  it("CleanWithOpaque + single opaque feature (count 1) — uses singular 'feature'", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.CleanWithOpaque, [
        { feature: "smp-literal", count: 1 },
      ]),
    });
    expect(block).toContain("CleanWithOpaque (1 opaque feature)");
  });

  it("CleanWithOpaque — opaque features line lists all feature names", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.CleanWithOpaque, [
        { feature: "if-option-store", count: 1 },
        { feature: "call-return", count: 3 },
      ]),
    });
    expect(block).toContain("if-option-store");
    expect(block).toContain("call-return");
  });

  it("CleanWithOpaque + empty inventory — throws rather than rendering '0 opaque features' (refs #239)", () => {
    expect(() =>
      buildImportAttributionBlock({
        sourcePath: "release/c/cm_qwerty",
        report: makeReport(ImportStatus.CleanWithOpaque, []),
      }),
    ).toThrow(/CleanWithOpaque requires at least one entry/);
  });

  it("ParseFailure status — renders informative warning message", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/x/some_kb",
      report: makeReport(ImportStatus.ParseFailure),
    });
    expect(block).toContain("ParseFailure");
    expect(block).toContain("import failed");
  });

  it("RoundTripDivergence status — renders informative warning message", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/x/some_kb",
      report: makeReport(ImportStatus.RoundTripDivergence),
    });
    expect(block).toContain("RoundTripDivergence");
    expect(block).toContain("review carefully");
  });

  it("no deletedOpaque — 'Deleted opaque features' line is absent", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).not.toContain("Deleted opaque features");
  });

  it("deletedOpaque present — 'Deleted opaque features' line appears with the feature IDs", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.CleanWithOpaque, [
        { feature: "if-option-store", count: 2 },
      ]),
      deletedOpaque: ["if-option-store"],
    });
    expect(block).toContain("Deleted opaque features: if-option-store");
    expect(block).toContain("removed during carve gallery step");
  });

  it("empty deletedOpaque array — 'Deleted opaque features' line is absent", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
      deletedOpaque: [],
    });
    expect(block).not.toContain("Deleted opaque features");
  });

  it("all four required sections appear in order", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      sourceSha: "deadbeef",
      report: makeReport(ImportStatus.CleanWithOpaque, [
        { feature: "outs-expansion", count: 2 },
      ]),
    });
    const headingIdx = block.indexOf("## Import attribution");
    const sourceIdx = block.indexOf("Adapted from:");
    const statusIdx = block.indexOf("Round-trip status:");
    const opaqueIdx = block.indexOf("Opaque features:");

    expect(headingIdx).toBeLessThan(sourceIdx);
    expect(sourceIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(opaqueIdx);
  });

  it("no deprecated rewrites — no rewrites section appears", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: makeReport(ImportStatus.Clean),
    });
    expect(block).not.toContain("Deprecated syntax rewrites");
  });

  it("deprecated rewrites — grouped by kind with source → rewritten lines (#2633)", () => {
    const block = buildImportAttributionBlock({
      sourcePath: "release/c/cm_qwerty",
      report: {
        ...makeReport(ImportStatus.Clean),
        deprecatedRewrites: [
          {
            kind: "header-statement",
            sourceLine: 1,
            sourceText: `NAME "Foo"`,
            rewrittenText: `store(&NAME) 'Foo'`,
          },
          {
            kind: "legacy-value-format",
            sourceLine: 12,
            sourceText: "d241",
            rewrittenText: "U+00F1",
          },
          {
            kind: "target-selector",
            sourceLine: 20,
            sourceText: "$keymanonly: + [K_A] > 'a'",
            rewrittenText: "platform('desktop native') + [K_A] > 'a'",
          },
          {
            kind: "version-raise",
            sourceLine: 3,
            sourceText: `store(&VERSION) '5.0'`,
            rewrittenText: `store(&VERSION) '9.0' (raised — platform() guards need Keyman 9.0+)`,
          },
        ],
      },
    });
    expect(block).toContain("### Deprecated syntax rewrites");
    expect(block).toContain("- Header statements (1):");
    expect(block).toContain(`line 1: NAME "Foo" → store(&NAME) 'Foo'`);
    expect(block).toContain("- Legacy value formats (1):");
    expect(block).toContain("line 12: d241 → U+00F1");
    expect(block).toContain("- Target selectors ($keyman*:) (1):");
    expect(block).toContain("line 20: $keymanonly: + [K_A] > 'a' → platform('desktop native') + [K_A] > 'a'");
    expect(block).toContain("- Version raise (1):");
    expect(block).toContain("line 3: store(&VERSION) '5.0' → store(&VERSION) '9.0'");
  });
});
