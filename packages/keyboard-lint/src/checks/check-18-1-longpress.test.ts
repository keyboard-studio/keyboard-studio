import { describe, it, expect } from "vitest";
import { checkLongpress } from "./check-18-1-longpress.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchLayout } from "@keyboard-studio/contracts/fixtures";

const PATH = "source/test.keyman-touch-layout";

function makeIR(skCount: number): TouchLayoutIR {
  const sk = Array.from({ length: skCount }, (_, i) => ({
    nodeId: `sk-${i}`,
    id: `K_SK_${i}`,
  }));
  return touchLayout({ keys: [{ nodeId: "k1", id: "K_A", sk }] });
}

describe("checkLongpress (18.1 KM_WARN_LONGPRESS_OVERSIZE)", () => {
  it("passes when a key has 8 longpress options (at the limit)", () => {
    expect(checkLongpress(makeIR(8), PATH)).toEqual([]);
  });

  it("passes when a key has no longpress options", () => {
    expect(checkLongpress(makeIR(0), PATH)).toEqual([]);
  });

  it("warns when a key has 9 longpress options (> 8)", () => {
    const findings = checkLongpress(makeIR(9), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_LONGPRESS_OVERSIZE");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("errors when a key has 11 longpress options (> 10)", () => {
    const findings = checkLongpress(makeIR(11), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_LONGPRESS_OVERSIZE");
    expect(findings[0]?.severity).toBe("error");
  });

  it("warns (not errors) for exactly 10 longpress options (at hard cap, still over warning threshold)", () => {
    const findings = checkLongpress(makeIR(10), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_LONGPRESS_OVERSIZE");
    expect(findings[0]?.severity).toBe("warning");
  });

  it("sets location.file to the touch-layout path", () => {
    const findings = checkLongpress(makeIR(9), PATH);
    expect(findings[0]?.location?.file).toBe(PATH);
  });

  it("includes the key id and count in the hint", () => {
    const findings = checkLongpress(makeIR(9), PATH);
    expect(findings[0]?.hint).toContain("K_A");
    expect(findings[0]?.hint).toContain("9");
  });
});
