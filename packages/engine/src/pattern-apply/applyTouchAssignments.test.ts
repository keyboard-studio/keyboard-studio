/**
 * Unit tests for applyTouchAssignments.
 *
 * Tests are grouped into:
 *   1. Per-mechanism behaviour (longpress, flick, multitap, touch_inherited, unknown)
 *   2. Host-key-not-found guard
 *   3. Accumulation across multiple assignments to the same host key
 *   4. Idempotency / deduplication
 *   5. Purity (no mutation of the original layout)
 *   6. Structural isolation (shift layer and tablet platform untouched)
 *   7. Emit-side round-trip for flick/multitap
 */

import { describe, it, expect } from "vitest";
import { applyTouchAssignments } from "./applyTouchAssignments.js";
import { emitTouchLayout } from "../codec/index.js";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import type { TouchAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a single TouchKeyIR for use in test layouts. */
function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, text: id.toLowerCase(), output: id.toLowerCase(), ...overrides };
}

/**
 * Build a minimal TouchLayoutIR with a phone platform, a default layer
 * containing one row with the given keys, and optionally a shift layer.
 *
 * The tablet platform (if requested) gets a single "default" layer with
 * a placeholder key that should NEVER be touched by applyTouchAssignments.
 */
function makeLayout(
  phoneDefaultKeys: TouchKeyIR[],
  options: { shiftLayer?: boolean; tabletPlatform?: boolean } = {}
): TouchLayoutIR {
  const phoneLayers: TouchLayoutIR["platforms"][number]["layers"] = [
    { id: "default", rows: [{ keys: phoneDefaultKeys }] },
  ];
  if (options.shiftLayer) {
    phoneLayers.push({
      id: "shift",
      rows: [{ keys: phoneDefaultKeys.map((k) => ({ ...k, nodeId: `shift_${k.nodeId}`, id: k.id })) }],
    });
  }

  const platforms: TouchLayoutIR["platforms"] = [
    { id: "phone", layers: phoneLayers },
  ];

  if (options.tabletPlatform) {
    platforms.push({
      id: "tablet",
      layers: [{ id: "default", rows: [{ keys: [makeKey("K_TABLET_SENTINEL")] }] }],
    });
  }

  return { platforms, nodeIds: [] };
}

/** Build a touch assignment for longpress. */
function longpress(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey, char } }],
    source: "user",
  };
}

/** Build a touch assignment for flick. */
function flick(hostKey: string, direction: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "flick_gestures", slotValues: { hostKey, direction, char } }],
    source: "user",
  };
}

/** Build a touch assignment for multitap. */
function multitap(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "multitap", slotValues: { hostKey, char } }],
    source: "user",
  };
}

/** Build a touch_inherited assignment. */
function inherited(char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "touch_inherited" }],
    source: "user",
  };
}

/** Deep-clone a value using JSON serialisation. */
function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Get the phone default layer keys from a result layout. */
function phoneDefaultKeys(layout: TouchLayoutIR): TouchKeyIR[] {
  const phone = layout.platforms.find((p) => p.id === "phone")!;
  const def = phone.layers.find((l) => l.id === "default")!;
  return def.rows.flatMap((r) => r.keys);
}

/** Get a specific key from the phone default layer by id. */
function getKey(layout: TouchLayoutIR, keyId: string): TouchKeyIR | undefined {
  return phoneDefaultKeys(layout).find((k) => k.id === keyId);
}

// ---------------------------------------------------------------------------
// 1. Per-mechanism behaviour
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — longpress", () => {
  it("adds an sk entry with correct text and U_ id (no output field)", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out, warnings } = applyTouchAssignments(layout, [longpress("K_A", "á")]);

    expect(warnings).toHaveLength(0);
    const key = getKey(out, "K_A")!;
    expect(key.sk).toHaveLength(1);
    // U_-id form: character is derived from the id; no output field needed.
    expect(key.sk![0]!.id).toBe("U_00E1");
    expect(key.sk![0]!.text).toBe("á");
    expect(key.sk![0]!.output).toBeUndefined();
  });

  it("does NOT set a per-key hint — dot comes from platform defaultHint", () => {
    // applyTouchAssignments must not assign a hint; the Keyman runtime renders
    // the dot automatically when defaultHint is "dot" and sk is non-empty.
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [longpress("K_A", "á")]);
    expect(getKey(out, "K_A")!.hint).toBeUndefined();
  });

  it("leaves a pre-existing explicit hint untouched (imported keyboard hint preserved)", () => {
    // If an imported key already carries an explicit hint, it must not be
    // cleared or overwritten — applyTouchAssignments never writes hint.
    const layout = makeLayout([makeKey("K_A", { hint: "â" })]);
    const { layout: out } = applyTouchAssignments(layout, [longpress("K_A", "á")]);
    // hint remains "â" — it was already set on the key from import, not by us
    expect(getKey(out, "K_A")!.hint).toBe("â");
  });
});

describe("applyTouchAssignments — flick", () => {
  it("sets key.flick[direction].text to char and uses U_ id (no output field)", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out, warnings } = applyTouchAssignments(layout, [flick("K_A", "n", "à")]);

    expect(warnings).toHaveLength(0);
    const key = getKey(out, "K_A")!;
    // U_-id form: text is the glyph; output is omitted.
    expect(key.flick?.["n"]?.id).toBe("U_00E0");
    expect(key.flick?.["n"]?.text).toBe("à");
    expect(key.flick?.["n"]?.output).toBeUndefined();
  });

  it("creates flick object from scratch when absent", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [flick("K_A", "s", "ã")]);
    const key = getKey(out, "K_A")!;
    expect(key.flick).toBeDefined();
    expect(key.flick?.["s"]?.id).toBe("U_00E3");
    expect(key.flick?.["s"]?.text).toBe("ã");
  });

  it("last-wins per direction (two flicks to same dir)", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [
      flick("K_A", "n", "à"),
      flick("K_A", "n", "ä"),
    ]);
    expect(getKey(out, "K_A")!.flick?.["n"]?.id).toBe("U_00E4");
    expect(getKey(out, "K_A")!.flick?.["n"]?.text).toBe("ä");
  });
});

describe("applyTouchAssignments — multitap", () => {
  it("adds an entry to multitap[] with U_ id and text (no output field)", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out, warnings } = applyTouchAssignments(layout, [multitap("K_A", "â")]);

    expect(warnings).toHaveLength(0);
    const key = getKey(out, "K_A")!;
    expect(key.multitap).toHaveLength(1);
    expect(key.multitap![0]!.id).toBe("U_00E2");
    expect(key.multitap![0]!.text).toBe("â");
    expect(key.multitap![0]!.output).toBeUndefined();
  });

  it("creates multitap array from scratch when absent", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [multitap("K_A", "â")]);
    expect(Array.isArray(getKey(out, "K_A")!.multitap)).toBe(true);
  });
});

describe("applyTouchAssignments — touch_inherited", () => {
  it("is a no-op — layout identical and no warnings", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const clone = deepClone(layout);
    const { layout: out, warnings } = applyTouchAssignments(layout, [inherited("a")]);

    expect(warnings).toHaveLength(0);
    expect(out).toEqual(clone);
  });
});

describe("applyTouchAssignments — unknown patternId", () => {
  it("emits exactly one warning and does not modify the layout", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const clone = deepClone(layout);
    const bad: TouchAssignment = {
      scope: "individual",
      target: "x",
      modality: "touch",
      mechanisms: [{ patternId: "totally_unknown_pattern", slotValues: { hostKey: "K_A", char: "x" } }],
    };

    const { layout: out, warnings } = applyTouchAssignments(layout, [bad]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unknown patternId");
    expect(out).toEqual(clone);
  });
});

// ---------------------------------------------------------------------------
// 2. Host-key-not-found guard
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — host key not found", () => {
  it("pushes a warning and leaves the layout unchanged", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const clone = deepClone(layout);
    const { layout: out, warnings } = applyTouchAssignments(layout, [longpress("K_NONEXISTENT", "á")]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/host key "K_NONEXISTENT" not found/);
    expect(out).toEqual(clone);
  });

  it("does not throw — continues processing remaining assignments", () => {
    const layout = makeLayout([makeKey("K_A"), makeKey("K_B")]);
    const { layout: out, warnings } = applyTouchAssignments(layout, [
      longpress("K_NONEXISTENT", "á"),
      longpress("K_B", "β"),
    ]);

    // One warning for the missing key; the valid one still applies
    expect(warnings).toHaveLength(1);
    expect(getKey(out, "K_B")!.sk).toHaveLength(1);
    expect(getKey(out, "K_B")!.sk![0]!.text).toBe("β");
  });
});

// ---------------------------------------------------------------------------
// 3. Accumulation across multiple assignments to the same host key
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — two chars on the same host key", () => {
  it("both characters appear in sk[], in order", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [
      longpress("K_A", "á"),
      longpress("K_A", "à"),
    ]);
    const sk = getKey(out, "K_A")!.sk!;
    expect(sk).toHaveLength(2);
    expect(sk[0]!.text).toBe("á");
    expect(sk[1]!.text).toBe("à");
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotency / deduplication
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — idempotency", () => {
  it("applying the same longpress twice yields exactly one sk entry", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [
      longpress("K_A", "á"),
      longpress("K_A", "á"),
    ]);
    expect(getKey(out, "K_A")!.sk).toHaveLength(1);
  });

  it("applying the same multitap twice yields exactly one multitap entry", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [
      multitap("K_A", "â"),
      multitap("K_A", "â"),
    ]);
    expect(getKey(out, "K_A")!.multitap).toHaveLength(1);
  });

  it("applying a list that includes a duplicate sk entry for a key that already has that sk entry", () => {
    // Simulate existing sk already having "á" — intentionally uses a legacy/imported
    // compound id form ("K_A_sk_e1") to verify that dedup is by output/text, not by
    // id form. Pre-existing/imported layouts may carry old-form ids; dedup must
    // still recognise a match based on the produced character.
    const keyWithSk = makeKey("K_A", {
      sk: [{ nodeId: "pre_sk", id: "K_A_sk_e1", text: "á", output: "á" }],
    });
    const layout = makeLayout([keyWithSk]);
    const { layout: out } = applyTouchAssignments(layout, [longpress("K_A", "á")]);
    // Should still be exactly 1 — deduped by output/text, not by id form
    expect(getKey(out, "K_A")!.sk).toHaveLength(1);
    // Dedup-by-output guarantee: no second entry with the same produced character
    const skEntries = getKey(out, "K_A")!.sk ?? [];
    const textsForA = skEntries.filter((e) => e.text === "á");
    expect(textsForA).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Purity — original input not mutated
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — purity", () => {
  it("does not mutate the original layout object", () => {
    const keyA = makeKey("K_A");
    const layout = makeLayout([keyA]);
    const originalClone = deepClone(layout);

    applyTouchAssignments(layout, [
      longpress("K_A", "á"),
      flick("K_A", "n", "à"),
      multitap("K_A", "â"),
    ]);

    // Original layout must be unchanged
    expect(layout).toEqual(originalClone);
  });

  it("original matched key's sk, flick, and multitap are still undefined", () => {
    const keyA = makeKey("K_A");
    const layout = makeLayout([keyA]);

    applyTouchAssignments(layout, [
      longpress("K_A", "á"),
      flick("K_A", "n", "à"),
      multitap("K_A", "â"),
    ]);

    // The original TouchKeyIR object must NOT have been mutated
    expect(keyA.sk).toBeUndefined();
    expect(keyA.flick).toBeUndefined();
    expect(keyA.multitap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Structural isolation
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — isolation of other layers and platforms", () => {
  it("shift layer is returned reference-equal to the input's shift layer", () => {
    const layout = makeLayout([makeKey("K_A"), makeKey("K_S")], { shiftLayer: true });
    const phonePlatform = layout.platforms.find((p) => p.id === "phone")!;
    const inputShiftLayer = phonePlatform.layers.find((l) => l.id === "shift")!;

    const { layout: out } = applyTouchAssignments(layout, [longpress("K_A", "á")]);

    const outPhonePlatform = out.platforms.find((p) => p.id === "phone")!;
    const outShiftLayer = outPhonePlatform.layers.find((l) => l.id === "shift")!;

    // Must be the exact same object reference (structural sharing)
    expect(outShiftLayer).toBe(inputShiftLayer);
  });

  it("tablet platform is returned reference-equal to the input's tablet platform", () => {
    const layout = makeLayout([makeKey("K_A")], { tabletPlatform: true });
    const inputTablet = layout.platforms.find((p) => p.id === "tablet")!;

    const { layout: out } = applyTouchAssignments(layout, [longpress("K_A", "á")]);

    const outTablet = out.platforms.find((p) => p.id === "tablet")!;
    expect(outTablet).toBe(inputTablet);
  });

  it("a layout with no phone platform returns unchanged layout + one warning", () => {
    const noPhoneLayout: TouchLayoutIR = {
      platforms: [{ id: "tablet", layers: [{ id: "default", rows: [] }] }],
      nodeIds: [],
    };

    const { layout: out, warnings } = applyTouchAssignments(noPhoneLayout, [longpress("K_A", "á")]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no phone platform");
    expect(out).toBe(noPhoneLayout); // same reference — unchanged
  });
});

// ---------------------------------------------------------------------------
// 7. Emit-side round-trip for sk, flick, and multitap
// ---------------------------------------------------------------------------

describe("applyTouchAssignments — emit-side verification", () => {
  it("sk entry survives emitTouchLayout → JSON.parse", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [longpress("K_A", "á")]);

    const emitted = JSON.parse(emitTouchLayout(out)) as Record<string, unknown>;
    const phoneLayer = (emitted["phone"] as Record<string, unknown>);
    const layers = phoneLayer["layer"] as Array<{ id: string; row: Array<{ key: unknown[] }> }>;
    const defaultLayer = layers.find((l) => l.id === "default")!;
    const row0 = defaultLayer.row[0]!;
    const keyA = (row0.key as Array<Record<string, unknown>>).find((k) => k["id"] === "K_A")!;

    expect(Array.isArray(keyA["sk"])).toBe(true);
    const sk = keyA["sk"] as Array<Record<string, unknown>>;
    // U_-id sub-key: text is the glyph; output is omitted (kmc-kmn derives it from U_ id).
    expect(sk[0]!["id"]).toBe("U_00E1");
    expect(sk[0]!["text"]).toBe("á");
    expect(sk[0]!["output"]).toBeUndefined();
  });

  it("flick entry appears in emitted JSON at the correct direction with U_ id", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [flick("K_A", "n", "à")]);

    const emitted = JSON.parse(emitTouchLayout(out)) as Record<string, unknown>;
    const phoneLayer = (emitted["phone"] as Record<string, unknown>);
    const layers = phoneLayer["layer"] as Array<{ id: string; row: Array<{ key: unknown[] }> }>;
    const defaultLayer = layers.find((l) => l.id === "default")!;
    const row0 = defaultLayer.row[0]!;
    const keyA = (row0.key as Array<Record<string, unknown>>).find((k) => k["id"] === "K_A")!;

    expect(keyA["flick"]).toBeDefined();
    const flickMap = keyA["flick"] as Record<string, Record<string, unknown>>;
    expect(flickMap["n"]!["id"]).toBe("U_00E0");
    expect(flickMap["n"]!["text"]).toBe("à");
    expect(flickMap["n"]!["output"]).toBeUndefined();
  });

  it("multitap entry appears in emitted JSON with U_ id", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out } = applyTouchAssignments(layout, [multitap("K_A", "â")]);

    const emitted = JSON.parse(emitTouchLayout(out)) as Record<string, unknown>;
    const phoneLayer = (emitted["phone"] as Record<string, unknown>);
    const layers = phoneLayer["layer"] as Array<{ id: string; row: Array<{ key: unknown[] }> }>;
    const defaultLayer = layers.find((l) => l.id === "default")!;
    const row0 = defaultLayer.row[0]!;
    const keyA = (row0.key as Array<Record<string, unknown>>).find((k) => k["id"] === "K_A")!;

    expect(Array.isArray(keyA["multitap"])).toBe(true);
    const mt = keyA["multitap"] as Array<Record<string, unknown>>;
    expect(mt[0]!["id"]).toBe("U_00E2");
    expect(mt[0]!["text"]).toBe("â");
    expect(mt[0]!["output"]).toBeUndefined();
  });
});
