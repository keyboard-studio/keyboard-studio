// Tests for the corpus mining harness (spec 085 T050).

import { describe, it, expect } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { makeBaseKeyboard } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import { mineCorpus } from "./corpusMine.ts";
import type { CorpusSample } from "./corpusMine.ts";

function kb(
  id: string,
  script: string,
  copyright: string,
): CorpusSample {
  const source = `c ${id} test source
store(&COPYRIGHT) '${copyright}'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;
  const { ir } = parseKmn(source, id);
  return {
    id,
    ir,
    catalog: makeBaseKeyboard({
      id,
      script,
      path: `release/test/${id}`,
      targets: ["windows"],
      displayName: id,
      version: "1.0",
      languages: ["ewo"],
    }),
  };
}

// Minimal modules with extractors: script from catalog, copyright from IR.
const scriptModule: QuestionModule = {
  definition: { id: "q_script", type: "text" },
  fixtures: { valid: [], invalid: [] },
  inputs: [],
  writes: [],
  provides: ["target-script"],
  extract: (ctx) => ctx.catalog?.script,
};

const copyrightModule: QuestionModule = {
  definition: { id: "q_copyright", type: "text" },
  fixtures: { valid: [], invalid: [] },
  inputs: [],
  writes: [],
  provides: ["copyright-holder"],
  extract: (ctx) => ctx.ir.header.copyright || undefined,
};

const modules = [scriptModule, copyrightModule];

describe("mineCorpus", () => {
  it("a decision no keyboard varies becomes a default with provenance", () => {
    // All three keyboards use Latn — zero variance.
    const sample = [
      kb("kb_one", "Latn", "© 2026 Author One"),
      kb("kb_two", "Latn", "© 2026 Author Two"),
      kb("kb_three", "Latn", "© 2026 Author Three"),
    ];
    const { variances, defaults } = mineCorpus(sample, modules, "test-sample");

    const scriptVariance = variances.find((v) => v.id === "target-script")!;
    expect(scriptVariance.isInvariant).toBe(true);
    expect(scriptVariance.distinctValues).toEqual(["Latn"]);
    expect(scriptVariance.producers).toBe(3);

    const scriptDefault = defaults.find((d) => d.id === "target-script")!;
    expect(scriptDefault.value).toBe("Latn");
    expect(scriptDefault.provenance).toBe("default");
    expect(scriptDefault.source).toBe("test-sample");
  });

  it("a decision keyboards vary does not become a default", () => {
    const sample = [
      kb("kb_one", "Latn", "© 2026 Author One"),
      kb("kb_two", "Latn", "© 2026 Author Two"),
      kb("kb_three", "Latn", "© 2026 Author Three"),
    ];
    const { variances, defaults } = mineCorpus(sample, modules, "test-sample");

    const copyrightVariance = variances.find((v) => v.id === "copyright-holder")!;
    expect(copyrightVariance.isInvariant).toBe(false);
    expect(copyrightVariance.distinctValues).toHaveLength(3);

    expect(defaults.find((d) => d.id === "copyright-holder")).toBeUndefined();
  });

  it("reports variance for every decision with observations", () => {
    const sample = [kb("kb_one", "Latn", "© 2026 Author One")];
    const { variances } = mineCorpus(sample, modules, "test-sample");
    expect(variances.map((v) => v.id)).toContain("target-script");
    expect(variances.map((v) => v.id)).toContain("copyright-holder");
  });
});
