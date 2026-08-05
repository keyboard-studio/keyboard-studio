import { describe, it, expect } from "vitest";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import { aggregatePlacements, PLACEMENT_PRIORS_VERSION } from "./aggregate.js";
import type { KeyboardPlacementReport } from "./model.js";

function cand(vkey: string): PlacementCandidate {
  return {
    vkey,
    modifiers: [],
    mechanism: "direct",
    priorSource: "corpus",
    priorCount: 1,
    confidence: 0,
  };
}

/** A deadkey/store-index candidate — its `vkey` is a BASE LETTER position,
 *  not a "free key" assignment (see the anti-pattern-scoping test below). */
function deadkeyCand(vkey: string, baseLetter: string): PlacementCandidate {
  return {
    vkey,
    modifiers: [],
    mechanism: "store-index",
    priorSource: "corpus",
    priorCount: 1,
    confidence: 0,
    baseLetter,
  };
}

function makeReport(
  keyboardId: string,
  fingerprint: string,
  pairs: Array<[hex: string, vkey: string]>,
): KeyboardPlacementReport {
  const byCp = new Map<string, PlacementCandidate[]>();
  for (const [hex, vkey] of pairs) {
    const arr = byCp.get(hex) ?? [];
    arr.push(cand(vkey));
    byCp.set(hex, arr);
  }
  return {
    keyboardId,
    bcp47: ["xx"],
    baseLayoutFamily: "QWERTY",
    candidatesByCodepoint: byCp,
    placementFingerprint: fingerprint,
  };
}

describe("aggregatePlacements — §7.6 anti-pattern discard", () => {
  it("KEEPS a codepoint that several keyboards independently placed on consecutive QWERTY keys", () => {
    // Five distinct keyboards, each placing ONLY U+0253 — on K_Q, K_W, K_E,
    // K_R, K_T respectively. Per-keyboard none is an anti-pattern (one key
    // each), so the codepoint's aggregated entry is legitimate consensus and
    // must survive. (Previously the per-codepoint discard dropped it because
    // the five vkeys form a consecutive run.)
    const keys = ["K_Q", "K_W", "K_E", "K_R", "K_T"];
    const reports = keys.map((k, i) =>
      makeReport(`kb${i}`, `fp${i}`, [["0253", k]]),
    );
    const out = aggregatePlacements(reports);
    expect(out.entries["0253"]).toBeDefined();
    expect(out.entries["0253"]?.placements.length).toBe(5);
    expect(out.priorCount).toBe(5);
  });

  it("EXCLUDES a whole keyboard whose assigned vkeys form a monotone QWERTY run", () => {
    // kbFill drops five different codepoints onto K_Q..K_T (fill left-to-right).
    // kbReal places one codepoint on K_A (phonetic). The fill keyboard is
    // discarded from the pool; only the real keyboard's signal remains.
    const fill = makeReport("kbFill", "fpFill", [
      ["0100", "K_Q"],
      ["0101", "K_W"],
      ["0102", "K_E"],
      ["0103", "K_R"],
      ["0104", "K_T"],
    ]);
    const real = makeReport("kbReal", "fpReal", [["0253", "K_A"]]);
    const out = aggregatePlacements([fill, real]);

    // The fill keyboard's codepoints never make it into the pool.
    for (const hex of ["0100", "0101", "0102", "0103", "0104"]) {
      expect(out.entries[hex]).toBeUndefined();
    }
    // The real keyboard survives.
    expect(out.entries["0253"]).toBeDefined();
    expect(out.priorCount).toBe(1);
  });

  it("does not discard a keyboard placing fewer than 5 keys, even if consecutive", () => {
    const kb = makeReport("kbSmall", "fpSmall", [
      ["0100", "K_Q"],
      ["0101", "K_W"],
      ["0102", "K_E"],
    ]);
    const out = aggregatePlacements([kb]);
    expect(out.priorCount).toBe(1);
    expect(out.entries["0100"]).toBeDefined();
  });

  it("does NOT flag a keyboard as anti-pattern from deadkey/store-index base-letter vkeys alone (placement-priors v2)", () => {
    // A deadkey table naturally spans most of the alphabet as base letters
    // (Q..T here) — this is NOT "free keys filled left-to-right"; it is the
    // keyboard's pre-existing letter keys used as compose bases. Only ONE
    // direct candidate (K_A) is present, well under the 5-key threshold, so
    // the whole keyboard must survive.
    const byCp = new Map<string, PlacementCandidate[]>([
      ["0253", [cand("K_A")]],
      ["0300", [deadkeyCand("K_Q", "q")]],
      ["0301", [deadkeyCand("K_W", "w")]],
      ["0302", [deadkeyCand("K_E", "e")]],
      ["0303", [deadkeyCand("K_R", "r")]],
      ["0304", [deadkeyCand("K_T", "t")]],
    ]);
    const report: KeyboardPlacementReport = {
      keyboardId: "kbDeadkeyTable",
      bcp47: ["xx"],
      baseLayoutFamily: "QWERTY",
      candidatesByCodepoint: byCp,
      placementFingerprint: "fpDeadkeyTable",
    };
    const out = aggregatePlacements([report]);
    expect(out.priorCount).toBe(1);
    expect(out.entries["0253"]).toBeDefined();
    expect(out.entries["0300"]).toBeDefined();
  });
});

describe("aggregatePlacements — versioning (placement-priors v2)", () => {
  it("stamps the current PLACEMENT_PRIORS_VERSION onto every snapshot", () => {
    const out = aggregatePlacements([]);
    expect(out.version).toBe(PLACEMENT_PRIORS_VERSION);
    expect(out.version.startsWith("2.")).toBe(true);
  });

  it("omits deadkeySkipReasons/touch entirely when not supplied", () => {
    const out = aggregatePlacements([]);
    expect("deadkeySkipReasons" in out).toBe(false);
    expect("touch" in out).toBe(false);
  });

  it("carries deadkeySkipReasons and touch through when supplied and non-empty", () => {
    const out = aggregatePlacements([], {
      deadkeySkipReasons: { "multi-deadkey-context": 3 },
      touch: [{ codepoint: "U+025B", hosts: [{ vkey: "K_E", layerClass: "default", priorCount: 1 }] }],
    });
    expect(out.deadkeySkipReasons).toEqual({ "multi-deadkey-context": 3 });
    expect(out.touch).toEqual([
      { codepoint: "U+025B", hosts: [{ vkey: "K_E", layerClass: "default", priorCount: 1 }] },
    ]);
  });
});
