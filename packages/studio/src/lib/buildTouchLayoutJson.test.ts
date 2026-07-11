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
// ---------------------------------------------------------------------------

const TABLET_ONLY_JSON = JSON.stringify({
  tablet: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
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
  it("returned json parses to a valid object when baseTouchJson is provided", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], TABLET_ONLY_JSON);
    expect(result.json).not.toBeNull();
    expect(JSON.parse(result.json!)).toBeTypeOf("object");
  });

  it("preserves ONLY shipped platforms — no 'phone' synthesized", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], TABLET_ONLY_JSON);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["tablet"]);
    expect("phone" in parsed).toBe(false);
  });

  it("splices longpress assignments into the matching key", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], TABLET_ONLY_JSON);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as {
      tablet: { layer: Array<{ row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const kaKey = parsed.tablet.layer[0]?.row[0]?.key.find((k) => k.id === "K_A");
    expect(kaKey?.sk).toBeDefined();
    expect(Array.isArray(kaKey!.sk)).toBe(true);
    expect(kaKey!.sk!.length).toBeGreaterThan(0);
  });

  it("preserves non-IR fields like displayUnderlying", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], TABLET_ONLY_JSON);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as { tablet: { displayUnderlying?: unknown } };
    expect(parsed.tablet.displayUnderlying).toBe(false);
  });

  it("returns no warnings for matched host keys", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], TABLET_ONLY_JSON);
    const unexpectedWarnings = result.warnings.filter(
      (w) => w.includes("not found") || w.includes("unmatched"),
    );
    expect(unexpectedWarnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case A — router → IR path (baseTouchJson undefined)
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A (router → IR path, undefined)", () => {
  it("returned json parses to a valid object when baseTouchJson is omitted", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), []);
    expect(result.json).not.toBeNull();
    expect(JSON.parse(result.json!)).toBeTypeOf("object");
  });

  it("synthesizes a 'phone' platform — proving the IR path ran", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), []);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("phone" in parsed).toBe(true);
  });

  it("phone platform includes a 'default' layer", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), []);
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as { phone: { layer: Array<{ id: string }> } };
    expect(parsed.phone.layer.map((l) => l.id)).toContain("default");
  });
});

// ---------------------------------------------------------------------------
// Case A — router → IR path (baseTouchJson === "")
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A (router → IR path, empty string)", () => {
  it("routes to Case A when baseTouchJson is empty string", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], "");
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("phone" in parsed).toBe(true);
  });

  it("empty string and undefined produce equivalent output", () => {
    const resultUndefined = buildTouchLayoutJson(makeMinimalIR(), []);
    const resultEmpty = buildTouchLayoutJson(makeMinimalIR(), [], "");

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
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], "this is not json {{{");
    expect(result.json).toBeNull();
  });

  it("includes a warning message when baseTouchJson is malformed", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [longpress("K_A", "á")], "this is not json {{{");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/\[buildTouchLayoutJson\] failed:/);
  });

  it("never throws — always returns a BuildTouchLayoutJsonResult", () => {
    let threw = false;
    try {
      buildTouchLayoutJson(makeMinimalIR(), [], "{bad json");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
