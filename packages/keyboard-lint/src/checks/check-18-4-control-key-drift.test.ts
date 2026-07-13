import { describe, it, expect } from "vitest";
import { checkControlKeyDrift } from "./check-18-4-control-key-drift.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

const PATH = "source/test.keyman-touch-layout";

/** Build a two-layer IR where K_BKSP appears in both layers. */
function makeIRTwoLayers(
  layer1BkspOpts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number },
  layer2BkspOpts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number }
): TouchLayoutIR {
  function makeRow(
    includeBksp: boolean,
    opts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number },
    rowIdx: number
  ) {
    // Put key at the specified position. Default: rowIdx matches opts.rowIndex or 0.
    if (!includeBksp) return { keys: [{ nodeId: "k-other", id: "K_A" }] };

    const bksp: Record<string, unknown> = { nodeId: "k-bksp", id: "K_BKSP" };
    if (opts.sp !== undefined) bksp["sp"] = opts.sp;
    if (opts.width !== undefined) bksp["width"] = opts.width;

    // Build row with enough filler keys to position K_BKSP at opts.keyIndex
    const keyIdx = opts.keyIndex ?? 0;
    const fillers = Array.from({ length: keyIdx }, (_, i) => ({
      nodeId: `filler-r${rowIdx}-${i}`,
      id: `K_FILLER_${i}`,
    }));
    return { keys: [...fillers, bksp] };
  }

  const rowIdx1 = layer1BkspOpts.rowIndex ?? 0;
  const rowIdx2 = layer2BkspOpts.rowIndex ?? 0;

  function buildRows(
    opts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number },
    rowIdx: number
  ) {
    const rows = Array.from({ length: Math.max(rowIdx + 1, 1) }, (_, i) => {
      if (i === rowIdx) return makeRow(true, opts, i);
      return { keys: [{ nodeId: `filler-row-${i}`, id: "K_FILLER" }] };
    });
    return rows;
  }

  return {
    platforms: [
      {
        id: "phone",
        layers: [
          { id: "default", rows: buildRows(layer1BkspOpts, rowIdx1) },
          { id: "shifted", rows: buildRows(layer2BkspOpts, rowIdx2) },
        ],
      },
    ],
    nodeIds: [],
  };
}

describe("checkControlKeyDrift (18.4 KM_WARN_CONTROL_KEY_DRIFT)", () => {
  it("passes when K_BKSP has identical sp+width across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 1, width: 100 });
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("passes when K_BKSP has no sp/width data (skip comparison)", () => {
    const ir = makeIRTwoLayers({}, {});
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("warns when K_BKSP sp changes across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 2, width: 100 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("warns when K_BKSP width changes across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 1, width: 150 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
  });

  it("warns when K_BKSP position (row) changes across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100, rowIndex: 0 }, { sp: 1, width: 100, rowIndex: 1 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
  });

  it("includes the key id in the message", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 2, width: 100 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings[0]?.message).toContain("K_BKSP");
  });

  it("warns when K_BKSP keeps the same row but changes keyIndex across layers", () => {
    // Both layers: K_BKSP is in row 0; layer 1 puts it at keyIndex 0, layer 2 at keyIndex 2.
    // sp and width are identical so the only drift is the position in the row.
    const ir = makeIRTwoLayers(
      { sp: 1, width: 100, rowIndex: 0, keyIndex: 0 },
      { sp: 1, width: 100, rowIndex: 0, keyIndex: 2 }
    );
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("position in row");
  });

  it("warns when baseline has sp+width but second layer omits both (asymmetric drift)", () => {
    // Baseline layer: K_BKSP has sp:1 and width:100.
    // Second layer: K_BKSP omits both sp and width (undefined).
    // Asymmetric presence of sp/width IS drift per design decision.
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, {});
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("sp changed from 1");
    expect(findings[0]?.message).toContain("unset");
  });

  it("passes (no finding) when both layers have neither sp nor width and position is unchanged", () => {
    // Neither layer sets sp or width; position is the same in both.
    // No drift of any kind, so no finding expected.
    const ir = makeIRTwoLayers({}, {});
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("warns on position drift even when neither layer has sp/width data", () => {
    // Both layers omit sp and width, but K_BKSP moves to a different row.
    // Position drift must be flagged regardless of sp/width presence.
    const ir = makeIRTwoLayers({ rowIndex: 0 }, { rowIndex: 1 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("row changed");
  });

  // ---------------------------------------------------------------------
  // Two-platform regression coverage: walkTouchKeys' baseline map must reset
  // when the walk crosses from one platform to the next. A prior extraction
  // introduced a `currentPlatform` guard inside checkControlKeyDrift's callback
  // specifically to reset `baseline` on the platform boundary; these tests
  // exercise that guard directly rather than trusting single-platform fixtures.
  // ---------------------------------------------------------------------

  /**
   * Build a two-platform IR. Each platform has two layers ("default",
   * "shifted") and a K_BKSP key positioned per that platform's opts (row/keyIndex
   * padded with filler keys so the requested position is real, not just declared).
   */
  function makeTwoPlatformIR(
    phoneOpts: { sp: number; width: number },
    tabletDefaultOpts: { sp: number; width: number },
    tabletShiftedOpts: { sp: number; width: number },
  ): TouchLayoutIR {
    function bkspRowAt(rowIdx: number, keyIdx: number, nodeId: string, opts: { sp: number; width: number }) {
      const fillers = Array.from({ length: keyIdx }, (_, i) => ({
        nodeId: `filler-${nodeId}-${i}`,
        id: `K_FILLER_${i}`,
      }));
      return {
        keys: [...fillers, { nodeId, id: "K_BKSP", sp: opts.sp, width: opts.width }],
      };
    }
    function padRows(rowIdx: number, bkspRow: ReturnType<typeof bkspRowAt>) {
      return Array.from({ length: Math.max(rowIdx + 1, 1) }, (_, i) =>
        i === rowIdx ? bkspRow : { keys: [{ nodeId: `pad-${rowIdx}-${i}`, id: "K_FILLER" }] },
      );
    }

    return {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: padRows(0, bkspRowAt(0, 0, "phone-default-bksp", phoneOpts)) },
            { id: "shifted", rows: padRows(0, bkspRowAt(0, 0, "phone-shifted-bksp", phoneOpts)) },
          ],
        },
        {
          id: "tablet",
          layers: [
            { id: "default", rows: padRows(2, bkspRowAt(2, 3, "tablet-default-bksp", tabletDefaultOpts)) },
            { id: "shifted", rows: padRows(2, bkspRowAt(2, 3, "tablet-shifted-bksp", tabletShiftedOpts)) },
          ],
        },
      ],
      nodeIds: [],
    };
  }

  it("does not flag drift across a platform boundary when geometry legitimately differs per platform (no false positive)", () => {
    // phone: sp=1/width=100/row0/keyIndex0 in both layers (internally consistent).
    // tablet: sp=5/width=200/row2/keyIndex3 in both layers (internally consistent,
    // but deliberately different from phone's baseline). If the baseline map
    // were not reset at the platform boundary, tablet's first key would be
    // compared against phone's stale baseline and spuriously flagged as drift.
    const ir = makeTwoPlatformIR({ sp: 1, width: 100 }, { sp: 5, width: 200 }, { sp: 5, width: 200 });
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("still detects real drift within the second platform after the baseline reset (no false negative)", () => {
    // phone: consistent (no drift). tablet: shifted layer's width diverges from
    // tablet's own default layer. This proves the reset baseline is still being
    // populated and compared correctly on the second platform, not simply
    // disabled — exactly one finding, scoped to "tablet".
    const ir = makeTwoPlatformIR({ sp: 1, width: 100 }, { sp: 5, width: 200 }, { sp: 5, width: 250 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("tablet");
    expect(findings[0]?.message).toContain("width changed from 200");
  });
});
