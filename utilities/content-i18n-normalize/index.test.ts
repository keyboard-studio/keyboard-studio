import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// index.js is CommonJS (plain-node tool); vitest resolves the interop.
import { normalizeCatalog, normalizeContentI18nDir } from "./index.js";

describe("normalizeCatalog", () => {
  it("resets a value byte-identical to its English source to empty", () => {
    const en = { "content.pattern.foo.title": "Foo pattern" };
    const target = { "content.pattern.foo.title": "Foo pattern" };
    const { catalog, changed } = normalizeCatalog(en, target);
    expect(catalog["content.pattern.foo.title"]).toBe("");
    expect(changed).toBe(1);
  });

  it("leaves a real translation (differs from English) untouched", () => {
    const en = { "content.pattern.foo.title": "Foo pattern" };
    const target = { "content.pattern.foo.title": "Motif foo" };
    const { catalog, changed } = normalizeCatalog(en, target);
    expect(catalog["content.pattern.foo.title"]).toBe("Motif foo");
    expect(changed).toBe(0);
  });

  it("leaves an already-empty value untouched and does not count it", () => {
    const en = { "content.pattern.foo.title": "Foo pattern" };
    const target = { "content.pattern.foo.title": "" };
    const { catalog, changed } = normalizeCatalog(en, target);
    expect(catalog["content.pattern.foo.title"]).toBe("");
    expect(changed).toBe(0);
  });

  it("leaves a stale/extra key with no English counterpart untouched", () => {
    const en = { "content.pattern.foo.title": "Foo pattern" };
    const target = { "content.pattern.stale.title": "Foo pattern" };
    const { catalog, changed } = normalizeCatalog(en, target);
    expect(catalog["content.pattern.stale.title"]).toBe("Foo pattern");
    expect(changed).toBe(0);
  });

  it("does not mutate the input target object", () => {
    const en = { k: "v" };
    const target = { k: "v" };
    normalizeCatalog(en, target);
    expect(target.k).toBe("v");
  });

  it("handles a fully-collapsed catalog (the PR #1495/#1498 shape)", () => {
    const en = { a: "A", b: "B", c: "C" };
    const target = { a: "A", b: "B", c: "C" };
    const { catalog, changed } = normalizeCatalog(en, target);
    expect(catalog).toEqual({ a: "", b: "", c: "" });
    expect(changed).toBe(3);
  });
});

describe("normalizeContentI18nDir", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "content-i18n-normalize-test-"));
    dirs.push(dir);
    return dir;
  }

  it("rewrites a fully-collapsed target catalog to all-empty on disk", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "en"));
    mkdirSync(join(dir, "fr"));
    writeFileSync(join(dir, "en", "patterns.json"), JSON.stringify({ p1: "Pattern one" }));
    writeFileSync(join(dir, "fr", "patterns.json"), JSON.stringify({ p1: "Pattern one" }));

    const report = normalizeContentI18nDir(dir);

    expect(report).toContainEqual({ locale: "fr", name: "patterns.json", changed: 1 });
    const rewritten = JSON.parse(readFileSync(join(dir, "fr", "patterns.json"), "utf8"));
    expect(rewritten).toEqual({ p1: "" });
  });

  it("does not touch a file on disk when nothing needs normalizing", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "en"));
    mkdirSync(join(dir, "fr"));
    writeFileSync(join(dir, "en", "patterns.json"), JSON.stringify({ p1: "Pattern one" }));
    writeFileSync(join(dir, "fr", "patterns.json"), JSON.stringify({ p1: "Motif un" }));
    const before = statSync(join(dir, "fr", "patterns.json")).mtimeMs;

    const report = normalizeContentI18nDir(dir);

    expect(report).toContainEqual({ locale: "fr", name: "patterns.json", changed: 0 });
    const after = statSync(join(dir, "fr", "patterns.json")).mtimeMs;
    expect(after).toBe(before);
  });

  it("skips a target-locale file with no English counterpart", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "en"));
    mkdirSync(join(dir, "fr"));
    writeFileSync(join(dir, "fr", "orphan.json"), JSON.stringify({ k: "v" }));

    const report = normalizeContentI18nDir(dir);

    expect(report).toEqual([]);
  });

  it("normalizes multiple locales and multiple catalogs independently", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "en"));
    mkdirSync(join(dir, "fr"));
    mkdirSync(join(dir, "es"));
    writeFileSync(
      join(dir, "en", "adaptationQuestions.json"),
      JSON.stringify({ q1: "Question one" }),
    );
    // fr: fully collapsed (never translated in Crowdin).
    writeFileSync(
      join(dir, "fr", "adaptationQuestions.json"),
      JSON.stringify({ q1: "Question one" }),
    );
    // es: genuinely translated.
    writeFileSync(
      join(dir, "es", "adaptationQuestions.json"),
      JSON.stringify({ q1: "Pregunta uno" }),
    );

    const report = normalizeContentI18nDir(dir);

    expect(report).toContainEqual({ locale: "fr", name: "adaptationQuestions.json", changed: 1 });
    expect(report).toContainEqual({ locale: "es", name: "adaptationQuestions.json", changed: 0 });
    expect(JSON.parse(readFileSync(join(dir, "fr", "adaptationQuestions.json"), "utf8"))).toEqual({
      q1: "",
    });
    expect(JSON.parse(readFileSync(join(dir, "es", "adaptationQuestions.json"), "utf8"))).toEqual({
      q1: "Pregunta uno",
    });
  });
});
