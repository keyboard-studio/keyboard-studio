// identitySelectors.test — spec 089 T006 / FR-005.
//
// The selectors must reproduce, field for field, what the deleted session
// writers stored: deriveIdentityResult is pinned against the REAL
// extractIdentityLite over the equivalent phase result, so the two
// compositions cannot drift apart silently.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import type { SurveyPhaseResult, SearchMatch } from "@keyboard-studio/contracts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  deriveAttribution,
  deriveIdentityResult,
  deriveIdentityResume,
  deriveProjectIdentity,
  deriveScaffoldSpec,
  deriveSurveyContext,
} from "./identitySelectors.ts";
import { extractIdentityLite } from "../survey/IdentityLite.tsx";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import { captureRevisionSnapshot, restoreRevisionSnapshot } from "../lib/draftPersistence.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { decisionIRPaths } from "./decisionTypes.ts";
import { recordAnswersAsDecisions, type ReducerDeps } from "../steps/reducer.ts";
import { orderDecisions } from "./orderDecisions.ts";
import { providerFromModules } from "./replayKeyboard.ts";
import { recalculate, type RecalculateDeps } from "./recalculate.ts";
import type { ExtractContext } from "./extractContext.ts";

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
  it("matches extractIdentityLite on the identity fields, plus the decision-composed attribution", () => {
    // #1901: extractIdentityLite no longer carries attribution (the
    // questions left its flow; its `attribution` is null by construction).
    // The derived result is the extracted identity PLUS the attribution
    // composed from the attribution decisions — including records a
    // pre-#1901 draft stamped under the identity step, since the
    // selectors are keyed by decision id, not by step.
    const derived = deriveIdentityResult(decisions(FULL));
    const extracted = extractIdentityLite(FULL_RESULT);
    expect(extracted.attribution).toBeNull();
    expect(derived).toEqual({
      ...extracted,
      attribution: {
        authorName: "Test Author",
        authorEmail: "author@example.org",
        // FULL's copyright-holder is "" — D1 defaults it to the author.
        copyrightHolder: "Test Author",
      },
    });
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
    // #1901: only the five identity questions — FULL's author/copyright
    // records belong to the attribution step now and are NOT replayed
    // into the identity flow (they still compose attribution above).
    expect(resume?.answers).toHaveLength(5);
    expect(resume?.answers.map((a) => a.questionId)).not.toContain("il_author_name");
  });

  it("replays the dialect answer when one is recorded (spec 115 T046)", () => {
    const resume = deriveIdentityResume(
      decisions({ ...FULL, "language-dialect": "gascon" }),
    );
    expect(resume?.answers).toContainEqual({
      questionId: "il_language_dialect",
      answerType: "text",
      value: "gascon",
    });
    expect(resume?.answers).toHaveLength(6);
  });

  it("is null when no identity answer is recorded", () => {
    expect(deriveIdentityResume(decisions({}))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spec 115 T046 (US2): the dialect decisions.
// ---------------------------------------------------------------------------

const GASCON_MATCH: SearchMatch = {
  name: "Gascon",
  relation: "dialect",
  source: "glottolog",
  glottocode: "gasc1240",
  countries: ["ES", "FR"],
};

describe("language-dialect decisions — declaration and persistence (spec 115 T046)", () => {
  beforeEach(() => {
    localStorage.clear();
    useDecisionStore.getState().reset();
  });
  afterEach(() => {
    localStorage.clear();
    useDecisionStore.getState().reset();
  });

  it("are provided by il_language_dialect, after language-code, and map to no IR path", () => {
    expect(questionRegistry["il_language_dialect"]?.provides).toEqual([
      "language-dialect",
      "language-dialect-source",
      "dialect-glottocode",
    ]);
    for (const id of ["language-dialect", "language-dialect-source", "dialect-glottocode"] as const) {
      expect(decisionIRPaths[id]).toEqual([]);
    }
  });

  it("persist through a revision snapshot round trip (JSON, as stored)", () => {
    useDecisionStore.getState().record({
      id: "language-dialect",
      value: "gascon",
      provenance: "asked",
      source: "il_language_dialect",
    });
    useDecisionStore.getState().record({
      id: "language-dialect-source",
      value: "registered-variant",
      provenance: "default",
      source: "il_language_dialect",
    });
    useDecisionStore.getState().record({
      id: "dialect-glottocode",
      value: "gasc1240",
      provenance: "derived",
      source: "il_language_dialect",
    });
    const stored = JSON.stringify(captureRevisionSnapshot());
    useDecisionStore.getState().reset();
    expect(getDecisionSnapshot()["language-dialect"]).toBeUndefined();

    restoreRevisionSnapshot(JSON.parse(stored));
    expect(getDecisionSnapshot()["language-dialect"]).toMatchObject({
      value: "gascon",
      provenance: "asked",
    });
    expect(getDecisionSnapshot()["language-dialect-source"]).toMatchObject({
      value: "registered-variant",
    });
    expect(getDecisionSnapshot()["dialect-glottocode"]).toMatchObject({
      value: "gasc1240",
    });
  });

  it("the renderer-written ids are never filled from the answer", () => {
    const dialect = questionRegistry["il_language_dialect"]!;
    expect(dialect.rendererWrites).toEqual(["language-dialect-source", "dialect-glottocode"]);
    const written: Decision[] = [];
    const deps = {
      writeDecisionRecords: (rs: readonly Decision[]) => written.push(...rs),
      readDecisionSet: () => ({}),
      getSavedAnswer: () => undefined,
      getStartKeyboardId: () => undefined,
    } as ReducerDeps;
    const result: SurveyPhaseResult = {
      phase: "A",
      answers: [{ questionId: "il_language_dialect", answerType: "text", value: "gascon" }],
    };
    recordAnswersAsDecisions(result, "identity", deps);
    expect(written.map((r) => r.id)).toEqual(["language-dialect"]);
  });
});

// The langtags latch is one-way per file: these describes load it and must
// stay last, so the tests above keep seeing the unloaded fallback composer.
describe("deriveIdentityResult — dialect (spec 115 T046)", () => {
  beforeAll(async () => {
    await loadLangtags();
  });

  it("composes oc-gascon from the dialect decision", () => {
    const derived = deriveIdentityResult(
      decisions({
        "language-name": "Occitan",
        "language-autonym": "occitan",
        "language-code": "oc",
        "language-region": "FR",
        "target-script": "Latn",
        "language-dialect": "gascon",
        "language-dialect-source": "registered-variant",
        "dialect-glottocode": "gasc1240",
      }),
    );
    expect(derived?.bcp47).toBe("oc-gascon");
    expect(derived?.dialectSubtag).toBe("gascon");
    expect(derived?.dialectSource).toBe("registered-variant");
    expect(derived?.dialectGlottocode).toBe("gasc1240");
    expect(derived?.languageGlottocode).toBe("");
  });

  it("composes acr-x-rabinal and ewo-x-yabekolo", () => {
    expect(
      deriveIdentityResult(
        decisions({
          "language-code": "acr",
          "target-script": "Latn",
          "language-region": "GT",
          "language-dialect": "x-rabinal",
          "language-dialect-source": "langtags",
        }),
      )?.bcp47,
    ).toBe("acr-x-rabinal");
    expect(
      deriveIdentityResult(
        decisions({
          "language-code": "ewo",
          "target-script": "Latn",
          "language-region": "CM",
          "language-dialect": "x-yabekolo",
          "language-dialect-source": "typed",
        }),
      )?.bcp47,
    ).toBe("ewo-x-yabekolo");
  });

  it("keeps both glottocodes for a dialect of a language with no ISO code (Olmos)", () => {
    const derived = deriveIdentityResult(
      decisions({
        "language-code": "qaa",
        "target-script": "Latn",
        "language-region": "PE",
        "language-dialect": "x-sechuran-olmos",
        "language-dialect-source": "typed",
        "language-glottocode": "sech1236",
        "dialect-glottocode": "olmo1234",
      }),
    );
    expect(derived?.languageGlottocode).toBe("sech1236");
    expect(derived?.dialectGlottocode).toBe("olmo1234");
    expect(derived?.bcp47).toBe("qaa-Latn-PE-x-sechuran-olmos");
  });

  it("lists exactly one package language: the dialect tag, never the bare parent as well (FR-018)", () => {
    const identity = deriveProjectIdentity(
      decisions({
        "authoring-track": "copy",
        "project-display-name": "Occitan Gascon",
        "project-keyboard-id": "oc_gascon",
        "language-name": "Occitan",
        "language-code": "oc",
        "target-script": "Latn",
        "language-dialect": "gascon",
        "language-dialect-source": "registered-variant",
        "dialect-glottocode": "gasc1240",
      }),
    );
    expect(identity?.bcp47).toBe("oc-gascon");
    expect(identity).not.toHaveProperty("languages");
  });
});

describe("recalculate — a language change re-proposes the dialect (spec 115 T046, FR-013)", () => {
  beforeAll(async () => {
    await loadLangtags();
  });

  function dialectModules() {
    return [
      questionRegistry["il_language_english"]!,
      questionRegistry["il_language_region"]!,
      questionRegistry["il_language_autonym"]!,
      questionRegistry["il_language_code"]!,
      questionRegistry["il_target_script"]!,
      questionRegistry["il_language_dialect"]!,
    ];
  }

  function run(
    set: DecisionSet,
    changed: DecisionId[],
    extra?: Partial<RecalculateDeps>,
  ) {
    const modules = dialectModules();
    const ctx: ExtractContext = {
      ir: null,
      catalog: null,
      identity: {
        languageCode: "ca",
        targetScript: "Latn",
        languageRegion: "",
        searchMatch: GASCON_MATCH,
      },
    };
    return recalculate(
      {
        providerFor: providerFromModules(modules),
        modules,
        extractContext: ctx,
        ...extra,
      },
      { decisions: set, changed: new Set(changed), order: orderDecisions(modules).map((m) => m.provides![0]!) },
    );
  }

  function rec(partial: Partial<Decision> & { id: DecisionId }): Decision {
    return { value: undefined, provenance: "asked", ...partial } as Decision;
  }

  const base: DecisionSet = {
    "language-name": rec({ id: "language-name", value: "Occitan", provenance: "asked" }),
    "language-code": rec({ id: "language-code", value: "ca", provenance: "asked" }),
    "target-script": rec({ id: "target-script", value: "Latn", provenance: "asked" }),
    "language-region": rec({ id: "language-region", value: "", provenance: "asked" }),
    "language-search-match": rec({ id: "language-search-match", value: GASCON_MATCH, provenance: "derived" }),
    "dialect-glottocode": rec({ id: "dialect-glottocode", value: "gasc1240", provenance: "derived" }),
  };

  it("recomputes a confirmed (default) dialect against the new language", () => {
    const out = run(
      {
        ...base,
        "language-dialect": rec({ id: "language-dialect", value: "gascon", provenance: "default" }),
        "language-dialect-source": rec({ id: "language-dialect-source", value: "registered-variant", provenance: "default" }),
      },
      ["language-code"],
    );
    expect(out.recomputed).toContain("language-dialect");
    expect(out.decisions["language-dialect"]?.value).toBe("x-gascon");
    // The source and glottocode are renderer-owned: recalculate never
    // writes the subtag into them.
    expect(out.decisions["language-dialect-source"]?.value).toBe("registered-variant");
    expect(out.recomputed).not.toContain("language-dialect-source");
  });

  it("re-proposes an edited (asked) dialect beside the kept value", async () => {
    const mod = await loadLangtags();
    const out = run(
      {
        ...base,
        "language-dialect": rec({ id: "language-dialect", value: "gascon", provenance: "asked" }),
      },
      ["language-code"],
      {
        validateValue: (m, value, newInputs) => {
          if (m.definition.id !== "il_language_dialect") {
            return m.validate === undefined ? true : m.validate(value as string | string[] | undefined).ok;
          }
          const language = String(newInputs["language-code"] ?? "");
          const subtag = String(value ?? "");
          if (subtag.startsWith("x-")) {
            return mod.dialectTagsetsFor(language).some((t) => t.dialectSubtag === subtag);
          }
          return mod.variantAllowed(`${language}`, subtag);
        },
      },
    );
    expect(out.reproposed).toContain("language-dialect");
    expect(out.decisions["language-dialect"]?.value).toBe("gascon");
    expect(out.decisions["language-dialect"]?.offered).toBe("x-gascon");
  });
});
