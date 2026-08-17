// Tests for the 18.6 touch-coverage wiring inside lintWithContext (spec 035 T008).
// checkTouchCoverage itself is unit-tested directly in
// checks/check-18-6-touch-coverage.test.ts; these tests lock the context-presence
// guard ("check silently skipped when absent, mirroring how 18.6 desktop skips
// without keyboardIR/inventory") at the lintWithContext call site.

import { describe, it, expect } from "vitest";
import { lintWithContext } from "./lintContext.js";
import type { VirtualFS, TouchLayoutIR, KeyboardIR, ToleranceReport } from "@keyboard-studio/contracts";

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

// Tests for the 19.x context-tolerance wiring (spec 062 T014/T015).
// checkContextTolerance itself is unit-tested directly in
// checks/check-19-x-context-tolerance.test.ts; these tests lock the
// context-presence guard at the lintWithContext call site, matching the
// existing 18.6 gating shape above.

function makeKeyboardIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

const TOLERANCE_REPORT: ToleranceReport = {
  findings: [
    {
      ruleId: "acute-rule",
      location: { file: "test", line: 1 },
      status: "not-analysed",
      failingKeystrokes: [{ vkey: "K_QUOTE", modifiers: [] }],
      precomposedOutput: "a",
      decomposedOutput: "a",
    },
  ],
  notAnalysedCount: 0,
};

describe("lintWithContext — 19.x context tolerance wiring", () => {
  it("emits no KM_WARN_CONTEXT_NOT_TOLERANT findings when toleranceReport is absent", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {
      keyboardIR: makeKeyboardIR(),
    });
    expect(findings.find((f) => f.code === "KM_WARN_CONTEXT_NOT_TOLERANT")).toBeUndefined();
  });

  it("emits no KM_WARN_CONTEXT_NOT_TOLERANT findings when keyboardIR is absent", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {
      toleranceReport: TOLERANCE_REPORT,
    });
    expect(findings.find((f) => f.code === "KM_WARN_CONTEXT_NOT_TOLERANT")).toBeUndefined();
  });

  it("emits KM_WARN_CONTEXT_NOT_TOLERANT when both keyboardIR and toleranceReport are present", async () => {
    const findings = await lintWithContext(makeEmptyFS(), KEYBOARD_ID, {
      keyboardIR: makeKeyboardIR(),
      toleranceReport: TOLERANCE_REPORT,
    });
    const toleranceFindings = findings.filter((f) => f.code === "KM_WARN_CONTEXT_NOT_TOLERANT");
    expect(toleranceFindings).toHaveLength(1);
    expect(toleranceFindings[0]?.message).toContain("acute-rule");
  });
});
