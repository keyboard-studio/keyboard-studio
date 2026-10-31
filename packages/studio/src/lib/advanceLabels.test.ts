// Advance-button label rule (issue #1900; rule doc: docs/advance-labels.md).
//
// Mid-journey steps say "Continue" (optional count/consequence suffix).
// "Finish"/"Done" are reserved for the last step of the whole journey, and
// no step qualifies today — the Output step's actions are verbs ("Submit",
// "Download"). This test is the enforcement: it fails if a reserved word
// becomes an advance label again (the regression #1923/#2078 fixed, e.g.
// "Done (# characters)" on the PhaseB build list).
//
// Two layers, because neither alone is drift-proof:
//
//  1. Catalog layer — every user-facing string renders from the lingui
//     catalogs, so scanning every *Button* entry in BOTH catalogs covers
//     computed labels (galleries, SurveyRunner) as well as literal ones.
//     Values are checked per ICU leaf, so a reserved word hiding inside a
//     plural branch ("{0, plural, one {Done (# character)} ...}") fails too.
//     Ids that do NOT name a button are out of scope by construction: status
//     text ("ruleBuilder.description.done" = "Done"), titles and error copy
//     ("Finish your keyboard before continuing") may use the words — the
//     author does not read them as "advance".
//
//  2. Call-site layer — every non-test t({ id, message }) default in src
//     whose id names a button is checked against the English reserved set,
//     so a source default cannot drift from the rule unnoticed (the catalog
//     layer still covers the rendered string if it does).
//
// Journey-end exception: if a step is ever built that truly ends the
// journey (leads to Output) and must say "Finish"/"Done", add its catalog
// id to JOURNEY_END_ALLOWLIST below WITH a comment naming the step and why
// it ends the journey. Entries whose id disappears from the catalogs fail
// the stale-allowlist test, so the list cannot silently rot.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Locale = "en" | "fr";
const LOCALES: readonly Locale[] = ["en", "fr"];

const CATALOGS: Record<Locale, Record<string, string>> = {
  en: JSON.parse(
    readFileSync(resolve(SRC_ROOT, "locales/en/messages.json"), "utf8"),
  ) as Record<string, string>,
  fr: JSON.parse(
    readFileSync(resolve(SRC_ROOT, "locales/fr/messages.json"), "utf8"),
  ) as Record<string, string>,
};

/**
 * Reserved first words per locale. The fr set also rejects the English
 * words: the fr catalog carries untranslated English fallbacks, and a
 * fallback "Done" button would be exactly the bug this rule exists for.
 */
const RESERVED_FIRST_WORDS: Record<Locale, ReadonlySet<string>> = {
  en: new Set(["done", "finish"]),
  fr: new Set(["done", "finish", "terminé", "terminer", "terminez"]),
};

/**
 * Catalog ids allowed to carry a reserved word because their step ends the
 * whole journey (docs/advance-labels.md rule 2). EMPTY today: no step leads
 * to Output with a "Finish"/"Done" label — Output's own actions are verbs.
 * Each future entry needs a comment: step name + why it ends the journey.
 */
const JOURNEY_END_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  // (none — see above)
]);

/** A catalog id names a button label (the issue #1900 catalog convention). */
function isButtonId(id: string): boolean {
  return /button/i.test(id);
}

/**
 * The texts a catalog value can actually render: the value itself, plus —
 * for ICU plural/select values — each branch text. Branch texts are the
 * innermost {...} spans; placeholder spans like "{0}" extract as "0" and
 * are harmless (never a reserved word).
 */
function leafTexts(value: string): string[] {
  const leaves: string[] = [];
  const innermost = /\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = innermost.exec(value)) !== null) leaves.push(m[1]);
  if (!value.includes("{")) leaves.push(value);
  return leaves;
}

/** First alphabetic word of a rendered label, lowercased ("" if none). */
function firstWord(text: string): string {
  const m = /[A-Za-zÀ-ÿ]+/.exec(text);
  return m === null ? "" : m[0].toLowerCase();
}

function catalogViolations(locale: Locale): string[] {
  const reserved = RESERVED_FIRST_WORDS[locale];
  const violations: string[] = [];
  for (const [id, value] of Object.entries(CATALOGS[locale])) {
    if (!isButtonId(id) || JOURNEY_END_ALLOWLIST.has(id)) continue;
    for (const leaf of leafTexts(value)) {
      if (reserved.has(firstWord(leaf))) {
        violations.push(`${locale} ${id} = ${JSON.stringify(value)}`);
        break;
      }
    }
  }
  return violations;
}

describe("advance-label rule (#1900) — catalog layer", () => {
  for (const locale of LOCALES) {
    it(`${locale}: no button label starts with a reserved word`, () => {
      expect(catalogViolations(locale)).toEqual([]);
    });

    it(`${locale}: the scan is not vacuous (button ids exist and are numerous)`, () => {
      const buttonIds = Object.keys(CATALOGS[locale]).filter(isButtonId);
      expect(buttonIds.length).toBeGreaterThan(80);
    });
  }

  it("known advance-button ids are present in both catalogs", () => {
    // If one of these disappears, the scan above has lost sight of a real
    // advance button — rename this list in the same commit as the id.
    const knownAdvanceIds = [
      "survey.surveyRunner.nextButton",
      "survey.phaseB.buildList.doneButton",
      "survey.punctuation.doneButton",
      "survey.punctuation.doneButtonNone",
      "editor.assignLoop.doneButton",
      "survey.convenience.continueButton",
      "survey.invisibles.continueButton",
    ];
    for (const locale of LOCALES) {
      for (const id of knownAdvanceIds) {
        expect(CATALOGS[locale][id], `${locale} is missing ${id}`).toBeDefined();
      }
    }
  });

  it("journey-end allowlist entries still exist in both catalogs", () => {
    for (const id of JOURNEY_END_ALLOWLIST) {
      for (const locale of LOCALES) {
        expect(CATALOGS[locale][id], `stale allowlist entry: ${id}`).toBeDefined();
      }
    }
  });
});

describe("advance-label rule (#1900) — call-site layer", () => {
  // t({ id: "...", message: ... }) blocks. The message expression is capped:
  // a longer one is a computed/variable message, which the catalog layer
  // still covers; the cap keeps the non-greedy match from swallowing
  // unrelated literals further down the file.
  const tCallPattern = /t\(\{\s*id:\s*"([^"]+)",\s*message:\s*([\s\S]*?)\}\)/g;
  const literalPattern = /"([^"]*)"/g;

  function callSiteViolations(): { violations: string[]; scanned: number } {
    const reserved = RESERVED_FIRST_WORDS.en;
    const violations: string[] = [];
    let scanned = 0;
    const files = readdirSync(SRC_ROOT, { recursive: true })
      .map((p) => String(p))
      .filter(
        (rel) =>
          (rel.endsWith(".ts") || rel.endsWith(".tsx")) &&
          !rel.endsWith(".d.ts") &&
          !rel.includes(".test.") &&
          !rel.split("/").includes("test"),
      );
    for (const rel of files) {
      const source = readFileSync(resolve(SRC_ROOT, rel), "utf8");
      for (const call of source.matchAll(tCallPattern)) {
        const [, id, messageExpr] = call;
        if (!isButtonId(id) || JOURNEY_END_ALLOWLIST.has(id)) continue;
        if (messageExpr.length > 400) continue;
        scanned += 1;
        for (const lit of messageExpr.matchAll(literalPattern)) {
          if (reserved.has(firstWord(lit[1]))) {
            violations.push(`${rel}: t({ id: "${id}", message: ... "${lit[1]}" ... })`);
            break;
          }
        }
      }
    }
    return { violations, scanned };
  }

  it("no t() default for a button id starts with a reserved word", () => {
    const { violations, scanned } = callSiteViolations();
    expect(violations).toEqual([]);
    // Non-vacuity: real advance-label call sites must have been scanned.
    expect(scanned).toBeGreaterThan(15);
  });
});
