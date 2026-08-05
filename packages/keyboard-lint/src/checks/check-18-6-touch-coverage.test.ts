import { describe, it, expect } from "vitest";
import { checkTouchCoverage } from "./check-18-6-touch-coverage.js";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

const TOUCH_PATH = "source/test.keyman-touch-layout";

/** Build a single TouchKeyIR for use in test layouts. */
function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

/** Build a TouchLayoutIR with a single "phone" platform from the given layers. */
function makeLayout(layers: TouchLayoutIR["platforms"][number]["layers"]): TouchLayoutIR {
  return { platforms: [{ id: "phone", layers }], nodeIds: [] };
}

describe("checkTouchCoverage (18.6 touch, KM_LINT_TOUCH_UNCOVERED)", () => {
  it("warns for an uncovered inventory char", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const findings = checkTouchCoverage(layout, ["a", "z"], TOUCH_PATH);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_TOUCH_UNCOVERED");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
    // Ratified spec-035 T008 format (shared with TouchGallery's FR-008 gate
    // message via formatUncoveredTouchMessage): `U+XXXX <char> has no touch
    // mechanism`.
    expect(findings[0]?.message).toBe("U+007A z has no touch mechanism.");
    expect(findings[0]?.location?.file).toBe(TOUCH_PATH);
  });

  it("produces no findings when a char is covered via a longpress (sk) entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                sk: [makeKey("K_A_acute", { text: "á" })],
              }),
            ],
          },
        ],
      },
    ]);

    const findings = checkTouchCoverage(layout, ["a", "á"], TOUCH_PATH);

    expect(findings).toEqual([]);
  });

  it("produces no findings when the inventory list is empty", () => {
    // checkTouchCoverage's `inventory` parameter is always present (it is not
    // optional) — the "check silently skipped when absent" contract (mirroring
    // the desktop 18.6 check's ctx.keyboardIR/ctx.inventory presence guard) is
    // enforced one level up, at the lintWithContext() call site, and is covered
    // by lintContext.test.ts. This test only locks the degenerate empty-list case.
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const findings = checkTouchCoverage(layout, [], TOUCH_PATH);

    expect(findings).toEqual([]);
  });

  it("still checks imported-origin keyboards — no scaffolded-only scope guard", () => {
    // Unlike check-18-6-inventory-coverage (desktop), this check has no
    // `origin === "scaffolded"` guard: imported bases (Case B) are its primary
    // audience. checkTouchCoverage takes no `origin` input at all, so an
    // imported layout is checked identically to a scaffolded one.
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const findings = checkTouchCoverage(layout, ["a", "b"], TOUCH_PATH);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_TOUCH_UNCOVERED");
  });
});
