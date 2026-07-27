// Tests for QuestionField's Tier B content-i18n wiring (spec 050 US1).
//
// FlowQuestion prose (prompt/label/body/help_text/options[].label) is
// resolved through resolveContentString against the "flowQuestions" catalog
// (specs/050-flow-question-i18n/contracts/flow-question-catalog-format.md),
// falling back to the English value already on the question definition.
// These tests seed the catalog directly via _setContentCatalogForTesting
// (the same seam contentI18n.test.ts uses) rather than mocking the dynamic
// `@content-i18n/<locale>/flowQuestions.json` import — see that helper's
// docstring for why.

import type { ReactElement } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { I18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QuestionField } from "./QuestionField.tsx";
import type { FlowQuestion } from "./types.ts";
import { _setContentCatalogForTesting, _resetContentI18nForTesting } from "../lib/contentI18n.ts";

function renderAtLocale(ui: ReactElement, locale: string) {
  const i18n = new I18n({ locale, messages: {} });
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
}

afterEach(() => {
  cleanup();
  _resetContentI18nForTesting();
});

// An il_language_english-SHAPED question (same id/prompt/help_text as the
// real packages/studio/src/survey/questions/a/il_language_english.ts module,
// but type "short_text" rather than the real "autocomplete" — that type
// pulls in the async langtags-backed combobox, which is orthogonal to what
// these tests exercise: prompt/help_text/label content-i18n resolution and
// the FR-004 answer-value-is-never-localized guard). `required` is left
// unset so Label's asterisk marker doesn't complicate the getByText match
// against the bare prompt string.
const ENGLISH_PROMPT = "What is your language called in English?";
const ENGLISH_HELP_TEXT =
  "Start typing your language's English name and pick it from the list.";
const FRENCH_PROMPT = "Comment votre langue est-elle appelée en anglais ?";
const FRENCH_HELP_TEXT = "Commencez à taper le nom anglais de votre langue.";

const question: FlowQuestion = {
  id: "il_language_english",
  type: "short_text",
  prompt: ENGLISH_PROMPT,
  help_text: ENGLISH_HELP_TEXT,
};

function seedFrenchCatalog() {
  _setContentCatalogForTesting("fr", {
    flowQuestions: {
      "content.flowQuestion.il_language_english.prompt": FRENCH_PROMPT,
      "content.flowQuestion.il_language_english.help_text": FRENCH_HELP_TEXT,
    },
  });
}

describe("QuestionField content-i18n wiring", () => {
  it("renders the French prompt and help_text once the fr flowQuestions catalog is seeded", () => {
    seedFrenchCatalog();

    renderAtLocale(<QuestionField question={question} value="" onChange={() => {}} />, "fr");

    expect(screen.getByText(FRENCH_PROMPT)).toBeTruthy();
    expect(screen.getByText(FRENCH_HELP_TEXT)).toBeTruthy();
    expect(screen.queryByText(ENGLISH_PROMPT)).toBeNull();
  });

  it("FR-004: renders the user-typed answer value verbatim, never localized", () => {
    seedFrenchCatalog();

    renderAtLocale(
      <QuestionField question={question} value="Hausa" onChange={() => {}} />,
      "fr",
    );

    // The field value is user data, not content-i18n copy — it must render
    // unchanged regardless of the active locale or seeded catalog.
    expect(screen.getByDisplayValue("Hausa")).toBeTruthy();
  });

  it("falls back to the English prompt and help_text under locale en (no catalog fetch)", () => {
    seedFrenchCatalog();

    renderAtLocale(<QuestionField question={question} value="" onChange={() => {}} />, "en");

    expect(screen.getByText(ENGLISH_PROMPT)).toBeTruthy();
    expect(screen.getByText(ENGLISH_HELP_TEXT)).toBeTruthy();
  });

  it("falls back to the English prompt and help_text when no catalog is seeded for the active locale", () => {
    renderAtLocale(<QuestionField question={question} value="" onChange={() => {}} />, "fr");

    expect(screen.getByText(ENGLISH_PROMPT)).toBeTruthy();
    expect(screen.getByText(ENGLISH_HELP_TEXT)).toBeTruthy();
  });
});

describe("QuestionField content-i18n wiring — option labels (radio)", () => {
  const radioQuestion: FlowQuestion = {
    id: "track_choice",
    type: "radio",
    prompt: "How would you like to start?",
    options: [
      { value: "copy", label: "Start from a similar keyboard" },
      // A value containing a literal dot locks the slugify-shared-with-the-
      // extractor contract (research.md D5 / contentI18n.ts slugifyIdSegment).
      { value: "0.6", label: "Point six variant" },
    ],
  };

  afterEach(() => {
    _resetContentI18nForTesting();
  });

  it("resolves an option label whose value contains a literal dot via the slugified key", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: {
        "content.flowQuestion.track_choice.option.copy.label": "Partir d'un clavier similaire",
        "content.flowQuestion.track_choice.option.0_6.label": "Variante zéro virgule six",
      },
    });

    renderAtLocale(
      <QuestionField question={radioQuestion} value="" onChange={() => {}} />,
      "fr",
    );

    expect(screen.getByText("Partir d'un clavier similaire")).toBeTruthy();
    expect(screen.getByText("Variante zéro virgule six")).toBeTruthy();
    expect(screen.queryByText("Point six variant")).toBeNull();
  });

  it("falls back to the English option labels when the locale has no seeded catalog", () => {
    renderAtLocale(
      <QuestionField question={radioQuestion} value="" onChange={() => {}} />,
      "fr",
    );

    expect(screen.getByText("Start from a similar keyboard")).toBeTruthy();
    expect(screen.getByText("Point six variant")).toBeTruthy();
  });
});

describe("QuestionField content-i18n wiring — placeholder interpolation", () => {
  // Regression test for the confirmed P0: interpolation must run AFTER Tier-B
  // catalog resolution, for every locale including English — a translated
  // catalog string carries its own {{token}} placeholders (e.g. fr's
  // track_choice.prompt), and only the resolved string (not the pre-resolved
  // English value) is what actually renders.
  const trackChoiceQuestion: FlowQuestion = {
    id: "track_choice",
    type: "notice",
    prompt: "How do you want to work with {{base_name}}?",
  };

  afterEach(() => {
    _resetContentI18nForTesting();
  });

  it("interpolates the resolved French template (does not leave the literal token)", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: {
        "content.flowQuestion.track_choice.prompt":
          "Comment voulez-vous travailler avec {{base_name}} ?",
      },
    });

    renderAtLocale(
      <QuestionField
        question={trackChoiceQuestion}
        value=""
        onChange={() => {}}
        context={{ base_name: "Yoruba" }}
      />,
      "fr",
    );

    expect(screen.getByText("Comment voulez-vous travailler avec Yoruba ?")).toBeTruthy();
    expect(screen.queryByText(/\{\{base_name\}\}/)).toBeNull();
  });

  it("interpolates the English prompt too (locale en, same context)", () => {
    renderAtLocale(
      <QuestionField
        question={trackChoiceQuestion}
        value=""
        onChange={() => {}}
        context={{ base_name: "Yoruba" }}
      />,
      "en",
    );

    expect(screen.getByText("How do you want to work with Yoruba?")).toBeTruthy();
    expect(screen.queryByText(/\{\{base_name\}\}/)).toBeNull();
  });
});
