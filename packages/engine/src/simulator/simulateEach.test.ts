/**
 * simulateEach() tests: one SimulationStep per input, the keyboard loaded
 * once, and every step equal to the single trace step of
 * `simulate(compiled, [input], seed)` for the same seed.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompileResult, SimKeyInput, SimulatorContextSeed } from "@keyboard-studio/contracts";

vi.mock("./keyboardLoader.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./keyboardLoader.js")>();
  return {
    ...orig,
    loadKeyboardInterface: vi.fn(orig.loadKeyboardInterface),
  };
});

import { compile } from "../compiler/index.js";
import { simulate, simulateEach } from "./index.js";
import { loadKeyboardInterface } from "./keyboardLoader.js";

const loadSpy = vi.mocked(loadKeyboardInterface);

const here = dirname(fileURLToPath(import.meta.url));
const firedruleKmn = readFileSync(resolve(here, "__fixtures__", "firedrule.kmn"), "utf8");

function key(vkey: string, caps = false): SimKeyInput {
  return { vkey, modifiers: [], caps };
}

const INPUTS: SimKeyInput[] = [
  key("K_A"),
  key("K_B"),
  key("K_C"),
  key("K_D"),
  key("K_E"),
  key("K_F"),
  key("K_A", true),
  key("K_Z"),
];

describe("simulateEach()", () => {
  let compiled: CompileResult;

  beforeAll(async () => {
    compiled = await compile(
      createVirtualFS([{ path: "source/firedrule.kmn", content: firedruleKmn, isBinary: false }]),
      "firedrule",
    );
    expect(compiled.success, "firedrule.kmn must compile").toBe(true);
  }, 60_000);

  const seeds: Array<[string, SimulatorContextSeed | undefined]> = [
    ["empty seed", undefined],
    ["text seed", { text: "n", caretPos: 1 }],
    ["pendingDeadkeys seed", { text: "qy", caretPos: 1, pendingDeadkeys: [{ id: 0, position: 1 }] }],
  ];

  for (const [label, seed] of seeds) {
    it(`each step equals simulate() for the same input (${label})`, () => {
      const steps = simulateEach(compiled, INPUTS, seed);
      expect(steps).toHaveLength(INPUTS.length);
      INPUTS.forEach((input, i) => {
        const expected = simulate(compiled, [input], seed).trace[0]!;
        expect(steps[i]).toEqual(expected);
      });
    }, 30_000);
  }

  it("resets to the seed before every input (no state leaks between inputs)", () => {
    const steps = simulateEach(compiled, [key("K_E"), key("K_D"), key("K_D")]);
    // K_E sets a deadkey; the next input starts clean so K_D does not match it.
    expect(steps[0]!.pendingDeadkeys).toHaveLength(1);
    expect(steps[1]!.outputAfter).toBe("d");
    expect(steps[1]!.pendingDeadkeys).toHaveLength(0);

    const seeded = simulateEach(compiled, [key("K_D"), key("K_D")], {
      text: "",
      pendingDeadkeys: [{ id: 0, position: 0 }],
    });
    expect(seeded[0]!.outputAfter).toBe("é");
    expect(seeded[1]!.outputAfter).toBe("é");
  }, 30_000);

  it("reports firedRule per step", () => {
    const steps = simulateEach(compiled, [key("K_A"), key("K_Z")]);
    expect(steps[0]!.firedRule).toMatchObject({ group: expect.any(String), ruleIndex: 0, emittedOutput: "a" });
    expect(steps[1]!.firedRule).toBeUndefined();
  });

  it("returns [] without loading the keyboard when there are no inputs", () => {
    const before = loadSpy.mock.calls.length;
    expect(simulateEach(compiled, [])).toEqual([]);
    expect(loadSpy.mock.calls.length - before).toBe(0);
  });

  it("loads the keyboard once for N inputs", () => {
    const before = loadSpy.mock.calls.length;
    simulateEach(compiled, INPUTS, { text: "n" });
    expect(loadSpy.mock.calls.length - before).toBe(1);
  });
});
