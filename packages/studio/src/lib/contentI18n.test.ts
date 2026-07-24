// Tests for the Tier B content-i18n loader (spec 046 T028).
import { describe, it, expect, afterEach } from "vitest";
import { I18n } from "@lingui/core";
import {
  activateContentLocale,
  resolveContentString,
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
});
