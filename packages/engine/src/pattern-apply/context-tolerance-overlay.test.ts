// The context-tolerance overlay (spec 078): the accepted fix, recorded once as
// data and replayed by a synchronous projection, must behave exactly like the
// fix it was built from, survive JSON and a re-parse, and be removable again.
//
// On the sil_yoruba8 canary: after replay, decomposed `o` + U+0323 (and `e` +
// U+0323) followed by each of the five accent keys gives the same accented
// text as the joined form (SC-003), and joined-form output is byte-identical
// to the unfixed keyboard (FR-008).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { KeyboardIR, SimKeyInput } from "@keyboard-studio/contracts";

import { parse } from "../codec/parse.js";
import { emit, emitRule } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { createContextToleranceMigrationRule } from "../facet-transform/migrations/context-tolerance.js";
import { simulate } from "../simulator/index.js";
import { buildToleranceCompileVfs, classifyToleranceFinding, computeContextTolerance } from "../validator/context-tolerance.js";
import {
  applyContextToleranceOverlay,
  buildContextToleranceOverlay,
  removeContextToleranceOverlay,
  type ContextToleranceOverlay,
} from "./context-tolerance-overlay.js";
import { proposeContextVariants } from "./context-variants.js";
import { toleranceFingerprint, toleranceSiteKeys } from "./tolerance-fingerprint.js";

const YORUBA8 = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../keyboards/release/sil/sil_yoruba8/source/sil_yoruba8.kmn",
);

const MEASUREMENT = {
  facetId: "context-tolerance",
  dominantValue: "joined-only",
  confidenceClass: "confident" as const,
  consistency: 1,
  exceptionSites: [],
  evidenceSize: 0,
};

const ACCENT_KEYS: SimKeyInput[] = [
  { vkey: "K_LBRKT", modifiers: [] },
  { vkey: "K_RBRKT", modifiers: [] },
  { vkey: "K_LBRKT", modifiers: ["shift"] },
  { vkey: "K_RBRKT", modifiers: ["shift"] },
  { vkey: "K_BKSLASH", modifiers: ["shift"] },
];

function ruleTexts(ir: KeyboardIR): string[] {
  return ir.groups.flatMap((g) => g.rules.map((r) => `${g.name}: ${emitRule(r, g.usingKeys)}`));
}

async function buildYorubaOverlay() {
  const ir = parse(readFileSync(YORUBA8, "utf-8"), "sil_yoruba8").ir;
  const report = await computeContextTolerance(ir);
  const result = await proposeContextVariants(ir, report);
  const gaps = new Set(report.findings.filter((f) => classifyToleranceFinding(f) === "gap").map((f) => f.ruleId));
  const fixable = [...new Set(result.variants.map((v) => v.sourceRuleId))].filter((id) => gaps.has(id));
  const siteKeys = toleranceSiteKeys(ir, fixable);
  const candidate = createContextToleranceMigrationRule(result, "echo").apply(ir, fixable, MEASUREMENT).candidateIr;
  const overlay = buildContextToleranceOverlay({ ir: candidate, variants: result.variants }, new Set(fixable), siteKeys);
  return { ir, fixable, siteKeys, overlay };
}

describe("context-tolerance overlay (spec 078)", () => {
  it.skipIf(!existsSync(YORUBA8))(
    "replayed onto a fresh parse, it fixes all five accent keys on decomposed input and leaves joined input byte-identical",
    async () => {
      const { ir, fixable, siteKeys, overlay } = await buildYorubaOverlay();
      expect(fixable.length).toBeGreaterThan(0);
      expect(overlay.batches.length).toBeGreaterThan(0);
      expect(new Set(overlay.batches.map((b) => b.siteKey))).toEqual(new Set(fixable.map((id) => siteKeys[id])));

      // Recorded as JSON (the working-copy draft), replayed onto a re-parse.
      const stored = JSON.parse(JSON.stringify(overlay)) as ContextToleranceOverlay;
      const fresh = parse(emit(ir), "sil_yoruba8").ir;
      const { ir: fixed, warnings } = applyContextToleranceOverlay(fresh, stored);
      expect(warnings).toEqual([]);

      const [before, after] = await Promise.all([
        compile(buildToleranceCompileVfs(fresh), "sil_yoruba8"),
        compile(buildToleranceCompileVfs(parse(emit(fixed), "sil_yoruba8").ir), "sil_yoruba8"),
      ]);

      for (const joined of ["ọ", "ẹ"]) {
        const separate = joined.normalize("NFD");
        for (const key of ACCENT_KEYS) {
          const joinedBefore = simulate(before, [key], { text: joined }).finalOutput;
          const joinedAfter = simulate(after, [key], { text: joined }).finalOutput;
          const separateAfter = simulate(after, [key], { text: separate }).finalOutput;
          // FR-008: the keyboard's own form is untouched, byte for byte.
          expect(joinedAfter).toBe(joinedBefore);
          // SC-003: decomposed input now gives the same accented text.
          expect(separateAfter.normalize("NFC")).toBe(joinedAfter.normalize("NFC"));
        }
      }
    },
    120_000,
  );

  it.skipIf(!existsSync(YORUBA8))("removal after an emit/parse round trip restores the original rules", async () => {
    const { ir, fixable, overlay } = await buildYorubaOverlay();
    const fixed = applyContextToleranceOverlay(ir, overlay).ir;
    const reparsed = parse(emit(fixed), "sil_yoruba8").ir;
    expect(ruleTexts(reparsed).length).toBeGreaterThan(ruleTexts(ir).length);

    const stripped = removeContextToleranceOverlay(reparsed, overlay);
    expect(ruleTexts(stripped)).toEqual(ruleTexts(ir));
    // The decision's fingerprint is unchanged, although every rule id moved.
    const idsByText = new Map(stripped.groups.flatMap((g) => g.rules.map((r) => [emitRule(r, g.usingKeys), r.nodeId] as const)));
    const originalTexts = new Map(ir.groups.flatMap((g) => g.rules.map((r) => [r.nodeId, emitRule(r, g.usingKeys)] as const)));
    const strippedIds = fixable.map((id) => idsByText.get(originalTexts.get(id)!)!);
    expect(toleranceFingerprint(stripped, strippedIds)).toBe(toleranceFingerprint(ir, fixable));
  }, 120_000);

  it("replay is idempotent through remove-then-apply, and skips a batch whose anchor is gone", () => {
    const kmn = [
      "store(&NAME) 'Overlay'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "'a' + ']' > 'b'",
      "+ ']' > 'c'",
      "",
    ].join("\n");
    const ir = parse(kmn, "ov").ir;
    const overlay: ContextToleranceOverlay = {
      batches: [
        {
          siteKey: "k1",
          groupName: "main",
          beforeRuleText: emitRule(ir.groups[0]!.rules[1]!, true),
          comment: "Accept the accent typed as a separate character (decomposed text) as well as the joined form.",
          rules: [{ nodeId: "decomposed_accent_x_0", context: [{ kind: "char", value: "x" }, { kind: "raw", text: "+" }, { kind: "char", value: "]" }], output: [{ kind: "char", value: "y" }] }],
        },
        {
          siteKey: "k2",
          groupName: "main",
          beforeRuleText: "+ 'nope' > 'z'",
          comment: "",
          rules: [{ nodeId: "decomposed_accent_q_0", context: [{ kind: "char", value: "q" }], output: [{ kind: "char", value: "r" }] }],
        },
      ],
    };

    const once = applyContextToleranceOverlay(ir, overlay);
    expect(once.warnings).toHaveLength(1);
    expect(once.ir.groups[0]!.rules.map((r) => r.nodeId)[1]).toBe("decomposed_accent_x_0");

    const again = applyContextToleranceOverlay(removeContextToleranceOverlay(once.ir, overlay), overlay).ir;
    expect(ruleTexts(again)).toEqual(ruleTexts(once.ir));
    expect(emit(again)).toContain("Accept the accent typed as a separate character");
  });
});
