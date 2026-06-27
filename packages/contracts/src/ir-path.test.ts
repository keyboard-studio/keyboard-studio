/**
 * Runtime behaviour tests for IRPath (T008).
 *
 * This file covers the runtime behaviour of irPath() and formatIRPath().
 *
 * COMPILE-TIME type-level assertions (positive + negative, Design AC / G1,
 * Drift AC / G2) live in ir-path.type-assertions.ts, NOT here. That file is
 * compiled by `tsc --noEmit` (i.e. `pnpm typecheck`). Vitest only transpiles —
 * it does NOT run tsc — so @ts-expect-error directives inside *.test.ts files
 * are never verified by CI. Moving them to a compiled non-test file closes
 * that enforcement gap.
 */

import { describe, it, expect } from "vitest";
import {
  irPath,
  formatIRPath,
  ARRAY_INDEX,
  type IRPath,
} from "./ir-path.js";

// ---------------------------------------------------------------------------
// Positive cases (Design AC — valid paths must compile)
// ---------------------------------------------------------------------------

describe("IRPath — positive cases", () => {
  it("accepts the physical groups[].rules[].output path", () => {
    // This is the canonical physical path the spec names explicitly.
    const p = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output");
    // Runtime sanity: it is an array with the right shape.
    expect(p[0]).toBe("groups");
    expect(p[1]).toEqual({ kind: "[]" });
    expect(p[2]).toBe("rules");
    expect(p[3]).toEqual({ kind: "[]" });
    expect(p[4]).toBe("output");
  });

  it("accepts the physical groups[].rules[].context path", () => {
    const p = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "context");
    expect(p[4]).toBe("context");
  });

  it("accepts the physical stores[] path", () => {
    const p = irPath("stores", ARRAY_INDEX);
    expect(p[0]).toBe("stores");
    expect(p[1]).toEqual({ kind: "[]" });
  });

  it("accepts a stores[].name leaf path", () => {
    const p = irPath("stores", ARRAY_INDEX, "name");
    expect(p[2]).toBe("name");
  });

  it("accepts the header.bcp47 path", () => {
    const p = irPath("header", "bcp47");
    expect(p[0]).toBe("header");
    expect(p[1]).toBe("bcp47");
  });

  it("accepts the header.keyboardId path", () => {
    const p = irPath("header", "keyboardId");
    expect(p[1]).toBe("keyboardId");
  });

  it("accepts the comments[] path", () => {
    const p = irPath("comments", ARRAY_INDEX);
    expect(p[0]).toBe("comments");
  });

  it("accepts the raw[] path", () => {
    const p = irPath("raw", ARRAY_INDEX);
    expect(p[0]).toBe("raw");
  });

  it("accepts the recognizedPatterns[] path", () => {
    const p = irPath("recognizedPatterns", ARRAY_INDEX);
    expect(p[0]).toBe("recognizedPatterns");
  });

  it("accepts the deep touch path touchLayout.platforms[].layers[].rows[].keys[]", () => {
    // G3: touch surface is covered; G4: traversal stops at keys[] (TouchKeyIR boundary).
    const p = irPath(
      "touchLayout",
      "platforms",
      ARRAY_INDEX,
      "layers",
      ARRAY_INDEX,
      "rows",
      ARRAY_INDEX,
      "keys",
      ARRAY_INDEX,
    );
    expect(p[0]).toBe("touchLayout");
    expect(p[1]).toBe("platforms");
    expect(p[2]).toEqual({ kind: "[]" });
    expect(p[3]).toBe("layers");
    expect(p[8]).toEqual({ kind: "[]" });
  });

  it("accepts the visual keyboard path visualKeyboard.layers[].keys[]", () => {
    const p = irPath(
      "visualKeyboard",
      "layers",
      ARRAY_INDEX,
      "keys",
      ARRAY_INDEX,
    );
    expect(p[0]).toBe("visualKeyboard");
    expect(p[4]).toEqual({ kind: "[]" });
  });

  it("accepts the groups[] path (without entering rules)", () => {
    const p = irPath("groups", ARRAY_INDEX);
    expect(p[0]).toBe("groups");
  });

  it("accepts a groups[].name path", () => {
    const p = irPath("groups", ARRAY_INDEX, "name");
    expect(p[2]).toBe("name");
  });
});

// ---------------------------------------------------------------------------
// formatIRPath
// ---------------------------------------------------------------------------

describe("formatIRPath", () => {
  it("renders the canonical physical path as groups[].rules[].output", () => {
    const p = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output");
    expect(formatIRPath(p)).toBe("groups[].rules[].output");
  });

  it("renders a top-level array path as stores[]", () => {
    const p = irPath("stores", ARRAY_INDEX);
    expect(formatIRPath(p)).toBe("stores[]");
  });

  it("renders the deep touch path correctly", () => {
    const p = irPath(
      "touchLayout",
      "platforms",
      ARRAY_INDEX,
      "layers",
      ARRAY_INDEX,
      "rows",
      ARRAY_INDEX,
      "keys",
      ARRAY_INDEX,
    );
    expect(formatIRPath(p)).toBe(
      "touchLayout.platforms[].layers[].rows[].keys[]",
    );
  });

  it("renders a header field path as header.bcp47", () => {
    const p = irPath("header", "bcp47");
    expect(formatIRPath(p)).toBe("header.bcp47");
  });

  it("renders the empty root path as (root)", () => {
    const rootPath: IRPath = [] as const;
    expect(formatIRPath(rootPath)).toBe("(root)");
  });
});

// ---------------------------------------------------------------------------
// irPath builder
// ---------------------------------------------------------------------------

describe("irPath builder", () => {
  it("returns the exact tuple passed in", () => {
    const segs = ["groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output"] as const;
    const p = irPath(...segs);
    expect(p).toEqual(segs);
  });

  it("is referentially equal for the same construction (no caching — tuple identity)", () => {
    const p1 = irPath("header", "name");
    const p2 = irPath("header", "name");
    expect(p1).toEqual(p2);
  });

  it("called with zero arguments returns the root path []", () => {
    // irPath() with no args → empty tuple → root KeyboardIR itself.
    const root = irPath();
    expect(root).toEqual([]);
    expect(root.length).toBe(0);
    // formatIRPath on the root path must render as "(root)".
    expect(formatIRPath(root)).toBe("(root)");
  });
});

// ---------------------------------------------------------------------------
// formatIRPath edge cases
// ---------------------------------------------------------------------------

describe("formatIRPath — edge cases", () => {
  it("handles a bare ARRAY_INDEX as the first segment (renders '[]')", () => {
    // A path whose first element is an ArrayIndex (e.g. produced by a partial
    // path slice). The bare-ArrayIndex branch in the while-loop renders "[]".
    // This path is only reachable by casting because IRPath normally starts
    // with a string key — the test exercises the graceful-fallback branch.
    const pathWithLeadingIndex: IRPath = [ARRAY_INDEX] as unknown as IRPath;
    expect(formatIRPath(pathWithLeadingIndex)).toBe("[]");
  });
});
