import { describe, it, expect } from "vitest";
import { checkTouchReplaceShadow } from "./check-18-13-touch-replace-shadow.js";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

const PATH = "source/test.keyman-touch-layout";

function makeIR(keys: TouchKeyIR[]): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [
          {
            id: "default",
            rows: [{ keys }],
          },
        ],
      },
    ],
    nodeIds: [],
  };
}

describe("checkTouchReplaceShadow (18.13 KM_WARN_TOUCH_REPLACE_SHADOWS_ALTERNATE)", () => {
  it("warns when the primary output duplicates a longpress alternate by text", () => {
    const ir = makeIR([
      {
        nodeId: "k1",
        id: "K_A",
        text: "â",
        sk: [{ nodeId: "sk1", id: "K_SK_1", text: "â" }],
      },
    ]);
    const findings = checkTouchReplaceShadow(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_REPLACE_SHADOWS_ALTERNATE");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("warns when the primary output duplicates a longpress alternate by derived U_ id only", () => {
    const ir = makeIR([
      {
        nodeId: "k1",
        id: "K_A",
        text: "â",
        sk: [{ nodeId: "sk1", id: "U_00E2" }],
      },
    ]);
    const findings = checkTouchReplaceShadow(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_REPLACE_SHADOWS_ALTERNATE");
  });

  it("does not warn when the replace and the longpress alternate are on different keys", () => {
    const ir = makeIR([
      { nodeId: "k1", id: "K_A", text: "â" },
      {
        nodeId: "k2",
        id: "K_B",
        sk: [{ nodeId: "sk1", id: "K_SK_1", text: "â" }],
      },
    ]);
    expect(checkTouchReplaceShadow(ir, PATH)).toEqual([]);
  });

  it("does not warn on a longpress-only host key (no primary text)", () => {
    const ir = makeIR([
      {
        nodeId: "k1",
        id: "K_A",
        sk: [{ nodeId: "sk1", id: "K_SK_1", text: "â" }],
      },
    ]);
    expect(checkTouchReplaceShadow(ir, PATH)).toEqual([]);
  });

  it("does not warn when a multitap alternate has a different character", () => {
    const ir = makeIR([
      {
        nodeId: "k1",
        id: "K_A",
        text: "â",
        multitap: [{ nodeId: "mt1", id: "K_MT_1", text: "à" }],
      },
    ]);
    expect(checkTouchReplaceShadow(ir, PATH)).toEqual([]);
  });
});
