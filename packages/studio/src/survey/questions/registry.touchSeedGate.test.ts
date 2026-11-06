// Open mode (spec 111 FR-009): touch generation is offered only when the opened
// keyboard has no touch layout of its own.

import { describe, expect, it } from "vitest";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../../decisions/decisionTypes.ts";
import { declaredScreenGates } from "./registry.ts";

const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };
function decisions(track: string, targets: string[]): DecisionSet {
  return {
    "authoring-track": { value: track },
    "base-keyboard": { value: { ...KB, targets } },
  } as unknown as DecisionSet;
}

describe("touch_seed_source gate", () => {
  const gate = declaredScreenGates.get("touch_seed_source")!;

  it("hides generation on Open when the keyboard names a touch platform", () => {
    expect(gate(decisions("adapt", ["windows", "mobile"]))).toBe(false);
  });

  it("offers generation on Open when the catalog entry names no touch platform", () => {
    expect(gate(decisions("adapt", ["windows"]))).toBe(true);
  });

  it("is unchanged on Copy", () => {
    expect(gate(decisions("copy", ["windows", "mobile"]))).toBe(true);
  });
});
