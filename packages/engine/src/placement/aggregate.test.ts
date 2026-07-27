import { describe, it, expect } from "vitest";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import { aggregatePlacements } from "./aggregate.js";
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
});
