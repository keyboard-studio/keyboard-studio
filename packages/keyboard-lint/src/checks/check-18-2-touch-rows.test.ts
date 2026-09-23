import { describe, it, expect } from "vitest";
import { checkTouchRows } from "./check-18-2-touch-rows.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchLayout } from "@keyboard-studio/contracts/fixtures";

const PATH = "source/test.keyman-touch-layout";

function makeIR(platform: "phone" | "tablet" | "desktop", rowCount: number): TouchLayoutIR {
  const rows = Array.from({ length: rowCount }, () => ({ keys: [] as [] }));
  return touchLayout({ platform, layers: [{ id: "default", rows }] });
}

describe("checkTouchRows (18.2 KM_WARN_TOUCH_ROW_COUNT)", () => {
  it("passes for phone with 4 rows", () => {
    expect(checkTouchRows(makeIR("phone", 4), PATH)).toEqual([]);
  });

  it("passes for phone with 5 rows", () => {
    expect(checkTouchRows(makeIR("phone", 5), PATH)).toEqual([]);
  });

  it("passes for tablet with 5 rows", () => {
    expect(checkTouchRows(makeIR("tablet", 5), PATH)).toEqual([]);
  });

  it("passes for desktop (no rule)", () => {
    expect(checkTouchRows(makeIR("desktop", 3), PATH)).toEqual([]);
  });

  it("warns for phone with 3 rows (below minimum)", () => {
    const findings = checkTouchRows(makeIR("phone", 3), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_ROW_COUNT");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("warns for phone with 6 rows (above maximum)", () => {
    const findings = checkTouchRows(makeIR("phone", 6), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_ROW_COUNT");
  });

  it("warns for tablet with 4 rows (below minimum)", () => {
    const findings = checkTouchRows(makeIR("tablet", 4), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_ROW_COUNT");
  });

  it("warns for tablet with 6 rows (above maximum)", () => {
    const findings = checkTouchRows(makeIR("tablet", 6), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_ROW_COUNT");
  });
});
