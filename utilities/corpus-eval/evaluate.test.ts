/**
 * Evaluator tests — the §7.5.1 round-trip over synthetic sources, plus
 * tally/dominant primitives.
 */

import { describe, expect, it } from "vitest";

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../../packages/engine/src/codec/index.js";
import { recognizePatterns } from "../../packages/engine/src/recognizer/index.js";
import { dominantStrategy, evaluateKeyboard, strategyRuleTally } from "./evaluate.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
begin Unicode > use(main)
`;

const DEADKEY_KMN = `${HEADER}
store(dkf0300) U+0061 U+0065
store(dkt0300) U+0300 U+0300
group(main) using keys
+ [K_A] > dk(0300)
group(deadkeys)
dk(0300) + any(dkf0300) > index(dkt0300,2)
`;

describe("strategyRuleTally / dominantStrategy", () => {
  it("tallies owned rules per recognized strategy", () => {
    const { ir } = parse(DEADKEY_KMN, "test");
    recognizePatterns(ir);
    const tally = strategyRuleTally(ir as KeyboardIR);
    expect(tally.get("S-02")).toBeGreaterThan(0);
    expect(dominantStrategy(tally)).toBe("S-02");
  });

  it("breaks ties to the lexicographically smallest strategy id", () => {
    const tally = new Map([
      ["S-02" as const, 3],
      ["S-01" as const, 3],
    ]);
    expect(dominantStrategy(tally)).toBe("S-01");
  });

  it("returns null on an empty tally", () => {
    expect(dominantStrategy(new Map())).toBeNull();
  });
});

describe("evaluateKeyboard", () => {
  it("evaluates a deadkey keyboard end-to-end with a complete axis vector on record", () => {
    const outcome = evaluateKeyboard("test_dk", DEADKEY_KMN, "release/x/test_dk/source/test_dk.kmn");
    expect(outcome.kind === "agreement" || outcome.kind === "divergence").toBe(true);
    if (outcome.kind === "agreement" || outcome.kind === "divergence") {
      expect(outcome.summary.recognizedPrimary).toBe("S-02");
      expect(outcome.summary.importStatus).toBe("clean");
    }
    if (outcome.kind === "divergence") {
      // The record carries the full provenance the contract promises.
      expect(outcome.divergence!.axes.scale).toBeDefined();
      expect(outcome.divergence!.recognizedTally["S-02"]).toBeGreaterThan(0);
      expect(outcome.divergence!.sourcePath).toContain("test_dk");
    }
  });

  it("reports unevaluable when the recognizer lifts nothing", () => {
    // Seven distinct base keys: the S-01 recognizer declines groups with
    // more than five distinct base names, and there are no deadkeys for
    // S-02 — nothing is lifted, so there is no dominant strategy.
    const swaps = ["A", "B", "C", "D", "E", "F", "G"]
      .map((k) => `+ [K_${k}] > U+00${(0xe0 + k.charCodeAt(0) - 65).toString(16)}`)
      .join("\n");
    const outcome = evaluateKeyboard(
      "test_empty",
      `${HEADER}\ngroup(main) using keys\n${swaps}\n`,
      "release/x/test_empty/source/test_empty.kmn",
    );
    expect(outcome.kind).toBe("unevaluable");
  });
});
