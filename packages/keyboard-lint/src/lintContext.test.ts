// Tests for the 18.6 touch-coverage wiring inside lintWithContext (spec 035 T008).
// checkTouchCoverage itself is unit-tested directly in
// checks/check-18-6-touch-coverage.test.ts; these tests lock the context-presence
// guard ("check silently skipped when absent, mirroring how 18.6 desktop skips
// without keyboardIR/inventory") at the lintWithContext call site.

import { describe, it, expect } from "vitest";
import { lintWithContext } from "./lintContext.js";
import type { VirtualFS, TouchLayoutIR } from "@keyboard-studio/contracts";

const KEYBOARD_ID = "test";

/** Empty VirtualFS — no .kmn / .keyman-touch-layout files present. */
function makeEmptyFS(): VirtualFS {
  return { get: () => undefined } as unknown as VirtualFS;
}

const LAYOUT: TouchLayoutIR = {
  platforms: [
    {
      id: "phone",
      layers: [
        {
          id: "default",
          rows: [{ keys: [{ nodeId: "n1", id: "K_A", text: "a" }] }],
        },
      ],
    },
  ],
  nodeIds: [],
};

describe("lintWithContext — 18.6 touch coverage wiring", () => {
  it("emits no KM_LINT_TOUCH_UNCOVERED findings when touchLayout is absent", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {
      touchInventory: ["z"],
    });
    expect(findings.find((f) => f.code === "KM_LINT_TOUCH_UNCOVERED")).toBeUndefined();
  });

  it("emits no KM_LINT_TOUCH_UNCOVERED findings when touchInventory is absent", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {
      touchLayout: LAYOUT,
    });
    expect(findings.find((f) => f.code === "KM_LINT_TOUCH_UNCOVERED")).toBeUndefined();
  });

  it("emits no findings at all when context is entirely empty", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {});
    expect(findings).toEqual([]);
  });

  it("emits KM_LINT_TOUCH_UNCOVERED when both touchLayout and touchInventory are present", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {
      touchLayout: LAYOUT,
      touchInventory: ["a", "z"],
    });
    const touchFindings = findings.filter((f) => f.code === "KM_LINT_TOUCH_UNCOVERED");
    expect(touchFindings).toHaveLength(1);
    expect(touchFindings[0]?.message).toContain("z");
  });
});
