// spec 030 US3 — region disambiguation.
//
// When the language picked in il_language_code resolves to more than one
// langtags region variant, IdentityLite routes through il_language_region
// (via getNextOverride). The chosen region:
//   - drives which local-name / autonym / script seeds the later confirmations
//     get (component-internal refs; covered by typecheck + the wiring), and
//   - is folded into IdentityLiteResult.bcp47 at the region position (FR-011).
//
// Pure-logic tests, matching IdentityLite.us1.test.ts. buildTargetBcp47 and
// extractIdentityLite are the two seams whose contract is asserted here.

import { describe, it, expect } from "vitest";
import { buildTargetBcp47, extractIdentityLite } from "./IdentityLite.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

describe("spec 030 US3 — buildTargetBcp47 region subtag (FR-011)", () => {
  it("appends the region after the script (language-script-region)", () => {
    expect(buildTargetBcp47("aa", "Latn", "DJ")).toBe("aa-Latn-DJ");
  });

  it("emits language-region when the script is omitted (other/empty)", () => {
    expect(buildTargetBcp47("aa", "other", "DJ")).toBe("aa-DJ");
    expect(buildTargetBcp47("aa", "", "DJ")).toBe("aa-DJ");
  });

  it("places the region before the fonipa variant (language-region-variant)", () => {
    expect(buildTargetBcp47("aa", "fonipa", "DJ")).toBe("aa-DJ-fonipa");
  });

  it("keeps the romanization Latn script with a trailing region", () => {
    expect(buildTargetBcp47("aa", "romanization-Latn", "DJ")).toBe("aa-Latn-DJ");
  });

  it("is unchanged when region is empty (unambiguous / skipped)", () => {
    expect(buildTargetBcp47("aa", "Latn", "")).toBe("aa-Latn");
    expect(buildTargetBcp47("aa", "Latn")).toBe("aa-Latn");
    expect(buildTargetBcp47("aa", "fonipa", "")).toBe("aa-fonipa");
    expect(buildTargetBcp47("aa", "romanization-Latn")).toBe("aa-Latn");
  });

  it("trims a padded region subtag", () => {
    expect(buildTargetBcp47("aa", "Latn", "  DJ  ")).toBe("aa-Latn-DJ");
  });

  it("returns empty for an empty language regardless of region", () => {
    expect(buildTargetBcp47("", "Latn", "DJ")).toBe("");
  });
});

describe("spec 030 US3 — extractIdentityLite folds the region into bcp47", () => {
  it("reads il_language_region and appends it to the tag", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "aa" },
        { questionId: "il_language_region", answerType: "text", value: "DJ" },
        { questionId: "il_language_english", answerType: "text", value: "Afar" },
        { questionId: "il_language_autonym", answerType: "text", value: "Qafar" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    };
    const id = extractIdentityLite(result);
    expect(id.region).toBe("DJ");
    expect(id.bcp47).toBe("aa-Latn-DJ");
  });

  it("omits the region when il_language_region is absent (unambiguous language)", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "ha" },
        { questionId: "il_language_english", answerType: "text", value: "Hausa" },
        { questionId: "il_language_autonym", answerType: "text", value: "Hausa" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    };
    const id = extractIdentityLite(result);
    expect(id.region).toBe("");
    expect(id.bcp47).toBe("ha-Latn");
  });

  it("omits the region when the author skipped il_language_region (blank)", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "aa" },
        { questionId: "il_language_region", answerType: "text", value: "" },
        { questionId: "il_language_english", answerType: "text", value: "Afar" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    };
    const id = extractIdentityLite(result);
    expect(id.region).toBe("");
    expect(id.bcp47).toBe("aa-Latn");
  });
});
