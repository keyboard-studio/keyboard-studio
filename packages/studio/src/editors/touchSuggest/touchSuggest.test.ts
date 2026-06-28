// Tests for the touch-suggest seams (P4a scaffolds + spec-014 US2 T023 body).
//
// These tests pin:
//   1. defaultProvenance() returns "hand-set" (provenance.ts, T018).
//   2. DEFAULT_TOUCH_SUGGEST_POLICY has the expected field values (defaults.ts, T019).
//   3. Policy fields are overridable individually without clobbering other fields.
//   4. touchSuggest() derives a provenance-stamped TouchLayoutIR from a
//      KeyboardIR (spec-014 T023): never `hand-set`; `base-derived` for keys
//      carried from the base layout, `physical-suggested` otherwise.
//   5. touchSuggest() accepts and merges policyOverrides without throwing.

import { describe, it, expect } from "vitest";
import {
  defaultProvenance,
} from "../assignLoop/provenance.ts";
import {
  DEFAULT_TOUCH_SUGGEST_POLICY,
} from "./defaults.ts";
import type { TouchSuggestPolicy } from "./defaults.ts";
import { touchSuggest } from "./touchSuggest.ts";
import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";

// A minimal physical IR (Case A — no shipped touch layout). The exact
// derivation is the engine's concern; the tests assert the provenance LAYER
// touchSuggest adds on top.
function physicalIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "ts",
      name: "TS",
      bcp47: ["en"],
      copyright: "(c)",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function allKeys(layout: TouchLayoutIR): TouchKeyIR[] {
  const out: TouchKeyIR[] = [];
  for (const p of layout.platforms) for (const l of p.layers) for (const r of l.rows) out.push(...r.keys);
  return out;
}

// ---------------------------------------------------------------------------
// T018 — TouchKeyProvenance default
// ---------------------------------------------------------------------------

describe("defaultProvenance", () => {
  it("returns 'hand-set' as the default provenance", () => {
    expect(defaultProvenance()).toBe("hand-set");
  });

  it("is a valid TouchKeyProvenance literal", () => {
    const p = defaultProvenance();
    const valid = ["base-derived", "physical-suggested", "hand-set"] as const;
    expect(valid).toContain(p);
  });
});

// ---------------------------------------------------------------------------
// T019 — TouchSuggestPolicy defaults
// ---------------------------------------------------------------------------

describe("DEFAULT_TOUCH_SUGGEST_POLICY", () => {
  it("has widthBudget of 10", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.widthBudget).toBe(10);
  });

  it("targets symbol-layer for number-row characters", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.numberRowTarget).toBe("symbol-layer");
  });

  it("uses long-press-demotion for modifier policy", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.modifierPolicy).toBe(
      "long-press-demotion"
    );
  });

  it("hosts dead-key output on the base character", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.deadKeyHost).toBe("base");
  });

  it("defaults to long-press gesture", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.defaultGesture).toBe("long-press");
  });

  it("is structurally complete — all required fields present", () => {
    const required: Array<keyof TouchSuggestPolicy> = [
      "widthBudget",
      "numberRowTarget",
      "modifierPolicy",
      "deadKeyHost",
      "defaultGesture",
    ];
    for (const field of required) {
      expect(DEFAULT_TOUCH_SUGGEST_POLICY).toHaveProperty(field);
    }
  });

  it("policy is overridable per-field without clobbering siblings", () => {
    const override: Partial<TouchSuggestPolicy> = { widthBudget: 11 };
    const merged: TouchSuggestPolicy = {
      ...DEFAULT_TOUCH_SUGGEST_POLICY,
      ...override,
    };

    // Overridden field
    expect(merged.widthBudget).toBe(11);

    // Sibling fields preserved
    expect(merged.numberRowTarget).toBe(
      DEFAULT_TOUCH_SUGGEST_POLICY.numberRowTarget
    );
    expect(merged.modifierPolicy).toBe(
      DEFAULT_TOUCH_SUGGEST_POLICY.modifierPolicy
    );
    expect(merged.deadKeyHost).toBe(DEFAULT_TOUCH_SUGGEST_POLICY.deadKeyHost);
    expect(merged.defaultGesture).toBe(
      DEFAULT_TOUCH_SUGGEST_POLICY.defaultGesture
    );
  });

  it("numberRowTarget override does not affect other fields", () => {
    const merged: TouchSuggestPolicy = {
      ...DEFAULT_TOUCH_SUGGEST_POLICY,
      numberRowTarget: "numeric-layer",
    };
    expect(merged.numberRowTarget).toBe("numeric-layer");
    expect(merged.widthBudget).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// T023 — touchSuggest generator body (provenance-stamped TouchLayoutIR)
// ---------------------------------------------------------------------------

describe("touchSuggest (spec-014 T023 body)", () => {
  it("derives a TouchLayoutIR with at least one platform", () => {
    const layout = touchSuggest({ physicalIR: physicalIR() });
    expect(layout.platforms.length).toBeGreaterThan(0);
    expect(Array.isArray(layout.nodeIds)).toBe(true);
  });

  it("stamps a provenance on every produced key, and NEVER hand-set", () => {
    const layout = touchSuggest({ physicalIR: physicalIR() });
    const keys = allKeys(layout);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.provenance).toBeDefined();
      expect(k.provenance).not.toBe("hand-set");
      expect(["base-derived", "physical-suggested"]).toContain(k.provenance);
    }
  });

  it("Case A (no shipped touch layout) stamps every key physical-suggested", () => {
    const layout = touchSuggest({ physicalIR: physicalIR() });
    for (const k of allKeys(layout)) {
      expect(k.provenance).toBe("physical-suggested");
    }
  });

  it("Case B keys carried from the base layout are tagged base-derived", () => {
    // Seed an IR that already ships a touch layout; its key ids should come
    // back tagged base-derived (carried through unchanged).
    const ir = physicalIR();
    const baseKey: TouchKeyIR = { nodeId: "nb", id: "K_SEED", text: "z" };
    ir.touchLayout = {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys: [baseKey] }] }] }],
      nodeIds: [],
    };
    const layout = touchSuggest({ physicalIR: ir });
    const seeded = allKeys(layout).find((k) => k.id === "K_SEED");
    expect(seeded?.provenance).toBe("base-derived");
  });

  it("is pure — does not mutate the input IR", () => {
    const ir = physicalIR();
    const snapshot = JSON.stringify(ir);
    touchSuggest({ physicalIR: ir });
    expect(JSON.stringify(ir)).toBe(snapshot);
  });

  it("does not throw when policyOverrides is provided", () => {
    expect(() =>
      touchSuggest({
        physicalIR: physicalIR(),
        policyOverrides: { widthBudget: 11 },
      })
    ).not.toThrow();
  });

  it("does not throw when policyOverrides overrides all fields", () => {
    const fullOverride: TouchSuggestPolicy = {
      widthBudget: 12,
      numberRowTarget: "numeric-layer",
      modifierPolicy: "long-press-demotion",
      deadKeyHost: "base",
      defaultGesture: "long-press",
    };
    expect(() =>
      touchSuggest({ physicalIR: physicalIR(), policyOverrides: fullOverride })
    ).not.toThrow();
  });
});
