import { describe, it, expect } from "vitest";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { checkTouchRequiredKeys } from "./check-touch-required-keys.js";

const PATH = "source/demo.keyman-touch-layout";

function layerWithKeys(id: string, keyIds: string[]) {
  return {
    id,
    rows: [
      {
        keys: keyIds.map((kid, i) => ({ nodeId: `k-${id}-${i}`, id: kid })),
      },
    ],
  };
}

function irWithLayers(layers: ReturnType<typeof layerWithKeys>[]): TouchLayoutIR {
  return {
    platforms: [{ id: "phone", layers }],
    nodeIds: [],
  };
}

const FULL = ["K_LOPT", "K_BKSP", "K_ENTER", "K_A"];

describe("checkTouchRequiredKeys (18.14)", () => {
  it("passes layers carrying all required keys", () => {
    const ir = irWithLayers([
      layerWithKeys("default", FULL),
      layerWithKeys("shift", FULL),
    ]);
    const { findings, verified } = checkTouchRequiredKeys(ir, PATH);
    expect(findings).toEqual([]);
    expect(verified[0]).toContain("2 layer(s)");
  });

  it("flags a layer missing K_BKSP and K_ENTER", () => {
    const ir = irWithLayers([
      layerWithKeys("default", FULL),
      layerWithKeys("shift", ["K_LOPT", "K_A"]),
    ]);
    const { findings } = checkTouchRequiredKeys(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe(
      "KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS",
    );
    expect(findings[0]!.message).toContain('"shift"');
    expect(findings[0]!.message).toContain("K_BKSP");
    expect(findings[0]!.message).toContain("K_ENTER");
  });

  it("flags a non-canonical T_BKSP key ID", () => {
    const ir = irWithLayers([
      layerWithKeys("default", ["K_LOPT", "T_BKSP", "K_ENTER", "K_A"]),
    ]);
    const { findings } = checkTouchRequiredKeys(ir, PATH);
    // T_BKSP does not satisfy the K_BKSP requirement AND is non-canonical.
    expect(findings).toHaveLength(2);
    expect(findings[0]!.message).toContain("K_BKSP");
    expect(findings[1]!.message).toContain("T_BKSP");
    expect(findings[1]!.message).toContain("K_BKSP");
  });

  it("counts a required key inside a longpress sub-key as present", () => {
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    { nodeId: "k-lopt", id: "K_LOPT" },
                    { nodeId: "k-enter", id: "K_ENTER" },
                    {
                      nodeId: "k-a",
                      id: "K_A",
                      sk: [{ nodeId: "k-bksp", id: "K_BKSP" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    const { findings } = checkTouchRequiredKeys(ir, PATH);
    expect(findings).toEqual([]);
  });
});
