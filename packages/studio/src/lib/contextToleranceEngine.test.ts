// Browser-environment run of the context-tolerance analysis (spec 078 T014).
// Loads the engine subpath through the studio's lazy handle — the same path
// the app takes — under this package's jsdom environment, where the subpath
// installs its `new Function` keyboard loader, and runs the analysis on the
// real sil_yoruba8 canary.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";

import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";

const YORUBA8 = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../keyboards/release/sil/sil_yoruba8/source/sil_yoruba8.kmn",
);

describe("context-tolerance engine subpath in the studio environment (spec 078 T014)", () => {
  it("memoises the successful load", async () => {
    const [a, b] = await Promise.all([loadContextToleranceEngine(), loadContextToleranceEngine()]);
    expect(a).toBe(b);
  });

  it.skipIf(!existsSync(YORUBA8))(
    "finds at least one gap on sil_yoruba8, and the analysis compile did not fail",
    async () => {
      const engine = await loadContextToleranceEngine();
      const { ir } = parseKmn(readFileSync(YORUBA8, "utf-8"), "sil_yoruba8");

      const report = await engine.computeContextTolerance(ir);

      const classes = report.findings.map((f) => engine.classifyToleranceFinding(f));
      expect(classes).toContain("gap");
      // The &LAYOUTFILE strip means the compile produces a .js: no rule is
      // reported as unanalysable because the keyboard failed to compile.
      // (Carried web-target diagnostics may still be present; they do not
      // stop the analysis.)
      expect(report.findings.some((f) => f.notAnalysedReason?.includes("failed to compile"))).toBe(false);
    },
    120_000,
  );
});
