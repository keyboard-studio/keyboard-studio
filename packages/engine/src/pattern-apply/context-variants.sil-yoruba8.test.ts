// Corpus regression test (spec 062, T011): proves SC-004 directly against the
// real sil_yoruba8 keyboard from the sibling keymanapp/keyboards checkout --
// not a synthetic fixture. Skipped (not failed) if the sibling checkout is
// absent, matching the existing canary convention in
// applyStoreSlotRemovals.test.ts.
//
// sil_yoruba8 is exactly the keyboard research.md and the spec's own
// Acceptance Scenario 3 cite: a mnemonic layout whose diacritic tables are
// store-backed (any(not.act) + any(key.act) > index(act.all,1)) and whose
// "+ ']' > acute-accent-mark" bare fallback must NOT fire once the tolerant
// rule exists. Its diacritic-table stores are themselves declared via
// outs(a) outs(b) ... compaction (opaque to the codec's typed StoreItem
// model), and it declares &TARGETS 'desktop' only -- both handled by
// buildStoreCharIndex's outs()-resolution and stripAssetStoresForCompile's
// targets override, respectively; this test is what proves those two
// mechanisms actually unlock the real corpus file, not just a hand-shaped
// stand-in.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance, stripAssetStoresForCompile } from "../validator/context-tolerance.js";
import { proposeContextVariants } from "./context-variants.js";

const ACUTE_ACCENT_MARK = "´"; // the bare fallback's literal output
const PRECOMPOSED_A_GRAVE = "à"; // à
const DECOMPOSED_A_GRAVE = "à"; // a + combining grave
const PRECOMPOSED_A_ACUTE = "á"; // á

const __dir = dirname(fileURLToPath(import.meta.url));
const YORUBA8_KMN = resolve(
  __dir,
  "../../../../../keyboards/release/sil/sil_yoruba8/source/sil_yoruba8.kmn",
);
const yoruba8Exists = existsSync(YORUBA8_KMN);

describe("proposeContextVariants - sil_yoruba8 canary (real keyboard, SC-004)", () => {
  it.skipIf(!yoruba8Exists)(
    "the acute key applies an acute on a decomposed a+grave buffer, not the bare fallback mark",
    async () => {
      const kmnText = readFileSync(YORUBA8_KMN, "utf-8");
      const { ir } = parse(kmnText, "sil_yoruba8");

      const report = await computeContextTolerance(ir);
      const totalRuleCount = ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length;
      expect(report.findings.length + report.notAnalysedCount).toBe(totalRuleCount);
      expect(report.findings.some((f) => f.failingKeystrokes !== undefined)).toBe(true);

      const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);
      expect(variants.length).toBeGreaterThan(0);

      const vfs = createVirtualFS([
        { path: "source/sil_yoruba8.kmn", content: emit(stripAssetStoresForCompile(fixedIr)), isBinary: false },
      ]);
      const compiled = await compile(vfs, "sil_yoruba8");
      expect(compiled.success).toBe(true);

      const acuteKey = { vkey: "K_RBRKT", modifiers: [] as const };

      const decomposedResult = simulate(compiled, [acuteKey], { text: DECOMPOSED_A_GRAVE });
      expect(decomposedResult.finalOutput).not.toContain(ACUTE_ACCENT_MARK);
      expect(decomposedResult.finalOutput).toBe(PRECOMPOSED_A_ACUTE);

      const precomposedResult = simulate(compiled, [acuteKey], { text: PRECOMPOSED_A_GRAVE });
      expect(precomposedResult.finalOutput).toBe(decomposedResult.finalOutput);
    },
    60_000,
  );
});
