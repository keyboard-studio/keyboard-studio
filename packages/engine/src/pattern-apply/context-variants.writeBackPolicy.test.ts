// spec 062 US3 (FR-007): write-back policy tests for the context-tolerance
// migration wiring — proposeContextVariants (T008) always bakes the
// keyboard's own-form bytes; createContextToleranceMigrationRule (T009/T017)
// switches between that and the echo (NFD) form at apply() time, without
// recompiling. See migrations/context-tolerance.ts's module doc.

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants } from "./context-variants.js";
import {
  createContextToleranceMigrationRule,
  buildContextToleranceOutputDiffPreview,
} from "../facet-transform/migrations/context-tolerance.js";

const HEADER = [
  "store(&NAME) 'ContextVariants'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

// Same fixture shape as context-variants.test.ts: acute store U+00E2
// (a-with-circumflex) is a single precomposed codepoint whose NFD form is
// "a" + U+0302 (combining circumflex) — the two byte forms this policy
// switch chooses between.
const GAP_KMN = [
  HEADER,
  "group(main) using keys",
  "",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

// a-with-circumflex, precomposed (single codepoint, U+00E2) vs. "a" +
// combining circumflex U+0302 (two codepoints) — the own-form and echo
// forms this policy switch chooses between.
const OWN_FORM_A_CIRCUMFLEX = "â";
const ECHO_A_CIRCUMFLEX = "â";

// a-with-grave, precomposed (U+00E0) vs. decomposed "a" + combining grave
// (U+0300) — the seed buffer for each test.
const PRECOMPOSED_A_GRAVE = "à";
const DECOMPOSED_A_GRAVE = "à";

async function compileIr(ir: KeyboardIR) {
  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(ir), isBinary: false },
  ]);
  return compile(vfs, ir.header.keyboardId);
}

async function buildResult(keyboardId: string) {
  const { ir } = parse(GAP_KMN, keyboardId);
  const report = await computeContextTolerance(ir);
  const result = await proposeContextVariants(ir, report);
  const acceptedSiteIds = result.variants.map((v) => v.sourceRuleId);
  return { result, acceptedSiteIds };
}

const ACUTE_KEY = { vkey: "K_RBRKT", modifiers: [] as const };

const MEASUREMENT = {
  facetId: "context-tolerance",
  dominantValue: "not-tolerant",
  confidenceClass: "confident" as const,
  consistency: 1,
  exceptionSites: [],
  evidenceSize: 1,
};

describe("context-tolerance write-back policy (spec 062 US3, FR-007)", () => {
  it("Acceptance Scenario 1: default (echo) emits the decomposed form, canonically equivalent to the own-form output", async () => {
    const { result, acceptedSiteIds } = await buildResult("wbp_echo_default");
    const rule = createContextToleranceMigrationRule(result); // no policy arg -> default
    const { candidateIr } = rule.apply(result.ir, acceptedSiteIds, MEASUREMENT);

    const compiled = await compileIr(candidateIr);
    expect(compiled.success).toBe(true);
    const finalOutput = simulate(compiled, [ACUTE_KEY], { text: DECOMPOSED_A_GRAVE }).finalOutput;

    expect(finalOutput).toBe(ECHO_A_CIRCUMFLEX);
    expect(finalOutput).not.toBe(OWN_FORM_A_CIRCUMFLEX);
    expect(finalOutput.normalize("NFC")).toBe(OWN_FORM_A_CIRCUMFLEX);
  }, 30_000);

  it('Acceptance Scenario 2: "own-form" rewrites the touched cluster and the consequence is disclosed via an output-diff preview', async () => {
    const { result, acceptedSiteIds } = await buildResult("wbp_own_form");
    const rule = createContextToleranceMigrationRule(result, "own-form");
    const { candidateIr } = rule.apply(result.ir, acceptedSiteIds, MEASUREMENT);

    const compiled = await compileIr(candidateIr);
    expect(compiled.success).toBe(true);
    const finalOutput = simulate(compiled, [ACUTE_KEY], { text: DECOMPOSED_A_GRAVE }).finalOutput;
    expect(finalOutput).toBe(OWN_FORM_A_CIRCUMFLEX);

    const preview = buildContextToleranceOutputDiffPreview(result, acceptedSiteIds, "own-form");
    expect(preview?.previewKind).toBe("output-diff");
    expect(preview?.outputDiff).toEqual([{ before: ECHO_A_CIRCUMFLEX, after: OWN_FORM_A_CIRCUMFLEX }]);
  }, 30_000);

  it("Acceptance Scenario 3: emitted bytes are identical under both settings when the buffer already holds the keyboard's own form", async () => {
    const echoBuild = await buildResult("wbp_precomposed_echo");
    const echoRule = createContextToleranceMigrationRule(echoBuild.result, "echo");
    const echoIr = echoRule.apply(echoBuild.result.ir, echoBuild.acceptedSiteIds, MEASUREMENT).candidateIr;

    const ownFormBuild = await buildResult("wbp_precomposed_own_form");
    const ownFormRule = createContextToleranceMigrationRule(ownFormBuild.result, "own-form");
    const ownFormIr = ownFormRule.apply(ownFormBuild.result.ir, ownFormBuild.acceptedSiteIds, MEASUREMENT).candidateIr;

    const echoCompiled = await compileIr(echoIr);
    const ownFormCompiled = await compileIr(ownFormIr);
    const echoOutput = simulate(echoCompiled, [ACUTE_KEY], { text: PRECOMPOSED_A_GRAVE }).finalOutput;
    const ownFormOutput = simulate(ownFormCompiled, [ACUTE_KEY], { text: PRECOMPOSED_A_GRAVE }).finalOutput;

    expect(echoOutput).toBe(ownFormOutput);
    expect(echoOutput).toBe(OWN_FORM_A_CIRCUMFLEX);
  }, 30_000);

  it('buildContextToleranceOutputDiffPreview returns undefined for "echo" (nothing is rewritten)', async () => {
    const { result, acceptedSiteIds } = await buildResult("wbp_no_preview_for_echo");
    expect(buildContextToleranceOutputDiffPreview(result, acceptedSiteIds, "echo")).toBeUndefined();
  }, 30_000);
});
