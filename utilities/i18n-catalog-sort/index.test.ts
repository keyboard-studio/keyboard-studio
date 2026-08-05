import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// index.js is CommonJS (plain-node tool); vitest resolves the interop.
import {
  compareMessageIds,
  sortedKeys,
  inspectKeyOrder,
  checkKeyOrder,
  sortCatalog,
  sortCatalogDir,
  checkCatalogDir,
} from "./index.js";

const tmpDirs: string[] = [];

function makeCatalogDir(catalogs: Record<string, Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "i18n-catalog-sort-test-"));
  tmpDirs.push(root);
  for (const [locale, catalog] of Object.entries(catalogs)) {
    mkdirSync(join(root, locale), { recursive: true });
    writeFileSync(
      join(root, locale, "messages.json"),
      JSON.stringify(catalog, null, 2) + "\n",
    );
  }
  return root;
}

function readKeys(root: string, locale: string): string[] {
  return Object.keys(
    JSON.parse(readFileSync(join(root, locale, "messages.json"), "utf8")),
  );
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("compareMessageIds", () => {
  // The point of the comparator is that it agrees with Lingui's own
  // orderByMessageId (`a.messageId.localeCompare(b.messageId)`), so extract and
  // this tool never fight. This is the case a codepoint sort gets wrong: our ids
  // have camelCase segments, and 'L' (0x4C) sorts before 'a' (0x61) by codepoint
  // while localeCompare puts the lowercase word first.
  it("orders camelCase segments the way localeCompare does, not by codepoint", () => {
    const ids = ["editor.assignLoop", "editor.apply"];
    expect([...ids].sort(compareMessageIds)).toEqual(["editor.apply", "editor.assignLoop"]);
    expect(compareMessageIds("editor.apply", "editor.assignLoop")).toBeLessThan(0);
  });

  it("is the identity comparison for an id against itself", () => {
    expect(compareMessageIds("welcome.title", "welcome.title")).toBe(0);
  });

  it("groups by area prefix — the merge-conflict property this exists for", () => {
    const ids = ["survey.marks.title", "editor.apply.button", "survey.intro.body", "editor.zoom"];
    expect(sortedKeys(Object.fromEntries(ids.map((k) => [k, "x"])))).toEqual([
      "editor.apply.button",
      "editor.zoom",
      "survey.intro.body",
      "survey.marks.title",
    ]);
  });
});

describe("inspectKeyOrder", () => {
  it("accepts an already-sorted catalog", () => {
    expect(inspectKeyOrder({ "a.one": "1", "b.two": "2" })).toEqual({
      sorted: true,
      firstOutOfOrder: null,
    });
  });

  it("accepts an empty catalog and a single-entry catalog", () => {
    expect(inspectKeyOrder({}).sorted).toBe(true);
    expect(inspectKeyOrder({ "only.key": "v" }).sorted).toBe(true);
  });

  it("names the id that breaks the order", () => {
    const result = inspectKeyOrder({ "b.two": "2", "a.one": "1", "c.three": "3" });
    expect(result.sorted).toBe(false);
    expect(result.firstOutOfOrder).toBe("a.one");
  });

  it("catches an entry appended at the end — the shape a hand edit produces", () => {
    const result = inspectKeyOrder({ "a.one": "1", "c.three": "3", "b.two": "2" });
    expect(result.sorted).toBe(false);
    expect(result.firstOutOfOrder).toBe("b.two");
  });
});

describe("checkKeyOrder", () => {
  it("returns no problem for a sorted catalog", () => {
    expect(checkKeyOrder({ catalog: { "a.one": "1", "b.two": "2" }, locale: "fr" })).toEqual({
      problem: null,
    });
  });

  it("returns a locale-tagged problem naming the offending id", () => {
    const { problem } = checkKeyOrder({ catalog: { "b.two": "2", "a.one": "1" }, locale: "fr" });
    expect(problem).toContain("[fr]");
    expect(problem).toContain("a.one");
  });
});

describe("sortCatalog", () => {
  it("reorders keys without touching values", () => {
    const input = { "b.two": "Two", "a.one": "One" };
    const out = sortCatalog(input);
    expect(Object.keys(out)).toEqual(["a.one", "b.two"]);
    expect(out).toEqual({ "a.one": "One", "b.two": "Two" });
  });

  it("does not mutate the input catalog", () => {
    const input = { "b.two": "Two", "a.one": "One" };
    sortCatalog(input);
    expect(Object.keys(input)).toEqual(["b.two", "a.one"]);
  });

  it("preserves an empty value — an untranslated entry, not a deletable one", () => {
    expect(sortCatalog({ "b.two": "", "a.one": "One" })["b.two"]).toBe("");
  });
});

describe("sortCatalogDir", () => {
  it("sorts every locale in place and reports which files it rewrote", () => {
    const root = makeCatalogDir({
      en: { "b.two": "Two", "a.one": "One" },
      fr: { "b.two": "Deux", "a.one": "Un" },
    });
    const report = sortCatalogDir(root);
    expect(report).toEqual([
      { locale: "en", sorted: true },
      { locale: "fr", sorted: true },
    ]);
    expect(readKeys(root, "en")).toEqual(["a.one", "b.two"]);
    expect(readKeys(root, "fr")).toEqual(["a.one", "b.two"]);
  });

  it("preserves target-locale translations verbatim", () => {
    const root = makeCatalogDir({ fr: { "b.two": "Deux", "a.one": "Un" } });
    sortCatalogDir(root);
    const fr = JSON.parse(readFileSync(join(root, "fr", "messages.json"), "utf8"));
    expect(fr).toEqual({ "a.one": "Un", "b.two": "Deux" });
  });

  // Running the fixer on a clean tree must not produce a diff, or `pnpm lint`
  // and the Crowdin download workflow would churn the catalogs on every run.
  it("is byte-idempotent on an already-sorted catalog", () => {
    const root = makeCatalogDir({ en: { "a.one": "One", "b.two": "Two" } });
    const file = join(root, "en", "messages.json");
    const before = readFileSync(file, "utf8");
    expect(sortCatalogDir(root)).toEqual([{ locale: "en", sorted: false }]);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  // The format must match @lingui/format-json's minimal style exactly (2-space
  // indent, trailing newline) so a sort and a `messages:extract` are
  // interchangeable as remediations.
  it("writes 2-space-indented JSON with a trailing newline", () => {
    const root = makeCatalogDir({ en: { "b.two": "Two", "a.one": "One" } });
    sortCatalogDir(root);
    expect(readFileSync(join(root, "en", "messages.json"), "utf8")).toBe(
      '{\n  "a.one": "One",\n  "b.two": "Two"\n}\n',
    );
  });

  it("returns an empty report for a missing catalog directory", () => {
    expect(sortCatalogDir(join(tmpdir(), "i18n-catalog-sort-does-not-exist"))).toEqual([]);
  });
});

describe("checkCatalogDir", () => {
  it("reports nothing when every locale is sorted", () => {
    const root = makeCatalogDir({
      en: { "a.one": "One", "b.two": "Two" },
      fr: { "a.one": "Un", "b.two": "Deux" },
    });
    expect(checkCatalogDir(root)).toEqual([]);
  });

  it("reports one problem per unsorted locale and leaves the files alone", () => {
    const root = makeCatalogDir({
      en: { "b.two": "Two", "a.one": "One" },
      fr: { "b.two": "Deux", "a.one": "Un" },
    });
    const problems = checkCatalogDir(root);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("[en]");
    expect(problems[1]).toContain("[fr]");
    // read-only: the check must not silently fix what it reports
    expect(readKeys(root, "en")).toEqual(["b.two", "a.one"]);
  });
});
