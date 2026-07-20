import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  displayDifficultyOfScript,
  DISPLAY_DIFFICULTY_ERA_BOUNDARIES,
} from "./display-difficulty.ts";
import { firstVersionOfScript } from "./ucd/generated/scriptLookup.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("displayDifficultyOfScript", () => {
  it("Basic Latin (old block) is well-supported (US3 AS-1)", () => {
    expect(displayDifficultyOfScript("Latn", { puaObserved: false })).toBe("well-supported");
  });

  it("other long-assigned mainstream scripts are well-supported", () => {
    for (const script of ["Arab", "Cyrl", "Grek", "Deva", "Thai", "Hani"]) {
      expect(displayDifficultyOfScript(script, { puaObserved: false })).toBe("well-supported");
    }
  });

  it("a 6.0–10.0 script is partially-supported", () => {
    // Adlam was first assigned in Unicode 9.0.
    expect(firstVersionOfScript("Adlm")?.[0]).toBe(9);
    expect(displayDifficultyOfScript("Adlm", { puaObserved: false })).toBe("partially-supported");
  });

  it("the well→partial transition fires exactly at partiallyFromMajor (boundary)", () => {
    // Brahmi was first assigned in Unicode 6.0 — exactly partiallyFromMajor.
    // Guards against an off-by-one in the `>=` comparison.
    expect(firstVersionOfScript("Brah")?.[0]).toBe(DISPLAY_DIFFICULTY_ERA_BOUNDARIES.partiallyFromMajor);
    expect(displayDifficultyOfScript("Brah", { puaObserved: false })).toBe("partially-supported");
  });

  it("a ≥ 11.0 script is poorly-supported", () => {
    // Medefaidrin (11.0) and Wancho (12.0) are recently assigned.
    expect(firstVersionOfScript("Medf")?.[0]).toBeGreaterThanOrEqual(11);
    expect(displayDifficultyOfScript("Medf", { puaObserved: false })).toBe("poorly-supported");
    expect(displayDifficultyOfScript("Wcho", { puaObserved: false })).toBe("poorly-supported");
  });

  it("corpus PUA usage forces poorly-supported regardless of block age (US3 AS-2, FR-031)", () => {
    // Latin is the oldest block, yet observed PUA usage overrides to poorly.
    expect(displayDifficultyOfScript("Latn", { puaObserved: true })).toBe("poorly-supported");
    expect(displayDifficultyOfScript("Adlm", { puaObserved: true })).toBe("poorly-supported");
  });

  it("an unknown script falls back to the conservative middle tier", () => {
    expect(firstVersionOfScript("Zzzz")).toBeUndefined();
    expect(displayDifficultyOfScript("Zzzz", { puaObserved: false })).toBe("partially-supported");
  });

  it("era boundaries are contiguous and ordered", () => {
    const { partiallyFromMajor, poorlyFromMajor } = DISPLAY_DIFFICULTY_ERA_BOUNDARIES;
    expect(partiallyFromMajor).toBe(6);
    expect(poorlyFromMajor).toBe(11);
    expect(partiallyFromMajor).toBeLessThan(poorlyFromMajor);
  });

  it("the facet YAML derivation params match the TS boundary constants (no drift, FR-031)", () => {
    // The YAML params (content) and the TS constants (engine) are a single
    // source expressed twice; the prose comment claims they are kept in sync,
    // and this test is what enforces it (km-qc P1).
    const yamlPath = join(HERE, "..", "..", "content", "facets", "orth", "display-difficulty.yaml");
    const def = parseYaml(readFileSync(yamlPath, "utf8")) as {
      derivations: Array<{ params?: Record<string, number> }>;
    };
    const params = def.derivations.find((d) => d.params)?.params;
    expect(params).toBeDefined();
    expect(params!.partiallyFromMajor).toBe(DISPLAY_DIFFICULTY_ERA_BOUNDARIES.partiallyFromMajor);
    expect(params!.poorlyFromMajor).toBe(DISPLAY_DIFFICULTY_ERA_BOUNDARIES.poorlyFromMajor);
    // The YAML must not reintroduce a redundant derived third boundary that
    // could silently drift (well = major < partiallyFromMajor, in prose only).
    expect(params!.wellSupportedThroughMajor).toBeUndefined();
  });
});
