import { describe, it, expect } from "vitest";
import { checkKeysPerRow } from "./check-18-3-keys-per-row.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

const PATH = "source/test.keyman-touch-layout";

function makeIR(platform: "phone" | "tablet" | "desktop", keyCount: number): TouchLayoutIR {
  const keys = Array.from({ length: keyCount }, (_, i) => ({
    nodeId: `k-${i}`,
    id: `K_${i}`,
  }));
  return {
    platforms: [
      {
        id: platform,
        layers: [
          { id: "default", rows: [{ keys }] },
        ],
      },
    ],
    nodeIds: [],
  };
}

/** Build an IR with a mix of normal keys and spacer keys (sp:8 or sp:10). */
function makeIRWithSpacers(
  platform: "phone" | "tablet" | "desktop",
  normalCount: number,
  spacerCount: number,
  spacerSp: 8 | 10 = 8
): TouchLayoutIR {
  const normalKeys = Array.from({ length: normalCount }, (_, i) => ({
    nodeId: `k-${i}`,
    id: `K_${i}`,
  }));
  const spacerKeys = Array.from({ length: spacerCount }, (_, i) => ({
    nodeId: `sp-${i}`,
    id: `K_SP_${i}`,
    sp: spacerSp,
  }));
  return {
    platforms: [
      {
        id: platform,
        layers: [
          { id: "default", rows: [{ keys: [...normalKeys, ...spacerKeys] }] },
        ],
      },
    ],
    nodeIds: [],
  };
}

describe("checkKeysPerRow (18.3 KM_WARN_TOUCH_KEYS_PER_ROW)", () => {
  it("passes for phone with 10 keys in a row (at limit)", () => {
    expect(checkKeysPerRow(makeIR("phone", 10), PATH)).toEqual([]);
  });

  it("passes for tablet with 13 keys in a row (at limit)", () => {
    expect(checkKeysPerRow(makeIR("tablet", 13), PATH)).toEqual([]);
  });

  it("passes for desktop (no rule)", () => {
    expect(checkKeysPerRow(makeIR("desktop", 20), PATH)).toEqual([]);
  });

  it("warns for phone with 11 keys in a row", () => {
    const findings = checkKeysPerRow(makeIR("phone", 11), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_KEYS_PER_ROW");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("warns for tablet with 14 keys in a row", () => {
    const findings = checkKeysPerRow(makeIR("tablet", 14), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_KEYS_PER_ROW");
  });

  it("includes the row index in the message", () => {
    const findings = checkKeysPerRow(makeIR("phone", 11), PATH);
    expect(findings[0]?.message).toContain("row 1");
  });

  it("passes for phone with 10 normal keys + 2 spacer keys in a row (spacers excluded from count)", () => {
    // 10 normal keys + 2 spacers = 12 total in array, but spacers (sp===8) are not counted.
    // Effective interactive key count is 10, which is at the phone limit.
    expect(checkKeysPerRow(makeIRWithSpacers("phone", 10, 2), PATH)).toEqual([]);
  });

  it("warns for phone with 11 normal keys + 2 spacer keys (spacers excluded; 11 > 10 limit)", () => {
    // 11 normal + 2 spacers; effective count is 11 which exceeds the phone limit of 10.
    const findings = checkKeysPerRow(makeIRWithSpacers("phone", 11, 2), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_KEYS_PER_ROW");
    // The reported count reflects non-spacer keys only.
    expect(findings[0]?.message).toContain("11 key(s)");
  });

  it("passes for phone with 10 normal keys + 1 sp:10 padding key (sp:10 spacers excluded)", () => {
    // A padding key (sp:10) is a spacer too; it must not push the row over the
    // limit. Effective interactive count is 10, at the phone limit.
    expect(checkKeysPerRow(makeIRWithSpacers("phone", 10, 1, 10), PATH)).toEqual([]);
  });

  it("does not miscount a mix of sp:8 and sp:10 spacers", () => {
    // 10 normal keys + one sp:8 + one sp:10 = 12 in the array, 10 interactive.
    const ir = makeIRWithSpacers("phone", 10, 0);
    ir.platforms[0]!.layers[0]!.rows[0]!.keys.push(
      { nodeId: "sp8", id: "K_SP8", sp: 8 },
      { nodeId: "sp10", id: "K_SP10", sp: 10 },
    );
    expect(checkKeysPerRow(ir, PATH)).toEqual([]);
  });
});
