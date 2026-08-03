import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// index.js is CommonJS (plain-node lint tool); vitest resolves the interop.
import { lint } from "./index.js";

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

  it("does not fire on a catalog too small for the ratio to mean anything", () => {
    const dir = tempContentI18nDir();
    const en = englishCatalog(3);
    writeFileSync(join(dir, "en", "flowQuestions.json"), JSON.stringify(en));
    writeFileSync(join(dir, "fr", "flowQuestions.json"), JSON.stringify(en));

    const { problems } = runFlowQuestions(dir);
    expect(problems).toEqual([]);
  });
});
