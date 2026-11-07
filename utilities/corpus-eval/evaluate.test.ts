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

// Cluster-1-shaped keyboard (#2278): medium scale (25 RAlt swaps to
// accented Latin letters + 2 combining marks), one deadkey family
// (stacking-combining), Latin content. Before the fix the Latin content
// derived A3=strong and rule 5 routed it to S-05; after the fix A3 is weak
// and rule 7 routes it to S-02, agreeing with the recognizer. The swaps
// use RAlt so they do not count toward the base-plane remap posture.
const MEDIUM_DEADKEY_KMN = `${HEADER}
store(dkf0300) U+0061 U+0065
store(dkt0300) U+0300 U+0300
group(main) using keys
+ [K_A] > dk(0300)
+ [RALT K_B] > U+0101
+ [RALT K_C] > U+0113
+ [RALT K_D] > U+012B
+ [RALT K_E] > U+014D
+ [RALT K_F] > U+016B
+ [RALT K_G] > U+00E1
+ [RALT K_H] > U+00E9
+ [RALT K_I] > U+00ED
+ [RALT K_J] > U+00F3
+ [RALT K_K] > U+00FA
+ [RALT K_L] > U+010D
+ [RALT K_M] > U+011B
+ [RALT K_N] > U+0148
+ [RALT K_O] > U+0161
+ [RALT K_P] > U+017E
+ [RALT K_Q] > U+00E7
+ [RALT K_R] > U+00F1
+ [RALT K_S] > U+00FC
+ [RALT K_T] > U+00E4
+ [RALT K_U] > U+00F6
+ [RALT K_V] > U+00E0
+ [RALT K_W] > U+00E8
+ [RALT K_X] > U+00F9
+ [RALT K_Y] > U+00FB
+ [RALT K_Z] > U+00EE
group(deadkeys)
dk(0300) + any(dkf0300) > index(dkt0300,2)
`;

describe("evaluateKeyboard", () => {
  it("a cluster-1-shaped Latin deadkey keyboard agrees on S-02 via rule 7 (#2278)", () => {
    const outcome = evaluateKeyboard(
      "test_cluster1",
      MEDIUM_DEADKEY_KMN,
      "release/x/test_cluster1/source/test_cluster1.kmn",
    );
    expect(outcome.kind).toBe("agreement");
    if (outcome.kind === "agreement") {
      expect(outcome.summary.treePrimary).toBe("S-02");
      expect(outcome.summary.triggeredRule).toBe(7);
      expect(outcome.summary.recognizedPrimary).toBe("S-02");
      expect(outcome.summary.addedChars).toBeGreaterThanOrEqual(20);
    }
  });

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
