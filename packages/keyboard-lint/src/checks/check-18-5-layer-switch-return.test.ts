import { describe, it, expect } from "vitest";
import { checkLayerSwitchReturn } from "./check-18-5-layer-switch-return.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchLayout } from "@keyboard-studio/contracts/fixtures";

const PATH = "source/test.keyman-touch-layout";

/** Build a basic IR with a default layer that switches to "symbols", and a "symbols" layer. */
function makeIR(symbolsHasExit: boolean): TouchLayoutIR {
  const symbolsKeys = [
    { nodeId: "k-char", id: "K_1" },
    ...(symbolsHasExit
      ? [{ nodeId: "k-exit", id: "K_BACK", nextlayer: "default" }]
      : []),
  ];
  return touchLayout({
    layers: [
      { id: "default", keys: [{ nodeId: "k-switch", id: "K_SYM", nextlayer: "symbols" }] },
      { id: "symbols", rows: [{ keys: symbolsKeys }] },
    ],
  });
}

describe("checkLayerSwitchReturn (18.5 KM_WARN_LAYER_SWITCH_NO_RETURN)", () => {
  it("passes when the switched-into layer has an exit key", () => {
    expect(checkLayerSwitchReturn(makeIR(true), PATH)).toEqual([]);
  });

  it("warns when the switched-into layer has no exit key", () => {
    const findings = checkLayerSwitchReturn(makeIR(false), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_LAYER_SWITCH_NO_RETURN");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("names the offending layer in the message", () => {
    const findings = checkLayerSwitchReturn(makeIR(false), PATH);
    expect(findings[0]?.message).toContain("symbols");
  });

  it("passes when there are no layer switches at all", () => {
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [{ keys: [{ nodeId: "k1", id: "K_A" }] }],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(checkLayerSwitchReturn(ir, PATH)).toEqual([]);
  });

  it("passes for a layout with mutual layer switches (default <-> symbols)", () => {
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                { keys: [{ nodeId: "k-sw", id: "K_SYM", nextlayer: "symbols" }] },
              ],
            },
            {
              id: "symbols",
              rows: [
                { keys: [{ nodeId: "k-back", id: "K_BACK", nextlayer: "default" }] },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(checkLayerSwitchReturn(ir, PATH)).toEqual([]);
  });

  it("does not warn when a nextlayer target is a non-existent layer (dangling target is out of scope)", () => {
    // A key points to "nonexistent" but that layer id is not defined in this platform.
    // 18.5 skips layers it cannot find (layerKeys.get returns undefined → continue).
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
                    { nodeId: "k-sw", id: "K_SYM", nextlayer: "nonexistent" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(checkLayerSwitchReturn(ir, PATH)).toEqual([]);
  });

  it("warns when the only exit from a switched-into layer is a self-reference (self-loop)", () => {
    // The symbols layer is switched into from default. Its only nextlayer key points
    // back to "symbols" itself — a self-loop provides no real exit.
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                { keys: [{ nodeId: "k-sw", id: "K_SYM", nextlayer: "symbols" }] },
              ],
            },
            {
              id: "symbols",
              rows: [
                {
                  keys: [
                    // Self-referencing nextlayer: points back to its own layer id.
                    { nodeId: "k-self", id: "K_SELF", nextlayer: "symbols" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    const findings = checkLayerSwitchReturn(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_LAYER_SWITCH_NO_RETURN");
    expect(findings[0]?.message).toContain("symbols");
  });

  it("does not warn when a layer only has self-referencing nextlayer keys in the source (not switched-into)", () => {
    // The default layer has a key that points back to "default" itself, but no other
    // layer switches into "default" via nextlayer. Self-references on the default layer
    // should never cause a warning because "default" is not in the switchedInto set.
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [
                { keys: [{ nodeId: "k-self", id: "K_A", nextlayer: "default" }] },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(checkLayerSwitchReturn(ir, PATH)).toEqual([]);
  });

  it("does not warn when the only exit from a switched-into layer is inside an sk sub-array", () => {
    // The exit key lives inside sk (longpress) on the symbols layer. The
    // collectNextlayerKeys() recursion must find it and suppress the warning.
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
                    { nodeId: "k-sw", id: "K_SYM", nextlayer: "symbols" },
                  ],
                },
              ],
            },
            {
              id: "symbols",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "k-char",
                      id: "K_1",
                      // No top-level nextlayer; the exit lives in the sk sub-array.
                      sk: [
                        { nodeId: "k-sk-exit", id: "K_BACK", nextlayer: "default" },
                      ],
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
    expect(checkLayerSwitchReturn(ir, PATH)).toEqual([]);
  });
});
