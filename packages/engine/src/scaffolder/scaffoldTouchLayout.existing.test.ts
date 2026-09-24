// scaffoldTouchLayout tests — buildMinimalPhoneTouchLayout and augmenting an existing touchLayout.
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
  buildMinimalPhoneTouchLayout,
} from "./scaffoldTouchLayout.js";
import type {
  IRRule,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  freshId,
  makeMinimalIR,
  makeGroup,
  makeS02Pattern,
} from "./__fixtures__/touchLayout.js";

describe("scaffoldTouchLayout", () => {
  describe("buildMinimalPhoneTouchLayout — compact 3-layer structure", () => {
    it("returns a 3-layer phone layout (default + shift + numeric)", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      expect(phone).toBeDefined();
      const ids = phone.layers.map((l) => l.id);
      expect(ids).toContain("default");
      expect(ids).toContain("shift");
      expect(ids).toContain("numeric");
    });

    it("default layer has 4 rows", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      expect(defaultLayer.rows).toHaveLength(4);
    });

    it("every row in every layer has ≤10 keys", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      for (const layer of phone.layers) {
        for (let i = 0; i < layer.rows.length; i++) {
          const row = layer.rows[i]!;
          expect(
            row.keys.length,
            `layer "${layer.id}" row ${i} has ${row.keys.length} keys`,
          ).toBeLessThanOrEqual(10);
        }
      }
    });

    it("default layer K_SHIFT (row 2) has sp:1 nextlayer:'shift'", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const row2 = defaultLayer.rows[2]!;
      const shift = row2.keys.find((k) => k.id === "K_SHIFT");
      expect(shift?.sp).toBe(1);
      expect(shift?.nextlayer).toBe("shift");
      expect(shift?.text).toBe("*Shift*");
    });

    it("shift layer K_SHIFT (row 2) has sp:2 nextlayer:'default'", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const row2 = shiftLayer.rows[2]!;
      const shift = row2.keys.find((k) => k.id === "K_SHIFT");
      expect(shift?.sp).toBe(2);
      expect(shift?.nextlayer).toBe("default");
    });

    it("K_LOPT has text:'*Menu*', K_ENTER has text:'*Enter*'", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const funcRow = defaultLayer.rows[3]!;

      const lopt = funcRow.keys.find((k) => k.id === "K_LOPT");
      const enter = funcRow.keys.find((k) => k.id === "K_ENTER");

      expect(lopt?.text).toBe("*Menu*");
      expect(enter?.text).toBe("*Enter*");
    });

    it("default layer uses lowercase US keycaps (K_A → 'a', K_Q → 'q')", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);

      expect(allKeys.find((k) => k.id === "K_A")?.text).toBe("a");
      expect(allKeys.find((k) => k.id === "K_Q")?.text).toBe("q");
    });

    it("shift layer uses uppercase US keycaps (K_A → 'A', K_Q → 'Q')", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const allKeys = shiftLayer.rows.flatMap((r) => r.keys);

      expect(allKeys.find((k) => k.id === "K_A")?.text).toBe("A");
      expect(allKeys.find((k) => k.id === "K_Q")?.text).toBe("Q");
    });
  });

  // ---------------------------------------------------------------------------
  // augments existing touchLayout (Case B)
  // ---------------------------------------------------------------------------

  describe("augments existing touchLayout", () => {
    it("when ir.touchLayout is already set, the function returns a TouchLayoutIR without throwing", () => {
      const existingPhoneLayer = {
        id: "default",
        rows: [
          {
            keys: [
              {
                nodeId: freshId("key"),
                id: "K_A",
                text: "a",
                output: "a",
              },
            ],
          },
        ],
      };

      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [existingPhoneLayer],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });

      let result: TouchLayoutIR | undefined;
      expect(() => {
        result = scaffoldTouchLayout(ir);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result!.platforms).toBeDefined();
    });

    it("when ir.touchLayout has a phone platform, that platform is preserved in the result", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
    });

    it("when ir.touchLayout is set without a phone platform, a phone platform is added", () => {
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "tablet",
            layers: [
              {
                id: "default",
                rows: [{ keys: [{ nodeId: freshId("key"), id: "K_A" }] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
      const tablet = result.platforms.find((p) => p.id === "tablet");
      expect(tablet).toBeDefined();
    });

    it("when ir.touchLayout is set with existing nodeIds, they are preserved in the result", () => {
      const existingNodeEntry: [string, import("@keyboard-studio/contracts").IRNodeRef] = [
        "phone:default:K_A",
        { nodeId: "existing_node_1", kind: "rule" },
      ];
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [{ nodeId: "existing_node_1", id: "K_A" }] }],
              },
            ],
          },
        ],
        nodeIds: [existingNodeEntry],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      expect(result.nodeIds).toContainEqual(existingNodeEntry);
    });

    it("augments sk[] from S-02 deadkey patterns into the existing phone platform's default layer", () => {
      const vkey = "K_E";
      const successorChar = "ê";
      const ownedNodeId = freshId("rule");

      const existingKey = {
        nodeId: freshId("key"),
        id: vkey,
        text: "e",
        output: "e",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
        touchLayout: existingTouchLayout,
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
      const skTexts = targetKey?.sk?.map((s) => s.text);
      expect(skTexts).toContain(successorChar);
    });
  });
});
