// scaffoldTouchLayout tests — provenance tagging (T021).
// Split from the former single scaffoldTouchLayout.test.ts; shared builders live
// in ./scaffoldTouchLayoutHelpers.ts.

import { describe, it, expect } from "vitest";
import {
  scaffoldTouchLayout,
} from "./scaffoldTouchLayout.js";
import { emitTouchLayout } from "../codec/index.js";
import type {
  IRRule,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  freshId,
  makeMinimalIR,
  makeCharRule,
  makeGroup,
  makeS02Pattern,
  getLayer,
} from "./__fixtures__/touchLayout.js";

describe("scaffoldTouchLayout", () => {
  describe("provenance tagging (T021)", () => {
    it("Case A: a generated letter key (buildLetterKey) is tagged physical-suggested", () => {
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");

      expect(kaKey?.provenance).toBe("physical-suggested");
    });

    it("Case A: a US-fallback letter key with no keyMap entry is still tagged physical-suggested", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const qKey = allKeys.find((k) => k.id === "K_Q");

      expect(qKey?.provenance).toBe("physical-suggested");
    });

    it("Case A: sk[] deadkey-augmentation entries attached by buildLetterKey are tagged physical-suggested", () => {
      const vkey = "K_E";
      const successorChar = "é";
      const ownedNodeId = freshId("rule");

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
      });

      const result = scaffoldTouchLayout(ir);
      const defaultLayer = getLayer(result, "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      expect(targetKey.sk).toBeDefined();
      for (const sk of targetKey.sk!) {
        expect(sk.provenance).toBe("physical-suggested");
      }
    });

    it("Case B: a key carried through from an existing ir.touchLayout with no provenance is tagged base-derived", () => {
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

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const carried = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A");

      expect(carried?.provenance).toBe("base-derived");
    });

    it("Case B: a carried-through key with an explicit provenance (e.g. hand-set) is not overwritten", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
        provenance: "hand-set" as const,
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

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const carried = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A");

      expect(carried?.provenance).toBe("hand-set");
    });

    it("Case B: new sk[] deadkey-augmentation entries on a carried-through key are tagged physical-suggested, and the carried-through key itself is tagged base-derived", () => {
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
      const targetKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === vkey)!;

      expect(targetKey.provenance).toBe("base-derived");
      expect(targetKey.sk).toBeDefined();
      for (const sk of targetKey.sk!) {
        expect(sk.provenance).toBe("physical-suggested");
      }
    });

    it("Case B: a carried-through key whose sk[] already covers every deadkey successor gains no duplicate entry, and its existing sk[] keeps original content with carry-through tagging", () => {
      // Exercises the newSk.length === 0 branch of augmentExistingPhoneLayers:
      // the deadkey successor ("ê") is already present in the shipped sk[], so
      // the successor filter leaves nothing new to add and the key must come
      // back with exactly its original sk[] entries — no duplicate — while
      // still receiving the carry-through provenance normalization (untagged
      // entries -> base-derived, explicit hand-set preserved).
      const vkey = "K_E";
      const successorChar = "ê";
      const ownedNodeId = freshId("rule");

      const shippedSuccessorSk = {
        nodeId: freshId("key"),
        id: "U_00EA",
        text: successorChar,
      };
      const shippedHandSetSk = {
        nodeId: freshId("key"),
        id: "K_X",
        text: "x",
        provenance: "hand-set" as const,
      };
      const existingKey = {
        nodeId: freshId("key"),
        id: vkey,
        text: "e",
        output: "e",
        sk: [shippedSuccessorSk, shippedHandSetSk],
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
      const targetKey = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === vkey)!;

      expect(targetKey.provenance).toBe("base-derived");
      // Exactly the two shipped entries — no duplicate for the already-covered successor.
      expect(targetKey.sk).toHaveLength(2);
      const successorEntry = targetKey.sk!.find((s) => s.text === successorChar)!;
      expect(successorEntry.id).toBe(shippedSuccessorSk.id);
      expect(successorEntry.nodeId).toBe(shippedSuccessorSk.nodeId);
      // Untagged shipped entry receives the carry-through normalization...
      expect(successorEntry.provenance).toBe("base-derived");
      // ...while an explicit hand-set entry is preserved untouched.
      const handSetEntry = targetKey.sk!.find((s) => s.text === "x")!;
      expect(handSetEntry.provenance).toBe("hand-set");
    });

    it("Case B: carried-through flick and multitap sub-keys with no existing provenance are tagged base-derived, and explicit tags are preserved", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
        flick: {
          n: { nodeId: freshId("key"), id: "K_A_flick_n", text: "n" },
          s: {
            nodeId: freshId("key"),
            id: "K_A_flick_s",
            text: "s",
            provenance: "hand-set" as const,
          },
        },
        multitap: [
          { nodeId: freshId("key"), id: "K_A_mt_0", text: "0" },
          {
            nodeId: freshId("key"),
            id: "K_A_mt_1",
            text: "1",
            provenance: "hand-set" as const,
          },
        ],
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

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const carried = defaultLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A")!;

      expect(carried.flick?.n?.provenance).toBe("base-derived");
      expect(carried.flick?.s?.provenance).toBe("hand-set");
      expect(carried.multitap?.[0]?.provenance).toBe("base-derived");
      expect(carried.multitap?.[1]?.provenance).toBe("hand-set");
    });

    it("Case B: a carried-through key in a non-default layer (e.g. shift) with no existing provenance is tagged base-derived", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "A",
        output: "A",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              { id: "default", rows: [{ keys: [] }] },
              { id: "shift", rows: [{ keys: [existingKey] }] },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const carried = shiftLayer.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A");

      expect(carried?.provenance).toBe("base-derived");
    });

    it("emitted wire JSON contains no 'provenance' key anywhere", () => {
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });
      const result = scaffoldTouchLayout(ir);

      const json = emitTouchLayout(result);

      expect(json).not.toContain("provenance");

      // Belt-and-braces structural check: walk the parsed JSON and confirm no
      // object anywhere carries a literal "provenance" property.
      const parsed: unknown = JSON.parse(json);
      function walk(value: unknown): void {
        if (Array.isArray(value)) {
          for (const v of value) walk(v);
          return;
        }
        if (value && typeof value === "object") {
          expect(Object.prototype.hasOwnProperty.call(value, "provenance")).toBe(false);
          for (const v of Object.values(value as Record<string, unknown>)) walk(v);
        }
      }
      walk(parsed);
    });
  });

  // ---------------------------------------------------------------------------
  // buildMinimalPhoneTouchLayout — canonical compact structure
  // ---------------------------------------------------------------------------
});
