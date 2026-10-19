/**
 * Integration: the round-trip over a REAL corpus subset (issue #297).
 *
 * Runs against a keymanapp/keyboards checkout when one is present —
 * `CORPUS_EVAL_ROOT` env, else the sibling `keyboards-upstream` / `keyboards`
 * checkouts next to this repo. Skips cleanly when no corpus is available,
 * so the suite is safe in minimal checkouts (the recognizer's integration
 * tests follow the same convention).
 *
 * Assertions are structural (outcome kinds, field shapes), never census
 * counts over the corpus: the corpus is a moving external artifact.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { discoverKeyboards, evaluateDiscovered, evaluateKeyboard } from "./evaluate.js";
import { buildReport } from "./report.js";
import { readFileSync } from "node:fs";

const WORKSPACE = resolve(new URL(".", import.meta.url).pathname, "..", "..", "..");
const CANDIDATE_ROOTS = [
  process.env.CORPUS_EVAL_ROOT,
  resolve(WORKSPACE, "keyboards-upstream"),
  resolve(WORKSPACE, "keyboards"),
].filter((p): p is string => p !== undefined);
const corpusRoot = CANDIDATE_ROOTS.find((p) => existsSync(resolve(p, "release", "sil")));
const silIpaPath =
  corpusRoot !== undefined
    ? resolve(corpusRoot, "release", "sil", "sil_ipa", "source", "sil_ipa.kmn")
    : "";
const hasSilIpa = silIpaPath !== "" && existsSync(silIpaPath);

describe("corpus integration", () => {
  it.skipIf(!hasSilIpa)(
    "sil_ipa reproduces its §7.5 agreement from raw source (rule 3a, S-03)",
    () => {
      const text = readFileSync(silIpaPath, "utf8");
      const outcome = evaluateKeyboard("sil_ipa", text, "release/sil/sil_ipa/source/sil_ipa.kmn");
      expect(outcome.kind).toBe("agreement");
      if (outcome.kind === "agreement") {
        expect(outcome.summary.recognizedPrimary).toBe("S-03");
        expect(outcome.summary.treePrimary).toBe("S-03");
        expect(outcome.summary.triggeredRule).toBe("3a");
      }
    },
  );

  it.skipIf(corpusRoot === undefined)(
    "the sil family pass completes with honestly denominated outcomes",
    { timeout: 120_000 },
    () => {
      const keyboards = discoverKeyboards(corpusRoot!, "sil");
      expect(keyboards.length).toBeGreaterThan(0);
      const outcomes = keyboards.map(evaluateDiscovered);
      const report = buildReport({
        corpusRoot: corpusRoot!,
        corpusScope: "release/sil/**",
        generatedAt: new Date().toISOString(),
        durationMs: 0,
        discovered: keyboards.length,
        outcomes,
      });
      const s = report.summary;
      // Every discovered keyboard is accounted for exactly once.
      expect(s.parseFailures + s.evaluated + s.unevaluable).toBe(s.discovered);
      expect(s.agreements + s.divergences).toBe(s.evaluated);
      // Clusters partition the divergences.
      const clustered = report.clusters.reduce((sum, c) => sum + c.count, 0);
      expect(clustered).toBe(s.divergences);
    },
  );
});
