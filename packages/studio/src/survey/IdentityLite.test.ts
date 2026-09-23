// Pure-logic tests for the identity-lite step (no jsdom): the flow order, answer
// extraction (extractIdentityLite), and BCP47 tag building (buildTargetBcp47,
// normalizeRegionSubtag). refs #369; spec 030 US1 (English-name-first order) and
// US3 (region disambiguation, FR-011).
//
// The seed WIRING (getSeedValue returning the resolved autonym/code,
// onEntryResolved carrying the picked entry, region-driven seeds) is
// component-internal to IdentityLite.tsx and covered by typecheck and the
// component-level IdentityLite.*.test.tsx suites.

import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { extractIdentityLite, buildTargetBcp47, normalizeRegionSubtag } from "./IdentityLite.tsx";
import { advance } from "../steps/advance.ts";
import { loadModularFlow } from "./loadModularFlow.ts";
import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

function result(
  targetScript: string,
  langCode = "",
): SurveyPhaseResult {
  return {
    phase: "A",
    answers: [
      { questionId: "il_language_autonym", answerType: "text", value: "Fà'" },
      { questionId: "il_language_english", answerType: "text", value: "Bafut" },
      { questionId: "il_language_code", answerType: "text", value: langCode },
      { questionId: "il_target_script", answerType: "select", value: targetScript },
    ],
  };
}

// ---------------------------------------------------------------------------
// Flow order (spec 030 US1/FR-009)
// ---------------------------------------------------------------------------

describe("identity_lite flow order (English name first)", () => {
  const flow = loadModularFlow(identityLiteRaw as string);

  it("orders the questions: english -> region -> autonym -> code -> script -> not-supported -> attribution", () => {
    // Relative order via indexOf rather than a brittle full-order literal.
    // il_language_region (US3) is conditional, reached only when the picked
    // language is region-ambiguous.
    const ids = flow.questions.map((q) => q.id);
    expect(ids.indexOf("il_language_english")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("il_language_region")).toBeGreaterThan(ids.indexOf("il_language_english"));
    expect(ids.indexOf("il_language_autonym")).toBeGreaterThan(ids.indexOf("il_language_region"));
    expect(ids.indexOf("il_language_code")).toBeGreaterThan(ids.indexOf("il_language_autonym"));
    expect(ids.indexOf("il_target_script")).toBeGreaterThan(ids.indexOf("il_language_code"));
    expect(ids.indexOf("il_script_not_supported")).toBeGreaterThan(ids.indexOf("il_target_script"));
    // spec 064 US1 — attribution capture, ordered name -> email -> holder. Anchored
    // to il_target_script rather than to il_script_not_supported: these are reached
    // from il_target_script's DEFAULT branch, while a gated script terminates at the
    // not-supported notice and never arrives here.
    expect(ids.indexOf("il_author_name")).toBeGreaterThan(ids.indexOf("il_target_script"));
    expect(ids.indexOf("il_author_email")).toBeGreaterThan(ids.indexOf("il_author_name"));
    expect(ids.indexOf("il_copyright_holder")).toBeGreaterThan(ids.indexOf("il_author_email"));
  });

  it("the first question is the English-name langtags picker", () => {
    const first = flow.questions[0];
    expect(first?.id).toBe("il_language_english");
    expect(first?.type).toBe("autocomplete");
    expect(first?.options_source).toBe("@langtags_names");
  });
});

describe("extractIdentityLite", () => {
  it("extracts the language names and a supported Latin script", () => {
    const r = extractIdentityLite(result("Latn", "bfd"));
    expect(r.autonym).toBe("Fà'");
    expect(r.english).toBe("Bafut");
    expect(r.targetScriptRaw).toBe("Latn");
    expect(r.supported).toBe(true);
    expect(r.prefill).toEqual({
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    });
  });

  it("extracts the language subtag and builds bcp47 for Latin + code", () => {
    const r = extractIdentityLite(result("Latn", "ha"));
    expect(r.languageSubtag).toBe("ha");
    expect(r.bcp47).toBe("ha-Latn");
  });

  it("extracts the language subtag and builds bcp47 for Devanagari + code", () => {
    const r = extractIdentityLite(result("Deva", "hi"));
    expect(r.languageSubtag).toBe("hi");
    expect(r.bcp47).toBe("hi-Deva");
  });

  it("bcp47 is empty when language code is blank or absent (author unsure), and the names still carry", () => {
    const r = extractIdentityLite(result("Latn", ""));
    expect(r.languageSubtag).toBe("");
    expect(r.bcp47).toBe("");

    // No code answer at all (spec 030 US1): still completes with an empty tag.
    const noCode = extractIdentityLite({
      phase: "A",
      answers: [
        { questionId: "il_language_english", answerType: "text", value: "My Language" },
        { questionId: "il_language_autonym", answerType: "text", value: "Mine" },
      ],
    });
    expect(noCode.languageSubtag).toBe("");
    expect(noCode.bcp47).toBe("");
    expect(noCode.english).toBe("My Language");
  });

  it("decouples: a romanization yields a Latin alphabetic/qwerty prefill", () => {
    const r = extractIdentityLite(result("romanization-Latn", "hi"));
    expect(r.prefill.script).toBe("Latn");
    expect(r.prefill.routingGroup).toBe("qwerty-qwertz");
    expect(r.supported).toBe(true);
    expect(r.bcp47).toBe("hi-Latn");
  });

  it("IPA carries the fonipa variant in prefill and bcp47 uses fonipa", () => {
    const r = extractIdentityLite(result("fonipa", "en"));
    expect(r.prefill.variant).toBe("fonipa");
    expect(r.prefill.scriptClass).toBe("alphabetic");
    expect(r.bcp47).toBe("en-fonipa");
  });

  it("Devanagari yields an abugida/non-roman prefill", () => {
    const r = extractIdentityLite(result("Deva"));
    expect(r.prefill.scriptClass).toBe("abugida");
    expect(r.prefill.routingGroup).toBe("non-roman");
  });

  it("flags gated scripts (Ethiopic) as unsupported", () => {
    const r = extractIdentityLite(result("Ethi"));
    expect(r.supported).toBe(false);
  });

  // spec 034 T013 (SR-4, FR-012, SC-005): every gated script family flows
  // identity -> unsupported so StepHost renders the "not supported" stub — the
  // gallery is never silently emptied. This pins BOTH halves: extractIdentityLite
  // sets supported:false AND advance() routes that to the "unsupported" terminal.
  describe("gated scripts route identity -> unsupported (SR-4)", () => {
    for (const script of ["Ethi", "Hani", "Hang"]) {
      it(`${script}: supported === false and advance("identity") === "unsupported"`, () => {
        const identity = extractIdentityLite(result(script, "xx"));
        expect(identity.supported).toBe(false);
        const outcome = advance("identity", undefined, {
          selectedTrack: null,
          identitySupported: identity.supported,
        });
        expect(outcome.next).toBe("unsupported");
      });
    }
  });

  // spec 034 T006a (FR-002, AS-1): identity resolution PROPOSES a BCP47
  // (language + script) tag to confirm — it never leaves a blank identity for a
  // typed language + chosen script. "Propose-then-confirm", never a blank form.
  describe("proposes a BCP47 tag for confirmation, never blank (T006a)", () => {
    it("a typed language code + proven script yields a non-blank language+script tag", () => {
      const identity = extractIdentityLite(result("Cyrl", "ru"));
      expect(identity.bcp47).toBe("ru-Cyrl");
      expect(identity.bcp47).not.toBe("");
      // The script prefill is proposed too (confirmed, not asked blank).
      expect(identity.prefill.script).toBe("Cyrl");
    });

    it("proposes the tag across all five proven scripts (language+script), never blank", () => {
      const cases: Array<[string, string]> = [
        ["Latn", "ha-Latn"],
        ["Cyrl", "ru-Cyrl"],
        ["Grek", "el-Grek"],
        ["Geor", "ka-Geor"],
        ["Armn", "hy-Armn"],
      ];
      for (const [script, expected] of cases) {
        const lang = expected.split("-")[0]!;
        const identity = extractIdentityLite(result(script, lang));
        expect(identity.bcp47).toBe(expected);
      }
    });
  });

  // Complement: the five proven alphabetic scripts stay supported and advance
  // into the real spine (choose_base), never the unsupported stub (FR-011).
  describe("proven alphabetic scripts stay supported (FR-011)", () => {
    for (const script of ["Latn", "Cyrl", "Grek", "Geor", "Armn"]) {
      it(`${script}: supported === true and advance("identity") === "choose_base"`, () => {
        const identity = extractIdentityLite(result(script, "xx"));
        expect(identity.supported).toBe(true);
        const outcome = advance("identity", undefined, {
          selectedTrack: null,
          identitySupported: identity.supported,
        });
        expect(outcome.next).toBe("choose_base");
      });
    }
  });

  // spec 030 US1: the English name is asked first and the code confirmation
  // last; extraction reads each answer by id, so the reordered answers map the same.
  it("derives english / autonym / code from answers in the reordered flow order, with no region", () => {
    const id = extractIdentityLite({
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "ha" },
        { questionId: "il_language_english", answerType: "text", value: "Hausa" },
        { questionId: "il_language_autonym", answerType: "text", value: "Hausa" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    });
    expect(id.languageSubtag).toBe("ha");
    expect(id.english).toBe("Hausa");
    expect(id.autonym).toBe("Hausa");
    expect(id.bcp47).toBe("ha-Latn");
    expect(id.supported).toBe(true);
    // Unambiguous language: il_language_region is never asked (spec 030 US3).
    expect(id.region).toBe("");
  });

  it("free-text / unmatched language still completes — no dead end (spec 030 FR-003)", () => {
    // Author typed a code not in langtags; the seeds were empty so they typed the
    // names themselves. Extraction must not throw and must carry their input.
    const answers: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "bft" },
        { questionId: "il_language_english", answerType: "text", value: "Balti" },
        { questionId: "il_language_autonym", answerType: "text", value: "" },
      ],
    };
    expect(() => extractIdentityLite(answers)).not.toThrow();
    const id = extractIdentityLite(answers);
    expect(id.languageSubtag).toBe("bft");
    expect(id.english).toBe("Balti");
  });

  it("reads il_language_region and folds it into bcp47 (spec 030 US3/FR-011)", () => {
    const id = extractIdentityLite({
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "aa" },
        { questionId: "il_language_region", answerType: "text", value: "DJ" },
        { questionId: "il_language_english", answerType: "text", value: "Afar" },
        { questionId: "il_language_autonym", answerType: "text", value: "Qafar" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    });
    expect(id.region).toBe("DJ");
    expect(id.bcp47).toBe("aa-Latn-DJ");
  });

  it("omits the region when the author skipped il_language_region (blank)", () => {
    const id = extractIdentityLite({
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "aa" },
        { questionId: "il_language_region", answerType: "text", value: "" },
        { questionId: "il_language_english", answerType: "text", value: "Afar" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    });
    expect(id.region).toBe("");
    expect(id.bcp47).toBe("aa-Latn");
  });

  it("returns empty strings for missing answers", () => {
    const r = extractIdentityLite({ phase: "A", answers: [] });
    expect(r.autonym).toBe("");
    expect(r.english).toBe("");
    expect(r.languageSubtag).toBe("");
    expect(r.targetScriptRaw).toBe("");
    expect(r.bcp47).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildTargetBcp47
// ---------------------------------------------------------------------------

describe("buildTargetBcp47", () => {
  it("plain Latin script: lang-Latn", () => {
    expect(buildTargetBcp47("ha", "Latn")).toBe("ha-Latn");
  });

  it("plain Devanagari script: lang-Deva", () => {
    expect(buildTargetBcp47("hi", "Deva")).toBe("hi-Deva");
  });

  it("plain Arabic script: lang-Arab", () => {
    expect(buildTargetBcp47("ar", "Arab")).toBe("ar-Arab");
  });

  it("romanization-Latn: lang-Latn (not romanization-Latn)", () => {
    expect(buildTargetBcp47("hi", "romanization-Latn")).toBe("hi-Latn");
  });

  it("fonipa: lang-fonipa (no script subtag, variant only)", () => {
    expect(buildTargetBcp47("en", "fonipa")).toBe("en-fonipa");
  });

  it("empty or whitespace-only language subtag: empty string regardless of script or region", () => {
    expect(buildTargetBcp47("", "Latn")).toBe("");
    expect(buildTargetBcp47("", "fonipa")).toBe("");
    expect(buildTargetBcp47("  ", "Deva")).toBe("");
    expect(buildTargetBcp47("  ", "Latn")).toBe("");
    expect(buildTargetBcp47("", "Latn", "DJ")).toBe("");
  });

  // Region subtag (spec 030 US3/FR-011).

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

  it("upper-cases a lower-case alpha-2 region subtag", () => {
    expect(buildTargetBcp47("aa", "Latn", "dj")).toBe("aa-Latn-DJ");
  });

  it("keeps a UN M.49 numeric region subtag", () => {
    expect(buildTargetBcp47("aa", "Latn", "150")).toBe("aa-Latn-150");
  });

  it("drops a free-text region NAME rather than emit an invalid BCP47 tag", () => {
    // Author typed the country name instead of picking the "DJ" datalist code:
    // "aa-Latn-Djibouti" is not a valid BCP47 tag, so the region is dropped.
    expect(buildTargetBcp47("aa", "Latn", "Djibouti")).toBe("aa-Latn");
    expect(buildTargetBcp47("aa", "other", "Djibouti")).toBe("aa");
    expect(buildTargetBcp47("aa", "fonipa", "Djibouti")).toBe("aa-fonipa");
  });
});

// ---------------------------------------------------------------------------
// normalizeRegionSubtag (BCP47 region shape validation, spec 030 US3)
// ---------------------------------------------------------------------------

describe("normalizeRegionSubtag", () => {
  it("keeps a valid ISO 3166-1 alpha-2 code, upper-cased", () => {
    expect(normalizeRegionSubtag("DJ")).toBe("DJ");
    expect(normalizeRegionSubtag("dj")).toBe("DJ");
    expect(normalizeRegionSubtag("  fr  ")).toBe("FR");
  });

  it("keeps a valid UN M.49 three-digit area code", () => {
    expect(normalizeRegionSubtag("150")).toBe("150");
    expect(normalizeRegionSubtag("001")).toBe("001");
  });

  it("drops anything that is not a shape-valid region subtag", () => {
    expect(normalizeRegionSubtag("Djibouti")).toBe("");
    expect(normalizeRegionSubtag("USA")).toBe(""); // alpha-3 is not a BCP47 region subtag
    expect(normalizeRegionSubtag("12")).toBe("");
    expect(normalizeRegionSubtag("1500")).toBe("");
    expect(normalizeRegionSubtag("")).toBe("");
    expect(normalizeRegionSubtag("   ")).toBe("");
  });
});
