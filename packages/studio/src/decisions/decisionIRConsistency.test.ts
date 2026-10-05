// Consistency lint: the declared DecisionId ↔ IRPath relation
// (km/decisions-spike fix 1).
//
// Every provider's declared `writes` must cover its mapped
// `decisionIRPaths` entry: each mapped path must be a prefix of, or equal to,
// a declared write. This keeps the ordering DAG (`provides` / `requires`)
// and the data-flow DAG (`inputs` / `writes`) from diverging silently as
// later phases give decisions real IR writes.

import { describe, it, expect } from "vitest";
import type { IRPath } from "@keyboard-studio/contracts";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
import type { QuestionModule } from "../survey/types.ts";
import { decisionIRPaths, type DecisionId } from "./decisionTypes.ts";
import pbCharacterInventory from "../survey/questions/b/pb_character_inventory.ts";

/** True when every mapped path is a prefix of (or equal to) a declared write. */
function coversPath(
  writes: readonly IRPath[],
  mapped: readonly IRPath[],
): boolean {
  return mapped.every((p) =>
    writes.some(
      (w) => p.length <= w.length && p.every((seg, i) => seg === w[i]),
    ),
  );
}

function spikeModules(): QuestionModule[] {
  // The thin identity_lite.modular.yaml was deleted (spec 085 T040) — the
  // module set now comes straight from the Phase A registry.
  return [...Object.values(phaseARegistry), pbCharacterInventory];
}

describe("decisionIRPaths consistency", () => {
  it("maps every DecisionId in the union (exhaustive)", () => {
    const ids: readonly DecisionId[] = [
      "language-name",
      "language-region",
      "language-autonym",
      "language-code",
      "target-script",
      "author-name",
      "author-email",
      "copyright-holder",
      "character-inventory",
    ];
    for (const id of ids) {
      expect(decisionIRPaths[id], id).toBeDefined();
      expect(Array.isArray(decisionIRPaths[id]), id).toBe(true);
    }
  });

  describe.each(
    spikeModules().map((m) => [m.definition.id, m] as const),
  )("%s", (_id, mod) => {
    it("declares writes covering decisionIRPaths[provides]", () => {
      for (const p of mod.provides ?? []) {
        expect(
          coversPath(mod.writes, decisionIRPaths[p]),
          `${mod.definition.id} provides "${p}" but its writes ` +
            `do not cover ${JSON.stringify(decisionIRPaths[p])}`,
        ).toBe(true);
      }
    });
  });

  it("coversPath detects a real mismatch (guardrail sanity)", () => {
    expect(coversPath([["header", "bcp47"]], [["header"]])).toBe(true);
    expect(coversPath([["header", "bcp47"]], [["header", "bcp47"]])).toBe(true);
    expect(coversPath([["header"]], [["header", "bcp47"]])).toBe(false);
    expect(coversPath([], [["header"]])).toBe(false);
    expect(coversPath([], [])).toBe(true);
  });
});
