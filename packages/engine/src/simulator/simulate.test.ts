/**
 * simulate() acceptance tests — issue #183
 *
 * Criterion 4: Compile the deadkey_acute fixture, simulate K_QUOTE then K_A,
 * assert the output is "á" (U+00E1). This proves the whole vendor stack works:
 * compiler → vm sandbox load → JSKeyboardProcessor → deadkey resolution.
 *
 * Criterion 5: Pattern.tests runner helper (runPatternTests) exercised with a
 * synthetic Pattern whose TestVector matches the deadkey rule.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { SimKeyInput } from "@keyboard-studio/contracts";
import { compile } from "../compiler/index.js";
import { simulate, runPatternTests } from "./index.js";
import { makePattern } from "@keyboard-studio/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const deadkeyKmnPath = resolve(here, "__fixtures__", "deadkey_acute.kmn");
const deadkeyKmn = readFileSync(deadkeyKmnPath, "utf8");

// ---------------------------------------------------------------------------
// Shared compiled fixture — compiled once for all tests in this describe block.
// The compiler test already validates that kmc-kmn works; here we depend on it.
// ---------------------------------------------------------------------------

describe("simulate() — deadkey acceptance test (criterion 4)", () => {
  it("compiles deadkey_acute.kmn and simulates K_QUOTE + K_A → 'á'", async () => {
    const vfs = createVirtualFS([
      { path: "source/deadkey_acute.kmn", content: deadkeyKmn, isBinary: false },
    ]);
    const compiled = await compile(vfs, "deadkey_acute");

    expect(compiled.success, "compile must succeed").toBe(true);

    const jsArtifact = compiled.artifacts.find((a) => a.filename.endsWith(".js"));
    expect(jsArtifact, "must have a .js artifact").toBeDefined();
    expect(jsArtifact!.data, ".js artifact must have raw data bytes").toBeDefined();

    // Simulate: K_QUOTE (deadkey) then K_A
    const keys: SimKeyInput[] = [
      { vkey: "K_QUOTE", modifiers: [], caps: false },
      { vkey: "K_A",     modifiers: [], caps: false },
    ];

    const result = simulate(compiled, keys);

    // The full trace should have two steps.
    expect(result.trace).toHaveLength(2);

    // After K_QUOTE: text is empty (deadkey is pending, not emitted as text).
    const step1 = result.trace[0]!;
    expect(step1.outputAfter).toBe("");
    expect(step1.pendingDeadkeys).toHaveLength(1);
    // KMN `deadkey(1)` compiles to internal id 0 (zero-indexed by kmc-kmn).
    // We check id: 0 here; per blueprint §7, do NOT assert the ordinal value.
    expect(step1.pendingDeadkeys[0]!.id).toBe(0);

    // After K_A: deadkey resolved to á.
    const step2 = result.trace[1]!;
    expect(step2.outputAfter).toBe("á");
    expect(step2.pendingDeadkeys).toHaveLength(0);

    // Final output assertion — THE proof of correctness.
    expect(result.finalOutput).toBe("á");
  }, 30_000);

  it("SimulationResult.trace captures beep flag and default-output via finalOutput", async () => {
    const vfs = createVirtualFS([
      { path: "source/deadkey_acute.kmn", content: deadkeyKmn, isBinary: false },
    ]);
    const compiled = await compile(vfs, "deadkey_acute");
    expect(compiled.success).toBe(true);

    // K_Z is not in the keyboard rules at all — should trigger default output.
    const keys: SimKeyInput[] = [{ vkey: "K_Z", modifiers: [], caps: false }];
    const result = simulate(compiled, keys);
    expect(result.trace).toHaveLength(1);
    // Not a beep (no beep rule for K_Z)
    expect(result.trace[0]!.beep).toBe(false);
    // The default output for K_Z on a US keyboard is 'z' — this is the
    // authoritative check that the default output path ran correctly.
    expect(result.finalOutput).toBe("z");
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Criterion 5 — Pattern.tests runner
// ---------------------------------------------------------------------------

describe("runPatternTests() — Pattern.tests runner (criterion 5)", () => {
  it("runs TestVectors from a Pattern and reports pass/fail", async () => {
    const vfs = createVirtualFS([
      { path: "source/deadkey_acute.kmn", content: deadkeyKmn, isBinary: false },
    ]);
    const compiled = await compile(vfs, "deadkey_acute");
    expect(compiled.success).toBe(true);

    const pattern = makePattern({
      id: "test_deadkey_acute",
      title: "Acute deadkey",
      description: "Test",
      category: "desktop",
      appliesTo: [],
      questions: [],
      kmnFragment: "",
      tests: [
        {
          input: ["K_QUOTE", "K_A"],
          expectedOutput: "á",
          description: "acute deadkey + a → á",
        },
        {
          input: ["K_QUOTE", "K_E"],
          expectedOutput: "é",
          description: "acute deadkey + e → é",
        },
        // A failing vector to verify pass=false reporting
        {
          input: ["K_A"],
          expectedOutput: "wrong",
          description: "K_A should not produce 'wrong' — intentional fail",
        },
      ],
      validatedForFamilies: [],
      sourceKeyboards: [],
      reviewedBy: "test",
      reviewDate: "2026-06-11",
    });

    const result = runPatternTests(pattern, compiled);

    expect(result.vectors).toHaveLength(3);
    expect(result.vectors[0]!.pass).toBe(true);
    expect(result.vectors[0]!.actualOutput).toBe("á");
    expect(result.vectors[1]!.pass).toBe(true);
    expect(result.vectors[1]!.actualOutput).toBe("é");
    expect(result.vectors[2]!.pass).toBe(false);   // intentional fail
    expect(result.allPass).toBe(false);            // not all passed
  }, 30_000);
});
