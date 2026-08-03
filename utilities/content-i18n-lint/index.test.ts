import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// index.js is CommonJS (plain-node lint tool); vitest resolves the interop.
import { lint } from "./index.js";
// The shared guard, tested directly at the bottom of this file: i18n-catalog-lint
// consumes the same contract but is a bare script with nothing to import.
import { checkEnglishCollapse, measureCollapse } from "../i18n-collapse-guard/index.js";

const dirs: string[] = [];
function tempContentI18nDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "content-i18n-lint-test-"));
  dirs.push(dir);
  mkdirSync(join(dir, "en"), { recursive: true });
  mkdirSync(join(dir, "fr"), { recursive: true });
  // Satisfy the three freshness-checked CATALOG_FILES with empty committed
  // English catalogs matching empty fresh maps, so those checks pass cleanly
  // and only the flowQuestions parity-only behaviour is under test.
  for (const name of ["patterns.json", "adaptationQuestions.json", "criteria.json"]) {
    writeFileSync(join(dir, "en", name), "{}\n");
  }
  return dir;
}

const EMPTY_FRESH = {
  "patterns.json": {},
  "adaptationQuestions.json": {},
  "criteria.json": {},
};

function runFlowQuestions(dir: string) {
  return lint({
    contentI18nDir: dir,
    freshCatalogs: EMPTY_FRESH,
    parityOnlyFiles: ["flowQuestions.json"],
  });
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("content-i18n-lint flowQuestions parity (spec 050 T013/T014)", () => {
  it("flags a target locale missing a key present in en/flowQuestions.json", () => {
    const dir = tempContentI18nDir();
    writeFileSync(
      join(dir, "en", "flowQuestions.json"),
      JSON.stringify({
        "content.flowQuestion.q1.prompt": "Prompt one",
        "content.flowQuestion.q2.prompt": "Prompt two",
      }),
    );
    // fr is missing q2.prompt.
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify({ "content.flowQuestion.q1.prompt": "Invite une" }),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("fr/flowQuestions.json");
    expect(problems[0]).toContain("missing");
    expect(problems[0]).toContain("content.flowQuestion.q2.prompt");
  });

  it("flags a target locale carrying a stale/extra key not in en/flowQuestions.json", () => {
    const dir = tempContentI18nDir();
    writeFileSync(
      join(dir, "en", "flowQuestions.json"),
      JSON.stringify({ "content.flowQuestion.q1.prompt": "Prompt one" }),
    );
    // fr has an orphaned key (a removed/renamed question left behind).
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify({
        "content.flowQuestion.q1.prompt": "Invite une",
        "content.flowQuestion.orphan.prompt": "Invite orpheline",
      }),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("stale/extra");
    expect(problems[0]).toContain("content.flowQuestion.orphan.prompt");
  });

  it("passes when the target locale key set matches, even though values differ", () => {
    const dir = tempContentI18nDir();
    writeFileSync(
      join(dir, "en", "flowQuestions.json"),
      JSON.stringify({
        "content.flowQuestion.q1.prompt": "Prompt one",
        "content.flowQuestion.q1.help_text": "Help one",
      }),
    );
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify({
        "content.flowQuestion.q1.prompt": "Invite une",
        "content.flowQuestion.q1.help_text": "Aide une",
      }),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  it("does NOT freshness-check flowQuestions (its English source is not re-extracted here — D7)", () => {
    // The committed en/flowQuestions.json is the reference; no fresh map is
    // supplied for it, so an English value the tool couldn't have derived must
    // NOT produce a freshness problem. Only the fr key set matters.
    const dir = tempContentI18nDir();
    writeFileSync(
      join(dir, "en", "flowQuestions.json"),
      JSON.stringify({ "content.flowQuestion.q1.prompt": "Anything at all" }),
    );
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify({ "content.flowQuestion.q1.prompt": "N'importe quoi" }),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  it("does not report parity when a locale has not started translating flowQuestions", () => {
    const dir = tempContentI18nDir();
    writeFileSync(
      join(dir, "en", "flowQuestions.json"),
      JSON.stringify({ "content.flowQuestion.q1.prompt": "Prompt one" }),
    );
    // No fr/flowQuestions.json written — an untranslated catalog is not a gap.
    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  describe("audit_label per-key optionality (spec 055 research.md D8)", () => {
    it("does not flag a target locale that omits an audit_label key", () => {
      const dir = tempContentI18nDir();
      writeFileSync(
        join(dir, "en", "flowQuestions.json"),
        JSON.stringify({
          "content.flowQuestion.q1.prompt": "Prompt one",
          "content.flowQuestion.q1.audit_label": "Label one",
        }),
      );
      // fr has started the catalog but has not authored audit_label yet.
      writeFileSync(
        join(dir, "fr", "flowQuestions.json"),
        JSON.stringify({ "content.flowQuestion.q1.prompt": "Invite une" }),
      );

      const { problems } = runFlowQuestions(dir);
      expect(problems).toEqual([]);
    });

    it("still flags a target locale missing a non-audit_label key alongside a missing audit_label", () => {
      const dir = tempContentI18nDir();
      writeFileSync(
        join(dir, "en", "flowQuestions.json"),
        JSON.stringify({
          "content.flowQuestion.q1.prompt": "Prompt one",
          "content.flowQuestion.q1.audit_label": "Label one",
        }),
      );
      // fr is missing both keys — audit_label is exempt, prompt is not.
      writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify({}));

      const { problems } = runFlowQuestions(dir);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("missing");
      expect(problems[0]).toContain("content.flowQuestion.q1.prompt");
      expect(problems[0]).not.toContain("content.flowQuestion.q1.audit_label");
    });

    it("still flags an extra/stale audit_label key not present in English", () => {
      const dir = tempContentI18nDir();
      writeFileSync(
        join(dir, "en", "flowQuestions.json"),
        JSON.stringify({ "content.flowQuestion.q1.prompt": "Prompt one" }),
      );
      // fr carries an audit_label for a question that has none in English.
      writeFileSync(
        join(dir, "fr", "flowQuestions.json"),
        JSON.stringify({
          "content.flowQuestion.q1.prompt": "Invite une",
          "content.flowQuestion.q1.audit_label": "Orphaned label",
        }),
      );

      const { problems } = runFlowQuestions(dir);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("stale/extra");
      expect(problems[0]).toContain("content.flowQuestion.q1.audit_label");
    });
  });
});

// ---------------------------------------------------------------------------
// English-collapse guard (utilities/i18n-collapse-guard)
//
// Key-set parity above is deliberately value-blind. That leaves one corruption
// invisible to it: a Crowdin export of a project holding no translations
// returns the SOURCE TEXT under every original key, so the key set matches
// perfectly while every translation is gone. This happened for real -- the
// scheduled download produced exactly that catalog and only a GitHub
// permissions error stopped it from opening the revert PR.
// ---------------------------------------------------------------------------

/** n distinct English entries, so fixtures clear the guard's MIN_KEYS floor. */
function englishCatalog(n: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) out[`content.flowQuestion.q${i}.prompt`] = `Prompt ${i}`;
  return out;
}

function mapValues(
  obj: Record<string, string>,
  f: (v: string, k: string) => string,
): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, f(v, k)]));
}

describe("content-i18n-lint English-collapse guard", () => {
  it("flags a target catalog whose values all collapsed back to the English source", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(30);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    // Exactly what the Crowdin download produced: same keys, English values.
    writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify(en));

    const { problems } = runFlowQuestions(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("collapsed into the English source");
    expect(problems[0]).toContain("fr");
  });

  it("passes a genuinely translated catalog", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(30);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify(mapValues(en, (v) => `Invite ${v}`)),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  it("tolerates the few values that legitimately equal English (proper nouns, OK, symbols)", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(30);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    // A handful identical, the rest translated -- the real fr catalog measures
    // ~1.2% identical, so a small overlap must not trip the guard.
    let kept = 0;
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify(mapValues(en, (v) => (kept++ < 4 ? v : `Invite ${v}`))),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  it("passes an all-empty catalog — empty is how 'not translated yet' is represented", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(30);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    // Bootstrapping a new locale as empty values is correct and must pass;
    // bootstrapping it as English values is the bug and must not.
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify(mapValues(en, () => "")),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Small catalogs: the exact rule.
  //
  // The ratio rule's MIN_KEYS floor used to be the whole story, which left
  // anything below it unchecked. content/i18n/en/adaptationQuestions.json has 9
  // keys, so the real Crowdin wipe replaced all 9 French values with English
  // and sailed through the gate while four larger catalogs were caught. A ratio
  // genuinely is meaningless at that size -- but an EXACT 100% is not, and that
  // is the shape a source-text export actually produces.
  // -------------------------------------------------------------------------

  it("catches a small all-English catalog via the exact rule, below the ratio floor", () => {
    const dir = tempContentI18nDir();
    // 9 keys: the adaptationQuestions.json shape the real wipe got through.
    const en = englishCatalog(9);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify(en));

    const { problems } = runFlowQuestions(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("collapsed into the English source");
    // The exact rule states its basis differently from the ratio rule.
    expect(problems[0]).toContain("every one of its 9 non-empty values");
  });

  it("does not fire on a small catalog with even one genuine translation", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(5);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    // 4 of 5 identical is 80% -- over COLLAPSE_THRESHOLD, but the ratio rule
    // does not apply this far below MIN_KEYS and the exact rule needs ALL of
    // them. This band is the noise zone the floor exists for: one translated
    // value is enough to prove the locale is not a source-text export.
    let kept = 0;
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify(mapValues(en, (v) => (kept++ < 4 ? v : `Invite ${v}`))),
    );

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });

  it("fires at exactly the exact-rule floor (3 comparable values)", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(3);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify(en));

    const { problems } = runFlowQuestions(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("collapsed into the English source");
  });

  // -------------------------------------------------------------------------
  // Below the exact-rule floor: unchecked, and it SAYS SO.
  //
  // A gate that silently declines to check something reads exactly like a gate
  // that checked it and found nothing -- the failure mode this whole guard
  // exists to close, one level up. So a skip warns instead of passing quietly.
  // -------------------------------------------------------------------------

  it("reports rather than passing silently when a catalog is below the exact-rule floor", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(2);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify(en));

    const { problems, notes } = runFlowQuestions(dir);
    expect(problems).toEqual([]); // not a failure -- 2 values prove nothing
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("NOT checked for collapse");
    expect(notes[0]).toContain("only 2 non-empty value(s)");
    expect(notes[0]).toContain("flowQuestions.json");
  });

  it("keeps the skip advisory OUT of the warnings channel", () => {
    // The two channels print different headers and different remediation. The
    // warnings header says the English moved and tells you to re-run the
    // extractor; that advice is nonsense for a catalog that is merely too small
    // to measure. Routing a note into `warnings` is exactly the bug this
    // asserts against.
    const dir = tempContentI18nDir();
    const en = englishCatalog(2);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify(en));

    const { warnings, notes } = runFlowQuestions(dir);
    expect(notes).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("does not report an all-empty catalog — empty is the intended bootstrap shape", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(2);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    // Zero comparable values. A note here would punish the correct way to start
    // a locale, so the skip advisory is scoped to comparable > 0.
    writeFileSync(
      join(dir, "fr", "flowQuestions.json"),
      JSON.stringify(mapValues(en, () => "")),
    );

    const { problems, warnings, notes } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(notes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The guard's own API, tested directly.
//
// Everything above reaches the guard through content-i18n-lint's harness. But
// i18n-catalog-lint — the tool guarding the real messages.json catalogs — is a
// top-level script with no exported entry point, so its use of the guard is
// never exercised by any test. These cover the contract BOTH consumers depend
// on, so a change to the return shape fails here rather than silently breaking
// the Tier A path that has no test of its own.
// ---------------------------------------------------------------------------

describe("i18n-collapse-guard contract (shared by both lints)", () => {
  const catalog = (n: number, f: (i: number) => string) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, f(i)]));

  it("returns a problem and no note when a large catalog collapsed (ratio rule)", () => {
    const en = catalog(30, (i) => `English ${i}`);
    const r = checkEnglishCollapse({ en, target: en, locale: "fr", catalog: "messages.json" });
    expect(r.problem).toContain("collapsed into the English source");
    expect(r.note).toBeNull();
  });

  it("returns a problem and no note when a small catalog collapsed (exact rule)", () => {
    const en = catalog(9, (i) => `English ${i}`);
    const r = checkEnglishCollapse({ en, target: en, locale: "fr", catalog: "messages.json" });
    expect(r.problem).toContain("every one of its 9 non-empty values");
    expect(r.note).toBeNull();
  });

  it("returns a note and no problem below the exact-rule floor", () => {
    const en = catalog(2, (i) => `English ${i}`);
    const r = checkEnglishCollapse({ en, target: en, locale: "fr", catalog: "messages.json" });
    expect(r.problem).toBeNull();
    expect(r.note).toContain("NOT checked for collapse");
  });

  it("returns neither for a genuinely translated catalog", () => {
    const en = catalog(30, (i) => `English ${i}`);
    const fr = catalog(30, (i) => `Francais ${i}`);
    const r = checkEnglishCollapse({ en, target: fr, locale: "fr", catalog: "messages.json" });
    expect(r.problem).toBeNull();
    expect(r.note).toBeNull();
  });

  it("names which rule fired, so a caller can tell total from majority collapse", () => {
    const big = catalog(30, (i) => `English ${i}`);
    expect(measureCollapse(big, big).rule).toBe("ratio");
    const small = catalog(9, (i) => `English ${i}`);
    expect(measureCollapse(small, small).rule).toBe("exact");
    const fr = catalog(30, (i) => `Francais ${i}`);
    expect(measureCollapse(big, fr).rule).toBeNull();
  });
});
