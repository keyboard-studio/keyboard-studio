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
});
