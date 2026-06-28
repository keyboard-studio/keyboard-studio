// Runtime coverage for the spec-014 touch IR schemas (schemas.ts):
// TouchKeyIRSchema / TouchLayoutIRSchema / KeyboardIRSchema.
//
// These assert US3's durability guarantees at the contracts (de)serialization
// boundary (the same boundary US2's no-clobber rule reads):
//   - a KeyboardIR / touch layout with provenance-tagged keys serializes →
//     deserializes with every tag intact (P3/SC-007/FR-010);
//   - an untagged / legacy key deserializes as "hand-set" (FR-009);
//   - an out-of-vocabulary provenance value is rejected by the enum.
//
// @see specs/014-mutate-seam-touch-propagation/contracts/provenance.contract.md
// @see specs/014-mutate-seam-touch-propagation/tasks.md (T026/T028)

import { describe, it, expect } from "vitest";
import {
  TouchKeyIRSchema,
  TouchLayoutIRSchema,
  KeyboardIRSchema,
  TouchKeyProvenanceSchema,
} from "./schemas";
import type { KeyboardIR, TouchLayoutIR } from "./keyboard-ir";

// A touch layout mixing every provenance state + one untagged (legacy) key.
function makeTaggedLayout(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "n1", id: "K_A", text: "a", provenance: "base-derived" },
                  { nodeId: "n2", id: "K_B", text: "b", provenance: "physical-suggested" },
                  { nodeId: "n3", id: "K_C", text: "c", provenance: "hand-set" },
                  // legacy: no provenance field at all
                  { nodeId: "n4", id: "K_D", text: "d" },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [["tablet:default:K_A", { kind: "touchKey", nodeId: "n1" }]],
  };
}

function makeIR(touchLayout: TouchLayoutIR): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "kbd",
      name: "Test",
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
    touchLayout,
    recognizedPatterns: [],
  };
}

describe("TouchKeyProvenanceSchema (spec-014 FR-008)", () => {
  it("accepts the three provenance states", () => {
    for (const v of ["base-derived", "physical-suggested", "hand-set"] as const) {
      expect(TouchKeyProvenanceSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejects an out-of-vocabulary value", () => {
    expect(TouchKeyProvenanceSchema.safeParse("guessed").success).toBe(false);
    expect(TouchKeyProvenanceSchema.safeParse("").success).toBe(false);
  });
});

describe("TouchKeyIRSchema (spec-014 US3)", () => {
  it("preserves an explicit provenance tag", () => {
    const parsed = TouchKeyIRSchema.parse({
      nodeId: "n1",
      id: "K_A",
      provenance: "physical-suggested",
    });
    expect(parsed.provenance).toBe("physical-suggested");
  });

  it("defaults an untagged key to hand-set (FR-009)", () => {
    const parsed = TouchKeyIRSchema.parse({ nodeId: "n1", id: "K_A" });
    expect(parsed.provenance).toBe("hand-set");
  });

  it("defaults provenance on nested subkeys (sk) too", () => {
    const parsed = TouchKeyIRSchema.parse({
      nodeId: "n1",
      id: "K_A",
      sk: [{ nodeId: "n2", id: "K_B" }],
    });
    expect(parsed.sk?.[0]?.provenance).toBe("hand-set");
  });

  it("rejects an out-of-vocabulary provenance", () => {
    expect(
      TouchKeyIRSchema.safeParse({ nodeId: "n1", id: "K_A", provenance: "nope" }).success,
    ).toBe(false);
  });
});

describe("TouchLayoutIRSchema round-trip (P3/SC-007/FR-010)", () => {
  it("round-trips a provenance-tagged layout (serialize → parse) with every tag intact", () => {
    const layout = makeTaggedLayout();
    const wire = JSON.parse(JSON.stringify(layout)) as unknown;
    const parsed = TouchLayoutIRSchema.parse(wire);
    const keys = parsed.platforms[0]?.layers[0]?.rows[0]?.keys;
    expect(keys?.map((k) => k.provenance)).toEqual([
      "base-derived",
      "physical-suggested",
      "hand-set",
      "hand-set", // legacy/untagged → hand-set (FR-009)
    ]);
  });
});

describe("KeyboardIRSchema round-trip (P3/SC-007/FR-010)", () => {
  it("a provenance-tagged KeyboardIR serializes → deserializes with every tag intact", () => {
    const ir = makeIR(makeTaggedLayout());
    const wire = JSON.parse(JSON.stringify(ir)) as unknown;
    const parsed = KeyboardIRSchema.parse(wire);
    const keys =
      (parsed as KeyboardIR).touchLayout?.platforms[0]?.layers[0]?.rows[0]?.keys;
    expect(keys?.[0]?.provenance).toBe("base-derived");
    expect(keys?.[1]?.provenance).toBe("physical-suggested");
    expect(keys?.[2]?.provenance).toBe("hand-set");
  });

  it("an untagged/legacy touch key deserializes as hand-set (FR-009)", () => {
    const ir = makeIR(makeTaggedLayout());
    const parsed = KeyboardIRSchema.parse(JSON.parse(JSON.stringify(ir)));
    const legacy =
      (parsed as KeyboardIR).touchLayout?.platforms[0]?.layers[0]?.rows[0]?.keys[3];
    expect(legacy?.id).toBe("K_D");
    expect(legacy?.provenance).toBe("hand-set");
  });

  it("an IR with no touch layout remains valid (touchLayout optional/additive)", () => {
    const ir = makeIR(makeTaggedLayout());
    delete (ir as { touchLayout?: unknown }).touchLayout;
    const result = KeyboardIRSchema.safeParse(ir);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as KeyboardIR).touchLayout).toBeUndefined();
    }
  });

  it("preserves the non-touch top-level fields through the permissive passthrough", () => {
    const ir = makeIR(makeTaggedLayout());
    const parsed = KeyboardIRSchema.parse(ir) as KeyboardIR;
    expect(parsed.header.keyboardId).toBe("kbd");
    expect(parsed.stores).toEqual([]);
    expect(parsed.origin).toBe("imported");
  });
});
