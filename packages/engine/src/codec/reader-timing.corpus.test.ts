/**
 * Records the current parse() timing baseline over the keyboards corpus
 * into specs/116-ng-parser-adoption/evidence/baseline.md. No assertions on
 * speed: this is a measurement, re-run after the reader swap to compare.
 *
 * Root: env KS_KEYBOARDS when set, else the sibling `keyboards` checkout.
 * Skipped with a [WARN] when the corpus is absent.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./parse.js";
import { timeReader } from "./reader-timing.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));
const EVIDENCE = path.resolve(__dir, "../../../../specs/116-ng-parser-adoption/evidence/baseline.md");
const MARKER = "## parse() timing baseline";

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; skipping the reader timing baseline`);
}

describe.skipIf(!rootExists)("reader timing baseline (parse)", () => {
  it("records the current parse() timing over release/ and experimental/", () => {
    const t = timeReader(ROOT, parse);
    expect(t.fileCount).toBeGreaterThan(0);
    const section = [
      MARKER,
      "",
      `- files timed: ${t.fileCount}`,
      `- total: ${t.totalMs.toFixed(0)} ms`,
      `- slowest: ${t.slowest.file} (${t.slowest.ms.toFixed(1)} ms)`,
      "",
    ].join("\n");
    const existing = fs.existsSync(EVIDENCE) ? fs.readFileSync(EVIDENCE, "utf8") : "";
    const idx = existing.indexOf(MARKER);
    const head = idx >= 0 ? existing.slice(0, idx) : existing.length > 0 ? existing.replace(/\n*$/, "\n\n") : "";
    fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
    fs.writeFileSync(EVIDENCE, head + section);
    console.log(`[OK] parse() baseline: ${t.fileCount} files, ${t.totalMs.toFixed(0)} ms, slowest ${t.slowest.file}`);
  }, 300_000);
});
