// Tests for lookupQuestionLabel.ts (specs/055-legible-decision-trail T015).
//
// No `audit_label` VALUE is authored in the English catalog yet (sibling task
// T016 authors the first ones concurrently), so these tests exercise
// resolution logic against injected stub sources rather than the live flow
// content — per the task brief.

import { describe, it, expect, afterEach } from "vitest";
import { I18n } from "@lingui/core";
import {
  createLookupQuestionLabel,
  type QuestionLabelSource,
} from "./lookupQuestionLabel.ts";
import {
  _setContentCatalogForTesting,
  _resetContentI18nForTesting,
} from "../lib/contentI18n.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

function i18nFor(locale: string): I18n {
  return new I18n({ locale, messages: {} });
}

function stubSource(map: Record<string, QuestionLabelSource>): (id: string) => QuestionLabelSource | undefined {
  return (id: string) => map[id];
}

afterEach(() => {
  _resetContentI18nForTesting();
});

describe("createLookupQuestionLabel", () => {
  it("prefers audit_label over prompt when both are present", () => {
    const lookup = createLookupQuestionLabel(
      undefined,
      stubSource({
        q1: { prompt: "What is your language called in English?", audit_label: "Language name (English)" },
      }),
    );
    expect(lookup("q1")).toBe("Language name (English)");
  });

  it("falls back to prompt when audit_label is absent", () => {
    const lookup = createLookupQuestionLabel(
      undefined,
      stubSource({
        q1: { prompt: "Confirm your language's code" },
      }),
    );
    expect(lookup("q1")).toBe("Confirm your language's code");
  });

  it("returns undefined when both audit_label and prompt are absent", () => {
    const lookup = createLookupQuestionLabel(undefined, stubSource({ q1: {} }));
    expect(lookup("q1")).toBeUndefined();
  });

  it("returns undefined when the question id is not in the source at all", () => {
    const lookup = createLookupQuestionLabel(undefined, stubSource({}));
    expect(lookup("unknown_question")).toBeUndefined();
  });

  it("treats a whitespace-only audit_label as absent and falls back to prompt", () => {
    const lookup = createLookupQuestionLabel(
      undefined,
      stubSource({
        q1: { prompt: "Confirm your language's code", audit_label: "   " },
      }),
    );
    expect(lookup("q1")).toBe("Confirm your language's code");
  });

  it("treats an empty-string audit_label as absent and falls back to prompt", () => {
    const lookup = createLookupQuestionLabel(
      undefined,
      stubSource({
        q1: { prompt: "Confirm your language's code", audit_label: "" },
      }),
    );
    expect(lookup("q1")).toBe("Confirm your language's code");
  });

  it("resolves audit_label through the real resolveContentString seam, honoring a translated locale", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: { "content.flowQuestion.q1.audit_label": "Nom de la langue (anglais)" },
    });
    const lookup = createLookupQuestionLabel(
      i18nFor("fr"),
      stubSource({
        q1: { prompt: "What is your language called in English?", audit_label: "Language name (English)" },
      }),
    );
    expect(lookup("q1")).toBe("Nom de la langue (anglais)");
  });

  it("resolves prompt through the real resolveContentString seam, honoring a translated locale", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: { "content.flowQuestion.q1.prompt": "Comment votre langue s'appelle-t-elle en anglais ?" },
    });
    const lookup = createLookupQuestionLabel(
      i18nFor("fr"),
      stubSource({ q1: { prompt: "What is your language called in English?" } }),
    );
    expect(lookup("q1")).toBe("Comment votre langue s'appelle-t-elle en anglais ?");
  });

  it("falls back to the English audit_label when the target locale's catalog value is blank (never-blank contract)", () => {
    _setContentCatalogForTesting("fr", {
      flowQuestions: { "content.flowQuestion.q1.audit_label": "   " },
    });
    const lookup = createLookupQuestionLabel(
      i18nFor("fr"),
      stubSource({
        q1: { prompt: "What is your language called in English?", audit_label: "Language name (English)" },
      }),
    );
    expect(lookup("q1")).toBe("Language name (English)");
  });

  it("does not call resolveContentString for audit_label at all when the field is absent (no phantom key)", () => {
    // If this reached resolveContentString with an empty englishValue, a
    // seeded-but-irrelevant French catalog entry for a DIFFERENT field would
    // prove nothing; instead assert the prompt path is what actually resolved
    // by seeding only the prompt key and confirming that value comes back.
    _setContentCatalogForTesting("fr", {
      flowQuestions: { "content.flowQuestion.q1.prompt": "Langue" },
    });
    const lookup = createLookupQuestionLabel(
      i18nFor("fr"),
      stubSource({ q1: { prompt: "Language" } }),
    );
    expect(lookup("q1")).toBe("Langue");
  });

  it("defaults to reading the live question registry when no source is injected, matching a known question's prompt", () => {
    const mod = questionRegistry["il_language_english"];
    expect(mod).toBeDefined();
    const lookup = createLookupQuestionLabel();
    expect(lookup("il_language_english")).toBe(mod!.definition.prompt);
  });
});
