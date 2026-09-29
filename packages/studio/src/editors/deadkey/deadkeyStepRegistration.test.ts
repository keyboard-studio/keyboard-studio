// Deadkeys step registration — spec 083: the step sits beside carve (not
// inside the assign loop).
//
// NOTE: manifest.ts and phases.ts can't be imported in this test —
// manifest.ts pulls in the app's doc-lint chain, whose
// `@keymanapp/keyboard-lint` dependency is broken in this worktree
// (pre-existing, unrelated to 083; manifest.test.ts fails the same way).
// So this file pins the order contract via STEP_ORDER (plain data, no
// imports) and pins the phase mapping by reading phases.ts as text.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STEP_ORDER } from "../../steps/stepOrder.ts";

describe("deadkeys step registration", () => {
  it("sits immediately after carve and before mechanisms", () => {
    const carveIdx = STEP_ORDER.indexOf("carve");
    const deadkeysIdx = STEP_ORDER.indexOf("deadkeys");
    const mechIdx = STEP_ORDER.indexOf("mechanisms");
    expect(carveIdx).toBeGreaterThanOrEqual(0);
    expect(deadkeysIdx).toBe(carveIdx + 1);
    expect(mechIdx).toBe(deadkeysIdx + 1);
  });

  it("is not inside the assign loop", () => {
    expect(STEP_ORDER).not.toContain("assign");
  });

  it("phases.ts lists deadkeys beside carve", () => {
    // Vitest runs with cwd = packages/studio.
    const text = readFileSync(join(process.cwd(), "src/steps/phases.ts"), "utf8");
    expect(text).toMatch(/stepIds:\s*\["carve",\s*"deadkeys"\]/);
  });
});
