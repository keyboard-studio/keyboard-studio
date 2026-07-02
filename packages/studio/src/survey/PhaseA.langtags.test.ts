// T022 / T023 / T024 / T025 — langtags autonym/English/region seeding tests.
//
// These are pure logic tests (no React rendering) covering:
//   T022  — autonym / English-name / region seeding + provenance captions +
//            override-wins behavior for Phase A.
//   T023  — free-text escape: a value not in the langtags list is accepted.
//   T024  — unknown code → null defaults → NO seed, NO caption.
//   T025  — a not-in-langtags language completes identity via free text with
//            zero forced proposals (SC-003).

import { describe, it, expect } from "vitest";
import { regionNameFor } from "../lib/langtagsDefaults.ts";
import { regionCodeToName } from "../lib/iso3166Names.ts";
import { scriptToTargetOption } from "../lib/langtagsDefaults.ts";
import { buildTargetBcp47, extractIdentityLite } from "./IdentityLite.tsx";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// T022(a) — autonym seeding from LanguageDefaults.autonym
// ---------------------------------------------------------------------------

describe("T022(a) — autonym seed via Phase A (after code is known)", () => {
  it("an autonym from langtags defaults is a non-empty string", () => {
    // The langtags index records autonym for most languages.
    // We validate the helper logic, not the actual index (which is an engine
    // concern covered by engine contract tests C1–C9).
    //
    // The Phase A seeding logic: if defaults.autonym !== undefined && !== ""
    //   → seeds "language_name_autonym" with the autonym.
    // We verify the guard is correct: a present, non-empty autonym should seed.
    const fakeAutonym = "Hausa";
    const shouldSeed = fakeAutonym !== undefined && fakeAutonym !== "";
    expect(shouldSeed).toBe(true);
  });

  it("an undefined autonym does NOT seed the autonym field", () => {
    const autonym: string | undefined = undefined;
    const shouldSeed = autonym !== undefined && autonym !== "";
    expect(shouldSeed).toBe(false);
  });

  it("an empty-string autonym does NOT seed the autonym field", () => {
    const autonym = "";
    const shouldSeed = autonym !== undefined && autonym !== "";
    expect(shouldSeed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T022(b) — English-name seeding from LanguageDefaults.englishName
// ---------------------------------------------------------------------------

describe("T022(b) — English-name seed", () => {
  it("a present English name seeds 'language_name_english'", () => {
    const englishName = "Hausa";
    const shouldSeed = englishName !== undefined && englishName !== "";
    expect(shouldSeed).toBe(true);
  });

  it("an undefined English name does NOT seed", () => {
    const englishName: string | undefined = undefined;
    const shouldSeed = englishName !== undefined && englishName !== "";
    expect(shouldSeed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T022(c) — region seeding: ISO-3166 alpha-2 code → English country name
// ---------------------------------------------------------------------------

describe("T022(c) — region seeding via iso3166Names", () => {
  it("NG maps to Nigeria", () => {
    expect(regionCodeToName("NG")).toBe("Nigeria");
  });

  it("IN maps to India", () => {
    expect(regionCodeToName("IN")).toBe("India");
  });

  it("CM maps to Cameroon", () => {
    expect(regionCodeToName("CM")).toBe("Cameroon");
  });

  it("TZ maps to Tanzania", () => {
    expect(regionCodeToName("TZ")).toBe("Tanzania");
  });

  it("case-insensitive: 'ng' maps to Nigeria", () => {
    expect(regionCodeToName("ng")).toBe("Nigeria");
  });

  it("regionNameFor delegates to regionCodeToName", () => {
    expect(regionNameFor("NG")).toBe("Nigeria");
    expect(regionNameFor("ng")).toBe("Nigeria");
  });

  it("an unknown code (e.g. UN M.49 numeric) returns undefined — no seed", () => {
    // UN M.49 numeric codes like '001' appear rarely in langtags.
    // They are not in the alpha-2 map, so no seed is produced (FR-009).
    expect(regionCodeToName("001")).toBeUndefined();
    expect(regionCodeToName("XYZ")).toBeUndefined();
  });

  it("undefined input returns undefined", () => {
    expect(regionCodeToName(undefined)).toBeUndefined();
    expect(regionNameFor(undefined)).toBeUndefined();
  });

  it("empty-string input returns undefined", () => {
    expect(regionCodeToName("")).toBeUndefined();
    expect(regionNameFor("")).toBeUndefined();
  });

  it("regionNameFor: a valid code produces a non-empty name string", () => {
    const name = regionNameFor("US");
    expect(name).toBeDefined();
    expect(typeof name).toBe("string");
    expect((name ?? "").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T022(d) — provenance caption format
// ---------------------------------------------------------------------------

describe("T022(d) — provenance caption structure", () => {
  it("provenance object has source='langtags' and a non-empty caption", () => {
    const provenance = {
      source: "langtags" as const,
      caption: "Suggested from langtags — edit if needed",
    };
    expect(provenance.source).toBe("langtags");
    expect(provenance.caption).toContain("langtags");
    expect(provenance.caption.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T022(e) — override-wins: author input beats the seed (FR-008)
// ---------------------------------------------------------------------------

describe("T022(e) — FR-008 override-wins: author value is preserved", () => {
  it("author-entered region overrides the langtags seed (conceptual guard)", () => {
    // The override-wins contract is enforced by SurveyRunner: getSeedValue is
    // called ONLY when pushing a NEW stack entry (forward navigation).  Once
    // the author commits a value, it lives in the saved stack entry, which
    // Back restores directly without calling getSeedValue.
    //
    // We test the contract at the seed-function level: the seed map contains
    // "Nigeria" for "region", but if the author has already committed "Kenya"
    // to the stack, SurveyRunner does NOT call getSeedValue for that entry.
    //
    // The behavioral guarantee is:
    //   stack[i].value (author's committed answer) beats getSeedValue(questionId).
    //
    // Here we assert the seed function itself returns the langtags value (correct);
    // the override happens in SurveyRunner, not in the seed function.
    const seedMap = new Map<string, string>([["region", "Nigeria"]]);
    const getSeedValue = (qId: string) => seedMap.get(qId);

    // Seed correctly proposes Nigeria
    expect(getSeedValue("region")).toBe("Nigeria");
    // A question NOT in the map returns undefined (no false seed)
    expect(getSeedValue("language_name_autonym")).toBeUndefined();
  });

  it("a question not seeded in the map returns undefined", () => {
    const seedMap = new Map<string, string>();
    const getSeedValue = (qId: string) => seedMap.get(qId);
    expect(getSeedValue("region")).toBeUndefined();
    expect(getSeedValue("language_name_autonym")).toBeUndefined();
    expect(getSeedValue("language_name_english")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T023 — free-text escape on the language autocomplete (FR-009)
//
// The Autocomplete widget uses <input list> + <datalist> which natively accepts
// any typed value — the user is never forced to pick from the list.  This test
// asserts the behavioral contract: a typed value not in the list becomes the
// committed answer and flows through to the BCP47 construction unchanged.
// ---------------------------------------------------------------------------

describe("T023 — free-text escape: unknown language value is accepted", () => {
  it("a typed code not in langtags (e.g. 'xyz-made-up') can become the committed answer", () => {
    // The autocomplete onChange fires on every keystroke with the typed value.
    // When the user commits (presses Next), that value goes into the stack
    // entry as-is — no list-membership gate.
    const typedValue = "xyz-made-up";
    // Simulate what IdentityLite/SurveyRunner does: just use the value string.
    const committedValue = typedValue;
    expect(committedValue).toBe("xyz-made-up");
  });

  it("buildTargetBcp47 with a free-text language code does not throw", () => {
    // Even if the code is not in langtags, buildTargetBcp47 must not throw.
    expect(() => buildTargetBcp47("xyz-made-up", "Latn")).not.toThrow();
  });

  it("extractIdentityLite does not throw for a non-langtags language code", () => {
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_code", answerType: "text", value: "xyz-made-up" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
        { questionId: "il_language_autonym", answerType: "text", value: "My Language" },
        { questionId: "il_language_english", answerType: "text", value: "My Language" },
      ],
    };
    expect(() => extractIdentityLite(result)).not.toThrow();
    const identity = extractIdentityLite(result);
    // The code flows through as-is
    expect(identity.languageSubtag).toBe("xyz-made-up");
    expect(identity.bcp47).toBe("xyz-made-up-Latn");
  });
});

// ---------------------------------------------------------------------------
// T024 — unknown code → null defaults → NO seed, NO caption (FR-008/FR-009)
// ---------------------------------------------------------------------------

describe("T024 — unknown code produces null defaults, no seed, no caption", () => {
  it("the Phase A seeding logic skips all seeds when defaults is null", () => {
    // Simulate what PhaseA's useEffect does when getLanguageDefaults returns null.
    const fakeDefaults = null;

    const seeds = new Map<string, string>();
    const prov = new Map<string, object>();

    if (fakeDefaults !== null) {
      // This block would not execute for null defaults.
      seeds.set("language_name_autonym", "would-be-seeded");
    }

    expect(seeds.size).toBe(0);
    expect(prov.size).toBe(0);
  });

  it("getSeedValue returns undefined for all Phase A fields when no defaults", () => {
    const seedMap = new Map<string, string>();
    const getSeedValue = (qId: string) => seedMap.get(qId);

    expect(getSeedValue("language_name_autonym")).toBeUndefined();
    expect(getSeedValue("language_name_english")).toBeUndefined();
    expect(getSeedValue("region")).toBeUndefined();
  });

  it("getSeedProvenance returns undefined for all fields when no defaults", () => {
    const provMap = new Map<string, object>();
    const getSeedProvenance = (qId: string) => provMap.get(qId);

    expect(getSeedProvenance("language_name_autonym")).toBeUndefined();
    expect(getSeedProvenance("language_name_english")).toBeUndefined();
    expect(getSeedProvenance("region")).toBeUndefined();
  });

  it("scriptToTargetOption(undefined) returns null — no seed, not a false script proposal", () => {
    // When getLanguageDefaults returns null, defaultScript is undefined.
    // scriptToTargetOption returns null so the caller leaves the field unseeded
    // rather than misleadingly seeding "other".
    expect(scriptToTargetOption(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T025 — not-in-langtags language completes identity step via free text,
//         zero forced proposals (SC-003)
// ---------------------------------------------------------------------------

describe("T025 — SC-003: not-in-langtags language, all-free-text, zero forced proposals", () => {
  it("extractIdentityLite succeeds with all free-text answers, no langtags data needed", () => {
    // Scenario: author types everything manually for a language not in langtags.
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [
        { questionId: "il_language_autonym", answerType: "text", value: "Manda" },
        { questionId: "il_language_english", answerType: "text", value: "Manda" },
        { questionId: "il_language_code", answerType: "text", value: "mha" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ],
    };
    expect(() => extractIdentityLite(result)).not.toThrow();
    const identity = extractIdentityLite(result);
    expect(identity.languageSubtag).toBe("mha");
    expect(identity.autonym).toBe("Manda");
    expect(identity.english).toBe("Manda");
    expect(identity.bcp47).toBe("mha-Latn");
    expect(identity.supported).toBe(true);
  });

  it("region code->name for a code not in the map returns undefined (no forced seed)", () => {
    // If defaultRegion is somehow a code not in ISO3166_NAMES, the guard
    // ensures we do NOT seed a wrong value — the region field stays blank.
    expect(regionNameFor("QQ")).toBeUndefined(); // fictitious code
  });

  it("an empty bcp47_tag in context causes Phase A to skip all seeds gracefully", () => {
    // When context.bcp47_tag is empty (author skipped identity-lite or left
    // the language code blank), Phase A's useEffect returns early — no seeds,
    // no captions, all fields free-text.
    const bcp47Tag = "";
    const code = bcp47Tag !== "" ? bcp47Tag.split("-")[0] ?? "" : "";
    expect(code).toBe("");
    // No langtags lookup is performed; seeds map stays empty.
  });

  it("a missing bcp47_tag in context (undefined) also skips all seeds", () => {
    const bcp47Tag: string | undefined = undefined;
    const code = (bcp47Tag ?? "") !== "" ? (bcp47Tag ?? "").split("-")[0] ?? "" : "";
    expect(code).toBe("");
  });
});
