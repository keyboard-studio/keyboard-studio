import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "i18n-content-extract-cli-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function writeFixtures(root: string): { patternsDir: string; adaptationQuestionsDir: string } {
  const patternsDir = join(root, "patterns");
  const adaptationQuestionsDir = join(root, "adaptation-questions");
  mkdirSync(patternsDir, { recursive: true });
  mkdirSync(adaptationQuestionsDir, { recursive: true });
  writeFileSync(
    join(patternsDir, "sample.yaml"),
    `
id: sample_pattern
title: "Sample title"
description: "Sample description"
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`,
  );
  writeFileSync(
    join(adaptationQuestionsDir, "q_sample.yaml"),
    'id: q_sample\nprovenanceLabel: "A label"\n',
  );
  return { patternsDir, adaptationQuestionsDir };
}

describe("run", () => {
  it("writes catalogs to outDir by default", () => {
    const root = tempDir();
    const { patternsDir, adaptationQuestionsDir } = writeFixtures(root);
    const outDir = join(root, "out");

    const result = run({ patternsDir, adaptationQuestionsDir, outDir, check: false });

    expect(result.changed).toEqual(["patterns.json", "adaptationQuestions.json", "criteria.json"]);
    const patterns = JSON.parse(readFileSync(join(outDir, "patterns.json"), "utf8"));
    expect(patterns["content.pattern.sample_pattern.title"]).toBe("Sample title");
    const adaptationQuestions = JSON.parse(
      readFileSync(join(outDir, "adaptationQuestions.json"), "utf8"),
    );
    expect(adaptationQuestions["content.adaptationQuestion.q_sample.provenanceLabel"]).toBe(
      "A label",
    );
  });

  it("--check reports no drift and writes nothing once the catalogs are current", () => {
    const root = tempDir();
    const { patternsDir, adaptationQuestionsDir } = writeFixtures(root);
    const outDir = join(root, "out");

    run({ patternsDir, adaptationQuestionsDir, outDir, check: false });
    const result = run({ patternsDir, adaptationQuestionsDir, outDir, check: true });

    expect(result.changed).toEqual([]);
  });

  it("--check reports drift and does not write when content changed", () => {
    const root = tempDir();
    const { patternsDir, adaptationQuestionsDir } = writeFixtures(root);
    const outDir = join(root, "out");

    run({ patternsDir, adaptationQuestionsDir, outDir, check: false });

    writeFileSync(
      join(patternsDir, "sample.yaml"),
      `
id: sample_pattern
title: "Changed title"
description: "Sample description"
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`,
    );

    const before = readFileSync(join(outDir, "patterns.json"), "utf8");
    const result = run({ patternsDir, adaptationQuestionsDir, outDir, check: true });
    const after = readFileSync(join(outDir, "patterns.json"), "utf8");

    expect(result.changed).toContain("patterns.json");
    expect(after).toBe(before); // --check must never write
  });

  it("is idempotent — running twice with no content changes produces byte-identical output", () => {
    const root = tempDir();
    const { patternsDir, adaptationQuestionsDir } = writeFixtures(root);
    const outDir = join(root, "out");

    run({ patternsDir, adaptationQuestionsDir, outDir, check: false });
    const firstRun = readFileSync(join(outDir, "patterns.json"), "utf8");
    run({ patternsDir, adaptationQuestionsDir, outDir, check: false });
    const secondRun = readFileSync(join(outDir, "patterns.json"), "utf8");

    expect(secondRun).toBe(firstRun);
  });

  it("creates outDir if it doesn't exist yet", () => {
    const root = tempDir();
    const { patternsDir, adaptationQuestionsDir } = writeFixtures(root);
    const outDir = join(root, "nested", "out", "dir");

    expect(() => run({ patternsDir, adaptationQuestionsDir, outDir, check: false })).not.toThrow();
    expect(readFileSync(join(outDir, "patterns.json"), "utf8")).toContain("sample_pattern");
  });
});
