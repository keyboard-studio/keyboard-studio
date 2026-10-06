// extractBaseScriptPosture — the single classifier of a base's script posture
// (spec 087 Q2). Covers the mixed posture and the dominant-script reading
// that the adaptation catalog's q_sa2 predicate consumes.

import { describe, it, expect } from "vitest";
import { extractBaseScriptPosture } from "./il_target_script.ts";

describe("extractBaseScriptPosture", () => {
  it("is single-script at or above the threshold and names the dominant script", () => {
    const r = extractBaseScriptPosture({ Latn: 0.9, Arab: 0.1 }, 0.8);
    expect(r.posture).toBe("single-script");
    expect(r.dominantScript).toBe("Latn");
    expect(r.dominantShare).toBe(0.9);
    expect(r.provenance).toContain("80%");
  });

  it("is mixed below the threshold, and the provenance names the threshold", () => {
    const r = extractBaseScriptPosture({ Latn: 0.7, Arab: 0.3 }, 0.8);
    expect(r.posture).toBe("mixed");
    expect(r.dominantScript).toBe("Latn");
    expect(r.provenance).toContain("80%");
  });

  it("the threshold is inclusive", () => {
    expect(extractBaseScriptPosture({ Latn: 0.8, Arab: 0.2 }, 0.8).posture).toBe("single-script");
  });

  it("an empty distribution is mixed with no dominant script", () => {
    const r = extractBaseScriptPosture({}, 0.8);
    expect(r.posture).toBe("mixed");
    expect(r.dominantScript).toBe("");
  });
});
