// identitySelectors.test — spec 089 T006 / FR-005.
//
// The selectors must reproduce, field for field, what the deleted session
// writers stored: deriveIdentityResult is pinned against the REAL
// extractIdentityLite over the equivalent phase result, so the two
// compositions cannot drift apart silently.

import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  deriveAttribution,
  deriveIdentityResult,
  deriveIdentityResume,
  deriveScaffoldSpec,
  deriveSurveyContext,
} from "./identitySelectors.ts";
import { extractIdentityLite } from "../survey/IdentityLite.tsx";

function decisions(values: Partial<Record<DecisionId, unknown>>): DecisionSet {
  const set: Partial<Record<DecisionId, Decision<unknown>>> = {};
  for (const [id, value] of Object.entries(values)) {
    set[id as DecisionId] = {
      id: id as DecisionId,
      value,
      provenance: "asked",
    };
  }
  return set;
}

const FULL: Partial<Record<DecisionId, unknown>> = {
  "language-name": "French",
  "language-autonym": "Français",
  "language-code": "fr",
  "language-region": "",
  "target-script": "Latn",
  "author-name": "Test Author",
  "author-email": "author@example.org",
  "copyright-holder": "",
};

const FULL_RESULT: SurveyPhaseResult = {
  phase: "A",
  answers: [
    { questionId: "il_language_english", answerType: "text", value: "French" },
    { questionId: "il_language_autonym", answerType: "text", value: "Français" },
    { questionId: "il_language_code", answerType: "text", value: "fr" },
    { questionId: "il_language_region", answerType: "text", value: "" },
    { questionId: "il_target_script", answerType: "select", value: "Latn" },
    { questionId: "il_author_name", answerType: "text", value: "Test Author" },
    { questionId: "il_author_email", answerType: "text", value: "author@example.org" },
    { questionId: "il_copyright_holder", answerType: "text", value: "" },
  ],
};

describe("deriveIdentityResult", () => {
  it("matches extractIdentityLite field-for-field on the full identity set", () => {
    expect(deriveIdentityResult(decisions(FULL))).toEqual(extractIdentityLite(FULL_RESULT));
  });

  it("is null before the target script is recorded (identity not completed)", () => {
    const partial = { ...FULL };
    delete partial["target-script"];
    expect(deriveIdentityResult(decisions(partial))).toBeNull();
    expect(deriveIdentityResult(decisions({}))).toBeNull();
  });

  it("folds a valid region into the composed bcp47 tag", () => {
    const derived = deriveIdentityResult(decisions({ ...FULL, "language-region": "DJ" }));
    expect(derived?.region).toBe("DJ");
    expect(derived?.bcp47).toBe("fr-Latn-DJ");
  });

  it("marks a gated script unsupported, with no attribution when the flow terminated early", () => {
    const derived = deriveIdentityResult(
      decisions({ "language-name": "Amharic", "target-script": "Ethi" }),
    );
    expect(derived?.supported).toBe(false);
    expect(derived?.attribution).toBeNull();
  });
});

describe("deriveAttribution", () => {
  it("defaults the copyright holder to the author name (D1)", () => {
    expect(deriveAttribution(decisions(FULL))?.copyrightHolder).toBe("Test Author");
  });

  it("keeps an explicit holder and omits a blank email", () => {
    const attribution = deriveAttribution(
      decisions({ "author-name": "A", "author-email": "", "copyright-holder": "SIL" }),
    );
    expect(attribution).toEqual({ authorName: "A", copyrightHolder: "SIL" });
  });

  it("is null with no author name recorded", () => {
    expect(deriveAttribution(decisions({ "copyright-holder": "SIL" }))).toBeNull();
  });
});

describe("deriveScaffoldSpec", () => {
  it("derives the spec on the copy track once both answers are recorded", () => {
    expect(
      deriveScaffoldSpec(
        decisions({
          "authoring-track": "copy",
          "project-display-name": "French Test",
          "project-keyboard-id": "french_test",
        }),
      ),
    ).toEqual({ keyboardId: "french_test", displayName: "French Test" });
  });

  it("is null on the adapt track even with both answers recorded", () => {
    expect(
      deriveScaffoldSpec(
        decisions({
          "authoring-track": "adapt",
          "project-display-name": "French Test",
          "project-keyboard-id": "french_test",
        }),
      ),
    ).toBeNull();
  });

  it("is null on the copy track before the project name lands", () => {
    expect(deriveScaffoldSpec(decisions({ "authoring-track": "copy" }))).toBeNull();
  });
});

describe("deriveSurveyContext", () => {
  it("reproduces contextFromIdentity's shape, including the contact seam", () => {
    expect(deriveSurveyContext(decisions(FULL))).toEqual({
      language_name: "French",
      routing_group: "qwerty-qwertz",
      script_family: "Latn",
      bcp47_tag: "fr-Latn",
      author_contact: "author@example.org",
    });
  });

  it("omits bcp47_tag when the composed tag is empty and author_contact without an email", () => {
    const ctx = deriveSurveyContext(
      decisions({ "language-name": "French", "target-script": "Latn", "author-name": "A" }),
    );
    expect(ctx).not.toHaveProperty("bcp47_tag");
    expect(ctx).not.toHaveProperty("author_contact");
  });

  it("is the empty object before identity completes", () => {
    expect(deriveSurveyContext(decisions({}))).toEqual({});
  });
});

describe("deriveIdentityResume", () => {
  it("rebuilds the recorded answers for the resume replay", () => {
    const resume = deriveIdentityResume(decisions(FULL));
    expect(resume?.answers).toContainEqual({
      questionId: "il_target_script",
      answerType: "select",
      value: "Latn",
    });
    expect(resume?.answers).toContainEqual({
      questionId: "il_language_code",
      answerType: "text",
      value: "fr",
    });
    expect(resume?.answers).toHaveLength(8);
  });

  it("is null when no identity answer is recorded", () => {
    expect(deriveIdentityResume(decisions({}))).toBeNull();
  });
});
