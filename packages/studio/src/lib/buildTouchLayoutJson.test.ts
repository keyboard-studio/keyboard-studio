// Tests for buildTouchLayoutJson — ROUTER coverage only.
//
// applyTouchAssignmentsToRawJson is already well-tested in
// packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.test.ts.
// These tests focus exclusively on whether the ROUTER chooses the correct
// branch for each combination of inputs:
//
//   Case B (raw path)   — baseTouchJson is a non-empty string
//     → calls applyTouchAssignmentsToRawJson, preserves all shipped platforms,
//       preserves non-IR fields (e.g. displayUnderlying), never synthesizes phone.
//
//   Case A (IR path)    — baseTouchJson is undefined or ""
//     → runs scaffoldTouchLayout → applyTouchAssignments → emitTouchLayout,
//       always produces a phone platform.
//
//   malformed JSON      — non-JSON string as baseTouchJson
//     → the inner try/catch returns { json: null, warnings: [...] }.

import { describe, it, expect } from "vitest";
import { buildTouchLayoutJson } from "./buildTouchLayoutJson";
import type { KeyboardIR, TouchAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal KeyboardIR for Case A (IR path) tests.
// Matches the shape used in scaffoldTouchLayout.test.ts.
// ---------------------------------------------------------------------------

function makeMinimalIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Compact inline tablet-only JSON fixture (no phone, has displayUnderlying).
// This mimics the structural shape of a real shipped tablet-only touch layout
// (e.g. sil_cameroon_qwerty) without the file-system dependency.
// ---------------------------------------------------------------------------

const TABLET_ONLY_JSON = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a" },
            ],
          },
        ],
      },
    ],
    displayUnderlying: false,
  },
});

// ---------------------------------------------------------------------------
// Helper: build a longpress TouchAssignment for a host key + char.
// ---------------------------------------------------------------------------

function longpress(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [
      {
        patternId: "longpress_alternates",
        slotValues: { hostKey, char },
      },
    ],
    source: "user",
  };
}

// ---------------------------------------------------------------------------
// Case B — router → raw path
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case B (router → raw path)", () => {
  it("when baseTouchJson is provided, the returned json parses to a valid object", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      TABLET_ONLY_JSON,
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!);
    expect(parsed).toBeTypeOf("object");
  });

  it("Case B: result has ONLY a 'tablet' platform key — no 'phone' synthesized", () => {
    // The raw path must preserve the shipped platforms and never invent phone.
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      TABLET_ONLY_JSON,
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["tablet"]);
    expect("phone" in parsed).toBe(false);
  });

  it("Case B: K_A gains an sk[] entry after a longpress assignment", () => {
    // The raw path must splice assignments into the matching key.
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      TABLET_ONLY_JSON,
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as {
      tablet: { layer: Array<{ row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const kaKey = parsed.tablet.layer[0]?.row[0]?.key.find((k) => k.id === "K_A");
    expect(kaKey).toBeDefined();
    expect(Array.isArray(kaKey!.sk)).toBe(true);
    expect(kaKey!.sk!.length).toBeGreaterThan(0);
  });

  it("Case B: non-IR field 'displayUnderlying:false' is preserved verbatim", () => {
    // The IR path drops per-platform fields like displayUnderlying; the raw path
    // must keep them. This is the key observable that distinguishes the two paths.
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      TABLET_ONLY_JSON,
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as { tablet: { displayUnderlying?: unknown } };
    expect(parsed.tablet.displayUnderlying).toBe(false);
  });

  it("Case B: no warnings returned for a matched host key", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      TABLET_ONLY_JSON,
    );
    // The only expected warning would be "key not found in any platform" — K_A is
    // present in the fixture, so there should be none.
    const unexpectedWarnings = result.warnings.filter((w) =>
      w.includes("not found") || w.includes("unmatched"),
    );
    expect(unexpectedWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case A — router → IR path (baseTouchJson undefined)
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A (router → IR path, undefined)", () => {
  it("when baseTouchJson is omitted, the returned json parses to a valid object", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), []);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!);
    expect(parsed).toBeTypeOf("object");
  });

  it("Case A (undefined): result HAS a 'phone' platform — proving the IR path ran", () => {
    // The generate-from-scratch IR path always synthesizes a phone platform.
    // This is the canonical proof that Case A fired.
    const result = buildTouchLayoutJson(makeMinimalIR(), []);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("phone" in parsed).toBe(true);
  });

  it("Case A (undefined): the phone platform has a 'default' layer", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), []);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as {
      phone: { layer: Array<{ id: string }> };
    };
    const layerIds = parsed.phone.layer.map((l) => l.id);
    expect(layerIds).toContain("default");
  });
});

// ---------------------------------------------------------------------------
// Case A — router → IR path (baseTouchJson === "")
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A (router → IR path, empty string)", () => {
  it("when baseTouchJson is empty string, it is falsy and routes to Case A (IR path)", () => {
    // "" is falsy in JS — the `if (baseTouchJson)` guard must not fire.
    const result = buildTouchLayoutJson(makeMinimalIR(), [], "");
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("phone" in parsed).toBe(true);
  });

  it("empty string vs undefined produce the same router branch (both Case A)", () => {
    // Belt-and-suspenders: the empty-string path and the undefined path must
    // produce equivalent structure (both phone, both no tablet).
    const resultUndefined = buildTouchLayoutJson(makeMinimalIR(), []);
    const resultEmpty = buildTouchLayoutJson(makeMinimalIR(), [], "");

    expect(resultUndefined.json).not.toBeNull();
    expect(resultEmpty.json).not.toBeNull();

    const parsedUndefined = JSON.parse(resultUndefined.json!) as Record<string, unknown>;
    const parsedEmpty = JSON.parse(resultEmpty.json!) as Record<string, unknown>;

    expect("phone" in parsedUndefined).toBe(true);
    expect("phone" in parsedEmpty).toBe(true);
    expect("tablet" in parsedUndefined).toBe(false);
    expect("tablet" in parsedEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON — try/catch returns { json: null, warnings }
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — malformed baseTouchJson", () => {
  it("returns json:null when baseTouchJson is not valid JSON", () => {
    // The documented contract: any throw (incl. SyntaxError) is caught and
    // surfaces as { json: null, warnings: [...] }.
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      "this is not json {{{",
    );
    expect(result.json).toBeNull();
  });

  it("includes a warning message when baseTouchJson is malformed", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      "this is not json {{{",
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    // The wrapper adds a "[buildTouchLayoutJson] failed:" prefix.
    expect(result.warnings[0]).toMatch(/\[buildTouchLayoutJson\] failed:/);
  });

  it("does NOT throw — always returns a BuildTouchLayoutJsonResult", () => {
    // Callers rely on this never throwing; verify the try/catch catches all errors.
    let threw = false;
    try {
      buildTouchLayoutJson(makeMinimalIR(), [], "{bad json");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
