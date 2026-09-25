// Parametric suite for the spec 022 reserve (demoted, not deleted) question
// modules. It iterates reserveRegistry — every module physically under
// src/survey/questions/reserve/ — and runs each one through the shared
// contract suite (src/test/questionModuleContract.ts): fixtures through its
// own validate(), the definition snapshot line and the generic invariants.
//
// This is the TEST-COVERED leg of the no-delete guardrail
// (src/survey/questions/noDeleteGuardrail.test.ts): a reserve module stays
// covered while it is registered here and declares at least one valid
// fixture. Modules with a mutate() seam keep their own test file next to this
// one (iso_code, language_name_english, pa_copyright_holder, primary_script).

import { describe, it, expect } from "vitest";
import {
  RESERVE_QUESTION_MODULES,
  describeQuestionModules,
  type ValidateProbe,
} from "../../../../src/test/questionModuleContract.ts";
import { reserveRegistry } from "../../../../src/survey/questions/registry.reserve.ts";

// Hand-written validate() cases that are not in a module's own fixtures,
// carried over from the per-module reserve tests this suite replaced.
const PROBES: Readonly<Record<string, readonly ValidateProbe[]>> = {
  author_contact_email: [
    { value: "not-an-email", accepts: true, note: "no format enforcement beyond the YAML contract (required only)" },
  ],
  author_display_name: [{ value: "комитет по языку", accepts: true, note: "Unicode names" }],
  language_name_autonym: [
    { value: "عربي", accepts: true, note: "no script gate at validation (Arabic)" },
    { value: "日本語", accepts: true, note: "no script gate at validation (Han)" },
    { value: "አማርኛ", accepts: true, note: "no script gate at validation (Ethiopic)" },
  ],
  region: [{ value: "Côte d'Ivoire", accepts: true, note: "Unicode region names" }],
};

describe("reserve suite iterates reserveRegistry", () => {
  it("runs exactly the reserveRegistry modules, each as its on-disk module", () => {
    expect(RESERVE_QUESTION_MODULES.map((e) => e.id).sort()).toEqual(Object.keys(reserveRegistry).sort());
    for (const { id, mod } of RESERVE_QUESTION_MODULES) {
      expect(reserveRegistry[id], `reserveRegistry["${id}"] is not reserve/${id}.ts's default export`).toBe(mod);
    }
  });
});

describeQuestionModules("reserve question modules (spec 022)", RESERVE_QUESTION_MODULES, { probes: PROBES });
