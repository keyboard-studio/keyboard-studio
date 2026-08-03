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
