// Tests for the decision-spike runner: extract pre-fill, ask fallback, and
// conditional gating (km/decisions-spike).

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";
import { runSpikeDecisionFlow } from "./spikeRunner.ts";

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

const spikeModules = [
  "il_language_english",
  "il_language_code",
  "il_target_script",
  "il_script_not_supported",
  "il_author_name",
].map((id) => {
  const mod = questionRegistry[id];
  if (!mod) throw new Error(`question "${id}" not in registry`);
  return mod;
});

describe("runSpikeDecisionFlow", () => {
  it("extracts language-code and target-script from the base keyboard", () => {
    const decisions = runSpikeDecisionFlow({
      modules: spikeModules,
      baseIR: fixtureIR(["bam-Latn"]),
      answers: { il_language_english: "Hausa" },
    });

    expect(decisions["language-code"]).toMatchObject({
      value: "bam",
      provenance: "extracted",
      source: "sil_cameroon_qwerty",
    });
    expect(decisions["target-script"]).toMatchObject({
      value: "Latn",
      provenance: "extracted",
      source: "sil_cameroon_qwerty",
    });
    expect(decisions["language-name"]).toMatchObject({
      value: "Hausa",
      provenance: "asked",
    });
  });

  it("falls back to asked answers when the base keyboard has no metadata", () => {
    const decisions = runSpikeDecisionFlow({
      modules: spikeModules,
      baseIR: fixtureIR([]),
      answers: { il_language_english: "Hausa", il_language_code: "ha", il_target_script: "Latn" },
    });

    expect(decisions["language-code"]).toMatchObject({ value: "ha", provenance: "asked" });
    expect(decisions["target-script"]).toMatchObject({ value: "Latn", provenance: "asked" });
  });

  it("gates the not-supported branch in for Ethiopic; attribution is ungated in the runner (#1901)", () => {
    const decisions = runSpikeDecisionFlow({
      modules: spikeModules,
      baseIR: fixtureIR(["am-Ethi"]),
      answers: { il_language_english: "Amharic" },
    });

    expect(decisions["target-script"]).toMatchObject({ value: "Ethi", provenance: "extracted" });
    // #1901: il_author_name no longer carries a derived gate (it heads the
    // post-track attribution flow), so this runner — which has no session
    // terminal — treats it as an ordinary unanswered question (the
    // default-provenance record below). The live app's "a gated script is
    // never asked attribution" protection is the session terminal in
    // steps/advance.ts, not a module gate.
    expect(decisions["author-name"]).toMatchObject({
      value: undefined,
      provenance: "default",
    });
  });

  it("records the asked author name for Latin and skips the not-supported branch", () => {
    const decisions = runSpikeDecisionFlow({
      modules: spikeModules,
      baseIR: fixtureIR(["bam-Latn"]),
      answers: { il_language_english: "Hausa", il_author_name: "J. Doe" },
    });

    expect(decisions["author-name"]).toMatchObject({ value: "J. Doe", provenance: "asked" });
  });

  it("records default provenance when neither extract nor answer applies", () => {
    const decisions = runSpikeDecisionFlow({
      modules: spikeModules,
      answers: { il_language_english: "Hausa" },
    });

    expect(decisions["language-code"]).toMatchObject({
      value: undefined,
      provenance: "default",
    });
  });

  it("treats an extracted value the module would reject as absent", () => {
    const picky: QuestionModule = {
      definition: { id: "pick_script", type: "text" },
      fixtures: { valid: [{ value: "Latn" }], invalid: [] },
      inputs: [],
      writes: [],
      provides: ["target-script"],
      extract: () => "not-a-script",
      validate: (v) =>
        v === "not-a-script"
          ? { ok: false, code: "invalid", message: "not a script" }
          : { ok: true },
    };
    const decisions = runSpikeDecisionFlow({
      modules: [picky],
      baseIR: fixtureIR(["bam-Latn"]),
      answers: { pick_script: "Latn" },
    });
    // Falls through to the asked answer instead of injecting the invalid extract.
    expect(decisions["target-script"]).toMatchObject({
      value: "Latn",
      provenance: "asked",
    });
  });

  it("wraps a throwing extract with the module id", () => {
    const boom: QuestionModule = {
      definition: { id: "boom_script", type: "text" },
      fixtures: { valid: [{ value: "Latn" }], invalid: [] },
      inputs: [],
      writes: [],
      provides: ["target-script"],
      extract: () => {
        throw new Error("kaboom");
      },
    };
    expect(() =>
      runSpikeDecisionFlow({ modules: [boom], baseIR: fixtureIR(["bam-Latn"]) }),
    ).toThrow('extract() for module "boom_script" threw: kaboom');
  });
});
