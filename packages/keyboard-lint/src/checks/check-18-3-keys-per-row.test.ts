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

/**
 * Build an IR with a mix of normal keys and NON-INTERACTIVE keys (sp:9 blank or
 * sp:10 spacer).
 *
 * RECOUNT (spec 058 FR-012): the default was `8`, which the corrected
 * `isSpacerKeyClass` set `{9, 10}` no longer treats as non-interactive — sp:8 is
 * deadkey-STYLED and interactive. The default is now `9` (blank), and the sp:8
 * case has its own test below asserting it is COUNTED.
 */
function makeIRWithSpacers(
  platform: "phone" | "tablet" | "desktop",
  normalCount: number,
  spacerCount: number,
  spacerSp: 9 | 10 = 9
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

  it("passes for phone with 10 normal keys + 2 blank keys in a row (sp:9 excluded from count)", () => {
    // 10 normal keys + 2 blanks = 12 total in array, but blank keys (sp:9) are
    // not counted. Effective interactive key count is 10, at the phone limit.
    expect(checkKeysPerRow(makeIRWithSpacers("phone", 10, 2), PATH)).toEqual([]);
  });

  it("warns for phone with 11 normal keys + 2 blank keys (blanks excluded; 11 > 10 limit)", () => {
    // 11 normal + 2 blanks; effective count is 11 which exceeds the phone limit of 10.
    const findings = checkKeysPerRow(makeIRWithSpacers("phone", 11, 2), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_KEYS_PER_ROW");
    // The reported count reflects interactive keys only.
    expect(findings[0]?.message).toContain("11 key(s)");
  });

  it("passes for phone with 10 normal keys + 1 sp:10 padding key (sp:10 spacers excluded)", () => {
    // A padding key (sp:10) is non-interactive too; it must not push the row
    // over the limit. Effective interactive count is 10, at the phone limit.
    expect(checkKeysPerRow(makeIRWithSpacers("phone", 10, 1, 10), PATH)).toEqual([]);
  });

  it("does not miscount a mix of sp:9 blank and sp:10 spacer keys", () => {
    // 10 normal keys + one sp:9 + one sp:10 = 12 in the array, 10 interactive.
    const ir = makeIRWithSpacers("phone", 10, 0);
    ir.platforms[0]!.layers[0]!.rows[0]!.keys.push(
      { nodeId: "sp9", id: "K_SP9", sp: 9 },
      { nodeId: "sp10", id: "K_SP10", sp: 10 },
    );
    expect(checkKeysPerRow(ir, PATH)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // The RECOUNT itself (spec 058 FR-012). These two tests are the deliberate
  // record of which rows changed verdict when `isSpacerKeyClass` was corrected
  // from `{8, 10}` to `{9, 10}`.
  // -------------------------------------------------------------------------

  it("COUNTS a deadkey-styled sp:8 key — it is interactive, not a spacer", () => {
    // Previously sp:8 was excluded, so this row passed at 10. A deadkey-styled
    // key is a real key the user can press and it genuinely contributes to
    // crowding, so 10 normal + 1 sp:8 = 11 interactive and the row now warns.
    const ir = makeIRWithSpacers("phone", 10, 0);
    ir.platforms[0]!.layers[0]!.rows[0]!.keys.push({ nodeId: "sp8", id: "T_DK", sp: 8 });
    const findings = checkKeysPerRow(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("11 key(s)");
  });

  it("EXCLUDES a blank sp:9 key that previously pushed a row over the limit", () => {
    // Previously sp:9 was counted, so 10 normal + 1 sp:9 warned at 11. Blank is
    // non-interactive, so the row now passes at 10.
    const ir = makeIRWithSpacers("phone", 10, 0);
    ir.platforms[0]!.layers[0]!.rows[0]!.keys.push({ nodeId: "sp9", id: "T_BLANK", sp: 9 });
    expect(checkKeysPerRow(ir, PATH)).toEqual([]);
  });
});
