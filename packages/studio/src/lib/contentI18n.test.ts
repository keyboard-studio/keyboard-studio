// Tests for the Tier B content-i18n loader (spec 046 T028).
import { describe, it, expect, afterEach } from "vitest";
import { I18n } from "@lingui/core";
import {
  activateContentLocale,
  resolveContentString,
  slugifyIdSegment,
  _setContentCatalogForTesting,
  _resetContentI18nForTesting,
} from "./contentI18n.ts";

function i18nFor(locale: string): I18n {
  return new I18n({ locale, messages: {} });
}

afterEach(() => {
  _resetContentI18nForTesting();
});

describe("resolveContentString", () => {
  it("returns the English value when no i18n instance is given (unit-test call path)", () => {
    expect(resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant")).toBe(
      "CapsLock variant",
    );
  });

  it("returns the English value when the active locale is English", () => {
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("en")),
    ).toBe("CapsLock variant");
  });

  it("returns the English value when the locale has never been activated", () => {
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("fr")),
    ).toBe("CapsLock variant");
  });

  it("returns the translated value once the locale's catalog is seeded", () => {
    _setContentCatalogForTesting("fr", {
      patterns: { "content.pattern.capslock_variant.title": "Variante Verr. Maj." },
    });
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("fr")),
    ).toBe("Variante Verr. Maj.");
  });

  it("falls back to English when the catalog is seeded but lacks this key", () => {
    _setContentCatalogForTesting("fr", {
      patterns: { "content.pattern.some_other_pattern.title": "Autre chose" },
    });
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("fr")),
    ).toBe("CapsLock variant");
  });

  it("falls back to English when a different catalog type is seeded but not the one requested", () => {
    _setContentCatalogForTesting("fr", {
      criteria: { "content.criteria.some_id.description": "Une description" },
    });
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("fr")),
    ).toBe("CapsLock variant");
  });

  it("slugifies dotted record ids the same way the T027 extractor does", () => {
    _setContentCatalogForTesting("fr", {
      criteria: {
        "content.criteria.4_3-copyright-holder-is-authorized.description": "Traduit",
      },
    });
    expect(
      resolveContentString(
        "criteria",
        "4.3-copyright-holder-is-authorized",
        "description",
        "English description",
        i18nFor("fr"),
      ),
    ).toBe("Traduit");
  });

  it("resolves adaptationQuestions under the singular adaptationQuestion namespace segment", () => {
    _setContentCatalogForTesting("fr", {
      adaptationQuestions: {
        "content.adaptationQuestion.q_sa1_target_script_spread.provenanceLabel": "empreinte de script",
      },
    });
    expect(
      resolveContentString(
        "adaptationQuestions",
        "q_sa1_target_script_spread",
        "provenanceLabel",
        "script fingerprint",
        i18nFor("fr"),
      ),
    ).toBe("empreinte de script");
  });
});

// spec 073 US1: flowQuestions is the fourth Tier B catalog, feeding the
// modular flow-engine's survey-question prose (prompt/label/body/help_text/
// options[].label). See specs/073-flow-question-i18n/research.md D5 and
// contracts/flow-question-catalog-format.md for the key-namespace contract.
describe("resolveContentString — flowQuestions catalog (spec 073 US1)", () => {
  it("resolves a flowQuestions prompt under the singular flowQuestion namespace segment", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: {
        "content.flowQuestion.il_language_english.prompt":
          "Comment votre langue est-elle appelée en anglais ?",
      },
    });
    expect(
      resolveContentString(
        "flowQuestions",
        "il_language_english",
        "prompt",
        "What is your language called in English?",
        i18nFor("fr"),
      ),
    ).toBe("Comment votre langue est-elle appelée en anglais ?");
  });

  it("falls back to English when the flowQuestions key is absent from the seeded catalog", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: {
        "content.flowQuestion.some_other_question.prompt": "Autre question",
      },
    });
    expect(
      resolveContentString(
        "flowQuestions",
        "il_language_english",
        "prompt",
        "What is your language called in English?",
        i18nFor("fr"),
      ),
    ).toBe("What is your language called in English?");
  });

  it("falls back to English when the flowQuestions key is present but empty (untranslated, awaiting Crowdin)", () => {
    // skip_untranslated_strings:false ships every key in every locale, empty
    // until a translator fills it. An empty value must honour the "never blank"
    // contract and render the English fallback, not a blank string.
    _setContentCatalogForTesting("fr", {
      flowQuestions: {
        "content.flowQuestion.track_choice.option.copy.note": "",
      },
    });
    expect(
      resolveContentString(
        "flowQuestions",
        "track_choice",
        "option.copy.note",
        "You will give it a new name and keyboard ID. The original is not changed.",
        i18nFor("fr"),
      ),
    ).toBe("You will give it a new name and keyboard ID. The original is not changed.");
  });

  it("falls back to English for flowQuestions when the active locale is English", () => {
    _setContentCatalogForTesting("en", {
      flowQuestions: {
        "content.flowQuestion.il_language_english.prompt": "Should never be read at locale en",
      },
    });
    expect(
      resolveContentString(
        "flowQuestions",
        "il_language_english",
        "prompt",
        "What is your language called in English?",
        i18nFor("en"),
      ),
    ).toBe("What is your language called in English?");
  });

  it("falls back to English for flowQuestions when the locale was never activated", () => {
    expect(
      resolveContentString(
        "flowQuestions",
        "il_language_english",
        "prompt",
        "What is your language called in English?",
        i18nFor("fr"),
      ),
    ).toBe("What is your language called in English?");
  });

  it("round-trips an option-label key through slugifyIdSegment for a dotted option value", () => {
    // Some real FlowOption values contain literal dots (e.g. "0.6"); the
    // extractor slugifies them into the catalog key, so the render-site
    // lookup must apply the identical transform or it silently never
    // resolves (research.md D5 / flow-question-catalog-format.md).
    _setContentCatalogForTesting("fr", {
      flowQuestions: {
        "content.flowQuestion.track_choice.option.0_6.label": "Variante zéro virgule six",
      },
    });
    expect(
      resolveContentString(
        "flowQuestions",
        "track_choice",
        `option.${slugifyIdSegment("0.6")}.label`,
        "Point six variant",
        i18nFor("fr"),
      ),
    ).toBe("Variante zéro virgule six");
  });
});

describe("activateContentLocale", () => {
  it("resolves immediately for the English (default) locale without touching the cache", async () => {
    await expect(activateContentLocale("en")).resolves.toBeUndefined();
  });

  it("resolves (never rejects) for a locale with no committed content catalogs yet", async () => {
    // content/i18n/fr does not exist yet (T030 — Crowdin activation — is not
    // done), so this dynamic import genuinely fails; activateContentLocale
    // must swallow that per catalog type, matching activateLocale's own
    // never-block-on-a-missing-chunk contract in ./i18n.ts.
    await expect(activateContentLocale("fr")).resolves.toBeUndefined();
    // The English fallback still holds afterwards.
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("fr")),
    ).toBe("CapsLock variant");
  });

  it("does not clobber an already-seeded cache entry on a repeat call", async () => {
    _setContentCatalogForTesting("fr", {
      patterns: { "content.pattern.capslock_variant.title": "Variante Verr. Maj." },
    });
    await activateContentLocale("fr");
    expect(
      resolveContentString("patterns", "capslock_variant", "title", "CapsLock variant", i18nFor("fr")),
    ).toBe("Variante Verr. Maj.");
  });

  it("clears the in-flight entry once settled, so a later call takes the localeCatalogs fast path", async () => {
    // Regression: the in-flight promise map was never cleared after
    // resolving, leaving the localeCatalogs.has(locale) fast-path
    // permanently unreachable (a repeat call always re-returned the same
    // stale in-flight promise instead). A distinct promise object on the
    // second call proves the fast path is actually exercised.
    const first = activateContentLocale("fr");
    await first;
    const second = activateContentLocale("fr");
    expect(second).not.toBe(first);
    await expect(second).resolves.toBeUndefined();
  });
});
