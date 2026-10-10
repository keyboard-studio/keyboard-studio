// helpDocsFromDecisions.test — spec 089 T014/T010.
//
// The Phase F composition that used to be extractHelpDocs over a phase
// result (editors/adapters/flowStepOptions.tsx, deleted in T015), pinned
// here over DecisionSets — the same cases, the same expected values — plus
// the HISTORY-entry channel rules and pf_welcome_paragraph's apply shape.

import { describe, it, expect } from "vitest";
import type { HistoryEntryState } from "@keyboard-studio/contracts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  helpDocsFromDecisions,
  historyEntryStateFromDecisions,
} from "./helpDocsFromDecisions.ts";
import pfWelcomeParagraphMod from "../survey/questions/f/pf_welcome_paragraph.ts";

function decisions(values: Partial<Record<DecisionId, unknown>>): DecisionSet {
  const set: Partial<Record<DecisionId, Decision<unknown>>> = {};
  for (const [id, value] of Object.entries(values)) {
    set[id as DecisionId] = { id: id as DecisionId, value, provenance: "asked" };
  }
  return set;
}

describe("helpDocsFromDecisions — required description (spec 061 US1)", () => {
  it("returns { description, usageTips: [] } when only the description is recorded", () => {
    expect(
      helpDocsFromDecisions(decisions({ "help-welcome-paragraph": "A keyboard for Piaroa." })),
    ).toEqual({ description: "A keyboard for Piaroa.", usageTips: [] });
  });

  it("returns undefined when the description is absent", () => {
    expect(helpDocsFromDecisions(decisions({}))).toBeUndefined();
  });

  it("returns undefined when the description is whitespace-only", () => {
    expect(
      helpDocsFromDecisions(decisions({ "help-welcome-paragraph": "   " })),
    ).toBeUndefined();
  });
});

describe("helpDocsFromDecisions — optional default-path answers (spec 061 US3)", () => {
  it("captures usageTips from tips 1/2, credits, contactInfo", () => {
    expect(
      helpDocsFromDecisions(
        decisions({
          "help-welcome-paragraph": "A keyboard for Piaroa.",
          "help-usage-tip-1": "Type slowly at first.",
          "help-usage-tip-2": "Long-press for accents.",
          "help-credits": "Jane Doe",
          "help-contact-info": "jane@example.com",
        }),
      ),
    ).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: ["Type slowly at first.", "Long-press for accents."],
      credits: "Jane Doe",
      contactInfo: "jane@example.com",
    });
  });

  it("does NOT read usage tips 3/4/5 — only 1/2 are reachable (research D-11)", () => {
    const composed = helpDocsFromDecisions(
      decisions({
        "help-welcome-paragraph": "A keyboard for Piaroa.",
        "help-usage-tip-3": "should never be read",
      }),
    );
    expect(composed?.usageTips).toEqual([]);
  });

  it("splits a two-line project-url into projectHomeUrl/projectHelpUrl", () => {
    expect(
      helpDocsFromDecisions(
        decisions({
          "help-welcome-paragraph": "A keyboard for Piaroa.",
          "help-project-url": "https://example.com\nhttps://example.com/help",
        }),
      ),
    ).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: [],
      projectHomeUrl: "https://example.com",
      projectHelpUrl: "https://example.com/help",
    });
  });

  it("populates only projectHomeUrl for a single-line project-url", () => {
    const composed = helpDocsFromDecisions(
      decisions({
        "help-welcome-paragraph": "A keyboard for Piaroa.",
        "help-project-url": "https://example.com",
      }),
    );
    expect(composed?.projectHomeUrl).toBe("https://example.com");
    expect(composed?.projectHelpUrl).toBeUndefined();
  });
});

describe("helpDocsFromDecisions — help-page languages (docLanguageTags, #2002)", () => {
  // The keyboard's own tag comes from the identity decisions
  // (deriveIdentityResult's composed bcp47): fr/Latn → "fr-Latn",
  // km/Khmr → "km-Khmr" (langtags is not loaded in unit tests, so no
  // default-script suppression — the same composed shapes
  // identitySelectors.test.ts pins).
  const FR = { "language-code": "fr", "target-script": "Latn" } as const;
  const KM = { "language-code": "km", "target-script": "Khmr" } as const;
  const tagsFor = (values: Partial<Record<DecisionId, unknown>>) =>
    helpDocsFromDecisions(
      decisions({ "help-welcome-paragraph": "A keyboard.", ...values }),
    )?.docLanguageTags;

  it("leaves the tags out when the language question was never answered", () => {
    expect(tagsFor({ ...FR })).toBeUndefined();
  });

  it("resolves English and the keyboard's own language to tags", () => {
    expect(tagsFor({ "help-doc-language": "english", ...FR })).toEqual(["en"]);
    expect(tagsFor({ "help-doc-language": "target", ...FR })).toEqual(["fr-Latn"]);
  });

  it("takes another language from its picker (winchus: Spanish only)", () => {
    expect(
      tagsFor({ "help-doc-language": "other", "help-doc-language-other": "es", ...FR }),
    ).toEqual(["es"]);
  });

  it("pairs any two languages, main language first", () => {
    // sil_cameroon_azerty-style: English + French, neither the keyboard's language.
    expect(
      tagsFor({
        "help-doc-language": "english",
        "help-doc-language-second": "other",
        "help-doc-language-second-other": "fr",
        "language-code": "bum",
        "target-script": "Latn",
      }),
    ).toEqual(["en", "fr"]);
    // khmer_angkor-style: English + the keyboard's language.
    expect(
      tagsFor({
        "help-doc-language": "english",
        "help-doc-language-second": "target",
        ...KM,
      }),
    ).toEqual(["en", "km-Khmr"]);
  });

  it("ignores a picker answer left over from a branch the author backed out of", () => {
    expect(
      tagsFor({
        "help-doc-language": "english",
        "help-doc-language-other": "es",
        "help-doc-language-second": "none",
        ...FR,
      }),
    ).toEqual(["en"]);
  });

  it("drops a language it can't resolve, and a second language that repeats the first", () => {
    expect(tagsFor({ "help-doc-language": "target" })).toBeUndefined();
    expect(
      tagsFor({ "help-doc-language": "other", "help-doc-language-other": "  ", ...FR }),
    ).toBeUndefined();
    expect(
      tagsFor({
        "help-doc-language": "target",
        "help-doc-language-second": "target",
        ...FR,
      }),
    ).toEqual(["fr-Latn"]);
  });

  it("never promotes the second language when the main language can't resolve", () => {
    // Blank "other" picker as main + English as second: no tags, so the
    // renderer's <html lang> falls back to the keyboard's primaryBcp47
    // instead of mislabelling main-language prose as English.
    expect(
      tagsFor({
        "help-doc-language": "other",
        "help-doc-language-other": "  ",
        "help-doc-language-second": "english",
        ...FR,
      }),
    ).toBeUndefined();
    // Same for "target" with no keyboard tag yet.
    expect(
      tagsFor({
        "help-doc-language": "target",
        "help-doc-language-second": "english",
      }),
    ).toBeUndefined();
  });

  it("reads the legacy single-question 'bilingual' answer as English + the keyboard's language", () => {
    expect(tagsFor({ "help-doc-language": "bilingual", ...KM })).toEqual(["en", "km-Khmr"]);
  });
});

describe("helpDocsFromDecisions — opt-in additional-detail battery (spec 061 US4)", () => {
  it("captures all eleven opt-in fields when recorded", () => {
    expect(
      helpDocsFromDecisions(
        decisions({
          "help-welcome-paragraph": "A keyboard for Piaroa.",
          "help-design-rationale": "a",
          "help-font-guidance": "b",
          "help-canonical-order": "c",
          "help-script-glossary": "d",
          "help-example-words": "e",
          "help-scope-variety": "f",
          "help-provenance-basis": "g",
          "help-troubleshooting": "h",
          "help-known-limitations": "i",
          "help-related-keyboards": "j",
          "help-further-reading": "k",
        }),
      ),
    ).toEqual({
      description: "A keyboard for Piaroa.",
      usageTips: [],
      designRationale: "a",
      fontGuidance: "b",
      canonicalOrder: "c",
      scriptGlossary: "d",
      exampleWords: "e",
      scopeVariety: "f",
      provenanceBasis: "g",
      troubleshooting: "h",
      knownLimitations: "i",
      relatedKeyboards: "j",
      furtherReading: "k",
    });
  });

  it("includes canonicalOrder only when the survey routed the author to it", () => {
    const nonLatin = helpDocsFromDecisions(
      decisions({
        "help-welcome-paragraph": "A keyboard for Dagbani.",
        "help-canonical-order": "Base then mark, left to right.",
      }),
    );
    expect(nonLatin?.canonicalOrder).toBe("Base then mark, left to right.");

    const latin = helpDocsFromDecisions(
      decisions({ "help-welcome-paragraph": "A keyboard for French." }),
    );
    expect(latin?.canonicalOrder).toBeUndefined();
  });
});

const PROPOSED: HistoryEntryState = {
  status: "proposed",
  proposal: { version: "1.0", dateIso: "2026-01-15", bullets: ["Initial release."] },
  editedBullets: null,
};

describe("historyEntryStateFromDecisions — the pf_history_entry action (spec 079 US5)", () => {
  it("confirm: status 'confirmed', editedBullets cleared", () => {
    expect(
      historyEntryStateFromDecisions(decisions({ "help-history-entry": "confirm" }), PROPOSED),
    ).toEqual({ ...PROPOSED, status: "confirmed", editedBullets: null });
  });

  it("edit: status 'edited' with the author's parsed bullets", () => {
    const next = historyEntryStateFromDecisions(
      decisions({
        "help-history-entry": "edit",
        "help-history-bullets": "My rewritten bullet.\nA second one.",
      }),
      PROPOSED,
    );
    expect(next?.status).toBe("edited");
    expect(next?.editedBullets).toEqual(["My rewritten bullet.", "A second one."]);
  });

  it("dismiss: status 'dismissed', editedBullets cleared", () => {
    const next = historyEntryStateFromDecisions(
      decisions({ "help-history-entry": "dismiss" }),
      PROPOSED,
    );
    expect(next?.status).toBe("dismissed");
    expect(next?.editedBullets).toBeNull();
  });

  it("no history decision recorded: no channel (undefined)", () => {
    expect(historyEntryStateFromDecisions(decisions({}), PROPOSED)).toBeUndefined();
  });

  it("a blank recorded value is not an action: no channel, state stays proposed", () => {
    expect(
      historyEntryStateFromDecisions(decisions({ "help-history-entry": "" }), PROPOSED),
    ).toBeUndefined();
  });

  it("no current state to apply onto: no channel (defensive)", () => {
    expect(
      historyEntryStateFromDecisions(decisions({ "help-history-entry": "confirm" }), null),
    ).toBeUndefined();
  });
});

describe("pf_welcome_paragraph.apply — the Phase F completion patch", () => {
  const ctx = (ds: DecisionSet, current: HistoryEntryState | null = null) => ({
    ir: null,
    writes: [] as const,
    decisions: ds,
    currentHistoryEntryState: current,
  });

  it("blank welcome paragraph ⇒ no patch at all (spec 061 D-01)", () => {
    expect(pfWelcomeParagraphMod.apply!("anything", ctx(decisions({})))).toEqual({});
  });

  it("returns helpDocs only when no history decision exists", () => {
    const patch = pfWelcomeParagraphMod.apply!(
      "A keyboard for Piaroa.",
      ctx(decisions({ "help-welcome-paragraph": "A keyboard for Piaroa." }), PROPOSED),
    );
    expect(patch).toEqual({
      helpDocs: { description: "A keyboard for Piaroa.", usageTips: [] },
    });
  });

  it("returns both channels when a history action is recorded", () => {
    const patch = pfWelcomeParagraphMod.apply!(
      "A keyboard for Piaroa.",
      ctx(
        decisions({
          "help-welcome-paragraph": "A keyboard for Piaroa.",
          "help-history-entry": "confirm",
        }),
        PROPOSED,
      ),
    );
    expect(patch.helpDocs).toEqual({ description: "A keyboard for Piaroa.", usageTips: [] });
    expect(patch.historyEntryState).toEqual({
      ...PROPOSED,
      status: "confirmed",
      editedBullets: null,
    });
  });
});
