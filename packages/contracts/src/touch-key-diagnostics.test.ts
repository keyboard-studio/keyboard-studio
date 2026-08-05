/**
 * Unit tests for the shared touch-key diagnostic detectors (spec 058 T114).
 *
 * ## Scope: the NET-NEW detectors and the aggregator, not the migrated six
 *
 * Six of these detectors were extracted from the Phase 4 Layer C checks so both
 * surfaces could share one implementation (FR-040). Those six are already
 * covered, exemption by exemption, by `keyboard-lint`'s own T041 suites
 * (`check-18-6-touch-coverage.test.ts`, `check-18-4-control-key-drift.test.ts`,
 * `check-18-5-layer-switch-return.test.ts`) — which now exercise these very
 * functions through their prose formatters, and are the regression proof that
 * the extraction preserved behaviour. Re-asserting them here would duplicate 115
 * passing assertions to test the same code twice.
 *
 * What has NO coverage anywhere else, and is therefore what this file tests:
 *
 *   1. `findUnidentifiedTouchKeys` (0x099) — net-new at T114.
 *   2. `findSpecialLabelOnNormalKeys` (0x0A9) — net-new at T114.
 *   3. The structured `fields` / `fixes` / `scope` the migrated detectors now
 *      emit, which the Layer C tests cannot see (they assert on composed prose).
 *   4. `computeTouchKeyDiagnostics` / `groupTouchKeyFindingsByAddress`.
 */

import { describe, it, expect } from "vitest";
import type { KeyboardIR, TouchKeyIR, TouchKeyRuleIndex, TouchLayoutIR } from "./keyboard-ir";
import {
  computeTouchKeyDiagnostics,
  findMissingRequiredTouchKeys,
  findMissingTouchLayers,
  findSpecialLabelOnNormalKeys,
  findUnidentifiedTouchKeys,
  groupTouchKeyFindingsByAddress,
  touchKeyFindingScope,
  type TouchKeyFinding,
} from "./touch-key-diagnostics";
import { touchKeyAddress } from "./touch-key-address";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function key(id: string, extra: Partial<Omit<TouchKeyIR, "nodeId" | "id">> = {}): TouchKeyIR {
  return { nodeId: `n-${id || "empty"}`, id, ...extra };
}

/** One platform ("phone"), one layer per entry, one row each. */
function makeLayout(
  layers: ReadonlyArray<{ id: string; keys: readonly TouchKeyIR[] }>,
): TouchLayoutIR {
  return {
    platforms: [
      { id: "phone", layers: layers.map((l) => ({ id: l.id, rows: [{ keys: [...l.keys] }] })) },
    ],
    nodeIds: [],
  };
}

function oneLayer(...keys: readonly TouchKeyIR[]): TouchLayoutIR {
  return makeLayout([{ id: "default", keys }]);
}

function emptyRuleIndex(opaqueFragmentCount = 0): TouchKeyRuleIndex {
  return { byId: new Map(), spellings: new Map(), producingIds: new Set(), opaqueFragmentCount };
}

/** The minimum `KeyboardIR` the joined detectors read: `raw` (opaque count) and `touchLayout`. */
function irWith(layout: TouchLayoutIR, raw: readonly unknown[] = []): KeyboardIR {
  return { raw, touchLayout: layout } as unknown as KeyboardIR;
}

function codes(findings: readonly TouchKeyFinding[]): string[] {
  return findings.map((f) => f.code);
}

// ---------------------------------------------------------------------------
// 0x099 — findUnidentifiedTouchKeys (net-new)
// ---------------------------------------------------------------------------

describe("findUnidentifiedTouchKeys (0x099)", () => {
  it("reports an id outside K_ / T_ / U_", () => {
    const findings = findUnidentifiedTouchKeys(oneLayer(key("MYKEY", { sp: 0 })));
    expect(codes(findings)).toEqual(["TOUCH_KEY_UNIDENTIFIED"]);
    expect(findings[0]?.fields.keyId).toBe("MYKEY");
    expect(findings[0]?.fields.empty).toBe(false);
    expect(findings[0]?.address).toBe(touchKeyAddress("phone", "default", "MYKEY"));
  });

  it("reports an empty id, and flags it as empty so the copy can differ", () => {
    const findings = findUnidentifiedTouchKeys(oneLayer(key("", { sp: 0 })));
    expect(codes(findings)).toEqual(["TOUCH_KEY_UNIDENTIFIED"]);
    expect(findings[0]?.fields.empty).toBe(true);
  });

  it.each(["K_QUOTE", "T_ANYTHING", "U_0301", "t_lowercase", "u_00e9"])(
    "accepts the recognised prefix %s (case-insensitively)",
    (id) => {
      expect(findUnidentifiedTouchKeys(oneLayer(key(id, { sp: 0 })))).toEqual([]);
    },
  );

  it("exempts a non-interactive key — an empty id on a spacer is the corpus idiom", () => {
    expect(findUnidentifiedTouchKeys(oneLayer(key("", { sp: 10 })))).toEqual([]);
    expect(findUnidentifiedTouchKeys(oneLayer(key("nonsense", { sp: 9 })))).toEqual([]);
  });

  it("descends into sub-keys, anchoring the finding on the addressable PARENT", () => {
    const parent = key("K_A", { sp: 0, sk: [key("bad-sub", { sp: 0 })] });
    const findings = findUnidentifiedTouchKeys(oneLayer(parent));
    expect(codes(findings)).toEqual(["TOUCH_KEY_UNIDENTIFIED"]);
    // The offending id is preserved, but the ADDRESS names the parent cell —
    // a sub-key has no cell of its own in the grid to render a finding on.
    expect(findings[0]?.fields.keyId).toBe("bad-sub");
    expect(findings[0]?.fields.subKeyOf).toBe("K_A");
    expect(findings[0]?.address).toBe(touchKeyAddress("phone", "default", "K_A"));
  });

  it("reports the same bad id once per (layer, key) occurrence, not once globally", () => {
    // Unlike a dead `T_` key (one id, one shared rule gap), an unresolvable id is
    // a property of the occurrence — and an empty id gives nothing to dedup on.
    const layout = makeLayout([
      { id: "default", keys: [key("bad", { sp: 0 })] },
      { id: "shift", keys: [key("bad", { sp: 0 })] },
    ]);
    expect(findUnidentifiedTouchKeys(layout)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 0x0A9 — findSpecialLabelOnNormalKeys (net-new)
// ---------------------------------------------------------------------------

describe("findSpecialLabelOnNormalKeys (0x0A9)", () => {
  it("reports a *…* label on an ordinary character key", () => {
    const findings = findSpecialLabelOnNormalKeys(oneLayer(key("T_A", { sp: 0, text: "*Shift*" })));
    expect(codes(findings)).toEqual(["TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL"]);
    expect(findings[0]?.fields.text).toBe("*Shift*");
    expect(findings[0]?.fixes.map((f) => f.kind)).toEqual(["clearSpecialLabel", "markAsFrameKey"]);
  });

  it("reports it on a key with no sp at all (the implicit character class)", () => {
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_A", { text: "*abc*" })))).toHaveLength(1);
  });

  it("reports it on a deadkey-STYLED key — sp:8 is interactive and draws a caption", () => {
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_A", { sp: 8, text: "*Menu*" })))).toHaveLength(1);
  });

  it.each([1, 2])("exempts frame class sp:%i — the legitimate home for the label", (sp) => {
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("K_SHIFT", { sp, text: "*Shift*" })))).toEqual([]);
  });

  it.each([9, 10])("exempts non-interactive sp:%i — no caption to be wrong about", (sp) => {
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_BLANK", { sp, text: "*Shift*" })))).toEqual([]);
  });

  it("does not fire on ordinary text, including a lone asterisk or an unclosed one", () => {
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_A", { sp: 0, text: "a" })))).toEqual([]);
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_B", { sp: 0, text: "*" })))).toEqual([]);
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_C", { sp: 0, text: "*Shift" })))).toEqual([]);
    // `*` around a non-word run is not the special-label form either.
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_D", { sp: 0, text: "* *" })))).toEqual([]);
  });

  it("does not fire on a key with no text", () => {
    expect(findSpecialLabelOnNormalKeys(oneLayer(key("T_A", { sp: 0 })))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The structured shape the Layer C prose tests cannot see
// ---------------------------------------------------------------------------

describe("structured fields, fixes, and scope", () => {
  it("scopes a missing-required-keys finding to the LAYER, addressing the key that would be added", () => {
    const findings = findMissingRequiredTouchKeys(oneLayer(key("T_A", { sp: 0 })));
    expect(codes(findings)).toEqual(["TOUCH_KEY_MISSING_REQUIRED_KEYS"]);
    const finding = findings[0]!;
    expect(touchKeyFindingScope(finding)).toBe("layer");
    expect(finding.fields.missingKeyIds).toEqual(["K_LOPT", "K_BKSP", "K_ENTER"]);
    // The address the FIRST missing key would have: well-formed, and exactly
    // what the fix needs, while resolving against no cell in the grid.
    expect(finding.address).toBe(touchKeyAddress("phone", "default", "K_LOPT"));
    expect(finding.fixes).toEqual([
      {
        kind: "addRequiredKeys",
        address: touchKeyAddress("phone", "default", "K_LOPT"),
        platform: "phone",
        layerId: "default",
        keyIds: ["K_LOPT", "K_BKSP", "K_ENTER"],
      },
    ]);
  });

  it("counts a required key provided as a longpress as present, matching upstream's accumulator", () => {
    const layout = oneLayer(
      key("K_LOPT", { sp: 1 }),
      key("K_ENTER", { sp: 1 }),
      key("T_A", { sp: 0, sk: [key("K_BKSP", { sp: 1 })] }),
    );
    expect(findMissingRequiredTouchKeys(layout)).toEqual([]);
  });

  it("offers repoint-or-remove for a dangling nextlayer, with the platform's real layer ids as candidates", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("K_SHIFT", { sp: 1, nextlayer: "nowhere" })] },
      { id: "shift", keys: [key("K_A", { sp: 0 })] },
    ]);
    const findings = findMissingTouchLayers(layout);
    expect(codes(findings)).toEqual(["TOUCH_KEY_MISSING_LAYER"]);
    const finding = findings[0]!;
    // Key-scoped: this one DOES anchor to a real, selectable cell.
    expect(touchKeyFindingScope(finding)).toBe("key");
    expect(finding.address).toBe(touchKeyAddress("phone", "default", "K_SHIFT"));
    expect(finding.fields.target).toBe("nowhere");
    expect(finding.fixes).toEqual([
      {
        kind: "repointNextlayer",
        address: touchKeyAddress("phone", "default", "K_SHIFT"),
        from: "nowhere",
        candidates: ["default", "shift"],
      },
      { kind: "removeNextlayer", address: touchKeyAddress("phone", "default", "K_SHIFT") },
    ]);
  });

  it("gives every finding at least one fix (FR-041)", () => {
    // A layout carrying several distinct defects at once.
    const layout = makeLayout([
      {
        id: "default",
        keys: [
          key("T_DEAD", { sp: 0 }),
          key("MYKEY", { sp: 0 }),
          key("T_LBL", { sp: 0, text: "*Shift*" }),
          key("K_SHIFT", { sp: 1, nextlayer: "nowhere" }),
          key("T_DUP", { sp: 0 }),
          key("T_DUP", { sp: 0 }),
        ],
      },
    ]);
    const findings = computeTouchKeyDiagnostics({
      ir: irWith(layout),
      layout,
      ruleIndex: emptyRuleIndex(),
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.fixes.length, `no fix for ${finding.code}`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The aggregator
// ---------------------------------------------------------------------------

describe("computeTouchKeyDiagnostics", () => {
  it("returns nothing for a clean layout", () => {
    const layout = oneLayer(key("K_LOPT", { sp: 1 }), key("K_BKSP", { sp: 1 }), key("K_ENTER", { sp: 1 }));
    expect(
      computeTouchKeyDiagnostics({ ir: irWith(layout), layout, ruleIndex: emptyRuleIndex() }),
    ).toEqual([]);
  });

  it("collects every distinct code the layout earns", () => {
    const layout = makeLayout([
      {
        id: "default",
        keys: [
          key("K_LOPT", { sp: 1 }),
          key("K_BKSP", { sp: 1 }),
          key("K_ENTER", { sp: 1 }),
          key("T_DEAD", { sp: 0 }),
          key("MYKEY", { sp: 0 }),
          key("T_LBL", { sp: 0, text: "*Shift*" }),
          key("K_SW", { sp: 1, nextlayer: "nowhere" }),
        ],
      },
    ]);
    const found = new Set(
      codes(computeTouchKeyDiagnostics({ ir: irWith(layout), layout, ruleIndex: emptyRuleIndex() })),
    );
    expect(found).toContain("TOUCH_KEY_NO_RULE");
    expect(found).toContain("TOUCH_KEY_UNIDENTIFIED");
    expect(found).toContain("TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL");
    expect(found).toContain("TOUCH_KEY_MISSING_LAYER");
    // Excluded by construction: the one code that reads the overlay, not a
    // layout. Engine's `computeAllTouchKeyDiagnostics` composes that one in.
    expect(found).not.toContain("TOUCH_KEY_MIXED_SUPPRESS_REMOVE");
  });

  it("downgrades the dead-key finding to a hint when the IR carries opaque fragments", () => {
    const layout = oneLayer(
      key("K_LOPT", { sp: 1 }),
      key("K_BKSP", { sp: 1 }),
      key("K_ENTER", { sp: 1 }),
      key("T_DEAD", { sp: 0 }),
    );
    const clean = computeTouchKeyDiagnostics({
      ir: irWith(layout),
      layout,
      ruleIndex: emptyRuleIndex(),
    });
    const opaque = computeTouchKeyDiagnostics({
      ir: irWith(layout, [{}]),
      layout,
      ruleIndex: emptyRuleIndex(1),
    });
    expect(clean.find((f) => f.code === "TOUCH_KEY_NO_RULE")?.severity).toBe("warning");
    expect(opaque.find((f) => f.code === "TOUCH_KEY_NO_RULE")?.severity).toBe("hint");
  });

  it("emits no `error` severity — 0x05A is the only touch error and it routes to rejection instead", () => {
    const layout = makeLayout([
      { id: "default", keys: [key("T_DEAD", { sp: 0 }), key("9BAD", { sp: 0 }), key("T_LBL", { sp: 0, text: "*x*" })] },
    ]);
    const findings = computeTouchKeyDiagnostics({
      ir: irWith(layout),
      layout,
      ruleIndex: emptyRuleIndex(),
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity !== "error")).toBe(true);
  });
});

describe("groupTouchKeyFindingsByAddress", () => {
  it("buckets by address and keeps every finding, layer- and rule-scoped ones included", () => {
    const layout = oneLayer(key("T_DEAD", { sp: 0 }));
    const findings = computeTouchKeyDiagnostics({
      ir: irWith(layout),
      layout,
      ruleIndex: emptyRuleIndex(),
    });
    const byAddress = groupTouchKeyFindingsByAddress(findings);
    const total = [...byAddress.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(findings.length);
    // The dead key's own cell address resolves; the layer-scoped
    // missing-required-keys finding sits under an address no cell will match,
    // which is how the grid tells the two apart.
    expect(byAddress.get(touchKeyAddress("phone", "default", "T_DEAD"))?.map((f) => f.code)).toEqual([
      "TOUCH_KEY_NO_RULE",
    ]);
  });

  it("returns an empty map for no findings", () => {
    expect(groupTouchKeyFindingsByAddress([]).size).toBe(0);
  });
});
