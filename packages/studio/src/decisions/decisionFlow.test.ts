// Tests for the decision flow runner: the import bundle (IR + catalog
// metadata) as the extraction input (spec 085, clarify Q1).

import { describe, it, expect } from "vitest";
import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import { runDecisionFlow } from "./decisionFlow.ts";

function fixtureIR(bcp47: string[], keyboardId = "sil_cameroon_qwerty"): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId,
      name: "Cameroon QWERTY",
      bcp47,
      copyright: "© SIL",
      version: "1.0",
      targets: ["windows"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function fixtureCatalog(overrides: Partial<BaseKeyboard> = {}): BaseKeyboard {
  return {
    id: "sil_cameroon_qwerty",
    path: "release/s/sil_cameroon_qwerty",
    script: "Latn",
    targets: ["windows"],
    displayName: "Cameroon QWERTY",
    version: "1.0",
    languages: ["bam", "ewo"],
    ...overrides,
  };
}

function stubModule(
  id: string,
  opts: {
    provides?: QuestionModule["provides"];
    extract?: QuestionModule["extract"];
  } = {},
): QuestionModule {
  return {
    definition: { id, type: "text" },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...opts,
  };
}

describe("runDecisionFlow", () => {
  it("prefers the catalog id as the extraction source identity", () => {
    const mod = stubModule("pick_script", {
      provides: ["target-script"],
      extract: (ctx) => ctx.ir?.header.bcp47[0]?.split("-")[1],
    });
    const decisions = runDecisionFlow({
      modules: [mod],
      context: {
        ir: fixtureIR(["bam-Latn"], "ir-header-id"),
        catalog: fixtureCatalog({ id: "catalog-id" }),
      },
    });
    expect(decisions["target-script"]).toMatchObject({
      value: "Latn",
      provenance: "extracted",
      source: "catalog-id",
    });
  });

  it("falls back to the IR header identity for non-catalog imports", () => {
    const mod = stubModule("pick_script", {
      provides: ["target-script"],
      extract: (ctx) => ctx.ir?.header.bcp47[0]?.split("-")[1],
    });
    const decisions = runDecisionFlow({
      modules: [mod],
      context: { ir: fixtureIR(["bam-Latn"], "ir-header-id"), catalog: null },
    });
    expect(decisions["target-script"]).toMatchObject({
      value: "Latn",
      provenance: "extracted",
      source: "ir-header-id",
    });
  });

  it("treats extracts as absent when the IR failed to parse", () => {
    const mod = stubModule("pick_script", {
      provides: ["target-script"],
      extract: (ctx) => ctx.ir?.header.bcp47[0],
    });
    const decisions = runDecisionFlow({
      modules: [mod],
      context: { ir: null, catalog: fixtureCatalog() },
    });
    // No IR evidence: falls through to asked/default, never a phantom extract.
    expect(decisions["target-script"]).toMatchObject({
      value: undefined,
      provenance: "default",
    });
  });

  it("extracts from catalog metadata where the IR carries nothing", () => {
    const mod = stubModule("pick_code", {
      provides: ["language-code"],
      extract: (ctx) => ctx.catalog?.languages?.[0],
    });
    const decisions = runDecisionFlow({
      modules: [mod],
      context: { ir: fixtureIR([]), catalog: fixtureCatalog({ languages: ["ewo"] }) },
    });
    expect(decisions["language-code"]).toMatchObject({
      value: "ewo",
      provenance: "extracted",
      source: "sil_cameroon_qwerty",
    });
  });

  it("fans out one decision per provided id", () => {
    const mod = stubModule("pick_both", {
      provides: ["language-code", "target-script"],
      extract: () => "shared",
    });
    const decisions = runDecisionFlow({
      modules: [mod],
      context: { ir: fixtureIR([]), catalog: fixtureCatalog() },
    });
    expect(decisions["language-code"]).toMatchObject({ value: "shared", provenance: "extracted" });
    expect(decisions["target-script"]).toMatchObject({ value: "shared", provenance: "extracted" });
  });
});
