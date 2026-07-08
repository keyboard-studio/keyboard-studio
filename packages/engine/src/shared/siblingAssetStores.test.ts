// Freezes the derived membership of each siblingAssetStores.ts subset, so a
// future table edit that silently changes what a call site sees fails loudly.
// The expected sets below are exactly today's four pre-consolidation literals
// (parseKmnHeaderStores.SYSTEM_STORES, scaffold-ir.PATH_STORES + BITMAP,
// stripDanglingAssetStores.{DANGLING_STORES,ALWAYS_STRIP_STORES},
// reconcileSiblingAssetPaths.SIBLING_PATH_STORES).

import { describe, it, expect } from "vitest";
import {
  fetchRequiredMap,
  unconditionalScaffoldRenameStores,
  conditionalScaffoldRenameStores,
  danglingPreviewStripStores,
  alwaysPreviewStripStores,
  reconcileRepairStores,
} from "./siblingAssetStores.js";

describe("siblingAssetStores — frozen derived subsets", () => {
  it("fetchRequiredMap matches parseKmnHeaderStores' original SYSTEM_STORES", () => {
    expect(fetchRequiredMap()).toEqual({
      LAYOUTFILE: true,
      VISUALKEYBOARD: true,
      BITMAP: false,
      KMW_EMBEDJS: true,
      KMW_EMBEDCSS: false,
      KMW_HELPFILE: false,
      DISPLAYMAP: false,
      INCLUDECODES: true,
    });
  });

  it("unconditionalScaffoldRenameStores matches scaffold-ir's original PATH_STORES", () => {
    expect(unconditionalScaffoldRenameStores().sort()).toEqual(
      ["VISUALKEYBOARD", "LAYOUTFILE", "KMW_EMBEDCSS", "KMW_EMBEDJS", "KMW_HELPFILE"].sort(),
    );
  });

  it("conditionalScaffoldRenameStores is exactly BITMAP", () => {
    expect(conditionalScaffoldRenameStores()).toEqual(["BITMAP"]);
  });

  it("danglingPreviewStripStores matches stripDanglingAssetStores' original DANGLING_STORES", () => {
    expect(danglingPreviewStripStores()).toEqual(
      new Set(["BITMAP", "VISUALKEYBOARD", "LAYOUTFILE", "DISPLAYMAP"]),
    );
  });

  it("alwaysPreviewStripStores matches stripDanglingAssetStores' original ALWAYS_STRIP_STORES", () => {
    expect(alwaysPreviewStripStores()).toEqual(new Set(["KMW_HELPFILE", "KMW_EMBEDJS"]));
  });

  it("reconcileRepairStores matches reconcileSiblingAssetPaths' original SIBLING_PATH_STORES", () => {
    expect(reconcileRepairStores()).toEqual(
      new Set([
        "VISUALKEYBOARD",
        "LAYOUTFILE",
        "KMW_EMBEDCSS",
        "KMW_EMBEDJS",
        "KMW_HELPFILE",
        "BITMAP",
        "DISPLAYMAP",
      ]),
    );
  });

  it("INCLUDECODES stays out of rename/strip/reconcile, appearing only as fetchRequired", () => {
    expect(unconditionalScaffoldRenameStores()).not.toContain("INCLUDECODES");
    expect(conditionalScaffoldRenameStores()).not.toContain("INCLUDECODES");
    expect(danglingPreviewStripStores().has("INCLUDECODES")).toBe(false);
    expect(alwaysPreviewStripStores().has("INCLUDECODES")).toBe(false);
    expect(reconcileRepairStores().has("INCLUDECODES")).toBe(false);
  });
});
